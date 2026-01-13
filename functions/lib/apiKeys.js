/**
 * API Key Management
 * Handles generation, hashing, and validation of API keys
 */

import { createHash, randomBytes } from 'crypto';

/**
 * API Key prefix for identification
 */
export const API_KEY_PREFIX = 'sk_live_';

/**
 * Length of the random portion of the key
 */
const KEY_LENGTH = 32;

/**
 * Valid scopes for API keys
 */
export const VALID_SCOPES = ['notes:read', 'notes:write'];

/**
 * Generate a new API key
 * @returns {Object} { key: string, hash: string, prefix: string }
 */
export function generateApiKey() {
  const randomPart = randomBytes(KEY_LENGTH).toString('hex');
  const key = `${API_KEY_PREFIX}${randomPart}`;
  const hash = hashApiKey(key);
  const prefix = key.substring(0, API_KEY_PREFIX.length + 8);
  
  return { key, hash, prefix };
}

/**
 * Hash an API key for storage
 * Uses SHA-256 for secure one-way hashing
 * @param {string} key - The API key to hash
 * @returns {string} Hashed key
 */
export function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate API key format
 * @param {string} key - API key to validate
 * @returns {boolean} True if valid format
 */
export function isValidApiKeyFormat(key) {
  if (!key || typeof key !== 'string') return false;
  if (!key.startsWith(API_KEY_PREFIX)) return false;
  
  const randomPart = key.substring(API_KEY_PREFIX.length);
  // Should be 64 hex characters (32 bytes)
  if (randomPart.length !== KEY_LENGTH * 2) return false;
  if (!/^[a-f0-9]+$/i.test(randomPart)) return false;
  
  return true;
}

/**
 * Validate scopes array
 * @param {string[]} scopes - Scopes to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateScopes(scopes) {
  const errors = [];
  
  if (!Array.isArray(scopes)) {
    return { valid: false, errors: ['Scopes must be an array'] };
  }
  
  if (scopes.length === 0) {
    return { valid: false, errors: ['At least one scope is required'] };
  }
  
  for (const scope of scopes) {
    if (!VALID_SCOPES.includes(scope)) {
      errors.push(`Invalid scope: ${scope}. Valid scopes are: ${VALID_SCOPES.join(', ')}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check if a key has a specific scope
 * @param {string[]} keyScopes - Scopes the key has
 * @param {string} requiredScope - Scope to check for
 * @returns {boolean} True if key has the scope
 */
export function hasScope(keyScopes, requiredScope) {
  return Array.isArray(keyScopes) && keyScopes.includes(requiredScope);
}

/**
 * Create API key document for Firestore
 * @param {Object} options - Key options
 * @param {string} options.userId - Owner's user ID
 * @param {string} options.name - Key name/description
 * @param {string[]} options.scopes - Key scopes
 * @param {string} options.hash - Hashed key
 * @param {string} options.prefix - Key prefix for display
 * @returns {Object} Firestore document data
 */
export function createApiKeyDocument({ userId, name, scopes, hash, prefix }) {
  return {
    userId,
    name: name || 'API Key',
    scopes,
    keyHash: hash,
    keyPrefix: prefix,
    createdAt: new Date(),
    lastUsedAt: null,
    isActive: true
  };
}
