import MonacoEditor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { importSvg, isRunningInNative, requestDeleteEquation } from '../bridge/native-bridge';

export function Editor() {
  const { document, setDocument, setEditorInstance, handleCursorChange, fontSize, editorInstance, jumpToPreviousEquation, jumpToNextEquation } = useEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Update Monaco editor font size when it changes
  useEffect(() => {
    if (editorInstance) {
      editorInstance.updateOptions({ fontSize });
    }
  }, [fontSize, editorInstance]);

  // Handle drag and drop for SVG files
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only set dragging to false if we're leaving the container
      const relatedTarget = e.relatedTarget as Node | null;
      if (!container.contains(relatedTarget)) {
        setIsDragging(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
          const content = await file.text();
          if (isRunningInNative()) {
            importSvg(content);
          } else {
            console.log('[Editor] SVG dropped (non-native):', file.name);
          }
        }
      }
    };

    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);

    return () => {
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('dragleave', handleDragLeave);
      container.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleEditorMount: OnMount = (editor, monaco) => {
    // Store editor instance
    setEditorInstance(editor);

    // Register custom LaTeX language if not already registered
    if (!monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === 'latex-custom')) {
      monaco.languages.register({ id: 'latex-custom' });

      // Define LaTeX tokenizer
      monaco.languages.setMonarchTokensProvider('latex-custom', {
        tokenizer: {
          root: [
            // Comments
            [/%.*$/, 'comment'],

            // Color commands
            [/\\textcolor/, 'keyword.color'],
            [/\\color/, 'keyword.color'],
            [/\\colorbox/, 'keyword.color'],

            // Common math commands
            [/\\(?:frac|sqrt|sum|int|prod|lim|infty|partial|nabla)/, 'keyword.math'],

            // Greek letters
            [/\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)/, 'type.identifier'],
            [/\\(?:Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega)/, 'type.identifier'],

            // Labels
            [/\\label\{[^}]*\}/, 'string'],

            // Generic commands
            [/\\[a-zA-Z@]+/, 'keyword'],

            // Curly braces
            [/[{}]/, 'delimiter.bracket'],

            // Square brackets
            [/[\[\]]/, 'delimiter.square'],

            // Math operators
            [/[+\-*/=<>]/, 'operator'],

            // Numbers
            [/\d+/, 'number'],

            // Separator
            [/^---+$/, 'keyword.separator'],
          ],
        },
      });

      // Define color theme
      monaco.editor.defineTheme('latex-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '008000', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'AF00DB' },
          { token: 'keyword.math', foreground: '0070C1' },
          { token: 'keyword.color', foreground: 'E1006D', fontStyle: 'bold' },
          { token: 'keyword.separator', foreground: '0000FF', fontStyle: 'bold' },
          { token: 'type.identifier', foreground: '267F99' },
          { token: 'string', foreground: 'A31515' },
          { token: 'number', foreground: '098658' },
          { token: 'operator', foreground: '000000' },
          { token: 'delimiter.bracket', foreground: 'C18401' },
          { token: 'delimiter.square', foreground: 'A626A4' },
        ],
        colors: {},
      });

      // Set the theme
      monaco.editor.setTheme('latex-light');
    }

    // Add toggle comment keybinding (Cmd+/ or Ctrl+/)
    editor.addAction({
      id: 'toggle-comment',
      label: 'Toggle Line Comment',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
      run: (ed) => {
        ed.trigger('keyboard', 'editor.action.commentLine', {});
      },
    });

    // Add Alt+Up to jump to previous equation
    editor.addAction({
      id: 'jump-to-previous-equation',
      label: 'Jump to Previous Equation',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
      run: () => {
        jumpToPreviousEquation();
      },
    });

    // Add Alt+Down to jump to next equation
    editor.addAction({
      id: 'jump-to-next-equation',
      label: 'Jump to Next Equation',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
      run: () => {
        jumpToNextEquation();
      },
    });

    // Add Cmd+Shift+Delete to delete equation
    editor.addAction({
      id: 'delete-equation',
      label: 'Delete Equation',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Backspace],
      run: () => {
        requestDeleteEquation();
      },
    });

    // Set language configuration for comments
    monaco.languages.setLanguageConfiguration('latex-custom', {
      comments: {
        lineComment: '%',
      },
    });

    // Listen for cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      handleCursorChange(e.position.lineNumber - 1, e.position.column);
    });
  };

  return (
    <div ref={containerRef} style={{ height: '100%', position: 'relative' }}>
      <MonacoEditor
        height="100%"
        defaultLanguage="latex-custom"
        value={document}
        onChange={(value) => setDocument(value || '')}
        onMount={handleEditorMount}
        theme="latex-light"
        options={{
          minimap: { enabled: false },
          fontSize,
          wordWrap: 'on',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          automaticLayout: true,
        }}
      />
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 122, 255, 0.1)',
            border: '2px dashed rgba(0, 122, 255, 0.5)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '16px 24px',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}
          >
            Drop SVG to import
          </div>
        </div>
      )}
    </div>
  );
}
