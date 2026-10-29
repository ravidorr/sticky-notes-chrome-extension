/**
 * Pre-flight check for the Chrome Web Store workflow.
 *
 * Decides whether the built version needs a new submission. The version only
 * changes together with the extension code, so a version the store already has
 * means there is nothing to release and the workflow skips the submission. A
 * version that is still in review counts as submitted, so a merge that lands
 * while the previous release is being reviewed does not submit it again. A
 * version lower than one the store has fails the check, because the store
 * would reject it.
 */

import { appendFileSync, readFileSync } from 'node:fs';
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

function readCrxVersions(revisionStatus) {
  const channels = revisionStatus?.distributionChannels;

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

export function readPublishedCrxVersions(fetchStatus) {
  return readCrxVersions(fetchStatus?.publishedItemRevisionStatus);
}

// The revision that was submitted and may still be in review
export function readSubmittedCrxVersions(fetchStatus) {
  return readCrxVersions(fetchStatus?.submittedItemRevisionStatus);
}

/**
 * Compares two dotted numeric versions, such as Chrome manifest versions.
 *
 * @returns {number} Negative when first is lower, positive when first is higher, 0 when equal
 */
export function compareManifestVersions(first, second) {
  const left = first.split('.').map(Number);
  const right = second.split('.').map(Number);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/**
 * @param {string} manifestVersion - Version of the built manifest
 * @param {Object} fetchStatus - Response of the store's fetchStatus call
 * @returns {{submit: boolean, reason: string}} Whether a new submission is needed
 * @throws {Error} When the store already has a higher version
 */
export function decideSubmission(manifestVersion, fetchStatus) {
  const published = readPublishedCrxVersions(fetchStatus);
  const submitted = readSubmittedCrxVersions(fetchStatus);
  const known = [...new Set([...published, ...submitted])];
  const summary = `published: ${published.join(', ') || 'none'}; in review: ${submitted.join(', ') || 'none'}`;

  // Checked first, so a build that is behind the store fails even when its own
  // version is one the store has
  const higher = known.filter((version) => compareManifestVersions(version, manifestVersion) > 0);

  if (higher.length > 0) {
    throw new Error(
      `Chrome Web Store already has a higher version (${higher.join(', ')}) than ${manifestVersion} ` +
      `(${summary}). The store rejects a lower version, so check that package.json was not lowered.`
    );
  }

  if (known.includes(manifestVersion)) {
    return {
      submit: false,
      reason: `Chrome Web Store already has version ${manifestVersion} (${summary}). ` +
        'The extension code has not changed since that release, so nothing is submitted.'
    };
  }

  return { submit: true, reason: `Version ${manifestVersion} is new (${summary}).` };
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
  const decision = decideSubmission(packageVersion, fetchStatus);

  process.stdout.write(`${decision.submit ? 'Submitting' : 'Skipping submission'}: ${decision.reason}\n`);

  return {
    packageVersion,
    publishedCrxVersions: readPublishedCrxVersions(fetchStatus),
    submittedCrxVersions: readSubmittedCrxVersions(fetchStatus),
    ...decision
  };
}

// Tell the workflow whether to continue, and leave a note in the run summary
function reportToGithub({ submit, reason }) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `submit=${submit}\n`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${submit ? 'Submitting to' : 'Not submitting to'} the Chrome Web Store: ${reason}\n`
    );
  }
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
    .then(reportToGithub)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export const cliExecutionPromise = isEntryPoint(import.meta.url)
  ? runCli()
  : undefined;
