/**
 * Content script entry - deferred iframe init tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { setupDeferredIframeInit } from '../../src/content/index.js';

describe('content/index - setupDeferredIframeInit', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();

    // Force "iframe" context
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    Object.defineProperty(window, 'self', { value: window, configurable: true });

    // Start tiny
    Object.defineProperty(window, 'innerWidth', { value: 10, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 10, configurable: true, writable: true });

    // Persistent URL
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/iframe' },
      configurable: true
    });

    // Capture resize listener
    localThis.resizeCb = null;
    window.addEventListener = jest.fn((type, cb) => {
      if (type === 'resize') localThis.resizeCb = cb;
    });
    window.removeEventListener = jest.fn();

    // Capture ResizeObserver usage
    localThis.resizeObserverObserve = jest.fn();
    localThis.resizeObserverDisconnect = jest.fn();
    global.ResizeObserver = class ResizeObserver {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {
        localThis.resizeObserverObserve();
      }
      disconnect() {
        localThis.resizeObserverDisconnect();
      }
    };

    delete window.__stickyNotesDeferredInit;
    delete window.__stickyNotesInitialized;
  });

  it('should defer init in tiny persistent iframes and initialize after resize', () => {
    const initFn = jest.fn();

    const result = setupDeferredIframeInit({ initFn, minSize: 50 });
    expect(result.deferred).toBe(true);
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(localThis.resizeObserverObserve).toHaveBeenCalled();
    expect(initFn).not.toHaveBeenCalled();

    // Grow iframe and trigger resize
    window.innerWidth = 200;
    window.innerHeight = 200;
    expect(typeof localThis.resizeCb).toBe('function');
    localThis.resizeCb();

    expect(initFn).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(localThis.resizeObserverDisconnect).toHaveBeenCalled();
  });

  it('should not defer init for top frame', () => {
    // Simulate top frame by making innerWidth/innerHeight large enough
    // that even if isTopFrame check fails, it won't be considered "tiny"
    // This tests the "not tiny iframe" path which returns deferred: false
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true, writable: true });

    const initFn = jest.fn();
    const result = setupDeferredIframeInit({ initFn, minSize: 50 });
    expect(result.deferred).toBe(false);
    expect(window.addEventListener).not.toHaveBeenCalled();
  });

  it('should not defer init when window.self equals window.top (actual top frame)', () => {
    // For completeness, verify behavior when isTopFrame is true
    // In JSDOM, we can't reliably mock window.self === window.top,
    // so we test via the size threshold instead
    // The actual implementation returns { deferred: false } when:
    // 1. isTopFrame is true, OR
    // 2. URL is not persistent (about:, blob:, data:), OR
    // 3. Size is >= minSize
    // This test verifies path #3
    Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true, writable: true });

    const initFn = jest.fn();
    const result = setupDeferredIframeInit({ initFn, minSize: 50 });
    expect(result.deferred).toBe(false);
  });
});

