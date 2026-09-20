/** Source-backed view joins. Original source files and saved school IDs never change. */
import {readJSON, type Annual, type School, type Source, type Manifest, type Summary, type Directory} from './catalog';
import type {Dimension, ClassificationEvidence} from './classification';

export interface ProfileProof {
  source_id:string; edition:string; row:number; record_sha256:string; from_school_id:string;
  school_number:string; location_id:string; method:string; checks:string[];
  directory_address:string; profile_address:string; address_differs:boolean;
}
export interface ProfileCandidate {
  source_id:string; edition:string; row:number; record_sha256:string; from_school_id:string;
  checks:string[]; directory_name:string; directory_address:string; profile_name:string; profile_address:string;
}
export interface ProfileResolution {
  version:'source-identity-view-v2'; links:ProfileProof[]; candidates:ProfileCandidate[]; warnings:string[];
  session_evidence:Array<{school_id:string;row:number;record_sha256:string;session:string}>;
}
export type IdentityState='SOURCE_GROUP'|'EVIDENCE_LINKED'|'REVIEW_REQUIRED'|'NO_CANDIDATE'|'DIRECTORY_ONLY';
export interface IdentityIndexEntry {state:IdentityState;linked_ids:string[];candidate_ids:string[]}
export interface IdentityAuditLevel {annual_only_rows:number;evidence_linked_rows:number;review_required_rows:number;no_candidate_rows:number}
export interface IdentityAudit extends IdentityAuditLevel {policy_version:'source-identity-view-v2';by_level:Record<string,IdentityAuditLevel>}
export interface IdentityMap {entries:Record<string,IdentityIndexEntry>;audit:IdentityAudit}
export interface IdentityManifest {schema:1;data_id:string;identity_id:string;policy_version:'source-identity-view-v2';generated_at:string;display_groups:number;audit:IdentityAudit}
export const identityText=(value:string):string=>value.normalize('NFKC').toUpperCase().replace(/\s+/g,'').trim();
const addressDigits:Record<string,string>={零:'0',〇:'0',一:'1',二:'2',三:'3',四:'4',五:'5',六:'6',七:'7',八:'8',九:'9'};
const addressText=(value:string):string=>identityText(value).replace(/[零〇一二三四五六七八九]/g,v=>addressDigits[v]).replace(/[，,。.;；]/g,'');
const phone=(value:string|undefined):string=>String(value??'').replace(/[^0-9]/g,'');
const website=(value:string|undefined):string=>String(value??'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
const districtText=(value:string|undefined):string=>identityText(value??'').replace(/^(?:香港|九龍|新界)/,'');
export function directoryKey(row:Directory):string|null {
  const value=row.fields['SCHOOL NO.']??row.source_key;
  return /^\d{12}$/.test(value)?value.slice(0,10):null;
}
export function annualKey(a:Annual):string|null {
  const code=a.fields['學校編號']?.trim(),location=a.fields['校址編號']?.trim();
  return code&&location&&/^\d{6}$/.test(code)&&/^\d{1,4}$/.test(location)?code+location.padStart(4,'0'):null;
}
function sharedContact(row:Directory,a:Annual):string[] {
  return [['電話',row.fields['聯絡電話']??row.fields.TELEPHONE,a.fields['電話']??a.fields['學校電話']],['傳真',row.fields['傳真號碼']??row.fields['FAX NUMBER'],a.fields['傳真']??a.fields['學校傳真']]]
    .filter(([,left,right])=>phone(left).length===8&&phone(left)===phone(right)).map(([label])=>label+'一致');
}
function sharedWebsite(row:Directory,a:Annual):boolean {
  const left=website(row.fields['網址']??row.fields.WEBSITE),right=website(a.fields['學校網址']);return Boolean(left&&right&&left===right);
}
interface MatchEvidence {key:string|null;name:string;addr:string;sameName:boolean;sameAddress:boolean;sameDistrict:boolean;row:Directory;checks:string[]}
function matchEvidence(base:School,donor:School,a:Annual):MatchEvidence[] {
  if(base.level!==donor.level||!base.directory.length)return [];
  const key=annualKey(a),name=a.fields['學校名稱']??donor.name,addr=a.fields['地址']??a.fields['學校地址']??donor.address;
  const sameName=identityText(base.name)===identityText(name),sameAddress=addressText(base.address)===addressText(addr);
  const profileDistrict=a.fields['地區']??a.fields['區域']??donor.district;
  return base.directory.map(row=>{
    const contacts=sharedContact(row,a),sameWebsite=sharedWebsite(row,a),sameDistrict=Boolean(districtText(base.district)&&districtText(base.district)===districtText(profileDistrict));
    const checks=[...(base.level==='KG'&&key!==null&&directoryKey(row)===key?['學校編號一致','校址編號一致']:[]),...(sameName?['校名正規化一致']:[]),...(sameAddress?['地址正規化一致']:[]),...contacts,...(sameWebsite?['網址一致']:[]),...(sameDistrict?['地區一致']:[])];
    return {key,name,addr,sameName,sameAddress,sameDistrict,row,checks};
  });
}
export function profileProof(base:School,donor:School,a:Annual):ProfileProof|null {
  for(const evidence of matchEvidence(base,donor,a)){
    const keyMatch=evidence.checks.includes('學校編號一致')&&evidence.checks.includes('校址編號一致');
    const contact=evidence.checks.includes('電話一致')||evidence.checks.includes('傳真一致'),sameWebsite=evidence.checks.includes('網址一致');
    const linked=base.level==='KG'
      ? keyMatch&&evidence.sameName&&(evidence.sameAddress||contact||sameWebsite)
      : evidence.sameName&&((evidence.sameAddress&&(contact||sameWebsite))||(contact&&sameWebsite&&evidence.sameDistrict));
    if(!linked)continue;
    return {source_id:a.source_id,edition:a.edition,row:a.row,record_sha256:a.record_sha256,from_school_id:donor.id,
      school_number:evidence.key?.slice(0,6)??'',location_id:evidence.key?.slice(6)??'',
      method:base.level==='KG'?'SCHOOL_CAMPUS_NAME_AND_CORROBORATION':evidence.sameAddress?'NORMALIZED_NAME_ADDRESS_AND_CONTACT':'NORMALIZED_NAME_CONTACT_WEBSITE_AND_DISTRICT',
      checks:evidence.checks,directory_address:base.address,profile_address:evidence.addr,address_differs:!evidence.sameAddress};
  }
  return null;
}
export function profileCandidate(base:School,donor:School,a:Annual):ProfileCandidate|null {
  if(profileProof(base,donor,a))return null;
  for(const evidence of matchEvidence(base,donor,a)){
    const keyMatch=evidence.checks.includes('學校編號一致')&&evidence.checks.includes('校址編號一致');
    const contact=evidence.checks.includes('電話一致')||evidence.checks.includes('傳真一致'),sameWebsite=evidence.checks.includes('網址一致');
    const review=base.level==='KG'?keyMatch:evidence.sameName||evidence.sameAddress&&(contact||sameWebsite)||contact&&sameWebsite&&evidence.sameDistrict;
    if(!review)continue;
    return {source_id:a.source_id,edition:a.edition,row:a.row,record_sha256:a.record_sha256,from_school_id:donor.id,checks:evidence.checks,
      directory_name:base.name,directory_address:base.address,profile_name:evidence.name,profile_address:evidence.addr};
  }
  return null;
}
const emptyEntry=():IdentityIndexEntry=>({state:'DIRECTORY_ONLY',linked_ids:[],candidate_ids:[]});
export function buildIdentityMap(records:School[]):IdentityMap {
  const entries=Object.fromEntries(records.map(r=>[r.id,emptyEntry()]));
  const dirs=records.filter(r=>r.directory.length),linkedRows=new Set<string>(),reviewRows=new Set<string>(),noCandidateRows=new Set<string>();
  const levels:Record<string,IdentityAuditLevel>={};
  const rowKey=(a:Annual)=>a.source_id+':'+a.edition+':'+a.row+':'+a.record_sha256;
  // ponytail: ~3.6k display groups keep this full evidence scan simple; index signals if the catalog grows materially.
  for(const donor of records.filter(r=>r.annual.length&&!r.directory.length))for(const a of donor.annual){
    const sameLevel=dirs.filter(base=>base.level===donor.level);let linked=sameLevel.filter(base=>profileProof(base,donor,a));
    if(donor.level!=='KG'){const sameAddress=linked.filter(base=>!profileProof(base,donor,a)!.address_differs);if(sameAddress.length)linked=sameAddress;}
    const candidates=linked.length?[]:sameLevel.filter(base=>profileCandidate(base,donor,a));
    const key=rowKey(a),level=levels[donor.level]??={annual_only_rows:0,evidence_linked_rows:0,review_required_rows:0,no_candidate_rows:0};levels[donor.level]=level;level.annual_only_rows++;
    if(linked.length){linkedRows.add(key);level.evidence_linked_rows++;entries[donor.id].linked_ids.push(...linked.map(x=>x.id));for(const base of linked)entries[base.id].linked_ids.push(donor.id);}
    else if(candidates.length){reviewRows.add(key);level.review_required_rows++;entries[donor.id].candidate_ids.push(...candidates.map(x=>x.id));for(const base of candidates)entries[base.id].candidate_ids.push(donor.id);}
    else{noCandidateRows.add(key);level.no_candidate_rows++;}
  }
  for(const record of records){const entry=entries[record.id];entry.linked_ids=[...new Set(entry.linked_ids)].sort();entry.candidate_ids=[...new Set(entry.candidate_ids)].sort();entry.state=record.directory.length&&record.annual.length?'SOURCE_GROUP':entry.linked_ids.length?'EVIDENCE_LINKED':entry.candidate_ids.length?'REVIEW_REQUIRED':record.annual.length?'NO_CANDIDATE':'DIRECTORY_ONLY';}
  const audit:IdentityAudit={policy_version:'source-identity-view-v2',annual_only_rows:linkedRows.size+reviewRows.size+noCandidateRows.size,evidence_linked_rows:linkedRows.size,review_required_rows:reviewRows.size,no_candidate_rows:noCandidateRows.size,by_level:levels};
  if(audit.annual_only_rows!==Object.values(levels).reduce((n,v)=>n+v.annual_only_rows,0)||audit.annual_only_rows!==audit.evidence_linked_rows+audit.review_required_rows+audit.no_candidate_rows)throw new Error('Identity audit partition mismatch');
  return {entries,audit};
}
export async function loadIdentityIndex(dataId:string,annualOnlyRows:number):Promise<{manifest:IdentityManifest;rows:Summary[]}> {
  const manifest=await readJSON<IdentityManifest>('/identity-manifest.json');
  if(manifest.schema!==1||manifest.data_id!==dataId||manifest.policy_version!=='source-identity-view-v2'||manifest.audit.policy_version!==manifest.policy_version||!/^([a-f0-9]){64}$/.test(manifest.identity_id)||manifest.audit.annual_only_rows!==annualOnlyRows||manifest.audit.annual_only_rows!==manifest.audit.evidence_linked_rows+manifest.audit.review_required_rows+manifest.audit.no_candidate_rows)throw new Error('身份索引與原始資料版本不一致。');
  const rows=await readJSON<Summary[]>('/identity/'+manifest.identity_id+'/index.json');
  if(rows.length!==manifest.display_groups||rows.some(row=>!row.identity))throw new Error('身份索引不完整。');
  return {manifest,rows};
}
function kgDimension(profiles:Annual[],sources:Source[],field:string,map:Record<string,[string,string]>):Dimension {
  const evidence:ClassificationEvidence[]=profiles.filter(a=>a.source_id==='edb-kg-profiles').map(a=>{
    const s=sources.find(s=>s.id===a.source_id);return {source_id:a.source_id,edition:a.edition,source_url:s?.url??'',source_sha256:s?.sha256??'',record_sha256:a.record_sha256,row:a.row,field,raw_value:a.fields[field]??'',reference_period:null};
  });
  const present=evidence.map(e=>e.raw_value.trim()).filter(v=>v&&!['-','N.A.','N/A'].includes(v));
  if(!present.length)return {value:null,label:'來源未提供',state:'not_provided',evidence};
  if(present.some(v=>!Object.prototype.hasOwnProperty.call(map,v)))return {value:null,label:'來源分類待核對',state:'unrecognized',evidence};
  if(new Set(present).size!==1)return {value:null,label:'來源版本分類有差異',state:'conflict',evidence};
  const [value,label]=map[present[0]];return {value,label,state:'known',evidence};
}
export function resolveProfiles(base:School,candidates:School[],sources:Source[]):School {
  const out:School={...base,annual:[...base.annual],semantic_annotations:[...(base.semantic_annotations??[])],sessions:[...base.sessions],classification:{...base.classification}};
  const resolution:ProfileResolution={version:'source-identity-view-v2',links:[],candidates:[],warnings:[],session_evidence:[]};
  const groups=new Map<string,Array<{donor:School;a:Annual;proof:ProfileProof}>>();
  for(const donor of candidates){for(const a of donor.annual){
    if(out.annual.some(p=>p.source_id===a.source_id&&p.edition===a.edition))continue;
    const proof=profileProof(base,donor,a);if(!proof){const candidate=profileCandidate(base,donor,a);if(candidate&&!resolution.candidates.some(x=>x.record_sha256===candidate.record_sha256&&x.from_school_id===candidate.from_school_id))resolution.candidates.push(candidate);continue;}
    const cohort=JSON.stringify([a.source_id,a.edition]);const list=groups.get(cohort)??[];
    if(!list.some(x=>x.a.record_sha256===a.record_sha256&&x.a.row===a.row)){list.push({donor,a,proof});groups.set(cohort,list);}
  }}
  for(const group of groups.values()){
    if(group.length!==1){resolution.warnings.push('同一來源版本有多筆候選，未自動選取。');continue;}
    const {donor,a,proof}=group[0];out.annual.push(a);resolution.links.push(proof);
    out.semantic_annotations.push(...(donor.semantic_annotations??[]).filter(x=>x.source_id===a.source_id&&x.row===a.row&&x.record_sha256===a.record_sha256));
  }
  if(base.level==='KG'&&out.annual.length){
    out.classification.kg_operator_type=kgDimension(out.annual,sources,'學校類別',{'非牟利':['NON_PROFIT','非牟利'],'私立獨立':['PRIVATE_INDEPENDENT','私立獨立']});
    out.classification.kg_scheme_participation=kgDimension(out.annual,sources,'參加幼稚園教育計劃',{'有參加':['PARTICIPATING','參加幼稚園教育計劃'],'沒有參加':['NOT_PARTICIPATING','未參加幼稚園教育計劃'],'申請審核中':['PENDING','幼稚園教育計劃申請審核中']});
    // An alternate-width address may have split the same campus's registered sessions.
    const keys=new Set(base.directory.map(directoryKey).filter(Boolean));
    for(const donor of [base,...candidates]){
      if(donor.level!==base.level||identityText(donor.name)!==identityText(base.name))continue;
      for(const d of donor.directory){
        if(!keys.has(directoryKey(d))||!out.annual.some(a=>profileProof(donor,donor,a)))continue;
        const session=d.fields['學校授課時間'];if(!session)continue;
        if(!out.sessions.includes(session))out.sessions.push(session);
        if(!resolution.session_evidence.some(e=>e.school_id===donor.id&&e.row===d.row))resolution.session_evidence.push({school_id:donor.id,row:d.row,record_sha256:d.record_sha256,session});
      }
    }
  }
  out.profile_resolution=resolution;return out;
}
export async function loadSchoolDetails(m:Manifest,id:string,index?:Summary[]):Promise<School> {
  if(!/^school_[a-f0-9]{24}$/.test(id)||!/^([a-f0-9]){64}$/.test(m.data_id))throw new Error('來源資料識別不正確。');
  const prefix='/data/'+m.data_id;
  const base=await readJSON<School>(prefix+'/schools/'+id+'.json');
  if(base.id!==id||!Array.isArray(base.annual)||!Array.isArray(base.directory))throw new Error('學校來源紀錄不一致。');
  if(!base.directory.length)return base;
  const rows=index??await readJSON<Summary[]>(prefix+'/index.json');
  const summary=rows.find(s=>s.id===id),mapped=[...(summary?.identity?.linked_ids??[]),...(summary?.identity?.candidate_ids??[])];
  const ids=(mapped.length?mapped:rows.filter(s=>s.id!==id&&s.level===base.level&&identityText(s.name)===identityText(base.name)&&(s.annual_rows>0||base.level==='KG')).map(s=>s.id)).filter((candidate,i,all)=>candidate!==id&&all.indexOf(candidate)===i);
  if(ids.length>24)return {...base,profile_resolution:{version:'source-identity-view-v2',links:[],candidates:[],warnings:['身份候選過多，需要人工核對。'],session_evidence:[]}};
  const candidates=await Promise.all(ids.map(async candidate=>{
    if(!/^school_[a-f0-9]{24}$/.test(candidate))throw new Error('候選資料識別不正確。');
    const value=await readJSON<School>(prefix+'/schools/'+candidate+'.json');if(value.id!==candidate)throw new Error('候選來源紀錄不一致。');return value;
  }));
  return resolveProfiles(base,candidates,m.sources);
}
