export interface RenderRequest {
  latex: string;
  preamble?: string;
  inline?: boolean;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
}

export interface EquationMetadata {
  label?: string;
  latex: string;
}

export interface SvgMetadata {
  generator: string;
  generatorVersion: string;
  generatedAt: string;
  preamble: string;
  equations: EquationMetadata[];
}

export interface RenderResponse {
  svg: string;
  metadata: SvgMetadata;
}

export interface ParseResponse {
  metadata: SvgMetadata | null;
}

export interface HealthResponse {
  status: string;
  message: string;
}
