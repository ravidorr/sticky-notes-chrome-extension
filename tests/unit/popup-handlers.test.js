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

    // Mock chrome.webNavigation globally (used directly in handleAddNote)
    globalThis.chrome = {
      ...globalThis.chrome,
      webNavigation: {
        getAllFrames: jest.fn().mockResolvedValue([{ frameId: 0 }])
      }
    };

    localThis.mockWindowClose = jest.fn();
    localThis.mockShowErrorToast = jest.fn();
    localThis.mockShowSuccessToast = jest.fn();
    
    localThis.deps = {
      log: localThis.mockLog,
      chromeRuntime: localThis.mockChromeRuntime,
      chromeTabs: localThis.mockChromeTabs,
      chromeScripting: localThis.mockChromeScripting,
      chromeStorage: localThis.mockChromeStorage,
      windowClose: localThis.mockWindowClose,
      showErrorToast: localThis.mockShowErrorToast,
      showSuccessToast: localThis.mockShowSuccessToast
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
      // Note: Toast not shown for restricted URL - button is disabled in UI before user can click
      expect(localThis.mockShowErrorToast).not.toHaveBeenCalled();
    });

    it('should enable selection mode when content script responds', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleAddNote();
      
      expect(result.success).toBe(true);
      expect(localThis.mockWindowClose).toHaveBeenCalled();
    });

    it('should send to all frames even if some fail', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      globalThis.chrome.webNavigation.getAllFrames.mockResolvedValue([
        { frameId: 0 },
        { frameId: 1 },
        { frameId: 2 }
      ]);

      // Some frames succeed, some fail - that's okay
      localThis.mockChromeTabs.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Frame not available'))
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true }); // fallback without frameId

      const result = await localThis.handlers.handleAddNote();

      expect(result.success).toBe(true);
      expect(localThis.mockWindowClose).toHaveBeenCalled();
    });

    it('should inject content script when getAllFrames fails', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      // getAllFrames throws an error
      globalThis.chrome.webNavigation.getAllFrames.mockRejectedValue(new Error('Receiving end does not exist'));
      
      // After injection, sendMessage succeeds
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      localThis.mockChromeScripting.executeScript.mockResolvedValue([{ result: true }]);

      const result = await localThis.handlers.handleAddNote();

      expect(result.success).toBe(true);
      expect(localThis.mockChromeScripting.executeScript).toHaveBeenCalled();
    });

    it('should handle injection failure', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      globalThis.chrome.webNavigation.getAllFrames.mockRejectedValue(new Error('Receiving end does not exist'));
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
      localThis.mockChromeScripting.executeScript.mockRejectedValue(new Error('Cannot inject'));

      const result = await localThis.handlers.handleAddNote();

      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should handle non-injection errors', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      globalThis.chrome.webNavigation.getAllFrames.mockRejectedValue(new Error('Unknown error'));

      const result = await localThis.handlers.handleAddNote();

      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });
  });

  describe('handleAddPageNote', () => {
    it('should return error when no active tab', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([]);
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No active tab found');
    });

    it('should return error for restricted URLs', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'chrome://extensions' }]);
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Restricted URL');
      // Note: Toast not shown for restricted URL - button is disabled in UI before user can click
      expect(localThis.mockShowErrorToast).not.toHaveBeenCalled();
    });

    it('should send createPageLevelNote message to content script', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(
        1, 
        { action: 'createPageLevelNote' }
      );
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
      expect(localThis.mockWindowClose).toHaveBeenCalled();
    });

    it('should show error toast on content script failure', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: false, error: 'Failed' });
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should inject content script and retry when content script not loaded', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage
        .mockRejectedValueOnce(new Error('Receiving end does not exist'))
        .mockResolvedValueOnce({ success: true });
      localThis.mockChromeScripting.executeScript.mockResolvedValue([{ result: true }]);
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(localThis.mockChromeScripting.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should fail immediately when retry gets success:false response (not infinite loop)', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage
        .mockRejectedValueOnce(new Error('Receiving end does not exist'))
        .mockResolvedValueOnce({ success: false, error: 'Content script failure' });
      localThis.mockChromeScripting.executeScript.mockResolvedValue([{ result: true }]);
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(localThis.mockChromeScripting.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Content script failure');
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
      // Should only call sendMessage twice (initial + one retry), not loop forever
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle injection failure', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
      localThis.mockChromeScripting.executeScript.mockRejectedValue(new Error('Cannot inject'));
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should handle non-injection errors', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('Unknown error'));
      
      const result = await localThis.handlers.handleAddPageNote();
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
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
  
  describe('renderNoteItem orphaned notes', () => {
    it('should render orphaned note with warning indicator', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test note', 
        theme: 'yellow', 
        selector: '#missing',
        isOrphaned: true 
      };
      const html = localThis.handlers.renderNoteItem(note);
      
      expect(html).toContain('note-item-orphaned');
      expect(html).toContain('data-orphaned="true"');
      expect(html).toContain('note-item-orphan-hint');
    });
    
    it('should not show orphan indicator for regular notes', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test note', 
        theme: 'yellow', 
        selector: '#main',
        isOrphaned: false 
      };
      const html = localThis.handlers.renderNoteItem(note);
      
      expect(html).not.toContain('note-item-orphaned');
      expect(html).not.toContain('data-orphaned="true"');
      expect(html).not.toContain('note-item-orphan-hint');
    });
  });
  
  describe('handleNoteClick with orphaned notes', () => {
    it('should send highlightNote action for regular notes', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'http://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      
      await localThis.handlers.handleNoteClick('note-1', false);
      
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(1, {
        action: 'highlightNote',
        noteId: 'note-1'
      });
    });
    
    it('should send showOrphanedNote action for orphaned notes', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'http://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      
      await localThis.handlers.handleNoteClick('note-1', true);
      
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(1, {
        action: 'showOrphanedNote',
        noteId: 'note-1'
      });
    });
    
    it('should close window after clicking orphaned note', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, url: 'http://example.com' }]);
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({ success: true });
      
      await localThis.handlers.handleNoteClick('note-1', true);
      
      expect(localThis.mockWindowClose).toHaveBeenCalled();
    });
  });

  describe('handleDeleteNote', () => {
    it('should delete note and show success toast', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleDeleteNote('note-123');
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        action: 'deleteNote',
        noteId: 'note-123'
      });
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should show error toast on failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Not found' });
      
      const result = await localThis.handlers.handleDeleteNote('note-123');
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should handle exceptions', async () => {
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const result = await localThis.handlers.handleDeleteNote('note-123');
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });
  });

  describe('handleDeleteAllFromPage', () => {
    it('should delete all notes and return count', async () => {
      const notes = [{ id: '1' }, { id: '2' }, { id: '3' }];
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleDeleteAllFromPage(notes);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledTimes(3);
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should handle partial failures', async () => {
      const notes = [{ id: '1' }, { id: '2' }];
      localThis.mockChromeRuntime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false });
      
      const result = await localThis.handlers.handleDeleteAllFromPage(notes);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });
  });

  describe('getAllNotes', () => {
    it('should return all notes', async () => {
      const mockNotes = [{ id: '1' }, { id: '2' }];
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true, notes: mockNotes });
      
      const result = await localThis.handlers.getAllNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual(mockNotes);
    });

    it('should return empty array on failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Error' });
      
      const result = await localThis.handlers.getAllNotes();
      
      expect(result.success).toBe(false);
      expect(result.notes).toEqual([]);
    });
  });

  describe('handleDeleteAllNotes', () => {
    it('should delete all notes and show success', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true, count: 5 });
      
      const result = await localThis.handlers.handleDeleteAllNotes();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should show error on failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Failed' });
      
      const result = await localThis.handlers.handleDeleteAllNotes();
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });
  });

  describe('handleShareNote', () => {
    it('should share note with valid email', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleShareNote('note-123', 'test@example.com');
      
      expect(result.success).toBe(true);
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should reject invalid email', async () => {
      const result = await localThis.handlers.handleShareNote('note-123', 'invalid-email');
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should handle share failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Permission denied' });
      
      const result = await localThis.handlers.handleShareNote('note-123', 'test@example.com');
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });
  });

  describe('handleLeaveNote', () => {
    it('should leave shared note and show success toast', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleLeaveNote('note-123');
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        action: 'leaveSharedNote',
        noteId: 'note-123'
      });
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should show error toast on failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Not in shared list' });
      
      const result = await localThis.handlers.handleLeaveNote('note-123');
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should handle exceptions', async () => {
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const result = await localThis.handlers.handleLeaveNote('note-123');
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });
  });

  describe('handleExportCSV', () => {
    let mockLink;
    let originalCreateElement;
    
    beforeEach(() => {
      // Mock URL.createObjectURL and URL.revokeObjectURL
      globalThis.URL.createObjectURL = jest.fn().mockReturnValue('blob:test');
      globalThis.URL.revokeObjectURL = jest.fn();
      
      // Mock document.createElement for anchor element
      mockLink = { 
        href: '',
        download: '',
        click: jest.fn() 
      };
      originalCreateElement = document.createElement.bind(document);
    });
    
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should export notes as CSV', async () => {
      jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') {
          return mockLink;
        }
        return originalCreateElement(tag);
      });
      
      const notes = [
        { id: '1', url: 'http://test.com', selector: '#main', content: 'Test', theme: 'yellow', createdAt: '2024-01-01', ownerEmail: 'test@test.com' }
      ];
      
      const result = await localThis.handlers.handleExportCSV(notes, 'test.csv');
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should show error when no notes to export', async () => {
      const result = await localThis.handlers.handleExportCSV([], 'test.csv');
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should escape CSV fields with commas', async () => {
      jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') {
          return mockLink;
        }
        return originalCreateElement(tag);
      });
      
      const notes = [
        { id: '1', url: 'http://test.com', selector: '#main', content: 'Test, with comma', theme: 'yellow' }
      ];
      
      const result = await localThis.handlers.handleExportCSV(notes, 'test.csv');
      
      expect(result.success).toBe(true);
    });

    it('should show error toast when export fails', async () => {
      jest.spyOn(document, 'createElement').mockImplementation(() => {
        throw new Error('Failed to create element');
      });
      
      const notes = [
        { id: '1', url: 'http://test.com', selector: '#main', content: 'Test', theme: 'yellow' }
      ];
      
      const result = await localThis.handlers.handleExportCSV(notes, 'test.csv');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create element');
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
      expect(localThis.mockLog.error).toHaveBeenCalledWith('Export CSV error:', expect.any(Error));
    });
  });

  describe('renderNoteItemExpanded', () => {
    it('should render note item with actions', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test note', 
        theme: 'blue', 
        selector: '#main',
        createdAt: new Date().toISOString(),
        ownerEmail: 'owner@test.com'
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('data-id="note-1"');
      expect(html).toContain('data-action="expand"');
      expect(html).toContain('data-action="share"');
      expect(html).toContain('data-action="delete"');
      expect(html).toContain('note-item-details');
    });

    it('should show shared badge for shared notes', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isShared: true
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('note-item-shared-badge');
    });

    it('should show leave button instead of delete for shared notes', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isShared: true
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('data-action="leave"');
      expect(html).not.toContain('data-action="delete"');
    });

    it('should hide share button for shared notes (non-owners cannot share)', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isShared: true
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).not.toContain('data-action="share"');
    });

    it('should show delete and share buttons for owned notes', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isShared: false
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('data-action="delete"');
      expect(html).toContain('data-action="share"');
      expect(html).not.toContain('data-action="leave"');
    });

    it('should show orphaned indicator', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#missing',
        isOrphaned: true
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('note-item-orphaned');
      expect(html).toContain('note-item-orphan-hint');
    });

    it('should display shared users list', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        sharedWith: ['user1@test.com', 'user2@test.com']
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('user1@test.com');
      expect(html).toContain('user2@test.com');
    });

    it('should show visibility toggle button', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main'
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('data-action="visibility"');
      expect(html).toContain('note-item-btn-visibility');
    });

    it('should show hidden indicator for hidden notes', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isHidden: true
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).toContain('note-item-hidden');
      expect(html).toContain('data-hidden="true"');
    });

    it('should not show hidden class for visible notes', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isHidden: false
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      expect(html).not.toContain('note-item-hidden');
      expect(html).not.toContain('data-hidden="true"');
    });

    it('should show eye icon for hidden note (click to show)', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isHidden: true
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      // Eye icon (show) should be present for hidden notes
      expect(html).toContain('M1 12s4-8 11-8 11 8 11 8');
    });

    it('should show eye-off icon for visible note (click to hide)', () => {
      const note = { 
        id: 'note-1', 
        content: 'Test', 
        theme: 'yellow', 
        selector: '#main',
        isHidden: false
      };
      const html = localThis.handlers.renderNoteItemExpanded(note);
      
      // Eye-off icon (hide) should be present for visible notes
      expect(html).toContain('M17.94 17.94');
    });
  });

  describe('formatTimestamp', () => {
    it('should format ISO date string', () => {
      const result = localThis.handlers.formatTimestamp('2024-01-15T12:00:00.000Z');
      expect(result).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should format Firestore timestamp', () => {
      const firestoreTimestamp = { seconds: 1705320000, nanoseconds: 0 };
      const result = localThis.handlers.formatTimestamp(firestoreTimestamp);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return empty string for null', () => {
      expect(localThis.handlers.formatTimestamp(null)).toBe('');
      expect(localThis.handlers.formatTimestamp(undefined)).toBe('');
    });
  });

  describe('showConfirmDialog', () => {
    beforeEach(() => {
      // Clean up any existing dialogs
      document.body.innerHTML = '';
    });

    afterEach(() => {
      // Clean up after each test
      document.body.innerHTML = '';
    });

    it('should create dialog with message and buttons', async () => {
      const promise = localThis.handlers.showConfirmDialog('Test message');
      
      const overlay = document.querySelector('.confirm-backdrop');
      const dialog = document.querySelector('.confirm-dialog');
      const message = document.querySelector('.confirm-message');
      const cancelBtn = document.querySelector('.confirm-btn-cancel');
      const confirmBtn = document.querySelector('.confirm-btn-confirm');
      
      expect(overlay).not.toBeNull();
      expect(dialog).not.toBeNull();
      expect(message.textContent).toBe('Test message');
      expect(cancelBtn).not.toBeNull();
      expect(confirmBtn).not.toBeNull();
      
      // Clean up by clicking cancel
      cancelBtn.click();
      await promise;
    });

    it('should resolve with false when cancel button is clicked', async () => {
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      const cancelBtn = document.querySelector('.confirm-btn-cancel');
      cancelBtn.click();
      
      const result = await promise;
      expect(result).toBe(false);
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });

    it('should resolve with true when confirm button is clicked', async () => {
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      const confirmBtn = document.querySelector('.confirm-btn-confirm');
      confirmBtn.click();
      
      const result = await promise;
      expect(result).toBe(true);
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });

    it('should resolve with false when backdrop is clicked', async () => {
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      const overlay = document.querySelector('.confirm-backdrop');
      // Simulate click on backdrop (not on dialog)
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: overlay });
      overlay.dispatchEvent(clickEvent);
      
      const result = await promise;
      expect(result).toBe(false);
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });

    it('should resolve with false when Escape key is pressed', async () => {
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);
      
      const result = await promise;
      expect(result).toBe(false);
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });

    it('should resolve with true when Enter key is pressed', async () => {
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      document.dispatchEvent(enterEvent);
      
      const result = await promise;
      expect(result).toBe(true);
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });

    it('should remove keydown listener when closed via cancel button click', async () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
      
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      // Get the handler that was registered
      const keydownCall = addEventListenerSpy.mock.calls.find(call => call[0] === 'keydown');
      expect(keydownCall).toBeDefined();
      const registeredHandler = keydownCall[1];
      
      // Close via cancel button
      const cancelBtn = document.querySelector('.confirm-btn-cancel');
      cancelBtn.click();
      await promise;
      
      // Verify the keydown listener was removed
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', registeredHandler);
      
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('should remove keydown listener when closed via confirm button click', async () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
      
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      const keydownCall = addEventListenerSpy.mock.calls.find(call => call[0] === 'keydown');
      const registeredHandler = keydownCall[1];
      
      // Close via confirm button
      const confirmBtn = document.querySelector('.confirm-btn-confirm');
      confirmBtn.click();
      await promise;
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', registeredHandler);
      
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('should remove keydown listener when closed via backdrop click', async () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
      
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      const keydownCall = addEventListenerSpy.mock.calls.find(call => call[0] === 'keydown');
      const registeredHandler = keydownCall[1];
      
      // Close via backdrop click
      const overlay = document.querySelector('.confirm-backdrop');
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: overlay });
      overlay.dispatchEvent(clickEvent);
      await promise;
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', registeredHandler);
      
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('should not accumulate keydown listeners across multiple dialogs', async () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
      
      // Open and close first dialog via mouse click
      const promise1 = localThis.handlers.showConfirmDialog('First');
      document.querySelector('.confirm-btn-cancel').click();
      await promise1;
      
      // Open and close second dialog via mouse click
      const promise2 = localThis.handlers.showConfirmDialog('Second');
      document.querySelector('.confirm-btn-confirm').click();
      await promise2;
      
      // Open and close third dialog via mouse click
      const promise3 = localThis.handlers.showConfirmDialog('Third');
      const overlay = document.querySelector('.confirm-backdrop');
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: overlay });
      overlay.dispatchEvent(clickEvent);
      await promise3;
      
      // Count keydown addEventListener and removeEventListener calls
      const keydownAddCalls = addEventListenerSpy.mock.calls.filter(call => call[0] === 'keydown');
      const keydownRemoveCalls = removeEventListenerSpy.mock.calls.filter(call => call[0] === 'keydown');
      
      // Each dialog should add and remove exactly one keydown listener
      expect(keydownAddCalls.length).toBe(3);
      expect(keydownRemoveCalls.length).toBe(3);
      
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('should ignore other keys', async () => {
      const promise = localThis.handlers.showConfirmDialog('Test');
      
      // Press a random key
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      document.dispatchEvent(tabEvent);
      
      // Dialog should still be open
      expect(document.querySelector('.confirm-backdrop')).not.toBeNull();
      
      // Clean up
      document.querySelector('.confirm-btn-cancel').click();
      await promise;
    });
  });

  describe('getUnreadSharedNotes', () => {
    it('should return notes on success', async () => {
      const mockNotes = [
        { id: 'note-1', content: 'Test note 1', url: 'https://example.com' },
        { id: 'note-2', content: 'Test note 2', url: 'https://example.com/page' }
      ];
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true, notes: mockNotes });
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual(mockNotes);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        action: 'getUnreadSharedNotes'
      });
    });

    it('should return empty array on failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Not logged in' });
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(false);
      expect(result.notes).toEqual([]);
    });

    it('should handle errors', async () => {
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(false);
      expect(result.notes).toEqual([]);
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });

  describe('getUnreadSharedCount', () => {
    it('should return count on success', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true, count: 5 });
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        action: 'getUnreadSharedCount'
      });
    });

    it('should return 0 on failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Error' });
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should handle errors', async () => {
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
    });
  });

  describe('markSharedNoteAsRead', () => {
    it('should mark note as read', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.markSharedNoteAsRead('note-123');
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        action: 'markSharedNoteRead',
        noteId: 'note-123'
      });
    });

    it('should handle failure', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false });
      
      const result = await localThis.handlers.markSharedNoteAsRead('note-123');
      
      expect(result.success).toBe(false);
    });

    it('should handle errors', async () => {
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Error'));
      
      const result = await localThis.handlers.markSharedNoteAsRead('note-123');
      
      expect(result.success).toBe(false);
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });

  describe('renderSharedNoteItem', () => {
    it('should render shared note with all fields', () => {
      const note = {
        id: 'note-123',
        content: 'Test note content',
        url: 'https://example.com/page/subpage',
        theme: 'blue',
        ownerEmail: 'owner@example.com',
        createdAt: new Date('2024-01-15T10:30:00Z')
      };
      
      const html = localThis.handlers.renderSharedNoteItem(note);
      
      expect(html).toContain('data-id="note-123"');
      expect(html).toContain('data-url="https://example.com/page/subpage"');
      expect(html).toContain('Test note content');
      expect(html).toContain('example.com/page/subpage');
      expect(html).toContain('owner@example.com');
    });

    it('should truncate long URLs', () => {
      const note = {
        id: 'note-123',
        content: 'Test',
        url: 'https://example.com/very/long/path/that/exceeds/forty/characters/limit/here',
        theme: 'yellow',
        ownerEmail: 'test@example.com'
      };
      
      const html = localThis.handlers.renderSharedNoteItem(note);
      
      expect(html).toContain('...');
    });

    it('should handle empty content', () => {
      const note = {
        id: 'note-123',
        content: '',
        url: 'https://example.com',
        theme: 'yellow'
      };
      
      const html = localThis.handlers.renderSharedNoteItem(note);
      
      // Should show empty note fallback text
      expect(html).toContain('note-123');
    });

    it('should handle missing owner email', () => {
      const note = {
        id: 'note-123',
        content: 'Test',
        url: 'https://example.com',
        theme: 'yellow',
        ownerEmail: null
      };
      
      const html = localThis.handlers.renderSharedNoteItem(note);
      
      // Should not crash and should render the note
      expect(html).toContain('data-id="note-123"');
    });
  });

  describe('renderEmptySharedNotes', () => {
    it('should render empty state message', () => {
      const html = localThis.handlers.renderEmptySharedNotes();
      
      expect(html).toContain('notes-empty');
      expect(html).toContain('svg');
    });
  });

  describe('filterNotesByAge', () => {
    it('should filter notes older than specified days', () => {
      const now = new Date();
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40 days ago
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago
      
      const notes = [
        { id: '1', content: 'Old note', createdAt: oldDate.toISOString() },
        { id: '2', content: 'Recent note', createdAt: recentDate.toISOString() },
        { id: '3', content: 'New note', createdAt: now.toISOString() }
      ];
      
      const result = localThis.handlers.filterNotesByAge(notes, 30);
      
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array for empty notes array', () => {
      const result = localThis.handlers.filterNotesByAge([], 30);
      expect(result).toEqual([]);
    });

    it('should return empty array for null notes', () => {
      const result = localThis.handlers.filterNotesByAge(null, 30);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid days (zero)', () => {
      const notes = [{ id: '1', createdAt: new Date().toISOString() }];
      const result = localThis.handlers.filterNotesByAge(notes, 0);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid days (negative)', () => {
      const notes = [{ id: '1', createdAt: new Date().toISOString() }];
      const result = localThis.handlers.filterNotesByAge(notes, -10);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid days (NaN)', () => {
      const notes = [{ id: '1', createdAt: new Date().toISOString() }];
      const result = localThis.handlers.filterNotesByAge(notes, NaN);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid days (Infinity)', () => {
      const notes = [{ id: '1', createdAt: new Date().toISOString() }];
      const result = localThis.handlers.filterNotesByAge(notes, Infinity);
      expect(result).toEqual([]);
    });

    it('should handle Firestore timestamp format', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      
      const notes = [
        { id: '1', content: 'Old note', createdAt: { seconds: Math.floor(oldDate.getTime() / 1000), nanoseconds: 0 } }
      ];
      
      const result = localThis.handlers.filterNotesByAge(notes, 30);
      
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('should skip notes without createdAt', () => {
      const notes = [
        { id: '1', content: 'No date' },
        { id: '2', content: 'Has date', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() }
      ];
      
      const result = localThis.handlers.filterNotesByAge(notes, 30);
      
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    it('should skip notes with invalid date', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      
      const notes = [
        { id: '1', content: 'Invalid date', createdAt: 'not-a-date' },
        { id: '2', content: 'Valid date', createdAt: oldDate.toISOString() }
      ];
      
      const result = localThis.handlers.filterNotesByAge(notes, 30);
      
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    it('should include notes exactly at the boundary (older)', () => {
      // Note created exactly 31 days ago at start of day should be included for 30 days filter
      const boundaryDate = new Date();
      boundaryDate.setDate(boundaryDate.getDate() - 31);
      boundaryDate.setHours(0, 0, 0, 0);
      
      const notes = [
        { id: '1', content: 'Boundary note', createdAt: boundaryDate.toISOString() }
      ];
      
      const result = localThis.handlers.filterNotesByAge(notes, 30);
      
      expect(result.length).toBe(1);
    });

    it('should return all notes when all are older than threshold', () => {
      const oldDate1 = new Date();
      oldDate1.setDate(oldDate1.getDate() - 100);
      const oldDate2 = new Date();
      oldDate2.setDate(oldDate2.getDate() - 50);
      
      const notes = [
        { id: '1', createdAt: oldDate1.toISOString() },
        { id: '2', createdAt: oldDate2.toISOString() }
      ];
      
      const result = localThis.handlers.filterNotesByAge(notes, 30);
      
      expect(result.length).toBe(2);
    });

    it('should return empty array when no notes are older than threshold', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      
      const notes = [
        { id: '1', createdAt: recentDate.toISOString() },
        { id: '2', createdAt: new Date().toISOString() }
      ];
      
      const result = localThis.handlers.filterNotesByAge(notes, 30);
      
      expect(result.length).toBe(0);
    });
  });

  describe('handleDeleteOldNotes', () => {
    it('should delete notes and return count', async () => {
      const notes = [{ id: '1' }, { id: '2' }, { id: '3' }];
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleDeleteOldNotes(notes);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledTimes(3);
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should return success with count 0 for empty array', async () => {
      const result = await localThis.handlers.handleDeleteOldNotes([]);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(localThis.mockChromeRuntime.sendMessage).not.toHaveBeenCalled();
    });

    it('should return success with count 0 for null input', async () => {
      const result = await localThis.handlers.handleDeleteOldNotes(null);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should handle partial failures', async () => {
      const notes = [{ id: '1' }, { id: '2' }, { id: '3' }];
      localThis.mockChromeRuntime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Permission denied' })
        .mockResolvedValueOnce({ success: true });
      
      const result = await localThis.handlers.handleDeleteOldNotes(notes);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].noteId).toBe('2');
    });

    it('should handle individual note exceptions', async () => {
      const notes = [{ id: '1' }, { id: '2' }];
      localThis.mockChromeRuntime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Network error'));
      
      const result = await localThis.handlers.handleDeleteOldNotes(notes);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toBe('Network error');
    });

    it('should not show toast if no notes were deleted', async () => {
      const notes = [{ id: '1' }];
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Failed' });
      
      const result = await localThis.handlers.handleDeleteOldNotes(notes);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(localThis.mockShowSuccessToast).not.toHaveBeenCalled();
    });

    it('should log errors for failed deletions', async () => {
      const notes = [{ id: '1' }];
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({ success: false, error: 'Not found' });
      
      await localThis.handlers.handleDeleteOldNotes(notes);
      
      expect(localThis.mockLog.error).toHaveBeenCalledWith('Some notes failed to delete:', expect.any(Array));
    });
  });

  describe('handleGenerateReport', () => {
    beforeEach(() => {
      // Mock URL for blob creation
      global.URL = {
        createObjectURL: jest.fn(() => 'blob:test'),
        revokeObjectURL: jest.fn()
      };
      
      // Mock Blob
      global.Blob = jest.fn().mockImplementation((content, options) => ({
        content,
        type: options?.type
      }));
      
      // Mock document for download
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn()
      };
      global.document = {
        createElement: jest.fn(() => mockLink),
        body: {
          appendChild: jest.fn(),
          removeChild: jest.fn()
        }
      };
      localThis.mockLink = mockLink;
    });

    it('should generate HTML report from current page notes', async () => {
      const currentPageNotes = [
        { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() },
        { id: '2', content: 'Note 2', theme: 'blue', url: 'https://example.com', createdAt: new Date() }
      ];
      
      const options = {
        format: 'html',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, currentPageNotes);
      
      expect(result.success).toBe(true);
      expect(result.filename).toMatch(/sticky-notes-report-.*\.html$/);
    });

    it('should generate Markdown report', async () => {
      const currentPageNotes = [
        { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() }
      ];
      
      const options = {
        format: 'markdown',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, currentPageNotes);
      
      expect(result.success).toBe(true);
      expect(result.filename).toMatch(/sticky-notes-report-.*\.md$/);
    });

    it('should fetch all notes for allNotes scope', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({
        success: true,
        notes: [
          { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() }
        ]
      });
      
      const options = {
        format: 'html',
        scope: 'allNotes',
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, []);
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledWith({ action: 'getAllNotes' });
    });

    it('should filter notes by selected IDs', async () => {
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({
        success: true,
        notes: [
          { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() },
          { id: '2', content: 'Note 2', theme: 'blue', url: 'https://example.com', createdAt: new Date() },
          { id: '3', content: 'Note 3', theme: 'green', url: 'https://example.com', createdAt: new Date() }
        ]
      });
      
      const options = {
        format: 'html',
        scope: 'selected',
        selectedNoteIds: ['1', '3'],
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, []);
      
      expect(result.success).toBe(true);
    });

    it('should return error when no notes are available', async () => {
      const options = {
        format: 'html',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, []);
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
    });

    it('should return error when selected scope has no selectedNoteIds', async () => {
      const options = {
        format: 'html',
        scope: 'selected',
        selectedNoteIds: [],
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, []);
      
      expect(result.success).toBe(false);
    });

    it('should filter notes by date range', async () => {
      const now = new Date();
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago
      
      const recentDate = new Date(now);
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago
      
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({
        success: true,
        notes: [
          { id: '1', content: 'Old note', theme: 'yellow', url: 'https://example.com', createdAt: oldDate },
          { id: '2', content: 'Recent note', theme: 'blue', url: 'https://example.com', createdAt: recentDate }
        ]
      });
      
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      
      const options = {
        format: 'html',
        scope: 'dateRange',
        dateRange: {
          start: startDate,
          end: now
        },
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, []);
      
      expect(result.success).toBe(true);
      // The generator filters by date range, so it should work
    });

    it('should generate PDF format (falls back to HTML with print mode)', async () => {
      const currentPageNotes = [
        { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() }
      ];
      
      // Mock window.open for print mode
      const mockPrintWindow = {
        document: {
          write: jest.fn(),
          close: jest.fn()
        },
        print: jest.fn()
      };
      global.window = { open: jest.fn(() => mockPrintWindow) };
      
      const options = {
        format: 'pdf',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: false
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, currentPageNotes);
      
      expect(result.success).toBe(true);
    });

    it('should fetch comments when includeComments is true', async () => {
      const currentPageNotes = [
        { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() }
      ];
      
      localThis.mockChromeRuntime.sendMessage.mockResolvedValue({
        success: true,
        comments: [{ id: 'c1', content: 'Test comment' }]
      });
      
      const options = {
        format: 'html',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: true
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, currentPageNotes);
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
        action: 'getCommentsForNote',
        noteId: '1'
      });
    });

    it('should continue generating report even if comments fail to load', async () => {
      const currentPageNotes = [
        { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() }
      ];
      
      localThis.mockChromeRuntime.sendMessage.mockRejectedValue(new Error('Comments failed'));
      
      const options = {
        format: 'html',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: true
      };
      
      const result = await localThis.handlers.handleGenerateReport(options, currentPageNotes);
      
      expect(result.success).toBe(true);
    });

    it('should show success toast when report is generated', async () => {
      const currentPageNotes = [
        { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() }
      ];
      
      const options = {
        format: 'html',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: false
      };
      
      await localThis.handlers.handleGenerateReport(options, currentPageNotes);
      
      expect(localThis.mockShowSuccessToast).toHaveBeenCalled();
    });

    it('should handle report generation errors', async () => {
      // Force an error by providing invalid data
      const options = {
        format: 'invalid-format',
        scope: 'currentPage',
        includeMetadata: false,
        includeComments: false
      };
      
      const currentPageNotes = [
        { id: '1', content: 'Note 1', theme: 'yellow', url: 'https://example.com', createdAt: new Date() }
      ];
      
      const result = await localThis.handlers.handleGenerateReport(options, currentPageNotes);
      
      expect(result.success).toBe(false);
      expect(localThis.mockShowErrorToast).toHaveBeenCalled();
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });
});
