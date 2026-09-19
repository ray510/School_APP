import {describe,it,expect} from 'vitest';import {costs,feePeriod,selectedIds,careMatch,type KGSchool,type KGSummary} from '../../apps/web/src/full/kg/model';
const row={grade:'K1',session:'WD',category:'tuition',cents:75900,periods:11,annual_cents:834900};
describe('parent facts not model guesses',()=>{
 it('sums only same grade/session, without assumed 12 periods',()=>expect(costs([row,{...row,category:'meal',cents:49500,annual_cents:544500}],'K1','WD').subtotal).toBe(1379400));
 it('no costs is unknown not zero',()=>expect(costs([],'K1','WD').subtotal).toBeNull());
 it('free is a real zero, never complete all costs',()=>{const r=costs([{...row,cents:0,annual_cents:0}],'K1','WD');expect(r.subtotal).toBe(0);expect(r.complete).toBe(false);});
 it('does not mix sessions or years by hiding date',()=>{expect(costs([row],'K1','AM').subtotal).toBeNull();expect(feePeriod('2026-09-01',2027)).toContain('不是 2027/28');});
 it('rejects inconsistent sum',()=>expect(()=>costs([{...row,annual_cents:5}],'K1','WD')).toThrow());
 it('same source aliases are not two schools',()=>expect(()=>selectedIds(['a','b'],[{id:'a',aliases:['a','b']} as KGSummary])).toThrow());
 it('unknown or historical hours do not prove pickup match',()=>{const s={hours:[{session:'WD',start:'09:00',end:'16:30',year:2025}]} as KGSchool;expect(careMatch(s,'WD','17:00',2027)).toContain('未有足夠同學年');});
});
