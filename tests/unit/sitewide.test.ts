import {describe,it,expect} from 'vitest';import {acceptedTags,matchesTag,extendedTopics,type InsightSummary} from '../../apps/web/src/full/sitewide';
const s={jev_tags:{inquiry_play:'MENTIONED',arts_sports:'REVIEW',wellbeing_support:'NOT_STATED'}} as InsightSummary;
describe('sitewide evidence search',()=>{
 it('only accepted mentions become positive search labels',()=>expect(acceptedTags(s)).toEqual(['inquiry_play']));
 it('review is not a negative or positive assertion',()=>{expect(matchesTag(s,'arts_sports','MENTIONED')).toBe(false);expect(matchesTag(s,'arts_sports','REVIEW')).toBe(true);});
 it('missing profiles are not silently treated as not stated',()=>{expect(matchesTag(s,'missing','NOT_STATED')).toBe(false);expect(matchesTag(s,'missing','NO_PROFILE')).toBe(true);});
 it('no selected topic preserves all raw directory records',()=>expect(matchesTag(s,'','MENTIONED')).toBe(true));
 it('four concrete topics include school enquiry prompts, not ranks',()=>{expect(Object.keys(extendedTopics)).toHaveLength(4);for(const t of Object.values(extendedTopics))expect(t.question.length).toBeGreaterThan(12);});
});
