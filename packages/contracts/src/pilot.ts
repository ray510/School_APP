import type { AnnualSchoolProfile } from './annual';
import type { PublicEvent } from './domain';
export interface SummaryField { key:string; label:string; value:string; period:string; sourceLabel:string; planned:boolean; link:string|null }
/** Source statements, not quality scores. Do not convert '-' to zero or child-care charges to K1 tuition. */
export function summarizeAnnual(profile:AnnualSchoolProfile):SummaryField[] {
  const fields:Record<string,Array<[string,string]>>={
    KG:[['參加幼稚園教育計劃','幼稚園教育計劃（概覽所述）'],['學校類別','辦學類別'],['學生類別','學生類別'],['課程類別','課程'],['收費證明書','K1 學費：查看收費證明書'],['註冊費_半日班','半日班註冊費（非全年學費）'],['註冊費_全日班','全日班註冊費（非全年學費）'],['對非華語學童的支援','非華語支援'],['對有特殊需要的學童的支援','學童支援']],
    PRIMARY:[['小一學校網','小一校網（概覽所述）'],['學校類別1','辦學類別'],['學校類別2','授課時間'],['學生性別','學生性別'],['教學語言','教學語言'],['學費','學費原文（未含其他費用）'],['一般上學時間','上學時間（配合來源時段）'],['一般上學時段','上學時段'],['一般放學時間','放學時間（配合來源時段）'],['一般放學時段','放學時段'],['校車','校車'],['保姆車','保姆車'],['一條龍中學','一條龍中學'],['直屬中學','直屬中學'],['聯繫中學','聯繫中學'],['全校參與模式融合教育','學生支援']],
    SECONDARY:[['學校類別','辦學類別'],['學生性別','學生性別'],['全校語文政策','語文政策'],['中一入學','概覽收生說明（非當屆截止日期）'],['全校參與模式融合教育','學生支援']]
  };
  const pairs=[...fields[profile.level]];
  if(profile.level==='SECONDARY'){
    for(const fact of profile.facts)if(/學費S1$/.test(fact.label)||(/學年.*開設科目/.test(fact.label)&&fact.label.endsWith('中一至中三')))pairs.push([fact.label,fact.label.replace(/_/g,' ') ]);
  }
  return pairs.map(([key,label])=>{
    const fact=profile.facts.find(f=>f.label===key);const raw=fact?.value?.trim();
    const unknown=!raw||/^(?:-|–|—|N\.?A\.?|未提供)$/i.test(raw);let link:string|null=null;
    if(key==='收費證明書'&&raw){try{const url=new URL(raw);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)link=url.href;}catch{/* Raw data stays text. */}}
    return {key,label,value:unknown?'未提供':raw!.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,''),period:fact?.reference_period??`概覽 ${profile.profile_edition}；欄位未標明確學年`,sourceLabel:key,planned:fact?.is_planned??false,link};
  });
}
export function hongKongDay(now=new Date()):string {
  return new Date(now.getTime()+8*60*60*1000).toISOString().slice(0,10);
}
export function eventDateRange(event:PublicEvent):string {
  if(event.starts_on)return event.starts_on+(event.ends_on&&event.ends_on!==event.starts_on?' 至 '+event.ends_on:'');
  return new Date(event.starts_at!).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'})+'（香港時間）';
}
export function nextEventDate(event:PublicEvent,today=hongKongDay()):string|null {
  const start=event.starts_on??hongKongDay(new Date(event.starts_at!));
  const end=event.ends_on??(event.ends_at?hongKongDay(new Date(event.ends_at)):start);
  if(end<today)return null;
  return start<today?end:start;
}
export function eventStatus(event:PublicEvent,today=hongKongDay()):string {
  const next=nextEventDate(event,today);if(!next)return '已過日期';
  const start=event.starts_on??hongKongDay(new Date(event.starts_at!));
  return start<today?'日期範圍內（請核對辦公時間）':start===today?'今日':'即將到來';
}
