import { z } from 'zod';
import { EquationInputSchema } from './equation';

export const RenderOptionsSchema = z.object({
  globalPreamble: z.string().default(''),
  engine: z.enum(['katex', 'mathjax']).default('katex'),
  embedMetadata: z.boolean().default(true),
  engineOptions: z.record(z.unknown()).optional(),
  color: z.string().optional(), // CSS color: "blue", "#5d5d5d", "rgb(255,0,0)", etc.
});

export const RenderRequestSchema = z.object({
  equations: z.array(EquationInputSchema).min(1, 'At least one equation is required'),
  options: RenderOptionsSchema.optional(),
});

export const RenderResponseSchema = z.object({
  success: z.boolean(),
  svg: z.string(),
  metadata: z.unknown().optional(),
  errors: z.array(z.string()).default([]),
});

export const RenderQueryParamsSchema = z.object({
  display: z.enum(['inline', 'block']).optional().default('block'),
  engine: z.enum(['katex', 'mathjax']).optional().default('katex'),
  metadata: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true'),
  color: z.string().optional(),
});

export type RenderOptions = z.infer<typeof RenderOptionsSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type RenderResponse = z.infer<typeof RenderResponseSchema>;
export type RenderQueryParams = z.infer<typeof RenderQueryParamsSchema>;
