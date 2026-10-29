import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const runner = join(dirname(fileURLToPath(import.meta.url)), 'run-script-tests.mjs');
const passingTest = "import { test } from 'node:test'; test('ok', () => {});\n";
const failingTest = "import { test } from 'node:test'; import assert from 'node:assert'; test('no', () => assert.equal(1, 2));\n";

describe('run-script-tests.mjs', () => {
  let root;
  let counter = 0;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'run-script-tests-'));
  });

  after(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // A fresh directory per case, holding the given files
  function runIn(files) {
    counter += 1;
    const dir = join(root, `case-${counter}`);
    mkdirSync(dir);
    Object.entries(files).forEach(([name, content]) => writeFileSync(join(dir, name), content));

    // A test process sets NODE_TEST_CONTEXT, which makes a nested node --test
    // behave as a child and report success. Start the runner without it.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;

    const result = spawnSync(process.execPath, [runner, dir], { encoding: 'utf8', env });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it('exits 0 when every test passes', () => {
    const result = runIn({ 'a.test.mjs': passingTest });

    assert.equal(result.status, 0);
  });

  it('exits 1 when a test fails', () => {
    const result = runIn({ 'a.test.mjs': passingTest, 'b.test.mjs': failingTest });

    assert.equal(result.status, 1);
  });

  it('exits 1 with a message when there are no tests', () => {
    const result = runIn({ 'notes.txt': 'not a test' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /No script tests found/);
  });

  it('exits 1 and names files that look like tests but would not run', () => {
    const result = runIn({ 'a.test.mjs': passingTest, 'b.spec.mjs': passingTest, 'c.test.js': passingTest });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /b\.spec\.mjs/);
    assert.match(result.stderr, /c\.test\.js/);
    assert.match(result.stderr, /do not match \*\.test\.mjs/);
  });
});
