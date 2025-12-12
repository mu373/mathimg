import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { ValidateRequestSchema, ValidateResponseSchema } from '@/schemas';
import { MathJaxRenderer } from '@/lib/renderers/mathjax';

const validate = new OpenAPIHono();

const validateRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Validate'],
  summary: 'Validate LaTeX syntax',
  description: 'Check if LaTeX syntax is valid without rendering',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ValidateRequestSchema,
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
  const { latex } = c.req.valid('json');

  const renderer = new MathJaxRenderer();
  const result = renderer.validate(latex);

  return c.json({
    valid: result.valid,
    errors: result.errors,
  });
});

export default validate;
