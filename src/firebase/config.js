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
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore, 
  persistentLocalCache, 
  persistentSingleTabManager,
  memoryLocalCache
} from 'firebase/firestore';
import { firestoreLogger as log } from '../shared/logger.js';

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

// Firebase configuration - loaded from environment variables
const firebaseConfig = getFirebaseConfig();

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

/**
 * Check if Firebase is configured
 * @returns {boolean} True if Firebase is configured
 */
export function isFirebaseConfigured() {
  return isConfigValid(firebaseConfig);
}

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
 * Initialize Firebase services
 * @param {Object} options - Optional configuration
 * @param {Object} options.config - Override Firebase config (for testing)
 * @param {Object} options.deps - Override Firebase SDK dependencies (for testing)
 * @returns {Object} Firebase instances { app, auth, db }
 */
export function initializeFirebase(options = {}) {
  const config = options.config || firebaseConfig;
  const deps = options.deps || { 
    initializeApp, 
    getAuth, 
    initializeFirestore, 
    getFirestore, 
    persistentLocalCache, 
    persistentSingleTabManager,
    memoryLocalCache
  };
  
  if (!isConfigValid(config)) {
    log.warn('Firebase is not configured. Please update src/firebase/config.js with your Firebase project credentials.');
    return { app: null, auth: null, db: null };
  }
  
  if (!app) {
    app = deps.initializeApp(config);
    auth = deps.getAuth(app);
    
    // Initialize Firestore with appropriate cache based on environment
    // Service workers don't have localStorage, so we use memory cache there
    try {
      const inServiceWorker = isServiceWorker();
      
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
    } catch (err) {
      // If Firestore was already initialized (e.g., in another tab), fall back to default
      if (err.code === 'failed-precondition') {
        log.warn('Firestore persistence: Using existing instance');
        db = deps.getFirestore(app);
      } else {
        log.warn('Firestore initialization error:', err);
        db = deps.getFirestore(app);
      }
    }
  }
  
  return { app, auth, db };
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
