import { create } from 'zustand';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  ParsedEquation,
  parseDocumentWithFrontmatter,
  DocumentFrontmatter,
  MathEditClient,
  ProjectData,
  createProjectData,
  importSvg,
  generateSVG,
  type EquationInput,
} from '@mathedit/core';

// localStorage persistence
const STORAGE_KEY = 'mathedit:editor';

export interface Tab {
  id: string;
  fileName: string;
  sourceFileName?: string; // Original filename when opened from file
  document: string;
  globalPreamble: string;
  parsedEquations: ParsedEquation[];
  frontmatter: DocumentFrontmatter;
  renderedSvgs: Record<string, string>;
  previousEquations: Map<string, string>;
  previousFrontmatterColor: string | undefined;
  isDirty: boolean;
}

interface PersistedTab {
  id: string;
  fileName: string;
  sourceFileName?: string;
  document: string;
  globalPreamble: string;
  isDirty: boolean;
}

interface PersistedState {
  tabs: PersistedTab[];
  activeTabId: string | null;
  tabOrder: string[];
}

function saveToStorage(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

function loadFromStorage(): PersistedState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return null;
}

interface EditorState {
  // Tabs
  tabs: Tab[];
  activeTabId: string | null;
  tabOrder: string[];

  // Active equation within current tab
  activeEquationId: string | null;

  // Monaco Editor
  editorInstance: MonacoEditor.IStandaloneCodeEditor | null;

  // Rendering state (global)
  isRendering: boolean;
  renderError: string | null;
  autoRender: boolean;

  // API Client
  apiClient: MathEditClient;

  // Tab management actions
  addTab: (tab?: { fileName?: string; sourceFileName?: string; document?: string; globalPreamble?: string }) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (fromId: string, toId: string) => void;
  renameTab: (id: string, newName: string) => void;

  // Document actions (operate on active tab)
  setDocument: (doc: string) => void;
  setActiveEquation: (id: string | null) => void;
  setGlobalPreamble: (preamble: string) => void;
  addEquation: () => void;

  // Render actions
  renderAll: () => Promise<void>;
  renderOne: (id: string) => Promise<void>;
  renderChanged: () => Promise<void>;
  setAutoRender: (enabled: boolean) => void;

  // Editor instance
  setEditorInstance: (editor: MonacoEditor.IStandaloneCodeEditor | null) => void;
  jumpToEquation: (id: string) => void;

  // Project actions
  newProject: () => void;
  openProject: (data: ProjectData, sourceFileName?: string) => void;
  saveProject: () => { data: ProjectData; sourceFileName?: string };

  // SVG Import
  importSvgEquations: (svgContent: string, overwrite?: boolean) => Promise<void>;
  checkSvgForDuplicates: (svgContent: string) => Promise<{ hasDuplicates: boolean; duplicateLabels: string[] }>;

  // Persistence
  hydrateFromStorage: () => void;

  // Getters
  getActiveTab: () => Tab | undefined;
}

const EMPTY_DOCUMENT = `---
% Add your equations here
% Separate equations with --- on a new line

`;

// Debounce timer for auto-render
let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let tabIdCounter = 0;
const generateTabId = () => `tab-${++tabIdCounter}`;

let untitledCounter = 0;
const generateUntitledName = () => `Untitled-${++untitledCounter}`;

function createTab(options?: { id?: string; fileName?: string; sourceFileName?: string; document?: string; globalPreamble?: string }): Tab {
  const doc = options?.document ?? EMPTY_DOCUMENT;
  const parsed = parseDocumentWithFrontmatter(doc);
  return {
    id: options?.id ?? generateTabId(),
    fileName: options?.fileName ?? generateUntitledName(),
    sourceFileName: options?.sourceFileName,
    document: doc,
    globalPreamble: options?.globalPreamble ?? '',
    parsedEquations: parsed.equations,
    frontmatter: parsed.frontmatter,
    renderedSvgs: {},
    previousEquations: new Map(),
    previousFrontmatterColor: undefined,
    isDirty: false,
  };
}

function persistState(state: { tabs: Tab[]; activeTabId: string | null; tabOrder: string[] }) {
  const persistedTabs: PersistedTab[] = state.tabs.map((tab) => ({
    id: tab.id,
    fileName: tab.fileName,
    sourceFileName: tab.sourceFileName,
    document: tab.document,
    globalPreamble: tab.globalPreamble,
    isDirty: tab.isDirty,
  }));
  saveToStorage({
    tabs: persistedTabs,
    activeTabId: state.activeTabId,
    tabOrder: state.tabOrder,
  });
}

// Create initial tab
const initialTab = createTab();

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  tabs: [initialTab],
  activeTabId: initialTab.id,
  tabOrder: [initialTab.id],
  activeEquationId: null,
  editorInstance: null,
  isRendering: false,
  renderError: null,
  autoRender: true,
  apiClient: new MathEditClient('http://localhost:3000'),

  // Tab management
  addTab: (tabOptions) => {
    const newTab = createTab(tabOptions);
    set((state) => {
      const newState = {
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        tabOrder: [...state.tabOrder, newTab.id],
      };
      persistState(newState);
      return newState;
    });
    // Render the new tab
    get().renderAll();
    return newTab.id;
  },

  closeTab: (id) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((t) => t.id === id);
      if (tabIndex === -1) return state;

      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newTabOrder = state.tabOrder.filter((tid) => tid !== id);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === id) {
        if (newTabs.length === 0) {
          // Create a new tab if closing the last one
          const newTab = createTab();
          newTabs.push(newTab);
          newTabOrder.push(newTab.id);
          newActiveId = newTab.id;
        } else if (tabIndex >= newTabs.length) {
          newActiveId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveId = newTabs[tabIndex].id;
        }
      }

      const newState = { tabs: newTabs, activeTabId: newActiveId, tabOrder: newTabOrder };
      persistState(newState);
      return newState;
    });
  },

  setActiveTab: (id) => {
    set({ activeTabId: id, activeEquationId: null });
  },

  reorderTabs: (fromId, toId) => {
    set((state) => {
      const newTabOrder = [...state.tabOrder];
      const oldIndex = newTabOrder.indexOf(fromId);
      const newIndex = newTabOrder.indexOf(toId);
      if (oldIndex === -1 || newIndex === -1) return state;
      const [removed] = newTabOrder.splice(oldIndex, 1);
      newTabOrder.splice(newIndex, 0, removed);
      const newState = { ...state, tabOrder: newTabOrder };
      persistState(newState);
      return { tabOrder: newTabOrder };
    });
  },

  renameTab: (id, newName) => {
    set((state) => {
      const newTabs = state.tabs.map((t) =>
        t.id === id ? { ...t, fileName: newName } : t
      );
      const newState = { ...state, tabs: newTabs };
      persistState(newState);
      return { tabs: newTabs };
    });
  },

  // Document actions
  setDocument: (doc: string) => {
    const { activeTabId, tabs, autoRender } = get();
    if (!activeTabId) return;

    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const parsed = parseDocumentWithFrontmatter(doc, tab.parsedEquations);
    const updatedTab: Tab = {
      ...tab,
      document: doc,
      parsedEquations: parsed.equations,
      frontmatter: parsed.frontmatter,
      isDirty: true,
    };

    set((state) => {
      const newTabs = state.tabs.map((t) => (t.id === activeTabId ? updatedTab : t));
      const newState = { ...state, tabs: newTabs };
      persistState(newState);

      // Update activeEquationId if it no longer exists
      const activeEqExists = parsed.equations.find((eq) => eq.id === state.activeEquationId);
      return {
        tabs: newTabs,
        activeEquationId: activeEqExists ? state.activeEquationId : null,
      };
    });

    // Auto-render with debounce
    if (autoRender) {
      if (renderDebounceTimer) {
        clearTimeout(renderDebounceTimer);
      }
      renderDebounceTimer = setTimeout(() => {
        get().renderChanged();
      }, 500);
    }
  },

  setActiveEquation: (id: string | null) => {
    set({ activeEquationId: id });
  },

  setGlobalPreamble: (preamble: string) => {
    const { activeTabId } = get();
    if (!activeTabId) return;

    set((state) => {
      const newTabs = state.tabs.map((t) =>
        t.id === activeTabId ? { ...t, globalPreamble: preamble, isDirty: true } : t
      );
      const newState = { ...state, tabs: newTabs };
      persistState(newState);
      return { tabs: newTabs };
    });
  },

  addEquation: () => {
    const tab = get().getActiveTab();
    if (!tab) return;

    const current = tab.document;
    const newDoc = current + (current.endsWith('\n') ? '' : '\n') + '\n---\n\n';
    get().setDocument(newDoc);

    // Focus editor and position cursor at the new equation
    const { editorInstance } = get();
    const updatedTab = get().getActiveTab();
    if (editorInstance && updatedTab && updatedTab.parsedEquations.length > 0) {
      const newEquation = updatedTab.parsedEquations[updatedTab.parsedEquations.length - 1];
      const targetLine = newEquation.startLine + 1;
      editorInstance.setPosition({ lineNumber: targetLine, column: 1 });
      editorInstance.revealLineInCenter(targetLine);
      editorInstance.focus();
      set({ activeEquationId: newEquation.id });
    }
  },

  renderAll: async () => {
    const tab = get().getActiveTab();
    if (!tab) return;

    set({ isRendering: true, renderError: null });

    try {
      const svgs: Record<string, string> = {};
      const equationMap = new Map<string, string>();

      for (const eq of tab.parsedEquations) {
        try {
          const color = eq.color || tab.frontmatter.color;
          const equations: EquationInput[] = [{
            id: eq.id,
            latex: eq.latex,
            displayMode: 'block',
            label: eq.label,
          }];

          const result = generateSVG({
            equations,
            options: {
              globalPreamble: tab.globalPreamble,
              embedMetadata: true,
              color,
            },
          });

          if (result.errors.length > 0) {
            console.error(`Errors rendering ${eq.label}:`, result.errors);
          }

          svgs[eq.id] = result.svg;
          equationMap.set(eq.label, eq.latex);
        } catch (error) {
          console.error(`Failed to render equation ${eq.label}:`, error);
        }
      }

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? {
                ...t,
                renderedSvgs: svgs,
                previousEquations: equationMap,
                previousFrontmatterColor: tab.frontmatter.color,
              }
            : t
        ),
        isRendering: false,
      }));
    } catch (error) {
      set({
        renderError: error instanceof Error ? error.message : 'Unknown error',
        isRendering: false,
      });
    }
  },

  renderChanged: async () => {
    const tab = get().getActiveTab();
    if (!tab) return;

    if (tab.previousEquations.size === 0 || tab.frontmatter.color !== tab.previousFrontmatterColor) {
      return get().renderAll();
    }

    set({ isRendering: true, renderError: null });

    try {
      const newSvgs = { ...tab.renderedSvgs };
      const newEquationMap = new Map<string, string>();
      const changedEquations: ParsedEquation[] = [];

      for (const eq of tab.parsedEquations) {
        newEquationMap.set(eq.label, eq.latex);
        const previousLatex = tab.previousEquations.get(eq.label);
        if (!previousLatex || previousLatex !== eq.latex || !tab.renderedSvgs[eq.id]) {
          changedEquations.push(eq);
        }
      }

      for (const eq of changedEquations) {
        try {
          const color = eq.color || tab.frontmatter.color;
          const equations: EquationInput[] = [{
            id: eq.id,
            latex: eq.latex,
            displayMode: 'block',
            label: eq.label,
          }];

          const result = generateSVG({
            equations,
            options: {
              globalPreamble: tab.globalPreamble,
              embedMetadata: true,
              color,
            },
          });

          if (result.errors.length > 0) {
            console.error(`Errors rendering ${eq.label}:`, result.errors);
          }

          newSvgs[eq.id] = result.svg;
        } catch (error) {
          console.error(`Failed to render equation ${eq.label}:`, error);
        }
      }

      const currentIds = new Set(tab.parsedEquations.map((eq) => eq.id));
      Object.keys(newSvgs).forEach((id) => {
        if (!currentIds.has(id)) {
          delete newSvgs[id];
        }
      });

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, renderedSvgs: newSvgs, previousEquations: newEquationMap }
            : t
        ),
        isRendering: false,
      }));
    } catch (error) {
      set({
        renderError: error instanceof Error ? error.message : 'Unknown error',
        isRendering: false,
      });
    }
  },

  setAutoRender: (enabled: boolean) => {
    set({ autoRender: enabled });
  },

  setEditorInstance: (editor: MonacoEditor.IStandaloneCodeEditor | null) => {
    set({ editorInstance: editor });

    if (editor) {
      editor.onDidChangeCursorPosition((e) => {
        const tab = get().getActiveTab();
        if (!tab) return;

        const currentLine = e.position.lineNumber;
        const equation = tab.parsedEquations.find(
          (eq) => currentLine - 1 >= eq.startLine && currentLine - 1 <= eq.endLine
        );

        if (equation && equation.id !== get().activeEquationId) {
          set({ activeEquationId: equation.id });
        }
      });
    }
  },

  jumpToEquation: (id: string) => {
    const { editorInstance } = get();
    const tab = get().getActiveTab();
    if (!editorInstance || !tab) return;

    const equation = tab.parsedEquations.find((eq) => eq.id === id);
    if (!equation) return;

    const lines = tab.document.split('\n');
    let targetLine = equation.endLine + 1;
    let targetColumn = 1;

    for (let i = equation.endLine; i >= equation.startLine; i--) {
      const line = lines[i] || '';
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('\\label{') && !trimmedLine.startsWith('%')) {
        targetLine = i + 1;
        targetColumn = line.length + 1;
        break;
      }
    }

    editorInstance.setPosition({ lineNumber: targetLine, column: targetColumn });
    editorInstance.revealLineInCenter(targetLine);
    editorInstance.focus();
  },

  renderOne: async (id: string) => {
    const tab = get().getActiveTab();
    if (!tab) return;

    const equation = tab.parsedEquations.find((eq) => eq.id === id);
    if (!equation) return;

    set({ isRendering: true, renderError: null });

    try {
      const color = equation.color || tab.frontmatter.color;
      const equations: EquationInput[] = [{
        id: equation.id,
        latex: equation.latex,
        displayMode: 'block',
        label: equation.label,
      }];

      const result = generateSVG({
        equations,
        options: {
          globalPreamble: tab.globalPreamble,
          embedMetadata: true,
          color,
        },
      });

      if (result.errors.length > 0) {
        console.error(`Errors rendering ${equation.label}:`, result.errors);
      }

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, renderedSvgs: { ...t.renderedSvgs, [id]: result.svg } }
            : t
        ),
        isRendering: false,
      }));
    } catch (error) {
      set({
        renderError: error instanceof Error ? error.message : 'Unknown error',
        isRendering: false,
      });
    }
  },

  newProject: () => {
    get().addTab();
  },

  openProject: (data: ProjectData, sourceFileName?: string) => {
    const fileName = data.metadata.name || 'Project';
    get().addTab({
      fileName,
      sourceFileName,
      document: data.document,
      globalPreamble: data.globalPreamble || '',
    });
  },

  saveProject: () => {
    const tab = get().getActiveTab();
    if (!tab) {
      return { data: createProjectData(EMPTY_DOCUMENT, '', 'Untitled') };
    }

    // Mark as clean after save
    set((state) => {
      const newTabs = state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, isDirty: false } : t
      );
      persistState({ ...state, tabs: newTabs });
      return { tabs: newTabs };
    });

    return {
      data: createProjectData(tab.document, tab.globalPreamble, tab.fileName),
      sourceFileName: tab.sourceFileName,
    };
  },

  importSvgEquations: async (svgContent: string, overwrite = false) => {
    const tab = get().getActiveTab();
    if (!tab) return;

    try {
      const equations = importSvg(svgContent);
      const existingIds = new Set(tab.parsedEquations.map((eq) => eq.id));

      let newDoc = tab.document;

      for (const eq of equations) {
        const hasLabel = eq.label !== 'imported1';
        const latexWithLabel = hasLabel ? eq.latex : `${eq.latex}\n\\label{${eq.label}}`;

        if (existingIds.has(eq.id) && overwrite) {
          const lines = newDoc.split('\n');
          const existingEq = tab.parsedEquations.find((e) => e.id === eq.id);
          if (existingEq) {
            // Find the separator before this equation
            let separatorLine = existingEq.startLine - 1;
            while (separatorLine >= 0 && lines[separatorLine].trim() === '') {
              separatorLine--;
            }

            // Check if there's a separator (---) before the equation
            const hasSeparatorBefore = separatorLine >= 0 && /^---+$/.test(lines[separatorLine].trim());
            const startReplaceLine = hasSeparatorBefore ? separatorLine : existingEq.startLine;

            // Check if there's a separator (---) after the equation
            let afterLine = existingEq.endLine + 1;
            while (afterLine < lines.length && lines[afterLine].trim() === '') {
              afterLine++;
            }
            const hasSeparatorAfter = afterLine < lines.length && /^---+$/.test(lines[afterLine].trim());
            const endReplaceLine = hasSeparatorAfter ? afterLine : existingEq.endLine;

            const beforeLines = lines.slice(0, startReplaceLine);
            const afterLines = lines.slice(endReplaceLine + 1);

            // Add separator with blank lines if needed
            const replacement = hasSeparatorBefore
              ? ['---', '', latexWithLabel, '']
              : [latexWithLabel];

            newDoc = [...beforeLines, ...replacement, ...afterLines].join('\n');
          }
        } else if (!existingIds.has(eq.id)) {
          if (!newDoc.endsWith('\n\n')) {
            newDoc += '\n\n';
          }
          newDoc += `---\n\n${latexWithLabel}\n\n`;
        }
      }

      get().setDocument(newDoc);
    } catch (error) {
      set({
        renderError: error instanceof Error ? error.message : 'Failed to import SVG',
      });
    }
  },

  checkSvgForDuplicates: async (svgContent: string) => {
    const tab = get().getActiveTab();
    if (!tab) return { hasDuplicates: false, duplicateLabels: [], duplicateIds: [] };

    try {
      const equations = importSvg(svgContent);
      const existingIds = new Set(tab.parsedEquations.map((eq) => eq.id));
      const duplicates = equations.filter((eq) => existingIds.has(eq.id));

      return {
        hasDuplicates: duplicates.length > 0,
        duplicateLabels: duplicates.map((eq) => eq.label),
        duplicateIds: duplicates.map((eq) => eq.id),
      };
    } catch (error) {
      return { hasDuplicates: false, duplicateLabels: [], duplicateIds: [] };
    }
  },

  hydrateFromStorage: () => {
    const stored = loadFromStorage();
    if (stored && stored.tabs && stored.tabs.length > 0) {
      // Restore tabs from storage
      const restoredTabs: Tab[] = stored.tabs.map((persistedTab) => {
        const parsed = parseDocumentWithFrontmatter(persistedTab.document);
        // Ensure tab ID counter stays ahead
        const match = persistedTab.id.match(/^tab-(\d+)$/);
        if (match) {
          tabIdCounter = Math.max(tabIdCounter, parseInt(match[1], 10));
        }
        // Track untitled counter
        const untitledMatch = persistedTab.fileName.match(/^Untitled-(\d+)$/);
        if (untitledMatch) {
          untitledCounter = Math.max(untitledCounter, parseInt(untitledMatch[1], 10));
        }
        return {
          id: persistedTab.id,
          fileName: persistedTab.fileName,
          sourceFileName: persistedTab.sourceFileName,
          document: persistedTab.document,
          globalPreamble: persistedTab.globalPreamble,
          parsedEquations: parsed.equations,
          frontmatter: parsed.frontmatter,
          renderedSvgs: {},
          previousEquations: new Map(),
          previousFrontmatterColor: undefined,
          isDirty: persistedTab.isDirty,
        };
      });

      set({
        tabs: restoredTabs,
        activeTabId: stored.activeTabId,
        tabOrder: stored.tabOrder,
        activeEquationId: null,
      });

      // Render active tab
      get().renderAll();
    } else {
      // No stored state, render initial tab
      get().renderAll();
    }
  },

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
  },
}));
