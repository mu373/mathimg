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
import { parseSvg, generateSVG, type EquationInput } from '@mathedit/core';

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
  const latexDocument = activeTab?.document ?? '';
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
  const [pendingNewId, setPendingNewId] = useState<string | null>(null);

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
        // Parse the SVG to get the new equation's latex and id
        const parsed = parseSvg(content);
        const newLatex = parsed.equations[0]?.latex || null;
        const newId = parsed.equations[0]?.id || null;

        setPendingSvgContent(content);
        setDuplicateLabels(duplicateLabels);
        setPendingNewLatex(newLatex);
        setPendingNewId(newId);
        setImportDialogOpen(true);
      } else {
        await importSvgEquations(content);
      }
    }
  }, [importSvgEquations, checkSvgForDuplicates]);

  const handleSvgImport = useCallback(async (content: string) => {
    const { hasDuplicates, duplicateLabels } = await checkSvgForDuplicates(content);

    if (hasDuplicates) {
      const parsed = parseSvg(content);
      const newLatex = parsed.equations[0]?.latex || null;
      const newId = parsed.equations[0]?.id || null;

      setPendingSvgContent(content);
      setDuplicateLabels(duplicateLabels);
      setPendingNewLatex(newLatex);
      setPendingNewId(newId);
      setImportDialogOpen(true);
    } else {
      await importSvgEquations(content);
    }
  }, [importSvgEquations, checkSvgForDuplicates]);

  // Read SVG from clipboard using async Clipboard API
  const readSvgFromClipboard = useCallback(async (): Promise<string | null> => {
    try {
      const clipboardItems = await navigator.clipboard.read();

      for (const item of clipboardItems) {
        // Check for SVG file
        if (item.types.includes('image/svg+xml')) {
          const blob = await item.getType('image/svg+xml');
          return await blob.text();
        }
        // Check for text that might be SVG
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          if (text.trim().startsWith('<svg') || text.trim().startsWith('<?xml')) {
            return text;
          }
        }
      }
    } catch {
      // Clipboard API failed, return null
    }
    return null;
  }, []);

  // Global keyboard listener for Cmd/Ctrl+V
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Only handle Cmd+V (Mac) or Ctrl+V (Windows/Linux)
      if (!((e.metaKey || e.ctrlKey) && e.key === 'v')) return;

      // Don't intercept if focus is in a regular input or textarea (not Monaco)
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Check clipboard for SVG - only intercept if SVG is found
      const svgContent = await readSvgFromClipboard();
      if (svgContent) {
        e.preventDefault();
        await handleSvgImport(svgContent);
      }
      // If no SVG, let the default paste behavior happen (e.g., paste text in Monaco)
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readSvgFromClipboard, handleSvgImport]);

  // Handler for menu item "Import SVG from Clipboard"
  const handleImportSvgFromClipboard = useCallback(async () => {
    const svgContent = await readSvgFromClipboard();
    if (svgContent) {
      await handleSvgImport(svgContent);
    } else {
      // No SVG found - this will be handled by Toolbar with a toast
      return null;
    }
    return svgContent;
  }, [readSvgFromClipboard, handleSvgImport]);

  const handleImportOverwrite = useCallback(async () => {
    if (pendingSvgContent) {
      await importSvgEquations(pendingSvgContent, true);
    }
    setImportDialogOpen(false);
    setPendingSvgContent(null);
    setDuplicateLabels([]);
    setPendingNewLatex(null);
    setPendingNewId(null);
  }, [pendingSvgContent, importSvgEquations]);

  const handleImportCancel = useCallback(() => {
    setImportDialogOpen(false);
    setPendingSvgContent(null);
    setDuplicateLabels([]);
    setPendingNewLatex(null);
    setPendingNewId(null);
  }, []);

  // Get current equation's latex and id for the duplicate label
  const currentEquationData = useMemo(() => {
    if (duplicateLabels.length === 0) return null;
    const existing = parsedEquations.find(eq => eq.label === duplicateLabels[0]);
    return existing ? { latex: existing.latex, id: existing.id } : null;
  }, [duplicateLabels, parsedEquations]);

  // Generate preview SVGs for comparison - renders fresh from current LaTeX text
  const previewSvgs = useMemo(() => {
    if (!pendingNewLatex) return null;

    const renderPreview = (latex: string | null) => {
      if (!latex) return null;
      try {
        const input: EquationInput[] = [{ latex, displayMode: 'block' }];
        const result = generateSVG({ equations: input, options: { embedMetadata: false } });
        return result.svg;
      } catch {
        return null;
      }
    };

    return {
      current: renderPreview(currentEquationData?.latex || null),
      new: renderPreview(pendingNewLatex),
    };
  }, [currentEquationData, pendingNewLatex]);

  return (
    <div
      className="h-full flex flex-col relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toolbar onImportSvgFromClipboard={handleImportSvgFromClipboard} />
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
              document={latexDocument}
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
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Current</p>
                  {currentEquationData?.id && (
                    <p className="text-xs font-mono text-muted-foreground/70">{currentEquationData.id}</p>
                  )}
                </div>
                <div className="border rounded p-4 bg-muted/30 flex items-center justify-center min-h-[60px] overflow-hidden">
                  {previewSvgs.current ? (
                    <div className="scale-[0.6]" dangerouslySetInnerHTML={{ __html: previewSvgs.current }} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Failed to render</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">New</p>
                  {pendingNewId && (
                    <p className="text-xs font-mono text-muted-foreground/70">{pendingNewId}</p>
                  )}
                </div>
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
