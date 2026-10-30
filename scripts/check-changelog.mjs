/**
 * Pre-commit check: every commit must update CHANGELOG.md.
 *
 * Usage: node scripts/check-changelog.mjs
 *
 * Reads the staged file names from git. A commit with nothing staged (an amend
 * that only rewords the message) is allowed. Changes that do not bump the
 * version are listed under "Unreleased" in CHANGELOG.md.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { isEntryPoint } from './is-entry-point.mjs';

const CHANGELOG = 'CHANGELOG.md';

export function checkChangelog(stagedFiles) {
  if (stagedFiles.length === 0 || stagedFiles.includes(CHANGELOG)) {
    return { valid: true };
  }

  return {
    valid: false,
    message: [
      'CHANGELOG UPDATE REQUIRED',
      `This commit changes ${stagedFiles.length} file(s) but not ${CHANGELOG}.`,
      'Add a line for the change, under "Unreleased" when the version is not bumped,',
      `then stage it with: git add ${CHANGELOG}`
    ].join('\n')
  };
}

function getStagedFiles() {
  const output = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

if (isEntryPoint(import.meta.url)) {
  const result = checkChangelog(getStagedFiles());

  if (!result.valid) {
    console.error(`\n${result.message}\n`);
    process.exit(1);
  }
}
