import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  DEVELOPMENT_EXTENSION_ID,
  extensionIdFromKey,
  keepsManifestKey
} from './manifest-key.mjs';

const chromeManifest = JSON.parse(
  readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8')
);

describe('keepsManifestKey', () => {
  it('keeps the key only in Chrome development builds', () => {
    assert.equal(keepsManifestKey('chrome', 'development'), true);
    assert.equal(keepsManifestKey('chrome', 'production'), false);
    assert.equal(keepsManifestKey('edge', 'development'), false);
    assert.equal(keepsManifestKey('edge', 'production'), false);
  });
});

describe('extensionIdFromKey', () => {
  it('produces a 32 letter ID from a-p', () => {
    assert.match(extensionIdFromKey(chromeManifest.key), /^[a-p]{32}$/);
  });

  it('gives the committed manifest key the development extension ID', () => {
    assert.equal(extensionIdFromKey(chromeManifest.key), DEVELOPMENT_EXTENSION_ID);
  });
});
