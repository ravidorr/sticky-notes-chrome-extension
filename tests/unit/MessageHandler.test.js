import { jest } from '@jest/globals';
import { MessageHandler } from '../../src/content/app/MessageHandler.js';

describe('MessageHandler', () => {
  let messageHandler;
  let mockApp;
  let mockChromeRuntime;

  beforeEach(() => {
    // Mock the app instance
    mockApp = {
      enableSelectionMode: jest.fn(),
      disableSelectionMode: jest.fn(),
      highlightNote: jest.fn(),
      highlightAndMaximizeNote: jest.fn(),
      showOrphanedNote: jest.fn(),
      handleUrlChange: jest.fn(),
      handleUserChange: jest.fn(),
      createNoteAtClick: jest.fn(),
      noteManager: {
        getAllNotesWithOrphanStatus: jest.fn().mockReturnValue([]),
        toggleAllVisibility: jest.fn().mockReturnValue(false),
        getNotesVisibility: jest.fn().mockReturnValue(true)
      },
      realtimeSync: {
        handleNotesUpdate: jest.fn(),
        handleCommentsUpdate: jest.fn()
      }
    };

    // Mock global chrome.runtime
    mockChromeRuntime = {
      onMessage: {
        addListener: jest.fn()
      }
    };
    global.chrome = {
      runtime: mockChromeRuntime
    };

    messageHandler = new MessageHandler({ app: mockApp });
  });

  describe('setup', () => {
    it('should register message listener', () => {
      messageHandler.setup();
      expect(mockChromeRuntime.onMessage.addListener).toHaveBeenCalledTimes(1);
    });

    it('should handle incoming messages correctly via the listener', () => {
      messageHandler.setup();
      const listener = mockChromeRuntime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();
      
      // Test ping
      listener({ action: 'ping' }, {}, sendResponse);
      // Since handleMessage is async, we can't easily await it here through the listener
      // effectively without making setup return something or using timers.
      // But we can verify it returns true to keep channel open.
      const result = listener({ action: 'ping' }, {}, sendResponse);
      expect(result).toBe(true);
    });
  });

  describe('handleMessage', () => {
    it('should handle ping', async () => {
      const result = await messageHandler.handleMessage({ action: 'ping' });
      expect(result).toEqual({ success: true, ready: true });
    });

    it('should handle enableSelectionMode', async () => {
      const result = await messageHandler.handleMessage({ action: 'enableSelectionMode' });
      expect(mockApp.enableSelectionMode).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle disableSelectionMode', async () => {
      const result = await messageHandler.handleMessage({ action: 'disableSelectionMode' });
      expect(mockApp.disableSelectionMode).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle highlightNote', async () => {
      const result = await messageHandler.handleMessage({ action: 'highlightNote', noteId: '123' });
      expect(mockApp.highlightNote).toHaveBeenCalledWith('123');
      expect(result).toEqual({ success: true });
    });

    it('should handle highlightAndMaximizeNote', async () => {
      const result = await messageHandler.handleMessage({ action: 'highlightAndMaximizeNote', noteId: '123' });
      expect(mockApp.highlightAndMaximizeNote).toHaveBeenCalledWith('123');
      expect(result).toEqual({ success: true });
    });

    it('should handle showOrphanedNote', async () => {
      const result = await messageHandler.handleMessage({ action: 'showOrphanedNote', noteId: '123' });
      expect(mockApp.showOrphanedNote).toHaveBeenCalledWith('123');
      expect(result).toEqual({ success: true });
    });

    it('should handle getNotesWithOrphanStatus', async () => {
      const notes = [{ id: '1', isOrphaned: true }];
      mockApp.noteManager.getAllNotesWithOrphanStatus.mockReturnValue(notes);
      
      const result = await messageHandler.handleMessage({ action: 'getNotesWithOrphanStatus' });
      expect(mockApp.noteManager.getAllNotesWithOrphanStatus).toHaveBeenCalled();
      expect(result).toEqual({ success: true, notes });
    });

    it('should handle pageLoaded/urlChanged', async () => {
      const url = 'http://example.com';
      await messageHandler.handleMessage({ action: 'pageLoaded', url });
      expect(mockApp.handleUrlChange).toHaveBeenCalledWith(url);

      await messageHandler.handleMessage({ action: 'urlChanged', url });
      expect(mockApp.handleUrlChange).toHaveBeenCalledWith(url);
    });

    it('should handle userChanged', async () => {
      const user = { id: 'u1' };
      await messageHandler.handleMessage({ action: 'userChanged', user });
      expect(mockApp.handleUserChange).toHaveBeenCalledWith(user);
    });

    it('should handle notesUpdated', async () => {
      const notes = [{ id: 'n1' }];
      await messageHandler.handleMessage({ action: 'notesUpdated', notes });
      expect(mockApp.realtimeSync.handleNotesUpdate).toHaveBeenCalledWith(notes);
    });

    it('should handle commentsUpdated', async () => {
      const comments = [{ id: 'c1' }];
      await messageHandler.handleMessage({ action: 'commentsUpdated', noteId: 'n1', comments });
      expect(mockApp.realtimeSync.handleCommentsUpdate).toHaveBeenCalledWith('n1', comments);
    });

    it('should handle subscriptionError (log only)', async () => {
      const result = await messageHandler.handleMessage({ action: 'subscriptionError', error: 'fail' });
      expect(result).toEqual({ success: true });
    });

    it('should handle createNoteAtClick', async () => {
      mockApp.createNoteAtClick.mockResolvedValue(true);
      const result = await messageHandler.handleMessage({ action: 'createNoteAtClick' });
      expect(mockApp.createNoteAtClick).toHaveBeenCalled();
      expect(result).toEqual({ success: true, created: true });
    });

    it('should handle createPageLevelNote', async () => {
      mockApp.createPageLevelNote = jest.fn().mockResolvedValue(true);
      
      const result = await messageHandler.handleMessage({ 
        action: 'createPageLevelNote', 
        position: { pageX: 100, pageY: 200 } 
      });
      
      expect(mockApp.createPageLevelNote).toHaveBeenCalledWith({ pageX: 100, pageY: 200 });
      expect(result).toEqual({ success: true, created: true });
    });

    it('should handle createPageLevelNote without position', async () => {
      mockApp.createPageLevelNote = jest.fn().mockResolvedValue(true);
      
      const result = await messageHandler.handleMessage({ action: 'createPageLevelNote' });
      
      expect(mockApp.createPageLevelNote).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ success: true, created: true });
    });

    it('should handle createPageLevelNote returning false', async () => {
      mockApp.createPageLevelNote = jest.fn().mockResolvedValue(false);
      
      const result = await messageHandler.handleMessage({ action: 'createPageLevelNote' });
      
      expect(result).toEqual({ success: true, created: false });
    });

    it('should handle toggleAllNotesVisibility', async () => {
      mockApp.noteManager.toggleAllVisibility.mockReturnValue(false);
      const result = await messageHandler.handleMessage({ action: 'toggleAllNotesVisibility' });
      expect(mockApp.noteManager.toggleAllVisibility).toHaveBeenCalled();
      expect(result).toEqual({ success: true, notesVisible: false });
    });

    it('should handle toggleAllNotesVisibility returning true', async () => {
      mockApp.noteManager.toggleAllVisibility.mockReturnValue(true);
      const result = await messageHandler.handleMessage({ action: 'toggleAllNotesVisibility' });
      expect(mockApp.noteManager.toggleAllVisibility).toHaveBeenCalled();
      expect(result).toEqual({ success: true, notesVisible: true });
    });

    it('should handle getNotesVisibility when visible', async () => {
      mockApp.noteManager.getNotesVisibility.mockReturnValue(true);
      const result = await messageHandler.handleMessage({ action: 'getNotesVisibility' });
      expect(mockApp.noteManager.getNotesVisibility).toHaveBeenCalled();
      expect(result).toEqual({ success: true, notesVisible: true });
    });

    it('should handle getNotesVisibility when hidden', async () => {
      mockApp.noteManager.getNotesVisibility.mockReturnValue(false);
      const result = await messageHandler.handleMessage({ action: 'getNotesVisibility' });
      expect(mockApp.noteManager.getNotesVisibility).toHaveBeenCalled();
      expect(result).toEqual({ success: true, notesVisible: false });
    });

    it('should return error for unknown action', async () => {
      const result = await messageHandler.handleMessage({ action: 'unknown' });
      expect(result).toEqual({ success: false, error: 'Unknown action' });
    });
  });
});
