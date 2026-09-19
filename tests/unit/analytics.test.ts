import {describe,it,expect} from 'vitest';import {tagCounts,dimensionCounts,percentage,type AnalyticsRow} from '../../apps/web/src/full/analytics';import {classificationSummary,type Classification} from '../../apps/web/src/full/classification';
const dim=(value:string|null,label:string)=>({value,label,state:value?'known' as const:'not_provided' as const,evidence:[]});
const c:Classification={funding_type:dim('PRIVATE','私立'),kg_operator_type:dim('NON_PROFIT','非牟利'),kg_scheme_participation:dim('PARTICIPATING','參加幼稚園教育計劃')};
const row=(status:string):AnalyticsRow=>({school_id:'example',name:'contract fixture',source_id:'edb-kg-profiles',edition:'fixture',row:1,record_sha256:'x',level:'KG',district:'北區',classification:c,analysis_status:'ANALYZED',labels:{home_school:{status,evidence:null,human_review:false}}});
describe('deterministic source analytics',()=>{
 it('does not label a participating nonprofit KG as self-funded private',()=>expect(classificationSummary({level:'KG',classification:c})).toBe('非牟利 · 參加幼稚園教育計劃'));
 it('counts errors, unknowns and explicit absence separately',()=>{const counts=tagCounts(['MENTIONED','NOT_STATED','NOT_ANALYZED','API_ERROR','EXPLICITLY_ABSENT'].map(row),'home_school');expect(Object.values(counts).reduce((a,b)=>a+b,0)).toBe(5);expect(counts.NOT_STATED).toBe(1);expect(counts.API_ERROR).toBe(1);});
 it('missing tag does not become not stated',()=>expect(tagCounts([row('MENTIONED')],'ncs_support').NOT_ANALYZED).toBe(1));
 it('denominator is explicit and zero cohort is not 0 percent',()=>{expect(percentage(1,4)).toBe('25.0%');expect(percentage(0,0)).toBe('—');});
 it('preserves one count per source row, not display group',()=>expect(dimensionCounts([row('MENTIONED'),row('MENTIONED')],'kg_operator_type')).toEqual([{label:'非牟利',count:2}]));
});
