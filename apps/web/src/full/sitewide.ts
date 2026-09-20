/** Shared public evidence projection. Never turn private notes or missing data into model inputs. */
import {readJSON,type Summary} from './catalog';
import type {ComparisonCell} from './comparison';
import type {IdentityAudit} from './profile-links';
export const extendedTopics:Record<string,{label:string;question:string}>={
 inquiry_play:{label:'遊戲及探究教學',question:'每天有多少遊戲、探究或專題時間？學生可以怎樣自主選擇？'},
 transition_support:{label:'入學適應及升學銜接',question:'目標學年的適應或銜接活動何時進行？家長如何參與？'},
 wellbeing_support:{label:'情緒及輔導支援',question:'如何申請輔導支援？由哪些專業人員提供，頻次如何？'},
 arts_sports:{label:'藝術及體育活動',question:'有哪些恆常活動？參與名額、頻次及額外費用如何？'}
};
export interface InsightTopic {id:string;label:string;question:string;cell:ComparisonCell}
export interface SchoolInsight {id:string;name:string;data_id:string;analysis_id:string;topics:InsightTopic[];source_refs:Array<{source_id:string;edition:string;row:number;record_sha256:string}>}
export interface InsightSummary extends Summary {profile_count:number;linked_profile_count:number;jev_tags:Record<string,string>}
export interface InsightManifest {schema:number;data_id:string;analysis_id:string;policy_version:string;model:string;generated_at:string;quality_status:string;source_rows:number;annual_rows:number;linked_groups:number;identity?:IdentityAudit;status_counts:Record<string,number>;usage:{requests:number;input_tokens:number|null;reserved_usd_upper_estimate:number};topics:Record<string,{label:string;question:string}>}
let latest:Promise<InsightManifest>|null=null;
export function insightManifest(dataId?:string):Promise<InsightManifest>{
 if(!latest)latest=readJSON<InsightManifest>('/insights-manifest.json').catch(e=>{latest=null;throw e;});
 return latest.then(m=>{if(m.schema!==1||!/^([a-f0-9]){64}$/.test(m.analysis_id)||dataId&&dataId!==m.data_id)throw new Error('分析與原始資料版本不一致，請重新整理。');return m;});
}
export async function insightFor(id:string,dataId:string):Promise<SchoolInsight>{
 if(!/^school_[a-f0-9]{24}$/.test(id))throw new Error('學校ID不正確');
 const m=await insightManifest(dataId);const s=await readJSON<SchoolInsight>('/insights/'+m.analysis_id+'/schools/'+id+'.json');
 if(s.id!==id||s.data_id!==dataId||s.analysis_id!==m.analysis_id)throw new Error('學校分析版本不一致');return s;
}
export function acceptedTags(s:InsightSummary):string[]{return Object.keys(s.jev_tags??{}).filter(k=>s.jev_tags[k]==='MENTIONED');}
export function matchesTag(s:InsightSummary,tag:string,status:string):boolean{return !tag||(s.jev_tags?.[tag]??'NO_PROFILE')===status;}
