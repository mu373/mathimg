import { MathJaxRenderer } from './mathjax';
import { createMetadata, serializeMetadata, type Equation } from './metadata';

export interface EquationInput {
  id?: string;
  latex: string;
  displayMode?: 'inline' | 'block';
  environment?: string | null;
  label?: string | null;
  preambleOverride?: string | null;
  customData?: Record<string, unknown>;
}

export interface RenderOptions {
  globalPreamble?: string;
  color?: string;
  backgroundColor?: string;
  embedMetadata?: boolean;
  engineOptions?: Record<string, unknown>;
}

export interface GenerateSVGOptions {
  equations: EquationInput[];
  options?: RenderOptions;
}

export interface GenerateSVGResult {
  svg: string;
  metadata?: unknown;
  errors: string[];
}

export function generateSVG(input: GenerateSVGOptions): GenerateSVGResult {
  const renderer = new MathJaxRenderer();
  const errors: string[] = [];
  const processedEquations: Equation[] = [];
  const svgGroups: string[] = [];

  let maxWidth = 0;
  let currentY = 0;
  const padding = 0;

  for (const eqInput of input.equations) {
    const equationId = eqInput.id || (crypto.randomUUID ? crypto.randomUUID() : generateFallbackId());
    const svgGroupId = `${equationId}-group`;

    try {
      const displayMode = eqInput.displayMode === 'inline' ? false : true;
      const result = renderer.render(eqInput.latex, {
        displayMode,
        throwOnError: true,
      });

      // Check if this is a tagged equation (uses width="100%" and min-width style)
      const isTaggedEquation = result.html.includes('width="100%"') || result.html.includes('data-labels');

      // Extract viewBox, width and height from MathJax SVG
      const viewBoxMatch = result.html.match(/viewBox="([^"]+)"/);
      const widthMatch = result.html.match(/width="([0-9.]+)ex"/);
      const heightMatch = result.html.match(/height="([0-9.]+)ex"/);
      const minWidthMatch = result.html.match(/min-width:\s*([0-9.]+)ex/);

      // Parse viewBox: "minX minY width height"
      let width = 100;
      let height = 40;
      let viewBox = '0 0 100 40';
      let svgInnerContent: string;

      if (isTaggedEquation) {
        // For tagged equations, use min-width and height from MathJax output
        const pxPerEx = 22;
        const minWidthEx = minWidthMatch?.[1] ? parseFloat(minWidthMatch[1]) : 20;
        width = minWidthEx * pxPerEx;

        const exHeightMatch = result.html.match(/height="([0-9.]+)ex"/);
        height = exHeightMatch?.[1] ? parseFloat(exHeightMatch[1]) * pxPerEx : 50;

        // Extract the SVG, just fix the height dimension
        const svgMatch = result.html.match(/<svg[^>]*>[\s\S]*<\/svg>/);
        if (svgMatch) {
          svgInnerContent = svgMatch[0]
            .replace(/height="[0-9.]+ex"/, `height="${height}"`);
        } else {
          svgInnerContent = result.html;
        }

        viewBox = `0 0 ${width} ${height}`;
      } else if (viewBoxMatch?.[1]) {
        const [_minX, _minY, vbWidth, vbHeight] = viewBoxMatch[1].split(' ').map(parseFloat);
        viewBox = viewBoxMatch[1];
        // Scale down to reasonable pixel dimensions
        const scale = 0.05;
        width = (vbWidth || 100) * scale;
        height = (vbHeight || 100) * scale;

        // Extract inner SVG content
        // Use greedy match to capture nested SVGs
        const svgContentMatch = result.html.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        svgInnerContent = svgContentMatch?.[1] || result.html;
      } else if (widthMatch?.[1] && heightMatch?.[1]) {
        // Fallback to ex-based calculation
        width = parseFloat(widthMatch[1]) * 8;
        height = parseFloat(heightMatch[1]) * 8;

        const svgContentMatch = result.html.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        svgInnerContent = svgContentMatch?.[1] || result.html;
      } else {
        const svgContentMatch = result.html.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        svgInnerContent = svgContentMatch?.[1] || result.html;
      }

      // Handle color override
      if (input.options?.color) {
        svgInnerContent = svgInnerContent
          .replace(/stroke="black"/g, `stroke="${input.options.color}"`)
          .replace(/fill="black"/g, `fill="${input.options.color}"`);
      } else {
        // Remove hardcoded colors to allow CSS/inheritance control
        svgInnerContent = svgInnerContent
          .replace(/\s+stroke="black"/g, '')
          .replace(/\s+fill="black"/g, '');
      }

      const equation: Equation = {
        id: equationId,
        latex: eqInput.latex,
        displayMode: eqInput.displayMode ?? 'block',
        environment: eqInput.environment ?? null,
        label: eqInput.label ?? null,
        preambleOverride: eqInput.preambleOverride ?? null,
        bbox: {
          x: padding,
          y: currentY,
          width,
          height,
        },
        customData: eqInput.customData ?? {},
      };

      processedEquations.push(equation);

      const escapeXmlAttribute = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };

      const colorStyle = input.options?.color ? ` fill="${input.options.color}"` : '';

      let svgGroup: string;
      if (isTaggedEquation) {
        // For tagged equations, wrap in a container SVG with fixed dimensions
        svgGroup = `
  <g id="${svgGroupId}"
     data-role="latex-equation"
     data-equation-id="${equationId}"
     data-latex="${escapeXmlAttribute(eqInput.latex)}"
     data-display-mode="${equation.displayMode}"
     transform="translate(${padding}, ${currentY})"${colorStyle}>
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${svgInnerContent}
    </svg>
  </g>`;
      } else {
        svgGroup = `
  <g id="${svgGroupId}"
     data-role="latex-equation"
     data-equation-id="${equationId}"
     data-latex="${escapeXmlAttribute(eqInput.latex)}"
     data-display-mode="${equation.displayMode}"
     transform="translate(${padding}, ${currentY})"${colorStyle}>
    <svg viewBox="${viewBox}" width="${width}" height="${height}">
      ${svgInnerContent}
    </svg>
  </g>`;
      }

      svgGroups.push(svgGroup);

      maxWidth = Math.max(maxWidth, width + 2 * padding);
      currentY += height;
    } catch (error) {
      errors.push(
        `Error rendering equation "${eqInput.latex}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const totalHeight = currentY;
  const viewBoxWidth = maxWidth || 100;
  const viewBoxHeight = totalHeight || 50;

  const metadata = createMetadata({
    globalPreamble: input.options?.globalPreamble,
    engineVersion: renderer.getVersion(),
    engineOptions: input.options?.engineOptions ?? {},
    equations: processedEquations,
  });

  const metadataXML =
    input.options?.embedMetadata !== false
      ? `
  <metadata id="latex-equations" data-type="application/json">
${serializeMetadata(metadata)}
  </metadata>`
      : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg"
     width="${viewBoxWidth}"
     height="${viewBoxHeight}"
     viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}">${metadataXML}
${svgGroups.join('\n')}
</svg>`;

  return {
    svg,
    metadata: input.options?.embedMetadata !== false ? metadata : undefined,
    errors,
  };
}

function generateFallbackId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function minifySVG(svg: string): string {
  return svg
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
