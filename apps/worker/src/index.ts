import { Hono } from 'hono';
import api from './api';
import { isApiPath, type HonoEnvironment } from './env';
import { readEnvironment } from './readiness';
const app = new Hono<HonoEnvironment>();
app.use('*', async (c, next) => {
  c.set('request_id', crypto.randomUUID());
  c.set('environment', readEnvironment(c.env?.APP_ENV));
  c.header('X-Request-ID', c.get('request_id'));
  if (isApiPath(c.req.path)) c.header('Cache-Control', 'no-store');
  await next();
});
app.route('/api', api);
app.all('*', async (c) => {
  if (isApiPath(new URL(c.req.url).pathname)) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found' }, meta: { request_id: c.get('request_id') } }, 404);
  }
  if (!c.env?.ASSETS) return c.text('Static assets are not built or bound', 503);
  return c.env.ASSETS.fetch(c.req.raw);
});
app.onError((_error, c) => {
  if (isApiPath(c.req.path)) {
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Request could not be completed' }, meta: { request_id: c.get('request_id') } }, 500);
  }
  return c.text('Request could not be completed', 500);
});
export default app;
