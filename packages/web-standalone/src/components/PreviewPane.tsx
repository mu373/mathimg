import { useRef, useEffect } from 'react';
import { ParsedEquation } from '@mathedit/core';
import { EquationCard } from './EquationCard';
import { useEditorStore } from '@/store';

interface PreviewPaneProps {
  equations: ParsedEquation[];
  renderedSvgs: Record<string, string>;
  activeId: string | null;
  onSelectEquation: (id: string) => void;
}

export function PreviewPane({
  equations,
  renderedSvgs,
  activeId,
  onSelectEquation,
}: PreviewPaneProps) {
  const refs = useRef<Record<string, HTMLDivElement>>({});
  const jumpToEquation = useEditorStore((state) => state.jumpToEquation);

  useEffect(() => {
    if (activeId && refs.current[activeId]) {
      const element = refs.current[activeId];
      const container = element.parentElement;

      if (container) {
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Check if element is visible in viewport
        const isVisible =
          rect.top >= containerRect.top &&
          rect.bottom <= containerRect.bottom;

        // Only scroll if not visible
        if (!isVisible) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }
    }
  }, [activeId]);

  const handleSelectEquation = (id: string) => {
    onSelectEquation(id);
    jumpToEquation(id);
  };

  return (
    <div className="overflow-auto h-full p-4 space-y-4">
      {equations.length === 0 ? (
        <div className="text-center text-muted-foreground p-8">
          <p>No equations yet.</p>
          <p className="text-sm">Add equations to your LaTeX document separated by ---</p>
        </div>
      ) : (
        equations.map((eq) => (
          <EquationCard
            key={eq.id}
            ref={(el) => {
              if (el) refs.current[eq.id] = el;
            }}
            equation={eq}
            svg={renderedSvgs[eq.id]}
            isActive={eq.id === activeId}
            onClick={() => handleSelectEquation(eq.id)}
          />
        ))
      )}
    </div>
  );
}
