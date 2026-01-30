/**
 * Firebase Authentication Service
 * Handles Google Sign-In using chrome.identity API
 * Supports both Chrome (getAuthToken) and Edge (launchWebAuthFlow)
 */

import { 
  signInWithCredential, 
  GoogleAuthProvider,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth, isFirebaseConfigured, initializeFirebase } from './config.js';
import { firestoreLogger as log } from '../shared/logger.js';

/**
 * Detect if running in Edge browser
 * @returns {boolean}
 */
export function isEdgeBrowser() {
  if (typeof navigator === 'undefined') return false;
  
  // Use Client Hints API if available (more reliable)
  if (navigator.userAgentData?.brands) {
    return navigator.userAgentData.brands.some(brand => brand.brand === 'Microsoft Edge');
  }
  
  // Fallback to user agent string
  return navigator.userAgent.includes('Edg/');
}

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
 * Uses getAuthToken() for Chrome, launchWebAuthFlow() for Edge
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<string|null>} OAuth token
 */
export async function getOAuthToken(deps = {}) {
  const isEdge = deps.isEdgeBrowser !== undefined ? deps.isEdgeBrowser : isEdgeBrowser();
  
  if (isEdge) {
    return getOAuthTokenViaWebAuthFlow(deps);
  }
  return getOAuthTokenViaGetAuthToken(deps);
}

/**
 * Chrome: Use chrome.identity.getAuthToken()
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<string>} OAuth token
 */
async function getOAuthTokenViaGetAuthToken(deps = {}) {
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
 * Edge/Firefox: Use chrome.identity.launchWebAuthFlow()
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<string>} OAuth token
 */
async function getOAuthTokenViaWebAuthFlow(deps = {}) {
  const chromeIdentity = deps.chromeIdentity || chrome.identity;
  const getClientId = deps.getOAuthClientId || getOAuthClientId;
  const clientId = getClientId();
  
  // Get the redirect URL for this extension
  const redirectUrl = chromeIdentity.getRedirectURL();
  
  // Build Google OAuth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' '));
  
  // Launch the auth flow in a popup
  const responseUrl = await chromeIdentity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  });
  
  // Parse the access token from the redirect URL fragment
  const url = new URL(responseUrl);
  const hash = url.hash.substring(1); // Remove leading #
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  
  if (!accessToken) {
    throw new Error('No access token in OAuth response');
  }
  
  return accessToken;
}

/**
 * Sign in with Google using chrome.identity
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Object>} User object
 */
export async function signInWithGoogle(deps = {}) {
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
    log.error('Sign in error:', error);
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
  const isEdge = deps.isEdgeBrowser !== undefined ? deps.isEdgeBrowser : isEdgeBrowser();
  
  // Edge uses launchWebAuthFlow which doesn't cache tokens the same way
  // We can only clear any web auth flow cache
  if (isEdge) {
    try {
      // Clear any cached web auth flow (Edge/Firefox)
      await chromeIdentity.clearAllCachedAuthTokens?.();
    } catch {
      // clearAllCachedAuthTokens may not be available
    }
    return;
  }
  
  // Chrome: Use getAuthToken to retrieve and revoke cached token
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
    log.error('Sign out error:', error);
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
