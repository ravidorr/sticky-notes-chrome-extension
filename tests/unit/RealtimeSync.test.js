import { jest } from '@jest/globals';
import { RealtimeSync } from '../../src/content/app/RealtimeSync.js';

describe('RealtimeSync', () => {
  let realtimeSync;
  let mockSendMessage;
  let mockIsContextInvalidatedError;
  let mockOnNotesUpdate;
  let mockOnCommentsUpdate;
  let mockGetNotes;
  
  beforeEach(() => {
    mockSendMessage = jest.fn();
    mockIsContextInvalidatedError = jest.fn().mockReturnValue(false);
    mockOnNotesUpdate = jest.fn();
    mockOnCommentsUpdate = jest.fn();
    mockGetNotes = jest.fn().mockReturnValue(new Map());

    realtimeSync = new RealtimeSync({
      sendMessage: mockSendMessage,
      isContextInvalidatedError: mockIsContextInvalidatedError,
      onNotesUpdate: mockOnNotesUpdate,
      onCommentsUpdate: mockOnCommentsUpdate,
      getNotes: mockGetNotes
    });
  });

  describe('subscribeToNotes', () => {
    it('should send subscribeToNotes message', async () => {
      mockSendMessage.mockResolvedValue({ success: true });
      await realtimeSync.subscribeToNotes('url1');
      
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: 'subscribeToNotes',
        url: 'url1'
      });
    });

    it('should handle failure response (log warning)', async () => {
      mockSendMessage.mockResolvedValue({ success: false, error: 'failed' });
      await realtimeSync.subscribeToNotes('url1');
      // No exception thrown, logs warning
    });

    it('should handle exception and log error', async () => {
      mockSendMessage.mockRejectedValue(new Error('network error'));
      mockIsContextInvalidatedError.mockReturnValue(false);
      await realtimeSync.subscribeToNotes('url1');
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });

    it('should handle context invalidated error silently', async () => {
      mockSendMessage.mockRejectedValue(new Error('context invalidated'));
      mockIsContextInvalidatedError.mockReturnValue(true);
      await realtimeSync.subscribeToNotes('url1');
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });
  });

  describe('unsubscribeFromNotes', () => {
    it('should send unsubscribeFromNotes message', async () => {
      mockSendMessage.mockResolvedValue({ success: true });
      await realtimeSync.unsubscribeFromNotes();
      
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: 'unsubscribeFromNotes'
      });
    });

    it('should handle exception and log error', async () => {
      mockSendMessage.mockRejectedValue(new Error('network error'));
      mockIsContextInvalidatedError.mockReturnValue(false);
      await realtimeSync.unsubscribeFromNotes();
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });

    it('should handle context invalidated error silently', async () => {
      mockSendMessage.mockRejectedValue(new Error('context invalidated'));
      mockIsContextInvalidatedError.mockReturnValue(true);
      await realtimeSync.unsubscribeFromNotes();
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });
  });

  describe('subscribeToComments', () => {
    it('should send subscribeToComments message', async () => {
      mockSendMessage.mockResolvedValue({ success: true });
      const mockNote = { commentSubscribed: false };
      mockGetNotes.mockReturnValue(new Map([['n1', mockNote]]));
      
      await realtimeSync.subscribeToComments('n1');
      
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: 'subscribeToComments',
        noteId: 'n1'
      });
      expect(mockNote.commentSubscribed).toBe(true);
    });

    it('should handle success when note not found in map', async () => {
      mockSendMessage.mockResolvedValue({ success: true });
      mockGetNotes.mockReturnValue(new Map());
      
      await realtimeSync.subscribeToComments('nonexistent');
      // Should not throw
    });

    it('should handle failure response', async () => {
      mockSendMessage.mockResolvedValue({ success: false, error: 'permission denied' });
      await realtimeSync.subscribeToComments('n1');
      // Should log warning but not throw
    });

    it('should handle exception and log error', async () => {
      mockSendMessage.mockRejectedValue(new Error('network error'));
      mockIsContextInvalidatedError.mockReturnValue(false);
      await realtimeSync.subscribeToComments('n1');
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });

    it('should handle context invalidated error silently', async () => {
      mockSendMessage.mockRejectedValue(new Error('context invalidated'));
      mockIsContextInvalidatedError.mockReturnValue(true);
      await realtimeSync.subscribeToComments('n1');
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });
  });

  describe('unsubscribeFromComments', () => {
    it('should send unsubscribeFromComments message', async () => {
      mockSendMessage.mockResolvedValue({ success: true });
      const mockNote = { commentSubscribed: true };
      mockGetNotes.mockReturnValue(new Map([['n1', mockNote]]));
      
      await realtimeSync.unsubscribeFromComments('n1');
      
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: 'unsubscribeFromComments',
        noteId: 'n1'
      });
      expect(mockNote.commentSubscribed).toBe(false);
    });

    it('should handle when note not found in map', async () => {
      mockSendMessage.mockResolvedValue({ success: true });
      mockGetNotes.mockReturnValue(new Map());
      
      await realtimeSync.unsubscribeFromComments('nonexistent');
      // Should not throw
    });

    it('should handle exception and log error', async () => {
      mockSendMessage.mockRejectedValue(new Error('network error'));
      mockIsContextInvalidatedError.mockReturnValue(false);
      await realtimeSync.unsubscribeFromComments('n1');
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });

    it('should handle context invalidated error silently', async () => {
      mockSendMessage.mockRejectedValue(new Error('context invalidated'));
      mockIsContextInvalidatedError.mockReturnValue(true);
      await realtimeSync.unsubscribeFromComments('n1');
      expect(mockIsContextInvalidatedError).toHaveBeenCalled();
    });
  });

  describe('unsubscribeFromAllComments', () => {
    it('should unsubscribe from all subscribed notes', async () => {
      const mockNotes = new Map([
        ['n1', { id: 'n1', commentSubscribed: true }],
        ['n2', { id: 'n2', commentSubscribed: false }],
        ['n3', { id: 'n3', commentSubscribed: true }]
      ]);
      mockGetNotes.mockReturnValue(mockNotes);
      mockSendMessage.mockResolvedValue({ success: true });

      await realtimeSync.unsubscribeFromAllComments();
      
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: 'unsubscribeFromComments',
        noteId: 'n1'
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: 'unsubscribeFromComments',
        noteId: 'n3'
      });
    });
  });

  describe('handleNotesUpdate', () => {
    it('should call onNotesUpdate callback', () => {
      const notes = [{ id: 'n1' }];
      realtimeSync.handleNotesUpdate(notes);
      expect(mockOnNotesUpdate).toHaveBeenCalledWith(notes);
    });
    
    it('should ignore null update', () => {
      realtimeSync.handleNotesUpdate(null);
      expect(mockOnNotesUpdate).not.toHaveBeenCalled();
    });
  });

  describe('handleCommentsUpdate', () => {
    it('should call onCommentsUpdate callback', () => {
      const comments = [{ id: 'c1' }];
      realtimeSync.handleCommentsUpdate('n1', comments);
      expect(mockOnCommentsUpdate).toHaveBeenCalledWith('n1', comments);
    });
  });
});
