/**
 * The Firebase web config the extension is built with.
 *
 * Without it the extension signs in as a local mock user and never reaches
 * Google or Firestore (see signInWithGoogle in src/firebase/auth.js). The values
 * come from .env on a developer machine, so a build that runs in CI has none
 * unless the release workflows pass them in. A release build asks for them
 * with REQUIRE_FIREBASE_CONFIG=true and fails instead of shipping the mock.
 */

export const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

// .env.example uses placeholders such as your_api_key
const PLACEHOLDER = /your_/i;

/**
 * @param {Object<string, string|undefined>} env - Vite env values (VITE_ prefix)
 * @returns {string[]} Names of the required values that are missing or still placeholders
 */
export function missingFirebaseEnv(env) {
  return REQUIRED_FIREBASE_ENV.filter((name) => !env[name] || PLACEHOLDER.test(env[name]));
}
