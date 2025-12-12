import { z } from 'zod';
import { SVGMetadataSchema } from './metadata';
import { EquationSchema } from './equation';

export const ParseRequestSchema = z.object({
  svg: z.string().min(1, 'SVG content is required'),
});

export const ParseResponseSchema = z.object({
  success: z.boolean(),
  hasMetadata: z.boolean(),
  metadata: SVGMetadataSchema.optional(),
  equations: z.array(EquationSchema).default([]),
  errors: z.array(z.string()).default([]),
});

export const ValidateRequestSchema = z.object({
  latex: z.string().min(1, 'LaTeX content is required'),
});

export const ValidateResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).default([]),
});

export type ParseRequest = z.infer<typeof ParseRequestSchema>;
export type ParseResponse = z.infer<typeof ParseResponseSchema>;
export type ValidateRequest = z.infer<typeof ValidateRequestSchema>;
export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;
