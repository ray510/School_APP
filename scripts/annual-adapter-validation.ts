/** Validate all three adapters against the exact raw files fetched by the explicit workflow. */
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
import {parseAnnual,prepareAnnual} from '../tools/cli/src/annual';
const sources=JSON.parse(readFileSync('artifacts/source-probe.json','utf8')) as {sources:Array<{source_id:string;archive?:string}>};
const baseline=sources.sources.find(source=>source.source_id==='edb-school-directory')?.archive;if(!baseline)throw new Error('Baseline evidence not available');
const observations=JSON.parse(readFileSync('artifacts/annual-source-contracts.json','utf8')) as Array<{source_id:string;status:string;sha256:string;row_count:number;catalogue_label:string}>;
for(const source of observations){
  if(source.status!=='RAW_INSPECTED_NOT_MAPPED')throw new Error('Annual source remains BLOCKED: '+source.source_id);
  const input=resolve('archive',source.source_id,source.sha256,'raw.csv');const parsed=parseAnnual(readFileSync(input),source.source_id);
  if(parsed.records.length!==source.row_count)throw new Error('Independent parser record count mismatch: '+source.source_id);
  console.log(JSON.stringify({source_id:source.source_id,status:'ADAPTER_PARSED_NOT_PUBLISHED',records:parsed.records.length,headers:parsed.headers.length,raw_sha256:source.sha256}));
  prepareAnnual({input,baseline:resolve(baseline,'raw.csv'),edition:source.catalogue_label,out:resolve('artifacts','annual-review',source.source_id)});
}
