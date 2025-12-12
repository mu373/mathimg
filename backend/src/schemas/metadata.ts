import { z } from 'zod';
import { EquationSchema } from './equation';

export const SVGMetadataSchema = z.object({
  formatVersion: z.number().default(1),
  generator: z.string().default('latex-svg-editor'),
  generatorVersion: z.string().default('0.1.0'),
  documentId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  globalPreamble: z.string().default(''),
  engineVersion: z.string(),
  engineOptions: z.record(z.unknown()).default({}),
  equations: z.array(EquationSchema),
});

export type SVGMetadata = z.infer<typeof SVGMetadataSchema>;
