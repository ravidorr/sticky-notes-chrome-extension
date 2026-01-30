/**
 * Tests for ConsoleCapture module
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConsoleCapture, getConsoleCapture } from '../../src/content/observers/ConsoleCapture.js';

describe('ConsoleCapture', () => {
  const localThis = {};
  
  beforeEach(() => {
    localThis.eventListeners = {};
    localThis.originalAddEventListener = window.addEventListener;
    localThis.originalRemoveEventListener = window.removeEventListener;
    
    window.addEventListener = jest.fn((type, handler) => {
      if (!localThis.eventListeners[type]) {
        localThis.eventListeners[type] = [];
      }
      localThis.eventListeners[type].push(handler);
    });
    
    window.removeEventListener = jest.fn((type, handler) => {
      if (localThis.eventListeners[type]) {
        localThis.eventListeners[type] = localThis.eventListeners[type].filter(listener => listener !== handler);
      }
    });
    
    // Create fresh instance
    localThis.consoleCapture = new ConsoleCapture();
  });
  
  afterEach(() => {
    window.addEventListener = localThis.originalAddEventListener;
    window.removeEventListener = localThis.originalRemoveEventListener;
    
    // Clear any captured errors
    if (localThis.consoleCapture) {
      localThis.consoleCapture.clear();
    }
    
    // Clean up window globals used for buffering
    delete window.__stickyNotesErrorBuffer;
    delete window.__stickyNotesListenerReady;
  });
  
  describe('constructor', () => {
    it('should initialize with empty errors array', () => {
      expect(localThis.consoleCapture.errors).toEqual([]);
    });
    
    it('should initialize with isInitialized false', () => {
      expect(localThis.consoleCapture.isInitialized).toBe(false);
    });
  });
  
  describe('init', () => {
    it('should set up event listener for custom events', () => {
      localThis.consoleCapture.init();
      
      expect(window.addEventListener).toHaveBeenCalledWith(
        '__stickyNotesError',
        expect.any(Function)
      );
    });
    
    it('should mark as initialized after init', () => {
      localThis.consoleCapture.init();
      expect(localThis.consoleCapture.isInitialized).toBe(true);
    });
    
    it('should not double initialize', () => {
      localThis.consoleCapture.init();
      localThis.consoleCapture.init();
      
      // Should only add listener once
      expect(localThis.eventListeners['__stickyNotesError']?.length || 0).toBe(1);
    });
    
    it('should set listener ready flag on window', () => {
      localThis.consoleCapture.init();
      expect(window.__stickyNotesListenerReady).toBe(true);
    });
    
    it('should process buffered errors on init', () => {
      // Set up buffer with errors before init
      window.__stickyNotesErrorBuffer = [
        { type: 'console.error', message: 'Early error 1', timestamp: Date.now() },
        { type: 'exception', message: 'Early error 2', timestamp: Date.now() }
      ];
      
      localThis.consoleCapture.init();
      
      expect(localThis.consoleCapture.errors).toHaveLength(2);
      expect(localThis.consoleCapture.errors[0].message).toBe('Early error 1');
      expect(localThis.consoleCapture.errors[1].message).toBe('Early error 2');
    });
    
    it('should clear buffer after processing', () => {
      window.__stickyNotesErrorBuffer = [
        { type: 'console.error', message: 'Buffered error', timestamp: Date.now() }
      ];
      
      localThis.consoleCapture.init();
      
      expect(window.__stickyNotesErrorBuffer).toEqual([]);
    });
  });
  
  describe('processBufferedErrors', () => {
    it('should handle missing buffer gracefully', () => {
      delete window.__stickyNotesErrorBuffer;
      
      expect(() => localThis.consoleCapture.processBufferedErrors()).not.toThrow();
      expect(localThis.consoleCapture.errors).toHaveLength(0);
    });
    
    it('should handle non-array buffer gracefully', () => {
      window.__stickyNotesErrorBuffer = 'not an array';
      
      expect(() => localThis.consoleCapture.processBufferedErrors()).not.toThrow();
      expect(localThis.consoleCapture.errors).toHaveLength(0);
    });
    
    it('should handle empty buffer', () => {
      window.__stickyNotesErrorBuffer = [];
      
      localThis.consoleCapture.processBufferedErrors();
      
      expect(localThis.consoleCapture.errors).toHaveLength(0);
    });
    
    it('should skip null entries in buffer', () => {
      window.__stickyNotesErrorBuffer = [
        null,
        { type: 'console.error', message: 'Valid error', timestamp: Date.now() },
        null
      ];
      
      localThis.consoleCapture.processBufferedErrors();
      
      expect(localThis.consoleCapture.errors).toHaveLength(1);
      expect(localThis.consoleCapture.errors[0].message).toBe('Valid error');
    });
    
    it('should trim to MAX_ERRORS when buffer exceeds limit', () => {
      // Create buffer with 25 errors
      window.__stickyNotesErrorBuffer = [];
      for (let i = 0; i < 25; i++) {
        window.__stickyNotesErrorBuffer.push({
          type: 'console.error',
          message: `Buffered error ${i}`,
          timestamp: Date.now() + i
        });
      }
      
      localThis.consoleCapture.processBufferedErrors();
      
      // Should be trimmed to MAX_ERRORS (20)
      expect(localThis.consoleCapture.errors.length).toBeLessThanOrEqual(20);
      // Should keep the most recent (later indices)
      expect(localThis.consoleCapture.errors[localThis.consoleCapture.errors.length - 1].message).toBe('Buffered error 24');
    });
  });
  
  describe('handleCapturedError', () => {
    beforeEach(() => {
      localThis.consoleCapture.init();
    });
    
    it('should capture console.error events', () => {
      const errorData = {
        type: 'console.error',
        message: 'Test error message',
        timestamp: Date.now()
      };
      
      // Simulate event dispatch
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({ detail: errorData });
      
      expect(localThis.consoleCapture.errors).toHaveLength(1);
      expect(localThis.consoleCapture.errors[0]).toEqual(errorData);
    });
    
    it('should capture console.warn events', () => {
      const warnData = {
        type: 'console.warn',
        message: 'Test warning message',
        timestamp: Date.now()
      };
      
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({ detail: warnData });
      
      expect(localThis.consoleCapture.errors).toHaveLength(1);
      expect(localThis.consoleCapture.errors[0].type).toBe('console.warn');
    });
    
    it('should capture exception events', () => {
      const exceptionData = {
        type: 'exception',
        message: 'Uncaught TypeError: foo is not a function',
        filename: 'script.js',
        line: 42,
        col: 10,
        timestamp: Date.now()
      };
      
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({ detail: exceptionData });
      
      expect(localThis.consoleCapture.errors).toHaveLength(1);
      expect(localThis.consoleCapture.errors[0].type).toBe('exception');
      expect(localThis.consoleCapture.errors[0].filename).toBe('script.js');
    });
    
    it('should capture unhandled promise rejection events', () => {
      const rejectionData = {
        type: 'unhandledrejection',
        message: 'Promise rejected: Network error',
        timestamp: Date.now()
      };
      
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({ detail: rejectionData });
      
      expect(localThis.consoleCapture.errors).toHaveLength(1);
      expect(localThis.consoleCapture.errors[0].type).toBe('unhandledrejection');
    });
    
    it('should ignore events without detail', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({ detail: null });
      handler({});
      
      expect(localThis.consoleCapture.errors).toHaveLength(0);
    });
    
    it('should limit errors to MAX_ERRORS', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      
      // Add 25 errors
      for (let i = 0; i < 25; i++) {
        handler({
          detail: {
            type: 'console.error',
            message: `Error ${i}`,
            timestamp: Date.now()
          }
        });
      }
      
      // Should only keep 20 (MAX_ERRORS)
      expect(localThis.consoleCapture.errors.length).toBeLessThanOrEqual(20);
      // Should keep the most recent
      expect(localThis.consoleCapture.errors[localThis.consoleCapture.errors.length - 1].message).toBe('Error 24');
    });
  });
  
  describe('getErrors', () => {
    beforeEach(() => {
      localThis.consoleCapture.init();
    });
    
    it('should return copy of errors array', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({
        detail: { type: 'console.error', message: 'Test', timestamp: Date.now() }
      });
      
      const errors = localThis.consoleCapture.getErrors();
      
      expect(errors).toHaveLength(1);
      expect(errors).not.toBe(localThis.consoleCapture.errors);
    });
  });
  
  describe('getRecentErrors', () => {
    beforeEach(() => {
      localThis.consoleCapture.init();
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      
      // Add 10 errors
      for (let i = 0; i < 10; i++) {
        handler({
          detail: { type: 'console.error', message: `Error ${i}`, timestamp: Date.now() + i }
        });
      }
    });
    
    it('should return last N errors', () => {
      const recent = localThis.consoleCapture.getRecentErrors(3);
      
      expect(recent).toHaveLength(3);
      expect(recent[0].message).toBe('Error 7');
      expect(recent[2].message).toBe('Error 9');
    });
    
    it('should default to 5 errors', () => {
      const recent = localThis.consoleCapture.getRecentErrors();
      expect(recent).toHaveLength(5);
    });
    
    it('should return all errors if count exceeds total', () => {
      const recent = localThis.consoleCapture.getRecentErrors(100);
      expect(recent).toHaveLength(10);
    });
  });
  
  describe('clear', () => {
    it('should clear all errors', () => {
      localThis.consoleCapture.init();
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({
        detail: { type: 'console.error', message: 'Test', timestamp: Date.now() }
      });
      
      expect(localThis.consoleCapture.errors).toHaveLength(1);
      
      localThis.consoleCapture.clear();
      
      expect(localThis.consoleCapture.errors).toHaveLength(0);
    });
  });
  
  describe('getCount', () => {
    it('should return correct count', () => {
      localThis.consoleCapture.init();
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      
      expect(localThis.consoleCapture.getCount()).toBe(0);
      
      handler({
        detail: { type: 'console.error', message: 'Error 1', timestamp: Date.now() }
      });
      handler({
        detail: { type: 'console.error', message: 'Error 2', timestamp: Date.now() }
      });
      
      expect(localThis.consoleCapture.getCount()).toBe(2);
    });
  });
  
  describe('formatForDisplay', () => {
    beforeEach(() => {
      localThis.consoleCapture.init();
    });
    
    it('should return empty string when no errors', () => {
      expect(localThis.consoleCapture.formatForDisplay()).toBe('');
    });
    
    it('should format errors for display', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      handler({
        detail: { type: 'console.error', message: 'Test error', timestamp: Date.now() }
      });
      
      const formatted = localThis.consoleCapture.formatForDisplay();
      
      expect(formatted).toContain('[Error]');
      expect(formatted).toContain('Test error');
    });
    
    it('should truncate long messages', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      const longMessage = 'A'.repeat(100);
      handler({
        detail: { type: 'console.error', message: longMessage, timestamp: Date.now() }
      });
      
      const formatted = localThis.consoleCapture.formatForDisplay();
      
      expect(formatted.length).toBeLessThan(longMessage.length + 20);
      expect(formatted).toContain('...');
    });
    
    it('should respect maxErrors parameter', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      for (let i = 0; i < 5; i++) {
        handler({
          detail: { type: 'console.error', message: `Error ${i}`, timestamp: Date.now() }
        });
      }
      
      const formatted = localThis.consoleCapture.formatForDisplay(2);
      const errorCount = (formatted.match(/\[Error\]/g) || []).length;
      
      expect(errorCount).toBe(2);
    });
  });
  
  describe('getForBugReport', () => {
    beforeEach(() => {
      localThis.consoleCapture.init();
    });
    
    it('should format errors for bug report', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      const timestamp = Date.now();
      
      handler({
        detail: {
          type: 'exception',
          message: 'TypeError: undefined is not a function',
          filename: 'app.js',
          line: 100,
          col: 5,
          timestamp
        }
      });
      
      const report = localThis.consoleCapture.getForBugReport();
      
      expect(report).toHaveLength(1);
      expect(report[0]).toEqual({
        type: 'exception',
        message: 'TypeError: undefined is not a function',
        timestamp: expect.any(String),
        filename: 'app.js',
        line: 100,
        col: 5
      });
    });
    
    it('should not include undefined optional fields', () => {
      const handler = localThis.eventListeners['__stickyNotesError'][0];
      
      handler({
        detail: {
          type: 'console.error',
          message: 'Simple error',
          timestamp: Date.now()
        }
      });
      
      const report = localThis.consoleCapture.getForBugReport();
      
      expect(report[0]).not.toHaveProperty('filename');
      expect(report[0]).not.toHaveProperty('line');
      expect(report[0]).not.toHaveProperty('col');
    });
  });
});

describe('getConsoleCapture singleton', () => {
  it('should return the same instance', () => {
    const instance1 = getConsoleCapture();
    const instance2 = getConsoleCapture();
    
    expect(instance1).toBe(instance2);
  });
});
