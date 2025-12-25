import { create } from 'zustand';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  parseDocumentWithFrontmatter,
  type ParsedEquation,
  type DocumentFrontmatter
} from '@mathedit/core';
import {
  notifyDocumentChanged,
  notifyEquationSelected,
  notifyCursorPositionChanged,
  requestRender,
  isRunningInNative
} from '../bridge/native-bridge';
import {
  analyzeDocumentStructure,
  findSectionIndexAtLine,
  hasEmptyTrailingSection,
  getSectionMiddleLine,
  NEW_EQUATION_CONTENT,
} from '../utils/documentStructure';

interface EditorState {
  // Document content
  document: string;
  globalPreamble: string;

  // Parsed state
  equations: ParsedEquation[];
  frontmatter: DocumentFrontmatter;

  // Selection
  activeEquationId: string | null;

  // Monaco editor instance
  editorInstance: MonacoEditor.IStandaloneCodeEditor | null;

  // Editor settings
  fontSize: number;

  // Debounce timer
  debounceTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  setDocument: (document: string) => void;
  setGlobalPreamble: (preamble: string) => void;
  setActiveEquation: (id: string | null) => void;
  setEditorInstance: (editor: MonacoEditor.IStandaloneCodeEditor | null) => void;
  setFontSize: (size: number) => void;

  // Native integration
  loadFromNative: (document: string, globalPreamble?: string, cursorLine?: number) => void;
  jumpToEquation: (equationId: string) => void;
  jumpToLine: (line: number) => void;
  handleCursorChange: (line: number, column: number) => void;
  addEquation: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  document: '',
  globalPreamble: '',
  equations: [],
  frontmatter: {},
  activeEquationId: null,
  editorInstance: null,
  fontSize: 14,
  debounceTimer: null,

  setDocument: (document: string) => {
    const { debounceTimer, equations: previousEquations } = get();

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Parse immediately for UI updates
    const { frontmatter, equations } = parseDocumentWithFrontmatter(
      document,
      previousEquations
    );

    set({ document, equations, frontmatter });

    // Debounce notification to native (and rendering)
    const timer = setTimeout(() => {
      notifyDocumentChanged(document, equations, frontmatter);

      // Request render if in native context
      if (isRunningInNative()) {
        requestRender(equations, frontmatter);
      }
    }, 300);

    set({ debounceTimer: timer });
  },

  setGlobalPreamble: (globalPreamble: string) => {
    set({ globalPreamble });
  },

  setActiveEquation: (id: string | null) => {
    const { equations } = get();
    set({ activeEquationId: id });

    if (id) {
      const eq = equations.find(e => e.id === id);
      if (eq) {
        notifyEquationSelected(id, eq.startLine);
      }
    }
  },

  setEditorInstance: (editor: MonacoEditor.IStandaloneCodeEditor | null) => {
    set({ editorInstance: editor });
  },

  setFontSize: (size: number) => {
    const { editorInstance } = get();
    set({ fontSize: size });
    // Update Monaco editor font size
    if (editorInstance) {
      editorInstance.updateOptions({ fontSize: size });
    }
  },

  loadFromNative: (document: string, globalPreamble?: string, cursorLine?: number) => {
    const { frontmatter, equations } = parseDocumentWithFrontmatter(document);

    set({
      document,
      globalPreamble: globalPreamble || '',
      equations,
      frontmatter,
      activeEquationId: equations[0]?.id || null,
    });

    // Notify native of parsed equations and request render
    notifyDocumentChanged(document, equations, frontmatter);
    if (isRunningInNative()) {
      requestRender(equations, frontmatter);
    }

    // Move cursor to specified line after loading
    if (cursorLine !== undefined) {
      // Use setTimeout to ensure editor has updated
      setTimeout(() => {
        get().jumpToLine(cursorLine);
      }, 0);
    }
  },

  jumpToEquation: (equationId: string) => {
    const { editorInstance, equations } = get();
    const eq = equations.find(e => e.id === equationId);

    if (editorInstance && eq) {
      const model = editorInstance.getModel();
      if (!model) return;

      // Find the last line with actual equation content (not empty, ---, or just \label{})
      // Monaco uses 1-based line numbers, parser uses 0-based
      let targetLine = eq.startLine + 1; // Default to start line
      let column = 1;

      for (let line = eq.endLine + 1; line >= eq.startLine + 1; line--) {
        const content = model.getLineContent(line);
        const trimmed = content.trim();

        // Skip empty lines, separators, and lines that only contain \label{...}
        if (trimmed === '' || trimmed === '---' || /^\\label\{[^}]*\}$/.test(trimmed)) {
          continue;
        }

        targetLine = line;

        // Check for inline \label{} and position cursor before it
        const labelMatch = content.match(/^(.+?)\s*\\label\{[^}]*\}\s*$/);
        if (labelMatch) {
          // Position cursor at end of content before \label
          column = labelMatch[1].length + 1;
        } else {
          column = model.getLineMaxColumn(line);
        }
        break;
      }

      editorInstance.setPosition({ lineNumber: targetLine, column });
      editorInstance.revealLineInCenter(targetLine);
      editorInstance.focus();
      set({ activeEquationId: equationId });
    }
  },

  jumpToLine: (line: number) => {
    const { editorInstance } = get();

    if (editorInstance) {
      // Monaco uses 1-based line numbers
      const lineNumber = line + 1;
      const model = editorInstance.getModel();
      const column = model ? model.getLineMaxColumn(lineNumber) : 1;
      editorInstance.setPosition({ lineNumber, column });
      editorInstance.revealLineInCenter(lineNumber);
      editorInstance.focus();
    }
  },

  handleCursorChange: (line: number, column: number) => {
    const { equations } = get();

    // Find which equation the cursor is in
    const activeEq = equations.find(
      eq => line >= eq.startLine && line <= eq.endLine
    );

    const equationId = activeEq?.id || null;
    set({ activeEquationId: equationId });

    notifyCursorPositionChanged(line, column, equationId);
  },

  addEquation: () => {
    const { editorInstance } = get();
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    // Analyze document structure based on --- separators
    const sections = analyzeDocumentStructure(model);
    const cursorLine = editorInstance.getPosition()?.lineNumber ?? 1;

    // Check if there's already an empty trailing section - just focus there
    const emptyTrailing = hasEmptyTrailingSection(sections);
    if (emptyTrailing) {
      const midLine = getSectionMiddleLine(emptyTrailing);
      editorInstance.setPosition({ lineNumber: midLine, column: 1 });
      editorInstance.revealLineInCenter(midLine);
      editorInstance.focus();
      return;
    }

    // Find which section the cursor is in
    const currentSectionIndex = findSectionIndexAtLine(sections, cursorLine);
    const currentSection = sections[currentSectionIndex];
    const isInLastSection = currentSection?.isLast ?? true;

    if (isInLastSection) {
      // Append at end of document
      // Structure: [---] [empty] [cursor] [empty]
      const lastLine = model.getLineCount();

      editorInstance.executeEdits('addEquation', [{
        range: {
          startLineNumber: lastLine,
          startColumn: model.getLineMaxColumn(lastLine),
          endLineNumber: lastLine,
          endColumn: model.getLineMaxColumn(lastLine),
        },
        text: NEW_EQUATION_CONTENT.append,
      }]);

      // Cursor on the middle empty line
      setTimeout(() => {
        const newLineCount = model.getLineCount();
        // Structure: ..., ---, empty, cursor, empty
        editorInstance.setPosition({ lineNumber: newLineCount - 1, column: 1 });
        editorInstance.revealLineInCenter(newLineCount - 1);
        editorInstance.focus();
      }, 0);
    } else {
      // Insert between sections
      // Find the separator line after current section
      const nextSection = sections[currentSectionIndex + 1];
      const insertLineNumber = nextSection.startLine;

      editorInstance.executeEdits('addEquation', [{
        range: {
          startLineNumber: insertLineNumber,
          startColumn: 1,
          endLineNumber: insertLineNumber,
          endColumn: 1,
        },
        text: NEW_EQUATION_CONTENT.insert,
      }]);

      // Cursor on the middle empty line
      setTimeout(() => {
        editorInstance.setPosition({ lineNumber: insertLineNumber + 1, column: 1 });
        editorInstance.revealLineInCenter(insertLineNumber + 1);
        editorInstance.focus();
      }, 50);
    }
  },
}));

// Setup native API handlers
if (typeof window !== 'undefined') {
  window.nativeAPI = {
    loadDocument: (data) => {
      useEditorStore.getState().loadFromNative(data.document, data.globalPreamble, data.cursorLine);
    },
    setActiveEquation: (data) => {
      useEditorStore.getState().jumpToEquation(data.equationId);
    },
    requestContent: () => {
      const { document, equations, frontmatter } = useEditorStore.getState();
      notifyDocumentChanged(document, equations, frontmatter);
    },
    addEquation: () => {
      useEditorStore.getState().addEquation();
    },
    setFontSize: (data) => {
      useEditorStore.getState().setFontSize(data.fontSize);
    },
    moveCursorToLine: (line: number) => {
      useEditorStore.getState().jumpToLine(line);
    },
  };
}
