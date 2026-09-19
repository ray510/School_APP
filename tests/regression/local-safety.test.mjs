import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLocalConfig, localArguments } from '../../scripts/local.mjs';
import { validateLocalUrl } from '../../scripts/smoke-local.mjs';
function config() { return {env:{local:{vars:{APP_ENV:'local',ALLOW_TEST_DATA:'true',ENABLE_ADMIN_WRITE:'false',ENABLE_SOURCE_PROBE:'false'},d1_databases:[{binding:'DB',database_id:'00000000-0000-0000-0000-000000000001'}],triggers:{crons:[]}}},triggers:{crons:[]}}; }
test('local configuration accepted without remote access',()=> assert.doesNotThrow(()=>checkLocalConfig(config())));
test('non-local DB ID is rejected',()=>{const c=config();c.env.local.d1_databases[0].database_id='real-db';assert.throws(()=>checkLocalConfig(c));});
test('remote binding is rejected',()=>{const c=config();c.env.local.d1_databases[0].remote=true;assert.throws(()=>checkLocalConfig(c));});
test('scheduled ingestion is rejected',()=>{const c=config();c.triggers.crons=['* * * * *'];assert.throws(()=>checkLocalConfig(c));});
test('database operations are always explicitly local',()=>{for(const operation of ['migrate','fixture']) {const args=localArguments(operation);assert.ok(args.includes('--local'));assert.equal(args.includes('--remote'),false);assert.ok(args.includes('--persist-to'));}});
test('build can only be dry-run and rejects arbitrary operations',()=>{assert.ok(localArguments('build').includes('--dry-run'));assert.throws(()=>localArguments('deploy'));});
test('smoke accepts only loopback HTTP origins',()=>{assert.doesNotThrow(()=>validateLocalUrl('http://127.0.0.1:8787'));for(const url of ['https://example.com','http://localhost.example.com','http://127.0.0.1:8787/path','http://user@localhost:8787','http://localhost:8787/?x=1']) assert.throws(()=>validateLocalUrl(url));});
