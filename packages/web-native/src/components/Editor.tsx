import MonacoEditor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../store/editorStore';

export function Editor() {
  const { document, setDocument, setEditorInstance, handleCursorChange } = useEditorStore();

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
    <MonacoEditor
      height="100%"
      defaultLanguage="latex-custom"
      value={document}
      onChange={(value) => setDocument(value || '')}
      onMount={handleEditorMount}
      theme="latex-light"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        automaticLayout: true,
      }}
    />
  );
}
