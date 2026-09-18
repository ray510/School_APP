#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
function blocked(message: string): void {
  console.error(`BLOCKED: ${message}`);
  process.exitCode = 1;
}
function localScript(script: string, args: string[]): void {
  const file = fileURLToPath(new URL(`../../../scripts/${script}`, import.meta.url));
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
void yargs(hideBin(process.argv))
  .command('source', 'Manage data sources', command => command
    .command('probe', 'Probe official sources (not implemented)', {
      all: {type:'boolean',default:false}, out:{type:'string'}
    }, () => blocked('Source probe requires a verified source contract; no network request made'))
    .command('build', 'Build a data bundle (not implemented)', {
      source:{type:'string',demandOption:true},scope:{type:'string',choices:['full','canary'],default:'full'},
      limit:{type:'number'},out:{type:'string',demandOption:true}
    }, () => blocked('Bundle build/review is not implemented; nothing imported'))
    .demandCommand(1))
  .command('review', 'Review data (not implemented)', command => command
    .command('prepare', 'Prepare review', {}, () => blocked('Review package is not implemented'))
    .command('approve', 'Approve review', {}, () => blocked('Publication approval is not implemented'))
    .demandCommand(1))
  .command('fixture', 'Manage synthetic local fixtures', command => command
    .command('seed', 'Seed unpublished local test records only', {
      environment:{type:'string',choices:['local','staging','production'],default:'local'}
    }, argv => {
      if (argv.environment !== 'local') return blocked('Fixtures may only use the local database');
      localScript('local.mjs',['fixture']);
    }).demandCommand(1))
  .command('config', 'Check configuration', command => command
    .command('check', 'Check local-only safeguards', {
      environment:{type:'string',choices:['local','staging','production'],demandOption:true},remote:{type:'boolean',default:false}
    }, argv => {
      if (argv.environment !== 'local' || argv.remote) return blocked('Remote configuration validation is not implemented');
      localScript('local.mjs',['config']);
    }).demandCommand(1))
  .command('smoke', 'Read-only local HTTP smoke test', {
    'base-url':{type:'string',demandOption:true},
    environment:{type:'string',choices:['local','staging','production'],demandOption:true},
    'expect-published':{type:'boolean',default:false}
  }, argv => {
    if (argv.environment !== 'local') return blocked('Only local smoke testing is implemented');
    localScript('smoke-local.mjs',[
      '--base-url',argv['base-url'],...(argv['expect-published'] ? ['--expect-published'] : [])
    ]);
  })
  .demandCommand(1).strict().help().alias('h','help').version('0.1.0').alias('v','version').parseAsync()
  .catch(error => { console.error(error instanceof Error ? error.message : 'CLI failed'); process.exitCode=1; });
