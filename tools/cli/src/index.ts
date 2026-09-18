#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSource, probeSources, reviewBundle, importBundle, executeLocal, publicationSql, seedDemo } from './pipeline';
import {reviewedEventsCommand} from './events';
import {prepareAnnual,buildAnnual,importAnnual} from './annual';
function localScript(script:string,args:string[]):void {
  const result=spawnSync(process.execPath,[fileURLToPath(new URL(`../../../scripts/${script}`,import.meta.url)),...args],{stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)throw new Error('Local command failed');
}
const environment={type:'string' as const,choices:['local','staging','production'],default:'local'};
const publicationOptions={'release-id':{type:'string' as const,demandOption:true},channel:{type:'string' as const,demandOption:true},'expected-revision':{type:'number' as const,demandOption:true},'expected-previous-release-id':{type:'string' as const},actor:{type:'string' as const,demandOption:true},environment};
function publish(argv:{environment:string;'release-id':string;channel:string;'expected-revision':number;'expected-previous-release-id'?:string;actor:string},operation:'publish'|'rollback'){
  if(argv.environment!=='local')throw new Error('BLOCKED: remote publication not authorized or certified');
  executeLocal(publicationSql({id:argv['release-id'],channel:argv.channel,operation,revision:argv['expected-revision'],previous:argv['expected-previous-release-id']??null,actor:argv.actor}));
}
const annualOptions={input:{type:'string' as const,demandOption:true},baseline:{type:'string' as const,demandOption:true},edition:{type:'string' as const,demandOption:true},out:{type:'string' as const,demandOption:true}};
void yargs(hideBin(process.argv))
.command('source','Source contracts and baseline bundles',command=>command
  .command('probe','Explicit read-only source checks',{all:{type:'boolean',default:false},out:{type:'string',default:'artifacts/source-probe.json'}},argv=>probeSources(argv.out,argv.all))
  .command('build','Build S01 baseline, no implicit publication',{
    source:{type:'string',demandOption:true},level:{type:'string',choices:['KG','PRIMARY','SECONDARY'],demandOption:true},scope:{type:'string',choices:['full','canary'],default:'canary'},limit:{type:'number'},out:{type:'string',demandOption:true},input:{type:'string'},'reference-period':{type:'string'}
  },argv=>buildSource({source:argv.source,level:argv.level,scope:argv.scope,limit:argv.limit,out:argv.out,input:argv.input,referencePeriod:argv['reference-period']})).demandCommand(1))
.command('annual','Annual profiles with reviewed canonical school identity',command=>command
  .command('prepare','Produce unapproved cross-source identity candidates',annualOptions,argv=>prepareAnnual(argv as Parameters<typeof prepareAnnual>[0]))
  .command('build','Build at most 15 explicitly reviewed annual rows',{...annualOptions,mapping:{type:'string',demandOption:true}},argv=>buildAnnual(argv as Parameters<typeof buildAnnual>[0]))
  .command('import','Hash-bound local annual import, no automatic publication',{bundle:{type:'string',demandOption:true},reviewer:{type:'string',demandOption:true},'confirm-hash':{type:'string',demandOption:true},environment},argv=>importAnnual({bundle:argv.bundle,reviewer:argv.reviewer,confirmHash:argv['confirm-hash'],environment:argv.environment})).demandCommand(1))
.command('review','Hash-bound human review',command=>command
  .command('prepare','Produce review package',{bundle:{type:'string',demandOption:true}},argv=>reviewBundle(argv.bundle))
  .command('approve','Confirm exact reviewed hash',{bundle:{type:'string',demandOption:true},reviewer:{type:'string',demandOption:true},'confirm-hash':{type:'string',demandOption:true}},argv=>reviewBundle(argv.bundle,argv.reviewer,argv['confirm-hash'])).demandCommand(1))
.command('import','Plan or run a local-only import',command=>command
  .command('plan','Estimate, no database writes',{bundle:{type:'string',demandOption:true},environment},argv=>importBundle(argv.bundle,argv.environment,true))
  .command('run','Import at most 15 records, no automatic publish',{bundle:{type:'string',demandOption:true},environment},argv=>importBundle(argv.bundle,argv.environment)).demandCommand(1))
.command('event','Review and import explicit source-evidenced events',command=>command
  .command('prepare','Validate supplied event JSON and raw evidence',{input:{type:'string',demandOption:true},out:{type:'string',demandOption:true}},argv=>reviewedEventsCommand({input:argv.input,out:argv.out}))
  .command('import','Require hash and explicit confirmation of every event ID',{input:{type:'string',demandOption:true},reviewer:{type:'string',demandOption:true},'confirm-hash':{type:'string',demandOption:true},'confirm-events':{type:'string',demandOption:true},environment},argv=>reviewedEventsCommand({input:argv.input,reviewer:argv.reviewer,confirmHash:argv['confirm-hash'],confirmEvents:argv['confirm-events'],environment:argv.environment})).demandCommand(1))
.command('release','Atomic local publication and rollback',command=>command
  .command('publish','Compare-and-swap to approved release',publicationOptions,argv=>publish(argv as Parameters<typeof publish>[0],'publish'))
  .command('rollback','Compare-and-swap to previous published release',publicationOptions,argv=>publish(argv as Parameters<typeof publish>[0],'rollback')).demandCommand(1))
.command('demo','Explicit synthetic UI demo; local only',{environment},argv=>seedDemo(argv.environment))
.command('fixture','Unpublished baseline fixture',command=>command.command('seed','Seed local unpublished test records',{environment},argv=>{if(argv.environment!=='local')throw new Error('Fixtures are local only');localScript('local.mjs',['fixture']);}).demandCommand(1))
.command('config','Configuration safety checks',command=>command.command('check','Check local isolation',{environment,remote:{type:'boolean',default:false}},argv=>{if(argv.environment!=='local'||argv.remote)throw new Error('BLOCKED: remote preflight is not certified');localScript('local.mjs',['config']);}).demandCommand(1))
.command('smoke','Read-only local HTTP smoke',{'base-url':{type:'string',demandOption:true},environment,'expect-published':{type:'boolean',default:false}},argv=>{if(argv.environment!=='local')throw new Error('Local smoke only');localScript('smoke-local.mjs',['--base-url',argv['base-url'],...(argv['expect-published']?['--expect-published']:[])]);})
.demandCommand(1).strict().help().alias('h','help').version('0.2.0').parseAsync()
.catch(error=>{console.error(error instanceof Error?error.message:'CLI failed');process.exitCode=1;});
