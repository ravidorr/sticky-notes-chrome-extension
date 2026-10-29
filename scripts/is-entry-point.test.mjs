import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, describe, it } from 'node:test';

const helperUrl = pathToFileURL(resolve('scripts/is-entry-point.mjs')).href;

describe('isEntryPoint', () => {
  let dir;
  let script;
  let linkedScript;
  let importer;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'is-entry-point-'));
    script = join(dir, 'script.mjs');
    linkedScript = join(dir, 'linked-script.mjs');
    importer = join(dir, 'importer.mjs');

    writeFileSync(script, [
      `import { isEntryPoint } from ${JSON.stringify(helperUrl)};`,
      'process.stdout.write(isEntryPoint(import.meta.url) ? "entry" : "imported");',
      ''
    ].join('\n'));
    symlinkSync(script, linkedScript);
    writeFileSync(importer, `await import(${JSON.stringify(pathToFileURL(script).href)});\n`);
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (file) => execFileSync(process.execPath, [file], { encoding: 'utf8' });

  it('is true when the script is run directly', () => {
    assert.equal(run(script), 'entry');
  });

  it('is true when the script is run through a symlink', () => {
    assert.equal(run(linkedScript), 'entry');
  });

  it('is false when the script is imported by another module', () => {
    assert.equal(run(importer), 'imported');
  });

  it('is false when the entry path is missing', async () => {
    const { isEntryPoint } = await import('./is-entry-point.mjs');

    assert.equal(isEntryPoint(import.meta.url, null), false);
  });

  it('is false when the entry path does not exist', async () => {
    const { isEntryPoint } = await import('./is-entry-point.mjs');

    assert.equal(isEntryPoint(import.meta.url, join(dir, 'missing.mjs')), false);
  });
});
