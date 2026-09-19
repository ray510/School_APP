import { describe,it,expect } from 'vitest';
import { DateOnly,Fee,SafeUrl,Search,readPrivateImport,PrivateExport,AdmissionEvent,feeLabel } from '@hk-school/contracts/domain';
import { dayAfter,foldLine,toCalendar } from '@hk-school/contracts/calendar';
import { demoBundles,validateBundle,importSql,publicationSql,quote } from '../../tools/cli/src/pipeline';
const event={id:'verified-fixture',title:'Synthetic event; not real admissions',level:'PRIMARY',entry_year:2027,route:'TEST',school_id:null,starts_on:'2026-12-31',ends_on:null,starts_at:null,ends_at:null,source_url:'https://example.invalid/test',verified:true,reviewed_at:'2026-09-18T00:00:00.000Z'};
describe('Product domain contracts',()=>{
  it('keeps zero, missing and not-applicable fees distinct',()=>{expect(feeLabel(Fee.parse({amount_cents:0,state:'known',reference_period:null}))).toContain('0.00');expect(feeLabel(Fee.parse({amount_cents:null,state:'not_provided',reference_period:null}))).toBe('未提供');expect(feeLabel(Fee.parse({amount_cents:null,state:'not_applicable',reference_period:null}))).toBe('不適用');});
  it('rejects conflicting fee value and state',()=>{expect(()=>Fee.parse({amount_cents:0,state:'not_provided',reference_period:null})).toThrow();});
  it('rejects javascript and credential-bearing URLs',()=>{expect(SafeUrl.safeParse('javascript:alert(1)').success).toBe(false);expect(SafeUrl.safeParse('https://user:pass@example.com/').success).toBe(false);});
  it('coerces bounded HTTP search parameters',()=>{expect(Search.parse({level:'PRIMARY',year:'2027',limit:'40',q:' TEST '}).q).toBe('test');expect(()=>Search.parse({level:'PRIMARY',year:2027,limit:41})).toThrow();});
  it('rejects invalid and impossible calendar dates',()=>{expect(DateOnly.safeParse('2027-02-29').success).toBe(false);expect(DateOnly.safeParse('2028-02-29').success).toBe(true);});
  it('uses exclusive next-day end across year boundaries',()=>{expect(dayAfter('2026-12-31')).toBe('2027-01-01');const ics=toCalendar([AdmissionEvent.parse(event)]);expect(ics).toContain('DTEND;VALUE=DATE:20270101');expect(ics).not.toContain('235900');});
  it('rejects unreviewed events and inferred mixed time formats',()=>{expect(AdmissionEvent.safeParse({...event,verified:false}).success).toBe(false);expect(AdmissionEvent.safeParse({...event,starts_at:'2026-12-31T01:00:00Z'}).success).toBe(false);});
  it('escapes ICS injection and folds UTF-8 by bytes',()=>{const ics=toCalendar([AdmissionEvent.parse({...event,title:'學校'.repeat(60)+'\r\nBEGIN:VALARM'})]);expect(ics).not.toContain('\r\nBEGIN:VALARM');for(const line of ics.split('\r\n'))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);expect(foldLine('a'.repeat(90))).toContain('\r\n ');});
  it('rejects oversized private imports',()=>{expect(()=>readPrivateImport(' '.repeat(1000001))).toThrow('1 MB');});
  it('rejects arbitrary private import keys',()=>{expect(()=>readPrivateImport('{"schema_version":1,"entries":[],"events":[],"execute":"script"}')).toThrow();});
  it('accepts a minimal private backup without children personal data',()=>{expect(PrivateExport.parse({schema_version:1,entries:[],events:[]}).entries).toEqual([]);});
});
describe('Publication bundles',()=>{
  it('creates deterministic synthetic-only bundles for all three levels',()=>{expect(demoBundles()).toEqual(demoBundles());expect(demoBundles().map(b=>b.level)).toEqual(['KG','PRIMARY','SECONDARY']);for(const b of demoBundles())expect(validateBundle(b).profiles.every(p=>p.is_test)).toBe(true);});
  it('rejects a changed profile under an old manifest hash',()=>{const b=demoBundles()[0];b.profiles[0].chinese_name='Altered';expect(()=>validateBundle(b)).toThrow('hash');});
  it('stages profiles without moving a public release head',()=>{const sql=importSql(demoBundles()[0]);expect(sql).not.toContain('INSERT INTO publication_commands');expect(sql).toContain('READY_FOR_REVIEW');});
  it('requires explicit hash-bound review before approval',()=>{const sql=importSql(demoBundles()[0],{reviewer:'tester',reviewed_at:'2026-09-18T00:00:00Z'});expect(sql).toContain('review_decisions');});
  it('quotes SQL input without interpolation vulnerabilities',()=>{expect(quote("x'); DROP TABLE sources;--")).toBe("'x''); DROP TABLE sources;--'");expect(()=>quote('x\0y')).toThrow();});
  it('publishes with explicit CAS and stable retry ID',()=>{const options={id:demoBundles()[0].release_id,channel:'test:profiles:KG',operation:'publish' as const,revision:0,previous:null,actor:'tester'};const sql=publicationSql(options);expect(sql).toContain('WHERE NOT EXISTS');expect(sql).toContain('expected_previous_release_id');});
});
