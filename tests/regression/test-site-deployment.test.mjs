import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetCheck,configuration,checkPackage,HOST,WORKER} from '../../scripts/deploy-test-site.mjs';
test('test deployment cannot bind main site, test data or schedules',()=>{const c=configuration('/tmp/example','a'.repeat(32),'12345678-1234-1234-1234-123456789abc');assert.equal(c.name,WORKER);assert.deepEqual(c.routes,[{pattern:HOST,custom_domain:true,zone_name:'finpulsx.win'}]);assert.equal(c.vars.APP_ENV,'staging');assert.equal(c.vars.ALLOW_TEST_DATA,'false');assert.equal(c.workers_dev,false);assert.deepEqual(c.triggers.crons,[]);});
test('account-wide daily budget fails closed',()=>{assert.throws(()=>budgetCheck({rows_read:0,rows_written:40000},70000));assert.throws(()=>budgetCheck({rows_read:0},100));assert.throws(()=>budgetCheck({rows_read:4800000,rows_written:0},100));budgetCheck({rows_read:1000,rows_written:1000},70000);});
test('malformed or production packages are rejected',()=>{assert.throws(()=>checkPackage({environment:'production'}));assert.throws(()=>configuration('/tmp','not-an-account','bad-uuid'));});
test('import rows written are read from the provider JSON after progress lines, never fabricated',async()=>{
  const {importRowsWritten}=await import('../../scripts/deploy-test-site.mjs');
  const output='├ Checking if file needs uploading\n│ 🌀 Uploading complete.\n[{"results":[{"Rows written":49588}],"success":true,"meta":{"rows_read":6632,"rows_written":49588}}]';
  assert.equal(importRowsWritten(output),49588);
  assert.equal(importRowsWritten('not json'),null);assert.equal(importRowsWritten('[{"success":false,"meta":{"rows_written":5}}]'),null);assert.equal(importRowsWritten('[]'),null);
});
