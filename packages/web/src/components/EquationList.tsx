import { ParsedEquation } from '@mathimg/core';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Plus } from 'lucide-react';
import { useEditorStore } from '@/store';

interface EquationListProps {
  equations: ParsedEquation[];
  activeId: string | null;
  onSelectEquation: (id: string) => void;
  onAddEquation: () => void;
}

export function EquationList({
  equations,
  activeId,
  onSelectEquation,
  onAddEquation,
}: EquationListProps) {
  const jumpToEquation = useEditorStore((state) => state.jumpToEquation);

  const handleSelectEquation = (id: string) => {
    onSelectEquation(id);
    jumpToEquation(id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Equations</h3>
        <Button onClick={onAddEquation} variant="ghost" size="icon" className="h-7 w-7">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {equations.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm p-4">
            No equations
          </div>
        ) : (
          <div className="space-y-1">
            {equations.map((eq) => (
              <button
                key={eq.id}
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors',
                  'hover:bg-accent',
                  activeId === eq.id && 'bg-accent font-medium'
                )}
                onClick={() => handleSelectEquation(eq.id)}
              >
                {eq.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
