import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function validateLocalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Smoke tests accept only a loopback HTTP origin; no remote requests permitted');
  }
  return url;
}
async function main() {
  const { values } = parseArgs({options:{'base-url':{type:'string',default:'http://127.0.0.1:8787'},'expect-published':{type:'boolean',default:false}}});
  const origin = validateLocalUrl(values['base-url']);
  async function get(path, headers = {}) {
    return fetch(new URL(path, origin), { headers, signal: AbortSignal.timeout(10000), redirect: 'error' });
  }
  const health = await get('/api/v1/health');
  assert.equal(health.status, 200, 'Local DB/schema is not ready');
  const body = await health.json();
  assert.equal(body.data.environment, 'local');
  assert.equal(body.data.database, 'ok');
  assert.ok(body.data.schema_version);
  assert.ok(['ok','empty'].includes(body.data.readiness));
  for (const path of ['/api', '/api/', '/api/not-a-real-endpoint']) {
    for (const headers of [{Accept:'application/json'}, {Accept:'text/html','Sec-Fetch-Mode':'navigate'}]) {
      const response = await get(path, headers);
      assert.equal(response.status,404,path);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
      assert.ok((await response.json()).meta.request_id);
    }
  }
  const manifestResponse = await get('/api/v1/manifest');
  assert.equal(manifestResponse.status,200);
  const manifest = await manifestResponse.json();
  assert.ok(Array.isArray(manifest.data.channels));
  if (values['expect-published']) assert.ok(manifest.data.channels.length > 0, 'No published data');
  for (const path of ['/', '/schools/not-a-real-route']) {
    const response = await get(path,{Accept:'text/html','Sec-Fetch-Mode':'navigate'});
    assert.equal(response.status,200,path);
    assert.match(response.headers.get('content-type') ?? '',/text\/html/);
    assert.match(await response.text(),/id="app"/);
  }
  console.log(JSON.stringify({status:'PASS',environment:'local',checks:10,data_status:body.data.data_status}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Smoke test failed'); process.exitCode=1; });
}
