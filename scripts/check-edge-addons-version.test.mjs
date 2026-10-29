import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GateError,
  decideEdgeSubmission,
  findMissingSettings,
  readPackageVersion,
  runCheck
} from './check-edge-addons-version.mjs';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'check-edge-addons-version.mjs');

const allSettings = { EDGE_CLIENT_ID: 'client', EDGE_API_KEY: 'key', EDGE_PRODUCT_ID: 'product' };

// A reader over fake commits: the head commit and its first parent
const versions = (head, base) => (rev) => {
  const version = rev.endsWith('^1') ? base : head;
  if (version === null) {
    throw Object.assign(new Error('missing'), { stderr: 'fatal: path package.json does not exist' });
  }
  return JSON.stringify({ version });
};

const check = (head, base, env = {}) =>
  runCheck({ ...allSettings, HEAD_SHA: 'merge', EVENT_NAME: 'pull_request', ...env }, versions(head, base));

describe('readPackageVersion', () => {
  it('reads the version', () => {
    assert.equal(readPackageVersion('{"version":"1.2.3"}'), '1.2.3');
  });

  it('rejects invalid JSON and a missing version', () => {
    assert.throws(() => readPackageVersion('nope'), /not valid JSON/);
    assert.throws(() => readPackageVersion('{}'), /non-empty version/);
    assert.throws(() => readPackageVersion('{"version":""}'), /non-empty version/);
  });
});

describe('findMissingSettings', () => {
  it('lists every empty or missing setting', () => {
    assert.deepEqual(findMissingSettings({}), ['EDGE_CLIENT_ID', 'EDGE_API_KEY', 'EDGE_PRODUCT_ID']);
    assert.deepEqual(findMissingSettings({ ...allSettings, EDGE_API_KEY: '' }), ['EDGE_API_KEY']);
    assert.deepEqual(findMissingSettings(allSettings), []);
  });
});

describe('decideEdgeSubmission', () => {
  it('submits when the version went up, numerically', () => {
    assert.equal(decideEdgeSubmission({ baseVersion: '1.20.15', headVersion: '1.20.16' }).submit, true);
    assert.equal(decideEdgeSubmission({ baseVersion: '1.2.9', headVersion: '1.2.10' }).submit, true);
    assert.equal(decideEdgeSubmission({ baseVersion: '1.2.3+8', headVersion: '1.2.4' }).submit, true);
    assert.equal(decideEdgeSubmission({ baseVersion: '1.2.3', headVersion: '1.2.3+1' }).submit, true);
  });

  it('skips an unchanged version, including +0 against none', () => {
    const decision = decideEdgeSubmission({ baseVersion: '1.20.15', headVersion: '1.20.15' });
    assert.equal(decision.submit, false);
    assert.equal(decision.change, 'same');
    assert.match(decision.reason, /did not change in this merge, so no new release is needed/);
    assert.equal(decideEdgeSubmission({ baseVersion: '1.2.3+0', headVersion: '1.2.3' }).change, 'same');
  });

  it('skips a lower version', () => {
    const decision = decideEdgeSubmission({ baseVersion: '1.2.3+9', headVersion: '1.2.3' });
    assert.equal(decision.submit, false);
    assert.equal(decision.change, 'down');
    assert.match(decision.reason, /went down/);
  });

  it('submits a forced run without a base version', () => {
    const decision = decideEdgeSubmission({ headVersion: '1.20.15', forced: true });
    assert.equal(decision.submit, true);
    assert.match(decision.reason, /Manual run/);
  });

  it('refuses to guess without a base version', () => {
    assert.throws(() => decideEdgeSubmission({ headVersion: '1.20.15' }), GateError);
  });

  for (const bad of ['1.2.3+65536', '1.2.3+abc', '1.2.3-beta', '1.2.3+8+9', '1.2']) {
    it(`names the side whose version ${bad} is not usable`, () => {
      assert.throws(() => decideEdgeSubmission({ baseVersion: bad, headVersion: '1.2.3' }), /base version is not usable/);
      assert.throws(() => decideEdgeSubmission({ baseVersion: '1.2.3', headVersion: bad }), /head version is not usable/);
    });
  }
});

describe('runCheck', () => {
  it('compares the merge commit with its first parent', () => {
    assert.equal(check('1.20.16', '1.20.15').submit, true);
    const same = check('1.20.16', '1.20.16');
    assert.equal(same.submit, false);
    assert.equal(same.status, 'SKIPPED (no release)');
    assert.equal(same.level, null);
  });

  it('warns when the version went down', () => {
    const result = check('1.20.15', '1.20.16');
    assert.equal(result.submit, false);
    assert.equal(result.level, 'warning');
    assert.match(result.status, /version went DOWN/);
  });

  it('is quiet without credentials when nothing is to be released', () => {
    const result = check('1.20.16', '1.20.16', { EDGE_CLIENT_ID: '', EDGE_API_KEY: '', EDGE_PRODUCT_ID: '' });
    assert.equal(result.submit, false);
    assert.equal(result.level, null);
    assert.equal(result.status, 'SKIPPED (no release)');
  });

  it('warns loudly without credentials when a release was due', () => {
    const result = check('1.20.16', '1.20.15', { EDGE_CLIENT_ID: '', EDGE_API_KEY: '', EDGE_PRODUCT_ID: '' });
    assert.equal(result.submit, false);
    assert.equal(result.level, 'warning');
    assert.equal(result.status, 'SKIPPED (credentials missing)');
    assert.match(result.reason, /Version 1\.20\.16 was NOT submitted/);
    assert.match(result.reason, /EDGE_CLIENT_ID, EDGE_API_KEY, EDGE_PRODUCT_ID are not configured/);
    assert.match(result.reason, /fork/);
    assert.doesNotMatch(result.reason, /Edge publishing is skipped/);
  });

  it('fails when only some settings are set', () => {
    assert.throws(
      () => check('1.20.15', '1.20.15', { EDGE_API_KEY: '' }),
      /EDGE_API_KEY is not configured, but the others are set/
    );
  });

  it('fails a manual run when any setting is missing, and submits it when complete', () => {
    assert.throws(
      () => check('1.20.15', null, { EVENT_NAME: 'workflow_dispatch', EDGE_PRODUCT_ID: '' }),
      /EDGE_PRODUCT_ID is not configured, but a manual run needs all three/
    );
    assert.throws(
      () => check('1.20.15', null, { EVENT_NAME: 'workflow_dispatch', EDGE_CLIENT_ID: '', EDGE_API_KEY: '', EDGE_PRODUCT_ID: '' }),
      /not configured/
    );
    const manual = check('1.20.15', null, { EVENT_NAME: 'workflow_dispatch' });
    assert.equal(manual.submit, true);
  });

  it('reads the version before looking at the credentials', () => {
    assert.throws(
      () => check('1.2.3-beta', '1.2.3', { EDGE_CLIENT_ID: '', EDGE_API_KEY: '', EDGE_PRODUCT_ID: '' }),
      /head version is not usable/
    );
  });

  it('names the side when a commit has no readable package.json', () => {
    assert.throws(() => check('1.2.3', null), /Cannot read package.json at the base commit \(merge\^1\).*fetch-depth: 0/);
    assert.throws(() => check(null, '1.2.3'), /Cannot read package.json at the head commit \(merge\)/);
  });

  it('requires the merge commit', () => {
    assert.throws(() => runCheck({ ...allSettings, EVENT_NAME: 'pull_request', HEAD_SHA: '' }, () => '{}'), /HEAD_SHA is required/);
    assert.throws(() => runCheck({ ...allSettings }, () => '{}'), /HEAD_SHA is required/);
  });

  it('treats an unknown event like a merge', () => {
    assert.equal(check('1.20.16', '1.20.15', { EVENT_NAME: 'push' }).submit, true);
    assert.equal(check('1.20.16', '1.20.16', { EVENT_NAME: '' }).submit, false);
  });
});

describe('check-edge-addons-version.mjs as a command', () => {
  let dir;
  let repo;
  let outputFile;
  let summaryFile;
  const shas = {};

  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo, encoding: 'utf8'
  }).trim();

  const commit = (message, version, extra) => {
    if (version) {
      writeFileSync(join(repo, 'package.json'), JSON.stringify({ version }));
    }
    writeFileSync(join(repo, extra ?? 'notes.txt'), message);
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  const run = (env, command = scriptPath) => {
    writeFileSync(outputFile, '');
    writeFileSync(summaryFile, '');
    const result = spawnSync(process.execPath, [command], {
      cwd: repo,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: outputFile, GITHUB_STEP_SUMMARY: summaryFile, ...env }
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      output: readFileSync(outputFile, 'utf8'),
      summary: readFileSync(summaryFile, 'utf8')
    };
  };

  before(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'edge-gate-')));
    repo = join(dir, 'repo');
    outputFile = join(dir, 'output');
    summaryFile = join(dir, 'summary');
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);

    // main@A, then main@B with a bump that was merged earlier
    shas.a = commit('A', '1.0.0');
    shas.b = commit('B bump', '1.0.1');
    // A squash commit for a pull request that was opened on A and has no bump
    shas.noBump = commit('C no bump');
    // A squash commit with a bump
    shas.bump = commit('D bump', '1.0.2');
    // A real merge commit of a branch that bumps
    git('checkout', '-q', '-b', 'feature');
    shas.featureBump = commit('E feature bump', '1.0.3');
    git('checkout', '-q', 'main');
    commit('F main moves on', null, 'other.txt');
    git('merge', '-q', '--no-ff', '-m', 'Merge feature', 'feature');
    shas.merge = git('rev-parse', 'HEAD');
    // A decrease
    shas.down = commit('G down', '1.0.0');
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const env = (head, extra = {}) => ({ ...allSettings, EVENT_NAME: 'pull_request', HEAD_SHA: head, ...extra });

  it('writes exactly submit=false for a squash commit without a bump, even if the PR was opened on an older base', () => {
    const result = run(env(shas.noBump));
    assert.equal(result.status, 0);
    assert.equal(result.output, 'submit=false\n');
    assert.match(result.summary, /SKIPPED \(no release\)/);
    assert.match(result.summary, /^Edge Add-ons: /);
  });

  it('writes exactly submit=true for a squash commit that bumps', () => {
    const result = run(env(shas.bump));
    assert.equal(result.status, 0);
    assert.equal(result.output, 'submit=true\n');
    assert.match(result.stdout, /1\.0\.1 to 1\.0\.2/);
  });

  it('compares a --no-ff merge commit with its first parent', () => {
    const result = run(env(shas.merge));
    assert.equal(result.status, 0);
    assert.equal(result.output, 'submit=true\n');
    assert.match(result.stdout, /1\.0\.2 to 1\.0\.3/);
  });

  it('warns for a lower version', () => {
    const result = run(env(shas.down));
    assert.equal(result.status, 0);
    assert.equal(result.output, 'submit=false\n');
    assert.match(result.stdout, /^::warning::/);
  });

  it('warns that a due release was not submitted when no credentials are set', () => {
    const result = run(env(shas.bump, { EDGE_CLIENT_ID: '', EDGE_API_KEY: '', EDGE_PRODUCT_ID: '' }));
    assert.equal(result.status, 0);
    assert.equal(result.output, 'submit=false\n');
    assert.match(result.stdout, /^::warning::Edge Add-ons SKIPPED \(credentials missing\): Version 1\.0\.2 was NOT submitted/);
    assert.match(result.summary, /SKIPPED \(credentials missing\)/);
  });

  it('is quiet without credentials when nothing is due', () => {
    const result = run(env(shas.noBump, { EDGE_CLIENT_ID: '', EDGE_API_KEY: '', EDGE_PRODUCT_ID: '' }));
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /::warning/);
  });

  it('fails for half configured credentials, a manual run without credentials, and an empty HEAD_SHA', () => {
    const half = run(env(shas.bump, { EDGE_API_KEY: '' }));
    assert.equal(half.status, 1);
    assert.equal(half.output, '');
    assert.match(half.stderr, /^::error::EDGE_API_KEY is not configured/);
    assert.match(half.summary, /FAILED/);

    const manual = run(env(shas.bump, { EVENT_NAME: 'workflow_dispatch', EDGE_PRODUCT_ID: '' }));
    assert.equal(manual.status, 1);

    const empty = run(env('', { }));
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /HEAD_SHA is required/);
  });

  it('submits a manual run with all settings, from the head only', () => {
    const result = run(env(shas.a, { EVENT_NAME: 'workflow_dispatch' }));
    assert.equal(result.status, 0);
    assert.equal(result.output, 'submit=true\n');
  });

  it('fails for an unknown commit, and for the root commit that has no parent', () => {
    const unknown = run(env('0000000000000000000000000000000000000000'));
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Cannot read package.json at the head commit/);

    const root = run(env(shas.a));
    assert.equal(root.status, 1);
    assert.match(root.stderr, /at the base commit/);
    assert.match(root.stderr, /fetch-depth: 0/);
  });

  it('fails when the first parent has no package.json', () => {
    git('checkout', '-q', '--orphan', 'bare');
    git('rm', '-rf', '-q', '.');
    const bare = commit('bare');
    const withPackage = commit('with package', '1.0.0');
    const result = run(env(withPackage));
    git('checkout', '-q', 'main');
    assert.notEqual(bare, withPackage);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot read package.json at the base commit/);
  });

  it('keeps the message on one line in the annotation', () => {
    const result = run(env(shas.a));
    assert.equal(result.stderr.trim().split('\n').length, 1);
  });

  it('runs through a symlink', () => {
    const link = join(dir, 'link.mjs');
    try {
      symlinkSync(scriptPath, link);
    } catch {
      return;
    }
    const result = run(env(shas.bump), link);
    assert.equal(result.status, 0);
    assert.equal(result.output, 'submit=true\n');
  });

  it('reports version errors on the failing side through the command', () => {
    const bad = commit('bad version', '1.2.3-beta');
    const result = run(env(bad));
    git('checkout', '-q', 'main');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /head version is not usable/);
  });
});
