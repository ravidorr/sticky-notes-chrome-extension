/**
 * Background navigation unit tests
 * Focus: SPA history updates should ignore subframes
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { getUrlChangedMessageFromHistoryUpdate } from '../../src/background/navigation.js';

describe('Background navigation - getUrlChangedMessageFromHistoryUpdate', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    localThis.payload = null;
  });

  it('should ignore subframe history updates (frameId != 0)', () => {
    localThis.payload = getUrlChangedMessageFromHistoryUpdate({
      tabId: 123,
      frameId: 5,
      url: 'https://example.com/iframe'
    });
    expect(localThis.payload).toBeNull();
  });

  it('should send urlChanged for top-frame history updates (frameId == 0)', () => {
    localThis.payload = getUrlChangedMessageFromHistoryUpdate({
      tabId: 123,
      frameId: 0,
      url: 'https://example.com/new'
    });
    expect(localThis.payload).toEqual({
      tabId: 123,
      message: { action: 'urlChanged', url: 'https://example.com/new' }
    });
  });
});

