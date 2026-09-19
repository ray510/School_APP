import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {summarizeAnnual,hongKongDay,nextEventDate,eventDateRange} from '@hk-school/contracts/pilot';
import {AdmissionEvent,Search} from '@hk-school/contracts/domain';
import {AnnualProfile} from '@hk-school/contracts/annual';
import {toCalendar} from '@hk-school/contracts/calendar';
import {generateSchoolId} from '@hk-school/contracts/identity';
const selection=JSON.parse(readFileSync(new URL('../../data/pilot/selection.json',import.meta.url),'utf8'));
const events=JSON.parse(readFileSync(new URL('../../data/pilot/events.json',import.meta.url),'utf8'));
const profile=(level:'KG'|'PRIMARY'|'SECONDARY',facts:Array<{label:string;value:string|null;reference_period?:string;is_planned?:boolean}>)=>AnnualProfile.parse({record_hash:'a'.repeat(64),source_record_key:'test',school_id:'sch_test',level,school_name:'測試',school_address:'測試',profile_edition:'2025/26',catalogue_label:'test',source_id:'edb-kg-profiles',source_url:'https://www.edb.gov.hk/',raw_sha256:'b'.repeat(64),fetched_at:'2026-09-18T00:00:00Z',identity_evidence:{edb_source_record_key:'1',baseline_raw_sha256:'c'.repeat(64),reviewer:'test',reviewed_at:'2026-09-18T00:00:00Z'},facts:facts.map(f=>({state:'as_reported',reference_period:null,is_planned:false,...f})),is_test:true});
function event(index=0){const {source_id:_source,...e}=events[index];return AdmissionEvent.parse({...e,source_url:'https://www.edb.gov.hk/'});}
describe('pilot data and parent-facing meaning',()=>{
 it('contains ten explicit, hash-bound identities per level',()=>{expect(selection.schools).toHaveLength(30);for(const level of ['KG','PRIMARY','SECONDARY'])expect(selection.schools.filter((s:{level:string})=>s.level===level)).toHaveLength(10);for(const s of selection.schools){expect(s.school_id).toBe(generateSchoolId('edb-school-directory',s.edb_source_record_key));expect(s.record_hash).toMatch(/^[a-f0-9]{64}$/);}expect(selection.human_review).toBe(false);});
 it('does not present child-care fees as K1 tuition',()=>{const fields=summarizeAnnual(profile('KG',[{label:'收費水平_全年_半日',value:'50000'},{label:'收費證明書',value:'http://applications.edb.gov.hk/schoolsearch/schoolfee/1.pdf'}]));expect(fields.some(f=>f.value==='50000')).toBe(false);expect(fields.find(f=>f.key==='收費證明書')?.link).toContain('schoolfee');});
 it('unknown fees are not zero and an explicit zero remains zero',()=>{expect(summarizeAnnual(profile('PRIMARY',[{label:'學費',value:'-'}])).find(f=>f.key==='學費')?.value).toBe('未提供');expect(summarizeAnnual(profile('PRIMARY',[{label:'學費',value:'0'}])).find(f=>f.key==='學費')?.value).toBe('0');});
 it('keeps explicit reference periods and planned subject status',()=>{const f=summarizeAnnual(profile('SECONDARY',[{label:'2026_2027學年擬開設科目_以英文為教學語言_中一至中三',value:'數學',reference_period:'2026/2027',is_planned:true}]));expect(f.find(f=>f.planned)?.period).toBe('2026/2027');});
 it('does not infer reference periods from the target admission year',()=>{expect(summarizeAnnual(profile('PRIMARY',[{label:'教學語言',value:'中文'}])).find(f=>f.key==='教學語言')?.period).toContain('欄位未標');});
 it('enables annual filtering only explicitly',()=>{expect(Search.parse({level:'KG',year:2027,has_annual:'1'}).has_annual).toBe('1');expect(Search.safeParse({level:'KG',year:2027,has_annual:'true'}).success).toBe(false);});
 it('stores fifteen reviewed events, not a fabricated event for each school',()=>{expect(events).toHaveLength(15);expect(events.filter((e:{school_id:string|null})=>e.school_id)).toHaveLength(5);for(let i=0;i<events.length;i++)expect(event(i).entry_year).toBe(2027);});
 it('uses Hong Kong calendar boundaries',()=>{expect(hongKongDay(new Date('2026-09-18T16:00:00Z'))).toBe('2026-09-19');});
 it('shows an ongoing window end as next date, then expires it',()=>{const e=event(1);expect(nextEventDate(e,'2026-09-19')).toBe('2026-09-25');expect(nextEventDate(e,'2026-09-26')).toBeNull();});
 it('keeps the whole date interval and inclusive last day in ICS',()=>{expect(eventDateRange(event())).toBe('2027-01-07 至 2027-01-09');const ics=toCalendar([event()]);expect(ics).toContain('DTEND;VALUE=DATE:20270110');expect(ics.replace(/\r\n /g,'')).toContain('不是所有幼稚園的報名期間');});
 it('school interview windows are not individual appointments',()=>{const e=event(12);expect(e.kind).toBe('interview_window');expect(e.description).toContain('個人日期');});
});
