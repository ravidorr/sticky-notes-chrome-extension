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
 */

import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { isEntryPoint } from './is-entry-point.mjs';

export const API_BASE_URL = 'https://api.addons.microsoftedge.microsoft.com';
export const MAX_ATTEMPTS = 5;
export const INITIAL_RETRY_DELAY_MS = 30_000;
export const MAX_RETRY_DELAY_MS = 240_000;
export const POLL_INTERVAL_MS = 10_000;
export const MAX_POLLS = 60;

// The Edge API answers this when the draft equals what is already submitted
const NOTHING_TO_PUBLISH = 'NoModulesUpdated';

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class EdgeApiError extends Error {}

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

// Retry-After is seconds, or a date; anything unusable falls back to the backoff
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

/**
 * Creates an API client. fetchImpl and sleep are injectable for tests.
 */
export function createEdgeClient({
  clientId,
  apiKey,
  productId,
  fetchImpl = fetch,
  sleep = sleepFor,
  log = (line) => process.stdout.write(`${line}\n`)
}) {
  const headers = { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId };

  // Retries HTTP 429, 5xx and network failures with a growing wait (the
  // Retry-After header when there is one), then fails with the last error
  async function request(label, method, path, { body, contentType } = {}) {
    let delay = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response;
      let failure;

      try {
        response = await fetchImpl(`${API_BASE_URL}${path}`, {
          method,
          headers: contentType ? { ...headers, 'Content-Type': contentType } : headers,
          body
        });
      } catch (error) {
        failure = `network error: ${error instanceof Error ? error.message : String(error)}`;
      }

      if (response) {
        const text = await response.text();

        if (response.status < 300) {
          return { status: response.status, headers: response.headers, text };
        }

        if (response.status !== 429 && response.status < 500) {
          throw new EdgeApiError(`Edge Add-ons ${label} failed. ${describeFailure(response.status, text)}`);
        }

        failure = describeFailure(response.status, text);
        const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
        if (retryAfter !== null) {
          delay = Math.min(Math.max(retryAfter, 1000), MAX_RETRY_DELAY_MS);
        }
      }

      if (attempt === MAX_ATTEMPTS) {
        throw new EdgeApiError(
          `Edge Add-ons ${label} failed after ${MAX_ATTEMPTS} attempts (${failure}). ` +
          'Nothing more was submitted. Re-run the workflow later.'
        );
      }

      log(`Edge Add-ons ${label}: ${failure}. Attempt ${attempt} of ${MAX_ATTEMPTS}, retrying in ${Math.round(delay / 1000)}s.`);
      await sleep(delay);
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
    }

    throw new EdgeApiError(`Edge Add-ons ${label} failed.`);
  }

  async function startOperation(label, path, options) {
    const { status, headers: responseHeaders } = await request(label, 'POST', path, options);
    const operationId = parseOperationId(responseHeaders.get('location'));

    if (status !== 202 || !operationId) {
      throw new EdgeApiError(
        `Edge Add-ons ${label} did not return an operation ID (HTTP ${status}, Location: ${responseHeaders.get('location') ?? 'none'}).`
      );
    }

    return operationId;
  }

  // Resolves with the final operation body (Succeeded or Failed)
  async function pollOperation(label, path) {
    for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
      const { text } = await request(`${label} status`, 'GET', path);
      let operation;
      try {
        operation = JSON.parse(text);
      } catch {
        throw new EdgeApiError(`Edge Add-ons ${label} status was not JSON: ${text.slice(0, 200)}`);
      }

      if (operation.status === 'Succeeded' || operation.status === 'Failed') {
        return operation;
      }

      if (operation.status !== 'InProgress') {
        throw new EdgeApiError(`Edge Add-ons ${label} returned an unexpected status: ${JSON.stringify(operation).slice(0, 300)}`);
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new EdgeApiError(
      `Edge Add-ons ${label} did not finish within ${Math.round((MAX_POLLS * POLL_INTERVAL_MS) / 60000)} minutes.`
    );
  }

  return {
    async uploadPackage(packageBytes) {
      const operationId = await startOperation(
        'package upload',
        `/v1/products/${productId}/submissions/draft/package`,
        { body: packageBytes, contentType: 'application/zip' }
      );
      log(`Package upload accepted (operation ${operationId}).`);

      const operation = await pollOperation(
        'package upload',
        `/v1/products/${productId}/submissions/draft/package/operations/${operationId}`
      );

      if (operation.status === 'Failed') {
        throw new EdgeApiError(
          `Edge Add-ons rejected the package: ${operation.message ?? 'no message'} ` +
          `[${operation.errorCode ?? 'no error code'}] ${JSON.stringify(operation.errors ?? [])}`
        );
      }

      log(operation.message ?? 'Package upload succeeded.');
    },

    // Returns {published: boolean, message}. Nothing to publish is not an error.
    async publishDraft(notes) {
      const operationId = await startOperation(
        'publish',
        `/v1/products/${productId}/submissions`,
        { body: JSON.stringify({ notes }), contentType: 'application/json' }
      );
      log(`Publish accepted (operation ${operationId}).`);

      const operation = await pollOperation(
        'publish',
        `/v1/products/${productId}/submissions/operations/${operationId}`
      );

      if (operation.status === 'Succeeded') {
        return { published: true, message: operation.message ?? 'Submission created.' };
      }

      if (operation.errorCode === NOTHING_TO_PUBLISH) {
        return {
          published: false,
          message: 'Edge Add-ons has nothing new to publish: the draft equals the current submission.'
        };
      }

      if (operation.errorCode === 'InProgressSubmission') {
        throw new EdgeApiError(
          'An earlier submission is still in review at Edge Add-ons, so this version was not submitted. ' +
          'Re-run the workflow once the review finishes, or cancel the earlier submission in Partner Center.'
        );
      }

      throw new EdgeApiError(
        `Edge Add-ons could not publish: ${operation.message ?? 'no message'} ` +
        `[${operation.errorCode ?? 'no error code'}] ${JSON.stringify(operation.errors ?? [])}`
      );
    }
  };
}

export async function publishToEdge({ packageBytes, notes, ...clientOptions }) {
  const client = createEdgeClient(clientOptions);
  await client.uploadPackage(packageBytes);
  return client.publishDraft(notes);
}

async function runCli() {
  const { EDGE_CLIENT_ID, EDGE_API_KEY, EDGE_PRODUCT_ID } = process.env;
  const packagePath = process.env.PACKAGE_PATH ?? 'dist/edge.zip';
  const notes = process.env.PUBLISH_NOTES ?? 'Automated release from GitHub Actions.';

  if (!EDGE_CLIENT_ID || !EDGE_API_KEY || !EDGE_PRODUCT_ID) {
    console.error('EDGE_CLIENT_ID, EDGE_API_KEY and EDGE_PRODUCT_ID are required.');
    process.exit(1);
  }

  try {
    const result = await publishToEdge({
      clientId: EDGE_CLIENT_ID,
      apiKey: EDGE_API_KEY,
      productId: EDGE_PRODUCT_ID,
      packageBytes: readFileSync(packagePath),
      notes
    });

    process.stdout.write(`${result.message}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Edge Add-ons: ${result.message}\n`);
    }
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export const cliExecutionPromise = isEntryPoint(import.meta.url)
  ? runCli()
  : undefined;
