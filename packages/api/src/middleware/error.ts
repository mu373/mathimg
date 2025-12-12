import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof HTTPException) {
      return c.json(
        {
          success: false,
          error: err.message,
          status: err.status,
        },
        err.status
      );
    }

    console.error('Unhandled error:', err);

    return c.json(
      {
        success: false,
        error: 'Internal server error',
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
