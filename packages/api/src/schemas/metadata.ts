import { z } from 'zod';
import { EquationSchema } from './equation';

export const SVGMetadataSchema = z.object({
  formatVersion: z.number().default(1).openapi({
    example: 1,
    description: 'Metadata format version for compatibility tracking'
  }),
  generator: z.string().default('mathimg').openapi({
    example: 'mathimg',
    description: 'Name of the tool that generated this SVG'
  }),
  generatorVersion: z.string().default('0.1.0').openapi({
    example: '0.1.0',
    description: 'Version of the generator tool'
  }),
  generatorHostname: z.string().optional().openapi({
    example: 'mathimg.example.workers.dev',
    description: 'Hostname of the server that generated this SVG'
  }),
  documentId: z.string().uuid().openapi({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Unique identifier for this document (UUID format)'
  }),
  createdAt: z.string().datetime().openapi({
    example: '2024-01-01T00:00:00Z',
    description: 'ISO 8601 timestamp when the document was created'
  }),
  updatedAt: z.string().datetime().openapi({
    example: '2024-01-01T00:00:00Z',
    description: 'ISO 8601 timestamp when the document was last updated'
  }),
  globalPreamble: z.string().default('').openapi({
    example: '',
    description: 'Global LaTeX preamble applied to all equations in this document'
  }),
  engineVersion: z.string().openapi({
    example: '3.2.2',
    description: 'Version of the rendering engine (MathJax) used'
  }),
  engineOptions: z.record(z.unknown()).default({}).openapi({
    example: {},
    description: 'Rendering engine configuration options'
  }),
  equations: z.array(EquationSchema).openapi({
    description: 'Array of all equations embedded in this SVG'
  }),
});

export type SVGMetadata = z.infer<typeof SVGMetadataSchema>;
