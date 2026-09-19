/** Explicit update of the already-owned staging Worker and D1 only. Never creates databases or changes another host. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {configuration,budgetCheck,HOST,WORKER} from './deploy-test-site.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));const OUT=resolve(ROOT,'artifacts/pilot');
const DB='f80ca4cd-5e0a-4e9c-94ab-e4acdcbfda89';const ACCOUNT='7760594e84ff17502a2cfefd16616f0d';
const BASE='f6350475fa412107c9da0c9c90c941d283b50c02213b0fc4c24689359b91c51d';
const sha=v=>createHash('sha256').update(v).digest('hex');
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
export function validatePilot(m){
 const {build_id,...subject}=m;
 if(m.schema_version!==1||m.hostname!==HOST||m.database_id!==DB||m.baseline_build_id!==BASE||m.school_count!==30||m.event_count!==15||m.synthetic_records!==0||m.human_review!==false||m.estimated_write_budget!==5000||sha(canonical(subject))!==build_id)throw new Error('Pilot manifest or target mismatch');
 if(!Array.isArray(m.manifests)||m.manifests.length!==7||new Set(m.manifests.map(x=>x.channel)).size!==7||m.manifests.some(x=>!(/^(annual:|events:)/.test(x.channel))||!/^rel_[a-f0-9]{32}$/.test(x.release_id)))throw new Error('Unexpected publication streams');
 if(!Array.isArray(m.chunks)||m.chunks.length!==14||m.chunks.some(c=>!/^pilot-\d{3}\.sql$/.test(c.file)||!/^[a-f0-9]{64}$/.test(c.sha256)))throw new Error('Unexpected SQL chunk list');
 return m;
}
async function main(){
 if(process.argv[2]!=='--execute'||process.argv.length!==3||process.env.SCHOOL_PILOT_DEPLOY!==HOST)throw new Error('Explicit pilot staging execution required');
 mkdirSync(OUT,{recursive:true});const report={status:'STARTING',hostname:HOST,database_id:DB,database_created:false,writes_attempted:false,provider_rows_written:0,provider_rows_read:0};
 const save=()=>writeFileSync(resolve(OUT,'deployment-result.json'),JSON.stringify(report,null,2)+'\n');
 try{
  const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw new Error('Staging credential unavailable');
  if(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT)throw new Error('Configured account mismatch');
  const m=validatePilot(JSON.parse(readFileSync(resolve(OUT,'manifest.json'),'utf8')));report.pilot_build_id=m.build_id;
  const build=JSON.parse(readFileSync(resolve(ROOT,'apps/web/dist/build-info.json'),'utf8'));
  if(build.environment!=='staging'||build.indexing_enabled!==false||!/^[a-f0-9]{40}$/.test(build.git_sha))throw new Error('Staging frontend not verified');report.frontend_commit=build.git_sha;
  const sql=m.chunks.map(c=>{const bytes=readFileSync(resolve(OUT,c.file));if(sha(bytes)!==c.sha256||bytes.length>1000000)throw new Error('SQL evidence hash or size mismatch');return bytes.toString('utf8');});
  async function api(path,method='GET',body){
   const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok)throw new Error('Cloudflare HTTP '+response.status+' for '+method+' '+path.split('?')[0]);const value=await response.json();if(value.success===false||value.errors?.length)throw new Error('Cloudflare API rejected request: '+JSON.stringify((value.errors??[]).map(e=>({code:e.code,message:e.message}))));return value;
  }
  async function query(sql,write=false){if(write){report.writes_attempted=true;save();}const r=(await api('/accounts/'+ACCOUNT+'/d1/database/'+DB+'/query','POST',{sql})).result;
   if(!Array.isArray(r)||r.some(x=>x.success===false))throw new Error('D1 statement failed');
   for(const x of r){if(Number.isFinite(x.meta?.rows_written)&&report.provider_rows_written!==null)report.provider_rows_written+=x.meta.rows_written;else report.provider_rows_written=null;if(Number.isFinite(x.meta?.rows_read)&&report.provider_rows_read!==null)report.provider_rows_read+=x.meta.rows_read;else report.provider_rows_read=null;}return r.flatMap(x=>x.results??[]);
  }
  async function quota(){const date=new Date().toISOString().slice(0,10);const q='query($account: string!, $date: Date!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$date,date_leq:$date}){sum{rowsRead rowsWritten} dimensions{databaseId}}}}}';const r=await api('/graphql','POST',{query:q,variables:{account:ACCOUNT,date}});const a=r.data?.viewer?.accounts;if(a?.length!==1||!Array.isArray(a[0].d1AnalyticsAdaptiveGroups)||a[0].d1AnalyticsAdaptiveGroups.length>=1000)throw new Error('Quota observation unavailable');const g=a[0].d1AnalyticsAdaptiveGroups;if(g.some(x=>!Number.isSafeInteger(x.sum?.rowsRead)||!Number.isSafeInteger(x.sum?.rowsWritten)))throw new Error('Quota metrics incomplete');return {date,observed_at:new Date().toISOString(),rows_written:g.reduce((n,x)=>n+x.sum.rowsWritten,0),rows_read:g.reduce((n,x)=>n+x.sum.rowsRead,0)};}
  const database=(await api('/accounts/'+ACCOUNT+'/d1/database/'+DB)).result;if(database.uuid!==DB||database.name!=='hk-school-guide-test-'+BASE.slice(0,12))throw new Error('Existing DB identity mismatch');
  const domains=(await api('/accounts/'+ACCOUNT+'/workers/domains')).result;if(!Array.isArray(domains)||domains.filter(d=>d.hostname===HOST&&d.service===WORKER).length!==1)throw new Error('Existing staging domain ownership not verified');
  const owners=await query('SELECT owner,hostname,build_id,ready FROM test_site_builds');if(owners.length!==1||owners[0].owner!=='ray510/HK_APP'||owners[0].hostname!==HOST||owners[0].build_id!==BASE||owners[0].ready!==1)throw new Error('Staging ownership or baseline not ready');
  const migrations=await query('SELECT name FROM d1_migrations ORDER BY name');const expected=['001_initial_schema.sql','002_catalog_events_publication.sql','003_event_publication_guard.sql','004_annual_profiles.sql'];if(JSON.stringify(migrations.map(x=>x.name))!==JSON.stringify(expected))throw new Error('Unexpected migration ledger; no migrations will be applied');
  const baseline=await query("SELECT channel,release_id,revision FROM release_heads WHERE channel LIKE 'profiles:%' ORDER BY channel");
  const baseManifest=JSON.parse(readFileSync(resolve(ROOT,'artifacts/test-site/manifest.json'),'utf8'));if(baseline.length!==3||baseManifest.releases.some(r=>!baseline.some(b=>b.channel===r.channel&&b.release_id===r.release_id)))throw new Error('Baseline release context mismatch');
  const heads=await query('SELECT channel,release_id,revision FROM release_heads');for(const stream of m.manifests){const old=heads.find(h=>h.channel===stream.channel);if(old&&(old.release_id!==stream.release_id||old.revision!==1))throw new Error('Pilot stream already contains a different release; explicit new review required');}
  const alreadyPublished=m.manifests.every(s=>heads.some(h=>h.channel===s.channel&&h.release_id===s.release_id));
  report.preflight_quota=await quota();budgetCheck(report.preflight_quota,alreadyPublished?100:5000);
  const config=configuration(ROOT,ACCOUNT,DB);config.d1_databases[0].database_name=database.name;const configPath=resolve(OUT,'wrangler.pilot.json');writeFileSync(configPath,JSON.stringify(config,null,2));
  function wrangler(args){const p=spawnSync(process.execPath,[resolve(ROOT,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:ROOT,stdio:'inherit',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false',CI:'true'}});if(p.status!==0||p.error)throw new Error('Wrangler failed: '+args.slice(0,2).join(' '));}
  wrangler(['deploy','--config',configPath,'--dry-run']);
  report.previous_deployments=(await api('/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+'/deployments')).result;
  writeFileSync(resolve(OUT,'before.json'),JSON.stringify({baseline,heads,owners,migrations,previous_deployments:report.previous_deployments},null,2));
  wrangler(['d1','export','DB','--config',configPath,'--remote','--output',resolve(OUT,'before.sql'),'--yes']);report.backup_sha256=sha(readFileSync(resolve(OUT,'before.sql')));save();
  if(!alreadyPublished){budgetCheck(await quota(),5000);for(const statement of sql.slice(0,7))await query(statement,true);}
  // Stage first, then deploy a backwards-compatible reader, then atomically publish each reviewed stream.
  wrangler(['deploy','--config',configPath]);report.status='WORKER_DEPLOYED';save();
  if(!alreadyPublished)for(const statement of sql.slice(7))await query(statement,true);
  const after=await query("SELECT channel,release_id,revision FROM release_heads WHERE channel LIKE 'profiles:%' ORDER BY channel");if(JSON.stringify(after)!==JSON.stringify(baseline))throw new Error('Baseline release changed unexpectedly');
  if((await query('PRAGMA foreign_key_check')).length)throw new Error('Foreign-key verification failed');
  const count=await query("SELECT p.level,COUNT(*) AS n FROM annual_profile_versions p JOIN annual_release_items i ON i.annual_profile_id=p.annual_profile_id JOIN release_heads h ON h.release_id=i.release_id WHERE h.channel LIKE 'annual:%' AND p.identity_verified=1 AND p.is_test=0 GROUP BY p.level");if(count.length!==3||count.some(r=>r.n!==10))throw new Error('Annual pilot coverage mismatch');report.annual_by_level=count;
  const eventCount=await query("SELECT COUNT(*) AS n FROM event_versions e JOIN event_release_items i ON i.event_version_id=e.event_version_id JOIN release_heads h ON h.release_id=i.release_id WHERE h.channel LIKE 'events:%' AND e.is_test=0 AND e.verified=1");if(eventCount[0]?.n!==15)throw new Error('Event coverage mismatch');report.events=15;
  const newHeads=await query('SELECT channel,release_id,revision FROM release_heads');if(m.manifests.some(s=>!newHeads.some(h=>h.channel===s.channel&&h.release_id===s.release_id)))throw new Error('Pilot head verification failed');report.release_heads=newHeads;
  async function get(path){const r=await fetch('https://'+HOST+path,{redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw new Error('Live HTTP '+r.status+' '+path);return r.json();}
  const live=await get('/build-info.json');if(live.git_sha!==build.git_sha||live.environment!=='staging')throw new Error('Live frontend commit mismatch');
  const pilot=await get('/pilot-report.json');if(pilot.build_id!==m.build_id)throw new Error('Live pilot data report mismatch');
  for(const level of ['KG','PRIMARY','SECONDARY']){const schools=await get('/api/v1/schools?level='+level+'&year=2027&has_annual=1&limit=40');if(schools.data?.length!==10||schools.data.some(s=>s.is_test))throw new Error('Live pilot search mismatch');const annual=await get('/api/v1/annual-profiles?level='+level+'&school='+schools.data[0].school_id);if(annual.data?.length!==1)throw new Error('Live annual details missing');const events=await get('/api/v1/events?level='+level+'&year=2027');if(!events.data?.length)throw new Error('Live events missing');}
  report.status='LIVE_VERIFIED';report.verified_at=new Date().toISOString();report.url='https://'+HOST;
 }catch(error){report.reason=error instanceof Error?error.message:'Pilot deployment failed';report.status=report.status==='WORKER_DEPLOYED'?'DEPLOYED_NOT_VERIFIED':'BLOCKED';process.exitCode=1;}
 finally{save();console.log(JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
