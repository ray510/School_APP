#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSource, probeSources, reviewBundle, importBundle, executeLocal, publicationSql, seedDemo } from './pipeline';
function localScript(script:string,args:string[]):void {
  const result=spawnSync(process.execPath,[fileURLToPath(new URL(`../../../scripts/${script}`,import.meta.url)),...args],{stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)throw new Error('Local command failed');
}
const environment={type:'string' as const,choices:['local','staging','production'],default:'local'};
void yargs(hideBin(process.argv))
.command('source','Source contracts and baseline bundles',command=>command
  .command('probe','Explicit read-only source checks',{all:{type:'boolean',default:false},out:{type:'string',default:'artifacts/source-probe.json'}},argv=>probeSources(argv.out,argv.all))
  .command('build','Build S01 baseline, no implicit publication',{
    source:{type:'string',demandOption:true},level:{type:'string',choices:['KG','PRIMARY','SECONDARY'],demandOption:true},scope:{type:'string',choices:['full','canary'],default:'canary'},limit:{type:'number'},out:{type:'string',demandOption:true},input:{type:'string'},'reference-period':{type:'string'}
  },argv=>buildSource({source:argv.source,level:argv.level,scope:argv.scope,limit:argv.limit,out:argv.out,input:argv.input,referencePeriod:argv['reference-period']})).demandCommand(1))
.command('review','Hash-bound human review',command=>command
  .command('prepare','Produce review package',{bundle:{type:'string',demandOption:true}},argv=>reviewBundle(argv.bundle))
  .command('approve','Confirm exact reviewed hash',{bundle:{type:'string',demandOption:true},reviewer:{type:'string',demandOption:true},'confirm-hash':{type:'string',demandOption:true}},argv=>reviewBundle(argv.bundle,argv.reviewer,argv['confirm-hash'])).demandCommand(1))
.command('import','Plan or run a local-only import',command=>command
  .command('plan','Estimate, no database writes',{bundle:{type:'string',demandOption:true},environment},argv=>importBundle(argv.bundle,argv.environment,true))
  .command('run','Import at most 15 records, no automatic publish',{bundle:{type:'string',demandOption:true},environment},argv=>importBundle(argv.bundle,argv.environment)).demandCommand(1))
.command('release','Atomic local publication and rollback',command=>command
  .command(['publish','rollback'],'Compare-and-swap release head',{
    'release-id':{type:'string',demandOption:true},channel:{type:'string',demandOption:true},'expected-revision':{type:'number',demandOption:true},'expected-previous-release-id':{type:'string'},actor:{type:'string',demandOption:true},environment
  },argv=>{
    if(argv.environment!=='local')throw new Error('BLOCKED: remote publication not authorized or certified');
    const operation=String(argv._[1])==='rollback'?'rollback':'publish';
    executeLocal(publicationSql({id:argv['release-id'],channel:argv.channel,operation,revision:argv['expected-revision'],previous:argv['expected-previous-release-id']??null,actor:argv.actor}));
  }).demandCommand(1))
.command('demo','Explicit synthetic UI demo; local only',{environment},argv=>seedDemo(argv.environment))
.command('fixture','Unpublished baseline fixture',command=>command.command('seed','Seed local unpublished test records',{environment},argv=>{if(argv.environment!=='local')throw new Error('Fixtures are local only');localScript('local.mjs',['fixture']);}).demandCommand(1))
.command('config','Configuration safety checks',command=>command.command('check','Check local isolation',{environment,remote:{type:'boolean',default:false}},argv=>{if(argv.environment!=='local'||argv.remote)throw new Error('BLOCKED: remote preflight is not certified');localScript('local.mjs',['config']);}).demandCommand(1))
.command('smoke','Read-only local HTTP smoke',{'base-url':{type:'string',demandOption:true},environment,'expect-published':{type:'boolean',default:false}},argv=>{if(argv.environment!=='local')throw new Error('Local smoke only');localScript('smoke-local.mjs',['--base-url',argv['base-url'],...(argv['expect-published']?['--expect-published']:[])]);})
.demandCommand(1).strict().help().alias('h','help').version('0.2.0').parseAsync()
.catch(error=>{console.error(error instanceof Error?error.message:'CLI failed');process.exitCode=1;});
