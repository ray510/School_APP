import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migrationsDir=resolve(root,'migrations');
const files=readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort();
const sources=Object.fromEntries(files.map(name=>[name,readFileSync(resolve(migrationsDir,name),'utf8')]));
function triggerBodies(sql){return [...sql.matchAll(/CREATE TRIGGER[\s\S]*?\bBEGIN\b([\s\S]*?)\nEND;/g)].map(match=>match[1]);}
test('remote D1 statement splitter constraints: LF only, uppercase BEGIN, no CASE...END inside trigger bodies',()=>{
  for(const [name,sql] of Object.entries(sources)){
    assert.ok(!sql.includes('\r'),name+' must use LF line endings');
    for(const match of sql.matchAll(/CREATE TRIGGER[\s\S]*?\b(begin)\b/gi))assert.equal(match[1],'BEGIN',name+' trigger must open with uppercase BEGIN (the D1 /query splitter matches BEGIN case-sensitively)');
    for(const body of triggerBodies(sql))assert.ok(!/\bCASE\b/i.test(body),name+' trigger body must not contain CASE...END (the D1 /query splitter ends the trigger at the first END)');
  }
  assert.ok(files.length>=4);
});
function database(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const name of files)db.exec(sources[name]);
  return db;
}
function approvedRelease(db,{id,channel,scope='partial',items=1,manifestHash=id+'-hash'}){
  db.prepare("INSERT INTO release_manifests(release_id,channel,status,scope,item_count,manifest_hash) VALUES(?,?,'APPROVED',?,?,?)").run(id,channel,scope,items,manifestHash);
  db.prepare("INSERT INTO review_decisions(decision_id,release_id,subject_hash,decision,actor_id,evidence_json,created_at) VALUES(?,?,?,'APPROVED','test','{}','2026-01-01T00:00:00Z')").run('dec_'+id,id,manifestHash);
}
function schoolRows(db,releaseId,count){
  db.prepare("INSERT OR IGNORE INTO school_identities(school_id) VALUES('sch_1')").run();
  for(let index=0;index<count;index++){
    const version='pv_'+releaseId+'_'+index;
    db.prepare("INSERT INTO profile_versions(profile_version_id,school_id,campus_id,session_code,level,item_key,semantic_hash,content_json,source_snapshot_ids) VALUES(?,'sch_1',NULL,'UNKNOWN','PRIMARY',?,?,'{}','[]')").run(version,'item_'+releaseId+'_'+index,version);
    db.prepare("INSERT INTO school_search(release_id,item_key,profile_version_id,school_id,level,normalized_name,district,funding,is_test) VALUES(?,?,?,'sch_1','PRIMARY','x',NULL,NULL,0)").run(releaseId,'item_'+releaseId+'_'+index,version);
  }
}
/** Same shape as tools/cli/src/pipeline.ts publicationSql: a deterministic command ID guarded by WHERE NOT EXISTS. */
function publish(db,{command,channel,id,revision,previous=null,operation='publish'}){
  return db.prepare("INSERT INTO publication_commands(command_id,operation,channel,release_id,expected_revision,expected_previous_release_id,actor_id,created_at) SELECT ?,?,?,?,?,?,'test','2026-01-01T00:00:00Z' WHERE NOT EXISTS(SELECT 1 FROM publication_commands WHERE command_id=?)").run(command,operation,channel,id,revision,previous,command);
}
test('re-running the same publication command does not republish, bump the head or duplicate audit',()=>{
  const db=database();approvedRelease(db,{id:'rel_a',channel:'profiles:PRIMARY',items:2});schoolRows(db,'rel_a',2);
  publish(db,{command:'cmd_a',channel:'profiles:PRIMARY',id:'rel_a',revision:0});
  publish(db,{command:'cmd_a',channel:'profiles:PRIMARY',id:'rel_a',revision:0});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM publication_commands').get().n,1);
  const head=db.prepare('SELECT release_id,revision FROM release_heads').get();
  assert.equal(head.release_id,'rel_a');assert.equal(head.revision,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n,1);
  assert.equal(db.prepare("SELECT status FROM release_manifests WHERE release_id='rel_a'").get().status,'PUBLISHED');
  assert.throws(()=>publish(db,{command:'cmd_b',channel:'profiles:PRIMARY',id:'rel_a',revision:0}),/RELEASE_NOT_APPROVED/);
  db.exec("UPDATE release_manifests SET status='APPROVED' WHERE release_id='rel_a'");
  assert.throws(()=>publish(db,{command:'cmd_c',channel:'profiles:PRIMARY',id:'rel_a',revision:0}),/RELEASE_CONFLICT/);
  assert.equal(db.prepare('SELECT revision FROM release_heads').get().revision,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n,1);
  db.close();
});
test('every rewritten guard still aborts: approval, conflict, scope shrink, count mismatch, annual count and identity',()=>{
  const db=database();
  db.prepare("INSERT INTO release_manifests(release_id,channel,status,scope,item_count,manifest_hash) VALUES('rel_draft','profiles:PRIMARY','READY_FOR_REVIEW','partial',1,'h')").run();
  assert.throws(()=>publish(db,{command:'c1',channel:'profiles:PRIMARY',id:'rel_draft',revision:0}),/RELEASE_NOT_APPROVED/);
  approvedRelease(db,{id:'rel_full',channel:'profiles:PRIMARY',scope:'full',items:1});schoolRows(db,'rel_full',1);
  assert.throws(()=>publish(db,{command:'c2',channel:'profiles:PRIMARY',id:'rel_full',revision:5}),/RELEASE_CONFLICT/);
  approvedRelease(db,{id:'rel_short',channel:'profiles:PRIMARY',items:3});schoolRows(db,'rel_short',2);
  assert.throws(()=>publish(db,{command:'c3',channel:'profiles:PRIMARY',id:'rel_short',revision:0}),/RELEASE_COUNT_MISMATCH/);
  publish(db,{command:'c4',channel:'profiles:PRIMARY',id:'rel_full',revision:0});
  approvedRelease(db,{id:'rel_partial',channel:'profiles:PRIMARY',scope:'partial',items:1});schoolRows(db,'rel_partial',1);
  assert.throws(()=>publish(db,{command:'c5',channel:'profiles:PRIMARY',id:'rel_partial',revision:1,previous:'rel_full'}),/SCOPE_SHRINK_BLOCKED/);
  approvedRelease(db,{id:'rel_annual',channel:'annual:PRIMARY:2025',items:1});
  assert.throws(()=>publish(db,{command:'c6',channel:'annual:PRIMARY:2025',id:'rel_annual',revision:0}),/ANNUAL_COUNT_MISMATCH/);
  db.prepare("INSERT INTO sources(source_id,catalog_url,publisher,contract_status,enabled) VALUES('chsc-primary-profiles','https://example.invalid','x','LIVE_VERIFIED',1)").run();
  db.prepare("INSERT INTO school_identities(school_id) VALUES('sch_annual')").run();
  db.prepare("INSERT INTO annual_profile_versions(annual_profile_id,school_id,source_id,source_record_key,record_hash,level,profile_edition,is_test,identity_verified,content_json) VALUES('ap_1','sch_annual','chsc-primary-profiles','k','h','PRIMARY','2025',0,0,'{}')").run();
  db.prepare("INSERT INTO annual_release_items(release_id,annual_profile_id) VALUES('rel_annual','ap_1')").run();
  assert.throws(()=>publish(db,{command:'c7',channel:'annual:PRIMARY:2025',id:'rel_annual',revision:0}),/ANNUAL_IDENTITY_NOT_VERIFIED/);
  db.prepare("UPDATE annual_profile_versions SET identity_verified=1").run();
  publish(db,{command:'c8',channel:'annual:PRIMARY:2025',id:'rel_annual',revision:0});
  assert.equal(db.prepare("SELECT revision FROM release_heads WHERE channel='annual:PRIMARY:2025'").get().revision,1);
  db.close();
});
