/**
 * Jest Test Setup
 * Global mocks and configuration
 */

import { jest } from '@jest/globals';

// Mark test environment to prevent auto-initialization in modules
globalThis.__JEST__ = true;

// Mock Chrome Extension APIs
global.chrome = {
  runtime: {
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({ success: true });
      return Promise.resolve({ success: true });
    }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
    id: 'mock-extension-id'
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    },
    sync: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    }
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
    sendMessage: jest.fn(() => Promise.resolve({ success: true })),
    onUpdated: {
      addListener: jest.fn()
    }
  },
  scripting: {
    executeScript: jest.fn(() => Promise.resolve([{ result: true }]))
  },
  identity: {
    getAuthToken: jest.fn((options, callback) => {
      if (callback) callback('mock-token');
      return Promise.resolve('mock-token');
    }),
    removeCachedAuthToken: jest.fn((options, callback) => {
      if (callback) callback();
      return Promise.resolve();
    }),
    launchWebAuthFlow: jest.fn(() => Promise.resolve('https://example.com#access_token=mock'))
  },
  webNavigation: {
    onHistoryStateUpdated: {
      addListener: jest.fn()
    }
  },
  i18n: {
    getMessage: jest.fn((key, substitutions) => {
      // Return the key as the message for testing
      if (substitutions) {
        if (Array.isArray(substitutions)) {
          return substitutions.reduce((msg, sub, i) => msg.replace(`$${i + 1}`, sub), key);
        }
        return key.replace('$1', substitutions);
      }
      return key;
    }),
    getUILanguage: jest.fn(() => 'en')
  }
};

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observedElements = new Set();
  }
  
  observe(element) {
    this.observedElements.add(element);
  }
  
  unobserve(element) {
    this.observedElements.delete(element);
  }
  
  disconnect() {
    this.observedElements.clear();
  }
  
  // Helper to simulate intersection
  simulateIntersection(entries) {
    this.callback(entries, this);
  }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock MutationObserver
global.MutationObserver = class MutationObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
};

// Mock matchMedia
global.matchMedia = jest.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn()
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));
global.cancelAnimationFrame = jest.fn(id => clearTimeout(id));

// Mock document.execCommand (deprecated but still used)
document.execCommand = jest.fn(() => true);

// Mock window.getSelection
window.getSelection = jest.fn(() => ({
  rangeCount: 0,
  getRangeAt: jest.fn(),
  removeAllRanges: jest.fn(),
  addRange: jest.fn(),
  toString: jest.fn(() => '')
}));

// Mock scrollTo
window.scrollTo = jest.fn();
Element.prototype.scrollTo = jest.fn();
Element.prototype.scrollIntoView = jest.fn();

// Mock getBoundingClientRect
Element.prototype.getBoundingClientRect = jest.fn(() => ({
  top: 0,
  left: 0,
  bottom: 100,
  right: 100,
  width: 100,
  height: 100,
  x: 0,
  y: 0,
  toJSON: () => {}
}));

// Mock CSS.escape (not available in JSDOM)
global.CSS = {
  escape: jest.fn((str) => {
    // Simple escape implementation for tests
    return str.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  })
};

// Mock indexedDB for persistence tests
global.indexedDB = {
  open: jest.fn()
};
