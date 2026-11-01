/**
 * Authentication Middleware
 * Validates API keys and attaches user context to requests
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { API_KEY_PREFIX, hashApiKey, isValidApiKeyFormat, hasScope } from '../lib/apiKeys.js';

/**
 * Rate limiting store (in-memory for simplicity)
 * In production, consider using Redis or Firestore
 */
const rateLimitStore = new Map();

/**
 * Rate limit configuration
 */
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100
};

/**
 * How long a successful revocation check is trusted for one user. A disabled account or a
 * revoked session is locked out within this time, without a user lookup on every request.
 */
const REVOCATION_CHECK_TTL_MS = 60 * 1000;

/**
 * uid -> time of the last successful revocation check
 */
const revocationChecks = new Map();

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > RATE_LIMIT.windowMs) {
      rateLimitStore.delete(key);
    }
  }
  for (const [uid, checkedAt] of revocationChecks.entries()) {
    if (now - checkedAt >= REVOCATION_CHECK_TTL_MS) {
      revocationChecks.delete(uid);
    }
  }
}

// Cleanup every minute. unref() keeps this timer from holding a process (or a test run) open
setInterval(cleanupRateLimits, 60 * 1000).unref();

/**
 * Check rate limit for a key
 * @param {string} keyId - API key ID
 * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
 */
function checkRateLimit(keyId) {
  const now = Date.now();
  let data = rateLimitStore.get(keyId);
  
  if (!data || now - data.windowStart > RATE_LIMIT.windowMs) {
    data = { windowStart: now, count: 0 };
    rateLimitStore.set(keyId, data);
  }
  
  data.count++;
  const remaining = Math.max(0, RATE_LIMIT.maxRequests - data.count);
  const resetTime = data.windowStart + RATE_LIMIT.windowMs;
  
  return {
    allowed: data.count <= RATE_LIMIT.maxRequests,
    remaining,
    resetTime
  };
}

/**
 * Count a request against the rate limit and set the X-RateLimit headers.
 * Sends the 429 response itself when the limit is exceeded.
 * @param {Object} res - Express response
 * @param {string} id - Rate limit bucket (API key ID or user bucket)
 * @returns {boolean} True when the request may continue
 */
function enforceRateLimit(res, id) {
  const rateLimit = checkRateLimit(id);
  res.set('X-RateLimit-Limit', RATE_LIMIT.maxRequests.toString());
  res.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  res.set('X-RateLimit-Reset', Math.ceil(rateLimit.resetTime / 1000).toString());

  if (!rateLimit.allowed) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again later.',
      retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
    });
    return false;
  }
  return true;
}

/**
 * Extract API key from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} API key or null
 */
function extractApiKey(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  // Support "Bearer <key>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Support raw key
  return authHeader;
}

/**
 * API Key Authentication Middleware
 * Validates the API key and attaches user context to the request
 * 
 * @param {Object} options - Middleware options
 * @param {string} options.requiredScope - Required scope for this route
 * @returns {Function} Express middleware function
 */
export function apiKeyAuth(options = {}) {
  const { requiredScope } = options;
  
  return async (req, res, next) => {
    try {
      // Extract API key from header
      const apiKey = extractApiKey(req.headers.authorization);
      
      if (!apiKey) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'API key is required. Provide it via Authorization header.'
        });
      }
      
      // Validate key format
      if (!isValidApiKeyFormat(apiKey)) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid API key format'
        });
      }
      
      // Hash the key for lookup
      const keyHash = hashApiKey(apiKey);
      
      // Look up the key in Firestore
      const db = getFirestore();
      const keysRef = db.collection('apiKeys');
      const snapshot = await keysRef.where('keyHash', '==', keyHash).limit(1).get();
      
      if (snapshot.empty) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid API key'
        });
      }
      
      const keyDoc = snapshot.docs[0];
      const keyData = keyDoc.data();
      
      // Check if key is active
      if (!keyData.isActive) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'API key has been revoked'
        });
      }
      
      // Check rate limit
      if (!enforceRateLimit(res, keyDoc.id)) {
        return;
      }
      
      // Check required scope
      if (requiredScope && !hasScope(keyData.scopes, requiredScope)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `This API key does not have the required scope: ${requiredScope}`
        });
      }
      
      // Attach user context to request
      req.apiKey = {
        id: keyDoc.id,
        userId: keyData.userId,
        userEmail: keyData.userEmail,
        scopes: keyData.scopes,
        name: keyData.name
      };
      
      // Update last used timestamp (fire and forget)
      keyDoc.ref.update({ lastUsedAt: new Date() }).catch(() => {
        // Ignore errors - this is non-critical
      });
      
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed'
      });
    }
  };
}

/**
 * Firebase ID Token Authentication Middleware
 * Used for endpoints that require Firebase auth (like key generation)
 * 
 * @returns {Function} Express middleware function
 */
export function firebaseAuth() {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Firebase ID token is required'
        });
      }
      
      const idToken = authHeader.substring(7);
      
      const decodedToken = await getAuth().verifyIdToken(idToken);
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name
      };
      
      next();
    } catch (error) {
      console.error('Firebase auth error:', error);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired Firebase ID token'
      });
    }
  };
}

/**
 * Scopes granted to a signed-in user. The owner can already read and write all of their
 * own notes in the extension, so a Firebase session gets the same access as a full API key.
 */
const FIREBASE_USER_SCOPES = ['notes:read', 'notes:write'];

/**
 * Shape of a JWT (a Firebase ID token): three base64url segments
 */
const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

/**
 * Error codes of firebase-admin that mean the token itself is bad (401). Anything else, such as
 * a failed certificate fetch or a lookup error, is a server problem (500) and must not look like
 * an expired session to the dashboard.
 * @param {Error} error - Error thrown by verifyIdToken
 * @returns {boolean} True when the token is invalid, expired or revoked
 */
function isInvalidTokenError(error) {
  return typeof error?.code === 'string'
    && error.code.startsWith('auth/')
    && error.code !== 'auth/internal-error';
}

/**
 * Verify an ID token, checking for revocation unless it was checked recently for this user
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<Object>} Decoded token
 */
async function verifyFirebaseToken(idToken) {
  const auth = getAuth();
  const decodedToken = await auth.verifyIdToken(idToken, false);
  const checkedAt = revocationChecks.get(decodedToken.uid);

  if (checkedAt !== undefined && Date.now() - checkedAt < REVOCATION_CHECK_TTL_MS) {
    return decodedToken;
  }

  const checkedToken = await auth.verifyIdToken(idToken, true);
  revocationChecks.set(checkedToken.uid, Date.now());
  return checkedToken;
}

/**
 * API key or Firebase ID token authentication
 *
 * The dashboard signs in with Google and sends a Firebase ID token, while the MCP server,
 * scripts and curl send an API key. A Bearer value that starts with the API key prefix, and
 * anything that is not shaped like a JWT, is handled by apiKeyAuth. A JWT is verified as a
 * Firebase ID token. Both paths fill req.apiKey with the same shape, so the route handlers
 * do not care which one was used.
 *
 * @param {Object} options - Middleware options
 * @param {string} options.requiredScope - Required scope for this route
 * @returns {Function} Express middleware function
 */
export function apiKeyOrFirebaseAuth(options = {}) {
  const checkApiKey = apiKeyAuth(options);

  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const credential = extractApiKey(authHeader);

    // A missing header, a raw key, an API key and anything that cannot be an ID token stay on
    // the API key path, so its messages and behavior are unchanged for those callers.
    // (A truthy credential means the header is a string)
    if (
      !credential
      || !authHeader.startsWith('Bearer ')
      || credential.startsWith(API_KEY_PREFIX)
      || !JWT_PATTERN.test(credential)
    ) {
      return checkApiKey(req, res, next);
    }

    let decodedToken;
    try {
      decodedToken = await verifyFirebaseToken(credential);
    } catch (error) {
      if (isInvalidTokenError(error)) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired Firebase ID token'
        });
      }
      console.error('Firebase token verification error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed'
      });
    }

    // Notes are shared by email, so only a verified address may stand in for the owner
    if (!decodedToken.email || decodedToken.email_verified !== true) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'A verified email address is required'
      });
    }

    if (!enforceRateLimit(res, `user:${decodedToken.uid}`)) {
      return;
    }

    req.apiKey = {
      id: null,
      userId: decodedToken.uid,
      userEmail: decodedToken.email.toLowerCase(),
      scopes: FIREBASE_USER_SCOPES,
      name: decodedToken.name || decodedToken.email.toLowerCase(),
      authMethod: 'firebase'
    };

    return next();
  };
}
