import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isVersionBumped,
  packageLockVersionMatches,
  validateVersionBump
} from './validate-version-bump.mjs';

const pkg = (version) => JSON.stringify({ name: 'x', version });
const lock = (version, packageVersion = version) => JSON.stringify({
  version,
  packages: { '': { version: packageVersion } }
});

describe('isVersionBumped', () => {
  it('accepts a higher patch, minor or major version', () => {
    assert.equal(isVersionBumped('1.20.3', '1.20.4'), true);
    assert.equal(isVersionBumped('1.20.9', '1.21.0'), true);
    assert.equal(isVersionBumped('1.20.9', '2.0.0'), true);
  });

  it('accepts a higher build number, which becomes the fourth manifest part', () => {
    assert.equal(isVersionBumped('1.20.3+8', '1.20.3+9'), true);
    assert.equal(isVersionBumped('1.20.3', '1.20.3+1'), true);
  });

  it('compares numerically, not as text', () => {
    assert.equal(isVersionBumped('1.20.9', '1.20.10'), true);
    assert.equal(isVersionBumped('1.20.10', '1.20.9'), false);
  });

  it('rejects the same or a lower version', () => {
    assert.equal(isVersionBumped('1.20.4', '1.20.4'), false);
    assert.equal(isVersionBumped('1.20.4', '1.20.3'), false);
    assert.equal(isVersionBumped('1.21.0', '1.20.9'), false);
  });

  it('rejects versions that cannot be converted to a manifest version', () => {
    assert.equal(isVersionBumped('1.20.3', 'not-a-version'), false);
    assert.equal(isVersionBumped(undefined, '1.20.4'), false);
  });
});

describe('packageLockVersionMatches', () => {
  it('requires the lockfile version in both places', () => {
    assert.equal(packageLockVersionMatches('1.20.4', lock('1.20.4')), true);
    assert.equal(packageLockVersionMatches('1.20.4', lock('1.20.4', '1.20.3')), false);
    assert.equal(packageLockVersionMatches('1.20.4', lock('1.20.3', '1.20.4')), false);
  });

  it('rejects an unreadable lockfile', () => {
    assert.equal(packageLockVersionMatches('1.20.4', 'not json'), false);
    assert.equal(packageLockVersionMatches('1.20.4', JSON.stringify({ version: '1.20.4' })), false);
  });
});

describe('validateVersionBump', () => {
  const validate = (base, current, currentLock) => validateVersionBump({
    basePackage: pkg(base),
    currentPackage: pkg(current),
    currentPackageLock: currentLock
  });

  it('passes a bump with a matching lockfile', () => {
    const result = validate('1.20.3', '1.20.4', lock('1.20.4'));

    assert.deepEqual(result, {
      valid: true,
      problems: [],
      baseVersion: '1.20.3',
      currentVersion: '1.20.4'
    });
  });

  it('fails an unchanged version', () => {
    const result = validate('1.20.4', '1.20.4', lock('1.20.4'));

    assert.equal(result.valid, false);
    assert.match(result.problems[0], /must be higher than the base version 1\.20\.4/);
  });

  it('fails a lockfile that was not updated', () => {
    const result = validate('1.20.3', '1.20.4', lock('1.20.3'));

    assert.equal(result.valid, false);
    assert.match(result.problems[0], /package-lock\.json must have version 1\.20\.4/);
  });

  it('reports both problems together', () => {
    const result = validate('1.20.4', '1.20.4', lock('1.20.3'));

    assert.equal(result.problems.length, 2);
  });

  it('fails a version that is not valid for a Chrome extension', () => {
    const result = validate('1.20.3', 'bad', lock('bad'));

    assert.equal(result.valid, false);
    assert.match(result.problems[0], /not a valid Chrome extension version/);
  });
});
