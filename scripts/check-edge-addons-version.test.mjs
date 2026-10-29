import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideEdgeSubmission,
  findMissingSettings,
  readPackageVersion,
  runCheck
} from './check-edge-addons-version.mjs';

const configured = {
  EDGE_CLIENT_ID: 'client',
  EDGE_API_KEY: 'key',
  EDGE_PRODUCT_ID: 'product',
  HEAD_SHA: 'head',
  BASE_SHA: 'base'
};

const packageAt = (versions) => (sha) => JSON.stringify({ version: versions[sha] });

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
    assert.deepEqual(findMissingSettings({ ...configured, EDGE_API_KEY: '' }), ['EDGE_API_KEY']);
    assert.deepEqual(findMissingSettings(configured), []);
  });
});

describe('decideEdgeSubmission', () => {
  it('submits when the version went up', () => {
    const decision = decideEdgeSubmission({ baseVersion: '1.20.15', headVersion: '1.20.16' });
    assert.equal(decision.submit, true);
    assert.match(decision.reason, /1\.20\.15 to 1\.20\.16/);
  });

  it('skips when the version did not change', () => {
    const decision = decideEdgeSubmission({ baseVersion: '1.20.15', headVersion: '1.20.15' });
    assert.equal(decision.submit, false);
    assert.match(decision.reason, /did not change/);
  });

  it('compares 1.2.3+8 style versions as manifest versions', () => {
    assert.equal(decideEdgeSubmission({ baseVersion: '1.2.3+8', headVersion: '1.2.3+9' }).submit, true);
    assert.equal(decideEdgeSubmission({ baseVersion: '1.2.3+8', headVersion: '1.2.3+8' }).submit, false);
    assert.equal(decideEdgeSubmission({ baseVersion: '1.2.3', headVersion: '1.2.3+1' }).submit, true);
    assert.match(decideEdgeSubmission({ baseVersion: '1.2.3', headVersion: '1.2.3+1' }).reason, /1\.2\.3 to 1\.2\.3\.1/);
  });

  it('skips when the version went down', () => {
    const decision = decideEdgeSubmission({ baseVersion: '1.20.16', headVersion: '1.20.15' });
    assert.equal(decision.submit, false);
    assert.match(decision.reason, /went down/);
  });

  it('submits a forced run whatever the versions are', () => {
    const decision = decideEdgeSubmission({ headVersion: '1.20.15', forced: true });
    assert.equal(decision.submit, true);
    assert.match(decision.reason, /Manual run/);
  });

  it('treats a missing base version as new', () => {
    assert.equal(decideEdgeSubmission({ headVersion: '1.20.15' }).submit, true);
  });

  it('throws for a version that cannot be a manifest version', () => {
    assert.throws(() => decideEdgeSubmission({ baseVersion: '1.2.3', headVersion: '1.2' }), /Cannot convert/);
    assert.throws(() => decideEdgeSubmission({ baseVersion: 'x', headVersion: '1.2.3' }), /Cannot convert/);
  });
});

describe('runCheck', () => {
  it('skips with a notice when credentials are missing, before reading any version', () => {
    const result = runCheck({ HEAD_SHA: 'head', BASE_SHA: 'base' }, () => {
      throw new Error('must not read');
    });
    assert.equal(result.submit, false);
    assert.equal(result.notice, true);
    assert.match(result.reason, /EDGE_CLIENT_ID, EDGE_API_KEY, EDGE_PRODUCT_ID are not configured/);
    assert.match(result.reason, /docs\/EDGE_ADDONS_PUBLISHING\.md/);
  });

  it('uses singular wording for one missing setting', () => {
    const result = runCheck({ ...configured, EDGE_PRODUCT_ID: '' }, () => '{}');
    assert.match(result.reason, /EDGE_PRODUCT_ID is not configured/);
  });

  it('compares the versions at the base and at the merge commit', () => {
    const read = packageAt({ base: '1.20.15', head: '1.20.16' });
    assert.equal(runCheck(configured, read).submit, true);
    assert.equal(runCheck(configured, packageAt({ base: '1.20.16', head: '1.20.16' })).submit, false);
  });

  it('submits a manual run without reading the base', () => {
    const read = (sha) => {
      assert.equal(sha, 'head');
      return '{"version":"1.20.16"}';
    };
    assert.equal(runCheck({ ...configured, EVENT_NAME: 'workflow_dispatch' }, read).submit, true);
  });

  it('requires the merge commit', () => {
    assert.throws(() => runCheck({ ...configured, HEAD_SHA: '' }, () => '{}'), /HEAD_SHA is required/);
  });
});
