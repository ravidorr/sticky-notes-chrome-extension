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

  describe('resubscribe after the background worker stops', () => {
    let mockConnect;
    let ports;
    let notes;

    const makePort = () => {
      const port = { disconnect: jest.fn(), onDisconnect: { addListener: jest.fn() } };
      ports.push(port);
      return port;
    };
    const dropPort = (index = ports.length - 1) => ports[index].onDisconnect.addListener.mock.calls[0][0]();

    beforeEach(() => {
      jest.useFakeTimers();
      ports = [];
      notes = new Map();
      mockConnect = jest.fn(makePort);
      mockGetNotes.mockImplementation(() => notes);
      mockSendMessage.mockResolvedValue({ success: true });
      realtimeSync = new RealtimeSync({
        sendMessage: mockSendMessage,
        isContextInvalidatedError: mockIsContextInvalidatedError,
        onNotesUpdate: mockOnNotesUpdate,
        onCommentsUpdate: mockOnCommentsUpdate,
        getNotes: mockGetNotes,
        connect: mockConnect
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns whether the subscription succeeded', async () => {
      expect(await realtimeSync.subscribeToNotes('url1')).toBe(true);

      mockSendMessage.mockResolvedValue({ success: false, error: 'no' });
      expect(await realtimeSync.subscribeToNotes('url1')).toBe(false);

      mockSendMessage.mockRejectedValue(new Error('boom'));
      expect(await realtimeSync.subscribeToNotes('url1')).toBe(false);
    });

    it('opens one port per subscription and reuses it', async () => {
      await realtimeSync.subscribeToNotes('url1');
      await realtimeSync.subscribeToNotes('url1');

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockConnect).toHaveBeenCalledWith({ name: 'realtimeSync' });
    });

    it('does not open a port when the subscription fails or connect is not set', async () => {
      mockSendMessage.mockResolvedValue({ success: false, error: 'no' });
      await realtimeSync.subscribeToNotes('url1');
      expect(mockConnect).not.toHaveBeenCalled();

      const plain = new RealtimeSync({
        sendMessage: mockSendMessage.mockResolvedValue({ success: true }),
        isContextInvalidatedError: mockIsContextInvalidatedError,
        onNotesUpdate: mockOnNotesUpdate,
        onCommentsUpdate: mockOnCommentsUpdate,
        getNotes: mockGetNotes
      });
      expect(await plain.subscribeToNotes('url1')).toBe(true);
      expect(plain.port).toBeNull();
    });

    it('resubscribes notes and subscribed comments when the port drops', async () => {
      await realtimeSync.subscribeToNotes('url1');
      notes.set('n1', { id: 'n1', commentSubscribed: true });
      notes.set('n2', { id: 'n2', commentSubscribed: false });
      mockSendMessage.mockClear();

      dropPort();
      expect(mockSendMessage).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockSendMessage.mock.calls.map(c => c[0])).toEqual([
        { action: 'subscribeToNotes', url: 'url1' },
        { action: 'subscribeToComments', noteId: 'n1' }
      ]);
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('does not resubscribe after an intentional unsubscribe', async () => {
      await realtimeSync.subscribeToNotes('url1');
      await realtimeSync.unsubscribeFromNotes();

      expect(ports[0].disconnect).toHaveBeenCalled();
      mockSendMessage.mockClear();
      dropPort();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('ignores a disconnect from a port that was already replaced', async () => {
      await realtimeSync.subscribeToNotes('url1');
      await realtimeSync.unsubscribeFromNotes();
      await realtimeSync.subscribeToNotes('url2');
      mockSendMessage.mockClear();

      dropPort(0);
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('does nothing when the port drops with no url', async () => {
      await realtimeSync.subscribeToNotes('url1');
      realtimeSync.notesUrl = null;
      mockSendMessage.mockClear();

      dropPort();
      await jest.advanceTimersByTimeAsync(5000);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('does not schedule two resubscribes at once', async () => {
      await realtimeSync.subscribeToNotes('url1');
      mockSendMessage.mockClear();

      dropPort();
      realtimeSync._scheduleResubscribe();
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('retries with backoff and then gives up', async () => {
      await realtimeSync.subscribeToNotes('url1');
      mockSendMessage.mockClear();
      mockSendMessage.mockResolvedValue({ success: false, error: 'no' });

      dropPort();
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(2000);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(4000 + 8000 + 16000);
      expect(mockSendMessage).toHaveBeenCalledTimes(5);
      await jest.advanceTimersByTimeAsync(60000);
      expect(mockSendMessage).toHaveBeenCalledTimes(5);
    });

    it('resets the retry count after a successful resubscribe', async () => {
      await realtimeSync.subscribeToNotes('url1');
      mockSendMessage.mockResolvedValueOnce({ success: false, error: 'no' });

      dropPort();
      await jest.advanceTimersByTimeAsync(1000 + 2000);

      expect(realtimeSync.resubscribeAttempts).toBe(0);
    });

    it('does not track a subscription cancelled while the request was in flight', async () => {
      let resolveSubscribe;
      mockSendMessage.mockImplementationOnce(() => new Promise(resolve => { resolveSubscribe = resolve; }));

      const pending = realtimeSync.subscribeToNotes('url1');
      await realtimeSync.unsubscribeFromNotes();
      resolveSubscribe({ success: true });

      expect(await pending).toBe(true);
      expect(realtimeSync.notesUrl).toBeNull();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('stops restoring when unsubscribed while a resubscribe is in flight', async () => {
      await realtimeSync.subscribeToNotes('url1');
      notes.set('n1', { id: 'n1', commentSubscribed: true });
      let resolveSubscribe;
      mockSendMessage.mockClear();
      mockSendMessage.mockImplementationOnce(() => new Promise(resolve => { resolveSubscribe = resolve; }));

      dropPort();
      await jest.advanceTimersByTimeAsync(1000);
      await realtimeSync.unsubscribeFromNotes();
      resolveSubscribe({ success: false, error: 'no' });
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockSendMessage.mock.calls.map(c => c[0].action)).toEqual([
        'subscribeToNotes',
        'unsubscribeFromNotes'
      ]);
    });

    it('stops retrying when the extension context is invalidated', async () => {
      await realtimeSync.subscribeToNotes('url1');
      mockSendMessage.mockClear();
      mockSendMessage.mockRejectedValue(new Error('Extension context invalidated.'));
      mockIsContextInvalidatedError.mockReturnValue(true);

      dropPort();
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(realtimeSync.notesUrl).toBeNull();
    });

    it('tolerates a port that throws on disconnect', async () => {
      await realtimeSync.subscribeToNotes('url1');
      ports[0].disconnect.mockImplementation(() => { throw new Error('closed'); });

      await expect(realtimeSync.unsubscribeFromNotes()).resolves.toBeUndefined();
    });

    it('warns when the port cannot be opened, but not on a context error', async () => {
      mockConnect.mockImplementation(() => { throw new Error('no receiver'); });
      await realtimeSync.subscribeToNotes('url1');
      expect(realtimeSync.port).toBeNull();

      mockIsContextInvalidatedError.mockReturnValue(true);
      await realtimeSync.subscribeToNotes('url1');
      expect(realtimeSync.port).toBeNull();
    });
  });
});
