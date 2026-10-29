import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  API_BASE_URL,
  EdgeApiError,
  MAX_ATTEMPTS,
  MAX_POLLS,
  createEdgeClient,
  parseOperationId,
  parseRetryAfterMs,
  publishToEdge
} from './publish-edge-addons.mjs';

const respond = (status, { body = '', headers = {} } = {}) =>
  new Response(body, { status, headers });

const json = (status, body) => respond(status, { body: JSON.stringify(body) });

// Replays queued responses (or errors) and records every request and wait
function stub(queue) {
  const requests = [];
  const waits = [];
  const logs = [];
  const client = createEdgeClient({
    clientId: 'client-id',
    apiKey: 'secret-key',
    productId: 'product-1',
    fetchImpl: async (url, init) => {
      requests.push({ url, method: init.method, headers: init.headers, body: init.body });
      const next = queue.shift();
      if (!next) {
        throw new Error(`Unexpected request ${init.method} ${url}`);
      }
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    sleep: async (ms) => {
      waits.push(ms);
    },
    log: (line) => logs.push(line)
  });
  return { client, requests, waits, logs };
}

const accepted = (operation) => respond(202, { headers: { Location: operation } });
const progress = () => json(200, { status: 'InProgress' });

describe('parseOperationId', () => {
  it('takes the last path segment and ignores a query', () => {
    assert.equal(parseOperationId('abc-123'), 'abc-123');
    assert.equal(parseOperationId('/v1/products/p/submissions/operations/abc-123'), 'abc-123');
    assert.equal(parseOperationId(`${API_BASE_URL}/v1/x/abc-123?api-version=1`), 'abc-123');
  });

  it('returns null without a usable value', () => {
    assert.equal(parseOperationId(null), null);
    assert.equal(parseOperationId(''), null);
  });
});

describe('parseRetryAfterMs', () => {
  it('reads seconds and dates', () => {
    assert.equal(parseRetryAfterMs('12'), 12000);
    assert.equal(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:10 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')), 10000);
  });

  it('returns null for nothing or junk', () => {
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs('soon'), null);
  });
});

describe('uploadPackage', () => {
  it('uploads, polls until the operation succeeds, and sends the credentials as headers', async () => {
    const { client, requests, waits } = stub([
      accepted('op-1'),
      progress(),
      json(200, { status: 'Succeeded', message: 'Successfully updated package' })
    ]);

    await client.uploadPackage(Buffer.from('zip'));

    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url, `${API_BASE_URL}/v1/products/product-1/submissions/draft/package`);
    assert.equal(requests[0].headers['Content-Type'], 'application/zip');
    assert.equal(requests[0].headers.Authorization, 'ApiKey secret-key');
    assert.equal(requests[0].headers['X-ClientID'], 'client-id');
    assert.equal(requests[1].method, 'GET');
    assert.equal(requests[1].url, `${API_BASE_URL}/v1/products/product-1/submissions/draft/package/operations/op-1`);
    assert.equal(requests.length, 3);
    assert.equal(waits.length, 1);
  });

  it('fails with the message when the package is rejected', async () => {
    const { client } = stub([
      accepted('op-1'),
      json(200, { status: 'Failed', message: 'Bad manifest', errorCode: 'Invalid', errors: ['x'] })
    ]);

    await assert.rejects(client.uploadPackage(Buffer.from('zip')), /rejected the package: Bad manifest \[Invalid\]/);
  });

  it('fails when no operation ID comes back', async () => {
    const { client } = stub([respond(202)]);
    await assert.rejects(client.uploadPackage(Buffer.from('zip')), /did not return an operation ID/);
  });

  it('stops polling after the limit', async () => {
    const { client, requests } = stub([accepted('op-1'), ...Array.from({ length: MAX_POLLS }, progress)]);

    await assert.rejects(client.uploadPackage(Buffer.from('zip')), /did not finish within/);
    assert.equal(requests.length, 1 + MAX_POLLS);
  });

  it('fails on an unexpected status', async () => {
    const { client } = stub([accepted('op-1'), json(200, { status: 'Weird' })]);
    await assert.rejects(client.uploadPackage(Buffer.from('zip')), /unexpected status/);
  });
});

describe('retries', () => {
  it('waits and retries on 429, using Retry-After when present', async () => {
    const { client, waits, logs } = stub([
      respond(429, { headers: { 'Retry-After': '7' } }),
      respond(429),
      accepted('op-1'),
      json(200, { status: 'Succeeded' })
    ]);

    await client.uploadPackage(Buffer.from('zip'));

    assert.deepEqual(waits, [7000, 14000]);
    assert.match(logs[0], /HTTP 429/);
    assert.match(logs[0], /Attempt 1 of 5/);
  });

  it('backs off 30, 60, 120, 240 seconds and then fails clearly', async () => {
    const { client, waits, requests } = stub(Array.from({ length: MAX_ATTEMPTS }, () => respond(429)));

    await assert.rejects(
      client.uploadPackage(Buffer.from('zip')),
      /failed after 5 attempts \(HTTP 429.*Re-run the workflow later/
    );
    assert.deepEqual(waits, [30000, 60000, 120000, 240000]);
    assert.equal(requests.length, MAX_ATTEMPTS);
  });

  it('retries a 5xx and a network error', async () => {
    const { client, waits } = stub([
      respond(503),
      new Error('socket hang up'),
      accepted('op-1'),
      json(200, { status: 'Succeeded' })
    ]);

    await client.uploadPackage(Buffer.from('zip'));
    assert.equal(waits.length, 2);
  });

  it('does not retry other client errors, and explains a 401 and a 404', async () => {
    const unauthorized = stub([respond(401, { body: 'nope' })]);
    await assert.rejects(unauthorized.client.uploadPackage(Buffer.from('zip')), /API key may have expired/);
    assert.equal(unauthorized.requests.length, 1);

    const missing = stub([respond(404)]);
    await assert.rejects(missing.client.uploadPackage(Buffer.from('zip')), /EDGE_PRODUCT_ID/);

    const bad = stub([respond(400, { body: 'bad zip' })]);
    await assert.rejects(bad.client.uploadPackage(Buffer.from('zip')), (error) => {
      assert.ok(error instanceof EdgeApiError);
      assert.match(error.message, /HTTP 400: bad zip/);
      return true;
    });
  });

  it('never prints the API key', async () => {
    const { client, logs } = stub([respond(429), accepted('op-1'), json(200, { status: 'Succeeded' })]);
    await client.uploadPackage(Buffer.from('zip'));
    assert.equal(logs.join('\n').includes('secret-key'), false);
  });
});

describe('publishDraft', () => {
  it('publishes with notes and polls the submission operation', async () => {
    const { client, requests } = stub([
      accepted('op-2'),
      progress(),
      json(200, { status: 'Succeeded', message: 'Successfully created submission with ID 9' })
    ]);

    const result = await client.publishDraft('Release 1.20.16');

    assert.equal(result.published, true);
    assert.match(result.message, /submission with ID 9/);
    assert.equal(requests[0].url, `${API_BASE_URL}/v1/products/product-1/submissions`);
    assert.equal(requests[0].body, JSON.stringify({ notes: 'Release 1.20.16' }));
    assert.equal(requests[1].url, `${API_BASE_URL}/v1/products/product-1/submissions/operations/op-2`);
  });

  it('treats "nothing new to publish" as a clean finish', async () => {
    const { client } = stub([accepted('op-2'), json(200, { status: 'Failed', errorCode: 'NoModulesUpdated' })]);
    const result = await client.publishDraft('n');
    assert.equal(result.published, false);
    assert.match(result.message, /nothing new to publish/);
  });

  it('fails clearly when a submission is already in review', async () => {
    const { client } = stub([accepted('op-2'), json(200, { status: 'Failed', errorCode: 'InProgressSubmission' })]);
    await assert.rejects(client.publishDraft('n'), /still in review.*not submitted/);
  });

  it('fails with the details for any other failure', async () => {
    const { client } = stub([
      accepted('op-2'),
      json(200, { status: 'Failed', message: 'Fix these', errorCode: 'SubmissionValidationError', errors: ['e1'] })
    ]);
    await assert.rejects(client.publishDraft('n'), /could not publish: Fix these \[SubmissionValidationError\] \["e1"\]/);
  });
});

describe('publishToEdge', () => {
  it('uploads, then publishes', async () => {
    const queue = [
      accepted('up-1'),
      json(200, { status: 'Succeeded' }),
      accepted('pub-1'),
      json(200, { status: 'Succeeded', message: 'done' })
    ];
    const requests = [];
    const result = await publishToEdge({
      clientId: 'c',
      apiKey: 'k',
      productId: 'p',
      packageBytes: Buffer.from('zip'),
      notes: 'n',
      fetchImpl: async (url, init) => {
        requests.push(`${init.method} ${url.replace(API_BASE_URL, '')}`);
        return queue.shift();
      },
      sleep: async () => {},
      log: () => {}
    });

    assert.equal(result.published, true);
    assert.deepEqual(requests, [
      'POST /v1/products/p/submissions/draft/package',
      'GET /v1/products/p/submissions/draft/package/operations/up-1',
      'POST /v1/products/p/submissions',
      'GET /v1/products/p/submissions/operations/pub-1'
    ]);
  });

  it('does not publish when the upload fails', async () => {
    const requests = [];
    await assert.rejects(publishToEdge({
      clientId: 'c',
      apiKey: 'k',
      productId: 'p',
      packageBytes: Buffer.from('zip'),
      notes: 'n',
      fetchImpl: async (url, init) => {
        requests.push(init.method);
        return accepted('up-1').status === 202 && requests.length === 1
          ? accepted('up-1')
          : json(200, { status: 'Failed', message: 'bad' });
      },
      sleep: async () => {},
      log: () => {}
    }), /rejected the package/);
    assert.deepEqual(requests, ['POST', 'GET']);
  });
});
