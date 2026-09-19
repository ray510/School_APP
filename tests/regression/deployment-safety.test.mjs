import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
function run(script,args=[],environment={}){
  return spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',env:{...process.env,...environment},timeout:10000});
}
test('unknown build environment fails before a build or deployment',()=>{
  const result=run('scripts/build-metadata.mjs',['--check'],{SCHOOL_BUILD_ENV:'mystery'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/SCHOOL_BUILD_ENV/);
});
test('search indexing cannot be enabled for staging',()=>{
  const result=run('scripts/build-metadata.mjs',['--check'],{SCHOOL_BUILD_ENV:'staging',SCHOOL_ALLOW_INDEXING:'true'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/outside production/);
});
test('offline deployment preflight fails closed without account evidence',()=>{
  const result=run('scripts/deployment-preflight.mjs',['--environment','staging','--estimated-writes','0']);
  assert.equal(result.status,1);const report=JSON.parse(result.stdout);
  assert.equal(report.status,'BLOCKED');assert.equal(report.remote_requests,0);assert.equal(report.remote_writes,0);
  assert.ok(report.failures.some(message=>message.includes('quota evidence')));
});
