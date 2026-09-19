/** Explicit live source validation, including real N.A. URL regression. Never publishes. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildSource,readBundle} from '../tools/cli/src/pipeline';
const report=JSON.parse(readFileSync('artifacts/source-probe.json','utf8')) as {sources:Array<{source_id:string;status:string;archive?:string;resources?:Array<{url:string;format:string;name?:string}>;reason?:string}>};
for(const source of report.sources){
  console.log(JSON.stringify({source_id:source.source_id,status:source.status,reason:source.reason,resource_count:source.resources?.length,csv_candidates:source.resources?.filter(resource=>resource.format?.toLowerCase()==='csv'&&resource.name?.includes('Traditional Chinese'))}));
}
const source=report.sources.find(value=>value.source_id==='edb-school-directory');
if(source?.status!=='LIVE_VERIFIED'||!source.archive)throw new Error('S01 live structural validation failed');
for(const level of ['KG','PRIMARY','SECONDARY']){
  const out=`artifacts/live-${level.toLowerCase()}`;
  await buildSource({source:'edb-school-directory',level,scope:'canary',limit:5,out,input:resolve(source.archive,'raw.csv')});
  const bundle=readBundle(out);
  if(bundle.profiles.length!==5||bundle.profiles.some(profile=>profile.is_test||profile.fee.state==='known'||profile.source_reference_period!==null))throw new Error('Canary trust boundary failed');
  console.log(JSON.stringify({level,items:bundle.profiles.length,release_id:bundle.release_id,source_hash:bundle.raw_sha256,status:'NORMALIZED_NOT_PUBLISHED',names:bundle.profiles.map(profile=>profile.chinese_name)}));
}
