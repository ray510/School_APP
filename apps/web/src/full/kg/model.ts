import type {Classification} from '../classification';
import type {Admission} from '../catalog';
export interface FeeRow {grade:string;session:string;category:string;cents:number;periods:number;annual_cents:number;evidence_text?:string}
export interface KGApplicationScope {year:number;grade:string;summary:string;next_step:string}
export interface KGParentHighlight {topic:string;text:string}
export type KGSourceStatus='NOT_RUN'|'CANDIDATE'|'REVIEW'|'FETCH_FAILED'|'NOT_FOUND'|'PUBLISHED';
export interface KGSourceFieldState {status:KGSourceStatus;evidence_count:number;target_year?:number;reference_year?:number|null}
export interface KGSourceEvidence {field:string;value:string;evidence_excerpt:string;url:string;target_year:number|null;reference_period:string|null;capture_status:string;review_status:string;publication_status:string;dates?:string[]}
export interface KGSourcePage {url:string;capture_status:string;captured_at?:string;checked_at?:string;sha256:string;text_sha256?:string;review_status?:string;publication_status?:string;facts?:Record<string,KGSourceEvidence[]>}
export interface KGSchoolSources {schema:number;target_entry_year:number;checked_at:string|null;discovery_status:KGSourceStatus;identity_status:string;review_status:string;publication_status:string;pages:KGSourcePage[];fields:Record<string,{status:KGSourceStatus;evidence_count:number;target_year:number;reference_year:number|null;evidence:KGSourceEvidence[];review_status:string;publication_status:string}>}
export interface KGSummary {id:string;aliases:string[];name:string;address:string;district:string;sessions:string[];classification:Classification;profile_available:boolean;fee_status:string;fee_effective_from?:string;tuition_rows:FeeRow[];has_school_events:boolean;application_scopes:KGApplicationScope[];school_event_years:number[];parent_highlight:KGParentHighlight|null;parent_analysis_status:string;school_source_status?:KGSourceStatus;school_source_checked_at?:string|null;school_source_fields?:Record<string,KGSourceFieldState>}
export interface Fact {value:string;field:string;state:string;edition:string;row:number;record_sha256:string}
export interface SourcePage {id:string;url:string;text:string;captured_at:string;sha256:string;fact_status:string}
export interface Evidence {field:string;text:string;source_id:string;edition:string;row:number;record_sha256:string}
export interface Selection {state:string;evidence:Evidence|null;question:string;confidence:number}
export interface KGSchool extends KGSummary {profile:{fields:Record<string,string>;edition:string;row:number;record_sha256:string}|null;fees:{status:string;rows:FeeRow[];effective_from?:string;basis?:string;archived_url?:string;document?:{url:string;captured_at:string;sha256:string}};care:Fact[];admissions:Fact[];supplies:Fact[];website:string;phone:string;events:Admission[];new_pages:SourcePage[];school_sources?:KGSchoolSources;application_steps:Array<{year:number;grade:string;action:string;source_url:string;evidence:string;checked_at:string}>;hours:Array<{session:string;start:string;end:string;year:number|null;source_url:string;evidence:string}>;parent_analysis:{status:string;model?:string;selections:Record<string,Selection>};topics:Array<{id:string;label:string;question:string;cell:{status:string;evidence?:Evidence|null}}>;vacancies:Array<{normalized:{reference_year:number|null;as_of:string;facts:{vacancies:Record<string,{code:string;label:string}>}}}>}
export interface KGManifest {schema:number;phase:string;bundle_id:string;base_data_id:string;parent_cards:number;source_groups:number;annual_profiles:number;generated_at:string;fee_status_counts:Record<string,number>;inference:{model:string;status_counts:Record<string,number>;quality:string};school_pages_linked:number;human_usability_test:string}
export const sessions:Record<string,string>={WD:'全日班',AM:'上午班',PM:'下午班'};
export const topics:Record<string,string>={learning:'每日點學',settling:'適應同支援',admission:'報名要留意',care:'接送照顧'};
export const sourceStatusLabel:Record<KGSourceStatus,string>={NOT_RUN:'尚未執行逐校擷取',CANDIDATE:'已找到校方資料，待身份及內容覆核',REVIEW:'已擷取相關資料，待核對學年或欄位',FETCH_FAILED:'逐校來源擷取失敗',NOT_FOUND:'逐校來源未找到可核對資料',PUBLISHED:'已核對並可公開使用'};
export const sourceFieldLabel:Record<string,string>={application:'報名日期／步驟',form:'申請表格／網上表格',fees:'校本費用',hours:'上課／班別時間'};
export function sourceField(s:KGSummary,field:string):KGSourceFieldState|undefined{return s.school_source_fields?.[field]}
export function sourceAnswer(s:KGSummary,field:string):{value:string;detail:string}|null {const state=sourceField(s,field);if(!state)return null;const label=sourceFieldLabel[field]??field;const evidence=state.evidence_count?`已有 ${state.evidence_count} 段證據候選`:'暫未有可核對證據';const detail=state.status==='FETCH_FAILED'?`${label}：本次逐校來源擷取失敗，未能判斷校方是否已公布相關資料；不代表學校尚未公布。目標學年為 2027/28。`:state.status==='NOT_FOUND'?`${label}：已檢查目前可用的逐校來源但未找到可核對資料；不代表學校尚未公布。目標學年為 2027/28。`:state.status==='NOT_RUN'?`${label}：尚未執行逐校擷取，未能判斷校方是否已公布相關資料。目標學年為 2027/28。`:state.status==='CANDIDATE'?`${label}：${evidence}；待身份及內容覆核，不能當作已確認資料。目標學年為 2027/28。`:state.status==='REVIEW'?`${label}：${evidence}；待核對學年或欄位，不能當作已確認資料。目標學年為 2027/28。`:`${label}：${evidence}；目標學年為 2027/28。`;return {value:sourceStatusLabel[state.status],detail};}
export const money=(cents:number)=>'HK$'+(cents/100).toLocaleString('zh-HK',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2});
export function costs(rows:FeeRow[],grade:string,session:string):{rows:FeeRow[];subtotal:number|null;periods:string;complete:false}{
 const selected=rows.filter(r=>r.grade===grade&&r.session===session);
 if(selected.some(r=>!Number.isSafeInteger(r.annual_cents)||r.annual_cents!==r.cents*r.periods)||new Set(selected.map(r=>r.category)).size!==selected.length)throw new Error('收費原文計算不一致。');
 return {rows:selected,subtotal:selected.some(r=>r.category==='tuition')?selected.reduce((s,r)=>s+r.annual_cents,0):null,periods:[...new Set(selected.map(r=>r.periods))].join('／'),complete:false};
}
export function feePeriod(date:string|undefined,year:number):string {return date?`${date} 起生效；${Number(date.slice(0,4))===year?'請確認目標學年仍適用':'不是 '+year+'/'+String(year+1).slice(-2)+' 已確認報價'}`:'尚未取得可計算的同校址收費文件';}
export function feeCard(s:KGSummary,grade:string,session:string,year:number):{value:string;detail:string} {
 const c=costs(s.tuition_rows,grade,session),className=grade+' '+(sessions[session]??session),period=feePeriod(s.fee_effective_from,year),sameYear=Number(s.fee_effective_from?.slice(0,4))===year;
 if(c.subtotal!==null&&sameYear)return {value:money(c.subtotal)+'／年，已知小計',detail:period};
 const discovered=year===2027?sourceAnswer(s,'fees'):null;if(discovered){const reference=c.subtotal!==null?`另有非目標學年的已知小計 ${money(c.subtotal)}／年；${period}。`:s.fee_status==='LAYOUT_REVIEW'?`另有 ${period.replace('；','文件；版面待覆核，暫未能計算 '+className+'小計；')}。`:'';return {value:discovered.value,detail:discovered.detail+(reference?' '+reference:'')}}
 if(c.subtotal!==null)return {value:money(c.subtotal)+'／年，已知小計',detail:period};
 if(s.fee_status==='LAYOUT_REVIEW')return {value:'收費文件版面待覆核',detail:`已取得 ${period.replace('；','文件；版面待覆核，暫未能計算 '+className+'小計；')}`};
 return {value:`未有 ${className}可核對小計`,detail:s.fee_effective_from?period+'；文件未有此班別通過核對的學費資料。':period};
}
export function admissionCard(s:KGSummary,grade:string,year:number):{value:string;detail:string} {
 const schoolYear=year+'/'+String(year+1).slice(-2),scope=s.application_scopes?.find(x=>x.year===year&&x.grade===grade);
 if(scope)return {value:`已核對 ${schoolYear} ${grade} 校方申請步驟`,detail:scope.next_step||scope.summary};
 if(grade==='K1'&&s.school_event_years?.includes(year))return {value:`有本校 ${schoolYear} 招生公告`,detail:'請開啟學校頁查看適用條件及日期。'};
 const discovered=year===2027?sourceAnswer(s,'application'):null;if(discovered)return {value:discovered.value,detail:discovered.detail};
 if(s.has_school_events)return {value:'只有其他學年本校公告',detail:`未接通 ${schoolYear} ${grade} 校方申請日期；不沿用舊年份截止日。`};
 return {value:`未接通 ${schoolYear} ${grade} 校方公告`,detail:'公開資料未有具體當屆步驟；不代表學校尚未公布。'};
}
export function sessionMeaning(s:{sessions:string[]},session:string):string {
 const codes:Record<string,string>={WD:'全日',AM:'上午',PM:'下午'};
 return s.sessions.some(x=>x.includes(codes[session]))?'名錄有'+sessions[session]+'記載；目標學年開班及接送時間待確認':'未有此班別的名錄記載；不等於已確認停辦';
}
export function noteStatus(s:KGSchool,grade:string,year:number):string {
 const steps=s.application_steps?.filter(e=>e.year===year&&e.grade===grade)??[];if(steps.length)return '已核對本校當屆申請步驟，請按以下清單辦理。';
 const events=s.events.filter(e=>e.entry_year===year);
 if(grade==='K1'&&events.length)return '已收錄本校'+year+'/'+String(year+1).slice(-2)+'招生公告；按下方步驟辦理。';
 const discovered=year===2027?sourceAnswer(s,'application'):null;if(discovered)return discovered.detail;
 return '先向學校確認 '+year+'/'+String(year+1).slice(-2)+' '+grade+' 申請方法；不沿用舊年份截止日。';
}
export function vacancyText(s:KGSchool,grade:string,year:number):string {
 const rows=s.vacancies.filter(v=>v.normalized.reference_year===year);
 if(!rows.length)return '未有目標學年的公布空缺；不是已確認沒有學位。';
 const v=rows[0].normalized;return `${v.facts.vacancies[grade]?.label??'沒有相關資料'}（${year}/${String(year+1).slice(-2)}，截至${v.as_of}）；請向學校確認，並非即時剩餘位數。`;
}
export function selectedIds(ids:string[],index:KGSummary[]):KGSummary[]{
 const map=new Map(index.flatMap(s=>s.aliases.map(a=>[a,s] as const)));const result=ids.map(i=>map.get(i));
 if(result.some(s=>!s))throw new Error('找不到所選幼稚園。');
 const unique=[...new Map(result.map(s=>[s!.id,s!])).values()];
 if(unique.length!==ids.length)throw new Error('兩個網址指向同一份已核對校址資料，請選另一間幼稚園。');return unique;
}
export type ParentReadinessState='CONFIRMED'|'REFERENCE_ONLY'|'TO_CONFIRM';
export interface ParentReadinessItem {state:ParentReadinessState;label:string;detail:string}
export interface ParentReadiness {admission:ParentReadinessItem;fees:ParentReadinessItem;care:ParentReadinessItem}
export const readinessLabel:Record<ParentReadinessState,string>={CONFIRMED:'有同學年資料',REFERENCE_ONLY:'只有參考資料',TO_CONFIRM:'仍要向學校確認'};
export function parentReadiness(s:KGSchool,grade:string,session:string,year:number):ParentReadiness {
 const steps=s.application_steps?.filter(e=>e.year===year&&e.grade===grade)??[];const events=s.events.filter(e=>e.entry_year===year);const discovered=year===2027?sourceField(s,'application'):undefined;
 const admission:ParentReadinessItem=steps.length||events.length||discovered?.status==='PUBLISHED'?{state:'CONFIRMED',label:readinessLabel.CONFIRMED,detail:'已找到本校適用學年的公開申請步驟或公告。'}:discovered?.status==='CANDIDATE'||discovered?.status==='REVIEW'?{state:'REFERENCE_ONLY',label:readinessLabel.REFERENCE_ONLY,detail:sourceStatusLabel[discovered.status]+'；尚未人工核對，不能當成截止日期。'}:s.admissions.some(f=>f.state!=='UNKNOWN')?{state:'REFERENCE_ONLY',label:readinessLabel.REFERENCE_ONLY,detail:'只有概覽或舊版申請資料，不能當作當屆截止日。'}:{state:'TO_CONFIRM',label:readinessLabel.TO_CONFIRM,detail:'未找到本校目標學年的具體申請資料。'};
 const calc=costs(s.fees.rows,grade,session);const feeYear=s.fees.effective_from?Number(s.fees.effective_from.slice(0,4)):null;
 const fees:ParentReadinessItem=calc.subtotal!==null&&feeYear===year?{state:'CONFIRMED',label:readinessLabel.CONFIRMED,detail:'有同學年可計算收費文件；仍未必包括校車、用品及延長照顧。'}:calc.subtotal!==null?{state:'REFERENCE_ONLY',label:readinessLabel.REFERENCE_ONLY,detail:'有可計算收費，但不是目標學年已確認報價。'}:{state:'TO_CONFIRM',label:readinessLabel.TO_CONFIRM,detail:'未有通過核對的本班別收費小計。'};
 const exact=s.hours.filter(h=>h.session===session&&h.year===year);const reference=s.hours.filter(h=>h.session===session);const careFacts=s.care.some(f=>f.state!=='UNKNOWN');
 const care:ParentReadinessItem=exact.length===1?{state:'CONFIRMED',label:readinessLabel.CONFIRMED,detail:'有同學年正常上課時間；最遲接走及延長照顧仍須看校方規則。'}:reference.length||careFacts?{state:'REFERENCE_ONLY',label:readinessLabel.REFERENCE_ONLY,detail:'只有其他學年／未註明學年的時間或概覽照顧資料。'}:{state:'TO_CONFIRM',label:readinessLabel.TO_CONFIRM,detail:'未有足夠資料確認正常放學或延長照顧。'};
 return {admission,fees,care};
}

export function careMatch(s:KGSchool,session:string,pickup:string,year:number):string {
 if(!pickup)return '先確認正常放學及最遲接走時間；辦公時間不是照顧時間。';
 const h=s.hours.filter(h=>h.session===session&&h.year===year);
 if(h.length!==1)return '未有足夠同學年時間資料判斷能否於 '+pickup+' 接走；請直接向學校確認。';
 return pickup<=h[0].end?'所載正常班別時間到 '+h[0].end+'；仍須確認接送規則。':'正常上課到 '+h[0].end+'，早於你希望的 '+pickup+'；延長照顧及費用未確認。';
}
