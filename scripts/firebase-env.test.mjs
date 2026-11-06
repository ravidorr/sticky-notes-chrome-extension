import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REQUIRED_FIREBASE_ENV, missingFirebaseEnv } from './firebase-env.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const complete = Object.fromEntries(REQUIRED_FIREBASE_ENV.map((name) => [name, `value-of-${name}`]));

describe('missingFirebaseEnv', () => {
  it('reports nothing when every value is set', () => {
    assert.deepEqual(missingFirebaseEnv(complete), []);
  });

  it('reports every value of an empty env', () => {
    assert.deepEqual(missingFirebaseEnv({}), REQUIRED_FIREBASE_ENV);
  });

  it('reports an empty value', () => {
    assert.deepEqual(missingFirebaseEnv({ ...complete, VITE_FIREBASE_APP_ID: '' }), ['VITE_FIREBASE_APP_ID']);
  });

  it('reports the placeholders of .env.example', () => {
    const placeholders = Object.fromEntries(
      read('.env.example')
        .split('\n')
        .filter((line) => line.startsWith('VITE_FIREBASE_'))
        .map((line) => line.split('='))
    );
    assert.deepEqual(missingFirebaseEnv(placeholders), REQUIRED_FIREBASE_ENV);
  });
});

describe('release workflows', () => {
  for (const file of ['publish-chrome-web-store.yml', 'publish-edge-addons.yml']) {
    it(`${file} builds with the Firebase config and requires it`, () => {
      const workflow = read(`.github/workflows/${file}`);
      assert.match(workflow, /REQUIRE_FIREBASE_CONFIG: 'true'/);
      for (const name of REQUIRED_FIREBASE_ENV) {
        assert.ok(workflow.includes(`${name}: \${{ vars.${name} }}`), `${file} does not pass ${name}`);
      }
    });
  }
});
