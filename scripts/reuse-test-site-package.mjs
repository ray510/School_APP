/** Reuse a hash-verified real-data package from an earlier workflow run. No network access; never touches Cloudflare. */
import {readFileSync,writeFileSync,existsSync,cpSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {checkPackage,HOST} from './deploy-test-site.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const OUT=resolve(ROOT,'artifacts/test-site');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitSha=value=>/^[a-f0-9]{40}$/.test(value??'')?value:null;
/** Every hash the package carries is recomputed from the downloaded bytes before anything is copied into the workspace. */
export function verifyPackage(from){
  const manifest=JSON.parse(readFileSync(resolve(from,'artifacts/test-site/manifest.json'),'utf8'));checkPackage(manifest);
  for(const chunk of manifest.chunks){if(sha(readFileSync(resolve(from,'artifacts/test-site',chunk.file)))!==chunk.sha256)throw new Error('Reused SQL chunk hash mismatch: '+chunk.file);}
  const raws=[{id:'edb-school-directory',hash:manifest.baseline?.raw_sha256},...(manifest.annual??[]).map(source=>({id:source.id,hash:source.raw_sha256}))];
  if(raws.length!==4)throw new Error('Reused package must carry the baseline and three annual sources');
  for(const raw of raws){
    if(!/^[a-z-]+$/.test(raw.id??'')||!/^[a-f0-9]{64}$/.test(raw.hash??''))throw new Error('Invalid source reference in reused manifest');
    const path=resolve(from,'archive',raw.id,raw.hash,'raw.csv');
    if(!existsSync(path)||sha(readFileSync(path))!==raw.hash)throw new Error('Reused archive hash mismatch: '+raw.id);
  }
  const reference=JSON.parse(readFileSync(resolve(from,'apps/web/dist/source-reference/manifest.json'),'utf8'));
  if(reference.build_id!==manifest.build_id||reference.sources?.length!==3)throw new Error('Reused source reference does not match the package');
  for(const source of manifest.annual){
    const index=JSON.parse(readFileSync(resolve(from,'apps/web/dist/source-reference',source.id,'index.json'),'utf8'));
    if(index.records?.length!==source.rows||index.source?.raw_sha256!==source.raw_sha256)throw new Error('Reused source reference records differ from the manifest: '+source.id);
  }
  const report=JSON.parse(readFileSync(resolve(from,'apps/web/dist/test-data-report.json'),'utf8'));
  if(report.build_id!==manifest.build_id)throw new Error('Reused test data report does not match the package');
  const build=JSON.parse(readFileSync(resolve(from,'apps/web/dist/build-info.json'),'utf8'));
  return {manifest,dataGitSha:gitSha(build.git_sha)};
}
export function checkPrevious(previous,manifest){
  if(previous?.hostname!==HOST||previous.build_id!==manifest.build_id||!/^[a-f0-9-]{36}$/.test(previous.database_id??'')||previous.database_name!=='hk-school-guide-test-'+manifest.build_id.slice(0,12))throw new Error('Previous deployment result does not belong to this package');
  return previous;
}
function stage(from,previousPath,runId){
  const {manifest,dataGitSha}=verifyPackage(from);
  mkdirSync(OUT,{recursive:true});
  for(const name of ['manifest.json','exclusions.json','profiles.json',...manifest.chunks.map(chunk=>chunk.file)])cpSync(resolve(from,'artifacts/test-site',name),resolve(OUT,name));
  cpSync(resolve(from,'archive'),resolve(ROOT,'archive'),{recursive:true});
  if(previousPath){const previous=checkPrevious(JSON.parse(readFileSync(previousPath,'utf8')),manifest);writeFileSync(resolve(OUT,'previous-deployment-result.json'),JSON.stringify(previous,null,2)+'\n');}
  const provenance={schema_version:1,reused_run_id:runId,package_build_id:manifest.build_id,data_git_sha:dataGitSha,frontend_git_sha:null,staged_at:new Date().toISOString()};
  writeFileSync(resolve(OUT,'package-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({staged:true,build_id:manifest.build_id,chunks:manifest.chunks.length,data_git_sha:dataGitSha,previous_result:Boolean(previousPath)}));
}
/** After `pnpm build:web` at the current commit, put the package's annual source reference back into the fresh dist. */
function overlay(from){
  const {manifest}=verifyPackage(from);
  const dist=resolve(ROOT,'apps/web/dist');
  const build=JSON.parse(readFileSync(resolve(dist,'build-info.json'),'utf8'));
  if(build.environment!=='staging'||!gitSha(build.git_sha))throw new Error('Rebuild the staging frontend at this commit before overlaying the source reference');
  rmSync(resolve(dist,'source-reference'),{recursive:true,force:true});
  cpSync(resolve(from,'apps/web/dist/source-reference'),resolve(dist,'source-reference'),{recursive:true});
  cpSync(resolve(from,'apps/web/dist/test-data-report.json'),resolve(dist,'test-data-report.json'));
  const path=resolve(OUT,'package-provenance.json');
  const provenance=JSON.parse(readFileSync(path,'utf8'));
  if(provenance.package_build_id!==manifest.build_id)throw new Error('Staged provenance does not match the package');
  writeFileSync(path,JSON.stringify({...provenance,frontend_git_sha:build.git_sha,frontend_built_at:build.built_at,overlaid_at:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({overlaid:true,build_id:manifest.build_id,frontend_git_sha:build.git_sha,data_git_sha:provenance.data_git_sha}));
}
function main(){
  const {values,positionals}=parseArgs({allowPositionals:true,options:{from:{type:'string'},previous:{type:'string'},'run-id':{type:'string'}}});
  const from=values.from&&resolve(ROOT,values.from);
  if(!from||!existsSync(from))throw new Error('--from must point at the downloaded package directory');
  if(positionals[0]==='stage'){
    if(!/^\d{1,20}$/.test(values['run-id']??''))throw new Error('--run-id must be the numeric workflow run that produced the package');
    stage(from,values.previous&&resolve(ROOT,values.previous),values['run-id']);return;
  }
  if(positionals[0]==='overlay'){overlay(from);return;}
  throw new Error('Usage: reuse-test-site-package.mjs <stage|overlay> --from <dir> [--previous <deployment-result.json>] --run-id <id>');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{main();}catch(error){console.error(error instanceof Error?error.message:'Package reuse failed');process.exitCode=1;}}
