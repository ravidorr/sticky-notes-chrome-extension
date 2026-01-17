/**
 * Tests for pageContext.js module
 * 
 * pageContext.js runs in the MAIN world and captures console errors.
 * It buffers errors until ConsoleCapture signals readiness.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('pageContext', () => {
  const localThis = {};
  
  beforeEach(() => {
    // Store original console methods
    localThis.originalError = console.error;
    localThis.originalWarn = console.warn;
    
    // Store original window properties
    localThis.originalAddEventListener = window.addEventListener;
    
    // Track dispatched events
    localThis.dispatchedEvents = [];
    localThis.originalDispatchEvent = window.dispatchEvent;
    window.dispatchEvent = jest.fn((event) => {
      if (event.type === '__stickyNotesError') {
        localThis.dispatchedEvents.push(event);
      }
      return localThis.originalDispatchEvent.call(window, event);
    });
    
    // Track error event listeners
    localThis.errorListeners = [];
    localThis.rejectionListeners = [];
    window.addEventListener = jest.fn((type, handler) => {
      if (type === 'error') {
        localThis.errorListeners.push(handler);
      } else if (type === 'unhandledrejection') {
        localThis.rejectionListeners.push(handler);
      }
      return localThis.originalAddEventListener.call(window, type, handler);
    });
    
    // Clear any previous initialization flags
    delete window.__stickyNotesConsoleCapture;
    delete window.__stickyNotesErrorBuffer;
    delete window.__stickyNotesListenerReady;
  });
  
  afterEach(() => {
    // Restore original methods
    console.error = localThis.originalError;
    console.warn = localThis.originalWarn;
    window.dispatchEvent = localThis.originalDispatchEvent;
    window.addEventListener = localThis.originalAddEventListener;
    
    // Clean up window globals
    delete window.__stickyNotesConsoleCapture;
    delete window.__stickyNotesErrorBuffer;
    delete window.__stickyNotesListenerReady;
    
    // Reset module cache to allow re-importing
    jest.resetModules();
  });
  
  /**
   * Helper to load pageContext.js fresh
   * Since it's an IIFE, we need to import it to execute
   */
  async function loadPageContext() {
    await import('../../src/content/pageContext.js');
  }
  
  describe('initialization', () => {
    it('should set initialization flag', async () => {
      await loadPageContext();
      expect(window.__stickyNotesConsoleCapture).toBe(true);
    });
    
    it('should initialize error buffer', async () => {
      await loadPageContext();
      expect(window.__stickyNotesErrorBuffer).toEqual([]);
      expect(Array.isArray(window.__stickyNotesErrorBuffer)).toBe(true);
    });
    
    it('should not double initialize', async () => {
      window.__stickyNotesConsoleCapture = true;
      const originalBuffer = [];
      window.__stickyNotesErrorBuffer = originalBuffer;
      
      await loadPageContext();
      
      // Buffer should remain unchanged (not reset to new array)
      expect(window.__stickyNotesErrorBuffer).toBe(originalBuffer);
    });
  });
  
  describe('buffering before listener ready', () => {
    it('should buffer console.error when listener not ready', async () => {
      await loadPageContext();
      
      // Listener is not ready (default state)
      expect(window.__stickyNotesListenerReady).toBeUndefined();
      
      console.error('Test error');
      
      // Should be buffered, not dispatched
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(window.__stickyNotesErrorBuffer[0].type).toBe('console.error');
      expect(window.__stickyNotesErrorBuffer[0].message).toBe('Test error');
      
      // No direct event dispatch
      expect(localThis.dispatchedEvents).toHaveLength(0);
    });
    
    it('should buffer console.warn when listener not ready', async () => {
      await loadPageContext();
      
      console.warn('Test warning');
      
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(window.__stickyNotesErrorBuffer[0].type).toBe('console.warn');
      expect(window.__stickyNotesErrorBuffer[0].message).toBe('Test warning');
    });
    
    it('should buffer multiple errors', async () => {
      await loadPageContext();
      
      console.error('Error 1');
      console.warn('Warning 1');
      console.error('Error 2');
      
      expect(window.__stickyNotesErrorBuffer).toHaveLength(3);
      expect(window.__stickyNotesErrorBuffer[0].message).toBe('Error 1');
      expect(window.__stickyNotesErrorBuffer[1].message).toBe('Warning 1');
      expect(window.__stickyNotesErrorBuffer[2].message).toBe('Error 2');
    });
    
    it('should limit buffer size and drop oldest errors', async () => {
      await loadPageContext();
      
      // Generate 55 errors (exceeds MAX_BUFFER_SIZE of 50)
      for (let i = 0; i < 55; i++) {
        console.error(`Error ${i}`);
      }
      
      // Should be capped at 50
      expect(window.__stickyNotesErrorBuffer).toHaveLength(50);
      
      // Should have dropped the first 5 errors (0-4)
      expect(window.__stickyNotesErrorBuffer[0].message).toBe('Error 5');
      expect(window.__stickyNotesErrorBuffer[49].message).toBe('Error 54');
    });
    
    it('should include timestamp in buffered errors', async () => {
      await loadPageContext();
      
      const before = Date.now();
      console.error('Timestamped error');
      const after = Date.now();
      
      expect(window.__stickyNotesErrorBuffer[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(window.__stickyNotesErrorBuffer[0].timestamp).toBeLessThanOrEqual(after);
    });
  });
  
  describe('direct dispatch when listener ready', () => {
    it('should dispatch event directly when listener is ready', async () => {
      await loadPageContext();
      
      // Signal listener is ready
      window.__stickyNotesListenerReady = true;
      
      console.error('Direct error');
      
      // Should be dispatched directly, not buffered
      expect(localThis.dispatchedEvents).toHaveLength(1);
      expect(localThis.dispatchedEvents[0].detail.type).toBe('console.error');
      expect(localThis.dispatchedEvents[0].detail.message).toBe('Direct error');
      
      // Buffer should remain empty
      expect(window.__stickyNotesErrorBuffer).toHaveLength(0);
    });
    
    it('should dispatch console.warn when listener is ready', async () => {
      await loadPageContext();
      window.__stickyNotesListenerReady = true;
      
      console.warn('Direct warning');
      
      expect(localThis.dispatchedEvents).toHaveLength(1);
      expect(localThis.dispatchedEvents[0].detail.type).toBe('console.warn');
    });
    
    it('should switch from buffering to direct dispatch', async () => {
      await loadPageContext();
      
      // First error is buffered
      console.error('Buffered error');
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(localThis.dispatchedEvents).toHaveLength(0);
      
      // Signal listener ready
      window.__stickyNotesListenerReady = true;
      
      // Second error is dispatched directly
      console.error('Direct error');
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1); // Still 1 (buffered)
      expect(localThis.dispatchedEvents).toHaveLength(1); // Now 1 (dispatched)
      expect(localThis.dispatchedEvents[0].detail.message).toBe('Direct error');
    });
  });
  
  describe('console method preservation', () => {
    it('should preserve original console.error behavior', async () => {
      const mockOriginal = jest.fn();
      console.error = mockOriginal;
      
      await loadPageContext();
      
      console.error('Test', 'multiple', 'args');
      
      expect(mockOriginal).toHaveBeenCalledWith('Test', 'multiple', 'args');
    });
    
    it('should preserve original console.warn behavior', async () => {
      const mockOriginal = jest.fn();
      console.warn = mockOriginal;
      
      await loadPageContext();
      
      console.warn('Warning', 123);
      
      expect(mockOriginal).toHaveBeenCalledWith('Warning', 123);
    });
  });
  
  describe('error event handling', () => {
    it('should capture uncaught exceptions', async () => {
      await loadPageContext();
      
      // Simulate error event
      const handler = localThis.errorListeners[0];
      handler({
        message: 'Uncaught TypeError',
        filename: 'script.js',
        lineno: 42,
        colno: 10
      });
      
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(window.__stickyNotesErrorBuffer[0]).toMatchObject({
        type: 'exception',
        message: 'Uncaught TypeError',
        filename: 'script.js',
        line: 42,
        col: 10
      });
    });
    
    it('should handle error events with missing properties', async () => {
      await loadPageContext();
      
      const handler = localThis.errorListeners[0];
      handler({});
      
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(window.__stickyNotesErrorBuffer[0]).toMatchObject({
        type: 'exception',
        message: 'Unknown error',
        filename: '',
        line: 0,
        col: 0
      });
    });
  });
  
  describe('unhandled rejection handling', () => {
    it('should capture unhandled promise rejections', async () => {
      await loadPageContext();
      
      const handler = localThis.rejectionListeners[0];
      handler({
        reason: new Error('Promise failed')
      });
      
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(window.__stickyNotesErrorBuffer[0].type).toBe('unhandledrejection');
      expect(window.__stickyNotesErrorBuffer[0].message).toContain('Promise failed');
    });
    
    it('should handle rejection with string reason', async () => {
      await loadPageContext();
      
      const handler = localThis.rejectionListeners[0];
      handler({
        reason: 'Simple rejection message'
      });
      
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(window.__stickyNotesErrorBuffer[0].message).toBe('Simple rejection message');
    });
    
    it('should handle rejection without reason', async () => {
      await loadPageContext();
      
      const handler = localThis.rejectionListeners[0];
      handler({});
      
      expect(window.__stickyNotesErrorBuffer).toHaveLength(1);
      expect(window.__stickyNotesErrorBuffer[0].message).toBe('Unhandled Promise Rejection');
    });
  });
  
  describe('argument stringification', () => {
    it('should stringify Error objects with stack trace', async () => {
      await loadPageContext();
      window.__stickyNotesListenerReady = true;
      
      const error = new Error('Test error');
      console.error(error);
      
      expect(localThis.dispatchedEvents[0].detail.message).toContain('Test error');
    });
    
    it('should stringify null and undefined', async () => {
      await loadPageContext();
      window.__stickyNotesListenerReady = true;
      
      console.error(null, undefined);
      
      expect(localThis.dispatchedEvents[0].detail.message).toBe('null undefined');
    });
    
    it('should stringify objects as JSON', async () => {
      await loadPageContext();
      window.__stickyNotesListenerReady = true;
      
      console.error({ foo: 'bar', count: 42 });
      
      const message = localThis.dispatchedEvents[0].detail.message;
      expect(message).toContain('foo');
      expect(message).toContain('bar');
    });
    
    it('should truncate long JSON strings', async () => {
      await loadPageContext();
      window.__stickyNotesListenerReady = true;
      
      const longObj = { data: 'x'.repeat(300) };
      console.error(longObj);
      
      const message = localThis.dispatchedEvents[0].detail.message;
      expect(message.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(message).toContain('...');
    });
  });
});
