/**
 * Firebase Authentication Service
 * Handles Google Sign-In using chrome.identity API
 */

import { 
  signInWithCredential, 
  GoogleAuthProvider,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth, isFirebaseConfigured, initializeFirebase } from './config.js';
import { firestoreLogger as log } from '../shared/logger.js';

/**
 * Get OAuth client ID from environment
 * @returns {string} OAuth client ID
 */
export function getOAuthClientId() {
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';
  }
  return import.meta.env.VITE_OAUTH_CLIENT_ID || 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';
}

/**
 * Check if auth is configured
 * @param {Object} deps - Optional dependencies for testing
 * @returns {boolean}
 */
export function isAuthConfigured(deps = {}) {
  const clientId = deps.getOAuthClientId ? deps.getOAuthClientId() : getOAuthClientId();
  const firebaseConfigured = deps.isFirebaseConfigured ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  return clientId !== 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com' && firebaseConfigured;
}

/**
 * Get OAuth token using chrome.identity
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<string|null>} OAuth token
 */
export async function getOAuthToken(deps = {}) {
  const chromeIdentity = deps.chromeIdentity || chrome.identity;
  const chromeRuntime = deps.chromeRuntime || chrome.runtime;
  
  return new Promise((resolve, reject) => {
    chromeIdentity.getAuthToken({ interactive: true }, (token) => {
      if (chromeRuntime.lastError) {
        console.error('OAuth error:', chromeRuntime.lastError);
        reject(new Error(chromeRuntime.lastError.message));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Sign in with Google using chrome.identity
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Object>} User object
 */
export async function signInWithGoogle(deps = {}) {
  const logger = deps.log || log;
  const chromeStorage = deps.chromeStorage || chrome.storage;
  const authConfigured = deps.isAuthConfigured !== undefined ? deps.isAuthConfigured : isAuthConfigured(deps);
  
  if (!authConfigured) {
    // Return mock user for local development
    const mockUser = {
      uid: 'local-user-' + Date.now(),
      displayName: 'Local User',
      email: 'local@example.com',
      photoURL: null
    };
    
    await chromeStorage.local.set({ user: mockUser });
    return mockUser;
  }
  
  // Initialize Firebase if not already
  const initFn = deps.initializeFirebase || initializeFirebase;
  initFn();
  
  try {
    // Get OAuth token using chrome.identity
    const getTokenFn = deps.getOAuthToken || getOAuthToken;
    const token = await getTokenFn(deps);
    
    if (!token) {
      throw new Error('Failed to get OAuth token');
    }
    
    // Create credential and sign in to Firebase
    const GoogleProvider = deps.GoogleAuthProvider || GoogleAuthProvider;
    const signInFn = deps.signInWithCredential || signInWithCredential;
    const authInstance = deps.auth || auth;
    
    const credential = GoogleProvider.credential(null, token);
    const userCredential = await signInFn(authInstance, credential);
    
    const user = {
      uid: userCredential.user.uid,
      displayName: userCredential.user.displayName,
      email: userCredential.user.email,
      photoURL: userCredential.user.photoURL
    };
    
    // Store user in local storage
    await chromeStorage.local.set({ user });
    
    return user;
  } catch (error) {
    logger.error('Sign in error:', error);
    throw error;
  }
}

/**
 * Revoke OAuth token
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<void>}
 */
export async function revokeOAuthToken(deps = {}) {
  const chromeIdentity = deps.chromeIdentity || chrome.identity;
  const fetchFn = deps.fetch || fetch;
  
  return new Promise((resolve) => {
    chromeIdentity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chromeIdentity.removeCachedAuthToken({ token }, () => {
          // Optionally revoke the token on Google's servers
          fetchFn(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
            .finally(resolve);
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Sign out
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function signOut(deps = {}) {
  const logger = deps.log || log;
  const chromeStorage = deps.chromeStorage || chrome.storage;
  const authConfigured = deps.isAuthConfigured !== undefined ? deps.isAuthConfigured : isAuthConfigured(deps);
  const authInstance = deps.auth || auth;
  const signOutFn = deps.firebaseSignOut || firebaseSignOut;
  const revokeTokenFn = deps.revokeOAuthToken || revokeOAuthToken;
  
  try {
    // Sign out from Firebase if configured
    if (authConfigured && authInstance) {
      await signOutFn(authInstance);
    }
    
    // Revoke OAuth token if using chrome.identity
    if (authConfigured) {
      await revokeTokenFn(deps);
    }
    
    // Clear local storage
    await chromeStorage.local.remove(['user']);
  } catch (error) {
    logger.error('Sign out error:', error);
    throw error;
  }
}

/**
 * Get current user
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Object|null>} User object or null
 */
export async function getCurrentUser(deps = {}) {
  const chromeStorage = deps.chromeStorage || chrome.storage;
  const result = await chromeStorage.local.get(['user']);
  return result.user || null;
}
