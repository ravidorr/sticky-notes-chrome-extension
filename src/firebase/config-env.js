/**
 * Firebase Configuration (Environment Only)
 *
 * This module intentionally avoids importing the Firebase SDK so it can be
 * safely loaded in lightweight contexts (e.g., service worker startup).
 */

/**
 * Build a Firebase config object from a Vite env object
 * @param {Object} [env] - import.meta.env, undefined outside a Vite build
 * @returns {Object} Firebase configuration object
 */
export function buildFirebaseConfig(env) {
  return {
    apiKey: env?.VITE_FIREBASE_API_KEY,
    authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env?.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env?.VITE_FIREBASE_APP_ID
  };
}

/**
 * Get Firebase config from environment variables
 * Separated for testability
 * @returns {Object} Firebase configuration object
 */
export function getFirebaseConfig() {
  // import.meta.env is undefined in the test environment
  return buildFirebaseConfig(import.meta.env);
}

/**
 * Check if a config object represents a valid Firebase configuration
 * @param {Object} config - Firebase config object
 * @returns {boolean} True if configured
 */
export function isConfigValid(config) {
  if (!config || !config.apiKey) {
    return false;
  }
  // Check for placeholder values
  if (config.apiKey.includes('your_') || config.apiKey === 'YOUR_API_KEY') {
    return false;
  }
  return true;
}

// Firebase configuration - loaded from environment variables
const firebaseConfig = getFirebaseConfig();

/**
 * Check if Firebase is configured
 * @returns {boolean} True if Firebase is configured
 */
export function isFirebaseConfigured() {
  return isConfigValid(firebaseConfig);
}

