/**
 * Authentication Middleware
 * Validates API keys and attaches user context to requests
 */

import { getFirestore } from 'firebase-admin/firestore';
import { hashApiKey, isValidApiKeyFormat, hasScope } from '../lib/apiKeys.js';

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
 * Clean up old rate limit entries
 */
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > RATE_LIMIT.windowMs) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every minute
setInterval(cleanupRateLimits, 60 * 1000);

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
      const rateLimit = checkRateLimit(keyDoc.id);
      res.set('X-RateLimit-Limit', RATE_LIMIT.maxRequests.toString());
      res.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
      res.set('X-RateLimit-Reset', Math.ceil(rateLimit.resetTime / 1000).toString());
      
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Try again later.',
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
        });
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
      
      // Import here to avoid circular dependencies
      const { getAuth } = await import('firebase-admin/auth');
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
