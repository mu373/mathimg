import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { logger } from 'hono/logger';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error';
import v1 from './routes/v1';

const app = new OpenAPIHono();

app.use('*', logger());
app.use('*', corsMiddleware);
app.use('*', errorHandler);

app.get('/', (c) => {
  return c.json({
    name: 'MathImg',
    version: '0.1.0',
    description: 'API for converting LaTeX math equations to SVG images with embedded metadata',
    endpoints: {
      health: '/api/v1/health',
      render: 'POST /api/v1/render',
      parse: 'POST /api/v1/parse',
      validate: 'POST /api/v1/validate',
    },
    documentation: '/api/v1/docs',
    openapi: '/api/v1/openapi.json',
  });
});

app.route('/api/v1', v1);

// Redirect /api/ to docs
app.get('/api/', (c) => c.redirect('/api/v1/docs'));

// OpenAPI JSON spec with dynamic server URL
app.doc('/api/v1/openapi.json', (c) => {
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  return {
    openapi: '3.1.0',
    info: {
      title: 'MathImg API',
      version: '0.1.0',
      description: 'Convert LaTeX math equations to SVG images with embedded metadata for round-trip editing',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Current server',
      },
    ],
  };
});

// Swagger UI
app.get('/api/v1/docs', swaggerUI({ url: '/api/v1/openapi.json' }));

app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Not found',
      path: c.req.path,
    },
    404
  );
});

export default app;
