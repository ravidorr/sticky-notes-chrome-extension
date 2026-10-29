/**
 * Decides whether a build keeps the manifest `key`.
 *
 * The key fixes the extension ID. Development builds of both browsers keep it,
 * so an unpacked copy always gets the same ID (see DEVELOPMENT_EXTENSION_ID) from
 * any folder or machine. Chrome's development OAuth client is registered for that
 * ID. Edge signs in with launchWebAuthFlow against a Web application client, which
 * is registered by redirect URL (see DEVELOPMENT_EDGE_REDIRECT_URL), so a stable ID
 * means that redirect only has to be registered once. Edge uses the same key as
 * Chrome because both are Chromium and derive the ID from the key the same way; the
 * two browsers never share a profile, so the same ID does not collide.
 * Production builds drop the key, because the Chrome Web Store and Edge Add-ons
 * assign the ID and do not accept a key.
 */

import { createHash } from 'node:crypto';

// The ID that the key in public/manifest.json produces. The development OAuth
// client in scripts/build.js is registered for this ID.
export const DEVELOPMENT_EXTENSION_ID = 'inhfieegmndamdggkoahplhomjbdjjhk';

// What chrome.identity.getRedirectURL() returns for that ID in a Chromium browser
// (https://<extension-id>.chromiumapp.org/). Register it as an authorized redirect
// URI on the Edge Web application OAuth client.
export const DEVELOPMENT_EDGE_REDIRECT_URL = `https://${DEVELOPMENT_EXTENSION_ID}.chromiumapp.org/`;

export function keepsManifestKey(browser, buildEnv) {
  return (browser === 'chrome' || browser === 'edge') && buildEnv === 'development';
}

/**
 * Computes the extension ID that Chrome derives from a manifest key: the first
 * 32 hex digits of the SHA-256 of the DER public key, with 0-f mapped to a-p.
 *
 * @param {string} key - Base64 public key from the manifest
 * @returns {string} Extension ID
 */
export function extensionIdFromKey(key) {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...digest].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join('');
}
