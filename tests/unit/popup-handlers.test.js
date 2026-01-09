/**
 * Popup Handlers Unit Tests
 * 
 * Tests popup handlers with dependency injection.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createPopupHandlers } from '../../src/popup/handlers.js';

describe('Popup Handlers', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    
    localThis.mockUser = { uid: 'user-123', email: 'test@example.com', displayName: 'Test User', photoURL: null };
    
    localThis.mockLog = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    localThis.mockChromeRuntime = {
      sendMessage: jest.fn()
    };
    
    localThis.mockChromeTabs = {
      query: jest.fn(),
      sendMessage: jest.fn()
    };
    
    localThis.mockChromeScripting = {
      executeScript: jest.fn()
    };
    
    localThis.mockChromeStorage = {
      local: {
        get: jest.fn()
      }
    };
    
    localThis.mockWindowClose = jest.fn();
    localThis.mockAlert = jest.fn();
    
    localThis.deps = {
      log: localThis.mockLog,
      chromeRuntime: localThis.mockChromeRuntime,
      chromeTabs: localThis.mockChromeTabs,
      chromeScripting: localThis.mockChromeScripting,
      chromeStorage: localThis.mockChromeStorage,
      windowClose: localThis.mockWindowClose,
      alertFn: localThis.mockAlert
    };
    
    localThis.handlers = createPopupHandlers(localThis.deps);
  });

  describe('checkAuthState', () => {
    it('should return user when logged in', async () => {
      localThis.mockChromeStorage.local.get.mockResolvedValue({ user: localThis.mockUser });
      
      const user = await localThis.handlers.checkAuthState();
      
      expect(user).toEqual(localThis.mockUser);
    });

    it('should return null when not logged in', async () => {
      localThis.mockChromeStorage.local.get.mockResolvedValue({});
      
      const user = await localThis.handlers.checkAuthState();
      
      expect(user).toBeNull();
    });

    it('should return null on error', async () => {
      localThis.mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const user = await localThis.handlers.checkAuthState();
      
      expect(user).toBeNull();
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });

  describe('handleLogin', () => {
    it('should return user on successful login', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true, user: localThis.mockUser });
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(true);
      expect(result.user).toEqual(localThis.mockUser);
    });

    it('should return error on failed login', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Auth failed' });
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Auth failed');
    });

    it('should return error on exception', async () => {
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('handleLogout', () => {
    it('should return success on logout', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleLogout();
      
      expect(result.success).toBe(true);
    });

    it('should return error on exception', async () => {
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Logout error'));
      
      const result = await localThis.handlers.handleLogout();
      
      expect(result.success).toBe(false);
    });
  });

  describe('handleAddNote', () => {
    it('should return error when no active tab', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([]);
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No active tab found');
    });

    it('should return error for restricted URLs', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'chrome://extensions' }]);
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Restricted URL');
      // Note: Alert was removed - button is disabled in UI before user can click
      expect(localThis.mockAlert).not.toHaveBeenCalled();
    });

    it('should enable selection mode when content script responds', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(true);
      expect(localThis.mockWindowClose).toHaveBeenCalled();
    });

    it('should inject content script when not loaded', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      // First call fails (content script not loaded)
      localThis.mockChromeTabs.sendMessage
        .mockRejectedValueOnce(new Error('Receiving end does not exist'))
        .mockResolvedValueOnce({ success: true });
      
      localThis.mockChromeScripting.executeScript.mockResolvedValue([{ result: true }]);
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeScripting.executeScript).toHaveBeenCalled();
    });

    it('should retry after injection', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      // First call fails, then succeeds after injection
      localThis.mockChromeTabs.sendMessage
        .mockRejectedValueOnce(new Error('Receiving end does not exist'))
        .mockRejectedValueOnce(new Error('Still not ready'))
        .mockResolvedValueOnce({ success: true });
      
      localThis.mockChromeScripting.executeScript.mockResolvedValue([{ result: true }]);
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(true);
    });

    it('should handle injection failure', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
      localThis.mockChromeScripting.executeScript.mockRejectedValue(new Error('Cannot inject'));
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(false);
      expect(localThis.mockAlert).toHaveBeenCalled();
    });

    it('should handle non-injection errors', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('Unknown error'));
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(false);
      expect(localThis.mockAlert).toHaveBeenCalled();
    });
  });

  describe('loadNotesForCurrentTab', () => {
    it('should return notes for current tab', async () => {
      const mockNotes = [{ id: '1', content: 'Test' }];
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true, notes: mockNotes });
      
      const result = await localThis.handlers.loadNotesForCurrentTab();
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual(mockNotes);
    });

    it('should return empty array when no active tab', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([]);
      
      const result = await localThis.handlers.loadNotesForCurrentTab();
      
      expect(result.success).toBe(false);
      expect(result.notes).toEqual([]);
    });

    it('should return empty array on error', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Failed'));
      
      const result = await localThis.handlers.loadNotesForCurrentTab();
      
      expect(result.success).toBe(false);
      expect(result.notes).toEqual([]);
    });
  });

  describe('handleNoteClick', () => {
    it('should send highlight message and close window', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1 }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleNoteClick('note-123');
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(1, { action: 'highlightNote', noteId: 'note-123' });
      expect(localThis.mockWindowClose).toHaveBeenCalled();
    });

    it('should return error when no active tab', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([]);
      
      const result = await localThis.handlers.handleNoteClick('note-123');
      
      expect(result.success).toBe(false);
    });

    it('should return error on exception', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1 }]);
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('Failed'));
      
      const result = await localThis.handlers.handleNoteClick('note-123');
      
      expect(result.success).toBe(false);
    });
  });

  describe('getThemeColor', () => {
    it('should return correct theme colors', () => {
      expect(localThis.handlers.getThemeColor('yellow')).toBe('#facc15');
      expect(localThis.handlers.getThemeColor('blue')).toBe('#3b82f6');
      expect(localThis.handlers.getThemeColor('green')).toBe('#22c55e');
      expect(localThis.handlers.getThemeColor('pink')).toBe('#ec4899');
    });

    it('should default to yellow for unknown theme', () => {
      expect(localThis.handlers.getThemeColor('unknown')).toBe('#facc15');
      expect(localThis.handlers.getThemeColor(null)).toBe('#facc15');
    });
  });

  describe('truncateSelector', () => {
    it('should truncate long selectors', () => {
      const longSelector = 'body > div > section > article > p.content';
      const result = localThis.handlers.truncateSelector(longSelector);
      expect(result.length).toBeLessThanOrEqual(33);
    });

    it('should not truncate short selectors', () => {
      expect(localThis.handlers.truncateSelector('#main')).toBe('#main');
    });
  });

  describe('renderNoteItem', () => {
    it('should render note item HTML', () => {
      const note = { id: 'note-1', content: 'Test note', theme: 'blue', selector: '#main' };
      const html = localThis.handlers.renderNoteItem(note);
      
      expect(html).toContain('data-id="note-1"');
      expect(html).toContain('Test note');
      expect(html).toContain('#main');
    });

    it('should handle empty content', () => {
      const note = { id: 'note-1', content: '', theme: 'yellow', selector: '#main' };
      const html = localThis.handlers.renderNoteItem(note);
      
      // Check for either the i18n key or the translated message
      expect(html).toMatch(/Empty note|emptyNote/);
    });

    it('should strip HTML from content', () => {
      const note = { id: 'note-1', content: '<b>Bold</b> text', theme: 'yellow', selector: '#main' };
      const html = localThis.handlers.renderNoteItem(note);
      
      expect(html).not.toContain('<b>');
      expect(html).toContain('Bold text');
    });
  });

  describe('renderEmptyNotes', () => {
    it('should render empty state HTML', () => {
      const html = localThis.handlers.renderEmptyNotes();
      
      expect(html).toContain('notes-empty');
      // Check for either the i18n key or the translated message
      expect(html).toMatch(/No notes on this page yet|noNotesYet/);
    });
  });

  describe('injectContentScript', () => {
    it('should call executeScript with correct parameters', async () => {
      localThis.mockChromeScripting.executeScript.mockResolvedValue([{ result: true }]);
      
      await localThis.handlers.injectContentScript(123);
      
      expect(localThis.mockChromeScripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 123 },
        files: ['src/content/content.js']
      });
    });

    it('should throw on failure', async () => {
      localThis.mockChromeScripting.executeScript.mockRejectedValue(new Error('Injection failed'));
      
      await expect(localThis.handlers.injectContentScript(123))
        .rejects.toThrow('Could not inject content script');
    });
  });
});
