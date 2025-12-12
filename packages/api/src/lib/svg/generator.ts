import { v4 as uuidv4 } from 'uuid';
import type { Equation, EquationInput, RenderOptions } from '@/schemas';
import { MathJaxRenderer } from '@/lib/renderers/mathjax';
import { createMetadata, serializeMetadata } from './metadata';

export interface GenerateSVGOptions {
  equations: EquationInput[];
  options?: RenderOptions;
  hostname?: string;
}

export interface GenerateSVGResult {
  svg: string;
  metadata: unknown;
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
    const equationId = uuidv4();
    const svgGroupId = `${equationId}-group`;

    try {
      const displayMode = eqInput.displayMode === 'inline' ? false : true;
      const result = renderer.render(eqInput.latex, {
        displayMode,
        throwOnError: true,
      });

      // Extract viewBox, width and height from MathJax SVG
      const viewBoxMatch = result.html.match(/viewBox="([^"]+)"/);
      const widthMatch = result.html.match(/width="([0-9.]+)ex"/);
      const heightMatch = result.html.match(/height="([0-9.]+)ex"/);

      // Parse viewBox: "minX minY width height"
      let width = 100;
      let height = 40;
      let viewBox = '0 0 100 40';

      if (viewBoxMatch?.[1]) {
        const [_minX, _minY, vbWidth, vbHeight] = viewBoxMatch[1].split(' ').map(parseFloat);
        viewBox = viewBoxMatch[1];
        // Scale down to reasonable pixel dimensions (divide by ~20 to get readable size)
        const scale = 0.05;
        width = (vbWidth || 100) * scale;
        height = (vbHeight || 100) * scale;
      } else if (widthMatch?.[1] && heightMatch?.[1]) {
        // Fallback to ex-based calculation
        width = parseFloat(widthMatch[1]) * 8;
        height = parseFloat(heightMatch[1]) * 8;
      }

      // Extract inner SVG content (everything between <svg...> and </svg>)
      const svgContentMatch = result.html.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
      let svgInnerContent = svgContentMatch?.[1] || result.html;

      // MathJax hardcodes stroke="black" fill="black" - we need to override or remove them
      if (input.options?.color) {
        // Replace hardcoded black with the specified color
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

      // Wrap the MathJax SVG content in a nested SVG with preserved viewBox
      // Add color styling if specified
      const colorStyle = input.options?.color ? ` fill="${input.options.color}"` : '';
      const svgGroup = `
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
    hostname: input.hostname,
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

/**
 * Minify SVG by removing unnecessary whitespace and newlines
 */
export function minifySVG(svg: string): string {
  return svg
    .replace(/\n\s*/g, '') // Remove newlines and indentation
    .replace(/>\s+</g, '><') // Remove whitespace between tags
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces to single space
    .trim();
}
