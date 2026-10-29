/**
 * Submits a package to Microsoft Edge Add-ons through the Publish API (v1.1,
 * API key authentication). Used by .github/workflows/publish-edge-addons.yml.
 *
 * Flow: upload the package to the draft of the existing product, poll the upload
 * operation until it finishes, publish the draft submission, poll that operation.
 *
 * https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
 * https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference
 *
 * The credentials only travel in request headers and are never printed.
 *
 * Time bound: every request has its own timeout, and all API work together
 * (requests, waits and polling) stops at OVERALL_DEADLINE_MS. The workflow job
 * has a longer timeout, so this script reports the failure itself.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { isEntryPoint } from './is-entry-point.mjs';
import { createChromeManifestVersion } from './manifest-version.mjs';

export const DEFAULT_API_BASE_URL = 'https://api.addons.microsoftedge.microsoft.com';
export const MAX_ATTEMPTS = 5;
export const MIN_RETRY_DELAY_MS = 1_000;
export const INITIAL_RETRY_DELAY_MS = 30_000;
export const MAX_RETRY_DELAY_MS = 240_000;
export const POLL_INTERVAL_MS = 10_000;
export const MAX_POLLS = 60;
export const REQUEST_TIMEOUT_MS = 60_000;
export const UPLOAD_TIMEOUT_MS = 300_000;
export const OVERALL_DEADLINE_MS = 25 * 60_000;

const NOTHING_TO_PUBLISH = 'NoModulesUpdated';
const IN_REVIEW = 'InProgressSubmission';
const START_NEW_RUN = 'start a new run with Run workflow on main';

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class EdgeApiError extends Error {
  constructor(message, { phase, operationId, outcomeUnknown = false } = {}) {
    super(message);
    this.name = 'EdgeApiError';
    this.phase = phase;
    this.operationId = operationId;
    this.outcomeUnknown = outcomeUnknown;
  }
}

/**
 * The Location header holds the operation ID. Accept a bare ID or a path or URL
 * that ends in it.
 */
export function parseOperationId(location) {
  if (typeof location !== 'string') {
    return null;
  }

  const [path] = location.trim().split(/[?#]/);
  const segments = path.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

// Retry-After is seconds, or a date; anything unusable returns null
export function parseRetryAfterMs(value, now = Date.now()) {
  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value.trim())) {
    return Number(value) * 1000;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function clampRetryDelayMs(ms) {
  return Math.min(Math.max(ms, MIN_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);
}

function describeFailure(status, body) {
  const text = body.length > 500 ? `${body.slice(0, 500)}...` : body;

  if (status === 401) {
    return `HTTP 401: the Client ID or API key was rejected. The API key may have expired; create a new one on the Publish API page in Partner Center and update the EDGE_API_KEY secret. ${text}`;
  }

  if (status === 404) {
    return `HTTP 404: the product ID or operation was not found. Check the EDGE_PRODUCT_ID variable. ${text}`;
  }

  return `HTTP ${status}: ${text}`;
}

function describeNetworkError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'request timed out';
  }

  const detail = error?.cause?.code ?? error?.cause?.message ?? error?.message ?? String(error);
  return `network error: ${detail}`;
}

/**
 * Creates an API client. fetchImpl, sleep and now are injectable for tests.
 */
export function createEdgeClient({
  clientId,
  apiKey,
  productId,
  baseUrl = DEFAULT_API_BASE_URL,
  fetchImpl = fetch,
  sleep = sleepFor,
  now = Date.now,
  log = (line) => process.stdout.write(`${line}\n`)
}) {
  const headers = { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId };
  const startedAt = now();
  const remainingMs = () => OVERALL_DEADLINE_MS - (now() - startedAt);

  function ensureTime(label, context) {
    if (remainingMs() <= 0) {
      throw new EdgeApiError(
        `Edge Add-ons ${label} ran out of time (${Math.round(OVERALL_DEADLINE_MS / 60000)} minutes for all API work).`,
        context
      );
    }
  }

  // Retries HTTP 429, 408, 5xx, timeouts and network failures (including a
  // connection that drops while the body is read) with a growing wait, the
  // Retry-After header when there is one. A request that must not be repeated
  // after an unclear failure sets retryUnclear to false: only 429 is retried then,
  // because 429 proves the API did not process it.
  async function request(label, method, path, {
    body, contentType, timeoutMs = REQUEST_TIMEOUT_MS, retryUnclear = true, context = {}
  } = {}) {
    let delay = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      ensureTime(label, context);

      let result;
      let failure;
      let unclear = true;

      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: contentType ? { ...headers, 'Content-Type': contentType } : headers,
          body,
          signal: AbortSignal.timeout(Math.min(timeoutMs, Math.max(remainingMs(), 1)))
        });
        const text = await response.text();

        if (response.status < 300) {
          result = { status: response.status, headers: response.headers, text };
        } else if (response.status === 429 || response.status === 408 || response.status >= 500) {
          failure = describeFailure(response.status, text);
          unclear = response.status !== 429;
          const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
          if (retryAfter !== null) {
            delay = clampRetryDelayMs(retryAfter);
          }
        } else {
          throw new EdgeApiError(`Edge Add-ons ${label} failed. ${describeFailure(response.status, text)}`, context);
        }
      } catch (error) {
        if (error instanceof EdgeApiError) {
          throw error;
        }
        failure = describeNetworkError(error);
      }

      if (result) {
        return result;
      }

      if (unclear && !retryUnclear) {
        throw new EdgeApiError(
          `Edge Add-ons ${label} failed (${failure}). Whether the request was processed is unknown: ` +
          'check Partner Center before starting another run.',
          { ...context, outcomeUnknown: true }
        );
      }

      if (attempt === MAX_ATTEMPTS) {
        throw new EdgeApiError(
          `Edge Add-ons ${label} failed after ${MAX_ATTEMPTS} attempts (${failure}). ${START_NEW_RUN[0].toUpperCase()}${START_NEW_RUN.slice(1)} later.`,
          context
        );
      }

      log(`Edge Add-ons ${label}: ${failure}. Attempt ${attempt} of ${MAX_ATTEMPTS}, retrying in ${Math.round(delay / 1000)}s.`);
      await sleep(delay);
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
    }

    throw new EdgeApiError(`Edge Add-ons ${label} failed.`, context);
  }

  async function startOperation(label, path, options) {
    const { status, headers: responseHeaders } = await request(label, 'POST', path, options);
    const operationId = parseOperationId(responseHeaders.get('location'));

    if (!operationId) {
      throw new EdgeApiError(
        `Edge Add-ons ${label} was accepted (HTTP ${status}) but returned no operation ID (Location: ${responseHeaders.get('location') ?? 'none'}). ` +
        'Whether it succeeded is unknown: check Partner Center before starting another run.',
        { ...options.context, outcomeUnknown: true }
      );
    }

    return operationId;
  }

  // Resolves with the final operation body (Succeeded or Failed)
  async function pollOperation(label, path, context) {
    for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
      const { text } = await request(`${label} status`, 'GET', path, { context });
      let operation;
      try {
        operation = JSON.parse(text);
      } catch {
        operation = null;
      }

      if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
        throw new EdgeApiError(`Edge Add-ons ${label} status was not a JSON object: ${text.slice(0, 200)}`, context);
      }

      if (operation.status === 'Succeeded' || operation.status === 'Failed') {
        return operation;
      }

      if (operation.status !== 'InProgress') {
        throw new EdgeApiError(
          `Edge Add-ons ${label} returned an unexpected status: ${JSON.stringify(operation).slice(0, 300)}`,
          context
        );
      }

      ensureTime(label, context);
      await sleep(POLL_INTERVAL_MS);
    }

    throw new EdgeApiError(
      `Edge Add-ons ${label} did not finish within ${Math.round((MAX_POLLS * POLL_INTERVAL_MS) / 60000)} minutes.`,
      context
    );
  }

  // A failure after the request was accepted does not mean nothing happened
  function afterAccepted(error, label, operationId) {
    if (!(error instanceof EdgeApiError)) {
      throw error;
    }

    throw new EdgeApiError(
      `The ${label} request was accepted (operation ${operationId}) but its outcome is unknown: ${error.message} ` +
      'Check Partner Center before starting another run.',
      { phase: error.phase, operationId, outcomeUnknown: true }
    );
  }

  function failedOperation(label, operation, advice) {
    if (operation.errorCode === IN_REVIEW) {
      return new EdgeApiError(
        'An earlier submission is still in review at Edge Add-ons, so this version was not submitted. ' +
        `${advice} Wait for the review to finish (or cancel it in Partner Center), then ${START_NEW_RUN}.`
      );
    }

    return new EdgeApiError(
      `Edge Add-ons could not ${label}: ${operation.message ?? 'no message'} ` +
      `[${operation.errorCode ?? 'no error code'}] ${JSON.stringify(operation.errors ?? [])}`
    );
  }

  return {
    async uploadPackage(packageBytes) {
      const context = { phase: 'upload' };
      const operationId = await startOperation(
        'package upload',
        `/v1/products/${productId}/submissions/draft/package`,
        { body: packageBytes, contentType: 'application/zip', timeoutMs: UPLOAD_TIMEOUT_MS, context }
      );
      log(`Package upload accepted (operation ${operationId}).`);

      let operation;
      try {
        operation = await pollOperation(
          'package upload',
          `/v1/products/${productId}/submissions/draft/package/operations/${operationId}`,
          { phase: 'upload', operationId }
        );
      } catch (error) {
        afterAccepted(error, 'package upload', operationId);
      }

      if (operation.status === 'Failed') {
        if (operation.errorCode === IN_REVIEW) {
          throw failedOperation('upload the package', operation, 'The package was not uploaded to the draft.');
        }
        throw new EdgeApiError(
          `Edge Add-ons rejected the package: ${operation.message ?? 'no message'} ` +
          `[${operation.errorCode ?? 'no error code'}] ${JSON.stringify(operation.errors ?? [])}`,
          { phase: 'upload', operationId }
        );
      }

      log(operation.message ?? 'Package upload succeeded.');
    },

    // Returns {published, nothingNew, message}. Nothing to publish is not an error here;
    // the caller decides what it means.
    async publishDraft(notes) {
      // Not repeated after a 5xx, a timeout or a network error: the API may have
      // created the submission, and a second one would fail or duplicate it
      const operationId = await startOperation(
        'publish',
        `/v1/products/${productId}/submissions`,
        {
          body: JSON.stringify({ notes }),
          contentType: 'application/json',
          retryUnclear: false,
          context: { phase: 'publish' }
        }
      );
      log(`Publish accepted (operation ${operationId}).`);

      let operation;
      try {
        operation = await pollOperation(
          'publish',
          `/v1/products/${productId}/submissions/operations/${operationId}`,
          { phase: 'publish', operationId }
        );
      } catch (error) {
        afterAccepted(error, 'publish', operationId);
      }

      if (operation.status === 'Succeeded') {
        return { published: true, nothingNew: false, message: operation.message ?? 'Submission created.' };
      }

      if (operation.errorCode === NOTHING_TO_PUBLISH) {
        return {
          published: false,
          nothingNew: true,
          message: 'Edge Add-ons found nothing new to publish: the draft equals the current submission.'
        };
      }

      const error = failedOperation('publish', operation, 'The new package is already in the Partner Center draft.');
      error.phase = 'publish';
      error.operationId = operationId;
      throw error;
    }
  };
}

export async function publishToEdge({ packageBytes, notes, ...clientOptions }) {
  const client = createEdgeClient(clientOptions);
  await client.uploadPackage(packageBytes);
  return client.publishDraft(notes);
}

// Workflow commands are one line: escape what would end or change one
export function escapeAnnotation(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function readFileOrHint(path, hint) {
  try {
    return readFileSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new EdgeApiError(`${path} does not exist. ${hint}`);
    }
    throw error;
  }
}

/**
 * Checks that the built package is the version of package.json, so a stale or
 * wrong build is never uploaded.
 *
 * @returns {string} The manifest version
 */
export function readBuiltVersion({ packageJsonPath, manifestPath }) {
  const hint = 'Did npm run build:edge run?';
  const packageVersion = JSON.parse(readFileOrHint(packageJsonPath, hint).toString('utf8')).version;
  const manifestVersion = JSON.parse(readFileOrHint(manifestPath, hint).toString('utf8')).version;
  const expected = createChromeManifestVersion(packageVersion);

  if (manifestVersion !== expected) {
    throw new EdgeApiError(
      `${manifestPath} has version ${manifestVersion}, but package.json (${packageVersion}) gives ${expected}. ` +
      'The build is stale or from another commit, so it is not uploaded.'
    );
  }

  return manifestVersion;
}

function report(summary) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}

async function runCli() {
  const { EDGE_CLIENT_ID, EDGE_API_KEY, EDGE_PRODUCT_ID } = process.env;
  const packagePath = process.env.PACKAGE_PATH ?? 'dist/edge.zip';
  const manifestPath = process.env.MANIFEST_PATH ?? 'dist/edge/manifest.json';
  const packageJsonPath = process.env.PACKAGE_JSON_PATH ?? 'package.json';
  const manual = process.env.EVENT_NAME === 'workflow_dispatch';

  if (!EDGE_CLIENT_ID || !EDGE_API_KEY || !EDGE_PRODUCT_ID) {
    console.error('EDGE_CLIENT_ID, EDGE_API_KEY and EDGE_PRODUCT_ID are required.');
    process.exit(1);
  }

  try {
    const version = readBuiltVersion({ packageJsonPath, manifestPath });
    const packageBytes = readFileOrHint(packagePath, 'Did npm run build:edge run?');
    const notes = process.env.PUBLISH_NOTES ?? `Automated release ${version} from GitHub Actions.`;

    const result = await publishToEdge({
      clientId: EDGE_CLIENT_ID,
      apiKey: EDGE_API_KEY,
      productId: EDGE_PRODUCT_ID,
      baseUrl: process.env.EDGE_API_BASE_URL || DEFAULT_API_BASE_URL,
      packageBytes,
      notes
    });

    if (result.published) {
      process.stdout.write(`${result.message}\n`);
      report(`Edge Add-ons: SUBMITTED version ${version}. ${result.message}`);
      return;
    }

    const message = `Version ${version}: ${result.message}`;
    if (manual) {
      console.error(`::error::${escapeAnnotation(`${message} A manual run was asked to submit it.`)}`);
      report(`Edge Add-ons: FAILED, nothing to publish. ${message}`);
      process.exit(1);
    }

    process.stdout.write(`::warning::${escapeAnnotation(message)}\n`);
    report(`Edge Add-ons: SKIPPED, nothing new to publish. ${message}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${escapeAnnotation(message)}`);
    report(`Edge Add-ons: FAILED. ${message}`);
    process.exit(1);
  }
}

export const cliExecutionPromise = isEntryPoint(import.meta.url)
  ? runCli()
  : undefined;
