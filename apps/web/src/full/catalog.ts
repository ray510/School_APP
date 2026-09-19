import {evidencePeriod,type Classification} from './classification';
import type {Annotation} from './analytics';
export type Level='KG'|'PRIMARY'|'SECONDARY'|'SPECIAL'|'OTHER';
export const levels:Record<Level,string>={KG:'幼稚園',PRIMARY:'小學',SECONDARY:'中學',SPECIAL:'特殊學校',OTHER:'其他'};
export interface Source {id:string;label:string;edition:string;catalog_url:string;url:string;fetched_at:string;sha256:string;rows:number;columns:number;published_rows:number;excluded_rows:number;coverage:number}
export interface Manifest {data_id:string;environment:string;coverage_status:string;generated_at:string;sources:Source[];stats:{source_record_count:number;display_groups:number;directory_display_groups:number;annual_rows:number;by_level:Record<string,number>};event_count:number;version_note:string;sample_limit:null;synthetic_records:number}
export interface Summary {classification:Classification;id:string;name:string;english_name:string;address:string;district:string;level:Level;funding:string;category:string;sessions:string[];association:string;directory_rows:number;annual_rows:number;source_ids:string[];school_numbers:string[]}
export interface Directory {row:number;source_key:string;fields:Record<string,string>;record_sha256:string}
export interface Annual {source_id:string;edition:string;row:number;fields:Record<string,string>;record_sha256:string}
export interface School extends Omit<Summary,'directory_rows'|'annual_rows'|'source_ids'|'school_numbers'> {directory:Directory[];annual:Annual[];semantic_annotations:Annotation[]}
export interface Admission {id:string;title:string;level:Level;entry_year:number;school_id:string|null;starts_on:string;ends_on:string|null;description:string;applicability:string;route:string;source_url:string;evidence_sha256:string;checked_at:string;school_catalog_ids:string[]}
export function safeLink(value:string|undefined):string|null {try{const u=new URL(value??'');return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function display(value:string|undefined):string {if(!value?.trim()||/^(?:N\.?A\.?|[-–—])$/i.test(value.trim()))return '來源未提供';return value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'');}
export function normalized(value:string):string {return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');}
export async function readJSON<T>(path:string):Promise<T> {const r=await fetch(path,{signal:AbortSignal.timeout(15000)});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('資料暫時未能載入，請重新整理。');return r.json() as Promise<T>;}
export function fieldsFor(school:School):Array<[string,string,string]> {
 const base:Array<[string,string,string]>=[['地區',school.district,'教育局名錄／概覽原文'],['地址',school.address,'教育局名錄／概覽原文'],['授課時間',school.sessions.join('、'),'教育局名錄']];
 const c=school.classification;
 if(school.level==='KG'){base.push(['幼稚園營辦性質',c.kg_operator_type.label,evidencePeriod(c.kg_operator_type)],['幼稚園教育計劃',c.kg_scheme_participation.label,evidencePeriod(c.kg_scheme_participation)]);}else{base.push(['官方資助類別',c.funding_type.label,evidencePeriod(c.funding_type)]);}
 const wanted=school.level==='KG'?['參加幼稚園教育計劃','課程類別','學生類別','收費證明書','對非華語學童的支援','對有特殊需要的學童的支援']:school.level==='PRIMARY'?['小一學校網','教學語言','學校類別2','學生性別','學費','一般上學時間','一般上學時段','一般放學時間','一般放學時段','校車','保姆車','一條龍中學','直屬中學','聯繫中學']:['學生性別','全校語文政策','中一入學','全校參與模式融合教育'];
 for(const annual of school.annual){for(const label of wanted){base.push([label,annual.fields[label]??'',annual.edition]);}if(school.level==='SECONDARY')for(const [k,v]of Object.entries(annual.fields))if(/學費S1$/.test(k))base.push([k,v,annual.edition]);}
 if(!school.annual.length)base.push(['年度概覽','此名錄項目未直接對應年度概覽；可在下方按名稱查閱相關原文。','未以同名推定已驗證身份']);
 return base;
}
export function download(name:string,text:string,type='application/json'):void {const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export function eventICS(events:Admission[]):string {const escape=(v:string)=>v.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');const rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HK School Guide//Admissions//ZH-HK','CALSCALE:GREGORIAN'];for(const e of events){const end=new Date((e.ends_on??e.starts_on)+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);rows.push('BEGIN:VEVENT','UID:'+e.id+'@schools.finpulsx.win','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+e.starts_on.replaceAll('-',''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replaceAll('-',''),'SUMMARY:'+escape(e.title),'DESCRIPTION:'+escape(e.applicability+'\n'+e.description+'\n來源：'+e.source_url),'URL:'+e.source_url,'END:VEVENT');}rows.push('END:VCALENDAR');return rows.map(line=>{let result='',chunk='',length=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(length+n>73){result+=chunk+'\r\n ';chunk='';length=1;}chunk+=c;length+=n;}return result+chunk;}).join('\r\n')+'\r\n';}
