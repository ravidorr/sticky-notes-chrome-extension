import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareManifestVersions,
  decideSubmission,
  readPublishedCrxVersions,
  readSubmittedCrxVersions,
  readVersionFromManifest
} from './check-chrome-web-store-version.mjs';

const channels = (versions) => ({ distributionChannels: versions.map((crxVersion) => ({ crxVersion })) });

const status = ({ published = [], submitted = [] } = {}) => ({
  publishedItemRevisionStatus: channels(published),
  submittedItemRevisionStatus: channels(submitted)
});

describe('decideSubmission', () => {
  it('submits a version the store does not have', () => {
    const decision = decideSubmission('1.20.10', status({ published: ['1.20.9'] }));

    assert.equal(decision.submit, true);
    assert.match(decision.reason, /Version 1\.20\.10 is new \(published: 1\.20\.9; in review: none\)/);
  });

  it('submits the first version when the store has none', () => {
    assert.equal(decideSubmission('1.0.0', status()).submit, true);
    assert.equal(decideSubmission('1.0.0', {}).submit, true);
    assert.equal(decideSubmission('1.0.0', undefined).submit, true);
  });

  it('skips a version that is already published', () => {
    const decision = decideSubmission('1.20.9', status({ published: ['1.20.9'] }));

    assert.equal(decision.submit, false);
    assert.match(decision.reason, /already has version 1\.20\.9/);
    assert.match(decision.reason, /nothing is submitted/);
  });

  it('skips a version that is still in review, so it is not submitted twice', () => {
    const decision = decideSubmission('1.20.10', status({ published: ['1.20.9'], submitted: ['1.20.10'] }));

    assert.equal(decision.submit, false);
    assert.match(decision.reason, /published: 1\.20\.9; in review: 1\.20\.10/);
  });

  it('skips when the published and in-review versions are both the current one', () => {
    assert.equal(decideSubmission('1.20.9', status({ published: ['1.20.9'], submitted: ['1.20.9'] })).submit, false);
  });

  it('fails when the store already has a higher published version', () => {
    assert.throws(
      () => decideSubmission('1.20.8', status({ published: ['1.20.9'] })),
      /already has a higher version \(1\.20\.9\) than 1\.20\.8/
    );
  });

  it('fails when a higher version is in review', () => {
    assert.throws(
      () => decideSubmission('1.20.9', status({ published: ['1.20.9'], submitted: ['1.20.10'] })),
      /already has a higher version \(1\.20\.10\) than 1\.20\.9/
    );
  });

  it('compares versions as numbers, not text', () => {
    assert.equal(decideSubmission('1.20.10', status({ published: ['1.20.9'] })).submit, true);
    assert.throws(() => decideSubmission('1.20.9', status({ published: ['1.20.10'] })), /higher version/);
  });

  it('handles a four-part Chrome version', () => {
    assert.equal(decideSubmission('1.20.3.9', status({ published: ['1.20.3.8'] })).submit, true);
    assert.equal(decideSubmission('1.20.3.8', status({ published: ['1.20.3.8'] })).submit, false);
  });
});

describe('compareManifestVersions', () => {
  it('orders versions numerically', () => {
    assert.ok(compareManifestVersions('1.20.10', '1.20.9') > 0);
    assert.ok(compareManifestVersions('1.20.9', '1.20.10') < 0);
    assert.ok(compareManifestVersions('2.0.0', '1.99.99') > 0);
  });

  it('treats missing parts as zero', () => {
    assert.equal(compareManifestVersions('1.20', '1.20.0'), 0);
    assert.ok(compareManifestVersions('1.20.3.8', '1.20.3') > 0);
  });

  it('returns zero for equal versions', () => {
    assert.equal(compareManifestVersions('1.20.9', '1.20.9'), 0);
  });
});

describe('reading the store status', () => {
  it('reads each version once, from the right revision', () => {
    const fetchStatus = {
      publishedItemRevisionStatus: channels(['1.20.9', '1.20.9', '1.20.8']),
      submittedItemRevisionStatus: channels(['1.20.10'])
    };

    assert.deepEqual(readPublishedCrxVersions(fetchStatus), ['1.20.9', '1.20.8']);
    assert.deepEqual(readSubmittedCrxVersions(fetchStatus), ['1.20.10']);
  });

  it('ignores missing or malformed data', () => {
    assert.deepEqual(readPublishedCrxVersions(undefined), []);
    assert.deepEqual(readSubmittedCrxVersions({}), []);
    assert.deepEqual(readPublishedCrxVersions({ publishedItemRevisionStatus: { distributionChannels: 'x' } }), []);
    assert.deepEqual(
      readSubmittedCrxVersions({ submittedItemRevisionStatus: { distributionChannels: [null, {}, { crxVersion: '' }, { crxVersion: 3 }] } }),
      []
    );
  });
});

describe('readVersionFromManifest', () => {
  it('reads a non-empty version', () => {
    assert.equal(readVersionFromManifest(JSON.stringify({ version: '1.20.9' })), '1.20.9');
  });

  it('returns null for a missing, empty or unreadable version', () => {
    assert.equal(readVersionFromManifest(JSON.stringify({})), null);
    assert.equal(readVersionFromManifest(JSON.stringify({ version: '' })), null);
    assert.equal(readVersionFromManifest('not json'), null);
  });
});
