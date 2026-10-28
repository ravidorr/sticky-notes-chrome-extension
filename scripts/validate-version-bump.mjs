/**
 * Requires every pull request to bump the package version.
 *
 * Usage: node scripts/validate-version-bump.mjs <base-revision>
 *
 * Versions are compared as Chrome manifest versions (for example
 * `1.20.3+8` is `1.20.3.8`), so a bump of the build number counts.
 * package-lock.json must carry the same version as package.json.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createChromeManifestVersion } from './manifest-version.mjs';

const VERSION_PARTS = 4;

function readVersion(json) {
  try {
    const { version } = JSON.parse(json);
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

function toParts(version) {
  try {
    const parts = createChromeManifestVersion(version).split('.').map(Number);
    while (parts.length < VERSION_PARTS) {
      parts.push(0);
    }
    return parts;
  } catch {
    return undefined;
  }
}

export function isVersionBumped(previousVersion, currentVersion) {
  const previous = toParts(previousVersion);
  const current = toParts(currentVersion);

  if (!previous || !current) {
    return false;
  }

  for (let i = 0; i < VERSION_PARTS; i += 1) {
    if (current[i] !== previous[i]) {
      return current[i] > previous[i];
    }
  }

  return false;
}

export function packageLockVersionMatches(packageVersion, packageLockJson) {
  try {
    const lock = JSON.parse(packageLockJson);
    return lock.version === packageVersion && lock.packages?.['']?.version === packageVersion;
  } catch {
    return false;
  }
}

export function validateVersionBump({ basePackage, currentPackage, currentPackageLock }) {
  const baseVersion = readVersion(basePackage);
  const currentVersion = readVersion(currentPackage);
  const problems = [];

  if (!currentVersion || !toParts(currentVersion)) {
    problems.push(`package.json version "${currentVersion}" is not a valid Chrome extension version.`);
  } else if (!isVersionBumped(baseVersion, currentVersion)) {
    problems.push(
      `package.json version ${currentVersion} must be higher than the base version ${baseVersion}. ` +
      'Every pull request must bump the version.'
    );
  }

  if (currentVersion && !packageLockVersionMatches(currentVersion, currentPackageLock)) {
    problems.push(`package-lock.json must have version ${currentVersion} in both places (run npm install).`);
  }

  return { valid: problems.length === 0, problems, baseVersion, currentVersion };
}

function readGitFile(revision, filePath) {
  return execFileSync('git', ['show', `${revision}:${filePath}`], { encoding: 'utf8' });
}

function runCli() {
  const baseRevision = process.argv[2];

  if (!baseRevision) {
    console.error('Pass the base revision, for example: origin/main.');
    process.exit(1);
  }

  const result = validateVersionBump({
    basePackage: readGitFile(baseRevision, 'package.json'),
    currentPackage: readFileSync('package.json', 'utf8'),
    currentPackageLock: readFileSync('package-lock.json', 'utf8')
  });

  if (!result.valid) {
    console.error('Version bump validation failed:');
    result.problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(1);
  }

  process.stdout.write(`Version bumped: ${result.baseVersion} -> ${result.currentVersion}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
