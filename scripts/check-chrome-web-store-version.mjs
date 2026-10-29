/**
 * Pre-flight check for the Chrome Web Store workflow.
 *
 * Fails when the version in the built manifest is already published. The
 * store rejects an unchanged version, so failing here gives a clear message
 * before the workflow cancels a pending submission.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { isEntryPoint } from './is-entry-point.mjs';

const API_BASE_URL = 'https://chromewebstore.googleapis.com/v2';
const DEFAULT_MANIFEST_PATH = 'dist/chrome/manifest.json';

export function readVersionFromManifest(manifestJson) {
  try {
    const { version } = JSON.parse(manifestJson);
    return typeof version === 'string' && version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

export function readPublishedCrxVersions(fetchStatus) {
  const channels = fetchStatus?.publishedItemRevisionStatus?.distributionChannels;

  if (!Array.isArray(channels)) {
    return [];
  }

  const versions = [];

  for (const channel of channels) {
    const version = channel?.crxVersion;
    if (typeof version === 'string' && version.length > 0 && !versions.includes(version)) {
      versions.push(version);
    }
  }

  return versions;
}

export function assertVersionNotPublished(packageVersion, fetchStatus) {
  const publishedCrxVersions = readPublishedCrxVersions(fetchStatus);

  if (publishedCrxVersions.includes(packageVersion)) {
    throw new Error(
      `Chrome Web Store already serves version ${packageVersion} ` +
      `(published: ${publishedCrxVersions.join(', ')}). ` +
      'Bump the version in package.json before merging; the store rejects an unchanged version.'
    );
  }

  return publishedCrxVersions;
}

export async function fetchChromeWebStoreStatus({ accessToken, publisherId, extensionId }) {
  const itemName = `publishers/${publisherId}/items/${extensionId}`;
  const response = await fetch(`${API_BASE_URL}/${itemName}:fetchStatus`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Chrome Web Store fetchStatus failed (${response.status}): ${body}`);
  }

  return JSON.parse(body);
}

export async function runChromeWebStoreVersionCheck({
  accessToken,
  publisherId,
  extensionId,
  manifestPath = DEFAULT_MANIFEST_PATH
}) {
  const packageVersion = readVersionFromManifest(readFileSync(manifestPath, 'utf8'));

  if (!packageVersion) {
    throw new Error(`${manifestPath} must contain a non-empty manifest version.`);
  }

  const fetchStatus = await fetchChromeWebStoreStatus({ accessToken, publisherId, extensionId });
  const publishedCrxVersions = assertVersionNotPublished(packageVersion, fetchStatus);
  const published = publishedCrxVersions.length > 0 ? publishedCrxVersions.join(', ') : 'none';

  process.stdout.write(`Publishing ${packageVersion} (store has: ${published}).\n`);

  return { packageVersion, publishedCrxVersions };
}

function runCli() {
  const accessToken = process.env.ACCESS_TOKEN;
  const publisherId = process.env.PUBLISHER_ID;
  const extensionId = process.env.EXTENSION_ID;
  const manifestPath = process.env.MANIFEST_PATH ?? DEFAULT_MANIFEST_PATH;

  if (!accessToken || !publisherId || !extensionId) {
    console.error('ACCESS_TOKEN, PUBLISHER_ID, and EXTENSION_ID are required.');
    process.exit(1);
  }

  return runChromeWebStoreVersionCheck({ accessToken, publisherId, extensionId, manifestPath })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export const cliExecutionPromise = isEntryPoint(import.meta.url)
  ? runCli()
  : undefined;
