export interface Equation {
  id: string;
  latex: string;
  displayMode: 'inline' | 'block';
  environment: string | null;
  label: string | null;
  preambleOverride: string | null;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  customData: Record<string, unknown>;
}

export interface RendererMetadata {
  generator: string;
  generatorVersion: string;
  generatedAt: string;
  globalPreamble?: string;
  engineVersion: string;
  engineOptions: Record<string, unknown>;
  equations: Equation[];
}

export interface CreateMetadataOptions {
  globalPreamble?: string;
  engineVersion: string;
  engineOptions: Record<string, unknown>;
  equations: Equation[];
}

export function createMetadata(options: CreateMetadataOptions): RendererMetadata {
  return {
    generator: 'mathimg-web',
    generatorVersion: '0.1.0',
    generatedAt: new Date().toISOString(),
    globalPreamble: options.globalPreamble,
    engineVersion: options.engineVersion,
    engineOptions: options.engineOptions,
    equations: options.equations,
  };
}

export function serializeMetadata(metadata: RendererMetadata): string {
  return JSON.stringify(metadata, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}
