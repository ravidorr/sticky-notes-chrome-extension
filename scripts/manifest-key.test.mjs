import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  DEVELOPMENT_EDGE_REDIRECT_URL,
  DEVELOPMENT_EXTENSION_ID,
  extensionIdFromKey,
  keepsManifestKey
} from './manifest-key.mjs';

const chromeManifest = JSON.parse(
  readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8')
);

const edgeManifest = JSON.parse(
  readFileSync(new URL('../public/manifest.edge.json', import.meta.url), 'utf8')
);

describe('keepsManifestKey', () => {
  it('keeps the key only in development builds', () => {
    assert.equal(keepsManifestKey('chrome', 'development'), true);
    assert.equal(keepsManifestKey('chrome', 'production'), false);
    assert.equal(keepsManifestKey('edge', 'development'), true);
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

describe('Edge development extension ID', () => {
  it('uses the same key in the Edge manifest as in the Chrome manifest', () => {
    assert.equal(edgeManifest.key, chromeManifest.key);
  });

  it('gives the Edge manifest key the development extension ID', () => {
    assert.equal(extensionIdFromKey(edgeManifest.key), DEVELOPMENT_EXTENSION_ID);
  });

  it('names the redirect URL that Edge sign-in uses', () => {
    assert.equal(
      DEVELOPMENT_EDGE_REDIRECT_URL,
      'https://inhfieegmndamdggkoahplhomjbdjjhk.chromiumapp.org/'
    );
  });
});

describe('keepsManifestKey with unknown input', () => {
  it('drops the key for an unknown browser or environment', () => {
    assert.equal(keepsManifestKey('firefox', 'development'), false);
    assert.equal(keepsManifestKey('edge', 'staging'), false);
    assert.equal(keepsManifestKey('chrome', undefined), false);
  });
});

describe('documented extension ID and redirect URL', () => {
  for (const file of ['README.md', 'docs/FIREBASE_SETUP.md']) {
    it(`${file} names the development extension ID and the Edge redirect URL`, () => {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.ok(text.includes(DEVELOPMENT_EXTENSION_ID), `${file} must contain ${DEVELOPMENT_EXTENSION_ID}`);
      assert.ok(text.includes(DEVELOPMENT_EDGE_REDIRECT_URL), `${file} must contain ${DEVELOPMENT_EDGE_REDIRECT_URL}`);
    });
  }
});
