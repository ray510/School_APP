import {describe,it,expect} from 'vitest';import {costs,feePeriod,selectedIds,careMatch,parentReadiness,type KGSchool,type KGSummary} from '../../apps/web/src/full/kg/model';
const row={grade:'K1',session:'WD',category:'tuition',cents:75900,periods:11,annual_cents:834900};
describe('parent facts not model guesses',()=>{
 it('sums only same grade/session, without assumed 12 periods',()=>expect(costs([row,{...row,category:'meal',cents:49500,annual_cents:544500}],'K1','WD').subtotal).toBe(1379400));
 it('no costs is unknown not zero',()=>expect(costs([],'K1','WD').subtotal).toBeNull());
 it('free is a real zero, never complete all costs',()=>{const r=costs([{...row,cents:0,annual_cents:0}],'K1','WD');expect(r.subtotal).toBe(0);expect(r.complete).toBe(false);});
 it('does not mix sessions or years by hiding date',()=>{expect(costs([row],'K1','AM').subtotal).toBeNull();expect(feePeriod('2026-09-01',2027)).toContain('不是 2027/28');});
 it('rejects inconsistent sum',()=>expect(()=>costs([{...row,annual_cents:5}],'K1','WD')).toThrow());
 it('same source aliases are not two schools',()=>expect(()=>selectedIds(['a','b'],[{id:'a',aliases:['a','b']} as KGSummary])).toThrow());
 it('unknown or historical hours do not prove pickup match',()=>{const s={hours:[{session:'WD',start:'09:00',end:'16:30',year:2025}]} as KGSchool;expect(careMatch(s,'WD','17:00',2027)).toContain('未有足夠同學年');});
 it('readiness separates current, reference-only and unknown instead of scoring schools',()=>{const s={application_steps:[{year:2027,grade:'K1',action:'x',source_url:'https://example.invalid',evidence:'x',checked_at:'2026-09-01'}],events:[],admissions:[],fees:{status:'ok',rows:[row],effective_from:'2026-09-01'},hours:[{session:'WD',start:'09:00',end:'16:30',year:2025}],care:[]} as unknown as KGSchool;const r=parentReadiness(s,'K1','WD',2027);expect(r.admission.state).toBe('CONFIRMED');expect(r.fees.state).toBe('REFERENCE_ONLY');expect(r.care.state).toBe('REFERENCE_ONLY');});
 it('readiness never treats missing public data as a negative school verdict',()=>{const s={application_steps:[],events:[],admissions:[],fees:{status:'NO_CERTIFICATE',rows:[]},hours:[],care:[]} as unknown as KGSchool;const r=parentReadiness(s,'K1','WD',2027);expect(Object.values(r).every(x=>x.state==='TO_CONFIRM')).toBe(true);});
});
