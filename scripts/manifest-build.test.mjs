import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { OAUTH_CLIENTS, buildManifest } from './manifest-build.mjs';
import { DEVELOPMENT_EXTENSION_ID, extensionIdFromKey } from './manifest-key.mjs';

const readManifest = (name) =>
  JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));

const sources = { chrome: readManifest('manifest.json'), edge: readManifest('manifest.edge.json') };

// What the owner registers the redirect URI on (docs/FIREBASE_SETUP.md, Step 8.5)
const EDGE_WEB_CLIENT = '413613230006-mu05ttk6b7kvu3j88fp514rkqmghrmiq.apps.googleusercontent.com';
const EDGE_PRODUCTION_WEB_CLIENT = '413613230006-vo9qq87ol2tm4c249q1foq5ph5ujtf7l.apps.googleusercontent.com';

describe('buildManifest', () => {
  for (const browser of ['chrome', 'edge']) {
    it(`keeps a key for the ${browser} development build, with the development ID`, () => {
      const manifest = buildManifest(sources[browser], { browser, buildEnv: 'development', version: '1.2.3' });
      assert.equal(extensionIdFromKey(manifest.key), DEVELOPMENT_EXTENSION_ID);
    });

    it(`drops the key from the ${browser} production build`, () => {
      const manifest = buildManifest(sources[browser], { browser, buildEnv: 'production', version: '1.2.3' });
      assert.equal(Object.hasOwn(manifest, 'key'), false);
    });

    for (const buildEnv of ['development', 'production']) {
      it(`sets the version and the OAuth client of the ${browser} ${buildEnv} build`, () => {
        const manifest = buildManifest(sources[browser], { browser, buildEnv, version: '1.2.3+8' });
        assert.equal(manifest.version, '1.2.3.8');
        assert.equal(manifest.version_name, '1.2.3+8');
        assert.equal(manifest.oauth2.client_id, OAUTH_CLIENTS[browser][buildEnv]);
      });
    }
  }

  it('uses the Edge Web application client for Edge development builds', () => {
    const manifest = buildManifest(sources.edge, { browser: 'edge', buildEnv: 'development', version: '1.2.3' });
    assert.equal(manifest.oauth2.client_id, EDGE_WEB_CLIENT);
  });

  it('uses its own Edge Web application client for Edge production builds', () => {
    const manifest = buildManifest(sources.edge, { browser: 'edge', buildEnv: 'production', version: '1.2.3' });
    assert.equal(manifest.oauth2.client_id, EDGE_PRODUCTION_WEB_CLIENT);
    assert.notEqual(EDGE_PRODUCTION_WEB_CLIENT, EDGE_WEB_CLIENT);
  });

  it('does not change the source manifest', () => {
    const before = JSON.stringify(sources.edge);
    buildManifest(sources.edge, { browser: 'edge', buildEnv: 'production', version: '1.2.3' });
    assert.equal(JSON.stringify(sources.edge), before);
  });
});
