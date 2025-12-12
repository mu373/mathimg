import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { ValidateRequestSchema, ValidateResponseSchema } from '@/schemas';
import { MathJaxRenderer } from '@/lib/renderers/mathjax';

const validate = new OpenAPIHono();

const validateRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Validate'],
  summary: 'Validate LaTeX syntax',
  description: 'Check if LaTeX syntax is valid without rendering. Supports both JSON (`application/json`) with latex field and direct LaTeX as plain text (`text/plain`). You can pipe LaTeX directly: `echo "E=mc^2" | curl -X POST <url> -H "Content-Type: text/plain"`',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ValidateRequestSchema,
        },
        'text/plain': {
          schema: z.string().openapi({
            example: 'E = mc^2',
            description: 'LaTeX equation as plain text',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Validation result',
      content: {
        'application/json': {
          schema: ValidateResponseSchema,
        },
      },
    },
  },
});

validate.openapi(validateRoute, async (c) => {
  const contentType = c.req.header('Content-Type') || 'application/json';

  let latex: string;

  // Handle text/plain input
  if (contentType.includes('text/plain')) {
    latex = await c.req.text();

    if (!latex || latex.trim() === '') {
      return c.json({
        valid: false,
        errors: ['LaTeX content is required'],
      });
    }
  } else {
    // Handle JSON input
    const body = c.req.valid('json') as { latex: string };
    latex = body.latex;
  }

  const renderer = new MathJaxRenderer();
  const result = renderer.validate(latex);

  return c.json({
    valid: result.valid,
    errors: result.errors,
  });
});

export default validate;
