import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {assessExistingDatabase,loadMigrations,migrationTables,HOST,OWNER} from '../../scripts/deploy-test-site.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migrationsDir=resolve(root,'migrations');
const files=readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort();
const migrations=loadMigrations(migrationsDir);
const uuid='f80ca4cd-5e0a-4e9c-94ab-e4acdcbfda89';
const buildId='f'.repeat(64);
const expectedName='hk-school-guide-test-'+buildId.slice(0,12);
const manifest={build_id:buildId};
const previous={hostname:HOST,database_id:uuid,database_name:expectedName,build_id:buildId,writes_performed:true};
/** Apply the first `count` real migration files the way wrangler does locally, with its ledger table. */
function openDatabase(count){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for(const name of files.slice(0,count)){db.exec(readFileSync(resolve(migrationsDir,name),'utf8'));db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name);}
  return db;
}
/** Gather evidence exactly as the deploy script does, but from a local SQLite file instead of the D1 HTTP API. */
function evidence(db,overrides={}){
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
  const ledger=tables.includes('d1_migrations')?db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(row=>row.name):[];
  const ownership=tables.includes('test_site_builds')?db.prepare('SELECT owner,hostname,ready,build_id FROM test_site_builds').all():null;
  const counts={};for(const table of migrations.slice(0,ledger.length).flatMap(m=>m.tables).filter(t=>tables.includes(t)))counts[table]=db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return {expectedName,database:{name:expectedName,uuid},tables,ledger,migrations,counts,ownership,previous,resumeDatabaseId:uuid,manifest,...overrides};
}
test('migration table discovery matches the real migration files',()=>{
  assert.deepEqual(migrationTables('CREATE TABLE a(x); CREATE TABLE IF NOT EXISTS b_2(y); CREATE INDEX i ON a(x);'),['a','b_2']);
  assert.ok(migrations[0].tables.includes('release_heads'));assert.ok(migrations.find(m=>m.name.startsWith('002')).tables.includes('publication_commands'));
});
test('interrupted after 001 only: consistent evidence resumes the remaining migrations without any import yet',()=>{
  const db=openDatabase(1);
  const decision=assessExistingDatabase(evidence(db));
  assert.equal(decision.action,'import');assert.deepEqual(decision.remaining,files.slice(1));
  db.close();
});
test('a missing ownership table is not permission: resume needs the operator database ID and the previous result',()=>{
  const db=openDatabase(1);
  assert.equal(assessExistingDatabase(evidence(db,{resumeDatabaseId:undefined})).action,'stop');
  assert.equal(assessExistingDatabase(evidence(db,{resumeDatabaseId:'00000000-0000-0000-0000-000000000009'})).action,'stop');
  assert.equal(assessExistingDatabase(evidence(db,{previous:null})).action,'stop');
  assert.equal(assessExistingDatabase(evidence(db,{previous:{...previous,build_id:'0'.repeat(64)}})).action,'stop');
  assert.equal(assessExistingDatabase(evidence(db,{previous:{...previous,writes_performed:false}})).action,'stop');
  assert.equal(assessExistingDatabase(evidence(db,{database:{name:'hk-school-guide-test-other',uuid}})).action,'stop');
  db.close();
});
test('unknown ledger entries, foreign tables or existing rows stop the run instead of being adopted',()=>{
  const ledgerDb=openDatabase(1);ledgerDb.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run('999_not_in_repository.sql');
  assert.match(assessExistingDatabase(evidence(ledgerDb)).reason,/not a prefix/);ledgerDb.close();
  const foreignDb=openDatabase(1);foreignDb.exec('CREATE TABLE somebody_elses_table(x)');
  assert.match(assessExistingDatabase(evidence(foreignDb)).reason,/outside the applied migrations/);foreignDb.close();
  const partialDb=openDatabase(1);partialDb.exec("INSERT INTO school_identities(school_id) VALUES('sch_partial')");
  assert.match(assessExistingDatabase(evidence(partialDb)).reason,/already holds rows/);partialDb.close();
  const brokenDb=openDatabase(1);brokenDb.exec('DROP TABLE audit_events');
  assert.match(assessExistingDatabase(evidence(brokenDb)).reason,/do not exist/);brokenDb.close();
});
test('an ownership record decides import versus skip, and a foreign owner stops',()=>{
  const db=openDatabase(files.length);
  db.exec('CREATE TABLE IF NOT EXISTS test_site_builds(build_id TEXT PRIMARY KEY,owner TEXT NOT NULL,hostname TEXT NOT NULL,ready INTEGER NOT NULL DEFAULT 0,manifest_json TEXT NOT NULL)');
  db.prepare('INSERT INTO test_site_builds VALUES(?,?,?,?,?)').run(buildId,OWNER,HOST,0,'{}');
  assert.equal(assessExistingDatabase(evidence(db,{resumeDatabaseId:undefined,previous:null})).action,'import');
  db.exec('UPDATE test_site_builds SET ready=1');
  assert.equal(assessExistingDatabase(evidence(db,{resumeDatabaseId:undefined,previous:null})).action,'skip_import');
  db.exec("UPDATE test_site_builds SET owner='someone/else'");
  assert.equal(assessExistingDatabase(evidence(db)).action,'stop');
  db.close();
});
