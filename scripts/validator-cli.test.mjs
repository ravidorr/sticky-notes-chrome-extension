import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// These tests start the real scripts as commands. The functions they export are
// tested elsewhere, but only starting the script proves that it still runs its
// checks when it is the entry point, including through a symlink or a relative
// path. A script that silently skips its checks exits 0 with no output.

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const securityScript = join(scriptsDir, 'validate-security-policy-version.mjs');
const bumpScript = join(scriptsDir, 'validate-version-bump.mjs');
const changelogScript = join(scriptsDir, 'check-changelog.mjs');

function run(args, options = {}) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', ...options });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function tryLink(target, linkPath) {
  try {
    symlinkSync(target, linkPath);
    return linkPath;
  } catch {
    // Creating symlinks needs extra privileges on Windows
    return null;
  }
}

describe('validate-security-policy-version.mjs as a command', () => {
  const policy = (version) => [
    '# Security Policy',
    '',
    '## Supported Versions',
    '',
    '| Version | Supported |',
    '| ------- | --------- |',
    `| ${version} | Yes |`,
    ''
  ].join('\n');

  let dir;
  let packageJson;
  let matching;
  let outdated;
  let linked;

  before(() => {
    // Real path: the temp directory is itself a symlink on macOS, which breaks a
    // relative path computed from it
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'security-policy-cli-')));
    packageJson = join(dir, 'package.json');
    matching = join(dir, 'SECURITY.md');
    outdated = join(dir, 'OUTDATED.md');
    writeFileSync(packageJson, JSON.stringify({ version: '1.2.3' }));
    writeFileSync(matching, policy('1.2.3'));
    writeFileSync(outdated, policy('1.2.2'));
    linked = tryLink(securityScript, join(dir, 'linked-validator.mjs'));
  });

  after(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints the success line and exits 0 when the policy matches', () => {
    const result = run([securityScript, packageJson, matching]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /SECURITY\.md supports package version 1\.2\.3\./);
  });

  it('fails with the reason and exit code 1 when the policy is outdated', () => {
    const result = run([securityScript, packageJson, outdated]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /SECURITY\.md supports 1\.2\.2, but package\.json declares 1\.2\.3/);
  });

  it('fails when a file is missing', () => {
    const result = run([securityScript, packageJson, join(dir, 'missing.md')]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unable to read security policy files/);
  });

  it('still runs its checks through a symlink', (t) => {
    if (!linked) {
      return t.skip('symlinks are not available here');
    }

    const passing = run([linked, packageJson, matching]);
    const failing = run([linked, packageJson, outdated]);

    assert.equal(passing.status, 0);
    assert.match(passing.stdout, /SECURITY\.md supports package version 1\.2\.3\./);
    assert.equal(failing.status, 1);
  });

  it('still runs its checks from a relative path', () => {
    const relativeScript = relative(dir, securityScript);

    const passing = run([relativeScript, 'package.json', 'SECURITY.md'], { cwd: dir });
    const failing = run([relativeScript, 'package.json', 'OUTDATED.md'], { cwd: dir });

    assert.equal(passing.status, 0);
    assert.match(passing.stdout, /SECURITY\.md supports package version 1\.2\.3\./);
    assert.equal(failing.status, 1);
  });
});

describe('validate-version-bump.mjs as a command', () => {
  let repo;
  let linked;

  function git(...args) {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }

  function writeVersion(version) {
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'example', version }));
    writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }));
  }

  before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'version-bump-cli-')));
    git('init', '-q');
    git('checkout', '-q', '-B', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    writeVersion('1.0.0');
    git('add', 'package.json', 'package-lock.json');
    git('commit', '-q', '-m', 'base');
    // The branch changes extension code, so it needs a version bump
    git('checkout', '-q', '-b', 'feature');
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'change.js'), 'export const changed = true;\n');
    git('add', 'src/change.js');
    git('commit', '-q', '-m', 'change extension code');
    linked = tryLink(bumpScript, join(repo, 'linked-bump.mjs'));
  });

  after(() => {
    if (repo) {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('prints the success line and exits 0 for a bump', () => {
    writeVersion('1.0.1');

    const result = run([bumpScript, 'main'], { cwd: repo });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Version bumped: 1\.0\.0 -> 1\.0\.1/);
  });

  it('fails with exit code 1 when the version was not bumped', () => {
    writeVersion('1.0.0');

    const result = run([bumpScript, 'main'], { cwd: repo });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be higher than the base version 1\.0\.0/);
  });

  it('fails when no base revision is given', () => {
    const result = run([bumpScript], { cwd: repo });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass the base revision/);
  });

  it('fails with a clear message when the base revision does not exist', () => {
    const result = run([bumpScript, 'no-such-revision'], { cwd: repo });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /no-such-revision/);
    assert.match(result.stderr, /Fetch the base branch with its history/);
    assert.doesNotMatch(result.stderr, /at execFileSync/);
  });

  it('still runs its checks through a symlink', (t) => {
    if (!linked) {
      return t.skip('symlinks are not available here');
    }

    writeVersion('1.0.1');
    const passing = run([linked, 'main'], { cwd: repo });
    writeVersion('1.0.0');
    const failing = run([linked, 'main'], { cwd: repo });

    assert.equal(passing.status, 0);
    assert.match(passing.stdout, /Version bumped/);
    assert.equal(failing.status, 1);
  });
});

describe('check-changelog.mjs as a command', () => {
  let repo;
  let linked;

  // Started from a git hook, git sets GIT_DIR and GIT_INDEX_FILE, which would
  // point these commands at the real repository instead of the temporary one
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));

  function git(...args) {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
  }

  function runCheck(script = changelogScript, cwd = repo) {
    return run([script], { cwd, env });
  }

  before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'check-changelog-cli-')));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 1;\n');
    writeFileSync(join(repo, 'CHANGELOG.md'), '# Changelog\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    linked = tryLink(changelogScript, join(tmpdir(), `linked-check-changelog-${process.pid}.mjs`));
  });

  beforeEach(() => {
    git('reset', '-q', '--hard');
  });

  after(() => {
    if (linked) {
      rmSync(linked, { force: true });
    }
    if (repo) {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  function changeCode() {
    writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 2;\n');
  }

  function changeChangelog() {
    writeFileSync(join(repo, 'CHANGELOG.md'), '# Changelog\n\n- A change\n');
  }

  it('fails with the fix and exit code 1 when the changelog is not staged', () => {
    changeCode();
    git('add', 'src/a.js');

    const result = runCheck();

    assert.equal(result.status, 1);
    assert.match(result.stderr, /CHANGELOG UPDATE REQUIRED/);
    assert.match(result.stderr, /git add CHANGELOG\.md/);
    assert.equal(result.stdout, '');
  });

  it('exits 0 without output when the changelog is staged with the change', () => {
    changeCode();
    changeChangelog();
    git('add', 'src/a.js', 'CHANGELOG.md');

    const result = runCheck();

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  });

  it('exits 0 when nothing is staged', () => {
    assert.equal(runCheck().status, 0);
  });

  it('reads the staged files, not the working tree', () => {
    changeCode();
    changeChangelog();
    git('add', 'src/a.js');

    assert.equal(runCheck().status, 1);
  });

  it('still runs its checks through a symlink', (t) => {
    if (!linked) {
      return t.skip('symlinks are not available here');
    }

    changeCode();
    git('add', 'src/a.js');
    const failing = runCheck(linked);
    changeChangelog();
    git('add', 'CHANGELOG.md');
    const passing = runCheck(linked);

    assert.equal(failing.status, 1);
    assert.equal(passing.status, 0);
  });

  it('still runs its checks from a relative path', () => {
    const relativeScript = relative(repo, changelogScript);

    changeCode();
    git('add', 'src/a.js');
    const failing = runCheck(relativeScript);
    changeChangelog();
    git('add', 'CHANGELOG.md');
    const passing = runCheck(relativeScript);

    assert.equal(failing.status, 1);
    assert.equal(passing.status, 0);
  });
});
