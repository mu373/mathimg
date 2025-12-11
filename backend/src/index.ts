import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error';
import v1 from './routes/v1';

const app = new Hono();

app.use('*', logger());
app.use('*', corsMiddleware);
app.use('*', errorHandler);

app.get('/', (c) => {
  return c.json({
    name: 'LaTeX to SVG API',
    version: '0.1.0',
    description: 'API for converting LaTeX math equations to SVG with embedded metadata',
    endpoints: {
      health: '/api/v1/health',
      render: 'POST /api/v1/render',
      parse: 'POST /api/v1/parse',
      validate: 'POST /api/v1/validate',
    },
    documentation: '/api/v1/docs',
  });
});

app.route('/api/v1', v1);

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
