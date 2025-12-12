import { useState, useCallback, useMemo, DragEvent, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toolbar } from './Toolbar';
import { EquationList } from './EquationList';
import { LatexDocument } from './LatexDocument';
import { PreviewPane } from './PreviewPane';
import { useEditorStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { parseSvg, generateSVG, type EquationInput } from '@mathimg/core';

export function EditorLayout() {
  const {
    setDocument,
    activeEquationId,
    setActiveEquation,
    addEquation,
    setEditorInstance,
    importSvgEquations,
    checkSvgForDuplicates,
    getActiveTab,
    renderAll,
    activeTabId,
  } = useEditorStore();

  const activeTab = getActiveTab();
  const document = activeTab?.document ?? '';
  const parsedEquations = activeTab?.parsedEquations ?? [];
  const renderedSvgs = activeTab?.renderedSvgs ?? {};

  // Re-render when switching tabs
  useEffect(() => {
    if (activeTabId && activeTab && Object.keys(activeTab.renderedSvgs).length === 0) {
      renderAll();
    }
  }, [activeTabId, activeTab, renderAll]);

  const [isDragging, setIsDragging] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pendingSvgContent, setPendingSvgContent] = useState<string | null>(null);
  const [duplicateLabels, setDuplicateLabels] = useState<string[]>([]);
  const [pendingNewLatex, setPendingNewLatex] = useState<string | null>(null);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if we're leaving the main container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const svgFile = files.find(f => f.type === 'image/svg+xml' || f.name.endsWith('.svg'));

    if (svgFile) {
      const content = await svgFile.text();
      const { hasDuplicates, duplicateLabels } = await checkSvgForDuplicates(content);

      if (hasDuplicates) {
        // Parse the SVG to get the new equation's latex
        const parsed = parseSvg(content);
        const newLatex = parsed.equations[0]?.latex || null;

        setPendingSvgContent(content);
        setDuplicateLabels(duplicateLabels);
        setPendingNewLatex(newLatex);
        setImportDialogOpen(true);
      } else {
        await importSvgEquations(content);
      }
    }
  }, [importSvgEquations, checkSvgForDuplicates]);

  const handleImportOverwrite = useCallback(async () => {
    if (pendingSvgContent) {
      await importSvgEquations(pendingSvgContent, true);
    }
    setImportDialogOpen(false);
    setPendingSvgContent(null);
    setDuplicateLabels([]);
    setPendingNewLatex(null);
  }, [pendingSvgContent, importSvgEquations]);

  const handleImportCancel = useCallback(() => {
    setImportDialogOpen(false);
    setPendingSvgContent(null);
    setDuplicateLabels([]);
    setPendingNewLatex(null);
  }, []);

  // Get current equation's latex for the duplicate label
  const currentEquationLatex = useMemo(() => {
    if (duplicateLabels.length === 0) return null;
    const existing = parsedEquations.find(eq => eq.label === duplicateLabels[0]);
    return existing?.latex || null;
  }, [duplicateLabels, parsedEquations]);

  // Generate preview SVGs for comparison
  const previewSvgs = useMemo(() => {
    if (!currentEquationLatex || !pendingNewLatex) return null;

    const renderPreview = (latex: string) => {
      try {
        const input: EquationInput[] = [{ latex, displayMode: 'block' }];
        const result = generateSVG({ equations: input, options: { embedMetadata: false } });
        return result.svg;
      } catch {
        return null;
      }
    };

    return {
      current: renderPreview(currentEquationLatex),
      new: renderPreview(pendingNewLatex),
    };
  }, [currentEquationLatex, pendingNewLatex]);

  return (
    <div
      className="h-full flex flex-col relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toolbar />
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Sidebar - Equation List */}
          <Panel defaultSize={15} minSize={10} maxSize={25}>
            <EquationList
              equations={parsedEquations}
              activeId={activeEquationId}
              onSelectEquation={setActiveEquation}
              onAddEquation={addEquation}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          {/* Center - LaTeX Editor */}
          <Panel defaultSize={45} minSize={30}>
            <LatexDocument
              key={activeTabId}
              document={document}
              onChange={setDocument}
              onMount={(editor) => setEditorInstance(editor)}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          {/* Right - Preview Pane */}
          <Panel defaultSize={40} minSize={30}>
            <PreviewPane
              equations={parsedEquations}
              renderedSvgs={renderedSvgs}
              activeId={activeEquationId}
              onSelectEquation={setActiveEquation}
            />
          </Panel>
        </PanelGroup>
      </div>

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-background px-6 py-4 rounded-lg shadow-lg">
            <p className="text-lg font-medium">Drop SVG file to import</p>
          </div>
        </div>
      )}

      {/* Import confirmation dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Equation already exists</DialogTitle>
            <DialogDescription>
              "{duplicateLabels[0]}" already exists. Do you want to overwrite it?
            </DialogDescription>
          </DialogHeader>

          {previewSvgs && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Current</p>
                <div className="border rounded p-4 bg-muted/30 flex items-center justify-center min-h-[60px] overflow-hidden">
                  {previewSvgs.current ? (
                    <div className="scale-[0.6]" dangerouslySetInnerHTML={{ __html: previewSvgs.current }} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Failed to render</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">New</p>
                <div className="border rounded p-4 bg-muted/30 flex items-center justify-center min-h-[60px] overflow-hidden">
                  {previewSvgs.new ? (
                    <div className="scale-[0.6]" dangerouslySetInnerHTML={{ __html: previewSvgs.new }} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Failed to render</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleImportCancel}>
              Cancel
            </Button>
            <Button onClick={handleImportOverwrite}>
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
