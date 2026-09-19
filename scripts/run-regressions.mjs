import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('../tests/regression/', import.meta.url);
const tests = readdirSync(directory).filter(name => name.endsWith('.test.mjs')).sort()
  .map(name => fileURLToPath(new URL(name, directory)));
if (!tests.length) throw new Error('No regression tests found');
const result = spawnSync(process.execPath, [
  '--experimental-strip-types', '--import', new URL('register-workspace.mjs', directory).href,
  '--test', ...tests
], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
