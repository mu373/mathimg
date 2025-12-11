import { z } from 'zod';

export const EquationSchema = z.object({
  id: z.string().optional(),
  latex: z.string().min(1, 'LaTeX content is required'),
  displayMode: z.enum(['inline', 'block']).default('block'),
  environment: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  preambleOverride: z.string().nullable().optional(),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  customData: z.record(z.unknown()).optional(),
});

export const EquationInputSchema = EquationSchema.omit({ id: true, bbox: true });

export type Equation = z.infer<typeof EquationSchema>;
export type EquationInput = z.infer<typeof EquationInputSchema>;
