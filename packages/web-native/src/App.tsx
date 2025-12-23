import { useEffect } from 'react';
import { Editor } from './components/Editor';
import { notifyReady, isRunningInNative } from './bridge/native-bridge';
import { useEditorStore } from './store/editorStore';
import './App.css';

function App() {
  const { document, setDocument } = useEditorStore();

  useEffect(() => {
    // Notify native that web app is ready
    notifyReady();

    // If not in native context, load sample document
    if (!isRunningInNative() && !document) {
      setDocument(`E = mc^2
\\label{eq:einstein}

---

\\int_0^\\infty e^{-x} dx = 1

---

\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
\\label{eq:basel}

---

\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
\\label{eq:quadratic}
`);
    }
  }, []);

  return (
    <div className="app">
      <Editor />
    </div>
  );
}

export default App;
