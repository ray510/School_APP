/** Explicit staging-only deployment. No arbitrary host, database, SQL path or production switch. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,appendFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const HOST='schools-test.finpulsx.win';
export const WORKER='hk-school-guide-test';
export const OWNER='ray510/HK_APP';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const OUT=resolve(ROOT,'artifacts/test-site');
const digest=b=>createHash('sha256').update(b).digest('hex');
/** Table names a migration creates; identifiers are restricted so they can be interpolated into COUNT(*) probes. */
export function migrationTables(sql){
  return [...String(sql).matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([A-Za-z_][A-Za-z0-9_]*)/g)].map(match=>match[1]);
}
export function loadMigrations(directory=resolve(ROOT,'migrations')){
  return readdirSync(directory).filter(name=>name.endsWith('.sql')).sort().map(name=>({name,tables:migrationTables(readFileSync(resolve(directory,name),'utf8'))}));
}
/**
 * Decide whether an existing database with the expected name may be continued. Pure: callers gather the evidence.
 * A missing ownership table is never permission by itself; every piece of evidence must agree or the run stops without writing.
 */
export function assessExistingDatabase(evidence){
  const stop=reason=>({action:'stop',reason});
  const {expectedName,database,tables,ledger,migrations,counts,ownership,previous,resumeDatabaseId,manifest}=evidence;
  if(!database||database.name!==expectedName||!/^[a-f0-9-]{36}$/.test(database.uuid??''))return stop('Existing database identity does not match the package build ID');
  if(!Array.isArray(tables)||!Array.isArray(ledger)||!Array.isArray(migrations))return stop('Existing database schema or migration ledger could not be read');
  if(tables.includes('test_site_builds')){
    if(!Array.isArray(ownership)||ownership.length!==1||ownership[0].owner!==OWNER||ownership[0].hostname!==HOST||ownership[0].build_id!==manifest.build_id)return stop('Existing database ownership mismatch');
    return {action:ownership[0].ready===1?'skip_import':'import',reason:'Ownership record verified for this package',remaining:migrations.map(m=>m.name).filter(name=>!ledger.includes(name))};
  }
  if(!resumeDatabaseId)return stop('Existing database has no ownership record and no resume database ID was supplied');
  if(resumeDatabaseId!==database.uuid)return stop('Resume database ID does not match the existing database');
  if(!previous||previous.database_id!==database.uuid||previous.database_name!==database.name||previous.build_id!==manifest.build_id||previous.hostname!==HOST||previous.writes_performed!==true)return stop('Previous deployment result does not describe this database and package');
  const names=migrations.map(m=>m.name);
  if(ledger.length>names.length||ledger.some((name,index)=>name!==names[index]))return stop('Migration ledger is not a prefix of the repository migrations');
  const applied=migrations.slice(0,ledger.length);
  const allowed=new Set(['d1_migrations','_cf_KV','sqlite_sequence',...applied.flatMap(m=>m.tables)]);
  const unknown=tables.filter(table=>!allowed.has(table));
  if(unknown.length)return stop('Existing database contains tables outside the applied migrations: '+unknown.join(','));
  const missing=applied.flatMap(m=>m.tables).filter(table=>!tables.includes(table));
  if(missing.length)return stop('Migration ledger claims tables that do not exist: '+missing.join(','));
  const populated=applied.flatMap(m=>m.tables).filter(table=>counts?.[table]!==0);
  if(populated.length)return stop('Existing database already holds rows without an ownership record: '+populated.join(','));
  return {action:'import',reason:'Resuming an interrupted migration on an empty, ledger-consistent database',remaining:names.slice(ledger.length)};
}
export function checkPackage(m){
  if(m?.schema_version!==1||m.hostname!==HOST||m.environment!=='staging'||!/^[a-f0-9]{64}$/.test(m.build_id)||
     m.synthetic_records!==0||m.admission_events!==0||m.identity_approval!=='ANNUAL_RECORDS_UNLINKED'||
     !Number.isSafeInteger(m.estimated_write_budget)||m.estimated_write_budget<1||m.estimated_write_budget>75000||
     !Array.isArray(m.chunks)||!m.chunks.length||m.chunks.length>150||m.chunks.some(c=>!/^part-\d{4}\.sql$/.test(c.file)||!/^[a-f0-9]{64}$/.test(c.sha256)))throw new Error('Staging package validation failed');
  if(m.releases?.length!==3||new Set(m.releases.map(r=>r.level)).size!==3||m.releases.some(r=>!['KG','PRIMARY','SECONDARY'].includes(r.level)||r.channel!=='profiles:'+r.level||!/^rel_[a-f0-9]{32}$/.test(r.release_id)||!Number.isInteger(r.items)||r.items<1))throw new Error('Invalid staging release set');
}
export function budgetCheck(observation,estimated){
  if(!Number.isSafeInteger(observation.rows_written)||!Number.isSafeInteger(observation.rows_read)||observation.rows_written<0||observation.rows_read<0)throw new Error('Missing account-wide row metrics');
  if(observation.rows_written+estimated+10000>100000||observation.rows_read>4500000)throw new Error('Insufficient conservative Free-tier account budget; no write attempted');
}
export function configuration(root,account,id){
  if(!/^[a-f0-9]{32}$/.test(account)||!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid provider identifiers');
  return {name:WORKER,account_id:account,main:resolve(root,'apps/worker/src/index.ts'),compatibility_date:'2026-09-18',workers_dev:false,preview_urls:false,
    routes:[{pattern:HOST,custom_domain:true,zone_name:'finpulsx.win'}],triggers:{crons:[]},
    assets:{directory:resolve(root,'apps/web/dist'),binding:'ASSETS',not_found_handling:'single-page-application',run_worker_first:['/api','/api/*']},
    d1_databases:[{binding:'DB',database_name:'generated-test-database',database_id:id,migrations_dir:resolve(root,'migrations')}],
    vars:{APP_ENV:'staging',APP_TIMEZONE:'Asia/Hong_Kong',STRICT_FREE_MODE:'true',ALLOW_TEST_DATA:'false',ENABLE_ADMIN_WRITE:'false',ENABLE_SOURCE_PROBE:'false',DATA_UPDATE_MODE:'manual',ARCHIVE_MODE:'ci-artifact'}};
}
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--execute'||process.env.SCHOOL_TEST_DEPLOY!==HOST)throw new Error('Explicit staging execution confirmation required');
  mkdirSync(OUT,{recursive:true});
  const report={hostname:HOST,status:'STARTING',writes_performed:false,remote_d1_rows_written:null};
  function reportSave(){writeFileSync(resolve(OUT,'deployment-result.json'),JSON.stringify(report,null,2));}
  const token=process.env.CLOUDFLARE_API_TOKEN;
  if(!token){report.status='BLOCKED_MISSING_CREDENTIALS';report.reason='CLOUDFLARE_API_TOKEN is not available to the staging job';reportSave();throw new Error(report.reason);}
  const m=JSON.parse(readFileSync(resolve(OUT,'manifest.json'),'utf8'));checkPackage(m);
  const build=JSON.parse(readFileSync(resolve(ROOT,'apps/web/dist/build-info.json'),'utf8'));
  if(build.environment!=='staging'||build.indexing_enabled!==false||!/^[a-f0-9]{40}$/.test(build.git_sha))throw new Error('Staging build metadata is not valid');
  const reference=JSON.parse(readFileSync(resolve(ROOT,'apps/web/dist/source-reference/manifest.json'),'utf8'));
  if(reference.build_id!==m.build_id||reference.sources?.length!==3)throw new Error('Frontend source reference does not belong to this data package');
  report.build_id=m.build_id;report.frontend_git_sha=build.git_sha;
  const provenancePath=resolve(OUT,'package-provenance.json');
  if(existsSync(provenancePath)){const provenance=JSON.parse(readFileSync(provenancePath,'utf8'));if(provenance.package_build_id!==m.build_id||provenance.frontend_git_sha!==build.git_sha)throw new Error('Package provenance does not match the package and frontend being deployed');report.package_provenance=provenance;}
  const sql=m.chunks.map(c=>{const bytes=readFileSync(resolve(OUT,c.file));if(digest(bytes)!==c.sha256)throw new Error('SQL package hash mismatch');return bytes.toString('utf8');}).join('\n');
  if(Buffer.byteLength(sql)>15000000)throw new Error('SQL package exceeds budget');
  const sqlFile=resolve(OUT,'combined.sql');writeFileSync(sqlFile,sql);
  async function request(path,method='GET',body){
    const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error('Cloudflare '+method+' failed with HTTP '+response.status);
    const data=await response.json();if(data.success===false||data.errors?.length)throw new Error('Cloudflare rejected request; error codes '+(data.errors??[]).map(e=>e.code??'graphql').join(','));return data;
  }
  async function result(path,method='GET',body){return (await request(path,method,body)).result;}
  async function allDatabases(account){const rows=[];for(let page=1;page<=10;page++){const batch=await result('/accounts/'+account+'/d1/database?per_page=100&page='+page);if(!Array.isArray(batch))throw new Error('Invalid database list');rows.push(...batch);if(batch.length<100)return rows;}throw new Error('Database list may be truncated');}
  async function quota(account){const date=new Date().toISOString().slice(0,10);const query='query($account: string!, $date: Date!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$date,date_leq:$date}){sum{rowsRead rowsWritten} dimensions{databaseId}}}}}';
    const data=await request('/graphql','POST',{query,variables:{account,date}});const accounts=data.data?.viewer?.accounts;
    if(accounts?.length!==1||!Array.isArray(accounts[0].d1AnalyticsAdaptiveGroups)||accounts[0].d1AnalyticsAdaptiveGroups.length>=1000)throw new Error('Account analytics unavailable or truncated');
    const groups=accounts[0].d1AnalyticsAdaptiveGroups;if(groups.some(g=>!Number.isSafeInteger(g.sum?.rowsRead)||!Number.isSafeInteger(g.sum?.rowsWritten)))throw new Error('Invalid row metrics');
    return {date,observed_at:new Date().toISOString(),rows_read:groups.reduce((n,g)=>n+g.sum.rowsRead,0),rows_written:groups.reduce((n,g)=>n+g.sum.rowsWritten,0),scope:'account-wide UTC day; provider analytics can lag'};
  }
  let account;let db;let configPath;const wrangler=resolve(ROOT,'node_modules/wrangler/bin/wrangler.js');
  function run(args,capture=false){const r=spawnSync(process.execPath,[wrangler,...args],{cwd:ROOT,encoding:'utf8',stdio:capture?'pipe':'inherit',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account,WRANGLER_SEND_METRICS:'false',CI:'true'}});if(r.status!==0||r.error)throw new Error('Wrangler operation failed ('+args.slice(0,3).join(' ')+'); existing test database is retained');return capture?r.stdout:'';}
  async function dbQuery(sql){const r=await result('/accounts/'+account+'/d1/database/'+db.uuid+'/query','POST',{sql});if(!Array.isArray(r)||!r.every(x=>x.success))throw new Error('D1 verification failed');return r.flatMap(x=>x.results??[]);}
  try{
    const zones=await result('/zones?name=finpulsx.win&per_page=50');const owned=zones.filter(z=>z.name==='finpulsx.win'&&z.status==='active'&&(!process.env.CLOUDFLARE_ACCOUNT_ID||z.account.id===process.env.CLOUDFLARE_ACCOUNT_ID));
    if(owned.length!==1)throw new Error('Expected one active owned finpulsx.win zone');const zone=owned[0];account=zone.account.id;
    const records=await result('/zones/'+zone.id+'/dns_records?name='+HOST+'&per_page=100');
    const domainResponse=await request('/accounts/'+account+'/workers/domains');const domains=domainResponse.result;
    if(!Array.isArray(domains)||domainResponse.result_info?.total_pages>1)throw new Error('Worker domain list unavailable or incomplete');
    const target=domains.filter(d=>d.hostname===HOST);
    if(target.some(d=>d.service!==WORKER)||(records.length&&target.length!==1))throw new Error('Hostname already used by another configuration; no DNS records deleted');
    const routes=await result('/zones/'+zone.id+'/workers/routes');
    for(const route of routes){const pattern=String(route.pattern).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');if(route.script!==WORKER&&(new RegExp('^'+pattern+'$').test('https://'+HOST+'/')||new RegExp('^'+pattern+'$').test(HOST+'/')))throw new Error('Existing Worker route covers target; refusing to alter main-site routing');}
    const scripts=await result('/accounts/'+account+'/workers/scripts');
    if(scripts.some(s=>s.id===WORKER)&&!target.length)throw new Error('Reserved test Worker name already exists without the expected domain; inspect ownership first');
    const observation=await quota(account);budgetCheck(observation,m.estimated_write_budget);report.preflight_quota=observation;
    const databases=await allDatabases(account);const dbName='hk-school-guide-test-'+m.build_id.slice(0,12);const matches=databases.filter(d=>d.name===dbName);if(matches.length>1)throw new Error('Ambiguous target database');
    if(databases.length>=10&&!matches.length)throw new Error('Conservative Free-tier database count limit reached; no databases deleted');
    if(databases.some(d=>typeof d.file_size!=='number'))throw new Error('Account storage coverage unavailable');
    if(databases.reduce((n,d)=>n+d.file_size,0)+50000000>5000000000)throw new Error('Insufficient account storage budget');
    if(target.length){report.previous_worker_settings=await result('/accounts/'+account+'/workers/scripts/'+WORKER+'/settings');}
    db=matches[0];let assessment={action:'import',reason:'No database with the package name exists yet',remaining:loadMigrations().map(x=>x.name)};
    if(db){
      // Read-only evidence first. The ownership table only exists once the data package has run, so it cannot be queried blindly.
      const tables=(await dbQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(row=>row.name);
      const ledger=tables.includes('d1_migrations')?(await dbQuery('SELECT name FROM d1_migrations ORDER BY id')).map(row=>row.name):[];
      const ownership=tables.includes('test_site_builds')?await dbQuery('SELECT owner,hostname,ready,build_id FROM test_site_builds'):null;
      const migrations=loadMigrations();
      const probe=migrations.slice(0,ledger.length).flatMap(x=>x.tables).filter(table=>tables.includes(table));
      const counts={};if(probe.length){for(const row of await dbQuery(probe.map(table=>`SELECT '${table}' AS t,COUNT(*) AS n FROM ${table}`).join(';')))counts[row.t]=row.n;}
      const previousPath=resolve(OUT,'previous-deployment-result.json');
      const previous=existsSync(previousPath)?JSON.parse(readFileSync(previousPath,'utf8')):null;
      assessment=assessExistingDatabase({expectedName:dbName,database:{name:db.name,uuid:db.uuid},tables,ledger,migrations,counts,ownership,previous,resumeDatabaseId:process.env.SCHOOL_TEST_RESUME_DATABASE_ID||undefined,manifest:m});
      report.existing_database={id:db.uuid,name:db.name,created_at:db.created_at??null,tables,migration_ledger:ledger,row_counts:counts,assessment};
      if(assessment.action==='stop'){report.status='BLOCKED_RESUME_UNVERIFIED';throw new Error(assessment.reason);}
    }
    const alreadyReady=assessment.action==='skip_import';
    configPath=resolve(OUT,'wrangler.test.json');let config=configuration(ROOT,account,db?.uuid??'00000000-0000-0000-0000-000000000002');config.d1_databases[0].database_name=dbName;writeFileSync(configPath,JSON.stringify(config,null,2));
    run(['deploy','--config',configPath,'--dry-run']);
    if(!db){db=await result('/accounts/'+account+'/d1/database','POST',{name:dbName,primary_location_hint:'apac'});report.writes_performed=true;}
    if(!db.uuid)throw new Error('D1 UUID not returned');report.database_id=db.uuid;report.database_name=dbName;report.build_id=m.build_id;reportSave();
    config=configuration(ROOT,account,db.uuid);config.d1_databases[0].database_name=dbName;writeFileSync(configPath,JSON.stringify(config,null,2));
    if(!alreadyReady){
      budgetCheck(await quota(account),m.estimated_write_budget);
      report.writes_performed=true;run(['d1','migrations','apply','DB','--config',configPath,'--remote']);
      const output=run(['d1','execute','DB','--config',configPath,'--remote','--file',sqlFile,'--yes','--json'],true);writeFileSync(resolve(OUT,'d1-import-result.json'),output);
      try{const data=JSON.parse(output);if(Array.isArray(data)&&data.every(x=>Number.isFinite(x.meta?.rows_written)))report.remote_d1_rows_written=data.reduce((n,x)=>n+x.meta.rows_written,0);}catch{/* Keep unknown, never report a fabricated zero. */}
    }
    const actual=await dbQuery("SELECT s.level,COUNT(*) AS n,SUM(s.is_test) AS synthetic FROM school_search s JOIN release_heads h ON h.release_id=s.release_id GROUP BY s.level");
    if(m.releases.some(expected=>!actual.some(a=>a.level===expected.level&&a.n===expected.items&&a.synthetic===0)))throw new Error('Remote data coverage check failed');
    if((await dbQuery('PRAGMA foreign_key_check')).length)throw new Error('Remote foreign key check failed');
    report.database_verified=true;reportSave();
    run(['deploy','--config',configPath]);report.status='DEPLOYED_AWAITING_HTTPS';reportSave();
    let healthy=false;
    for(let attempt=0;attempt<30;attempt++){
      try{const r=await fetch('https://'+HOST+'/api/v1/health',{redirect:'error',signal:AbortSignal.timeout(8000)});const h=await r.json();if(r.ok&&h.data?.environment==='staging'&&h.data?.database==='ok'&&h.data?.data_status==='published'){healthy=true;break;}}catch{/* Certificate/DNS propagation; GET only. */}
      await new Promise(r=>setTimeout(r,3000));
    }
    if(!healthy)throw new Error('Deployment returned, but HTTPS health could not be verified; do not call the site ready');
    for(const expected of m.releases){const r=await fetch('https://'+HOST+'/api/v1/schools?level='+expected.level+'&year=2027',{redirect:'error',signal:AbortSignal.timeout(10000)});const body=await r.json();if(!r.ok||body.meta?.release_id!==expected.release_id||!body.data?.length||body.data.some(p=>p.is_test))throw new Error('Remote catalog smoke failed');}
    const refs=await fetch('https://'+HOST+'/source-reference/manifest.json',{redirect:'error',signal:AbortSignal.timeout(10000)});const reference=await refs.json();if(!refs.ok||reference.build_id!==m.build_id||reference.sources?.length!==3)throw new Error('Reference source manifest verification failed');
    const missing=await fetch('https://'+HOST+'/api/not-found',{redirect:'error',signal:AbortSignal.timeout(10000)});if(missing.status!==404||!missing.headers.get('content-type')?.includes('application/json'))throw new Error('API 404 boundary failed');
    const robots=await fetch('https://'+HOST+'/robots.txt',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!(await robots.text()).includes('Disallow: /'))throw new Error('Test-site indexing guard failed');
    report.status='LIVE_VERIFIED';report.url='https://'+HOST;report.verified_at=new Date().toISOString();
  }catch(error){report.status=report.status==='DEPLOYED_AWAITING_HTTPS'?'DEPLOYED_NOT_VERIFIED':report.status==='BLOCKED_RESUME_UNVERIFIED'?report.status:'BLOCKED';report.reason=error instanceof Error?error.message:'Deployment failed';process.exitCode=1;}
  finally{reportSave();console.log(JSON.stringify({status:report.status,hostname:HOST,writes_performed:report.writes_performed,reason:report.reason??null}));if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Test deployment\n```json\n'+JSON.stringify(report,null,2)+'\n```\n');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
