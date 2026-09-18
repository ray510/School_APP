import { Hono } from 'hono';

interface Env {
  Bindings: {
    DB: D1Database;
  };
  Variables: {
    request_id: string;
    environment: string;
  };
}

const api = new Hono<Env>();

// GET /api/v1/health
api.get('/v1/health', async (c) => {
  const env = c.env.Bindings.DB ? 'local' : 'unknown';
  const timestamp = new Date().toISOString();

  return c.json({
    data: {
      environment: env,
      schema_version: '1.0.0',
      readiness: 'ok',
      public_release_id: null,
      timestamp
    },
    meta: {
      request_id: c.get('request_id'),
      environment: env
    }
  });
});

// GET /api/v1/manifest
api.get('/v1/manifest', async (c) => {
  return c.json({
    data: {
      channels: []
    },
    meta: {
      request_id: c.get('request_id'),
      environment: 'local'
    }
  });
});

// Catch-all for unmapped /api/* routes
api.all('*', (c) => {
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
});

export default api;
