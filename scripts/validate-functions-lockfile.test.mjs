import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateFunctionsLockfile, validateFunctionsLockfileFiles } from './validate-functions-lockfile.mjs';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'validate-functions-lockfile.mjs');

const pkg = (overrides = {}) =>
  JSON.stringify({
    name: 'fn',
    engines: { node: '22' },
    dependencies: { 'firebase-functions': '^7.4.0', cors: '^2.8.5' },
    ...overrides
  });

const lock = (root = {}) =>
  JSON.stringify({
    packages: {
      '': {
        name: 'fn',
        engines: { node: '22' },
        dependencies: { cors: '^2.8.5', 'firebase-functions': '^7.4.0' },
        ...root
      }
    }
  });

const firebase = (functions = { runtime: 'nodejs22' }) => JSON.stringify({ functions });

const run = (...args) => validateFunctionsLockfile(...args);

test('accepts a consistent package, lockfile and runtime', () => {
  assert.deepEqual(run(pkg(), lock(), firebase()), { valid: true });
});

test('rejects a stale lockfile engine with exactly one error', () => {
  const result = run(pkg(), lock({ engines: { node: '20' } }), firebase());
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /engines\.node differs.*"22".*"20"/);
});

test('rejects drift in each dependency field and names the package', () => {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const result = run(pkg({ [field]: { left: '^1.0.0' } }), lock({ [field]: { left: '^2.0.0' } }), firebase());
    assert.equal(result.valid, false, field);
    assert.equal(result.errors.length, 1, field);
    assert.match(result.errors[0], new RegExp(`${field} differ.*left \\(package.json: \\^1.0.0, lockfile: \\^2.0.0\\)`));
  }
});

test('rejects a field present on only one side', () => {
  const result = run(pkg({ devDependencies: { tool: '^1.0.0' } }), lock(), firebase());
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /tool \(package.json: \^1.0.0, lockfile: absent\)/);
});

test('ignores dependency key order', () => {
  const reordered = lock({ dependencies: { 'firebase-functions': '^7.4.0', cors: '^2.8.5' } });
  assert.deepEqual(run(pkg(), reordered, firebase()), { valid: true });
});

test('rejects a firebase.json runtime that disagrees with engines.node', () => {
  const result = run(pkg(), lock(), firebase({ runtime: 'nodejs20' }));
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0], 'firebase.json functions.runtime is nodejs20, but engines.node requires nodejs22.');
});

test('reports every problem at once', () => {
  const result = run(pkg(), lock({ engines: { node: '20' }, dependencies: {} }), firebase({ runtime: 'nodejs18' }));
  assert.equal(result.errors.length, 3);
});

test('rejects a missing engines.node even when the lockfile matches', () => {
  const result = run(pkg({ engines: undefined }), lock({ engines: undefined }), firebase());
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /engines\.node must be a bare major version.*got undefined/);
});

test('rejects engines.node values that cannot map to a firebase runtime', () => {
  for (const node of ['>=22', '22.x', '^22', 22]) {
    const result = run(pkg({ engines: { node } }), lock({ engines: { node } }), firebase());
    assert.equal(result.valid, false, String(node));
    assert.match(result.errors[0], /bare major version/);
  }
});

test('finds the functions codebase when firebase.json uses an array', () => {
  const codebases = [{ source: 'other', runtime: 'nodejs18' }, { source: 'functions', runtime: 'nodejs22' }];
  assert.deepEqual(run(pkg(), lock(), firebase(codebases)), { valid: true });
  assert.equal(run(pkg(), lock(), firebase([{ source: 'other', runtime: 'nodejs22' }])).valid, false);
});

test('reports a missing functions section in firebase.json', () => {
  const result = run(pkg(), lock(), JSON.stringify({}));
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /functions\.runtime is undefined/);
});

test('rejects a lockfile without a root entry', () => {
  for (const text of [JSON.stringify({ packages: {} }), JSON.stringify({})]) {
    const result = run(pkg(), text, firebase());
    assert.deepEqual(result, {
      valid: false,
      errors: ['functions/package-lock.json has no root package entry (packages[""]).']
    });
  }
});

test('names the file that fails to parse', () => {
  assert.match(run('{', lock(), firebase()).errors[0], /^functions\/package\.json is not valid JSON/);
  assert.match(run(pkg(), '{', firebase()).errors[0], /^functions\/package-lock\.json is not valid JSON/);
  assert.match(run(pkg(), lock(), '{').errors[0], /^firebase\.json is not valid JSON/);
});

test('rejects files that parse to something other than an object', () => {
  assert.deepEqual(run('null', lock(), firebase()).errors, ['functions/package.json must contain a JSON object.']);
  assert.deepEqual(run(pkg(), '[]', firebase()).errors, ['functions/package-lock.json must contain a JSON object.']);
});

test('reports a missing file in any position', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fn-lock-'));

  try {
    const files = ['package.json', 'package-lock.json', 'firebase.json'].map((name) => join(dir, name));
    writeFileSync(files[0], pkg());
    writeFileSync(files[1], lock());
    writeFileSync(files[2], firebase());
    assert.deepEqual(validateFunctionsLockfileFiles(...files), { valid: true });

    for (let missing = 0; missing < files.length; missing += 1) {
      const args = files.map((file, index) => (index === missing ? join(dir, 'missing.json') : file));
      const result = validateFunctionsLockfileFiles(...args);
      assert.equal(result.valid, false);
      assert.match(result.errors[0], /^Unable to read functions files/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI exits 1 on drift and 0 when consistent, including through a symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fn-lock-cli-'));

  try {
    const write = (name, text) => {
      const path = join(dir, name);
      writeFileSync(path, text);
      return path;
    };
    const valid = [write('p.json', pkg()), write('l.json', lock()), write('f.json', firebase())];
    const drifted = [valid[0], write('l-old.json', lock({ engines: { node: '20' } })), valid[2]];
    const link = join(dir, 'linked.mjs');
    symlinkSync(scriptPath, link);

    const ok = spawnSync(process.execPath, [scriptPath, ...valid], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /match functions\/package\.json/);

    const bad = spawnSync(process.execPath, [scriptPath, ...drifted], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /engines\.node differs/);
    assert.match(bad.stderr, /npm install --package-lock-only/);

    const viaLink = spawnSync(process.execPath, [link, ...drifted], { encoding: 'utf8' });
    assert.equal(viaLink.status, 1);

    const missing = spawnSync(process.execPath, [scriptPath, join(dir, 'nope.json')], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Unable to read functions files/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
