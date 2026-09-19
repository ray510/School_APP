/** Independent source editions; no inference or school ranking. */
export const officialNames:Record<string,string>={A02:'學校註冊、校舍及容額',A06:'幼稚園教育計劃名單',A07:'非計劃幼稚園 K1 收生安排',A08:'K1–K3 學位空缺',A09:'直資學校及學費',A10:'一條龍學校',A11:'小一校網',A12:'升中校網'};
export interface OfficialResource {resource_id:string;name:string;role:string;format:string;state:string;row_count:number;download_encoding?:'gzip'|'identity';reference_year:number|null;admission_year:number|null;url:string;download_url:string;evidence:{fetched_at:string;sha256:string;final_url:string};field_names:string[]}
export interface OfficialSource {code:string;title:string;catalog_url:string;dictionary_url:string;warning:string;state:string;resources:OfficialResource[]}
export interface OfficialRecord {id:string;code:string;role:string;resource_id:string;row:number;raw?:Record<string,string>;detail_url?:string;record_sha256:string;resource_sha256:string;normalized:{name:string;english_name:string;level:string|null;district:string;address:string;school_number:string|null;location_id:string|null;scope:string;as_of:string|null;reference_year:number|null;admission_year:number|null;facts:Record<string,unknown>};association:{state:string;links:Array<{school_id:string;method:string;scope:string}>}}
export interface OfficialManifest {schema:1;state:'VERIFIED';bundle_id:string;base_data_id:string;generated_at:string;sources:OfficialSource[];stats:{source_datasets:number;resources:number;source_records:number;excluded_rows:number;synthetic_records:number;school_groups_with_evidence_links:number};school_ids:string[];download_sha256:string}
export interface OfficialDataset {schema:1;bundle_id:string;source:OfficialSource;total_rows:number;index_groups:Array<{resource_id:string;row_count:number;urls:string[]}>}
export interface OfficialPart {bundle_id:string;rows:OfficialRecord[]}
const partCache=new Map<string,Promise<OfficialPart>>();
export async function loadOfficialRows(dataset:OfficialDataset,resourceId:string):Promise<OfficialRecord[]> {
 const groups=dataset.index_groups.filter(g=>!resourceId||g.resource_id===resourceId);const rows:OfficialRecord[]=[];
 for(const group of groups){const grouped:OfficialRecord[]=[];for(let i=0;i<group.urls.length;i+=4){const parts=await Promise.all(group.urls.slice(i,i+4).map(url=>loadOfficialJSON<OfficialPart>(url)));for(const part of parts){if(part.bundle_id!==dataset.bundle_id)throw new Error('索引版本不一致');grouped.push(...part.rows);}}
  if(grouped.length!==group.row_count||grouped.some(r=>r.resource_id!==group.resource_id))throw new Error('索引筆數或來源不一致');rows.push(...grouped);
 }
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('來源紀錄ID重複');return rows;
}
export async function loadOfficialRaw(record:OfficialRecord):Promise<Record<string,string>> {
 if(record.raw)return record.raw;if(!record.detail_url)throw new Error('原文路徑未提供');const url=record.detail_url;
 if(!partCache.has(url)){if(partCache.size>15)partCache.clear();partCache.set(url,loadOfficialJSON<OfficialPart>(url).catch(e=>{partCache.delete(url);throw e;}));}
 const part=await partCache.get(url)!;const r=part.rows.find(r=>r.id===record.id);
 if(!r?.raw||r.record_sha256!==record.record_sha256||r.resource_sha256!==record.resource_sha256)throw new Error('原文身份或版本不一致');return r.raw;
}
export async function loadOfficialJSON<T>(path:string):Promise<T>{
 if(path.split('/').includes('..')||!/^\/official\/[a-f0-9]{64}\/[a-zA-Z0-9_./-]+\.json$/.test(path)&&path!=='/official-manifest.json')throw new Error('資料路徑不正確');
 const r=await fetch(path,{signal:AbortSignal.timeout(20000)});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('新增來源尚未發布或暫時無法讀取；原有名錄仍可使用。');return await r.json() as T;
}
let pending:Promise<OfficialManifest>|null=null;
export function loadOfficialManifest():Promise<OfficialManifest>{
 if(!pending)pending=loadOfficialJSON<OfficialManifest>('/official-manifest.json').then(m=>{if(m.schema!==1||m.state!=='VERIFIED'||!/^[a-f0-9]{64}$/.test(m.bundle_id)||m.sources.length!==8||new Set(m.sources.map(s=>s.code)).size!==8||m.sources.some(s=>s.state!=='VERIFIED'||!Object.hasOwn(officialNames,s.code))||m.stats.synthetic_records!==0||m.stats.excluded_rows!==0)throw new Error('新增來源未通過完整性驗證');return m;}).catch(e=>{pending=null;throw e;});return pending;
}
export function showFact(value:unknown):string{
 if(value===null||value===undefined||value==='')return '來源未提供';
 if(typeof value==='string')return ({CLASSROOM:'課室',BOARDING:'宿舍／住宿費',TUITION:'學費',ANNUAL:'全年',AIDED_SCHOOLS_ONLY:'此名單只涵蓋資助學校',NOT_PROVIDED_IN_CSV:'CSV未提供多邊形；使用官方地圖入口'} as Record<string,string>)[value]??value;
 if(typeof value==='boolean')return value?'是':'否';if(typeof value==='number')return String(value);
 if(typeof value==='object'&&'raw' in value&&'value' in value){const v=value as {raw:unknown;value:unknown};return (v.value===true?'是':v.value===false?'否':'未核實')+'（原值 '+String(v.raw||'空白')+'）';}return JSON.stringify(value);
}
export function yearText(y:number|null):string{return y===null?'來源未註明學年':`${y}/${String(y+1).slice(-2)}`;}
export function vacancy(record:OfficialRecord,grade:string):{code:string|null;label:string}{
 const v=record.normalized.facts.vacancies;if(!v||typeof v!=='object')return {code:null,label:'來源未提供此級別'};const x=(v as Record<string,unknown>)[grade];if(!x||typeof x!=='object')return {code:null,label:'來源未提供此級別'};const a=x as Record<string,unknown>;return {code:typeof a.code==='string'?a.code:null,label:typeof a.label==='string'?a.label:'來源未提供此級別'};
}
export function oldSnapshot(asOf:string|null,today=new Date()):boolean{if(!asOf)return true;const t=Date.parse(asOf+'T00:00:00+08:00');return !Number.isFinite(t)||today.getTime()-t>7*86400000;}
export const factLabels:Record<string,string>={registration_status:'註冊狀況',registration_number:'註冊編號',registered_on:'註冊狀況日期',provisional_on:'首次臨時註冊日期',session:'授課時間',premises_code:'校舍代碼（非地點標識）',premises_description:'校舍描述',room_type:'室類型',room_no:'房號',subpremises_code:'子校舍代碼',permitted_capacity:'該課室／宿舍最高容額',kg_whole_day_capacity:'用作幼稚園全日班容額（不可相加）',remarks:'附註',scheme_listed:'所示學年計劃名單有列出',non_scheme_in_reference_year:'基準學年為非計劃幼稚園',participates_in_k1_arrangement:'參與所示收生學年安排',application_distribution:'網上／不設限額派表',single_place:'一人不佔多位措施',vacancy_publication:'經教育局公布空缺',dss_listed:'所示學年直資名單有列出',phone:'電話',website:'學校網站',fee_remission_url:'學費減免安排',scholarship_url:'獎學金安排',charge_kind:'收費項目性質',grade:'班級／住宿',fee_kind:'學費種類',fee_min:'全年所列費用下限（HKD）',fee_max:'全年所列費用上限（HKD）',currency:'貨幣',period:'收費期間',listing_number:'本來源編號（不是學校註冊編號）',group_id:'一條龍組別',scope_note:'名單範圍',net:'小一校網',area:'涵蓋地區',map_url:'官方校網檔案／地圖',geometry_status:'地理資料狀態',home_net:'中學所屬網',district_code:'分區代碼',sspa_school_code:'此來源所列學校編號（未據此單獨配對）'};
