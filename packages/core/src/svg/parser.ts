import type { RendererMetadata } from '../renderer/metadata';

export interface ImportedEquation {
  id: string;
  latex: string;
  label: string;
}

export interface ParseSVGResult {
  hasMetadata: boolean;
  metadata?: RendererMetadata;
  equations: ImportedEquation[];
  errors: string[];
}

/**
 * Parse SVG content to extract LaTeX equations from metadata
 * Works entirely client-side without backend
 */
export function parseSvg(svgContent: string): ParseSVGResult {
  const errors: string[] = [];
  const equations: ImportedEquation[] = [];

  try {
    // Try to extract metadata block first
    const metadataMatch = svgContent.match(
      /<metadata[^>]*id="latex-equations"[^>]*>([\s\S]*?)<\/metadata>/
    );

    if (metadataMatch) {
      const metadataContent = metadataMatch[1]?.trim();
      if (metadataContent) {
        try {
          const metadata = JSON.parse(metadataContent) as RendererMetadata;
          return {
            hasMetadata: true,
            metadata,
            equations: metadata.equations.map((eq, index) => ({
              id: eq.id,
              latex: eq.latex,
              label: eq.label || `imported${index + 1}`,
            })),
            errors: [],
          };
        } catch {
          errors.push('Failed to parse metadata JSON');
        }
      }
    }

    // Fallback: try to extract from data attributes on groups
    const groupMatches = svgContent.matchAll(
      /<g[^>]*data-role="latex-equation"[^>]*>/g
    );

    for (const match of groupMatches) {
      const groupTag = match[0];
      const idMatch = groupTag.match(/data-equation-id="([^"]+)"/);
      const latexMatch = groupTag.match(/data-latex="([^"]+)"/);

      if (latexMatch) {
        const latex = latexMatch[1]
          ?.replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&apos;/g, "'") || '';

        // Try to extract label from the latex itself
        const labelMatch = latex.match(/\\label\{([^}]+)\}/);
        equations.push({
          id: idMatch?.[1] || crypto.randomUUID(),
          latex,
          label: labelMatch?.[1] || `imported${equations.length + 1}`,
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

/**
 * Import equations from SVG content (convenience wrapper)
 */
export function importSvg(svgContent: string): ImportedEquation[] {
  const result = parseSvg(svgContent);

  if (result.errors.length > 0 && result.equations.length === 0) {
    throw new Error(result.errors.join(', '));
  }

  return result.equations;
}

export function importSvgFromInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        resolve(text);
      } else {
        resolve(null);
      }
    };
    input.click();
  });
}
