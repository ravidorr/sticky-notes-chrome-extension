/**
 * Decides whether a build keeps the manifest `key`.
 *
 * The key fixes the extension ID. The Chrome development build keeps it, so an
 * unpacked copy always gets the same ID (see DEVELOPMENT_EXTENSION_ID) and the
 * development OAuth client, which is registered for that ID, works from any
 * folder or machine. Production builds drop it, because the Chrome Web Store
 * assigns the ID and does not accept a key. Edge never keeps the key here: its
 * web client is registered by redirect URL (https://<extension-id>.chromiumapp.org/),
 * so an unpacked Edge build still has a folder-derived ID and that redirect has to
 * be registered for it. Keeping the key for Edge too would fix that, but it is not
 * done yet.
 */

import { createHash } from 'node:crypto';

// The ID that the key in public/manifest.json produces. The development OAuth
// client in scripts/build.js is registered for this ID.
export const DEVELOPMENT_EXTENSION_ID = 'inhfieegmndamdggkoahplhomjbdjjhk';

export function keepsManifestKey(browser, buildEnv) {
  return browser === 'chrome' && buildEnv === 'development';
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
