#!/usr/bin/env node

/**
 * Pre-commit hook script to enforce changelog updates for major/minor version bumps.
 * 
 * Blocks commits when:
 * - package.json version is bumped (major or minor, not patch)
 * - CHANGELOG.md is not included in the commit
 */

import { execSync } from 'child_process';

function getVersion(source) {
  try {
    let content;
    if (source === 'staged') {
      // Get staged version of package.json
      content = execSync('git show :package.json', { encoding: 'utf8' });
    } else {
      // Get HEAD version of package.json
      content = execSync('git show HEAD:package.json', { encoding: 'utf8' });
    }
    const pkg = JSON.parse(content);
    return pkg.version;
  } catch {
    return null;
  }
}

function parseVersion(version) {
  if (!version) return null;
  const parts = version.split('.');
  return {
    major: parseInt(parts[0], 10),
    minor: parseInt(parts[1], 10),
    patch: parseInt(parts[2], 10)
  };
}

function isMajorOrMinorBump(oldVersion, newVersion) {
  const oldV = parseVersion(oldVersion);
  const newV = parseVersion(newVersion);
  
  if (!oldV || !newV) return false;
  
  // Major bump: 1.x.x -> 2.x.x
  if (newV.major > oldV.major) return true;
  
  // Minor bump: x.1.x -> x.2.x (same major)
  if (newV.major === oldV.major && newV.minor > oldV.minor) return true;
  
  return false;
}

function isFileStaged(filename) {
  try {
    const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return staged.split('\n').some(file => file === filename);
  } catch {
    return false;
  }
}

function main() {
  // Check if package.json is staged
  if (!isFileStaged('package.json')) {
    // No version change possible, allow commit
    process.exit(0);
  }

  const oldVersion = getVersion('head');
  const newVersion = getVersion('staged');

  // If we can't determine versions, allow commit
  if (!oldVersion || !newVersion) {
    process.exit(0);
  }

  // If versions are the same, allow commit
  if (oldVersion === newVersion) {
    process.exit(0);
  }

  // Check if this is a major or minor bump
  if (isMajorOrMinorBump(oldVersion, newVersion)) {
    // Check if CHANGELOG.md is also staged
    if (!isFileStaged('CHANGELOG.md')) {
      console.error('\n========================================');
      console.error('CHANGELOG UPDATE REQUIRED');
      console.error('========================================\n');
      console.error(`Version bump detected: ${oldVersion} -> ${newVersion}`);
      console.error('Major or minor version changes require a CHANGELOG.md update.\n');
      console.error('Please update CHANGELOG.md with the changes for this version,');
      console.error('then stage it with: git add CHANGELOG.md\n');
      console.error('========================================\n');
      process.exit(1);
    }
  }

  // Patch bump or changelog included, allow commit
  process.exit(0);
}

main();
