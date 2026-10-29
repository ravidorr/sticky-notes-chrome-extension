import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Lists the test files itself instead of passing a glob to node --test. A glob
// is only expanded by Unix shells, so on Windows (cmd.exe) it would be passed
// literally and fail, and Node 20 and Node 22 treat directory arguments
// differently.
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(scriptsDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join(scriptsDir, name));

if (files.length === 0) {
  console.error('No script tests found.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
