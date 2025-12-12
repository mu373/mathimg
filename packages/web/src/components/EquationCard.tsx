import { forwardRef } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Download, Copy } from 'lucide-react';
import { ParsedEquation, exportSingleSVG } from '@mathimg/core';
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
        // Check if Clipboard API with write is available
        if (!navigator.clipboard || !navigator.clipboard.write) {
          toast({
            title: 'Copy not supported',
            description: 'Your browser does not support copying images',
            variant: 'destructive'
          });
          return;
        }

        // Convert SVG to PNG blob for clipboard
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });

        // Create an image from the SVG
        const img = new Image();
        const url = URL.createObjectURL(svgBlob);

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });

        // Draw to canvas and convert to PNG
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        // Convert canvas to blob
        const pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to convert canvas to blob'));
          }, 'image/png');
        });

        // Copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': pngBlob
          })
        ]);

        toast({ title: 'Image copied to clipboard' });
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
