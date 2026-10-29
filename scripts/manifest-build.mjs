/**
 * Turns a source manifest from public/ into the manifest of a build.
 *
 * Kept apart from build.js (which runs a build when imported) so the version,
 * key and OAuth client steps can be tested for every browser and environment.
 */

import { keepsManifestKey } from './manifest-key.mjs';
import { createChromeManifestVersion } from './manifest-version.mjs';

// Chrome uses "Chrome Extension" type OAuth clients (for getAuthToken).
// Edge uses a "Web application" client (for launchWebAuthFlow); redirect URIs
// are registered on it (see docs/FIREBASE_SETUP.md, Step 8.5).
export const OAUTH_CLIENTS = {
  chrome: {
    // Registered for the fixed ID that the manifest key gives (see manifest-key.mjs)
    development: '413613230006-d23no6q0u4nak0s9rqfqqh5lagcs9t19.apps.googleusercontent.com',
    production: '413613230006-ukaectcb0rd3gq1jjnthc0kd4444ccg3.apps.googleusercontent.com'
  },
  edge: {
    // sticky-notes-edge-extension-dev: the redirect URI of the development ID is registered on it
    development: '413613230006-mu05ttk6b7kvu3j88fp514rkqmghrmiq.apps.googleusercontent.com',
    // sticky-notes-edge-extension: the redirect URI of the Edge Add-ons store ID is registered on it
    production: '413613230006-hd5340hlkdvg0ebgvmgd587a5fdsggn6.apps.googleusercontent.com'
  }
};

/**
 * @param {Object} source - Parsed source manifest (not modified)
 * @param {Object} options
 * @param {string} options.browser - 'chrome' or 'edge'
 * @param {string} options.buildEnv - 'development' or 'production'
 * @param {string} options.version - package.json version
 * @param {Object} [options.oauthClients] - Client IDs by browser and environment
 * @returns {Object} Manifest for the build
 */
export function buildManifest(source, { browser, buildEnv, version, oauthClients = OAUTH_CLIENTS }) {
  const manifest = structuredClone(source);

  // Chrome manifests accept up to four numeric version components. Preserve
  // package metadata in version_name while translating it for the manifest.
  manifest.version = createChromeManifestVersion(version);
  manifest.version_name = version;

  // The 'key' field fixes the extension ID. Only development builds keep it; the
  // stores assign the ID of a published extension.
  if (!keepsManifestKey(browser, buildEnv)) {
    delete manifest.key;
  }

  if (manifest.oauth2) {
    manifest.oauth2.client_id = oauthClients[browser][buildEnv];
  }

  return manifest;
}
