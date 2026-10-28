/**
 * Version bump validation Unit Tests
 */

import { describe, it, expect } from '@jest/globals';

const bump = await import('../../scripts/validate-version-bump.mjs');

const pkg = (version) => JSON.stringify({ version });
const lock = (version, rootVersion = version) => JSON.stringify({
  version,
  packages: { '': { version: rootVersion } }
});

describe('isVersionBumped', () => {
  it('should accept a build number bump', () => {
    expect(bump.isVersionBumped('1.20.3+8', '1.20.3+9')).toBe(true);
  });

  it('should accept a patch, minor or major bump', () => {
    expect(bump.isVersionBumped('1.20.3', '1.20.4')).toBe(true);
    expect(bump.isVersionBumped('1.20.3', '1.21.0')).toBe(true);
    expect(bump.isVersionBumped('1.20.3', '2.0.0')).toBe(true);
  });

  it('should treat a build number as higher than no build number', () => {
    expect(bump.isVersionBumped('1.20.3', '1.20.3+1')).toBe(true);
  });

  it('should reject an unchanged version', () => {
    expect(bump.isVersionBumped('1.20.3+8', '1.20.3+8')).toBe(false);
  });

  it('should reject a lower version', () => {
    expect(bump.isVersionBumped('1.20.3+8', '1.20.3+7')).toBe(false);
    expect(bump.isVersionBumped('1.20.3+8', '1.19.9+99')).toBe(false);
  });

  it('should compare components numerically', () => {
    expect(bump.isVersionBumped('1.9.0', '1.10.0')).toBe(true);
  });

  it('should reject invalid or missing versions', () => {
    expect(bump.isVersionBumped('1.20.3', 'not-a-version')).toBe(false);
    expect(bump.isVersionBumped(undefined, '1.20.3')).toBe(false);
    expect(bump.isVersionBumped('1.20.3', '1.20.3+build.8')).toBe(false);
  });
});

describe('packageLockVersionMatches', () => {
  it('should match when both lock versions equal the package version', () => {
    expect(bump.packageLockVersionMatches('1.20.3+9', lock('1.20.3+9'))).toBe(true);
  });

  it('should not match when either lock version differs', () => {
    expect(bump.packageLockVersionMatches('1.20.3+9', lock('1.20.3+8'))).toBe(false);
    expect(bump.packageLockVersionMatches('1.20.3+9', lock('1.20.3+9', '1.20.3+8'))).toBe(false);
  });

  it('should not match invalid JSON or a missing root package', () => {
    expect(bump.packageLockVersionMatches('1.0.0', 'nope')).toBe(false);
    expect(bump.packageLockVersionMatches('1.0.0', JSON.stringify({ version: '1.0.0' }))).toBe(false);
  });
});

describe('validateVersionBump', () => {
  it('should be valid for a bump with a synchronized lock file', () => {
    const result = bump.validateVersionBump({
      basePackage: pkg('1.20.3+8'),
      currentPackage: pkg('1.20.3+9'),
      currentPackageLock: lock('1.20.3+9')
    });

    expect(result).toMatchObject({ valid: true, problems: [], baseVersion: '1.20.3+8', currentVersion: '1.20.3+9' });
  });

  it('should report a missing bump', () => {
    const result = bump.validateVersionBump({
      basePackage: pkg('1.20.3+8'),
      currentPackage: pkg('1.20.3+8'),
      currentPackageLock: lock('1.20.3+8')
    });

    expect(result.valid).toBe(false);
    expect(result.problems[0]).toContain('Every pull request must bump the version');
  });

  it('should report an out-of-sync lock file', () => {
    const result = bump.validateVersionBump({
      basePackage: pkg('1.20.3+8'),
      currentPackage: pkg('1.20.3+9'),
      currentPackageLock: lock('1.20.3+8')
    });

    expect(result.valid).toBe(false);
    expect(result.problems).toEqual([expect.stringContaining('package-lock.json')]);
  });

  it('should report an invalid current version', () => {
    const result = bump.validateVersionBump({
      basePackage: pkg('1.20.3+8'),
      currentPackage: pkg('1.20.3+build.9'),
      currentPackageLock: lock('1.20.3+build.9')
    });

    expect(result.valid).toBe(false);
    expect(result.problems[0]).toContain('not a valid Chrome extension version');
  });
});
