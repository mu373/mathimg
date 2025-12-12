import { z } from 'zod';
import { EquationInputSchema } from './equation';

export const RenderOptionsSchema = z.object({
  globalPreamble: z.string().default('').openapi({
    example: '',
    description: 'LaTeX preamble applied to all equations (e.g., custom macros or package imports)'
  }),
  embedMetadata: z.boolean().default(true).openapi({
    example: true,
    description: 'Whether to embed LaTeX equation metadata in the SVG for round-trip editing'
  }),
  engineOptions: z.record(z.unknown()).optional().openapi({
    description: 'Advanced rendering engine options (MathJax-specific configuration)'
  }),
  color: z.string().optional().openapi({
    example: '#000000',
    description: 'CSS color value for the rendered equation (e.g., #000000, rgb(255,0,0), or red)'
  }),
});

export const RenderRequestSchema = z.object({
  equations: z.array(EquationInputSchema).min(1, 'At least one equation is required').openapi({
    description: 'Array of LaTeX equations to render (minimum 1 equation required)'
  }),
  options: RenderOptionsSchema.optional().openapi({
    description: 'Optional rendering configuration and global settings'
  }),
}).openapi({
  example: {
    equations: [{ latex: 'E = mc^2', displayMode: 'block' }],
    options: { embedMetadata: true },
  },
});

export const RenderResponseSchema = z.object({
  success: z.boolean().openapi({
    example: true,
    description: 'Whether the rendering operation completed successfully'
  }),
  svg: z.string().openapi({
    example: '<svg>...</svg>',
    description: 'Rendered SVG markup (minified in JSON responses, formatted in image/svg+xml responses)'
  }),
  metadata: z.unknown().optional().openapi({
    description: 'Embedded metadata including LaTeX source, equation positions, and rendering details'
  }),
  errors: z.array(z.string()).default([]).openapi({
    example: [],
    description: 'Array of error messages for equations that failed to render (empty if all succeeded)'
  }),
});

export const RenderQueryParamsSchema = z.object({
  display: z.enum(['inline', 'block']).optional().default('block').openapi({
    example: 'block',
    description: 'Display mode: "inline" for inline math (smaller, no line breaks) or "block" for display math (centered, larger)'
  }),
  metadata: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true')
    .openapi({
      example: 'true',
      description: 'Whether to embed metadata in the SVG (accepts "true" or "false" as string)'
    }),
  color: z.string().optional().openapi({
    example: '#000000',
    description: 'CSS color value for the rendered equation when using text/plain input (e.g., #FF0000, blue)'
  }),
});

export type RenderOptions = z.infer<typeof RenderOptionsSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type RenderResponse = z.infer<typeof RenderResponseSchema>;
export type RenderQueryParams = z.infer<typeof RenderQueryParamsSchema>;
