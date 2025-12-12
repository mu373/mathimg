import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const health = new OpenAPIHono();

const HealthResponseSchema = z.object({
  status: z.string().openapi({ example: 'ok' }),
  version: z.string().openapi({ example: '0.1.0' }),
  timestamp: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
});

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Health check endpoint',
  description: 'Returns the API health status, version, and current timestamp',
  responses: {
    200: {
      description: 'Health check response',
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

health.openapi(healthRoute, (c) => {
  return c.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

export default health;
