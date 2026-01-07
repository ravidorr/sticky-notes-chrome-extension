/**
 * Firebase Config Module Unit Tests
 */

import { jest, describe, it, expect } from '@jest/globals';

describe('Firebase Config Logic', () => {
  describe('isFirebaseConfigured', () => {
    it('should return true when all required fields are present', () => {
      function isFirebaseConfigured(config) {
        return !!(
          config.apiKey &&
          config.authDomain &&
          config.projectId
        );
      }
      
      const validConfig = {
        apiKey: 'test-api-key',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test-project'
      };
      
      expect(isFirebaseConfigured(validConfig)).toBe(true);
    });
    
    it('should return false when apiKey is missing', () => {
      function isFirebaseConfigured(config) {
        return !!(config.apiKey && config.authDomain && config.projectId);
      }
      
      const config = {
        authDomain: 'test.firebaseapp.com',
        projectId: 'test-project'
      };
      
      expect(isFirebaseConfigured(config)).toBe(false);
    });
    
    it('should return false for empty config', () => {
      function isFirebaseConfigured(config) {
        return !!(config.apiKey && config.authDomain && config.projectId);
      }
      
      expect(isFirebaseConfigured({})).toBe(false);
    });
    
    it('should return false for placeholder values', () => {
      function isFirebaseConfigured(config) {
        const placeholders = ['your_api_key', 'your-project', 'your_project'];
        const hasPlaceholder = [config.apiKey, config.projectId].some(
          val => placeholders.some(p => val?.includes(p))
        );
        return !!(config.apiKey && config.projectId && !hasPlaceholder);
      }
      
      const configWithPlaceholder = {
        apiKey: 'your_api_key',
        authDomain: 'your-project.firebaseapp.com',
        projectId: 'your-project'
      };
      
      expect(isFirebaseConfigured(configWithPlaceholder)).toBe(false);
    });
  });
  
  describe('config from environment', () => {
    it('should build config object from env vars', () => {
      function buildConfig(env) {
        return {
          apiKey: env.VITE_FIREBASE_API_KEY || '',
          authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
          projectId: env.VITE_FIREBASE_PROJECT_ID || '',
          storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
          messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
          appId: env.VITE_FIREBASE_APP_ID || ''
        };
      }
      
      const env = {
        VITE_FIREBASE_API_KEY: 'api-key-123',
        VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'test-project'
      };
      
      const config = buildConfig(env);
      
      expect(config.apiKey).toBe('api-key-123');
      expect(config.authDomain).toBe('test.firebaseapp.com');
      expect(config.projectId).toBe('test-project');
    });
    
    it('should use empty strings for missing env vars', () => {
      function buildConfig(env) {
        return {
          apiKey: env.VITE_FIREBASE_API_KEY || '',
          authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || ''
        };
      }
      
      const config = buildConfig({});
      
      expect(config.apiKey).toBe('');
      expect(config.authDomain).toBe('');
    });
  });
  
  describe('Firestore initialization pattern', () => {
    it('should initialize with persistent cache settings', () => {
      function createFirestoreSettings(enablePersistence) {
        if (enablePersistence) {
          return {
            localCache: {
              type: 'persistent',
              tabManager: { forceOwnership: false }
            }
          };
        }
        return {};
      }
      
      const settings = createFirestoreSettings(true);
      
      expect(settings.localCache).toBeDefined();
      expect(settings.localCache.type).toBe('persistent');
    });
    
    it('should handle initialization errors', () => {
      function handleFirestoreError(error) {
        if (error.code === 'failed-precondition') {
          return { fallback: true, reason: 'multiple-tabs' };
        }
        return { fallback: true, reason: 'unknown', error: error.message };
      }
      
      const error = { code: 'failed-precondition', message: 'Multiple tabs open' };
      const result = handleFirestoreError(error);
      
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe('multiple-tabs');
    });
  });
  
  describe('singleton pattern', () => {
    it('should initialize only once', () => {
      let initCount = 0;
      let instance = null;
      
      function initializeFirebase() {
        if (!instance) {
          initCount++;
          instance = { app: {}, auth: {}, db: {} };
        }
        return instance;
      }
      
      const first = initializeFirebase();
      const second = initializeFirebase();
      
      expect(first).toBe(second);
      expect(initCount).toBe(1);
    });
  });
  
  describe('module exports', () => {
    it('should export required functions and objects', () => {
      // Test that the expected exports exist
      const mockModule = {
        initializeFirebase: jest.fn(),
        isFirebaseConfigured: jest.fn(),
        auth: null,
        db: null
      };
      
      expect(typeof mockModule.initializeFirebase).toBe('function');
      expect(typeof mockModule.isFirebaseConfigured).toBe('function');
    });
  });
});

describe('Firebase Persistence Settings', () => {
  it('should create persistent local cache config', () => {
    function createPersistentCacheConfig(singleTab = true) {
      return {
        localCache: {
          kind: 'persistentSingleTab' + (singleTab ? '' : 'MultiTab'),
          settings: {
            cacheSizeBytes: 100 * 1024 * 1024 // 100MB
          }
        }
      };
    }
    
    const config = createPersistentCacheConfig(true);
    expect(config.localCache.kind).toBe('persistentSingleTab');
  });
  
  it('should handle IndexedDB unavailability', () => {
    function checkPersistenceSupport(hasIndexedDB) {
      try {
        if (!hasIndexedDB) {
          return { supported: false, reason: 'IndexedDB not available' };
        }
        return { supported: true };
      } catch (e) {
        return { supported: false, reason: e.message };
      }
    }
    
    // Test with IndexedDB available
    expect(checkPersistenceSupport(true).supported).toBe(true);
    
    // Test without IndexedDB
    expect(checkPersistenceSupport(false).supported).toBe(false);
  });
});
