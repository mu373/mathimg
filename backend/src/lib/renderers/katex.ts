import katex from 'katex';
import type { Renderer, RendererOptions, RenderResult } from './base';

export class KaTeXRenderer implements Renderer {
  render(latex: string, options: RendererOptions = {}): RenderResult {
    const displayMode = options.displayMode ?? true;
    const throwOnError = options.throwOnError ?? false;

    try {
      const html = katex.renderToString(latex, {
        displayMode,
        throwOnError,
        output: 'html',
        trust: options.trust ?? false,
        strict: options.strict ?? 'warn',
        ...options,
      });

      return {
        html,
      };
    } catch (error) {
      if (throwOnError) {
        throw error;
      }
      return {
        html: `<span class="katex-error" title="${error instanceof Error ? error.message : String(error)}">${latex}</span>`,
      };
    }
  }

  validate(latex: string): { valid: boolean; errors: string[] } {
    try {
      katex.renderToString(latex, {
        throwOnError: true,
        output: 'html',
      });
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  getVersion(): string {
    return '0.16.11';
  }
}
