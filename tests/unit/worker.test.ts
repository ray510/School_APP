import { describe, expect, it } from 'vitest';
import app from '../../apps/worker/src/index';
import type { HonoEnvironment } from '../../apps/worker/src/env';
import { HealthResponseSchema } from '@hk-school/contracts';
function bindings(options: { broken?: boolean; missing?: boolean; environment?: string } = {}): HonoEnvironment['Bindings'] {
  const db = options.missing ? undefined : {
    prepare(sql: string) {
      if (options.broken) throw new Error('private database details');
      return {
        async first() { return sql.includes('d1_migrations') ? {name:'001_initial_schema.sql'} : {ok:1}; },
        async all() { return {success:true,results:[]}; }
      };
    }
  };
  return {
    APP_ENV:options.environment ?? 'local', DB:db,
    ASSETS:{fetch:async () => new Response('<html><div id="app"></div></html>',{headers:{'Content-Type':'text/html'}})}
  } as unknown as HonoEnvironment['Bindings'];
}
describe('Hono routing (Node stubs, not workerd)', () => {
  for (const path of ['/api','/api/','/api/not-a-real-endpoint']) {
    for (const accept of ['application/json','text/html']) {
      it(`${path} is JSON 404 with Accept ${accept} even when DB is broken`, async () => {
        const response = await app.request(path,{headers:{Accept:accept,'Sec-Fetch-Mode':'navigate'}},bindings({broken:true}));
        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect((await response.json()).meta.request_id).toBeTruthy();
      });
    }
  }
  it('health uses direct bindings, real environment, and the response contract', async () => {
    const response = await app.request('/api/v1/health',{},bindings({environment:'staging'}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(HealthResponseSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.environment).toBe('staging');
    expect(body.data.readiness).toBe('empty');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('missing DB is not reported as ready', async () => {
    const response = await app.request('/api/v1/health',{},bindings({missing:true}));
    expect(response.status).toBe(503);
    expect((await response.json()).data.database).toBe('missing');
  });
  it('manifest fails closed and does not leak SQL error details', async () => {
    const response = await app.request('/api/v1/manifest',{},bindings({broken:true}));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database details');
  });
  it('only non-API requests use the asset binding', async () => {
    const response = await app.request('/example',{},bindings());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});
