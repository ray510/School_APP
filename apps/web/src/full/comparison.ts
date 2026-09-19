/** Comparison of published Jev judgments, never a new model call or school ranking. */
import type {School, Source, Annual} from './catalog';
import {tagNames, type Annotation, type EvidenceSpan, type TagResult} from './analytics';

export const comparisonStatus:Record<string,string> = {
  MENTIONED:'片段明確提及', EXPLICITLY_ABSENT:'片段明確否定', NOT_STATED:'片段未提及',
  REVIEW:'待覆核', INVALID_RESPONSE:'模型回應無效', API_ERROR:'模型呼叫失敗',
  NOT_ANALYZED:'未分析', NO_PROFILE:'沒有直接對應概覽', VERSION_MISMATCH:'所選版本未有資料',
  MULTIPLE_RECORDS:'同版本有多筆，需確認', EVIDENCE_MISMATCH:'引文未通過核對',
  MODEL_UNKNOWN:'模型版本未提供'
};
export interface Cohort {key:string;source_id:string;edition:string;label:string;schools:number}
export interface ComparisonCell {
  school_id:string;name:string;status:string;reason:string|null;source_id:string|null;
  edition:string|null;row:number|null;record_sha256:string|null;model:string|null;
  evidence:EvidenceSpan|null;confidence:number|null;excerpts_truncated:boolean;
}
export type Relation='COMMON_MENTION'|'EXPLICIT_DIFFERENCE'|'DOCUMENTATION_DIFFERENCE'|'COMMON_ABSENCE'|'NOT_DOCUMENTED'|'INSUFFICIENT';
export interface ComparisonTopic {id:string;label:string;relation:Relation;summary:string;cells:ComparisonCell[]}
export const cohortKey=(source_id:string,edition:string):string=>JSON.stringify([source_id,edition]);
export function cohortsFor(schools:School[],sources:Source[]):Cohort[] {
  const cohorts=new Map<string,Cohort>();
  for(const school of schools){const seen=new Set<string>();for(const a of school.annual){
    const key=cohortKey(a.source_id,a.edition);if(seen.has(key))continue;seen.add(key);
    const value=cohorts.get(key)??{key,source_id:a.source_id,edition:a.edition,label:(sources.find(s=>s.id===a.source_id)?.label??a.source_id)+' · '+a.edition,schools:0};
    value.schools++;cohorts.set(key,value);
  }}
  return [...cohorts.values()].sort((a,b)=>b.schools-a.schools||a.key.localeCompare(b.key));
}
export function validEvidence(e:EvidenceSpan|null|undefined,fields:Record<string,string>):e is EvidenceSpan {
  if(!e||typeof e.field!=='string'||typeof e.text!=='string'||!e.text.trim()||!Object.prototype.hasOwnProperty.call(fields,e.field))return false;
  if(!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<=e.start)return false;
  // Python source offsets count Unicode code points, not JavaScript UTF-16 code units.
  const chars=Array.from(fields[e.field]);return e.end<=chars.length&&chars.slice(e.start,e.end).join('')===e.text;
}
function thresholdValid(r:TagResult):boolean {
  const p=r.probabilities,keys=['MENTIONED','EXPLICITLY_ABSENT','NOT_STATED','CONFLICTING'];
  if(!p||Object.keys(p).length!==keys.length||keys.some(k=>!Object.prototype.hasOwnProperty.call(p,k)||!Number.isFinite(p[k])||p[k]<0||p[k]>1))return false;
  const values=Object.values(p).sort((a,b)=>b-a);
  return Math.abs(values.reduce((a,b)=>a+b,0)-1)<=0.02&&Number.isFinite(r.confidence)&&r.confidence! >= 0.8&&r.confidence! <= 1&&p[r.status]>=0.9&&p[r.status]===values[0]&&values[0]-values[1]>=0.5;
}
export function cellFor(school:School,tag:string,cohort:string):ComparisonCell {
  const base:ComparisonCell={school_id:school.id,name:school.name,status:'NO_PROFILE',reason:null,source_id:null,edition:null,row:null,record_sha256:null,model:null,evidence:null,confidence:null,excerpts_truncated:false};
  if(!school.annual.length)return base;
  const profiles=school.annual.filter(a=>cohortKey(a.source_id,a.edition)===cohort);
  if(!profiles.length)return {...base,status:'VERSION_MISMATCH'};
  if(profiles.length!==1)return {...base,status:'MULTIPLE_RECORDS'};
  const profile:Annual=profiles[0];Object.assign(base,{source_id:profile.source_id,edition:profile.edition,row:profile.row,record_sha256:profile.record_sha256});
  const matches=(school.semantic_annotations??[]).filter((a:Annotation)=>a.source_id===profile.source_id&&a.row===profile.row&&a.record_sha256===profile.record_sha256);
  if(matches.length!==1)return {...base,status:matches.length?'MULTIPLE_RECORDS':'NOT_ANALYZED'};
  const annotation=matches[0],result=annotation.labels[tag];base.excerpts_truncated=Boolean(annotation.excerpts_truncated);
  base.model=annotation.model_returned??null;
  if(annotation.status!=='ANALYZED')return {...base,status:['INVALID_RESPONSE','API_ERROR','NOT_ANALYZED'].includes(annotation.status)?annotation.status:'INVALID_RESPONSE'};
  if(!result)return {...base,status:'INVALID_RESPONSE'};
  if(result.evidence&&!validEvidence(result.evidence,profile.fields))return {...base,status:'EVIDENCE_MISMATCH'};
  base.evidence=result.evidence??null;base.confidence=Number.isFinite(result.confidence)?result.confidence!:null;base.reason=result.reason??null;
  if(!base.model)return {...base,status:'MODEL_UNKNOWN'};
  if(result.status==='REVIEW'||result.status==='CONFLICTING')return {...base,status:'REVIEW'};
  if(!['MENTIONED','EXPLICITLY_ABSENT','NOT_STATED'].includes(result.status))return {...base,status:comparisonStatus[result.status]?result.status:'INVALID_RESPONSE'};
  if(!thresholdValid(result))return {...base,status:'REVIEW',reason:'未符合既有模型判斷門檻'};
  if((result.status==='MENTIONED'||result.status==='EXPLICITLY_ABSENT')&&!base.evidence)return {...base,status:'EVIDENCE_MISMATCH'};
  if(result.status==='NOT_STATED'&&base.evidence)return {...base,status:'REVIEW',reason:'未提及判斷與引文狀態不一致'};
  return {...base,status:result.status};
}
export function relationFor(cells:ComparisonCell[]):{relation:Relation;summary:string} {
  const n=cells.length,states=cells.map(c=>c.status),mentioned=states.filter(s=>s==='MENTIONED').length,absent=states.filter(s=>s==='EXPLICITLY_ABSENT').length;
  const unknown=states.filter(s=>!['MENTIONED','EXPLICITLY_ABSENT','NOT_STATED'].includes(s)).length;
  if(n<2)return {relation:'INSUFFICIENT',summary:'請選兩至四個同學段資料項目。'};
  if(new Set(cells.filter(c=>c.model).map(c=>c.model)).size>1)return {relation:'INSUFFICIENT',summary:'模型版本不同；保留各校結果，不作共同結論。'};
  if(mentioned===n)return {relation:'COMMON_MENTION',summary:'所選 '+n+' 項來源片段均有提及；不代表服務內容、時數或品質相同。'};
  if(mentioned>0&&absent>0)return {relation:'EXPLICIT_DIFFERENCE',summary:'部分来源明確提及，部分明確否定；這是所示原文的記載差異，不代表現時服務優劣。'+(unknown?' 另有 '+unknown+' 項未能確定。':'')};
  if(unknown)return {relation:'INSUFFICIENT',summary:'有 '+unknown+' 項待覆核、缺少同版資料或模型结果不可用，不能作完整結論。'};
  if(absent===n)return {relation:'COMMON_ABSENCE',summary:'所選來源片段均明確否定；仍須按所示年份向學校核實現時安排。'};
  if(mentioned>0)return {relation:'DOCUMENTATION_DIFFERENCE',summary:'部分来源片段有提及，其餘片段未提及；不能稱為某校獨有或另一校沒有。'};
  if(states.every(s=>s==='NOT_STATED'))return {relation:'NOT_DOCUMENTED',summary:'所選送審片段都未提及；不是全部學校都沒有提供。'};
  return {relation:'INSUFFICIENT',summary:'部分片段明確否定、部分未提及；不能當成一致的服務結論。'};
}
export function compareJev(schools:School[],cohort:string):ComparisonTopic[] {
  if(schools.length<2||schools.length>4||new Set(schools.map(s=>s.id)).size!==schools.length||new Set(schools.map(s=>s.level)).size!==1)throw new Error('請選擇兩至四個不同的同學段資料項目。');
  return Object.entries(tagNames).map(([id,label])=>{const cells=schools.map(s=>cellFor(s,id,cohort));return {id,label,cells,...relationFor(cells)};});
}
