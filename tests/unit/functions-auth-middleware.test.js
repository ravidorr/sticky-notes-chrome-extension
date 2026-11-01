/**
 * Unit tests for functions/middleware/auth.js
 * API key auth, Firebase ID token auth, and the combined middleware used by the notes routes
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockLimit = jest.fn(() => ({ get: mockGet }));
const mockWhere = jest.fn(() => ({ limit: mockLimit }));
const mockCollection = jest.fn(() => ({ where: mockWhere }));
const mockVerifyIdToken = jest.fn();

jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: mockCollection }),
  FieldValue: {}
}));

jest.unstable_mockModule('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken })
}));

// The module starts a cleanup timer on import. The shared jsdom setup hands back a numeric timer id,
// so capture the callback with a Node-like timer and run the cleanup by hand
let runCleanup;
let unrefCalled = false;
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (callback) => {
  runCleanup = callback;
  return { unref: () => { unrefCalled = true; } };
};
const { apiKeyAuth, firebaseAuth, apiKeyOrFirebaseAuth } = await import('../../functions/middleware/auth.js');
globalThis.setInterval = realSetInterval;
const { generateApiKey } = await import('../../functions/lib/apiKeys.js');

const realNow = Date.now.bind(Date);

function createRes() {
  const res = {
    headers: {},
    statusCode: null,
    body: null
  };
  res.set = jest.fn((name, value) => {
    res.headers[name] = value;
    return res;
  });
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

function createReq(authorization) {
  return { headers: authorization === undefined ? {} : { authorization } };
}

function keySnapshot(overrides = {}) {
  return {
    empty: false,
    docs: [{
      id: 'key-1',
      data: () => ({
        userId: 'user-1',
        userEmail: 'owner@example.com',
        scopes: ['notes:read'],
        name: 'CI key',
        isActive: true,
        ...overrides
      }),
      ref: { update: mockUpdate }
    }]
  };
}

// The middleware remembers a revocation check per uid, so each test gets its own user by default
let uidCounter = 0;
const JWT = 'header.payload.signature';

function verifiedToken(overrides = {}) {
  uidCounter += 1;
  return {
    uid: `uid-${uidCounter}`,
    email: 'Dash.User@Example.com',
    email_verified: true,
    name: 'Dash User',
    ...overrides
  };
}

describe('functions/middleware/auth.js', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
    localThis.next = jest.fn();
    localThis.res = createRes();
    localThis.apiKey = generateApiKey().key;
    jest.restoreAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('apiKeyAuth', () => {
    const run = (authorization, options) => apiKeyAuth(options)(createReq(authorization), localThis.res, localThis.next);

    it('rejects a request without a key', async () => {
      await run(undefined);

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toMatch(/API key is required/);
      expect(localThis.next).not.toHaveBeenCalled();
    });

    it('rejects a key with the wrong format', async () => {
      await run('Bearer not-a-key');

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('Invalid API key format');
    });

    it('rejects an unknown key', async () => {
      mockGet.mockResolvedValue({ empty: true, docs: [] });

      await run(`Bearer ${localThis.apiKey}`);

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('Invalid API key');
    });

    it('rejects a revoked key', async () => {
      mockGet.mockResolvedValue(keySnapshot({ isActive: false }));

      await run(`Bearer ${localThis.apiKey}`);

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('API key has been revoked');
    });

    it('rejects a key without the required scope', async () => {
      mockGet.mockResolvedValue(keySnapshot({ scopes: ['notes:read'] }));

      await run(`Bearer ${localThis.apiKey}`, { requiredScope: 'notes:write' });

      expect(localThis.res.statusCode).toBe(403);
      expect(localThis.res.body.message).toMatch(/notes:write/);
    });

    it('attaches the owner and calls next for a valid Bearer key', async () => {
      const req = createReq(`Bearer ${localThis.apiKey}`);
      mockGet.mockResolvedValue(keySnapshot());

      await apiKeyAuth({ requiredScope: 'notes:read' })(req, localThis.res, localThis.next);

      expect(req.apiKey).toEqual({
        id: 'key-1',
        userId: 'user-1',
        userEmail: 'owner@example.com',
        scopes: ['notes:read'],
        name: 'CI key'
      });
      expect(localThis.next).toHaveBeenCalledTimes(1);
      expect(localThis.res.headers['X-RateLimit-Limit']).toBe('100');
      expect(mockUpdate).toHaveBeenCalledWith({ lastUsedAt: expect.any(Date) });
    });

    it('accepts a raw key without the Bearer prefix and with no required scope', async () => {
      mockGet.mockResolvedValue(keySnapshot());

      await run(localThis.apiKey);

      expect(localThis.next).toHaveBeenCalledTimes(1);
    });

    it('ignores a failed lastUsedAt update', async () => {
      mockGet.mockResolvedValue(keySnapshot());
      mockUpdate.mockRejectedValue(new Error('write failed'));

      await run(`Bearer ${localThis.apiKey}`);
      await Promise.resolve();

      expect(localThis.next).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when the lookup throws', async () => {
      mockGet.mockRejectedValue(new Error('firestore down'));

      await run(`Bearer ${localThis.apiKey}`);

      expect(localThis.res.statusCode).toBe(500);
      expect(localThis.res.body.message).toBe('Authentication failed');
    });

    it('returns 429 after 100 requests in a window and recovers after the window', async () => {
      mockGet.mockResolvedValue(keySnapshot({ userId: 'rate-user' }));
      const limited = apiKeyAuth();

      for (let i = 0; i < 100; i += 1) {
        await limited(createReq(`Bearer ${localThis.apiKey}`), createRes(), jest.fn());
      }
      await limited(createReq(`Bearer ${localThis.apiKey}`), localThis.res, localThis.next);

      expect(localThis.res.statusCode).toBe(429);
      expect(localThis.res.body.retryAfter).toBeGreaterThan(0);
      expect(localThis.next).not.toHaveBeenCalled();

      // The cleanup drops the expired window, so the key works again
      jest.spyOn(Date, 'now').mockReturnValue(realNow() + 2 * 60 * 1000);
      runCleanup();
      const res = createRes();
      await limited(createReq(`Bearer ${localThis.apiKey}`), res, localThis.next);

      expect(res.statusCode).toBeNull();
      expect(localThis.next).toHaveBeenCalledTimes(1);
    });

    it('keeps a rate limit window that has not expired when the cleanup runs', async () => {
      mockGet.mockResolvedValue(keySnapshot());

      await run(`Bearer ${localThis.apiKey}`);
      runCleanup();

      expect(localThis.next).toHaveBeenCalledTimes(1);
      expect(unrefCalled).toBe(true);
    });
  });

  describe('firebaseAuth', () => {
    const run = (authorization) => firebaseAuth()(createReq(authorization), localThis.res, localThis.next);

    it('rejects a missing header', async () => {
      await run(undefined);

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('Firebase ID token is required');
    });

    it('rejects a header that is not a Bearer token', async () => {
      await run('Basic abc');

      expect(localThis.res.statusCode).toBe(401);
    });

    it('rejects an invalid token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('bad token'));

      await run('Bearer bad');

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('Invalid or expired Firebase ID token');
    });

    it('attaches the user for a valid token', async () => {
      const req = createReq('Bearer good');
      mockVerifyIdToken.mockResolvedValue(verifiedToken());

      await firebaseAuth()(req, localThis.res, localThis.next);

      expect(mockVerifyIdToken).toHaveBeenCalledWith('good');
      expect(req.user).toEqual({ uid: 'uid-1', email: 'Dash.User@Example.com', name: 'Dash User' });
      expect(localThis.next).toHaveBeenCalledTimes(1);
    });
  });

  describe('apiKeyOrFirebaseAuth', () => {
    const run = (authorization, options = { requiredScope: 'notes:read' }) => {
      const req = createReq(authorization);
      return apiKeyOrFirebaseAuth(options)(req, localThis.res, localThis.next).then(() => req);
    };

    it('sends an API key to the API key path unchanged', async () => {
      mockGet.mockResolvedValue(keySnapshot());

      const req = await run(`Bearer ${localThis.apiKey}`);

      expect(mockVerifyIdToken).not.toHaveBeenCalled();
      expect(req.apiKey.id).toBe('key-1');
      expect(localThis.next).toHaveBeenCalledTimes(1);
    });

    it('keeps the API key scope check for API keys', async () => {
      mockGet.mockResolvedValue(keySnapshot({ scopes: ['notes:read'] }));

      await run(`Bearer ${localThis.apiKey}`, { requiredScope: 'notes:write' });

      expect(localThis.res.statusCode).toBe(403);
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it('sends a raw key without the Bearer prefix to the API key path', async () => {
      mockGet.mockResolvedValue(keySnapshot());

      await run(localThis.apiKey);

      expect(mockVerifyIdToken).not.toHaveBeenCalled();
      expect(localThis.next).toHaveBeenCalledTimes(1);
    });

    it('rejects a missing header with the API key message', async () => {
      await run(undefined);

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toMatch(/API key is required/);
    });

    it('rejects a non-Bearer header that is not an API key', async () => {
      await run('Basic abc');

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('Invalid API key format');
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it('accepts a valid ID token and fills req.apiKey with the same shape as a key', async () => {
      mockVerifyIdToken.mockResolvedValue(verifiedToken({ uid: 'uid-fixed' }));

      const req = await run(`Bearer ${JWT}`);

      expect(req.apiKey).toEqual({
        id: null,
        userId: 'uid-fixed',
        userEmail: 'dash.user@example.com',
        scopes: ['notes:read', 'notes:write'],
        name: 'Dash User',
        authMethod: 'firebase'
      });
      expect(localThis.next).toHaveBeenCalledTimes(1);
      expect(localThis.res.headers['X-RateLimit-Limit']).toBe('100');
    });

    it('falls back to the email when the token has no display name', async () => {
      mockVerifyIdToken.mockResolvedValue(verifiedToken({ name: undefined }));

      const req = await run(`Bearer ${JWT}`);

      expect(req.apiKey.name).toBe('dash.user@example.com');
    });

    it('checks revocation on the first request of a user, for read and write routes alike', async () => {
      mockVerifyIdToken.mockResolvedValue(verifiedToken());

      await run(`Bearer ${JWT}`, { requiredScope: 'notes:read' });

      expect(mockVerifyIdToken).toHaveBeenNthCalledWith(1, JWT, false);
      expect(mockVerifyIdToken).toHaveBeenNthCalledWith(2, JWT, true);
      expect(localThis.next).toHaveBeenCalledTimes(1);
    });

    it('checks revocation when no scope is required', async () => {
      mockVerifyIdToken.mockResolvedValue(verifiedToken());

      await apiKeyOrFirebaseAuth()(createReq(`Bearer ${JWT}`), localThis.res, localThis.next);

      expect(mockVerifyIdToken).toHaveBeenCalledWith(JWT, true);
    });

    it('does not repeat the revocation lookup within a minute, and does again after it', async () => {
      const token = verifiedToken();
      mockVerifyIdToken.mockResolvedValue(token);
      const now = realNow();
      const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);

      await run(`Bearer ${JWT}`);
      mockVerifyIdToken.mockClear();
      dateNow.mockReturnValue(now + 30 * 1000);
      await run(`Bearer ${JWT}`);

      expect(mockVerifyIdToken).toHaveBeenCalledTimes(1);
      expect(mockVerifyIdToken).toHaveBeenCalledWith(JWT, false);

      mockVerifyIdToken.mockClear();
      dateNow.mockReturnValue(now + 61 * 1000);
      await run(`Bearer ${JWT}`);

      expect(mockVerifyIdToken).toHaveBeenCalledWith(JWT, true);
    });

    it('locks a user out once the revocation check fails', async () => {
      const token = verifiedToken();
      mockVerifyIdToken.mockImplementation((_jwt, checkRevoked) => (
        checkRevoked
          ? Promise.reject(Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }))
          : Promise.resolve(token)
      ));

      await run(`Bearer ${JWT}`);

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.next).not.toHaveBeenCalled();
    });

    it('drops old revocation checks when the cleanup runs', async () => {
      const token = verifiedToken();
      mockVerifyIdToken.mockResolvedValue(token);
      const now = realNow();
      const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
      await run(`Bearer ${JWT}`);

      dateNow.mockReturnValue(now + 2 * 60 * 1000);
      runCleanup();
      mockVerifyIdToken.mockClear();
      await run(`Bearer ${JWT}`);

      expect(mockVerifyIdToken).toHaveBeenCalledWith(JWT, true);
    });

    it('keeps a recent revocation check when the cleanup runs', async () => {
      const token = verifiedToken();
      mockVerifyIdToken.mockResolvedValue(token);
      await run(`Bearer ${JWT}`);

      runCleanup();
      mockVerifyIdToken.mockClear();
      await run(`Bearer ${JWT}`);

      expect(mockVerifyIdToken).toHaveBeenCalledTimes(1);
    });

    it('sends a Bearer value that is not shaped like an ID token to the API key path', async () => {
      await run('Bearer not-a-token');

      expect(mockVerifyIdToken).not.toHaveBeenCalled();
      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('Invalid API key format');
    });

    it.each([
      'auth/argument-error',
      'auth/id-token-expired',
      'auth/id-token-revoked',
      'auth/invalid-id-token',
      'auth/user-disabled',
      'auth/user-not-found'
    ])('rejects a token that fails with %s using 401', async (code) => {
      mockVerifyIdToken.mockRejectedValue(Object.assign(new Error('bad token'), { code }));

      await run(`Bearer ${JWT}`, { requiredScope: 'notes:write' });

      expect(localThis.res.statusCode).toBe(401);
      expect(localThis.res.body.message).toBe('Invalid or expired Firebase ID token');
      expect(localThis.next).not.toHaveBeenCalled();
    });

    it.each([
      ['an error without a code', new Error('network down')],
      ['an error with a non-string code', Object.assign(new Error('odd'), { code: 500 })],
      ['a non-auth error code', Object.assign(new Error('app'), { code: 'app/network-error' })],
      ['an internal auth error', Object.assign(new Error('boom'), { code: 'auth/internal-error' })],
      ['a credential error', Object.assign(new Error('creds'), { code: 'auth/invalid-credential' })],
      ['a permission error', Object.assign(new Error('iam'), { code: 'auth/insufficient-permission' })]
    ])('returns 500 and logs %s, so a backend problem does not look like an expired session', async (_name, error) => {
      mockVerifyIdToken.mockRejectedValue(error);

      await run(`Bearer ${JWT}`);

      expect(localThis.res.statusCode).toBe(500);
      expect(localThis.res.body.message).toBe('Authentication failed');
      expect(console.error).toHaveBeenCalledWith('Firebase token verification error:', error);
      expect(localThis.next).not.toHaveBeenCalled();
    });

    it('returns 500 when the thrown value is not an object', async () => {
      mockVerifyIdToken.mockRejectedValue(undefined);

      await run(`Bearer ${JWT}`);

      expect(localThis.res.statusCode).toBe(500);
    });

    it('rejects a token whose email is not verified', async () => {
      mockVerifyIdToken.mockResolvedValue(verifiedToken({ email_verified: false }));

      await run(`Bearer ${JWT}`);

      expect(localThis.res.statusCode).toBe(403);
      expect(localThis.next).not.toHaveBeenCalled();
    });

    it('rejects a token with no email', async () => {
      mockVerifyIdToken.mockResolvedValue(verifiedToken({ email: undefined }));

      await run(`Bearer ${JWT}`);

      expect(localThis.res.statusCode).toBe(403);
    });

    it('rate limits a signed-in user by uid', async () => {
      mockVerifyIdToken.mockResolvedValue(verifiedToken({ uid: 'busy-user' }));
      const limited = apiKeyOrFirebaseAuth({ requiredScope: 'notes:read' });

      for (let i = 0; i < 100; i += 1) {
        await limited(createReq(`Bearer ${JWT}`), createRes(), jest.fn());
      }
      await limited(createReq(`Bearer ${JWT}`), localThis.res, localThis.next);

      expect(localThis.res.statusCode).toBe(429);
      expect(localThis.next).not.toHaveBeenCalled();
    });
  });
});
