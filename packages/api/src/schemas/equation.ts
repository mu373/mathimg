import { z } from 'zod';

export const EquationSchema = z.object({
  id: z.string().optional().openapi({
    description: 'Unique identifier for the equation (auto-generated if not provided)'
  }),
  latex: z.string().min(1, 'LaTeX content is required').openapi({
    example: 'E = mc^2',
    description: 'LaTeX equation source code (e.g., "E = mc^2", "\\frac{a}{b}", "\\int_0^\\infty e^{-x} dx")'
  }),
  displayMode: z.enum(['inline', 'block']).default('block').openapi({
    example: 'block',
    description: 'Display mode: "inline" for inline math or "block" for display/centered math'
  }),
  environment: z.string().nullable().optional().openapi({
    example: 'equation',
    description: 'LaTeX environment name (e.g., "equation", "align", "cases") - optional'
  }),
  label: z.string().nullable().optional().openapi({
    example: 'eq:einstein',
    description: 'Label for referencing the equation (e.g., "eq:einstein") - optional'
  }),
  preambleOverride: z.string().nullable().optional().openapi({
    example: '\\newcommand{\\R}{\\mathbb{R}}',
    description: 'Custom LaTeX preamble for this specific equation (overrides global preamble) - optional'
  }),
  bbox: z
    .object({
      x: z.number().openapi({ description: 'X position in the SVG canvas' }),
      y: z.number().openapi({ description: 'Y position in the SVG canvas' }),
      width: z.number().openapi({ description: 'Width of the equation in pixels' }),
      height: z.number().openapi({ description: 'Height of the equation in pixels' }),
    })
    .optional().openapi({
      description: 'Bounding box coordinates and dimensions (auto-calculated during rendering)'
    }),
  customData: z.record(z.unknown()).optional().openapi({
    example: { source: 'textbook', page: 42 },
    description: 'Custom metadata fields for application-specific data - optional'
  }),
});

export const EquationInputSchema = EquationSchema.omit({ id: true, bbox: true });

export type Equation = z.infer<typeof EquationSchema>;
export type EquationInput = z.infer<typeof EquationInputSchema>;
