/** Build a real-data staging package. No network or remote writes; no invented annual identity approval. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Profile,SafeUrl,type SchoolProfile} from '../packages/contracts/src/domain';
import {generateSchoolId,generateItemKey} from '../packages/contracts/src/identity';
import {parseEDBDirectory} from '../tools/cli/src/parsers/csv-parser';
import {parseAnnual} from '../tools/cli/src/annual';
import {hash,quote as q,publicationSql,S01} from '../tools/cli/src/pipeline';
const ROOT=process.cwd();
const OUT=resolve(ROOT,'artifacts/test-site');
const DIST=resolve(ROOT,'apps/web/dist');
const HOST='schools-test.finpulsx.win';
const levels=['KG','PRIMARY','SECONDARY'] as const;
const categories:Record<string,typeof levels[number]>={
  'Aided Primary Schools':'PRIMARY','Aided Secondary Schools':'SECONDARY','Caput Secondary Schools':'SECONDARY',
  'Direct Subsidy Scheme Primary Schools':'PRIMARY','Direct Subsidy Scheme Secondary Schools':'SECONDARY',
  'English Schools Foundation (Primary)':'PRIMARY','English Schools Foundation (Secondary)':'SECONDARY',
  'Government Primary Schools':'PRIMARY','Government Secondary Schools':'SECONDARY',
  'International Schools (Primary)':'PRIMARY','International Schools (Secondary)':'SECONDARY',
  'Kindergartens':'KG','Kindergarten-cum-child Care Centres':'KG','Private Primary Schools':'PRIMARY',
  'Private Secondary Schools (Day/Evening)':'SECONDARY'
};
function save(path:string,value:unknown){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
function sha(bytes:Buffer|string){return createHash('sha256').update(bytes).digest('hex');}
const sourceReport=JSON.parse(readFileSync(resolve(ROOT,'artifacts/source-probe.json'),'utf8')) as {sources:Array<{source_id:string;status:string;archive:string;raw_sha256:string;fetched_at:string}>};
const baseline=sourceReport.sources.find(s=>s.source_id==='edb-school-directory'&&s.status==='LIVE_VERIFIED');
if(!baseline)throw new Error('No verified baseline snapshot');
const raw=readFileSync(resolve(baseline.archive,'raw.csv'));
if(sha(raw)!==baseline.raw_sha256)throw new Error('Raw baseline hash mismatch');
const parsed=parseEDBDirectory(raw);
if(parsed.missingFields.length||parsed.issues.warnings.length||parsed.rows.length<100)throw new Error('Baseline source contract failed');
const counts=new Map<string,number>();
for(const row of parsed.rows)counts.set(row['SCHOOL NO.'],(counts.get(row['SCHOOL NO.'])??0)+1);
const profiles:SchoolProfile[]=[];
const exclusions:Array<{source_record_key:string;reason:string}>=[];
for(const row of parsed.rows){
  const key=row['SCHOOL NO.'];const category=row['ENGLISH CATEGORY'];
  const level=Object.hasOwn(categories,category)?categories[category]:undefined;
  if(!level||!key||counts.get(key)!==1){exclusions.push({source_record_key:key,reason:!level?'outside-reviewed-mainstream-category':'ambiguous-or-missing-source-key'});continue;}
  const id=generateSchoolId('edb-school-directory',key);const website=SafeUrl.safeParse(row.WEBSITE);
  const item=Profile.safeParse({school_id:id,item_key:generateItemKey(id,'UNKNOWN',null),school_no:key,level,
    chinese_name:row['中文名稱'],english_name:row['ENGLISH NAME'],chinese_address:row['中文地址'],english_address:row['ENGLISH ADDRESS'],
    district:row['分區']||row.DISTRICT||null,funding:row['資助種類']||row['FINANCE TYPE']||null,category,session:'UNKNOWN',campus_id:null,
    website:website.success?website.data:null,telephone:row.TELEPHONE||null,
    fee:{amount_cents:null,state:'not_provided',reference_period:null},profile_edition:null,source_reference_period:null,
    source_url:S01,source_id:'edb-school-directory',snapshot_id:'s01_'+baseline.raw_sha256.slice(0,32),fetched_at:baseline.fetched_at,is_test:false});
  if(!item.success){exclusions.push({source_record_key:key,reason:'schema-validation-failed'});continue;}profiles.push(item.data);
}
if(new Set(profiles.map(p=>p.item_key)).size!==profiles.length||levels.some(level=>!profiles.some(p=>p.level===level)))throw new Error('Identity or coverage failure');
profiles.sort((a,b)=>a.item_key.localeCompare(b.item_key));
const inspected=JSON.parse(readFileSync(resolve(ROOT,'artifacts/annual-source-contracts.json'),'utf8'));
const annualReports:Array<Record<string,unknown>>=Array.isArray(inspected)?inspected:inspected.sources??inspected.results??[];
const referenceSources:Array<{id:string;level:string;edition:string;source_url:string;raw_sha256:string;fetched_at:string;rows:number;columns:number}>=[];
for(const source of ['edb-kg-profiles','chsc-primary-profiles','chsc-secondary-profiles']){
  const metadata=annualReports.find(row=>row.source_id===source);
  if(!metadata||typeof metadata.sha256!=='string'||typeof metadata.fetched_url!=='string'||typeof metadata.catalogue_label!=='string'||typeof metadata.fetched_at!=='string')throw new Error('Annual metadata incomplete: '+source);
  const path=resolve(ROOT,'archive',source,metadata.sha256,'raw.csv');const bytes=readFileSync(path);
  if(sha(bytes)!==metadata.sha256)throw new Error('Annual raw hash mismatch');
  const annual=parseAnnual(bytes,source);
  if(annual.records.length!==metadata.row_count)throw new Error('Independent annual row counts differ');
  const entry={id:source,level:annual.level,edition:metadata.catalogue_label,source_url:metadata.fetched_url,raw_sha256:metadata.sha256,fetched_at:metadata.fetched_at,rows:annual.records.length,columns:annual.headers.length};
  referenceSources.push(entry);
  const index=annual.records.map(record=>({id:record.record_hash,name:record.name,address:record.address,source_record_key:record.source_record_key}));
  save(resolve(DIST,'source-reference',source,'index.json'),{source:entry,records:index});
  for(const record of annual.records)save(resolve(DIST,'source-reference',source,record.record_hash+'.json'),{
    source:entry,record_hash:record.record_hash,source_record_key:record.source_record_key,name:record.name,address:record.address,
    identity_link_status:'UNLINKED_SOURCE_RECORD',fields:record.fields
  });
}
const subject={hostname:HOST,baseline_raw_sha256:baseline.raw_sha256,profiles,annual:referenceSources,exclusions};
const buildId=hash(subject);const actor='automated-source-qa:staging-only';const timestamp=new Date().toISOString();
const statements:string[]=[];
statements.push(`CREATE TABLE IF NOT EXISTS test_site_builds(build_id TEXT PRIMARY KEY,owner TEXT NOT NULL,hostname TEXT NOT NULL,ready INTEGER NOT NULL DEFAULT 0,manifest_json TEXT NOT NULL);`);
statements.push(`INSERT OR IGNORE INTO test_site_builds VALUES(${q(buildId)},'ray510/HK_APP',${q(HOST)},0,${q(JSON.stringify({build_id:buildId,baseline_raw_sha256:baseline.raw_sha256}))});`);
const snapshot='s01_'+baseline.raw_sha256.slice(0,32);
statements.push(`INSERT OR IGNORE INTO sources(source_id,catalog_url,publisher,contract_status,enabled) VALUES('edb-school-directory',${q(S01)},'Education Bureau','LIVE_VERIFIED',1);`);
statements.push(`INSERT OR IGNORE INTO source_snapshots(snapshot_id,source_id,raw_hash,parser_version,fetched_at) VALUES(${q(snapshot)},'edb-school-directory',${q(baseline.raw_sha256)},'staging-baseline-v1',${q(baseline.fetched_at)});`);
const releases:Array<{level:string;release_id:string;channel:string;items:number}>=[];
for(const level of levels){
  const items=profiles.filter(p=>p.level===level);const digest=hash({level,items,scope:'partial',buildId});const id='rel_'+digest.slice(0,32);const channel='profiles:'+level;
  releases.push({level,release_id:id,channel,items:items.length});
  statements.push(`INSERT OR IGNORE INTO release_manifests(release_id,channel,status,scope,item_count,manifest_hash,source_snapshots,normalizer_version) VALUES(${q(id)},${q(channel)},'READY_FOR_REVIEW','partial',${items.length},${q(digest)},${q(JSON.stringify([snapshot]))},'staging-baseline-v1');`);
  for(const profile of items){const semantic=hash(profile);const version='pv_'+semantic;
    statements.push(`INSERT OR IGNORE INTO school_identities(school_id) VALUES(${q(profile.school_id)});`);
    statements.push(`INSERT OR IGNORE INTO profile_versions(profile_version_id,school_id,campus_id,session_code,level,item_key,semantic_hash,content_json,source_snapshot_ids) VALUES(${q(version)},${q(profile.school_id)},NULL,'UNKNOWN',${q(level)},${q(profile.item_key)},${q(semantic)},${q(JSON.stringify(profile))},${q(JSON.stringify([snapshot]))});`);
    statements.push(`INSERT OR IGNORE INTO release_items(release_item_id,release_id,item_key,profile_version_id) VALUES(${q('ri_'+hash([id,profile.item_key]))},${q(id)},${q(profile.item_key)},${q(version)});`);
    statements.push(`INSERT OR IGNORE INTO school_search(release_id,item_key,profile_version_id,school_id,level,normalized_name,district,funding,is_test) VALUES(${q(id)},${q(profile.item_key)},${q(version)},${q(profile.school_id)},${q(level)},${q((profile.chinese_name+' '+profile.english_name).normalize('NFC').toLowerCase())},${q(profile.district)},${q(profile.funding)},0);`);
  }
  statements.push(`INSERT OR IGNORE INTO review_decisions(decision_id,release_id,subject_hash,decision,actor_id,evidence_json,created_at) VALUES(${q('staging_qa_'+digest)},${q(id)},${q(digest)},'APPROVED',${q(actor)},${q(JSON.stringify({method:'AUTOMATED_BASELINE_SCHEMA_AND_UNIQUE_SOURCE_KEY',human_review:false,annual_identity_approved:false,scope:'partial',raw_sha256:baseline.raw_sha256,excluded_records:exclusions.length,hostname:HOST}))},${q(timestamp)});`);
  statements.push(`UPDATE release_manifests SET status='APPROVED' WHERE release_id=${q(id)} AND status='READY_FOR_REVIEW';`);
  statements.push(publicationSql({id,channel,operation:'publish',revision:0,previous:null,actor}));
}
statements.push(`UPDATE test_site_builds SET ready=1 WHERE build_id=${q(buildId)};`);
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
const migrations=readdirSync(resolve(ROOT,'migrations')).filter(f=>f.endsWith('.sql')).sort();
for(const file of migrations)db.exec(readFileSync(resolve(ROOT,'migrations',file),'utf8'));
for(const statement of statements)db.exec(statement);
for(const statement of statements)db.exec(statement);
if(db.prepare('SELECT COUNT(*) AS n FROM school_search').get()?.n!==profiles.length||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite replay/foreign-key verification failed');
if(db.prepare('SELECT COUNT(*) AS n FROM event_versions').get()?.n!==0)throw new Error('Unexpected generated admissions');db.close();
mkdirSync(OUT,{recursive:true});const chunks:Array<{file:string;sha256:string;statements:number}>=[];
for(let i=0;i<statements.length;i+=200){const content=statements.slice(i,i+200).join('\n');const file='part-'+String(chunks.length).padStart(4,'0')+'.sql';writeFileSync(resolve(OUT,file),content);chunks.push({file,sha256:sha(content),statements:Math.min(200,statements.length-i)});}
const report={schema_version:1,build_id:buildId,hostname:HOST,environment:'staging',generated_at:timestamp,
  baseline:{raw_rows:parsed.rows.length,included_records:profiles.length,excluded_records:exclusions.length,by_level:Object.fromEntries(releases.map(r=>[r.level,r.items])),raw_sha256:baseline.raw_sha256,fetched_at:baseline.fetched_at,scope:'partial'},
  annual:referenceSources,identity_approval:'ANNUAL_RECORDS_UNLINKED',admission_events:0,synthetic_records:0,
  releases,chunks,sql_statement_count:statements.length,estimated_write_budget:profiles.length*20+3000,
  validation:{sqlite_import:true,idempotent_replay:true,foreign_keys:true},
  limitations:['Basic directory only; session/campus remain unknown where not reviewed.','Excluded ambiguous identities and non-mainstream categories are listed separately.','Annual source records are not canonical identity matches or current admission deadlines.','No human identity approvals or admission dates were fabricated.']};
save(resolve(OUT,'manifest.json'),report);save(resolve(OUT,'exclusions.json'),exclusions);save(resolve(OUT,'profiles.json'),profiles);
save(resolve(DIST,'test-data-report.json'),report);
save(resolve(DIST,'source-reference/manifest.json'),{schema_version:1,build_id:buildId,sources:referenceSources});
console.log(JSON.stringify({...report,chunks:chunks.length}));
