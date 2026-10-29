import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateVersionBump } from './validate-version-bump.mjs';

const pkg = (version) => JSON.stringify({ name: 'x', version });
const lock = (version, packageVersion = version) => JSON.stringify({
  version,
  packages: { '': { version: packageVersion } }
});

const codeChanged = { changed: true, reasons: ['extension files changed: src/popup/popup.js'] };
const codeUnchanged = { changed: false, reasons: [] };

const validate = (base, current, currentLock, extension) => validateVersionBump({
  basePackage: pkg(base),
  currentPackage: pkg(current),
  currentPackageLock: currentLock,
  ...(extension ? { extension } : {})
});

describe('version policy when extension code changed', () => {
  it('passes a bump', () => {
    const result = validate('1.20.9', '1.20.10', lock('1.20.10'), codeChanged);

    assert.deepEqual(result, {
      valid: true,
      problems: [],
      baseVersion: '1.20.9',
      currentVersion: '1.20.10'
    });
  });

  it('fails an unchanged version and names the reason', () => {
    const result = validate('1.20.9', '1.20.9', lock('1.20.9'), codeChanged);

    assert.equal(result.valid, false);
    assert.match(result.problems[0], /must be higher than the base version 1\.20\.9\./);
    assert.match(result.problems[0], /changes extension code \(extension files changed: src\/popup\/popup\.js\), so it must bump the version/);
  });

  it('fails a lower version', () => {
    const result = validate('1.20.9', '1.20.8', lock('1.20.8'), codeChanged);

    assert.equal(result.valid, false);
    assert.match(result.problems[0], /must be higher than the base version/);
  });
});

describe('version policy when extension code did not change', () => {
  it('passes an unchanged version', () => {
    const result = validate('1.20.9', '1.20.9', lock('1.20.9'), codeUnchanged);

    assert.deepEqual(result, {
      valid: true,
      problems: [],
      baseVersion: '1.20.9',
      currentVersion: '1.20.9'
    });
  });

  it('blocks a bump, because it would submit a release', () => {
    const result = validate('1.20.9', '1.20.10', lock('1.20.10'), codeUnchanged);

    assert.equal(result.valid, false);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0], /changed from 1\.20\.9 to 1\.20\.10/);
    assert.match(result.problems[0], /does not change extension code, so it must not bump the version/);
    assert.match(result.problems[0], /Restore 1\.20\.9 in package\.json, in both places in package-lock\.json, and in SECURITY\.md/);
    assert.match(result.problems[0], /submits a new release to the Chrome Web Store/);
  });

  it('blocks a build-number bump too', () => {
    const result = validate('1.20.3+8', '1.20.3+9', lock('1.20.3+9'), codeUnchanged);

    assert.equal(result.valid, false);
  });

  it('blocks a lowered version', () => {
    const result = validate('1.20.9', '1.20.8', lock('1.20.8'), codeUnchanged);

    assert.equal(result.valid, false);
    assert.match(result.problems[0], /must not bump the version/);
  });
});

describe('version policy in every case', () => {
  for (const [label, extension] of [['changed', codeChanged], ['unchanged', codeUnchanged]]) {
    it(`fails a lockfile that does not match the version when code ${label}`, () => {
      const current = extension.changed ? '1.20.10' : '1.20.9';
      const result = validate('1.20.9', current, lock('1.20.8'), extension);

      assert.equal(result.valid, false);
      assert.match(result.problems.at(-1), new RegExp(`package-lock\\.json must have version ${current.replace(/\./g, '\\.')}`));
    });

    it(`fails a version that is not valid for a Chrome extension when code ${label}`, () => {
      const result = validate('1.20.9', 'bad', lock('bad'), extension);

      assert.equal(result.valid, false);
      assert.match(result.problems[0], /not a valid Chrome extension version/);
    });
  }
});

describe('version policy without an extension argument', () => {
  it('keeps the rule that every pull request must bump the version', () => {
    const unchanged = validate('1.20.9', '1.20.9', lock('1.20.9'));
    const bumped = validate('1.20.9', '1.20.10', lock('1.20.10'));

    assert.equal(unchanged.valid, false);
    assert.match(unchanged.problems[0], /must be higher than the base version 1\.20\.9\. Every pull request must bump the version\./);
    assert.equal(bumped.valid, true);
  });
});
