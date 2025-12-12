import { mathjax } from 'mathjax-full/js/mathjax';
import { TeX } from 'mathjax-full/js/input/tex';
import { SVG } from 'mathjax-full/js/output/svg';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages';
import type { Renderer, RendererOptions, RenderResult } from './base';

export class MathJaxRenderer implements Renderer {
  private adaptor;
  private tex;
  private svg;

  constructor() {
    this.adaptor = liteAdaptor();
    RegisterHTMLHandler(this.adaptor);
    this.tex = new TeX({ packages: AllPackages });
    this.svg = new SVG({ fontCache: 'none' });
  }

  render(latex: string, options: RendererOptions = {}): RenderResult {
    const displayMode = options.displayMode ?? true;
    const throwOnError = options.throwOnError ?? false;

    try {
      const doc = mathjax.document('', {
        InputJax: this.tex,
        OutputJax: this.svg,
      });

      const node = doc.convert(latex, {
        display: displayMode,
        em: 16,
        ex: 8,
        containerWidth: 80 * 16,
      });

      let svgString = this.adaptor.outerHTML(node);

      // Replace currentColor with black for default rendering
      svgString = svgString.replace(/stroke="currentColor"/g, 'stroke="black"');
      svgString = svgString.replace(/fill="currentColor"/g, 'fill="black"');

      // Remove any red error styling
      svgString = svgString.replace(/fill="red"/g, 'fill="black"');
      svgString = svgString.replace(/stroke="red"/g, 'stroke="black"');

      return {
        html: svgString,
      };
    } catch (error) {
      if (throwOnError) {
        throw error;
      }
      return {
        html: `<text fill="black">${latex}</text>`,
      };
    }
  }

  validate(latex: string): { valid: boolean; errors: string[] } {
    try {
      const doc = mathjax.document('', {
        InputJax: this.tex,
        OutputJax: this.svg,
      });
      doc.convert(latex, { display: true });
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  getVersion(): string {
    return '3.2.2';
  }
}
