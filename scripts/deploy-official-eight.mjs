/** Additive source gates around the existing authorised single-host deployment. */
import {readFileSync,writeFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(p));const out='artifacts/official-eight/deployment-result.json';const result={status:'BLOCKED',hostname:'schools.finpulsx.win',commit:process.env.GITHUB_SHA,database_writes:0,new_model_calls:0,production_upload_attempted:false};
try {
 const m=read('apps/web/dist-production/official-manifest.json'),v=read('artifacts/official-eight/verification.json'),b=read('artifacts/official-eight/backup-result.json');
 const zipsha=createHash('sha256').update(readFileSync('apps/web/dist-production/downloads/official-eight.zip')).digest('hex');
 if(process.env.SCHOOL_PRODUCTION_DEPLOY!==result.hostname||m.state!=='VERIFIED'||m.sources.length!==8||m.stats.excluded_rows||m.stats.synthetic_records||v.status!=='PASS'||v.bundle_id!==m.bundle_id||b.status!=='ARCHIVED'||b.bundle_id!==m.bundle_id||zipsha!==m.download_sha256||b.sha256!==zipsha)throw new Error('Eight-source validation and durable archive gates failed');
 result.bundle_id=m.bundle_id;result.base_data_id=m.base_data_id;result.backup_release=b.release_url;result.coverage=m.stats;result.production_upload_attempted=true;
 const child=spawnSync(process.execPath,['scripts/production-deploy.mjs','--execute'],{stdio:'inherit',env:process.env});if(child.status!==0||child.error)throw new Error('Existing production deployment did not pass');
 let verified=false;
 for(let attempt=0;attempt<12;attempt++){
  try{const responses=await Promise.all(['/official-manifest.json','/build-info.json','/insights-manifest.json'].map(p=>fetch('https://'+result.hostname+p,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)})));if(responses.some(r=>!r.ok))throw new Error('Version request failed');const [remote,build,insights]=await Promise.all(responses.map(r=>r.json()));
   if(remote.bundle_id!==m.bundle_id||remote.state!=='VERIFIED'||remote.stats.source_records!==m.stats.source_records||build.git_sha!==process.env.GITHUB_SHA||build.data_id!==m.base_data_id||insights.data_id!==m.base_data_id)throw new Error('Live source or code version mismatch');verified=true;break;
  }catch{await new Promise(r=>setTimeout(r,1500));}
 }
 if(!verified)throw new Error('New eight-source live manifest was not verified');result.status='LIVE_DATA_VERIFIED';result.verified_at=new Date().toISOString();result.browser_acceptance='SEPARATE_CI_STEP';
}catch(e){result.status=result.production_upload_attempted?'DEPLOYED_NOT_VERIFIED':'BLOCKED';result.reason=e instanceof Error?e.message:String(e);process.exitCode=1;}
writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
