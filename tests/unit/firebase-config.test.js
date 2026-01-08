/**
 * Firebase Config Unit Tests
 * 
 * Tests the configuration validation and initialization logic.
 * Firebase SDK is mocked to allow testing without actual Firebase.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock Firebase SDK modules before importing config
jest.unstable_mockModule('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: 'mock-app' }))
}));

jest.unstable_mockModule('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ name: 'mock-auth' }))
}));

jest.unstable_mockModule('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({ name: 'mock-db' })),
  initializeFirestore: jest.fn(() => ({ name: 'mock-db-initialized' })),
  persistentLocalCache: jest.fn((config) => ({ type: 'localCache', ...config })),
  persistentSingleTabManager: jest.fn((config) => ({ type: 'tabManager', ...config })),
  memoryLocalCache: jest.fn(() => ({ type: 'memoryCache' }))
}));

// Import after mocking
const { 
  isFirebaseConfigured, 
  isConfigValid, 
  getFirebaseConfig,
  initializeFirebase,
  resetFirebase
} = await import('../../src/firebase/config.js');

describe('Firebase Config', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Firebase state before each test
    resetFirebase();
  });

  describe('getFirebaseConfig', () => {
    it('should return config object', () => {
      const config = getFirebaseConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('apiKey');
      expect(config).toHaveProperty('authDomain');
      expect(config).toHaveProperty('projectId');
      expect(config).toHaveProperty('storageBucket');
      expect(config).toHaveProperty('messagingSenderId');
      expect(config).toHaveProperty('appId');
    });
  });

  describe('isConfigValid', () => {
    it('should return true when all required fields are present', () => {
      const config = {
        apiKey: 'real-api-key',
        authDomain: 'project.firebaseapp.com',
        projectId: 'my-project'
      };
      expect(isConfigValid(config)).toBe(true);
    });

    it('should return false when apiKey is missing', () => {
      const config = {
        authDomain: 'project.firebaseapp.com',
        projectId: 'my-project'
      };
      expect(isConfigValid(config)).toBe(false);
    });

    it('should return false for null config', () => {
      expect(isConfigValid(null)).toBe(false);
    });

    it('should return false for undefined config', () => {
      expect(isConfigValid(undefined)).toBe(false);
    });

    it('should return false for placeholder values with your_', () => {
      const config = {
        apiKey: 'your_api_key_here',
        authDomain: 'project.firebaseapp.com'
      };
      expect(isConfigValid(config)).toBe(false);
    });

    it('should return false for YOUR_API_KEY placeholder', () => {
      const config = {
        apiKey: 'YOUR_API_KEY',
        authDomain: 'project.firebaseapp.com'
      };
      expect(isConfigValid(config)).toBe(false);
    });

    it('should return false for empty apiKey', () => {
      const config = {
        apiKey: '',
        authDomain: 'project.firebaseapp.com'
      };
      expect(isConfigValid(config)).toBe(false);
    });
  });

  describe('isFirebaseConfigured', () => {
    it('should return boolean', () => {
      const result = isFirebaseConfigured();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('initializeFirebase', () => {
    it('should return null values when not configured', () => {
      const result = initializeFirebase({ config: {} });
      expect(result.app).toBeNull();
      expect(result.auth).toBeNull();
      expect(result.db).toBeNull();
    });

    it('should initialize Firebase when configured', () => {
      localThis.mockApp = { name: 'test-app' };
      localThis.mockAuth = { name: 'test-auth' };
      localThis.mockDb = { name: 'test-db' };
      
      const mockDeps = {
        initializeApp: jest.fn(() => localThis.mockApp),
        getAuth: jest.fn(() => localThis.mockAuth),
        initializeFirestore: jest.fn(() => localThis.mockDb),
        getFirestore: jest.fn(() => localThis.mockDb),
        persistentLocalCache: jest.fn(() => ({})),
        persistentSingleTabManager: jest.fn(() => ({})),
        memoryLocalCache: jest.fn(() => ({}))
      };
      
      const config = {
        apiKey: 'real-api-key',
        authDomain: 'project.firebaseapp.com',
        projectId: 'my-project'
      };
      
      const result = initializeFirebase({ config, deps: mockDeps });
      
      expect(result.app).toBe(localThis.mockApp);
      expect(result.auth).toBe(localThis.mockAuth);
      expect(result.db).toBe(localThis.mockDb);
      expect(mockDeps.initializeApp).toHaveBeenCalledWith(config);
      expect(mockDeps.getAuth).toHaveBeenCalledWith(localThis.mockApp);
    });

    it('should initialize only once (singleton pattern)', () => {
      const mockDeps = {
        initializeApp: jest.fn(() => ({ name: 'app' })),
        getAuth: jest.fn(() => ({ name: 'auth' })),
        initializeFirestore: jest.fn(() => ({ name: 'db' })),
        getFirestore: jest.fn(() => ({ name: 'db' })),
        persistentLocalCache: jest.fn(() => ({})),
        persistentSingleTabManager: jest.fn(() => ({})),
        memoryLocalCache: jest.fn(() => ({}))
      };
      
      const config = { apiKey: 'real-api-key' };
      
      // First call
      initializeFirebase({ config, deps: mockDeps });
      // Second call
      initializeFirebase({ config, deps: mockDeps });
      
      // Should only initialize once
      expect(mockDeps.initializeApp).toHaveBeenCalledTimes(1);
    });

    it('should handle Firestore initialization error with failed-precondition', () => {
      const mockError = new Error('Firestore already initialized');
      mockError.code = 'failed-precondition';
      
      const mockDeps = {
        initializeApp: jest.fn(() => ({ name: 'app' })),
        getAuth: jest.fn(() => ({ name: 'auth' })),
        initializeFirestore: jest.fn(() => { throw mockError; }),
        getFirestore: jest.fn(() => ({ name: 'fallback-db' })),
        persistentLocalCache: jest.fn(() => ({})),
        persistentSingleTabManager: jest.fn(() => ({})),
        memoryLocalCache: jest.fn(() => ({}))
      };
      
      const config = { apiKey: 'real-api-key' };
      const result = initializeFirebase({ config, deps: mockDeps });
      
      expect(result.db).toEqual({ name: 'fallback-db' });
      expect(mockDeps.getFirestore).toHaveBeenCalled();
    });

    it('should handle Firestore initialization with other errors', () => {
      const mockError = new Error('Some other error');
      mockError.code = 'other-error';
      
      const mockDeps = {
        initializeApp: jest.fn(() => ({ name: 'app' })),
        getAuth: jest.fn(() => ({ name: 'auth' })),
        initializeFirestore: jest.fn(() => { throw mockError; }),
        getFirestore: jest.fn(() => ({ name: 'fallback-db' })),
        persistentLocalCache: jest.fn(() => ({})),
        persistentSingleTabManager: jest.fn(() => ({})),
        memoryLocalCache: jest.fn(() => ({}))
      };
      
      const config = { apiKey: 'real-api-key' };
      const result = initializeFirebase({ config, deps: mockDeps });
      
      expect(result.db).toEqual({ name: 'fallback-db' });
    });

    it('should configure persistent cache correctly in non-service-worker context', () => {
      const mockDeps = {
        initializeApp: jest.fn(() => ({ name: 'app' })),
        getAuth: jest.fn(() => ({ name: 'auth' })),
        initializeFirestore: jest.fn(() => ({ name: 'db' })),
        getFirestore: jest.fn(),
        persistentLocalCache: jest.fn((config) => ({ type: 'cache', ...config })),
        persistentSingleTabManager: jest.fn((config) => ({ type: 'tabManager', ...config })),
        memoryLocalCache: jest.fn(() => ({ type: 'memoryCache' }))
      };
      
      const config = { apiKey: 'real-api-key' };
      initializeFirebase({ config, deps: mockDeps });
      
      expect(mockDeps.persistentSingleTabManager).toHaveBeenCalledWith({
        forceOwnership: false
      });
      expect(mockDeps.persistentLocalCache).toHaveBeenCalled();
    });
  });

  describe('resetFirebase', () => {
    it('should reset all Firebase instances', () => {
      const mockDeps = {
        initializeApp: jest.fn(() => ({ name: 'app' })),
        getAuth: jest.fn(() => ({ name: 'auth' })),
        initializeFirestore: jest.fn(() => ({ name: 'db' })),
        getFirestore: jest.fn(),
        persistentLocalCache: jest.fn(() => ({})),
        persistentSingleTabManager: jest.fn(() => ({})),
        memoryLocalCache: jest.fn(() => ({}))
      };
      
      const config = { apiKey: 'real-api-key' };
      
      // Initialize
      initializeFirebase({ config, deps: mockDeps });
      expect(mockDeps.initializeApp).toHaveBeenCalledTimes(1);
      
      // Reset
      resetFirebase();
      
      // Initialize again - should create new instance
      initializeFirebase({ config, deps: mockDeps });
      expect(mockDeps.initializeApp).toHaveBeenCalledTimes(2);
    });
  });
});
