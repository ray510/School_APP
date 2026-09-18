import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { inspectReadiness, publishedChannels } from '../../apps/worker/src/readiness.ts';
// Actual SQLite SQL compatibility tests, NOT Cloudflare D1/workerd integration tests.
const migration = readFileSync(new URL('../../migrations/001_initial_schema.sql', import.meta.url), 'utf8');
function setup(t, apply = true) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (apply) {
    sqlite.exec(migration);
    sqlite.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT); INSERT INTO d1_migrations (name) VALUES ('001_initial_schema.sql')");
  }
  const db = {
    prepare(sql) {
      return {
        async first() { return sqlite.prepare(sql).get() ?? null; },
        async all() { return { success:true, results:sqlite.prepare(sql).all() }; }
      };
    }
  };
  return { sqlite, db };
}
function release(sqlite, id, channel, status='PUBLISHED') {
  sqlite.prepare('INSERT INTO release_manifests (release_id,channel,status,manifest_hash,scope) VALUES (?,?,?,?,?)')
    .run(id,channel,status,`test-hash-${id}`,'canary');
  sqlite.prepare('INSERT INTO release_heads (channel,release_id) VALUES (?,?)').run(channel,id);
}
test('invalid environment is rejected without querying DB', async () => {
  let queried = false;
  const result = await inspectReadiness('invalid', { prepare() { queried=true; throw new Error('not allowed'); } });
  assert.equal(result.status,503); assert.equal(queried,false);
  assert.equal(result.data.environment,'invalid');
});
test('missing binding is not healthy', async () => {
  const result = await inspectReadiness('local', undefined);
  assert.equal(result.status,503); assert.equal(result.data.database,'missing');
});
test('database exceptions do not leak their text', async () => {
  const result = await inspectReadiness('local', {prepare(){throw new Error('sensitive DB detail');}});
  assert.equal(result.status,503);
  assert.equal(result.data.database,'error');
  assert.equal(JSON.stringify(result).includes('sensitive'),false);
});
test('SELECT 1 success without migrations is not ready', async (t) => {
  const { db } = setup(t,false);
  const result = await inspectReadiness('local', db);
  assert.equal(result.status,503); assert.equal(result.data.readiness,'degraded');
  assert.equal(result.data.schema_version,null);
});
test('migrated empty DB is explicitly empty, not published', async (t) => {
  const { db } = setup(t);
  const result = await inspectReadiness('staging',db);
  assert.equal(result.status,200); assert.equal(result.data.environment,'staging');
  assert.equal(result.data.schema_version,'001_initial_schema.sql');
  assert.equal(result.data.readiness,'empty'); assert.equal(result.data.data_status,'empty');
  assert.deepEqual(result.data.public_release_ids,[]);
});
test('draft release with a head is not exposed', async (t) => {
  const { db, sqlite } = setup(t); release(sqlite,'test-draft','directory:PRIMARY','DRAFT');
  assert.deepEqual(await publishedChannels(db),[]);
  assert.equal((await inspectReadiness('local',db)).data.readiness,'empty');
});
test('published single channel is returned with its actual release ID', async (t) => {
  const { db, sqlite } = setup(t); release(sqlite,'test-primary','directory:PRIMARY');
  const result = await inspectReadiness('production',db);
  assert.equal(result.data.environment,'production'); assert.equal(result.data.public_release_id,'test-primary');
  assert.equal(result.data.data_status,'published');
});
test('multiple release heads do not get conflated into one ID', async (t) => {
  const { db, sqlite } = setup(t); release(sqlite,'test-primary','directory:PRIMARY'); release(sqlite,'test-kg','directory:KG');
  const result = await inspectReadiness('local',db);
  assert.equal(result.data.public_release_id,null);
  assert.deepEqual(result.data.public_release_ids,['test-kg','test-primary']);
});
test('cross-channel head mismatch is not exposed', async (t) => {
  const { db, sqlite } = setup(t); release(sqlite,'test-primary','directory:PRIMARY');
  sqlite.exec("UPDATE release_heads SET channel = 'directory:KG'");
  assert.deepEqual(await publishedChannels(db),[]);
});
test('initial migration creates ten core tables and is repeat-safe', (t) => {
  const { sqlite } = setup(t); sqlite.exec(migration);
  const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'd1_migrations'").all();
  assert.equal(rows.length,10);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('fixture replay is idempotent and never creates public heads or admission dates', (t) => {
  const { sqlite } = setup(t);
  const fixture = readFileSync(new URL('../fixtures/local.sql', import.meta.url),'utf8');
  sqlite.exec(fixture); sqlite.exec(fixture);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM school_identities').get().n,3);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM profile_versions').get().n,3);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM release_heads').get().n,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM admission_cycles').get().n,0);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});
