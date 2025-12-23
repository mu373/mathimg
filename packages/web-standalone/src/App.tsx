import { useEffect } from 'react';
import { EditorLayout, Toaster } from '@/components';
import { useEditorStore } from '@/store';

function App() {
  const hydrateFromStorage = useEditorStore((state) => state.hydrateFromStorage);
  const renderAll = useEditorStore((state) => state.renderAll);

  // Hydrate from localStorage on mount, or render default document
  useEffect(() => {
    const stored = localStorage.getItem('mathedit:editor');
    if (stored) {
      hydrateFromStorage();
    } else {
      renderAll();
    }
  }, [hydrateFromStorage, renderAll]);

  return (
    <>
      <EditorLayout />
      <Toaster />
    </>
  );
}

export default App;
