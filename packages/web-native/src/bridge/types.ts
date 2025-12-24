import type { ParsedEquation, DocumentFrontmatter } from '@mathedit/core';

// Messages from Swift → JavaScript
export interface NativeToWebMessages {
  loadDocument: {
    document: string;
    globalPreamble?: string;
  };
  setActiveEquation: {
    equationId: string;
  };
  setFontSize: {
    fontSize: number;
  };
  requestContent: void;
}

// Messages from JavaScript → Swift
export interface WebToNativeMessages {
  documentChanged: {
    document: string;
    equations: ParsedEquation[];
    frontmatter: DocumentFrontmatter;
  };
  equationSelected: {
    equationId: string;
    line: number;
  };
  cursorPositionChanged: {
    line: number;
    column: number;
    equationId: string | null;
  };
  requestRender: {
    equations: ParsedEquation[];
    frontmatter: DocumentFrontmatter;
  };
  ready: void;
  importSvg: {
    svgContent: string;
  };
}

// Extend window with native bridge types
declare global {
  interface Window {
    webkit?: {
      messageHandlers: {
        [key: string]: {
          postMessage: (message: unknown) => void;
        };
      };
    };
    nativeAPI?: {
      loadDocument: (data: NativeToWebMessages['loadDocument']) => void;
      setActiveEquation: (data: NativeToWebMessages['setActiveEquation']) => void;
      setFontSize: (data: NativeToWebMessages['setFontSize']) => void;
      requestContent: () => void;
      addEquation: () => void;
    };
  }
}
