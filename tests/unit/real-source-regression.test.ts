import {describe,it,expect} from 'vitest';
import {SafeUrl,AdmissionEvent} from '@hk-school/contracts/domain';
describe('Live-source regressions',()=>{
  it.each(['N.A.','N/A','','not a website','www.school.example'])('rejects malformed optional website without throwing: %s',value=>{
    expect(()=>SafeUrl.safeParse(value)).not.toThrow();expect(SafeUrl.safeParse(value).success).toBe(false);
  });
  it('compares exact time values rather than lexical UTC formatting',()=>{
    const event={id:'test',title:'Synthetic event',level:'PRIMARY',entry_year:2027,route:'TEST',school_id:null,starts_on:null,ends_on:null,starts_at:'2027-01-01T01:00:00.100Z',ends_at:'2027-01-01T01:00:00Z',source_url:'https://example.invalid',verified:true,reviewed_at:'2026-09-18T00:00:00Z'};
    expect(AdmissionEvent.safeParse(event).success).toBe(false);
  });
});
