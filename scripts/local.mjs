/** Local-only commands. No arbitrary Wrangler arguments; never creates remote resources. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
export function checkLocalConfig(config) {
  const local = config?.env?.local;
  const db = local?.d1_databases?.find(binding => binding.binding === 'DB');
  if (local?.vars?.APP_ENV !== 'local' || local.vars.ALLOW_TEST_DATA !== 'true' ||
      local.vars.ENABLE_ADMIN_WRITE !== 'false' || local.vars.ENABLE_SOURCE_PROBE !== 'false' ||
      db?.database_id !== '00000000-0000-0000-0000-000000000001' || db.remote === true ||
      (local.triggers?.crons?.length ?? 0) !== 0 || (config.triggers?.crons?.length ?? 0) !== 0) {
    throw new Error('Local-only safety check failed; no command executed');
  }
}
export function localArguments(operation, directory = root) {
  const config = ['--config', resolve(directory, 'wrangler.jsonc'), '--env', 'local'];
  const state = ['--persist-to', resolve(directory, '.wrangler/state')];
  switch (operation) {
    case 'dev': return ['dev', ...config, '--ip', '127.0.0.1', '--port', '8787', ...state];
    case 'build': return ['deploy', ...config, '--dry-run', '--outdir', resolve(directory, '.wrangler/dry-run')];
    case 'types': return ['types', resolve(directory, 'apps/worker/worker-configuration.d.ts'), ...config, '--env-interface', 'CloudflareBindings'];
    case 'migrate': return ['d1', 'migrations', 'apply', 'DB', ...config, '--local', ...state];
    case 'fixture': return ['d1', 'execute', 'DB', ...config, '--local', ...state, '--file', resolve(directory, 'tests/fixtures/local.sql')];
    default: throw new Error('Unknown local operation');
  }
}
function main() {
  if (process.argv.length !== 3) throw new Error('Expected exactly one local operation');
  // wrangler.jsonc is currently JSON-compatible. Do not strip comments with unsafe regular expressions.
  const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'));
  checkLocalConfig(config);
  if (process.argv[2] === 'config') {
    console.log(JSON.stringify({ environment: 'local', check: 'PASS', remote: false }));
    return;
  }
  const args = localArguments(process.argv[2]);
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Full toolchain requires Node 24.x; offline regression tests have a separate runner');
  const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
  if (!existsSync(wrangler)) throw new Error('Wrangler is not installed. Install workspace dependencies first.');
  if ((process.argv[2] === 'dev' || process.argv[2] === 'build') && !existsSync(resolve(root, 'apps/web/dist/index.html'))) {
    throw new Error('Build static assets first: pnpm build:web');
  }
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'Local operation failed'); process.exitCode = 1; }
}
