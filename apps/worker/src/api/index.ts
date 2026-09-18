import { Hono } from 'hono';
import type { HonoEnvironment } from '../env';
import { inspectReadiness, publishedChannels } from '../readiness';
const api = new Hono<HonoEnvironment>();
api.get('/v1/health', async (c) => {
  const result = await inspectReadiness(c.env?.APP_ENV, c.env?.DB);
  return c.json({ data: result.data, meta: { request_id: c.get('request_id'), environment: result.data.environment } }, result.status);
});
api.get('/v1/manifest', async (c) => {
  if (c.get('environment') === 'invalid' || !c.env?.DB) {
    return c.json({ error: { code: 'NOT_READY', message: 'Environment or database is unavailable' }, meta: { request_id: c.get('request_id') } }, 503);
  }
  try {
    const channels = await publishedChannels(c.env.DB);
    return c.json({ data: { channels }, meta: { request_id: c.get('request_id'), environment: c.get('environment') } });
  } catch {
    return c.json({ error: { code: 'NOT_READY', message: 'Published data could not be read' }, meta: { request_id: c.get('request_id') } }, 503);
  }
});
api.all('*', (c) => c.json({
  error: { code: 'NOT_FOUND', message: 'API endpoint not found' },
  meta: { request_id: c.get('request_id') }
}, 404));
export default api;
