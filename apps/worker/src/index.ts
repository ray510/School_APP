import { Hono } from 'hono';
import { HealthResponse, HealthResponseSchema } from '@hk-school/contracts';
import api from './api';

interface Env {
  Bindings: {
    DB: D1Database;
    ASSETS: any;
  };
  Variables: {
    request_id: string;
    environment: string;
  };
}

const app = new Hono<Env>();

// Middleware: Add request ID and environment
app.use(async (c, next) => {
  c.set('request_id', crypto.randomUUID());
  c.set('environment', c.env.Bindings.DB ? 'unknown' : 'error');
  await next();
});

// Mount API routes
app.route('/api', api);

// Static assets fallback - only for non-API paths
app.all('*', async (c) => {
  const { pathname } = new URL(c.req.url);

  // If it's an API path and we got here, it's a 404
  if (pathname.startsWith('/api/')) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'API endpoint not found'
        },
        meta: {
          request_id: c.get('request_id')
        }
      },
      { status: 404 }
    );
  }

  // Serve static assets
  return c.env.Bindings.ASSETS.fetch(c.req.raw);
});

export default app;
