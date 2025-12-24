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
  loadFromNative: (document: string, globalPreamble?: string) => void;
  jumpToEquation: (equationId: string) => void;
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

  loadFromNative: (document: string, globalPreamble?: string) => {
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
  },

  jumpToEquation: (equationId: string) => {
    const { editorInstance, equations } = get();
    const eq = equations.find(e => e.id === equationId);

    if (editorInstance && eq) {
      const lineNumber = eq.endLine + 1;
      const model = editorInstance.getModel();
      const column = model ? model.getLineMaxColumn(lineNumber) : 1;
      editorInstance.setPosition({ lineNumber, column });
      editorInstance.revealLineInCenter(lineNumber);
      editorInstance.focus();
      set({ activeEquationId: equationId });
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
    const { editorInstance, activeEquationId, equations } = get();
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    // Find current equation to insert after
    const currentEq = equations.find(e => e.id === activeEquationId);
    const currentEqIndex = currentEq ? equations.findIndex(e => e.id === activeEquationId) : -1;
    const isLastEquation = currentEqIndex === equations.length - 1 || equations.length === 0;

    // Monaco uses 1-based line numbers, parser uses 0-based
    if (!currentEq || isLastEquation) {
      // Append at end of document
      const lastLine = model.getLineCount();
      const lastLineContent = model.getLineContent(lastLine);
      const needsLeadingNewline = lastLineContent.trim() !== '';
      const newContent = (needsLeadingNewline ? '\n' : '') + '\n---\n';

      editorInstance.executeEdits('addEquation', [{
        range: {
          startLineNumber: lastLine,
          startColumn: model.getLineMaxColumn(lastLine),
          endLineNumber: lastLine,
          endColumn: model.getLineMaxColumn(lastLine),
        },
        text: newContent,
      }]);

      // Calculate new cursor position after edit
      setTimeout(() => {
        const newLineCount = model.getLineCount();
        editorInstance.setPosition({ lineNumber: newLineCount, column: 1 });
        editorInstance.revealLineInCenter(newLineCount);
        editorInstance.focus();
      }, 0);
    } else {
      // Insert between equations
      // nextEq.startLine is 0-based, Monaco is 1-based
      const nextEq = equations[currentEqIndex + 1];
      const insertLineNumber = nextEq.startLine + 1; // Convert to 1-based

      // Insert: newline + --- + newline before next equation
      const newContent = '\n---\n';

      editorInstance.executeEdits('addEquation', [{
        range: {
          startLineNumber: insertLineNumber,
          startColumn: 1,
          endLineNumber: insertLineNumber,
          endColumn: 1,
        },
        text: newContent,
      }]);

      // Set cursor position after a brief delay to ensure edit is processed
      const cursorLine = insertLineNumber + 1;
      setTimeout(() => {
        editorInstance.setPosition({ lineNumber: cursorLine, column: 1 });
        editorInstance.revealLineInCenter(cursorLine);
        editorInstance.focus();
      }, 50);
    }
  },
}));

// Setup native API handlers
if (typeof window !== 'undefined') {
  window.nativeAPI = {
    loadDocument: (data) => {
      useEditorStore.getState().loadFromNative(data.document, data.globalPreamble);
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
  };
}
