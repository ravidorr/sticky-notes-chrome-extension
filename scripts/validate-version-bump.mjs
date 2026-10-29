/**
 * Requires the package version to move together with the extension code.
 *
 * Usage: node scripts/validate-version-bump.mjs <base-revision>
 *
 * A pull request that changes extension code (see extension-changes.mjs) must
 * bump the version. A pull request that does not must leave it alone, because
 * every new version is submitted to the Chrome Web Store.
 *
 * Versions are compared as Chrome manifest versions (for example
 * `1.20.3+8` is `1.20.3.8`), so a bump of the build number counts.
 * package-lock.json must carry the same version as package.json.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { isEntryPoint } from './is-entry-point.mjs';
import { describeExtensionChange } from './extension-changes.mjs';
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

/**
 * @param {Object} input
 * @param {string} input.basePackage - package.json at the base revision
 * @param {string} input.currentPackage - package.json of the pull request
 * @param {string} input.currentPackageLock - package-lock.json of the pull request
 * @param {{changed: boolean, reasons: string[]}} [input.extension] - Whether the pull
 *   request changes extension code. Without it every change counts, which is the
 *   old rule that every pull request must bump the version.
 * @returns {{valid: boolean, problems: string[], baseVersion?: string, currentVersion?: string}} Result
 */
export function validateVersionBump({
  basePackage,
  currentPackage,
  currentPackageLock,
  extension = { changed: true, reasons: [] }
}) {
  const baseVersion = readVersion(basePackage);
  const currentVersion = readVersion(currentPackage);
  const problems = [];

  if (!currentVersion || !toParts(currentVersion)) {
    problems.push(`package.json version "${currentVersion}" is not a valid Chrome extension version.`);
  } else if (!baseVersion) {
    problems.push('The base package.json has no readable version, so the bump cannot be checked.');
  } else if (extension.changed) {
    if (!isVersionBumped(baseVersion, currentVersion)) {
      const why = extension.reasons.length > 0
        ? `This pull request changes extension code (${extension.reasons.join('; ')}), so it must bump the version.`
        : 'Every pull request must bump the version.';
      problems.push(
        `package.json version ${currentVersion} must be higher than the base version ${baseVersion}. ${why}`
      );
    }
  } else if (currentVersion !== baseVersion) {
    problems.push(
      `package.json version changed from ${baseVersion} to ${currentVersion}, but this pull request ` +
      'does not change extension code, so it must not bump the version. ' +
      `Restore ${baseVersion} in package.json, in both places in package-lock.json, and in SECURITY.md. ` +
      'A version bump submits a new release to the Chrome Web Store.'
    );
  }

  if (currentVersion && !packageLockVersionMatches(currentVersion, currentPackageLock)) {
    problems.push(`package-lock.json must have version ${currentVersion} in both places (run npm install).`);
  }

  return { valid: problems.length === 0, problems, baseVersion, currentVersion };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function readGitFile(revision, filePath) {
  try {
    return execFileSync('git', ['show', `${revision}:${filePath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(
      `Cannot read ${filePath} at ${revision}: ${detail}. ` +
      'Fetch the base branch with its history, for example with fetch-depth: 0.'
    );
  }
}

function runCli() {
  const baseRevision = process.argv[2];

  if (!baseRevision) {
    console.error('Pass the base revision, for example: origin/main.');
    process.exit(1);
  }

  let extension;
  let result;
  try {
    // The files and dependencies the pull request changed are measured from the
    // merge base, so changes that landed on the base branch later do not count.
    // The version is compared with the base tip, because it must be higher than
    // what the base branch has now.
    const mergeBase = git(['merge-base', baseRevision, 'HEAD']).trim();
    const currentPackage = readFileSync('package.json', 'utf8');
    const currentPackageLock = readFileSync('package-lock.json', 'utf8');
    extension = describeExtensionChange({
      changedFiles: git(['diff', '--name-only', '--no-renames', `${baseRevision}...HEAD`]).split('\n').filter(Boolean),
      basePackage: readGitFile(mergeBase, 'package.json'),
      currentPackage,
      basePackageLock: readGitFile(mergeBase, 'package-lock.json'),
      currentPackageLock
    });

    result = validateVersionBump({
      basePackage: readGitFile(baseRevision, 'package.json'),
      currentPackage,
      currentPackageLock,
      extension
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!result.valid) {
    console.error('Version bump validation failed:');
    result.problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(1);
  }

  if (extension.changed) {
    process.stdout.write(
      `Version bumped: ${result.baseVersion} -> ${result.currentVersion} (${extension.reasons.join('; ')})\n`
    );
  } else {
    process.stdout.write(`Version unchanged at ${result.currentVersion}: no extension code changed.\n`);
  }
}

if (isEntryPoint(import.meta.url)) {
  runCli();
}
