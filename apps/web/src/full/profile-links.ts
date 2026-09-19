/** Source-backed view joins. Original source files and saved school IDs never change. */
import {readJSON, type Annual, type School, type Source, type Manifest, type Summary, type Directory} from './catalog';
import type {Dimension, ClassificationEvidence} from './classification';

export interface ProfileProof {
  source_id:string; edition:string; row:number; record_sha256:string; from_school_id:string;
  school_number:string; location_id:string; method:string; checks:string[];
  directory_address:string; profile_address:string; address_differs:boolean;
}
export interface ProfileResolution {
  version:'source-identity-view-v1'; links:ProfileProof[]; warnings:string[];
  session_evidence:Array<{school_id:string;row:number;record_sha256:string;session:string}>;
}
export const identityText=(value:string):string=>value.normalize('NFKC').toUpperCase().replace(/\s+/g,'').trim();
const addressText=(value:string):string=>identityText(value).replace(/[，,。.;；]/g,'');
const phone=(value:string|undefined):string=>String(value??'').replace(/[^0-9]/g,'');
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
export function profileProof(base:School,donor:School,a:Annual):ProfileProof|null {
  if(base.level!==donor.level||identityText(base.name)!==identityText(a.fields['學校名稱']??donor.name)||!base.directory.length)return null;
  const key=annualKey(a),addr=a.fields['地址']??a.fields['學校地址']??donor.address;
  // KG sources have a shared school + campus identifier. Never use a school name alone.
  const rows=base.directory.filter(d=>base.level==='KG'?key!==null&&directoryKey(d)===key:addressText(base.address)===addressText(addr));
  for(const d of rows){
    const checks=sharedContact(d,a),sameAddress=addressText(base.address)===addressText(addr);
    if(!sameAddress&&!checks.length)continue;
    if(base.level!=='KG'&&!checks.length)continue;
    return {source_id:a.source_id,edition:a.edition,row:a.row,record_sha256:a.record_sha256,from_school_id:donor.id,
      school_number:key?.slice(0,6)??'',location_id:key?.slice(6)??'',
      method:base.level==='KG'?'SCHOOL_CAMPUS_NAME_AND_CORROBORATION':'NORMALIZED_NAME_ADDRESS_AND_CONTACT',
      checks:[...(base.level==='KG'?['學校編號一致','校址編號一致']:[]),'校名正規化一致',...(sameAddress?['地址正規化一致']:[]),...checks],
      directory_address:base.address,profile_address:addr,address_differs:!sameAddress};
  }
  return null;
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
  const resolution:ProfileResolution={version:'source-identity-view-v1',links:[],warnings:[],session_evidence:[]};
  const groups=new Map<string,Array<{donor:School;a:Annual;proof:ProfileProof}>>();
  for(const donor of candidates){for(const a of donor.annual){
    if(out.annual.some(p=>p.source_id===a.source_id&&p.edition===a.edition))continue;
    const proof=profileProof(base,donor,a);if(!proof)continue;
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
  const ids=rows.filter(s=>s.id!==id&&s.level===base.level&&identityText(s.name)===identityText(base.name)&&(s.annual_rows>0||base.level==='KG')).map(s=>s.id);
  if(ids.length>16)return {...base,profile_resolution:{version:'source-identity-view-v1',links:[],warnings:['同名候選過多，需要人工核對。'],session_evidence:[]}};
  const candidates=await Promise.all(ids.map(async candidate=>{
    if(!/^school_[a-f0-9]{24}$/.test(candidate))throw new Error('候選資料識別不正確。');
    const value=await readJSON<School>(prefix+'/schools/'+candidate+'.json');if(value.id!==candidate)throw new Error('候選來源紀錄不一致。');return value;
  }));
  return resolveProfiles(base,candidates,m.sources);
}
