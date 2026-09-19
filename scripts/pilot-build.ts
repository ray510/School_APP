/** Builds a small, explicitly source-reviewed pilot. No remote access or direct database writes. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildAnnual,parseAnnual,validateAnnualBundle,annualImportSql} from '../tools/cli/src/annual';
import {parseEDBDirectory} from '../tools/cli/src/parsers/csv-parser';
import {eventImportSql,eventIdentity,EventInput} from '../tools/cli/src/events';
import {hash,publicationSql,quote} from '../tools/cli/src/pipeline';
import {generateSchoolId} from '@hk-school/contracts/identity';
import {AdmissionEvent} from '@hk-school/contracts/domain';
const root=fileURLToPath(new URL('../',import.meta.url));const out=resolve(root,'artifacts/pilot');mkdirSync(out,{recursive:true});
const read=(path:string)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const save=(path:string,value:unknown)=>writeFileSync(resolve(out,path),JSON.stringify(value,null,2)+'\n');
const digest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const norm=(s:string)=>s.normalize('NFKC').replace(/\s+/g,'');
const actor='assistant-source-review/2026-09-19';
const selection=read('data/pilot/selection.json') as {baseline_raw_sha256:string;source_hashes:Record<string,string>;reviewer:string;reviewed_at:string;human_review:boolean;schools:Array<{level:string;source_id:string;edb_source_record_key:string;school_id:string;annual_name:string;record_hash:string;telephone_conflict_reviewed:boolean}>};
if(selection.schools.length!==30||new Set(selection.schools.map(s=>s.school_id)).size!==30)throw new Error('Pilot requires exactly 30 explicitly selected identities');
const baseline=resolve(root,'archive/edb-school-directory',selection.baseline_raw_sha256,'raw.csv');const bytes=readFileSync(baseline);
if(digest(bytes)!==selection.baseline_raw_sha256)throw new Error('Baseline review hash changed');
const base=parseEDBDirectory(bytes);if(base.missingFields.length||base.issues.warnings.length)throw new Error('Baseline contract');
const manifests:Array<{release_id:string;channel:string;manifest_hash:string;items:number;type:string}>=[];const chunks:Array<{file:string;sha256:string}>=[];const linked:unknown[]=[];
function chunk(sql:string){const file=`pilot-${String(chunks.length).padStart(3,'0')}.sql`;writeFileSync(resolve(out,file),sql+'\n');chunks.push({file,sha256:digest(sql+'\n')});}
for(const [source,rawHash] of Object.entries(selection.source_hashes)){
 const input=resolve(root,'archive',source,rawHash,'raw.csv');if(digest(readFileSync(input))!==rawHash)throw new Error('Annual review hash changed');
 const parsed=parseAnnual(readFileSync(input),source);const chosen=selection.schools.filter(s=>s.source_id===source);if(chosen.length!==10)throw new Error('Exactly 10 per source required');
 const mappings=chosen.map(s=>{
  if(selection.reviewer!==actor||selection.human_review!==false||Date.parse(selection.reviewed_at)>Date.now())throw new Error('Review provenance invalid');
  const matches=base.rows.filter(b=>b['SCHOOL NO.']===s.edb_source_record_key);if(matches.length!==1)throw new Error('Ambiguous EDB identity');const b=matches[0];
  const annual=parsed.records.filter(r=>r.record_hash===s.record_hash&&r.name===s.annual_name);if(annual.length!==1)throw new Error('Reviewed source row no longer exact');const a=annual[0];
  if(norm(b['中文名稱'])!==norm(a.name)||norm(b['中文地址'])!==norm(a.address))throw new Error('Name/address review mismatch');
  if(generateSchoolId('edb-school-directory',s.edb_source_record_key)!==s.school_id||s.level!==parsed.level)throw new Error('Wrong identity or level');
  const telephoneSame=norm(b.TELEPHONE)===norm(a.fields['電話']??a.fields['學校電話']);
  if(!telephoneSame&&!s.telephone_conflict_reviewed)throw new Error('Unreviewed telephone conflict');
  if(s.telephone_conflict_reviewed&&s.edb_source_record_key!=='510785000123')throw new Error('Unknown telephone conflict waiver');
  if(new URL(a.fields['學校網址']).hostname!==new URL(b.WEBSITE).hostname)throw new Error('Website evidence mismatch');
  if(source==='edb-kg-profiles'&&(!s.edb_source_record_key.startsWith(a.fields['學校編號']+a.fields['校址編號'])))throw new Error('KG school/campus mismatch');
  linked.push({...s,annual_record_hash:a.record_hash,annual_raw_sha256:rawHash,baseline_name:b['中文名稱'],annual_address:a.address,baseline_address:b['中文地址'],annual_telephone:a.fields['電話']??a.fields['學校電話'],baseline_telephone:b.TELEPHONE,annual_website:a.fields['學校網址'],baseline_website:b.WEBSITE,telephone_conflict:!telephoneSame,reviewer:actor,human_review:false});
  return {record_hash:a.record_hash,edb_source_record_key:s.edb_source_record_key,school_id:s.school_id,reviewer:actor,reviewed_at:selection.reviewed_at,identity_verified:true};
 });
 const edition=({'edb-kg-profiles':'2025/26','chsc-primary-profiles':'2025','chsc-secondary-profiles':'2025/2026'} as Record<string,string>)[source];
 const mapping=resolve(out,source+'-mapping.json');writeFileSync(mapping,JSON.stringify({mappings}));
 const directory=resolve(out,source);buildAnnual({input,baseline,edition,mapping,out:directory});
 const bundle=validateAnnualBundle(JSON.parse(readFileSync(resolve(directory,'annual-bundle.json'),'utf8')));
 const evidence={human_review:false,reviewer:actor,selection_sha256:digest(readFileSync(resolve(root,'data/pilot/selection.json'))),schools:chosen.map(s=>({school_id:s.school_id,telephone_conflict_reviewed:s.telephone_conflict_reviewed})),scope:'10 explicitly source-reviewed North District schools/campuses; KG maps one AM directory record only'};
 chunk(annualImportSql(bundle,actor)+`\nUPDATE review_decisions SET evidence_json=${quote(JSON.stringify(evidence))} WHERE decision_id=${quote('review_'+bundle.manifest_hash)} AND subject_hash=${quote(bundle.manifest_hash)} AND NOT EXISTS(SELECT 1 FROM publication_commands WHERE release_id=${quote(bundle.release_id)});`);
 manifests.push({release_id:bundle.release_id,channel:bundle.channel,manifest_hash:bundle.manifest_hash,items:10,type:'annual'});
}
const events=read('data/pilot/events.json') as Array<Record<string,unknown>>;
const sources=read('data/pilot/admission-sources.json') as Array<{id:string;url:string;publisher:string}>;
const sourceEvidence:unknown[]=[];
for(const source of sources){
 const metadata=read('artifacts/pilot/'+source.id+'.json');const raw=readFileSync(resolve(root,metadata.raw_path));if(digest(raw)!==metadata.raw_sha256||metadata.url!==source.url)throw new Error('Admission source evidence mismatch');
 const group=events.filter(e=>e.source_id===source.id).map(e=>{const {source_id:_id,...event}=e;return AdmissionEvent.parse({...event,source_url:source.url,evidence_sha256:metadata.raw_sha256,reviewer:actor});});
 if(!group.length)throw new Error('No reviewed events');
 const input=EventInput.parse({source_id:source.id,source_url:source.url,publisher:source.publisher,raw_path:metadata.raw_path,raw_sha256:metadata.raw_sha256,level:group[0].level,entry_year:2027,route:group[0].route,official_cycle_label:group[0].level==='SECONDARY'?'2025/2027年度中學學位分配辦法':'2027/28入學安排',is_test:false,events:group});
 const identity=eventIdentity(input);
 chunk(eventImportSql(input,actor)+`\nUPDATE release_manifests SET scope='partial' WHERE release_id=${quote(identity.releaseId)} AND status='APPROVED';\nUPDATE review_decisions SET evidence_json=${quote(JSON.stringify({human_review:false,reviewer:actor,raw_sha256:metadata.raw_sha256,reviewed_event_ids:group.map(e=>e.id),captured_at:metadata.fetched_at,selection:'Only listed date-precise events; not the complete admission process'}))} WHERE decision_id=${quote('review_'+identity.subjectHash)} AND NOT EXISTS(SELECT 1 FROM publication_commands WHERE release_id=${quote(identity.releaseId)});`);
 manifests.push({release_id:identity.releaseId,channel:identity.channel,manifest_hash:identity.subjectHash,items:group.length,type:'events'});sourceEvidence.push(metadata);save(source.id+'-events.json',input);
}
for(const m of manifests)chunk(publicationSql({id:m.release_id,channel:m.channel,operation:'publish',revision:0,previous:null,actor}));
const report={schema_version:1,hostname:'schools-test.finpulsx.win',database_id:'f80ca4cd-5e0a-4e9c-94ab-e4acdcbfda89',baseline_build_id:'f6350475fa412107c9da0c9c90c941d283b50c02213b0fc4c24689359b91c51d',school_count:30,event_count:events.length,synthetic_records:0,estimated_write_budget:5000,reviewer:actor,human_review:false,manifests,chunks,schools:linked,sources:sourceEvidence,limitations:['North District pilot only; one KG AM source identity per campus','Annual reference years are not target admission years','Shared admissions procedures are conditional, not individual school dates','K1 tuition is not derived from child-care charges; unknowns are not zero','Source statements and assistant source review, not education quality certification']};
const build_id=hash(report);save('manifest.json',{...report,build_id});save('reviewed-schools.json',linked);
writeFileSync(resolve(out,'combined.sql'),chunks.map(c=>readFileSync(resolve(out,c.file),'utf8')).join('\n'));
const publicReport={...report,chunks:undefined,sources:sourceEvidence.map((s)=>{const {raw_path:_path,...rest}=s as Record<string,unknown>;return rest;}),build_id};
writeFileSync(resolve(root,'apps/web/dist/pilot-report.json'),JSON.stringify(publicReport,null,2));
console.log(JSON.stringify({status:'PILOT_BUILT_NOT_PUBLISHED',schools:30,events:events.length,build_id,streams:manifests.length}));
