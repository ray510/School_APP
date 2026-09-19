export interface ClassificationEvidence {source_id:string;edition:string;source_url:string;source_sha256:string;record_sha256:string;row:number;field:string;raw_value:string;reference_period:string|null}
export interface Dimension {value:string|null;label:string;state:'known'|'not_provided'|'not_applicable'|'unrecognized'|'conflict';evidence:ClassificationEvidence[];historical_differences?:Dimension[]}
export interface Classification {version?:string;funding_type:Dimension;kg_operator_type:Dimension;kg_scheme_participation:Dimension}
export const fundingLabels:Record<string,string>={GOVERNMENT:'官立',AIDED:'資助',DSS:'直資',PRIVATE:'私立',PIS:'私立獨立學校計劃',ESF:'英基學校協會',CAPUT:'按位津貼'};
export const operatorLabels:Record<string,string>={NON_PROFIT:'非牟利',PRIVATE_INDEPENDENT:'私立獨立'};
export const schemeLabels:Record<string,string>={PARTICIPATING:'有參加',NOT_PARTICIPATING:'沒有參加',PENDING:'申請審核中'};
export function classificationSummary(s:{level:string;classification:Classification}):string {
 const c=s.classification;
 if(s.level==='KG')return (c.kg_operator_type.state==='known'?c.kg_operator_type.label:'幼稚園營辦性質未核對')+' · '+(c.kg_scheme_participation.state==='known'?c.kg_scheme_participation.label:'計劃參與資料未對應');
 return c.funding_type.label;
}
export function evidencePeriod(d:Dimension):string {return [...new Set(d.evidence.map(e=>e.edition))].join('／')||'來源未提供；不推定';}
