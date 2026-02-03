/**
 * Firebase Configuration (Environment Only)
 *
 * This module intentionally avoids importing the Firebase SDK so it can be
 * safely loaded in lightweight contexts (e.g., service worker startup).
 */

/**
 * Get Firebase config from environment variables
 * Separated for testability
 * @returns {Object} Firebase configuration object
 */
export function getFirebaseConfig() {
  // Handle case where import.meta.env is undefined (e.g., in test environment)
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return {
      apiKey: undefined,
      authDomain: undefined,
      projectId: undefined,
      storageBucket: undefined,
      messagingSenderId: undefined,
      appId: undefined
    };
  }

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
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

