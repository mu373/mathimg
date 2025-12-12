import type { SVGMetadata, Equation } from '@/schemas';
import { parseMetadata } from './metadata';

export interface ParseSVGResult {
  hasMetadata: boolean;
  metadata?: SVGMetadata;
  equations: Equation[];
  errors: string[];
}

export function parseSVG(svgContent: string): ParseSVGResult {
  const errors: string[] = [];
  const equations: Equation[] = [];

  try {
    const metadataMatch = svgContent.match(
      /<metadata[^>]*id="latex-equations"[^>]*>([\s\S]*?)<\/metadata>/
    );

    if (metadataMatch) {
      const metadataContent = metadataMatch[1]?.trim();
      if (metadataContent) {
        const metadata = parseMetadata(metadataContent);
        if (metadata) {
          return {
            hasMetadata: true,
            metadata,
            equations: metadata.equations,
            errors: [],
          };
        } else {
          errors.push('Failed to parse metadata JSON');
        }
      }
    }

    const groupMatches = svgContent.matchAll(
      /<g[^>]*data-role="latex-equation"[^>]*>([\s\S]*?)<\/g>/g
    );

    for (const match of groupMatches) {
      const groupTag = match[0];
      const idMatch = groupTag?.match(/data-equation-id="([^"]+)"/);
      const latexMatch = groupTag?.match(/data-latex="([^"]+)"/);
      const displayModeMatch = groupTag?.match(/data-display-mode="([^"]+)"/);

      if (latexMatch) {
        const latex = latexMatch[1]?.replace(/&quot;/g, '"') || '';
        equations.push({
          id: idMatch?.[1] || '',
          latex,
          displayMode: (displayModeMatch?.[1] as 'inline' | 'block') || 'block',
          environment: null,
          label: null,
          preambleOverride: null,
          customData: {},
        });
      }
    }

    if (equations.length === 0 && !metadataMatch) {
      errors.push('No LaTeX equations found in SVG');
    }

    return {
      hasMetadata: false,
      equations,
      errors,
    };
  } catch (error) {
    return {
      hasMetadata: false,
      equations: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
