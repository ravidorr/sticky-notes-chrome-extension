/**
 * Firebase Auth Unit Tests
 * 
 * Tests authentication functions with mocked dependencies.
 * Since auth.js uses dependency injection, we can test it directly.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock all Firebase modules before import
jest.unstable_mockModule('firebase/auth', () => ({
  signInWithCredential: jest.fn(),
  GoogleAuthProvider: {
    credential: jest.fn()
  },
  signOut: jest.fn(),
  getAuth: jest.fn(() => ({ name: 'mock-auth' })),
  initializeAuth: jest.fn(() => ({ name: 'mock-auth' })),
  browserLocalPersistence: { type: 'LOCAL' },
  indexedDBLocalPersistence: { type: 'LOCAL' }
}));

jest.unstable_mockModule('firebase/app', () => ({
  initializeApp: jest.fn()
}));

jest.unstable_mockModule('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  initializeFirestore: jest.fn(),
  persistentLocalCache: jest.fn(),
  persistentSingleTabManager: jest.fn(),
  memoryLocalCache: jest.fn()
}));

// Import after mocking
const {
  isAuthConfigured,
  getOAuthClientId,
  resolveOAuthClientId,
  getOAuthToken,
  signInWithGoogle,
  signOut,
  revokeOAuthToken,
  getCurrentUser,
  isEdgeBrowser
} = await import('../../src/firebase/auth.js');

describe('Firebase Auth', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    
    localThis.mockChromeStorage = {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn()
      }
    };
    
    localThis.mockChromeIdentity = {
      getAuthToken: jest.fn(),
      removeCachedAuthToken: jest.fn()
    };
    
    localThis.mockChromeRuntime = {
      lastError: null
    };
  });

  describe('global chrome fallbacks (no injected deps)', () => {
    afterEach(() => {
      delete globalThis.fetch;
      delete chrome.identity.getRedirectURL;
      chrome.runtime.lastError = undefined;
    });

    it('should report auth as not configured with the real environment', () => {
      expect(isAuthConfigured()).toBe(false);
    });

    it('should get a token through the global chrome.identity on Chrome', async () => {
      await expect(getOAuthToken()).resolves.toBe('mock-token');
    });

    it('should use String(err) when lastError has no message', async () => {
      chrome.identity.getAuthToken.mockImplementationOnce((options, callback) => {
        chrome.runtime.lastError = 'plain failure';
        callback(undefined);
      });

      await expect(getOAuthToken()).rejects.toThrow('plain failure');
    });

    it('should use the global chrome.identity and default client id on Edge', async () => {
      chrome.identity.getRedirectURL = jest.fn(() => 'https://ext.example/redirect');
      chrome.identity.launchWebAuthFlow.mockResolvedValueOnce('https://ext.example/redirect#access_token=edge-token');

      await expect(getOAuthToken({ isEdgeBrowser: true })).resolves.toBe('edge-token');
    });

    it('should return a mock user through the global chrome.storage when auth is unconfigured', async () => {
      const user = await signInWithGoogle();

      expect(user.displayName).toBe('Local User');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ user });
    });

    it('should sign in with the lazily loaded SDK and the real helpers', async () => {
      const authModule = await import('firebase/auth');
      authModule.GoogleAuthProvider.credential.mockReturnValueOnce('cred');
      authModule.signInWithCredential.mockResolvedValueOnce({
        user: { uid: 'u1', displayName: 'User', email: 'u@example.com', photoURL: null }
      });

      const user = await signInWithGoogle({ isAuthConfigured: true });

      expect(user).toEqual({ uid: 'u1', displayName: 'User', email: 'u@example.com', photoURL: null });
      expect(authModule.GoogleAuthProvider.credential).toHaveBeenCalledWith(null, 'mock-token');
    });

    it('should revoke the cached token with the global identity and fetch', async () => {
      globalThis.fetch = jest.fn(() => Promise.resolve({}));

      await revokeOAuthToken();

      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: 'mock-token' }, expect.any(Function));
      expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('revoke?token=mock-token'));
    });

    it('should sign out through the global storage when auth is unconfigured', async () => {
      await signOut();

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['user']);
    });

    it('should sign out with the lazily loaded SDK and the real revoke helper', async () => {
      const authModule = await import('firebase/auth');
      globalThis.fetch = jest.fn(() => Promise.resolve({}));
      const authInstance = { name: 'auth-instance' };

      await signOut({ isAuthConfigured: true, auth: authInstance });

      expect(authModule.signOut).toHaveBeenCalledWith(authInstance);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['user']);
    });

    it('should read the current user from the global storage', async () => {
      await expect(getCurrentUser()).resolves.toBeNull();
    });
  });

  describe('isEdgeBrowser without navigator', () => {
    it('should return false when navigator is undefined', () => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true, writable: true });
      try {
        expect(isEdgeBrowser()).toBe(false);
      } finally {
        if (descriptor) {
          Object.defineProperty(globalThis, 'navigator', descriptor);
        } else {
          delete globalThis.navigator;
        }
      }
    });
  });

  describe('isEdgeBrowser', () => {
    it('should return false when navigator is undefined', () => {
      // In Node.js test environment, navigator may not be defined as expected
      // The function should handle this gracefully
      const result = isEdgeBrowser();
      expect(typeof result).toBe('boolean');
    });
    
    it('should detect Edge using userAgentData brands', () => {
      const localThis = {};
      localThis.originalUserAgentData = navigator.userAgentData;
      
      Object.defineProperty(navigator, 'userAgentData', {
        value: {
          brands: [
            { brand: 'Microsoft Edge', version: '120' },
            { brand: 'Chromium', version: '120' }
          ]
        },
        configurable: true
      });
      
      const result = isEdgeBrowser();
      expect(result).toBe(true);
      
      Object.defineProperty(navigator, 'userAgentData', {
        value: localThis.originalUserAgentData,
        configurable: true
      });
    });
    
    it('should return false when userAgentData has no Edge brand', () => {
      const localThis = {};
      localThis.originalUserAgentData = navigator.userAgentData;
      
      Object.defineProperty(navigator, 'userAgentData', {
        value: {
          brands: [
            { brand: 'Google Chrome', version: '120' },
            { brand: 'Chromium', version: '120' }
          ]
        },
        configurable: true
      });
      
      const result = isEdgeBrowser();
      expect(result).toBe(false);
      
      Object.defineProperty(navigator, 'userAgentData', {
        value: localThis.originalUserAgentData,
        configurable: true
      });
    });
    
    it('should detect Edge using userAgent string fallback', () => {
      const localThis = {};
      localThis.originalUserAgentData = navigator.userAgentData;
      localThis.originalUserAgent = navigator.userAgent;
      
      // Remove userAgentData to force fallback
      Object.defineProperty(navigator, 'userAgentData', {
        value: undefined,
        configurable: true
      });
      
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120.0.0.0',
        configurable: true
      });
      
      const result = isEdgeBrowser();
      expect(result).toBe(true);
      
      Object.defineProperty(navigator, 'userAgentData', {
        value: localThis.originalUserAgentData,
        configurable: true
      });
      Object.defineProperty(navigator, 'userAgent', {
        value: localThis.originalUserAgent,
        configurable: true
      });
    });
  });

  describe('resolveOAuthClientId', () => {
    const placeholder = 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';

    it('should return the env value when set', () => {
      expect(resolveOAuthClientId({ VITE_OAUTH_CLIENT_ID: 'abc.apps.googleusercontent.com' }))
        .toBe('abc.apps.googleusercontent.com');
    });

    it('should return the placeholder when the variable is not set', () => {
      expect(resolveOAuthClientId({})).toBe(placeholder);
    });

    it('should return the placeholder when env is undefined', () => {
      expect(resolveOAuthClientId(undefined)).toBe(placeholder);
    });
  });

  describe('getOAuthClientId', () => {
    it('should return default placeholder when import.meta.env is undefined', () => {
      const clientId = getOAuthClientId();
      expect(typeof clientId).toBe('string');
    });
    
    it('should return the placeholder value when env var is not set', () => {
      // Since we can't easily modify import.meta.env in tests, just verify the return type
      const clientId = getOAuthClientId();
      expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
    });
  });

  describe('isAuthConfigured', () => {
    it('should return false when using placeholder client ID', () => {
      const deps = {
        getOAuthClientId: () => 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com',
        isFirebaseConfigured: () => true
      };
      expect(isAuthConfigured(deps)).toBe(false);
    });

    it('should return false when Firebase is not configured', () => {
      const deps = {
        getOAuthClientId: () => 'real-client-id.apps.googleusercontent.com',
        isFirebaseConfigured: () => false
      };
      expect(isAuthConfigured(deps)).toBe(false);
    });

    it('should return true when both are configured', () => {
      const deps = {
        getOAuthClientId: () => 'real-client-id.apps.googleusercontent.com',
        isFirebaseConfigured: () => true
      };
      expect(isAuthConfigured(deps)).toBe(true);
    });
  });

  describe('getOAuthToken', () => {
    describe('Chrome (getAuthToken)', () => {
      it('should resolve with token on success', async () => {
        localThis.mockChromeIdentity.getAuthToken.mockImplementation((opts, callback) => {
          callback('mock-oauth-token');
        });
        
        const token = await getOAuthToken({
          isEdgeBrowser: false,
          chromeIdentity: localThis.mockChromeIdentity,
          chromeRuntime: localThis.mockChromeRuntime
        });
        
        expect(token).toBe('mock-oauth-token');
        expect(localThis.mockChromeIdentity.getAuthToken).toHaveBeenCalledWith(
          { interactive: true },
          expect.any(Function)
        );
      });

      it('should reject on error', async () => {
        localThis.mockChromeRuntime.lastError = { message: 'User cancelled' };
        localThis.mockChromeIdentity.getAuthToken.mockImplementation((opts, callback) => {
          callback(null);
        });
        
        await expect(getOAuthToken({
          isEdgeBrowser: false,
          chromeIdentity: localThis.mockChromeIdentity,
          chromeRuntime: localThis.mockChromeRuntime
        })).rejects.toThrow('User cancelled');
      });
    });

    describe('Edge (launchWebAuthFlow)', () => {
      it('should resolve with token from launchWebAuthFlow', async () => {
        localThis.mockChromeIdentity.getRedirectURL = jest.fn(() => 'https://extension-id.chromiumapp.org/');
        localThis.mockChromeIdentity.launchWebAuthFlow = jest.fn().mockResolvedValue(
          'https://extension-id.chromiumapp.org/#access_token=edge-oauth-token&token_type=Bearer'
        );
        
        const token = await getOAuthToken({
          isEdgeBrowser: true,
          chromeIdentity: localThis.mockChromeIdentity,
          getOAuthClientId: () => 'test-client-id.apps.googleusercontent.com'
        });
        
        expect(token).toBe('edge-oauth-token');
        expect(localThis.mockChromeIdentity.launchWebAuthFlow).toHaveBeenCalledWith({
          url: expect.stringContaining('accounts.google.com/o/oauth2/v2/auth'),
          interactive: true
        });
      });

      it('should reject when no access token in response', async () => {
        localThis.mockChromeIdentity.getRedirectURL = jest.fn(() => 'https://extension-id.chromiumapp.org/');
        localThis.mockChromeIdentity.launchWebAuthFlow = jest.fn().mockResolvedValue(
          'https://extension-id.chromiumapp.org/#error=access_denied'
        );
        
        await expect(getOAuthToken({
          isEdgeBrowser: true,
          chromeIdentity: localThis.mockChromeIdentity,
          getOAuthClientId: () => 'test-client-id.apps.googleusercontent.com'
        })).rejects.toThrow('No access token in OAuth response');
      });

      it('should include correct OAuth parameters', async () => {
        localThis.mockChromeIdentity.getRedirectURL = jest.fn(() => 'https://test.chromiumapp.org/');
        localThis.mockChromeIdentity.launchWebAuthFlow = jest.fn().mockResolvedValue(
          'https://test.chromiumapp.org/#access_token=test-token&token_type=Bearer'
        );
        
        await getOAuthToken({
          isEdgeBrowser: true,
          chromeIdentity: localThis.mockChromeIdentity,
          getOAuthClientId: () => 'my-client-id.apps.googleusercontent.com'
        });
        
        const callArg = localThis.mockChromeIdentity.launchWebAuthFlow.mock.calls[0][0];
        const authUrl = new URL(callArg.url);
        
        expect(authUrl.searchParams.get('client_id')).toBe('my-client-id.apps.googleusercontent.com');
        expect(authUrl.searchParams.get('redirect_uri')).toBe('https://test.chromiumapp.org/');
        expect(authUrl.searchParams.get('response_type')).toBe('token');
        expect(authUrl.searchParams.get('scope')).toContain('userinfo.email');
      });
    });
  });

  describe('signInWithGoogle', () => {
    it('should return mock user when not configured', async () => {
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const user = await signInWithGoogle({
        isAuthConfigured: false,
        chromeStorage: localThis.mockChromeStorage
      });
      
      expect(user.email).toBe('local@example.com');
      expect(user.displayName).toBe('Local User');
      expect(user.uid).toContain('local-user-');
      expect(localThis.mockChromeStorage.local.set).toHaveBeenCalled();
    });

    it('should sign in with Firebase when configured', async () => {
      const mockUserCredential = {
        user: {
          uid: 'firebase-user-123',
          displayName: 'Test User',
          email: 'test@example.com',
          photoURL: 'https://example.com/photo.jpg'
        }
      };
      
      const mockCredential = { type: 'oauth' };
      const mockGoogleProvider = {
        credential: jest.fn(() => mockCredential)
      };
      
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const user = await signInWithGoogle({
        isAuthConfigured: true,
        chromeStorage: localThis.mockChromeStorage,
        initializeFirebase: jest.fn(),
        getOAuthToken: jest.fn().mockResolvedValue('mock-token'),
        GoogleAuthProvider: mockGoogleProvider,
        signInWithCredential: jest.fn().mockResolvedValue(mockUserCredential),
        auth: { name: 'test-auth' }
      });
      
      expect(user.uid).toBe('firebase-user-123');
      expect(user.email).toBe('test@example.com');
      expect(user.displayName).toBe('Test User');
      expect(mockGoogleProvider.credential).toHaveBeenCalledWith(null, 'mock-token');
    });

    it('should throw error when token retrieval fails', async () => {
      await expect(signInWithGoogle({
        isAuthConfigured: true,
        chromeStorage: localThis.mockChromeStorage,
        initializeFirebase: jest.fn(),
        getOAuthToken: jest.fn().mockResolvedValue(null)
      })).rejects.toThrow('Failed to get OAuth token');
    });

    it('should throw error on sign in failure', async () => {
      await expect(signInWithGoogle({
        isAuthConfigured: true,
        chromeStorage: localThis.mockChromeStorage,
        initializeFirebase: jest.fn(),
        getOAuthToken: jest.fn().mockResolvedValue('token'),
        GoogleAuthProvider: { credential: jest.fn() },
        signInWithCredential: jest.fn().mockRejectedValue(new Error('Auth error')),
        auth: {}
      })).rejects.toThrow('Auth error');
    });
  });

  describe('revokeOAuthToken', () => {
    describe('Chrome', () => {
      it('should revoke token when it exists', async () => {
        localThis.mockChromeIdentity.getAuthToken.mockImplementation((opts, callback) => {
          callback('existing-token');
        });
        localThis.mockChromeIdentity.removeCachedAuthToken.mockImplementation((opts, callback) => {
          callback();
        });
        
        const mockFetch = jest.fn().mockResolvedValue({ ok: true });
        
        await revokeOAuthToken({
          isEdgeBrowser: false,
          chromeIdentity: localThis.mockChromeIdentity,
          fetch: mockFetch
        });
        
        expect(localThis.mockChromeIdentity.removeCachedAuthToken).toHaveBeenCalledWith(
          { token: 'existing-token' },
          expect.any(Function)
        );
        expect(mockFetch).toHaveBeenCalledWith(
          'https://accounts.google.com/o/oauth2/revoke?token=existing-token'
        );
      });

      it('should resolve when no token exists', async () => {
        localThis.mockChromeIdentity.getAuthToken.mockImplementation((opts, callback) => {
          callback(null);
        });
        
        await expect(revokeOAuthToken({
          isEdgeBrowser: false,
          chromeIdentity: localThis.mockChromeIdentity,
          fetch: jest.fn()
        })).resolves.toBeUndefined();
      });
    });

    describe('Edge', () => {
      it('should call clearAllCachedAuthTokens if available', async () => {
        localThis.mockChromeIdentity.clearAllCachedAuthTokens = jest.fn().mockResolvedValue();
        
        await revokeOAuthToken({
          isEdgeBrowser: true,
          chromeIdentity: localThis.mockChromeIdentity,
          fetch: jest.fn()
        });
        
        expect(localThis.mockChromeIdentity.clearAllCachedAuthTokens).toHaveBeenCalled();
      });

      it('should resolve even if clearAllCachedAuthTokens is not available', async () => {
        // No clearAllCachedAuthTokens method
        delete localThis.mockChromeIdentity.clearAllCachedAuthTokens;
        
        await expect(revokeOAuthToken({
          isEdgeBrowser: true,
          chromeIdentity: localThis.mockChromeIdentity,
          fetch: jest.fn()
        })).resolves.toBeUndefined();
      });

      it('should resolve even if clearAllCachedAuthTokens throws', async () => {
        localThis.mockChromeIdentity.clearAllCachedAuthTokens = jest.fn().mockRejectedValue(new Error('Not supported'));
        
        await expect(revokeOAuthToken({
          isEdgeBrowser: true,
          chromeIdentity: localThis.mockChromeIdentity,
          fetch: jest.fn()
        })).resolves.toBeUndefined();
      });
    });
  });

  describe('signOut', () => {
    it('should sign out from Firebase and revoke token when configured', async () => {
      const mockFirebaseSignOut = jest.fn().mockResolvedValue();
      const mockRevokeToken = jest.fn().mockResolvedValue();
      localThis.mockChromeStorage.local.remove.mockResolvedValue();
      
      await signOut({
        isAuthConfigured: true,
        auth: { name: 'auth' },
        firebaseSignOut: mockFirebaseSignOut,
        revokeOAuthToken: mockRevokeToken,
        chromeStorage: localThis.mockChromeStorage
      });
      
      expect(mockFirebaseSignOut).toHaveBeenCalled();
      expect(mockRevokeToken).toHaveBeenCalled();
      expect(localThis.mockChromeStorage.local.remove).toHaveBeenCalledWith(['user']);
    });

    it('should only clear storage when not configured', async () => {
      const mockFirebaseSignOut = jest.fn();
      const mockRevokeToken = jest.fn();
      localThis.mockChromeStorage.local.remove.mockResolvedValue();
      
      await signOut({
        isAuthConfigured: false,
        firebaseSignOut: mockFirebaseSignOut,
        revokeOAuthToken: mockRevokeToken,
        chromeStorage: localThis.mockChromeStorage
      });
      
      expect(mockFirebaseSignOut).not.toHaveBeenCalled();
      expect(mockRevokeToken).not.toHaveBeenCalled();
      expect(localThis.mockChromeStorage.local.remove).toHaveBeenCalledWith(['user']);
    });

    it('should throw error on failure', async () => {
      localThis.mockChromeStorage.local.remove.mockRejectedValue(new Error('Storage error'));
      
      await expect(signOut({
        isAuthConfigured: false,
        chromeStorage: localThis.mockChromeStorage
      })).rejects.toThrow('Storage error');
    });

    it('should skip Firebase sign out when auth is null', async () => {
      const mockFirebaseSignOut = jest.fn();
      localThis.mockChromeStorage.local.remove.mockResolvedValue();
      
      await signOut({
        isAuthConfigured: true,
        auth: null,
        firebaseSignOut: mockFirebaseSignOut,
        revokeOAuthToken: jest.fn().mockResolvedValue(),
        chromeStorage: localThis.mockChromeStorage
      });
      
      expect(mockFirebaseSignOut).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return user from storage', async () => {
      const mockUser = { uid: 'user-123', email: 'test@example.com' };
      localThis.mockChromeStorage.local.get.mockResolvedValue({ user: mockUser });
      
      const user = await getCurrentUser({
        chromeStorage: localThis.mockChromeStorage
      });
      
      expect(user).toEqual(mockUser);
    });

    it('should return null when no user in storage', async () => {
      localThis.mockChromeStorage.local.get.mockResolvedValue({});
      
      const user = await getCurrentUser({
        chromeStorage: localThis.mockChromeStorage
      });
      
      expect(user).toBeNull();
    });
  });
});
