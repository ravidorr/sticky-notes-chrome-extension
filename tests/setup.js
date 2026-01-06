/**
 * Jest Test Setup
 * Mocks Chrome extension APIs and browser APIs for testing
 */

import { jest } from '@jest/globals';

// Polyfill CSS.escape for jsdom
if (typeof CSS === 'undefined') {
  globalThis.CSS = {};
}

if (typeof CSS.escape !== 'function') {
  // CSS.escape polyfill
  CSS.escape = function(value) {
    if (arguments.length === 0) {
      throw new TypeError('`CSS.escape` requires an argument.');
    }
    const string = String(value);
    const length = string.length;
    let result = '';
    let index = -1;
    
    while (++index < length) {
      const codeUnit = string.charCodeAt(index);
      
      // If the character is NULL (U+0000), use REPLACEMENT CHARACTER (U+FFFD)
      if (codeUnit === 0x0000) {
        result += '\uFFFD';
        continue;
      }
      
      if (
        // If the character is in the range [\1-\1F] (U+0001 to U+001F) or is
        // U+007F, escape as code point
        (codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit === 0x007F ||
        // If the character is the first, and is in the range [0-9]
        (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        // If the character is the second, is in the range [0-9], and the first
        // character is a `-`
        (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && string.charCodeAt(0) === 0x002D)
      ) {
        result += '\\' + codeUnit.toString(16) + ' ';
        continue;
      }
      
      // If the character is not handled by one of the above rules and is
      // greater than or equal to U+0080, is `-` (U+002D) or `_` (U+005F), or
      // is in one of the ranges [0-9], [A-Z], or [a-z], use the character itself
      if (
        codeUnit >= 0x0080 ||
        codeUnit === 0x002D ||
        codeUnit === 0x005F ||
        (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (codeUnit >= 0x0041 && codeUnit <= 0x005A) ||
        (codeUnit >= 0x0061 && codeUnit <= 0x007A)
      ) {
        result += string.charAt(index);
        continue;
      }
      
      // Otherwise, the escaped character
      result += '\\' + string.charAt(index);
    }
    
    return result;
  };
}

// Mock chrome API
const chromeMock = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    },
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`)
  },
  tabs: {
    query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
    sendMessage: jest.fn().mockResolvedValue({ success: true })
  },
  webNavigation: {
    onHistoryStateUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  identity: {
    getAuthToken: jest.fn(),
    launchWebAuthFlow: jest.fn()
  }
};

// Set up global chrome object
globalThis.chrome = chromeMock;

// Export for direct access in tests
export { chromeMock };
