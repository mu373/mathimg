export interface RendererOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
  trust?: boolean;
  strict?: boolean;
  [key: string]: unknown;
}

export interface RenderResult {
  html: string;
  css?: string;
}

export interface Renderer {
  render(latex: string, options?: RendererOptions): RenderResult;
  validate(latex: string): { valid: boolean; errors: string[] };
  getVersion(): string;
}
