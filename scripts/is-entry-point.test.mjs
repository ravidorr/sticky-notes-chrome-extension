import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { isEntryPoint } from './is-entry-point.mjs';

const helperUrl = new URL('./is-entry-point.mjs', import.meta.url).href;

describe('isEntryPoint', () => {
  let dir;
  let script;
  let linkedScript;
  let importer;
  let loopA;
  let canSymlink = true;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'is-entry-point-'));
    script = join(dir, 'script.mjs');
    linkedScript = join(dir, 'linked-script.mjs');
    importer = join(dir, 'importer.mjs');
    loopA = join(dir, 'loop-a');

    writeFileSync(script, [
      `import { isEntryPoint } from ${JSON.stringify(helperUrl)};`,
      'process.stdout.write(isEntryPoint(import.meta.url) ? "entry" : "imported");',
      ''
    ].join('\n'));
    writeFileSync(importer, `await import(${JSON.stringify(pathToFileURL(script).href)});\n`);

    try {
      symlinkSync(script, linkedScript);
      symlinkSync(join(dir, 'loop-b'), loopA);
      symlinkSync(loopA, join(dir, 'loop-b'));
    } catch {
      // Creating symlinks needs extra privileges on Windows
      canSymlink = false;
    }
  });

  after(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const run = (file) => execFileSync(process.execPath, [file], { encoding: 'utf8' });

  it('is true when the script is run directly', () => {
    assert.equal(run(script), 'entry');
  });

  it('is true when the script is run through a symlink', (t) => {
    if (!canSymlink) {
      return t.skip('symlinks are not available here');
    }

    assert.equal(run(linkedScript), 'entry');
  });

  it('is false when the script is imported by another module', () => {
    assert.equal(run(importer), 'imported');
  });

  it('is false when there is no entry path, as with node -e or a REPL', () => {
    assert.equal(isEntryPoint(import.meta.url, null), false);
    assert.equal(isEntryPoint(import.meta.url, ''), false);
  });

  it('is false when the entry path does not exist', () => {
    assert.equal(isEntryPoint(import.meta.url, join(dir, 'missing.mjs')), false);
  });

  it('throws, instead of returning false, when the entry path cannot be resolved', (t) => {
    if (!canSymlink) {
      return t.skip('symlinks are not available here');
    }

    assert.throws(() => isEntryPoint(import.meta.url, loopA), { code: 'ELOOP' });
  });

  it('throws when the module path cannot be resolved', () => {
    const missingModule = pathToFileURL(join(dir, 'missing-module.mjs')).href;

    assert.throws(() => isEntryPoint(missingModule, script), { code: 'ENOENT' });
  });
});
