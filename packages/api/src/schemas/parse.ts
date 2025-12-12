import { z } from 'zod';
import { SVGMetadataSchema } from './metadata';
import { EquationSchema } from './equation';

export const ParseRequestSchema = z.object({
  svg: z.string().min(1, 'SVG content is required').openapi({
    example: '<svg>...</svg>',
    description: 'SVG content to parse for embedded LaTeX metadata'
  }),
});

export const ParseResponseSchema = z.object({
  success: z.boolean().openapi({
    example: true,
    description: 'Whether the parsing operation completed successfully'
  }),
  hasMetadata: z.boolean().openapi({
    example: true,
    description: 'Whether the SVG contains embedded LaTeX metadata'
  }),
  metadata: SVGMetadataSchema.optional().openapi({
    description: 'Extracted metadata including equations, preamble, and rendering information'
  }),
  equations: z.array(EquationSchema).default([]).openapi({
    example: [],
    description: 'Array of parsed equations with their LaTeX source and positions'
  }),
  errors: z.array(z.string()).default([]).openapi({
    example: [],
    description: 'Array of parsing errors (empty if successful)'
  }),
});

export const ValidateRequestSchema = z.object({
  latex: z.string().min(1, 'LaTeX content is required').openapi({
    example: 'E = mc^2',
    description: 'LaTeX equation to validate for syntax errors'
  }),
});

export const ValidateResponseSchema = z.object({
  valid: z.boolean().openapi({
    example: true,
    description: 'Whether the LaTeX equation is valid and can be rendered'
  }),
  errors: z.array(z.string()).default([]).openapi({
    example: [],
    description: 'Array of validation errors (empty if valid)'
  }),
});

export type ParseRequest = z.infer<typeof ParseRequestSchema>;
export type ParseResponse = z.infer<typeof ParseResponseSchema>;
export type ValidateRequest = z.infer<typeof ValidateRequestSchema>;
export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;
