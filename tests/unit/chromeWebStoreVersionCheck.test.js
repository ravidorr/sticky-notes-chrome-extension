/**
 * Chrome Web Store version check Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const check = await import('../../scripts/check-chrome-web-store-version.mjs');

const statusWith = (...versions) => ({
  publishedItemRevisionStatus: {
    distributionChannels: versions.map((crxVersion) => ({ crxVersion }))
  }
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

describe('assertVersionNotPublished', () => {
  it('should throw a clear error when the version is already published', () => {
    expect(() => check.assertVersionNotPublished('1.0.0', statusWith('0.9.0', '1.0.0')))
      .toThrow('already serves version 1.0.0 (published: 0.9.0, 1.0.0)');
  });

  it('should tell the user to bump the version', () => {
    expect(() => check.assertVersionNotPublished('1.0.0', statusWith('1.0.0')))
      .toThrow('Bump the version in package.json');
  });

  it('should return the published versions when the version is new', () => {
    expect(check.assertVersionNotPublished('1.1.0', statusWith('1.0.0'))).toEqual(['1.0.0']);
  });

  it('should pass when the store has no published version', () => {
    expect(check.assertVersionNotPublished('1.0.0', {})).toEqual([]);
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

  it('should reject when the version is already published', async () => {
    await expect(run('1.0.0', statusWith('1.0.0'))).rejects.toThrow('already serves version 1.0.0');
  });

  it('should resolve and log for a new version', async () => {
    await expect(run('1.1.0', statusWith('1.0.0'))).resolves.toEqual({
      packageVersion: '1.1.0',
      publishedCrxVersions: ['1.0.0']
    });
    expect(stdoutSpy).toHaveBeenCalledWith('Publishing 1.1.0 (store has: 1.0.0).\n');
  });

  it('should report when the store has no published version', async () => {
    await run('1.0.0', {});

    expect(stdoutSpy).toHaveBeenCalledWith('Publishing 1.0.0 (store has: none).\n');
  });

  it('should reject when the manifest has no version', async () => {
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, '{}');

    await expect(
      check.runChromeWebStoreVersionCheck({ accessToken: 't', publisherId: 'p', extensionId: 'e', manifestPath })
    ).rejects.toThrow('non-empty manifest version');
  });
});
