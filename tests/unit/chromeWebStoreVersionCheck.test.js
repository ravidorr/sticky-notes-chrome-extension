/**
 * Chrome Web Store version check Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const check = await import('../../scripts/check-chrome-web-store-version.mjs');

const channelsFor = (versions) => ({ distributionChannels: versions.map((crxVersion) => ({ crxVersion })) });

const statusWith = (...versions) => ({ publishedItemRevisionStatus: channelsFor(versions) });

const statusIn = (published, submitted) => ({
  publishedItemRevisionStatus: channelsFor(published),
  submittedItemRevisionStatus: channelsFor(submitted)
});

describe('readVersionFromManifest', () => {
  it('should return the manifest version', () => {
    expect(check.readVersionFromManifest('{"version":"1.20.3.8"}')).toBe('1.20.3.8');
  });

  it('should return null for invalid JSON', () => {
    expect(check.readVersionFromManifest('not json')).toBeNull();
  });

  it('should return null for a missing or empty version', () => {
    expect(check.readVersionFromManifest('{}')).toBeNull();
    expect(check.readVersionFromManifest('{"version":""}')).toBeNull();
    expect(check.readVersionFromManifest('{"version":5}')).toBeNull();
  });
});

describe('readPublishedCrxVersions', () => {
  it('should return unique published versions', () => {
    expect(check.readPublishedCrxVersions(statusWith('1.0.0', '1.0.0', '1.1.0'))).toEqual(['1.0.0', '1.1.0']);
  });

  it('should ignore channels without a valid crxVersion', () => {
    const status = {
      publishedItemRevisionStatus: {
        distributionChannels: [{}, { crxVersion: '' }, null, { crxVersion: '2.0.0' }]
      }
    };
    expect(check.readPublishedCrxVersions(status)).toEqual(['2.0.0']);
  });

  it('should return an empty list when nothing is published', () => {
    expect(check.readPublishedCrxVersions({})).toEqual([]);
    expect(check.readPublishedCrxVersions(undefined)).toEqual([]);
    expect(check.readPublishedCrxVersions({ publishedItemRevisionStatus: { distributionChannels: 'x' } })).toEqual([]);
  });
});

describe('readSubmittedCrxVersions', () => {
  it('should return the versions of the revision that was submitted', () => {
    expect(check.readSubmittedCrxVersions(statusIn(['1.0.0'], ['1.1.0']))).toEqual(['1.1.0']);
  });

  it('should return an empty list when nothing is in review', () => {
    expect(check.readSubmittedCrxVersions(statusWith('1.0.0'))).toEqual([]);
    expect(check.readSubmittedCrxVersions(undefined)).toEqual([]);
  });
});

describe('compareManifestVersions', () => {
  it('should compare numerically', () => {
    expect(check.compareManifestVersions('1.20.10', '1.20.9')).toBeGreaterThan(0);
    expect(check.compareManifestVersions('1.20.9', '1.20.10')).toBeLessThan(0);
    expect(check.compareManifestVersions('1.20', '1.20.0')).toBe(0);
  });
});

describe('decideSubmission', () => {
  it('should submit a version the store does not have', () => {
    expect(check.decideSubmission('1.1.0', statusWith('1.0.0'))).toEqual({
      submit: true,
      reason: 'Version 1.1.0 is new (published: 1.0.0; in review: none).'
    });
  });

  it('should submit the first version when the store has none', () => {
    expect(check.decideSubmission('1.0.0', {}).submit).toBe(true);
  });

  it('should skip a version that is already published', () => {
    const decision = check.decideSubmission('1.0.0', statusWith('0.9.0', '1.0.0'));

    expect(decision.submit).toBe(false);
    expect(decision.reason).toContain('already has version 1.0.0 (published: 0.9.0, 1.0.0; in review: none)');
  });

  it('should skip a version that is still in review', () => {
    const decision = check.decideSubmission('1.1.0', statusIn(['1.0.0'], ['1.1.0']));

    expect(decision.submit).toBe(false);
    expect(decision.reason).toContain('in review: 1.1.0');
  });

  it('should throw when the store has a higher version, published or in review', () => {
    expect(() => check.decideSubmission('1.0.0', statusWith('1.1.0')))
      .toThrow('already has a higher version (1.1.0) than 1.0.0');
    expect(() => check.decideSubmission('1.0.0', statusIn(['1.0.0'], ['1.1.0'])))
      .toThrow('already has a higher version (1.1.0) than 1.0.0');
  });
});

describe('fetchChromeWebStoreStatus', () => {
  const args = { accessToken: 'token', publisherId: 'pub', extensionId: 'ext' };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('should call fetchStatus with the bearer token and return the parsed body', async () => {
    global.fetch.mockResolvedValue({ ok: true, text: async () => '{"a":1}' });

    await expect(check.fetchChromeWebStoreStatus(args)).resolves.toEqual({ a: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://chromewebstore.googleapis.com/v2/publishers/pub/items/ext:fetchStatus',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('should include status and body in the error when the request fails', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'denied' });

    await expect(check.fetchChromeWebStoreStatus(args)).rejects.toThrow('fetchStatus failed (403): denied');
  });
});

describe('runChromeWebStoreVersionCheck', () => {
  let dir;
  let stdoutSpy;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cws-check-'));
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (version, status) => {
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ version }));
    global.fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify(status) });
    return check.runChromeWebStoreVersionCheck({
      accessToken: 't',
      publisherId: 'p',
      extensionId: 'e',
      manifestPath
    });
  };

  it('should skip without failing when the version is already published', async () => {
    const result = await run('1.0.0', statusWith('1.0.0'));

    expect(result.submit).toBe(false);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping submission: Chrome Web Store already has version 1.0.0'));
  });

  it('should skip when the version is already in review', async () => {
    const result = await run('1.1.0', statusIn(['1.0.0'], ['1.1.0']));

    expect(result.submit).toBe(false);
  });

  it('should reject when the store has a higher version', async () => {
    await expect(run('1.0.0', statusWith('1.1.0'))).rejects.toThrow('already has a higher version (1.1.0)');
  });

  it('should resolve and log for a new version', async () => {
    await expect(run('1.1.0', statusWith('1.0.0'))).resolves.toEqual({
      packageVersion: '1.1.0',
      publishedCrxVersions: ['1.0.0'],
      submittedCrxVersions: [],
      submit: true,
      reason: 'Version 1.1.0 is new (published: 1.0.0; in review: none).'
    });
    expect(stdoutSpy).toHaveBeenCalledWith('Submitting: Version 1.1.0 is new (published: 1.0.0; in review: none).\n');
  });

  it('should report when the store has no published version', async () => {
    await run('1.0.0', {});

    expect(stdoutSpy).toHaveBeenCalledWith('Submitting: Version 1.0.0 is new (published: none; in review: none).\n');
  });

  it('should reject when the manifest has no version', async () => {
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, '{}');

    await expect(
      check.runChromeWebStoreVersionCheck({ accessToken: 't', publisherId: 'p', extensionId: 'e', manifestPath })
    ).rejects.toThrow('non-empty manifest version');
  });
});
