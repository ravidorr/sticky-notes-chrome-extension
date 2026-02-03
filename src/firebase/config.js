/**
 * Firebase Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project (or use existing)
 * 3. Enable Authentication > Google Sign-In provider
 * 4. Enable Cloud Firestore database
 * 5. Copy your project's Firebase config and replace the values below
 * 6. Add your extension ID to the authorized domains in Firebase Console:
 *    - Go to Authentication > Settings > Authorized domains
 *    - Add: chrome-extension://<YOUR_EXTENSION_ID>
 *
 * NOTE: Firebase SDK imports are lazy-loaded inside initializeFirebase()
 * to avoid blocking extension startup with SDK parsing.
 */

import { firestoreLogger as log } from '../shared/logger.js';
import { getFirebaseConfig, isConfigValid, isFirebaseConfigured } from './config-env.js';

// Firebase configuration - loaded from environment variables
const firebaseConfig = getFirebaseConfig();

// Initialize Firebase
let app = null;
let auth = null;
let db = null;

/**
 * Detect if running in a service worker context
 * Service workers don't have access to localStorage, which Firestore persistence requires
 * @returns {boolean} True if running in a service worker
 */
function isServiceWorker() {
  return typeof ServiceWorkerGlobalScope !== 'undefined' && 
         self instanceof ServiceWorkerGlobalScope;
}

/**
 * Initialize Firebase services with lazy-loaded SDK
 * @param {Object} options - Optional configuration
 * @param {Object} options.config - Override Firebase config (for testing)
 * @param {Object} options.deps - Override Firebase SDK dependencies (for testing)
 * @returns {Promise<Object>} Firebase instances { app, auth, db }
 */
export async function initializeFirebase(options = {}) {
  const config = options.config || firebaseConfig;

  if (!isConfigValid(config)) {
    log.warn('Firebase is not configured. Please update src/firebase/config.js with your Firebase project credentials.');
    return { app: null, auth: null, db: null };
  }

  if (!app) {
    // Lazy-load Firebase SDK modules only when needed
    // This keeps the SDK out of the initial bundle parse
    const deps = options.deps || await loadFirebaseDeps();

    app = deps.initializeApp(config);

    // Use initializeAuth with explicit persistence for faster startup
    // Service workers use indexedDB only; browser contexts can use both
    const inServiceWorker = isServiceWorker();
    try {
      if (inServiceWorker) {
        // Service workers: use only indexedDB persistence (no localStorage)
        auth = deps.initializeAuth(app, {
          persistence: [deps.indexedDBLocalPersistence]
        });
        log.info('Running in service worker - using indexedDB persistence for Auth');
      } else {
        // Browser contexts: use both for faster restoration
        auth = deps.initializeAuth(app, {
          persistence: [deps.indexedDBLocalPersistence, deps.browserLocalPersistence]
        });
      }
    } catch (_error) {
      // If auth was already initialized, this will throw
      // Fall back to getting the existing instance
      log.debug('Auth already initialized, using existing instance');
      auth = deps.getAuth(app);
    }

    // Initialize Firestore with appropriate cache based on environment
    // Service workers don't have localStorage, so we use memory cache there
    try {
      if (inServiceWorker) {
        // Use memory cache for service workers (no localStorage available)
        log.info('Running in service worker - using memory cache for Firestore');
        db = deps.initializeFirestore(app, {
          localCache: deps.memoryLocalCache()
        });
      } else {
        // Use persistent cache for regular contexts (popup, content scripts)
        db = deps.initializeFirestore(app, {
          localCache: deps.persistentLocalCache({
            tabManager: deps.persistentSingleTabManager({
              forceOwnership: false
            })
          })
        });
      }
    } catch (error) {
      // If Firestore was already initialized (e.g., in another tab), fall back to default
      if (error.code === 'failed-precondition') {
        log.error('Firestore persistence: Using existing instance');
        db = deps.getFirestore(app);
      } else {
        log.error('Firestore initialization error:', error);
        db = deps.getFirestore(app);
      }
    }
  }

  return { app, auth, db };
}

/**
 * Lazy-load Firebase SDK dependencies
 * This keeps the Firebase SDK out of the initial parse/eval
 * @returns {Promise<Object>} Firebase SDK functions
 */
async function loadFirebaseDeps() {
  const [appModule, authModule, firestoreModule] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore')
  ]);

  return {
    initializeApp: appModule.initializeApp,
    initializeAuth: authModule.initializeAuth,
    getAuth: authModule.getAuth,
    indexedDBLocalPersistence: authModule.indexedDBLocalPersistence,
    browserLocalPersistence: authModule.browserLocalPersistence,
    initializeFirestore: firestoreModule.initializeFirestore,
    getFirestore: firestoreModule.getFirestore,
    persistentLocalCache: firestoreModule.persistentLocalCache,
    persistentSingleTabManager: firestoreModule.persistentSingleTabManager,
    memoryLocalCache: firestoreModule.memoryLocalCache
  };
}

/**
 * Reset Firebase instances (primarily for testing)
 */
export function resetFirebase() {
  app = null;
  auth = null;
  db = null;
}

export { auth, db };
export { getFirebaseConfig, isConfigValid, isFirebaseConfigured };
