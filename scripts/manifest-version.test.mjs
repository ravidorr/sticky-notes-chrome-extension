import assert from 'node:assert/strict';
import test from 'node:test';

import { createChromeManifestVersion } from './manifest-version.mjs';

test('uses a three-component package version directly', () => {
  assert.equal(createChromeManifestVersion('1.20.3'), '1.20.3');
});

test('maps numeric SemVer build metadata to the fourth Chrome version component', () => {
  assert.equal(createChromeManifestVersion('1.20.3+8'), '1.20.3.8');
});

test('rejects nonnumeric build metadata that Chrome cannot represent', () => {
  assert.throws(
    () => createChromeManifestVersion('1.20.3+build.8'),
    /must use one numeric build-metadata component/,
  );
});

test('rejects version components outside Chrome limits', () => {
  assert.throws(
    () => createChromeManifestVersion('1.20.70000'),
    /Cannot convert package version/,
  );
});
