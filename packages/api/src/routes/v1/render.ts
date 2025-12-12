import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { RenderRequestSchema, RenderResponseSchema } from '@/schemas';
import { generateSVG, minifySVG } from '@/lib/svg/generator';

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
  summary: 'Render LaTeX to SVG',
  description: 'Convert LaTeX equations to SVG with embedded metadata. Supports both JSON (`application/json`) for multiple equations and plain text (`text/plain`) for single equations. You can pipe text directly: `echo "E=mc^2" | curl -X POST <url> -H "Content-Type: text/plain"`',
  request: {
    query: z.object({
      display: z.enum(['inline', 'block']).optional().default('block').openapi({
        param: {
          name: 'display',
          in: 'query',
          description: 'Display mode: "inline" for inline math (smaller, no line breaks) or "block" for display math (centered, larger)',
        },
        example: 'block',
      }),
      metadata: z
        .enum(['true', 'false'])
        .optional()
        .default('true')
        .transform((val) => val === 'true')
        .openapi({
          param: {
            name: 'metadata',
            in: 'query',
            description: 'Whether to embed metadata in the SVG for round-trip editing',
          },
          example: 'true',
        }),
      color: z.string().optional().openapi({
        param: {
          name: 'color',
          in: 'query',
          description: 'CSS color value for the rendered equation when using text/plain input (e.g., #FF0000, blue)',
        },
        example: '#000000',
      }),
    }),
    body: {
      content: {
        'application/json': {
          schema: RenderRequestSchema,
        },
        'text/plain': {
          schema: z.string().openapi({
            example: 'E = mc^2',
            description: 'Single LaTeX equation as plain text',
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
            example: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="10" y="30">E=mc²</text></svg>',
            description: 'SVG image with embedded LaTeX metadata',
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
  const contentType = c.req.header('Content-Type') || 'application/json';

  let equations: any[];
  let options: any;

  // Handle text/plain input
  if (contentType.includes('text/plain')) {
    const latex = await c.req.text();
    const queryParams = c.req.valid('query');

    if (!latex || latex.trim() === '') {
      return c.json(
        {
          success: false,
          errors: ['LaTeX content is required'],
        },
        400
      );
    }

    equations = [
      {
        latex: latex.trim(),
        displayMode: queryParams.display,
      },
    ];
    options = {
      globalPreamble: '',
      embedMetadata: queryParams.metadata,
      color: queryParams.color,
    };
  } else {
    // Handle JSON input
    const body = c.req.valid('json') as { equations: any[]; options?: any };
    const queryParams = c.req.valid('query');
    equations = body.equations;
    options = body.options || {};

    // Query parameters override JSON body options
    if (queryParams.color) {
      options.color = queryParams.color;
    }
  }

  const hostname = new URL(c.req.url).host;

  const result = generateSVG({
    equations,
    options,
    hostname,
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
      svg: minifySVG(result.svg),
      metadata: result.metadata,
      errors: result.errors,
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  return c.body(result.svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Content-Disposition': `attachment; filename="mathimg-${timestamp}.svg"`,
  });
});

export default render;
