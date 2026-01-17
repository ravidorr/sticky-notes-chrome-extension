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
});
