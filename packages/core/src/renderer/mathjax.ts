import { mathjax } from 'mathjax-full/js/mathjax';
import { TeX } from 'mathjax-full/js/input/tex';
import { SVG } from 'mathjax-full/js/output/svg';
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages';

export interface RendererOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
}

export interface RenderResult {
  html: string;
}

export class MathJaxRenderer {
  private adaptor;
  private tex;
  private svg;
  private initialized = false;

  constructor() {
    this.adaptor = browserAdaptor();
    RegisterHTMLHandler(this.adaptor);
    this.tex = new TeX({ packages: AllPackages });
    this.svg = new SVG({ fontCache: 'none' });
    this.initialized = true;
  }

  render(latex: string, options: RendererOptions = {}): RenderResult {
    if (!this.initialized) {
      throw new Error('MathJax renderer not initialized');
    }

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

      // Replace only currentColor with black (preserve user-specified colors)
      svgString = svgString.replace(/stroke="currentColor"/g, 'stroke="black"');
      svgString = svgString.replace(/fill="currentColor"/g, 'fill="black"');

      return {
        html: svgString,
      };
    } catch (error) {
      if (throwOnError) {
        throw error;
      }
      return {
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text x="10" y="25" fill="black">${latex}</text></svg>`,
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
