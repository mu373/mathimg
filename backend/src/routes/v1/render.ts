import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RenderRequestSchema, RenderQueryParamsSchema } from '@/schemas';
import { generateSVG } from '@/lib/svg/generator';

const render = new Hono();

render.post(
  '/',
  zValidator('query', RenderQueryParamsSchema),
  async (c) => {
    const contentType = c.req.header('Content-Type') || '';
    const acceptHeader = c.req.header('Accept') || 'image/svg+xml';

    if (contentType.includes('text/plain')) {
      const latex = await c.req.text();
      const { display, engine, metadata, color } = c.req.valid('query');

      if (!latex || latex.trim() === '') {
        return c.json(
          {
            success: false,
            errors: ['LaTeX content is required'],
          },
          400
        );
      }

      const result = generateSVG({
        equations: [
          {
            latex: latex.trim(),
            displayMode: display,
          },
        ],
        options: {
          globalPreamble: '',
          engine,
          embedMetadata: metadata,
          color,
        },
      });

      if (result.errors.length > 0) {
        return c.json(
          {
            success: false,
            errors: result.errors,
          },
          400
        );
      }

      if (acceptHeader.includes('application/json')) {
        return c.json({
          success: true,
          svg: result.svg,
          metadata: result.metadata,
          errors: result.errors,
        });
      }

      return c.body(result.svg, 200, {
        'Content-Type': 'image/svg+xml',
      });
    }

    if (contentType.includes('application/json')) {
      const parseResult = RenderRequestSchema.safeParse(await c.req.json());

      if (!parseResult.success) {
        return c.json(
          {
            success: false,
            errors: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
          },
          400
        );
      }

      const { equations, options } = parseResult.data;

      const result = generateSVG({
        equations,
        options,
      });

      if (result.errors.length > 0 && equations.length === result.errors.length) {
        return c.json(
          {
            success: false,
            errors: result.errors,
          },
          400
        );
      }

      if (acceptHeader.includes('application/json')) {
        return c.json({
          success: true,
          svg: result.svg,
          metadata: result.metadata,
          errors: result.errors,
        });
      }

      return c.body(result.svg, 200, {
        'Content-Type': 'image/svg+xml',
      });
    }

    return c.json(
      {
        success: false,
        error: 'Content-Type must be text/plain or application/json',
      },
      415
    );
  }
);

export default render;
