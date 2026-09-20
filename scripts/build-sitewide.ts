/** Materialize source-provenance views without mutating a byte of the existing catalog. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {resolveProfiles,type IdentityManifest} from '../apps/web/src/full/profile-links';
import {cellFor,cohortKey} from '../apps/web/src/full/comparison';
import {tagNames,type Annotation} from '../apps/web/src/full/analytics';
import {extendedTopics,type InsightSummary,type SchoolInsight} from '../apps/web/src/full/sitewide';
import type {School,Manifest,Summary} from '../apps/web/src/full/catalog';
const dist='apps/web/dist-production',m:Manifest=JSON.parse(readFileSync(dist+'/catalog-manifest.json','utf8')),prefix=dist+'/data/'+m.data_id;
const identity:IdentityManifest=JSON.parse(readFileSync(dist+'/identity-manifest.json','utf8'));
const index:Summary[]=JSON.parse(readFileSync(dist+'/identity/'+identity.identity_id+'/index.json','utf8'));
interface Inference {schema:number;data_id:string;policy_version:string;model:string;generated_at:string;quality_status:string;source_hashes:Record<string,string>;items:Annotation[];status_counts:Record<string,number>;usage:Record<string,unknown>;topics:Record<string,unknown>}
const r:Inference=JSON.parse(readFileSync('artifacts/sitewide/inference.json','utf8'));
const demand=(v:unknown,message:string)=>{if(!v)throw new Error(message);};
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
demand(r.schema===1&&r.data_id===m.data_id&&r.model==='jev-1.13.0','Wrong model/data');
demand(r.items.length===m.stats.annual_rows,'Missing annual statuses');
for(const s of m.sources)demand(r.source_hashes[s.id]===s.sha256,'Source hash mismatch');
const analysisId=sha(JSON.stringify(r));const target=dist+'/insights/'+analysisId;
function write(path:string,v:unknown){mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});writeFileSync(path,JSON.stringify(v));}
const raw=new Map<string,School>(),hashes=new Map<string,string>(),seen=new Set<string>();
for(const s of index){const bytes=readFileSync(prefix+'/schools/'+s.id+'.json');const v:School=JSON.parse(bytes.toString());hashes.set(s.id,sha(bytes));raw.set(s.id,v);}
const key=(a:{source_id:string;row:number;record_sha256:string})=>a.source_id+':'+a.row+':'+a.record_sha256;
const extra=new Map(r.items.map(a=>[key(a),a]));demand(extra.size===r.items.length,'Duplicate inference record');
const allNames={...tagNames,...Object.fromEntries(Object.entries(extendedTopics).map(([k,v])=>[k,v.label]))};
const questions:Record<string,string>={after_school_support:'支援由誰提供？每週頻次、名額及費用如何？',ncs_support:'如何評估語文需要？有哪些課堂及家長溝通支援？',sen_support:'如何提出支援需要？有哪些校內及專業跟進安排？',english_enrichment:'英語活動每週多久？所有學生都能參加嗎？',stem_activities:'哪些活動恆常進行？由學生如何參與實作？',home_school:'家長活動在什麼時段舉行？可如何參與？'};
const statuses:Record<string,Record<string,Record<string,number>>>={};let linked=0;const enhanced:InsightSummary[]=[];
for(const a of r.items){const source=statuses[a.source_id]??={};for(const tag of Object.keys(extendedTopics)){const count=source[tag]??={};const label=a.labels[tag];demand(label,'Missing topic');count[label.status]=(count[label.status]??0)+1;}}
for(const s of index){const base=raw.get(s.id)!;const related=[...(s.identity?.linked_ids??[]),...(s.identity?.candidate_ids??[])].map(id=>raw.get(id)).filter((value):value is School=>Boolean(value));const v=resolveProfiles(base,related,m.sources);if(v.profile_resolution?.links.length)linked++;
 const topics:SchoolInsight['topics']=[];
 for(const [tag,label]of Object.entries(allNames)){
  const p=v.annual.length===1?v.annual[0]:null;let context=v;
  if(tag in extendedTopics){context={...v,semantic_annotations:v.annual.map(a=>extra.get(key(a))).filter((a):a is Annotation=>Boolean(a))};}
  const cell=cellFor(context,tag,p?cohortKey(p.source_id,p.edition):'');
  if(v.annual.length>1)cell.status='MULTIPLE_RECORDS';
  topics.push({id:tag,label,question:extendedTopics[tag]?.question??questions[tag],cell});
 }
 const profileRefs=v.annual.map(a=>({source_id:a.source_id,edition:a.edition,row:a.row,record_sha256:a.record_sha256}));
 const item:SchoolInsight={id:s.id,name:s.name,data_id:m.data_id,analysis_id:analysisId,topics,source_refs:profileRefs};
 write(target+'/schools/'+s.id+'.json',item);
 enhanced.push({...s,classification:v.classification,sessions:v.sessions,profile_count:v.annual.length,linked_profile_count:v.profile_resolution?.links.length??0,jev_tags:Object.fromEntries(topics.map(t=>[t.id,t.cell.status]))});
 // Verify every raw annual row once, even those currently lacking a directory link.
 for(const a of base.annual){const k=key(a);demand(!seen.has(k),'Duplicate raw row');seen.add(k);const ann=extra.get(k);demand(ann,'Inference missing source');
  for(const tag of Object.keys(extendedTopics)){const test=cellFor({...base,semantic_annotations:[ann!]},tag,cohortKey(a.source_id,a.edition));demand(test.status!=='EVIDENCE_MISMATCH','Invalid verbatim evidence');}
 }
}
demand(seen.size===extra.size,'Unknown inference rows');
for(const [id,h]of hashes)demand(sha(readFileSync(prefix+'/schools/'+id+'.json'))===h,'Original data changed');
const manifest={schema:1,data_id:m.data_id,analysis_id:analysisId,policy_version:r.policy_version,model:r.model,generated_at:r.generated_at,quality_status:r.quality_status,source_rows:m.stats.source_record_count,annual_rows:m.stats.annual_rows,linked_groups:linked,identity:identity.audit,status_counts:r.status_counts,usage:r.usage,topics:Object.fromEntries(Object.entries(allNames).map(([k,label])=>[k,{label,question:extendedTopics[k]?.question??questions[k]}]))};
write(target+'/index.json',enhanced);write(target+'/topic-counts.json',statuses);write(target+'/manifest.json',manifest);write(dist+'/insights-manifest.json',manifest);
write('artifacts/sitewide/verification.json',{status:'PASS',data_id:m.data_id,analysis_id:analysisId,source_rows:m.stats.source_record_count,display_groups:enhanced.length,linked_groups:linked,annual_rows:seen.size,original_data_unchanged:true,new_topic_statuses:statuses});
console.log(JSON.stringify({status:'PASS',linked,annual:seen.size,groups:enhanced.length,analysis_id:analysisId}));
