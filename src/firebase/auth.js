/**
 * Firebase Authentication Service
 * Handles Google Sign-In using chrome.identity API
 */

import { 
  signInWithCredential, 
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, isFirebaseConfigured, initializeFirebase } from './config.js';

// OAuth client ID from Google Cloud Console
// Must be configured in manifest.json oauth2 section
const OAUTH_CLIENT_ID = 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';

/**
 * Check if auth is configured
 * @returns {boolean}
 */
export function isAuthConfigured() {
  return OAUTH_CLIENT_ID !== 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com' && isFirebaseConfigured();
}

/**
 * Sign in with Google using chrome.identity
 * @returns {Promise<Object>} User object
 */
export async function signInWithGoogle() {
  if (!isAuthConfigured()) {
    // Return mock user for local development
    const mockUser = {
      uid: 'local-user-' + Date.now(),
      displayName: 'Local User',
      email: 'local@example.com',
      photoURL: null
    };
    
    await chrome.storage.local.set({ user: mockUser });
    return mockUser;
  }
  
  // Initialize Firebase if not already
  initializeFirebase();
  
  try {
    // Get OAuth token using chrome.identity
    const token = await getOAuthToken();
    
    if (!token) {
      throw new Error('Failed to get OAuth token');
    }
    
    // Create credential and sign in to Firebase
    const credential = GoogleAuthProvider.credential(null, token);
    const userCredential = await signInWithCredential(auth, credential);
    
    const user = {
      uid: userCredential.user.uid,
      displayName: userCredential.user.displayName,
      email: userCredential.user.email,
      photoURL: userCredential.user.photoURL
    };
    
    // Store user in local storage
    await chrome.storage.local.set({ user });
    
    return user;
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
}

/**
 * Get OAuth token using chrome.identity
 * @returns {Promise<string|null>} OAuth token
 */
async function getOAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('OAuth error:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Sign out
 * @returns {Promise<void>}
 */
export async function signOut() {
  try {
    // Sign out from Firebase if configured
    if (isAuthConfigured() && auth) {
      await firebaseSignOut(auth);
    }
    
    // Revoke OAuth token if using chrome.identity
    if (isAuthConfigured()) {
      await revokeOAuthToken();
    }
    
    // Clear local storage
    await chrome.storage.local.remove(['user']);
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

/**
 * Revoke OAuth token
 * @returns {Promise<void>}
 */
async function revokeOAuthToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          // Optionally revoke the token on Google's servers
          fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
            .finally(resolve);
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get current user
 * @returns {Promise<Object|null>} User object or null
 */
export async function getCurrentUser() {
  const result = await chrome.storage.local.get(['user']);
  return result.user || null;
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Callback function(user)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAuthState(callback) {
  if (isAuthConfigured() && auth) {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const user = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL
        };
        callback(user);
      } else {
        callback(null);
      }
    });
  }
  
  // For local development, check storage
  const checkStorage = async () => {
    const user = await getCurrentUser();
    callback(user);
  };
  
  checkStorage();
  
  // Listen to storage changes
  const listener = (changes, area) => {
    if (area === 'local' && changes.user) {
      callback(changes.user.newValue || null);
    }
  };
  
  chrome.storage.onChanged.addListener(listener);
  
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

/**
 * Lookup user by email
 * This is a placeholder - in production, you'd need a backend API
 * or Cloud Functions to lookup users by email
 * @param {string} email - Email to lookup
 * @returns {Promise<Object|null>} User info or null
 */
export async function lookupUserByEmail(email) {
  // In production, this would call a Cloud Function
  // For now, we'll store and lookup from a users collection
  console.warn('lookupUserByEmail requires Cloud Functions for production use');
  return null;
}
