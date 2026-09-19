import {describe,it,expect} from 'vitest';
import {cohortKey,cohortsFor,cellFor,compareJev,relationFor,validEvidence} from '../../apps/web/src/full/comparison';
import type {School,Source} from '../../apps/web/src/full/catalog';
import type {TagResult} from '../../apps/web/src/full/analytics';
const hash='a'.repeat(64),sid='chsc-primary-profiles',edition='Primary 2025',cohort=cohortKey(sid,edition),tag='home_school';
const dimension={value:null,label:'來源未提供',state:'not_provided' as const,evidence:[]};
const source:Source={id:sid,label:'小學概覽',edition,catalog_url:'https://example.invalid',url:'https://example.invalid',fetched_at:'2026-01-01T00:00:00Z',sha256:hash,rows:2,columns:1,published_rows:2,excluded_rows:0,coverage:1};
function school(id='1',status='MENTIONED'):School {
 const text='本校家長教師會舉辦親子活動。';
 const evidence={id:'E0',field:'家校合作',start:0,end:Array.from(text).length,text};
 const p=Object.fromEntries(['MENTIONED','EXPLICITLY_ABSENT','NOT_STATED','CONFLICTING'].map(k=>[k,k===status?1:0]));
 const result:TagResult={status,proposed_verdict:status,evidence:status==='NOT_STATED'?null:evidence,confidence:1,probabilities:p,human_review:false};
 return {id:'school_'+id.repeat(24),level:'PRIMARY',name:'測試'+id,english_name:'fixture',address:'fixture',district:'北區',funding:'',category:'',sessions:[],association:'SOURCE_RECORD_ONLY',classification:{funding_type:dimension,kg_operator_type:dimension,kg_scheme_participation:dimension},directory:[],annual:[{source_id:sid,edition,row:1,record_sha256:hash,fields:{'家校合作':text}}],semantic_annotations:[{source_id:sid,row:1,record_sha256:hash,status:'ANALYZED',labels:{[tag]:result},model_returned:'jev-1.13.0',model_requested:'jev-1.13.0'}]};
}
function relation(...schools:School[]){return compareJev(schools,cohort).find(r=>r.id===tag)!;}
describe('comparison of real-model result contracts, not new inference',()=>{
 it('marks shared mentions without a quality score',()=>{const r=relation(school(),school('2'));expect(r.relation).toBe('COMMON_MENTION');expect(r.summary).toContain('不代表');expect(r.cells).toHaveLength(2);});
 it('supports four schools',()=>expect(relation(school(),school('2'),school('3'),school('4')).cells).toHaveLength(4));
 it('mention versus missing text is documentation only',()=>expect(relation(school(),school('2','NOT_STATED')).relation).toBe('DOCUMENTATION_DIFFERENCE'));
 it('mention versus explicit absence is recorded opposition',()=>expect(relation(school(),school('2','EXPLICITLY_ABSENT')).relation).toBe('EXPLICIT_DIFFERENCE'));
 it('all not stated never means all services absent',()=>{const r=relation(school('1','NOT_STATED'),school('2','NOT_STATED'));expect(r.relation).toBe('NOT_DOCUMENTED');expect(r.summary).toContain('不是');});
 it('keeps low confidence provisional',()=>{const s=school('2');s.semantic_annotations[0].labels[tag].confidence=0.3;expect(relation(school(),s).relation).toBe('INSUFFICIENT');expect(cellFor(s,tag,cohort).status).toBe('REVIEW');});
 it('does not promote a proposed positive review',()=>{const s=school('2');s.semantic_annotations[0].labels[tag].status='REVIEW';expect(cellFor(s,tag,cohort).status).toBe('REVIEW');});
 it('invalid model response stays invalid',()=>{const s=school('2');s.semantic_annotations[0].status='INVALID_RESPONSE';expect(cellFor(s,tag,cohort).status).toBe('INVALID_RESPONSE');expect(relation(school(),s).relation).toBe('INSUFFICIENT');});
 it('missing profile does not borrow an unrelated school',()=>{const s=school('2');s.annual=[];expect(cellFor(s,tag,cohort).status).toBe('NO_PROFILE');});
 it('different editions are not mixed',()=>{const s=school('2');s.annual[0].edition='2026';expect(cellFor(s,tag,cohort).status).toBe('VERSION_MISMATCH');expect(cohortsFor([school(),s],[source])).toHaveLength(2);});
 it('does not silently choose among multiple source rows',()=>{const s=school();s.annual.push({...s.annual[0],row:2});expect(cellFor(s,tag,cohort).status).toBe('MULTIPLE_RECORDS');});
 it('matches model record hash as well as school selection',()=>{const s=school();s.semantic_annotations[0].record_sha256='b'.repeat(64);expect(cellFor(s,tag,cohort).status).toBe('NOT_ANALYZED');});
 it('rejects invented quotes',()=>{const s=school();s.semantic_annotations[0].labels[tag].evidence!.text='不存在的文字';expect(cellFor(s,tag,cohort).status).toBe('EVIDENCE_MISMATCH');});
 it('uses Python Unicode code point offsets including emoji',()=>expect(validEvidence({id:'E0',field:'x',start:1,end:3,text:'家校'},{x:'😀家校'})).toBe(true));
 it('rejects offsets outside source content',()=>expect(validEvidence({id:'E0',field:'x',start:0,end:9,text:'家校'},{x:'家校'})).toBe(false));
 it('rejects NaN confidence and invalid probability tables',()=>{const s=school();s.semantic_annotations[0].labels[tag].confidence=NaN;expect(cellFor(s,tag,cohort).status).toBe('REVIEW');s.semantic_annotations[0].labels[tag].confidence=1;s.semantic_annotations[0].labels[tag].probabilities={MENTIONED:1};expect(cellFor(s,tag,cohort).status).toBe('REVIEW');});
 it('does not claim comparability across model versions',()=>{const s=school('2');s.semantic_annotations[0].model_returned='other-model';expect(relation(school(),s).relation).toBe('INSUFFICIENT');});
 it('unknown returned model is explicit',()=>{const s=school();s.semantic_annotations[0].model_returned=null;expect(cellFor(s,tag,cohort).status).toBe('MODEL_UNKNOWN');});
 it('missing evidence cannot support a positive label',()=>{const s=school();s.semantic_annotations[0].labels[tag].evidence=null;expect(cellFor(s,tag,cohort).status).toBe('EVIDENCE_MISMATCH');});
 it('rejects duplicates, mixed stages and oversized comparisons',()=>{expect(()=>compareJev([school(),school()],cohort)).toThrow();const kg=school('2');kg.level='KG';expect(()=>compareJev([school(),kg],cohort)).toThrow();expect(()=>compareJev(['1','2','3','4','5'].map(i=>school(i)),cohort)).toThrow();});
 it('incomplete selection never becomes an insight',()=>expect(relationFor([]).relation).toBe('INSUFFICIENT'));
});
