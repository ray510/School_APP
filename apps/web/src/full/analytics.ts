import type {Classification} from './classification';
export const tagNames:Record<string,string>={after_school_support:'課後學習支援',ncs_support:'非華語學生支援',sen_support:'特殊教育需要支援',english_enrichment:'英文延伸活動',stem_activities:'STEM／科技探究活動',home_school:'家校合作'};
export const statusNames:Record<string,string>={MENTIONED:'片段明確提及',EXPLICITLY_ABSENT:'片段明確否定',NOT_STATED:'片段未提及',CONFLICTING:'原文有衝突',REVIEW:'待覆核',NOT_ANALYZED:'未分析',API_ERROR:'模型呼叫失敗',INVALID_RESPONSE:'模型回應無效'};
export interface EvidenceSpan {id:string;field:string;start:number;end:number;text:string}
export interface TagResult {status:string;proposed_verdict?:string;reason?:string;evidence:EvidenceSpan|null;confidence?:number;probabilities?:Record<string,number>;human_review:false}
export interface Annotation {source_id:string;row:number;record_sha256:string;status:string;labels:Record<string,TagResult>;model_requested?:string;model_returned?:string|null;excerpts_truncated?:boolean}
export interface AnalyticsRow {school_id:string;name:string;source_id:string;edition:string;row:number;record_sha256:string;level:string;district:string;classification:Classification;analysis_status:string;labels:Record<string,TagResult>}
export interface AnalyticsData {schema:number;policy_version:string;status:string;reason:string|null;quality_status:string;provider:string|null;model_requested:string|null;model_returned:string[];cohort_unit:string;cohort_counts:Record<string,number>;status_counts:Record<string,number>;entries:AnalyticsRow[];usage:{requests:number;input_tokens:number|null;output_tokens:number|null;max_usd?:number;reserved_usd_upper_estimate?:number};contract_canary?:{status:string;scope:string}}
export function dimensionCounts(rows:AnalyticsRow[],field:keyof Classification):Array<{label:string;count:number}> {
 const m=new Map<string,number>();
 for(const r of rows){const d=r.classification[field];if(typeof d==='string'||!d)continue;const label=d.label;m.set(label,(m.get(label)??0)+1);}
 return [...m].map(([label,count])=>({label,count})).sort((a,b)=>a.label.localeCompare(b.label,'zh-HK'));
}
export function tagCounts(rows:AnalyticsRow[],tag:string):Record<string,number> {
 const counts:Record<string,number>=Object.fromEntries(Object.keys(statusNames).map(k=>[k,0]));
 for(const row of rows){const status=row.labels[tag]?.status??'NOT_ANALYZED';counts[status]=(counts[status]??0)+1;}
 return counts;
}
export function percentage(count:number,total:number):string {return total?((count/total)*100).toFixed(1)+'%':'—';}
