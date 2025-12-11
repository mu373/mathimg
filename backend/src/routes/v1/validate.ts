import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ValidateRequestSchema } from '@/schemas';
import { KaTeXRenderer } from '@/lib/renderers/katex';

const validate = new Hono();

validate.post('/', zValidator('json', ValidateRequestSchema), async (c) => {
  const { latex, engine } = c.req.valid('json');

  if (engine === 'mathjax') {
    return c.json(
      {
        valid: false,
        errors: ['MathJax engine not yet implemented'],
      },
      501
    );
  }

  const renderer = new KaTeXRenderer();
  const result = renderer.validate(latex);

  return c.json({
    valid: result.valid,
    errors: result.errors,
  });
});

export default validate;
