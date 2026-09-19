import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { Profile, Level, SafeUrl, type SchoolProfile } from '@hk-school/contracts/domain';
import { generateSchoolId, generateItemKey } from '@hk-school/contracts/identity';
import { parseEDBDirectory } from './parsers/csv-parser';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const S01='https://www.edb.gov.hk/attachment/en/student-parents/sch-info/sch-search/sch-location-info/SCH_LOC_EDB.csv';
export const SOURCES=[
  {id:'edb-school-directory',dataset:'hk-edb-schinfo-school-location-and-information',publisher:'Education Bureau'},
  {id:'edb-kg-profiles',dataset:'hk-edb-kgjoinkes-kg-profile',publisher:'Education Bureau'},
  {id:'chsc-primary-profiles',dataset:'chsc-chsc-primary-school-profiles',publisher:'Committee on Home-School Co-operation'},
  {id:'chsc-secondary-profiles',dataset:'chsc-chsc-secondary-school-profiles',publisher:'Committee on Home-School Co-operation'}
] as const;
const CategoryLevel:Record<string,z.infer<typeof Level>>={
  'Aided Primary Schools':'PRIMARY','Aided Secondary Schools':'SECONDARY','Caput Secondary Schools':'SECONDARY',
  'Direct Subsidy Scheme Primary Schools':'PRIMARY','Direct Subsidy Scheme Secondary Schools':'SECONDARY',
  'English Schools Foundation (Primary)':'PRIMARY','English Schools Foundation (Secondary)':'SECONDARY',
  'Government Primary Schools':'PRIMARY','Government Secondary Schools':'SECONDARY',
  'International Schools (Primary)':'PRIMARY','International Schools (Secondary)':'SECONDARY',
  'Kindergartens':'KG','Kindergarten-cum-child Care Centres':'KG',
  'Private Primary Schools':'PRIMARY','Private Secondary Schools (Day/Evening)':'SECONDARY'
};
export function canonical(value:unknown):string {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  const object=value as Record<string,unknown>;
  return '{'+Object.keys(object).sort().map(key=>JSON.stringify(key)+':'+canonical(object[key])).join(',')+'}';
}
export function hash(value:unknown):string {return createHash('sha256').update(canonical(value)).digest('hex');}
const BundleSchema=z.object({
  schema_version:z.literal(1),source_id:z.string().min(1).max(120),snapshot_id:z.string().min(1).max(120),
  raw_sha256:z.string().regex(/^[a-f0-9]{64}$/),source_url:SafeUrl,created_at:z.string().datetime(),
  level:Level,scope:z.enum(['full','canary','test']),channel:z.string().min(1).max(120),
  profiles:z.array(Profile).min(1).max(10000),manifest_hash:z.string().regex(/^[a-f0-9]{64}$/),
  release_id:z.string().regex(/^rel_[a-f0-9]{32}$/)
}).strict();
export type Bundle=z.infer<typeof BundleSchema>;
function seal(value:Omit<Bundle,'manifest_hash'|'release_id'>):Bundle {
  const manifest_hash=hash(value);return {...value,manifest_hash,release_id:'rel_'+manifest_hash.slice(0,32)};
}
export function validateBundle(input:unknown):Bundle {
  const bundle=BundleSchema.parse(input);const {manifest_hash,release_id,...content}=bundle;
  if(hash(content)!==manifest_hash||release_id!=='rel_'+manifest_hash.slice(0,32)) throw new Error('Bundle hash mismatch');
  if(new Set(bundle.profiles.map(p=>p.item_key)).size!==bundle.profiles.length) throw new Error('Duplicate item key');
  const channel=`${bundle.scope==='test'?'test:':''}profiles:${bundle.level}`;
  if(bundle.channel!==channel) throw new Error('Channel/level mismatch');
  for(const profile of bundle.profiles) {
    if(profile.level!==bundle.level||profile.source_id!==bundle.source_id||profile.snapshot_id!==bundle.snapshot_id||profile.is_test!==(bundle.scope==='test')||profile.source_url!==bundle.source_url) throw new Error('Profile/bundle provenance mismatch');
  }
  return bundle;
}
function save(path:string,value:unknown):void {mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n','utf8');}
export function readBundle(directory:string):Bundle {
  const buffer=readFileSync(resolve(directory,'bundle.json'));if(buffer.length>12_000_000)throw new Error('Bundle exceeds byte budget');
  return validateBundle(JSON.parse(buffer.toString('utf8')));
}
async function boundedFetch(url:string):Promise<{bytes:Buffer;modified:string|null;contentType:string|null}> {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!['www.edb.gov.hk','data.gov.hk'].includes(parsed.hostname)||parsed.username||parsed.password)throw new Error('Source URL is not allowlisted');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'HK-School-Guide/0.2 (+read-only source probe)'}});
  if(!response.ok||!response.body)throw new Error(`Source HTTP ${response.status}`);
  const chunks:Uint8Array[]=[];let size=0;const reader=response.body.getReader();
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000)throw new Error('Source exceeds 5 MB budget');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>undefined);}
  return {bytes:Buffer.concat(chunks),modified:response.headers.get('last-modified'),contentType:response.headers.get('content-type')};
}
export async function probeSources(out:string,all:boolean):Promise<void> {
  const report:unknown[]=[];
  for(const source of all?SOURCES:[SOURCES[0]]) {
    try {
      if(source.id==='edb-school-directory') {
        const fetched=await boundedFetch(S01);const parsed=parseEDBDirectory(fetched.bytes);
        if(parsed.missingFields.length||parsed.issues.warnings.length)throw new Error('CSV contract not valid');
        const rawHash=createHash('sha256').update(fetched.bytes).digest('hex');const archive=resolve(ROOT,'archive',source.id,rawHash);
        mkdirSync(archive,{recursive:true});writeFileSync(resolve(archive,'raw.csv'),fetched.bytes);
        const metadata={source_id:source.id,url:S01,snapshot_id:'s01_'+rawHash.slice(0,32),raw_sha256:rawHash,fetched_at:new Date().toISOString(),http_last_modified:fetched.modified,headers:parsed.headers,row_count:parsed.rowCount,status:'LIVE_VERIFIED',scope:'raw CSV structure only; not identity mapping or admission verification'};
        save(resolve(archive,'metadata.json'),metadata);report.push({...metadata,archive});
      } else {
        const url=`https://data.gov.hk/en-data/api/3/action/package_show?id=${source.dataset}`;
        const fetched=await boundedFetch(url);const json=JSON.parse(fetched.bytes.toString('utf8')) as {success?:boolean;result?:{resources?:Array<{url:string;format:string;name?:string}>}};
        if(!json.success||!json.result?.resources)throw new Error('Catalogue resource contract unavailable');
        report.push({source_id:source.id,status:'DISCOVERED',resources:json.result.resources.map(r=>({url:r.url,format:r.format,name:r.name})),reason:'Annual profile resource selection and cross-source identity mapping still require review; not LIVE_VERIFIED'});
      }
    }catch(error){report.push({source_id:source.id,status:'BLOCKED',reason:error instanceof Error?error.message:'Source failed'});}
  }
  save(out,{checked_at:new Date().toISOString(),sources:report});console.log(JSON.stringify(report,null,2));
}
export async function buildSource(options:{source:string;level:string;scope:string;limit?:number;out:string;input?:string;referencePeriod?:string}):Promise<void> {
  if(options.source!=='edb-school-directory')throw new Error('BLOCKED: annual profile adapter is not verified; no fabricated mapping');
  const level=Level.parse(options.level);const scope=z.enum(['full','canary']).parse(options.scope);
  if(scope==='full'&&options.limit!==undefined)throw new Error('Full scope cannot be silently truncated');
  const limit=scope==='canary'?z.number().int().min(1).max(5).parse(options.limit??5):10000;
  let bytes:Buffer;let fetchedAt=new Date().toISOString();
  if(options.input) {
    bytes=readFileSync(options.input);const metadataPath=resolve(dirname(options.input),'metadata.json');
    if(!existsSync(metadataPath))throw new Error('Local raw CSV requires its original metadata.json');
    const metadata=JSON.parse(readFileSync(metadataPath,'utf8')) as {raw_sha256:string;fetched_at:string};
    if(createHash('sha256').update(bytes).digest('hex')!==metadata.raw_sha256)throw new Error('Raw evidence hash mismatch');
    fetchedAt=z.string().datetime().parse(metadata.fetched_at);
  }else{bytes=(await boundedFetch(S01)).bytes;}
  if(bytes.length>5_000_000)throw new Error('Source exceeds byte budget');
  const parsed=parseEDBDirectory(bytes);if(parsed.missingFields.length||parsed.issues.warnings.length)throw new Error('Malformed source; bundle not created');
  const rawHash=createHash('sha256').update(bytes).digest('hex');const snapshot='s01_'+rawHash.slice(0,32);
  const counts=new Map<string,number>();for(const row of parsed.rows)counts.set(row['SCHOOL NO.'],(counts.get(row['SCHOOL NO.'])??0)+1);
  const quarantined:Array<{key:string;reason:string}>=[];const profiles:SchoolProfile[]=[];let outside=0;
  for(const row of parsed.rows) {
    const category=row['ENGLISH CATEGORY'];const mapped=Object.hasOwn(CategoryLevel,category)?CategoryLevel[category]:undefined;
    if(category==='Aided Special Schools'){outside++;continue;}
    if(!mapped){quarantined.push({key:row['SCHOOL NO.'],reason:'Unmapped official category'});continue;}
    if(mapped!==level)continue;
    const key=row['SCHOOL NO.'];if(!key||(counts.get(key)??0)!==1){quarantined.push({key,reason:'Ambiguous/repeated source key; requires reviewed campus/session identity'});continue;}
    const schoolId=generateSchoolId('edb-school-directory',key);
    const website=SafeUrl.safeParse(row.WEBSITE);
    const candidate={school_id:schoolId,item_key:generateItemKey(schoolId,'UNKNOWN',null),level,school_no:key,chinese_name:row['中文名稱'],english_name:row['ENGLISH NAME'],chinese_address:row['中文地址'],english_address:row['ENGLISH ADDRESS'],district:row['分區']||row.DISTRICT||null,funding:row['資助種類']||row['FINANCE TYPE']||null,category,session:'UNKNOWN',campus_id:null,website:website.success?website.data:null,telephone:row.TELEPHONE||null,fee:{amount_cents:null,state:'not_provided',reference_period:null},profile_edition:null,source_reference_period:options.referencePeriod??null,source_url:S01,source_id:'edb-school-directory',snapshot_id:snapshot,fetched_at:fetchedAt,is_test:false};
    const valid=Profile.safeParse(candidate);if(!valid.success){quarantined.push({key,reason:'Profile schema failure'});continue;}profiles.push(valid.data);
  }
  save(resolve(options.out,'coverage.json'),{raw_rows:parsed.rowCount,level,eligible:profiles.length,excluded_special_school_rows:outside,quarantined,scope,limitations:['Baseline directory only, not annual admissions','Session kept UNKNOWN until its values and identity effects are reviewed','Fees and admissions not inferred','HTTP Last-Modified is not used as the source reference period']});
  if(scope==='full'&&quarantined.length)throw new Error('Full bundle BLOCKED: resolve quarantined records first. See coverage.json');
  const selected=profiles.sort((a,b)=>a.item_key.localeCompare(b.item_key)).slice(0,limit);if(!selected.length)throw new Error('No valid records in requested scope');
  const bundle=seal({schema_version:1,source_id:'edb-school-directory',snapshot_id:snapshot,raw_sha256:rawHash,source_url:S01,created_at:fetchedAt,level,scope,channel:`profiles:${level}`,profiles:selected});
  save(resolve(options.out,'bundle.json'),validateBundle(bundle));
  const archive=resolve(ROOT,'archive','edb-school-directory',rawHash);mkdirSync(archive,{recursive:true});writeFileSync(resolve(archive,'raw.csv'),bytes);
  save(resolve(archive,'metadata.json'),{raw_sha256:rawHash,fetched_at:fetchedAt,source_url:S01});
  console.log(JSON.stringify({release_id:bundle.release_id,scope,items:selected.length,manifest_hash:bundle.manifest_hash,status:'READY_FOR_REVIEW'}));
}
export function reviewBundle(directory:string,reviewer?:string,confirmHash?:string):void {
  const bundle=readBundle(directory);
  if(!reviewer){save(resolve(directory,'review.json'),{release_id:bundle.release_id,manifest_hash:bundle.manifest_hash,scope:bundle.scope,profiles:bundle.profiles,checklist:['Verify identities and source evidence','Verify scope and exclusions','No inferred fees, dates or admission eligibility']});console.log('Review package written. This is not an approval.');return;}
  if(!reviewer.trim()||reviewer.length>100||confirmHash!==bundle.manifest_hash)throw new Error('Reviewer and exact reviewed content hash required');
  save(resolve(directory,'approval.json'),{release_id:bundle.release_id,manifest_hash:bundle.manifest_hash,reviewer,reviewed_at:new Date().toISOString()});
}
export function quote(value:string|number|null):string {
  if(value===null)return 'NULL';if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Invalid SQL number');return String(value);}
  if(value.includes('\0'))throw new Error('NUL not allowed');return "'"+value.replace(/'/g,"''")+"'";
}
export function importSql(bundle:Bundle,approval?:{reviewer:string;reviewed_at:string}):string {
  validateBundle(bundle);const lines:string[]=[];const q=quote;
  lines.push(`INSERT OR IGNORE INTO sources(source_id,catalog_url,publisher,contract_status,enabled) VALUES(${q(bundle.source_id)},${q(bundle.source_url)},${q(bundle.scope==='test'?'Synthetic local fixture':'Education Bureau')},${q(bundle.scope==='test'?'DISCOVERED':'LIVE_VERIFIED')},1);`);
  lines.push(`INSERT OR IGNORE INTO source_snapshots(snapshot_id,source_id,raw_hash,parser_version,fetched_at) VALUES(${q(bundle.snapshot_id)},${q(bundle.source_id)},${q(bundle.raw_sha256)},'directory-v2',${q(bundle.created_at)});`);
  lines.push(`INSERT OR IGNORE INTO release_manifests(release_id,channel,status,scope,item_count,manifest_hash,source_snapshots,normalizer_version,created_at) VALUES(${q(bundle.release_id)},${q(bundle.channel)},'READY_FOR_REVIEW',${q(bundle.scope)},${bundle.profiles.length},${q(bundle.manifest_hash)},${q(JSON.stringify([bundle.snapshot_id]))},'directory-v2',${q(bundle.created_at)});`);
  for(const profile of bundle.profiles) {
    const semanticHash=hash(profile);const version='pv_'+semanticHash;
    lines.push(`INSERT OR IGNORE INTO school_identities(school_id) VALUES(${q(profile.school_id)});`);
    lines.push(`INSERT OR IGNORE INTO profile_versions(profile_version_id,school_id,campus_id,session_code,level,item_key,semantic_hash,content_json,source_snapshot_ids) VALUES(${q(version)},${q(profile.school_id)},${q(profile.campus_id)},${q(profile.session)},${q(profile.level)},${q(profile.item_key)},${q(semanticHash)},${q(JSON.stringify(profile))},${q(JSON.stringify([bundle.snapshot_id]))});`);
    lines.push(`INSERT OR IGNORE INTO release_items(release_item_id,release_id,item_key,profile_version_id) VALUES(${q('ri_'+hash([bundle.release_id,profile.item_key]))},${q(bundle.release_id)},${q(profile.item_key)},${q(version)});`);
    lines.push(`INSERT OR IGNORE INTO school_search(release_id,item_key,profile_version_id,school_id,level,normalized_name,district,funding,is_test) VALUES(${q(bundle.release_id)},${q(profile.item_key)},${q(version)},${q(profile.school_id)},${q(profile.level)},${q((profile.chinese_name+' '+profile.english_name).normalize('NFC').toLowerCase())},${q(profile.district)},${q(profile.funding)},${profile.is_test?1:0});`);
  }
  if(approval){
    lines.push(`INSERT OR IGNORE INTO review_decisions(decision_id,release_id,subject_hash,decision,actor_id,evidence_json,created_at) VALUES(${q('review_'+bundle.manifest_hash)},${q(bundle.release_id)},${q(bundle.manifest_hash)},'APPROVED',${q(approval.reviewer)},${q(JSON.stringify({snapshot:bundle.snapshot_id,raw_sha256:bundle.raw_sha256}))},${q(approval.reviewed_at)});`);
    lines.push(`UPDATE release_manifests SET status='APPROVED' WHERE release_id=${q(bundle.release_id)} AND status='READY_FOR_REVIEW';`);
  }
  return lines.join('\n')+'\n';
}
export function executeLocal(sql:string):void {
  const config=JSON.parse(readFileSync(resolve(ROOT,'wrangler.jsonc'),'utf8')) as {env?:{local?:{vars?:Record<string,string>;d1_databases?:Array<{binding:string;database_id:string;remote?:boolean}>}}};
  const local=config.env?.local;const binding=local?.d1_databases?.find(db=>db.binding==='DB');
  if(local?.vars?.APP_ENV!=='local'||binding?.database_id!=='00000000-0000-0000-0000-000000000001'||binding.remote===true)throw new Error('Local database isolation guard failed');
  const path=resolve(ROOT,'artifacts','local-command.sql');mkdirSync(dirname(path),{recursive:true});writeFileSync(path,sql,'utf8');
  const result=spawnSync(process.execPath,[resolve(ROOT,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--config',resolve(ROOT,'wrangler.jsonc'),'--env','local','--local','--persist-to',resolve(ROOT,'.wrangler/state'),'--file',path],{cwd:ROOT,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  if(result.error)throw result.error;if(result.status!==0)throw new Error('Local SQL execution failed; nothing published unless publication command succeeded');
}
export function importBundle(directory:string,environment:string,planOnly=false):void {
  const bundle=readBundle(directory);const estimate=200+bundle.profiles.length*35;
  console.log(JSON.stringify({scope:bundle.scope,items:bundle.profiles.length,estimated_write_upper_bound:estimate,estimate_only:true,environment}));
  if(planOnly)return;
  if(environment!=='local')throw new Error('BLOCKED: remote quota, archive durability and importer/reviewer authorization are not certified; no remote write');
  if(bundle.profiles.length>15)throw new Error('Local first-run import limited to 15 records; measure before raising the cap');
  const path=resolve(directory,'approval.json');let approval:{reviewer:string;reviewed_at:string}|undefined;
  if(existsSync(path)) {
    const parsed=z.object({release_id:z.string(),manifest_hash:z.string(),reviewer:z.string().min(1).max(100),reviewed_at:z.string().datetime()}).strict().parse(JSON.parse(readFileSync(path,'utf8')));
    if(parsed.release_id!==bundle.release_id||parsed.manifest_hash!==bundle.manifest_hash)throw new Error('Review does not approve this bundle hash');approval=parsed;
  }
  executeLocal(importSql(bundle,approval));
}
export function publicationSql(input:{id:string;channel:string;operation:'publish'|'rollback';revision:number;previous:string|null;actor:string}):string {
  if(!input.id||!input.channel||!input.actor||!Number.isInteger(input.revision)||input.revision<0)throw new Error('Invalid publication input');
  const q=quote;const command='cmd_'+hash(input);
  return `INSERT INTO publication_commands(command_id,operation,channel,release_id,expected_revision,expected_previous_release_id,actor_id,created_at) SELECT ${q(command)},${q(input.operation)},${q(input.channel)},${q(input.id)},${q(input.revision)},${q(input.previous)},${q(input.actor)},${q(new Date().toISOString())} WHERE NOT EXISTS(SELECT 1 FROM publication_commands WHERE command_id=${q(command)});`;
}
export function demoBundles():Bundle[] {
  return (['KG','PRIMARY','SECONDARY'] as const).map(level=>{
    const source='synthetic-local';const stamp='2000-01-01T00:00:00.000Z';const sourceUrl='https://example.invalid/synthetic-only';
    const profiles:SchoolProfile[]=[1,2].map(index=>{
      const id=generateSchoolId(source,level+'-'+index);return Profile.parse({school_id:id,item_key:generateItemKey(id,'UNKNOWN',null),level,school_no:'TEST-'+level+'-'+index,chinese_name:`測試${({KG:'幼稚園',PRIMARY:'小學',SECONDARY:'中學'})[level]} ${index}`,english_name:`Synthetic ${level} ${index}`,chinese_address:'測試地址，並非真實學校',english_address:'Synthetic address, not a real school',district:'測試區',funding:'測試類別',category:'Synthetic fixture',session:'UNKNOWN',campus_id:null,website:null,telephone:null,fee:{amount_cents:index===1?0:null,state:index===1?'known':'not_provided',reference_period:'SYNTHETIC'},profile_edition:'SYNTHETIC',source_reference_period:null,source_url:sourceUrl,source_id:source,snapshot_id:'synthetic-v2',fetched_at:stamp,is_test:true});
    });
    return seal({schema_version:1,source_id:source,snapshot_id:'synthetic-v2',raw_sha256:hash('synthetic-v2'),source_url:sourceUrl,created_at:stamp,level,scope:'test',channel:`test:profiles:${level}`,profiles});
  });
}
export function seedDemo(environment:string):void {
  if(environment!=='local')throw new Error('Synthetic demos are local only');
  for(const bundle of demoBundles())executeLocal(importSql(bundle,{reviewer:'synthetic-fixture',reviewed_at:bundle.created_at})+publicationSql({id:bundle.release_id,channel:bundle.channel,operation:'publish',revision:0,previous:null,actor:'synthetic-fixture'}));
}
