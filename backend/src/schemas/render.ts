import { z } from 'zod';
import { EquationInputSchema } from './equation';

export const RenderOptionsSchema = z.object({
  globalPreamble: z.string().default('').openapi({ example: '' }),
  embedMetadata: z.boolean().default(true).openapi({ example: true }),
  engineOptions: z.record(z.unknown()).optional(),
  color: z.string().optional().openapi({ example: '#000000', description: 'CSS color value' }),
});

export const RenderRequestSchema = z.object({
  equations: z.array(EquationInputSchema).min(1, 'At least one equation is required'),
  options: RenderOptionsSchema.optional(),
}).openapi({
  example: {
    equations: [{ latex: 'E = mc^2', displayMode: 'block' }],
    options: { embedMetadata: true },
  },
});

export const RenderResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  svg: z.string().openapi({ example: '<svg>...</svg>' }),
  metadata: z.unknown().optional(),
  errors: z.array(z.string()).default([]).openapi({ example: [] }),
});

export const RenderQueryParamsSchema = z.object({
  display: z.enum(['inline', 'block']).optional().default('block').openapi({ example: 'block' }),
  metadata: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true')
    .openapi({ example: 'true' }),
  color: z.string().optional().openapi({ example: '#000000' }),
});

export type RenderOptions = z.infer<typeof RenderOptionsSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type RenderResponse = z.infer<typeof RenderResponseSchema>;
export type RenderQueryParams = z.infer<typeof RenderQueryParamsSchema>;
