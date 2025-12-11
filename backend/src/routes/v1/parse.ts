import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ParseRequestSchema } from '@/schemas';
import { parseSVG } from '@/lib/svg/parser';

const parse = new Hono();

parse.post('/', zValidator('json', ParseRequestSchema), async (c) => {
  const { svg } = c.req.valid('json');

  const result = parseSVG(svg);

  return c.json({
    success: result.errors.length === 0,
    hasMetadata: result.hasMetadata,
    metadata: result.metadata,
    equations: result.equations,
    errors: result.errors,
  });
});

export default parse;
