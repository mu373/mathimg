import { v4 as uuidv4 } from 'uuid';
import type { SVGMetadata, Equation } from '@/schemas';

export interface CreateMetadataOptions {
  globalPreamble?: string;
  engineVersion: string;
  engineOptions?: Record<string, unknown>;
  equations: Equation[];
  hostname?: string;
}

export function createMetadata(options: CreateMetadataOptions): SVGMetadata {
  const now = new Date().toISOString();

  return {
    formatVersion: 1,
    generator: 'mathimg',
    generatorVersion: '0.1.0',
    generatorHostname: options.hostname,
    documentId: uuidv4(),
    createdAt: now,
    updatedAt: now,
    globalPreamble: options.globalPreamble ?? '',
    engineVersion: options.engineVersion,
    engineOptions: options.engineOptions ?? {},
    equations: options.equations,
  };
}

export function serializeMetadata(metadata: SVGMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

export function parseMetadata(metadataContent: string): SVGMetadata | null {
  try {
    return JSON.parse(metadataContent) as SVGMetadata;
  } catch {
    return null;
  }
}
