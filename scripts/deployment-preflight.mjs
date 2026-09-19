/** Offline preflight only: validate local config and supplied recent account evidence, never deploy. */
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,arg,index,args)=>{if(arg.startsWith('--'))pairs.push([arg.slice(2),args[index+1]]);return pairs;},[]));
const environment=options.environment;const failures=[];
if(!['staging','production'].includes(environment))failures.push('Explicit staging or production environment required');
const config=JSON.parse(readFileSync(resolve(root,'wrangler.jsonc'),'utf8'));
const selected=config.env?.[environment];
const db=selected?.d1_databases?.find(binding=>binding.binding==='DB');
if(selected?.vars?.APP_ENV!==environment)failures.push('APP_ENV mismatch');
if(!db||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(db.database_id)||db.database_id.startsWith('00000000-'))failures.push('Real target D1 ID not supplied');
const other=environment==='staging'?'production':'staging';
if(db?.database_id===config.env?.[other]?.d1_databases?.[0]?.database_id)failures.push('Staging and production share D1');
if(selected?.vars?.ENABLE_ADMIN_WRITE!=='false'||selected?.vars?.ENABLE_SOURCE_PROBE!=='false'||(selected?.triggers?.crons??[]).length)failures.push('Initial deployment must keep admin writes, probes and cron disabled');
if(environment==='production'&&selected?.vars?.ALLOW_TEST_DATA!=='false')failures.push('Production must reject test data');
const buildPath=resolve(root,'apps/web/dist/build-info.json');
if(!existsSync(buildPath))failures.push('Build metadata missing');
else{const build=JSON.parse(readFileSync(buildPath,'utf8'));if(build.environment!==environment)failures.push('Built assets target a different environment');if(!build.git_sha)failures.push('Build git SHA unavailable');}
let quota=null;
if(!options.quota)failures.push('Recent account-wide quota evidence is required, not only this database');
else{
  try{
    quota=JSON.parse(readFileSync(resolve(options.quota),'utf8'));
    const age=Date.now()-Date.parse(quota.as_of);
    if(!/^[0-9a-f]{32}$/i.test(quota.account_id??'')||quota.coverage!=='account_all_d1')failures.push('Quota evidence needs account ID and all-database coverage');
    if(!Number.isFinite(age)||age<0||age>15*60*1000)failures.push('Quota observation must be within the preceding 15 minutes');
    if(quota.utc_day!==new Date().toISOString().slice(0,10))failures.push('Quota UTC day mismatch');
    if(!Number.isSafeInteger(quota.rows_written)||quota.rows_written<0||!Number.isSafeInteger(quota.daily_write_limit)||quota.daily_write_limit<=0)failures.push('Invalid row-write quota values');
    const planned=Number(options['estimated-writes']);
    if(!Number.isSafeInteger(planned)||planned<0)failures.push('Explicit estimated writes required, including migration/index/audit amplification');
    else if(planned+10000>quota.daily_write_limit-quota.rows_written)failures.push('Insufficient account write headroom after 10,000-row reserve');
  }catch{failures.push('Quota evidence file cannot be parsed');}
}
if(environment==='production'&&options['confirm-production']!=='yes')failures.push('Production confirmation is required');
// These local checks do not attest that supplied account evidence is genuine or still current.
console.log(JSON.stringify({status:failures.length?'BLOCKED':'LOCAL_PREFLIGHT_PASS',environment,failures,remote_requests:0,remote_writes:0,limitations:['Offline file validation only','Run authenticated read-only binding checks and staging acceptance before any deployment','No command in this script creates resources, migrates, seeds or deploys']},null,2));
process.exitCode=failures.length?1:0;
