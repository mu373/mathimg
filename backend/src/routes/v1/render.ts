import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { RenderRequestSchema, RenderResponseSchema, RenderQueryParamsSchema } from '@/schemas';
import { generateSVG } from '@/lib/svg/generator';

const render = new OpenAPIHono();

const ErrorResponseSchema = z.object({
  success: z.literal(false),
  errors: z.array(z.string()).optional(),
  error: z.string().optional(),
});

// Route for JSON request/response
const renderJsonRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Render'],
  summary: 'Render LaTeX to SVG (JSON)',
  description: 'Convert LaTeX equations to SVG with embedded metadata using JSON request/response',
  request: {
    query: RenderQueryParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: RenderRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Successfully rendered SVG',
      content: {
        'application/json': {
          schema: RenderResponseSchema,
        },
        'image/svg+xml': {
          schema: z.string().openapi({
            type: 'string',
            format: 'binary',
          }),
        },
      },
    },
    400: {
      description: 'Invalid request or rendering error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Route for plain text request
const renderTextRoute = createRoute({
  method: 'post',
  path: '/text',
  tags: ['Render'],
  summary: 'Render LaTeX to SVG (Plain Text)',
  description: 'Convert a single LaTeX equation to SVG using plain text request',
  request: {
    query: RenderQueryParamsSchema,
    body: {
      content: {
        'text/plain': {
          schema: z.string().openapi({
            example: 'E = mc^2',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Successfully rendered SVG',
      content: {
        'application/json': {
          schema: RenderResponseSchema,
        },
        'image/svg+xml': {
          schema: z.string().openapi({
            type: 'string',
            format: 'binary',
          }),
        },
      },
    },
    400: {
      description: 'Invalid request or rendering error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

render.openapi(renderJsonRoute, async (c) => {
  const acceptHeader = c.req.header('Accept') || 'image/svg+xml';
  const { equations, options } = c.req.valid('json');

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
});

render.openapi(renderTextRoute, async (c) => {
  const latex = await c.req.text();
  const { display, metadata, color } = c.req.valid('query');
  const acceptHeader = c.req.header('Accept') || 'image/svg+xml';

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
});

export default render;
