import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs node --test on an explicit list of files. A glob only works where the
// shell expands it (not in Windows cmd.exe) or on Node 21 and later, which
// expand it themselves, and CI also runs Node 20. Node 20 and Node 22 handle a
// directory argument differently too (Node 20 searches it, Node 22 fails), so
// neither a glob nor a directory is portable.
//
// An optional first argument names the directory to scan, for the tests of
// this script.
const scriptsDir = process.argv[2]
  ? resolve(process.argv[2])
  : dirname(fileURLToPath(import.meta.url));

const names = readdirSync(scriptsDir);

// Only *.test.mjs files are run, so a test saved under another name would be
// skipped without a word. Fail instead.
const strays = names.filter((name) => /\.(test|spec)\.[cm]?js$/.test(name) && !name.endsWith('.test.mjs'));

if (strays.length > 0) {
  console.error(`These files look like tests but do not match *.test.mjs, so they would not run: ${strays.join(', ')}`);
  process.exit(1);
}

const files = names
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join(scriptsDir, name));

if (files.length === 0) {
  console.error('No script tests found.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });

if (result.error) {
  console.error(`Could not start node --test: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`node --test was terminated by ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
