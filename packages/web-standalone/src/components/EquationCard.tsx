import { forwardRef } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Download, Copy } from 'lucide-react';
import { ParsedEquation, exportSingleSVG } from '@mathedit/core';
import { cn } from '@/lib/utils';
import { toast } from './ui/use-toast';

interface EquationCardProps {
  equation: ParsedEquation;
  svg: string | undefined;
  isActive: boolean;
  onClick: () => void;
}

export const EquationCard = forwardRef<HTMLDivElement, EquationCardProps>(
  ({ equation, svg, isActive, onClick }, ref) => {
    const handleCopySvg = async () => {
      if (!svg) return;
      try {
        // Check if browser supports SVG in clipboard (Chrome 124+, Edge 124+)
        const supportsSvgClipboard =
          'ClipboardItem' in window &&
          'supports' in ClipboardItem &&
          ClipboardItem.supports('image/svg+xml');

        if (supportsSvgClipboard) {
          // Copy as SVG image with metadata preserved
          const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/svg+xml': svgBlob })
          ]);
          toast({ title: 'SVG copied to clipboard' });
        } else {
          // Fallback: copy as text for older browsers
          await navigator.clipboard.writeText(svg);
          toast({ title: 'SVG copied as text' });
        }
      } catch (error) {
        toast({
          title: 'Failed to copy',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive'
        });
      }
    };

    const handleExport = () => {
      if (!svg) return;
      exportSingleSVG(equation.label, svg);
    };

    return (
      <div
        ref={ref}
        className={cn(
          'border rounded-lg p-4 transition-colors cursor-pointer',
          isActive && 'border-primary ring-2 ring-primary/20'
        )}
        onClick={onClick}
      >
        <div className="flex items-center justify-between mb-2">
          <Badge variant="secondary">{equation.label}</Badge>
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleCopySvg();
              }}
              disabled={!svg}
            >
              <Copy className="h-3.5 w-3.5 text-gray-400" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleExport();
              }}
              disabled={!svg}
            >
              <Download className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          </div>
        </div>

        {svg ? (
          <div className="bg-white p-2 rounded border overflow-x-auto flex items-center justify-center">
            <div
              style={{ transform: 'scale(0.5)', transformOrigin: 'center' }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        ) : (
          <div className="text-muted-foreground text-sm text-center p-4 border rounded">
            Rendering...
          </div>
        )}
      </div>
    );
  }
);

EquationCard.displayName = 'EquationCard';
