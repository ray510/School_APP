/** Source-specific annual CSV adapters with explicit, hash-bound cross-source identity review. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {AnnualSource,AnnualProfile,factPeriod,type AnnualSchoolProfile} from '@hk-school/contracts/annual';
import {Level} from '@hk-school/contracts/domain';
import {generateSchoolId} from '@hk-school/contracts/identity';
import {parseCSV,parseEDBDirectory} from './parsers/csv-parser';
import {hash,quote,executeLocal} from './pipeline';
const CONTRACTS={
  'edb-kg-profiles':{level:'KG',delimiter:'^',name:'學校名稱',address:'地址',required:['學校編號','校址編號','學校名稱','地址','收費證明書']},
  'chsc-primary-profiles':{level:'PRIMARY',delimiter:',',name:'學校名稱',address:'學校地址',required:['區域','學校名稱','學校地址','小一學校網','教學語言']},
  'chsc-secondary-profiles':{level:'SECONDARY',delimiter:',',name:'學校名稱',address:'學校地址',required:['區域','學校名稱','學校地址','中一入學','全校語文政策']}
} as const;
export interface AnnualRecord{record_hash:string;source_record_key:string;name:string;address:string;fields:Record<string,string>}
export function parseAnnual(content:Buffer|string,sourceValue:string):{level:z.infer<typeof Level>;headers:string[];records:AnnualRecord[]}{
  const source=AnnualSource.parse(sourceValue);const contract=CONTRACTS[source];const parsed=parseCSV(content,{delimiter:contract.delimiter});
  const missing=contract.required.filter(header=>!parsed.headers.includes(header));
  if(missing.length||parsed.issues.warnings.length)throw new Error('Annual contract mismatch: '+missing.join(',')+' '+parsed.issues.warnings.join(';'));
  if(parsed.headers.length>200||parsed.headers.length<20)throw new Error('Unexpected annual header width');
  const records=parsed.rows.map(fields=>{
    const record_hash=hash(fields);const source_record_key=source==='edb-kg-profiles'?`${fields['學校編號']}::${fields['校址編號']}`:`row:${record_hash}`;
    if(!fields[contract.name]?.trim())throw new Error('Annual school name missing');
    return {record_hash,source_record_key,name:fields[contract.name],address:fields[contract.address]??'',fields};
  });
  if(new Set(records.map(record=>record.record_hash)).size!==records.length)throw new Error('Duplicate annual source rows need review');
  return {level:contract.level,headers:parsed.headers,records};
}
function save(path:string,value:unknown){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n','utf8');}
function loadBounded(path:string,maximum:number){const bytes=readFileSync(path);if(bytes.length>maximum)throw new Error('File exceeds byte budget');return bytes;}
function sha(bytes:Buffer){return createHash('sha256').update(bytes).digest('hex');}
const Metadata=z.object({source_id:AnnualSource,fetched_url:z.string().url(),sha256:z.string().regex(/^[a-f0-9]{64}$/),catalogue_label:z.string(),fetched_at:z.string()}).passthrough();
const Mapping=z.object({
  record_hash:z.string().regex(/^[a-f0-9]{64}$/),edb_source_record_key:z.string().min(1).max(100),
  school_id:z.string().min(1).max(100),reviewer:z.string().min(1).max(100),reviewed_at:z.string().datetime(),
  identity_verified:z.literal(true)
}).strict();
function rawInputs(input:string,baseline:string){
  const bytes=loadBounded(input,10_000_000);const metadata=Metadata.parse(JSON.parse(readFileSync(resolve(dirname(input),'metadata.json'),'utf8')));
  if(sha(bytes)!==metadata.sha256)throw new Error('Annual raw hash mismatch');
  const url=new URL(metadata.fetched_url);if(url.protocol!=='https:'||!['www.edb.gov.hk','www.chsc.hk'].includes(url.hostname))throw new Error('Unexpected annual source URL');
  const baselineBytes=loadBounded(baseline,5_000_000);const baselineMeta=JSON.parse(readFileSync(resolve(dirname(baseline),'metadata.json'),'utf8')) as {raw_sha256?:string};
  const baselineHash=sha(baselineBytes);if(baselineHash!==baselineMeta.raw_sha256)throw new Error('Baseline raw hash mismatch');
  const parsedBaseline=parseEDBDirectory(baselineBytes);if(parsedBaseline.missingFields.length||parsedBaseline.issues.warnings.length)throw new Error('Baseline source contract failed');
  return {metadata,annual:parseAnnual(bytes,metadata.source_id),baselineHash,rows:parsedBaseline.rows};
}
export function prepareAnnual(options:{input:string;baseline:string;edition:string;out:string}):void{
  const input=rawInputs(options.input,options.baseline);const normalize=(value:string)=>value.normalize('NFC').trim();
  const counts=new Map<string,number>();for(const row of input.rows)counts.set(row['SCHOOL NO.'],(counts.get(row['SCHOOL NO.'])??0)+1);
  const matches=input.annual.records.map(record=>{
    const candidates=input.rows.filter(row=>counts.get(row['SCHOOL NO.'])===1&&normalize(row['中文名稱'])===normalize(record.name)&&normalize(row['中文地址'])===normalize(record.address));
    return {record_hash:record.record_hash,source_record_key:record.source_record_key,name:record.name,address:record.address,
      candidates:candidates.map(row=>({edb_source_record_key:row['SCHOOL NO.'],school_id:generateSchoolId('edb-school-directory',row['SCHOOL NO.']),category:row['ENGLISH CATEGORY'],reason:'EXACT_NAME_AND_ADDRESS_ONLY_NOT_APPROVED'})),identity_verified:false};
  });
  save(resolve(options.out,'identity-review.json'),{source_id:input.metadata.source_id,profile_edition:options.edition,catalogue_label:input.metadata.catalogue_label,raw_sha256:input.metadata.sha256,baseline_raw_sha256:input.baselineHash,records:matches});
  save(resolve(options.out,'mappings.template.json'),{mappings:[],instructions:'Add only manually checked rows. Each entry requires record_hash, edb_source_record_key, school_id, reviewer, reviewed_at, identity_verified:true. Do not approve by name alone.'});
  console.log(JSON.stringify({status:'IDENTITY_REVIEW_REQUIRED',source:input.metadata.source_id,rows:matches.length,unique_exact_candidates:matches.filter(row=>row.candidates.length===1).length,output:options.out}));
}
export const AnnualBundle=z.object({schema_version:z.literal(1),source_id:AnnualSource,level:Level,profile_edition:z.string().min(1).max(160),scope:z.enum(['canary','full']),channel:z.string().min(1).max(200),profiles:z.array(AnnualProfile).min(1).max(15),manifest_hash:z.string().regex(/^[a-f0-9]{64}$/),release_id:z.string().regex(/^rel_[a-f0-9]{32}$/)}).strict();
export type AnnualBundleData=z.infer<typeof AnnualBundle>;
export function validateAnnualBundle(value:unknown):AnnualBundleData{
  const bundle=AnnualBundle.parse(value);const {manifest_hash,release_id,...subject}=bundle;
  if(hash(subject)!==manifest_hash||release_id!=='rel_'+manifest_hash.slice(0,32))throw new Error('Annual bundle hash mismatch');
  if(bundle.profiles.some(p=>p.source_id!==bundle.source_id||p.level!==bundle.level||p.profile_edition!==bundle.profile_edition||p.is_test))throw new Error('Annual bundle context mismatch');
  if(bundle.channel!==`annual:${bundle.source_id}:${hash(bundle.profile_edition).slice(0,16)}`)throw new Error('Annual channel mismatch');
  if(new Set(bundle.profiles.map(p=>p.record_hash)).size!==bundle.profiles.length)throw new Error('Duplicate annual profiles');return bundle;
}
export function buildAnnual(options:{input:string;baseline:string;edition:string;mapping:string;out:string}):void{
  const input=rawInputs(options.input,options.baseline);
  const mappings=z.object({mappings:z.array(Mapping).min(1).max(15)}).strict().parse(JSON.parse(loadBounded(options.mapping,1000000).toString('utf8'))).mappings;
  const byHash=new Map(input.annual.records.map(record=>[record.record_hash,record]));
  const profiles:AnnualSchoolProfile[]=mappings.map(mapping=>{
    const record=byHash.get(mapping.record_hash);if(!record)throw new Error('Mapping refers to a different annual source version');
    const baseline=input.rows.filter(row=>row['SCHOOL NO.']===mapping.edb_source_record_key);
    if(baseline.length!==1||mapping.school_id!==generateSchoolId('edb-school-directory',mapping.edb_source_record_key))throw new Error('Mapping needs one unambiguous baseline identity');
    const category=baseline[0]['ENGLISH CATEGORY'];
    const levelMatches=input.annual.level==='KG'?['Kindergartens','Kindergarten-cum-child Care Centres'].includes(category):input.annual.level==='PRIMARY'?category.endsWith('Primary Schools')||category.endsWith('(Primary)'):category.endsWith('Secondary Schools')||category.endsWith('(Secondary)')||category==='Private Secondary Schools (Day/Evening)';
    if(!levelMatches)throw new Error('Mapping crosses school levels');
    if(Date.parse(mapping.reviewed_at)>Date.now()+60000)throw new Error('Mapping review cannot be in the future');
    const facts=Object.entries(record.fields).map(([label,value])=>({label,value:value.trim()||null,state:!value.trim()?'not_provided' as const:value.trim()==='不適用'?'not_applicable' as const:'as_reported' as const,reference_period:factPeriod(label),is_planned:label.includes('擬開設')}));
    return AnnualProfile.parse({record_hash:record.record_hash,source_record_key:record.source_record_key,school_id:mapping.school_id,level:input.annual.level,school_name:record.name,school_address:record.address,profile_edition:options.edition,catalogue_label:input.metadata.catalogue_label,source_id:input.metadata.source_id,source_url:input.metadata.fetched_url,raw_sha256:input.metadata.sha256,fetched_at:new Date(input.metadata.fetched_at).toISOString(),identity_evidence:{edb_source_record_key:mapping.edb_source_record_key,baseline_raw_sha256:input.baselineHash,reviewer:mapping.reviewer,reviewed_at:mapping.reviewed_at},facts,is_test:false});
  });
  const subject={schema_version:1 as const,source_id:input.metadata.source_id,level:input.annual.level,profile_edition:options.edition,scope:(profiles.length===input.annual.records.length?'full':'canary') as 'full'|'canary',channel:`annual:${input.metadata.source_id}:${hash(options.edition).slice(0,16)}`,profiles};
  const manifestHash=hash(subject);const bundle=validateAnnualBundle({...subject,manifest_hash:manifestHash,release_id:'rel_'+manifestHash.slice(0,32)});
  save(resolve(options.out,'annual-bundle.json'),bundle);console.log(JSON.stringify({release_id:bundle.release_id,manifest_hash:manifestHash,status:'REVIEW_REQUIRED',items:profiles.length,source_rows:input.annual.records.length,scope:bundle.scope}));
}
export function annualImportSql(bundle:AnnualBundleData,reviewer:string):string{
  validateAnnualBundle(bundle);const q=quote;const now=new Date().toISOString();const first=bundle.profiles[0];const source=bundle.source_id;
  const publisher=source==='edb-kg-profiles'?'Education Bureau':'Committee on Home-School Co-operation';
  const sql=[`INSERT OR IGNORE INTO sources(source_id,catalog_url,publisher,contract_status,enabled) VALUES(${q(source)},${q(first.source_url)},${q(publisher)},'CONTRACT_VERIFIED',1);`,
    `INSERT OR IGNORE INTO release_manifests(release_id,channel,status,scope,item_count,manifest_hash,normalizer_version,created_at) VALUES(${q(bundle.release_id)},${q(bundle.channel)},'READY_FOR_REVIEW',${q(bundle.scope)},${bundle.profiles.length},${q(bundle.manifest_hash)},'annual-adapter-v1',${q(now)});`];
  for(const profile of bundle.profiles){
    const id='annual_'+hash(profile);const snapshot='as_'+hash([source,profile.raw_sha256]).slice(0,32);
    sql.push(`INSERT OR IGNORE INTO school_identities(school_id) VALUES(${q(profile.school_id)});`);
    sql.push(`INSERT OR IGNORE INTO source_snapshots(snapshot_id,source_id,raw_hash,parser_version,fetched_at) VALUES(${q(snapshot)},${q(source)},${q(profile.raw_sha256)},'annual-adapter-v1',${q(profile.fetched_at)});`);
    sql.push(`INSERT OR IGNORE INTO identity_mappings(mapping_id,source_id,source_record_key,school_id,mapping_version,verified,verified_at,verified_by) VALUES(${q('map_'+hash([source,profile.record_hash,profile.school_id]))},${q(source)},${q(profile.record_hash)},${q(profile.school_id)},${q(profile.raw_sha256)},1,${q(profile.identity_evidence.reviewed_at)},${q(profile.identity_evidence.reviewer)});`);
    sql.push(`INSERT OR IGNORE INTO annual_profile_versions(annual_profile_id,school_id,source_id,source_record_key,record_hash,level,profile_edition,is_test,identity_verified,content_json) VALUES(${q(id)},${q(profile.school_id)},${q(source)},${q(profile.source_record_key)},${q(profile.record_hash)},${q(profile.level)},${q(profile.profile_edition)},0,1,${q(JSON.stringify(profile))});`);
    sql.push(`INSERT OR IGNORE INTO annual_release_items(release_id,annual_profile_id) VALUES(${q(bundle.release_id)},${q(id)});`);
  }
  sql.push(`INSERT OR IGNORE INTO review_decisions(decision_id,release_id,subject_hash,decision,actor_id,evidence_json,created_at) VALUES(${q('review_'+bundle.manifest_hash)},${q(bundle.release_id)},${q(bundle.manifest_hash)},'APPROVED',${q(reviewer)},${q(JSON.stringify({raw_sha256:first.raw_sha256,edition:bundle.profile_edition}))},${q(now)});`);
  sql.push(`UPDATE release_manifests SET status='APPROVED' WHERE release_id=${q(bundle.release_id)} AND status='READY_FOR_REVIEW';`);return sql.join('\n');
}
export function importAnnual(options:{bundle:string;reviewer:string;confirmHash:string;environment:string}):void{
  if(options.environment!=='local')throw new Error('BLOCKED: annual imports are local only');
  const bundle=validateAnnualBundle(JSON.parse(loadBounded(resolve(options.bundle,'annual-bundle.json'),5_000_000).toString('utf8')));
  if(options.confirmHash!==bundle.manifest_hash||!options.reviewer.trim()||options.reviewer.length>100)throw new Error('Exact content hash and reviewer required');
  executeLocal(annualImportSql(bundle,options.reviewer));console.log(JSON.stringify({release_id:bundle.release_id,channel:bundle.channel,status:'APPROVED_NOT_PUBLISHED'}));
}
