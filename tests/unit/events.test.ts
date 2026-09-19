import {describe,it,expect} from 'vitest';
import {EventInput,eventReviewHash,eventImportSql,eventIdentity} from '../../tools/cli/src/events';
const input={source_id:'synthetic-event',source_url:'https://example.invalid/test',publisher:'Synthetic fixture',raw_path:'test.txt',raw_sha256:'a'.repeat(64),level:'PRIMARY',entry_year:2027,route:'TEST',official_cycle_label:'TEST CYCLE',is_test:true,events:[{id:'test-event',title:'Synthetic, not a real deadline',level:'PRIMARY',entry_year:2027,route:'TEST',school_id:null,starts_on:'2026-12-31',ends_on:null,starts_at:null,ends_at:null,source_url:'https://example.invalid/test',verified:true,reviewed_at:'2026-09-18T00:00:00Z'}]};
describe('Reviewed event ingestion',()=>{
  it('keeps synthetic events out of official channels',()=>{expect(eventIdentity(EventInput.parse(input)).channel).toMatch(/^test:events:/);});
  it('rejects mixed entry years and routes',()=>{expect(EventInput.safeParse({...input,entry_year:2028}).success).toBe(false);expect(EventInput.safeParse({...input,route:'OTHER'}).success).toBe(false);});
  it('rejects unverified events',()=>{expect(EventInput.safeParse({...input,events:[{...input.events[0],verified:false}]}).success).toBe(false);});
  it('binds review to date content but not local file location',()=>{const valid=EventInput.parse(input);expect(eventReviewHash({...valid,raw_path:'moved.txt'})).toBe(eventReviewHash(valid));expect(eventReviewHash({...valid,events:[{...valid.events[0],starts_on:'2027-01-01'}]})).not.toBe(eventReviewHash(valid));});
  it('stages reviewed events without automatically publishing',()=>{const sql=eventImportSql(EventInput.parse(input),'tester');expect(sql).toContain('event_release_items');expect(sql).not.toContain('INSERT INTO publication_commands');});
});
