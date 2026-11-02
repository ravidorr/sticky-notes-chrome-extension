/**
 * Subscription Manager Unit Tests
 * Tests the subscription lifecycle (subscribe, unsubscribe, replace, cancel, tab close)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createSubscriptionManager } from '../../src/background/subscriptions.js';

// The manager receives getUserIfConfigured from the handlers. These tests keep the handler style
// dependencies (getCurrentUser, isFirebaseConfigured, chromeStorage) and derive it the same way.
function createManager(deps) {
  const getUserIfConfigured = async () => {
    if (deps.isFirebaseConfigured() === false) {
      const result = await deps.chromeStorage.local.get(['user']);
      return result.user || null;
    }
    return deps.getCurrentUser();
  };
  return createSubscriptionManager({ ...deps, getUserIfConfigured });
}

describe('Subscription manager', () => {
  const localThis = {};
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const SENDER = { tab: { id: 123 }, frameId: 0 };

  beforeEach(() => {
    jest.clearAllMocks();

    localThis.mockUser = { uid: 'user-123', email: 'test@example.com', displayName: 'Test User' };
    localThis.mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    localThis.mockChromeStorage = { local: { get: jest.fn().mockResolvedValue({}), set: jest.fn() } };
    localThis.mockChromeTabs = { sendMessage: jest.fn().mockResolvedValue({}) };
    localThis.deps = {
      getCurrentUser: jest.fn().mockResolvedValue(localThis.mockUser),
      isFirebaseConfigured: jest.fn().mockReturnValue(true),
      log: localThis.mockLog,
      chromeStorage: localThis.mockChromeStorage
    };
    localThis.build = (extra = {}) => createManager({ ...localThis.deps, ...extra });
    localThis.handlers = createManager(localThis.deps);
  });

  describe('subscribeNotes', () => {
    beforeEach(() => {
      localThis.deps.subscribeToNotesForUrl = jest.fn();
      localThis.deps.noteSubscriptions = new Map();
      localThis.mockChromeTabs = {
        query: jest.fn(),
        captureVisibleTab: jest.fn(),
        sendMessage: jest.fn()
      };
      localThis.deps.chromeTabs = localThis.mockChromeTabs;
      localThis.handlers = createManager(localThis.deps);
    });

    it('should subscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(mockUnsubscribe);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(result.success).toBe(true);
      expect(localThis.deps.subscribeToNotesForUrl).toHaveBeenCalledWith(
        'https://example.com',
        localThis.mockUser.uid,
        localThis.mockUser.email,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.subscribeNotes('https://example.com', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(result.success).toBe(false);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(result.success).toBe(false);
    });

    it('should clean up existing subscription before creating new one', async () => {
      const oldUnsubscribe = jest.fn();
      // Use composite key: tabId-frameId (frameId defaults to 0 for main frame)
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: oldUnsubscribe });
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(jest.fn());
      
      const sender = { tab: { id: 123 }, frameId: 0 };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(oldUnsubscribe).toHaveBeenCalled();
    });

    it('should use composite key with frameId for subscriptions', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(mockUnsubscribe);
      
      // Main frame subscription (frameId = 0)
      const mainFrameSender = { tab: { id: 123 }, frameId: 0 };
      await localThis.handlers.subscribeNotes('https://example.com', mainFrameSender);
      
      // iframe subscription (frameId = 456)
      const iframeSender = { tab: { id: 123 }, frameId: 456 };
      await localThis.handlers.subscribeNotes('https://example.com/iframe', iframeSender);
      
      // Both subscriptions should exist independently
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(true);
      expect(localThis.deps.noteSubscriptions.has('123-456')).toBe(true);
    });

    it('should default frameId to 0 when not provided', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(mockUnsubscribe);
      
      // Sender without explicit frameId
      const sender = { tab: { id: 123 } };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      // Should use '123-0' as the key
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(true);
    });

    it('should send updates to specific frame using frameId option', async () => {
      let notesCallback;
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockImplementation((url, uid, email, onNotes) => {
        notesCallback = onNotes;
        return jest.fn();
      });
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({});
      
      // Subscribe from an iframe (frameId = 456)
      const sender = { tab: { id: 123 }, frameId: 456 };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      // Simulate a notes update
      const mockNotes = [{ id: 'note-1', content: 'Test' }];
      notesCallback(mockNotes);
      
      // Verify sendMessage was called with frameId option
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'notesUpdated', notes: mockNotes },
        { frameId: 456 }
      );
    });

    it('should send error to specific frame using frameId option', async () => {
      let errorCallback;
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockImplementation((url, uid, email, onNotes, onError) => {
        errorCallback = onError;
        return jest.fn();
      });
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({});
      
      // Subscribe from an iframe (frameId = 789)
      const sender = { tab: { id: 123 }, frameId: 789 };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      // Simulate an error
      errorCallback(new Error('Subscription failed'));
      
      // Verify sendMessage was called with frameId option
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'subscriptionError', type: 'notes', error: 'Subscription failed' },
        { frameId: 789 }
      );
    });

  });

  describe('unsubscribeNotes', () => {
    beforeEach(() => {
      localThis.deps.noteSubscriptions = new Map();
      localThis.handlers = createManager(localThis.deps);
    });

    it('should unsubscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      // Use composite key: tabId-frameId
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: mockUnsubscribe });
      
      const sender = { tab: { id: 123 }, frameId: 0 };
      const result = await localThis.handlers.unsubscribeNotes(sender);
      
      expect(result.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(false);
    });

    it('should return success even when no subscription exists', async () => {
      const sender = { tab: { id: 123 }, frameId: 0 };
      const result = await localThis.handlers.unsubscribeNotes(sender);
      
      expect(result.success).toBe(true);
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.unsubscribeNotes({});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

    it('should only unsubscribe the specific frame', async () => {
      const mainFrameUnsubscribe = jest.fn();
      const iframeUnsubscribe = jest.fn();
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: mainFrameUnsubscribe });
      localThis.deps.noteSubscriptions.set('123-456', { unsubscribe: iframeUnsubscribe });
      
      // Unsubscribe only the iframe
      const iframeSender = { tab: { id: 123 }, frameId: 456 };
      const result = await localThis.handlers.unsubscribeNotes(iframeSender);
      
      expect(result.success).toBe(true);
      expect(iframeUnsubscribe).toHaveBeenCalled();
      expect(mainFrameUnsubscribe).not.toHaveBeenCalled();
      // Main frame subscription should still exist
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(true);
      expect(localThis.deps.noteSubscriptions.has('123-456')).toBe(false);
    });

    it('should default frameId to 0 when not provided', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: mockUnsubscribe });
      
      // Sender without explicit frameId
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.unsubscribeNotes(sender);
      
      expect(result.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(false);
    });
  });

  describe('subscribeCommentsHandler', () => {
    beforeEach(() => {
      localThis.deps.subscribeToComments = jest.fn();
      localThis.deps.commentSubscriptions = new Map();
      localThis.mockChromeTabs = {
        query: jest.fn(),
        captureVisibleTab: jest.fn(),
        sendMessage: jest.fn()
      };
      localThis.deps.chromeTabs = localThis.mockChromeTabs;
      localThis.handlers = createManager(localThis.deps);
    });

    it('should subscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToComments.mockReturnValue(mockUnsubscribe);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(true);
      expect(localThis.deps.subscribeToComments).toHaveBeenCalledWith(
        'note-1',
        localThis.mockUser,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.subscribeCommentsHandler('note-1', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(false);
    });

    it('should clean up existing subscription before creating new one', async () => {
      const oldUnsubscribe = jest.fn();
      localThis.deps.commentSubscriptions.set('123-note-1', oldUnsubscribe);
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToComments.mockReturnValue(jest.fn());
      
      const sender = { tab: { id: 123 } };
      await localThis.handlers.subscribeCommentsHandler('note-1', sender);
      
      expect(oldUnsubscribe).toHaveBeenCalled();
    });

  });

  describe('unsubscribeCommentsHandler', () => {
    beforeEach(() => {
      localThis.deps.commentSubscriptions = new Map();
      localThis.handlers = createManager(localThis.deps);
    });

    it('should unsubscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.commentSubscriptions.set('123-note-1', mockUnsubscribe);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.unsubscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(localThis.deps.commentSubscriptions.has('123-note-1')).toBe(false);
    });

    it('should return success even when no subscription exists', async () => {
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.unsubscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(true);
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.unsubscribeCommentsHandler('note-1', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

  });

  describe('subscribeNotes edge cases', () => {
    beforeEach(() => {
      localThis.noteSubscriptions = new Map();
      localThis.deps.subscribeToNotesForUrl = jest.fn().mockReturnValue(jest.fn());
      localThis.build2 = (extra = {}) => localThis.build({
        chromeTabs: localThis.mockChromeTabs,
        noteSubscriptions: localThis.noteSubscriptions,
        ...extra
      });
    });

    it('should require Firebase when only a cached user exists', async () => {
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ user: localThis.mockUser });

      const result = await localThis.build2().subscribeNotes('https://example.com', SENDER);

      expect(result).toEqual({ success: false, error: expect.any(String) });
      expect(localThis.deps.subscribeToNotesForUrl).not.toHaveBeenCalled();
    });

    it('should report an unavailable subscription service', async () => {
      const result = await localThis.build2({ subscribeToNotesForUrl: undefined })
        .subscribeNotes('https://example.com', SENDER);

      expect(result).toEqual({ success: false, error: 'Subscription service not available' });
    });

    it('should ignore an existing entry without an unsubscribe function', async () => {
      localThis.noteSubscriptions.set('123-0', {});

      const result = await localThis.build2().subscribeNotes('https://example.com', SENDER);

      expect(result.success).toBe(true);
    });

    const deferred = () => {
      const d = {};
      d.promise = new Promise(resolve => { d.resolve = resolve; });
      return d;
    };

    describe('replacing an existing subscription', () => {
      it('should still subscribe when releasing the existing note listener throws', async () => {
        const throwing = jest.fn(() => { throw new Error('release failed'); });
        localThis.noteSubscriptions.set('123-0', { url: 'https://example.com/old', unsubscribe: throwing });
        const newUnsubscribe = jest.fn();
        const handlers = localThis.build2({ subscribeToNotesForUrl: jest.fn().mockReturnValue(newUnsubscribe) });

        const result = await handlers.subscribeNotes('https://example.com/new', SENDER);

        expect(result).toEqual({ success: true });
        expect(throwing).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/new');
        expect(localThis.mockLog.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to release a subscription'), '123-0', expect.any(Error)
        );
      });

      it('should still subscribe when releasing the existing comment listener throws', async () => {
        const throwing = jest.fn(() => { throw new Error('release failed'); });
        const commentSubscriptions = new Map([['123-note-1', throwing]]);
        const newUnsubscribe = jest.fn();
        const handlers = localThis.build2({
          commentSubscriptions,
          subscribeToComments: jest.fn().mockReturnValue(newUnsubscribe)
        });

        const result = await handlers.subscribeCommentsHandler('note-1', SENDER);

        expect(result).toEqual({ success: true });
        expect(throwing).toHaveBeenCalledTimes(1);
        expect(commentSubscriptions.get('123-note-1')).toBe(newUnsubscribe);
      });

      it('should warn about an existing comment entry that is not a function and replace it', async () => {
        const commentSubscriptions = new Map([['123-note-1', {}]]);
        const newUnsubscribe = jest.fn();
        const handlers = localThis.build2({
          commentSubscriptions,
          subscribeToComments: jest.fn().mockReturnValue(newUnsubscribe)
        });

        await handlers.subscribeCommentsHandler('note-1', SENDER);

        expect(localThis.mockLog.warn).toHaveBeenCalledWith(
          expect.stringContaining('no unsubscribe function'), '123-note-1'
        );
        expect(commentSubscriptions.get('123-note-1')).toBe(newUnsubscribe);
      });
    });

    describe('missing unsubscribe functions and pending replacements', () => {
      it('should warn and replace a note entry without an unsubscribe function', async () => {
        localThis.noteSubscriptions.set('123-0', { url: 'https://example.com/old' });
        const handlers = localThis.build2();

        const result = await handlers.subscribeNotes('https://example.com/new', SENDER);

        expect(result).toEqual({ success: true });
        expect(localThis.mockLog.warn).toHaveBeenCalledWith(expect.any(String), '123-0');
        expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/new');
      });

      it('should drop a note entry without an unsubscribe function and say it was not released', async () => {
        localThis.noteSubscriptions.set('123-0', {});

        const result = await localThis.build2().unsubscribeNotes(SENDER);

        expect(result).toEqual({ success: true, released: false });
        expect(localThis.noteSubscriptions.size).toBe(0);
      });

      it('should drop a non-function comment entry and say it was not released', async () => {
        const commentSubscriptions = new Map([['123-note-1', {}]]);

        const result = await localThis.build2({ commentSubscriptions })
          .unsubscribeCommentsHandler('note-1', SENDER);

        expect(result).toEqual({ success: true, released: false });
        expect(commentSubscriptions.size).toBe(0);
      });

      it('should release the old and the new note listener once when unsubscribed while replacing', async () => {
        const oldUnsubscribe = jest.fn();
        const newUnsubscribe = jest.fn();
        const started = deferred();
        localThis.noteSubscriptions.set('123-0', { unsubscribe: oldUnsubscribe });
        const handlers = localThis.build2({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeNotes(SENDER);
        started.resolve(newUnsubscribe);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true });
        expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
        expect(newUnsubscribe).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.size).toBe(0);
      });

      it('should release the old and the new comment listener once when unsubscribed while replacing', async () => {
        const oldUnsubscribe = jest.fn();
        const newUnsubscribe = jest.fn();
        const started = deferred();
        const commentSubscriptions = new Map([['123-note-1', oldUnsubscribe]]);
        const handlers = localThis.build2({
          commentSubscriptions,
          subscribeToComments: jest.fn(() => started.promise)
        });

        const pending = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeCommentsHandler('note-1', SENDER);
        started.resolve(newUnsubscribe);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true });
        expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
        expect(newUnsubscribe).toHaveBeenCalledTimes(1);
        expect(commentSubscriptions.size).toBe(0);
      });

      it('should not keep the old entry when its release throws and the new subscribe fails', async () => {
        const throwing = jest.fn(() => { throw new Error('release failed'); });
        localThis.noteSubscriptions.set('123-0', { unsubscribe: throwing });
        const handlers = localThis.build2({
          subscribeToNotesForUrl: jest.fn().mockRejectedValue(new Error('subscribe failed'))
        });

        const result = await handlers.subscribeNotes('https://example.com', SENDER);

        expect(result).toEqual({ success: false, error: 'subscribe failed' });
        expect(localThis.noteSubscriptions.has('123-0')).toBe(false);
      });
    });

    describe('subscription store and desired state', () => {
      beforeEach(() => {
        localThis.commentSubscriptions = new Map();
        localThis.deps.subscribeToComments = jest.fn().mockReturnValue(jest.fn());
        localThis.store = {
          hydrate: jest.fn().mockResolvedValue({ notes: [], comments: [] }),
          saveNote: jest.fn(), removeNote: jest.fn(), saveComment: jest.fn(),
          removeComment: jest.fn(), removeTab: jest.fn()
        };
        localThis.build5 = (extra = {}) => localThis.build2({
          commentSubscriptions: localThis.commentSubscriptions,
          subscriptionStore: localThis.store,
          subscribeToComments: localThis.deps.subscribeToComments,
          ...extra
        });
      });

      it('should store the descriptor of a note subscribe request', async () => {
        await localThis.build5().subscribeNotes('https://example.com', SENDER);

        expect(localThis.store.saveNote).toHaveBeenCalledWith('123-0', { tabId: 123, frameId: 0, url: 'https://example.com' });
      });

      it('should store the descriptor of a comment subscribe request', async () => {
        await localThis.build5().subscribeCommentsHandler('note-1', SENDER);

        expect(localThis.store.saveComment).toHaveBeenCalledWith('123-note-1', { tabId: 123, noteId: 'note-1', tabUrl: undefined });

        await localThis.build5().subscribeCommentsHandler('note-2', { tab: { id: 123, url: 'https://example.com/page' } });
        expect(localThis.store.saveComment).toHaveBeenCalledWith('123-note-2', { tabId: 123, noteId: 'note-2', tabUrl: 'https://example.com/page' });
      });

      it('should keep a desired entry when a page-side subscribe fails', async () => {
        localThis.deps.getCurrentUser.mockResolvedValue(null);
        const handlers = localThis.build5();

        const notes = await handlers.subscribeNotes('https://example.com', SENDER);
        const comments = await handlers.subscribeCommentsHandler('note-1', SENDER);

        expect(notes.success).toBe(false);
        expect(comments.success).toBe(false);
        expect(localThis.store.saveNote).toHaveBeenCalledTimes(1);
        expect(localThis.store.removeNote).not.toHaveBeenCalled();
        expect(localThis.store.removeComment).not.toHaveBeenCalled();
        expect(await handlers.getRealtimeSyncStatus()).toEqual({ success: true, degraded: true, restorable: true });
      });

      it('should forget the descriptor on unsubscribe, even with no registered entry', async () => {
        const handlers = localThis.build5();

        await handlers.unsubscribeNotes(SENDER);
        await handlers.unsubscribeCommentsHandler('note-1', SENDER);

        expect(localThis.store.removeNote).toHaveBeenCalledWith('123-0');
        expect(localThis.store.removeComment).toHaveBeenCalledWith('123-note-1');
      });

      it('should forget every descriptor of a closed tab', async () => {
        await localThis.build5().releaseTab(123);

        expect(localThis.store.removeTab).toHaveBeenCalledWith(123);
      });

      it('should remove only its own entry when its tab is unreachable', async () => {
        const callbacks = {};
        localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
        const unsubscribeNote = jest.fn();
        const unsubscribeComment = jest.fn();
        const handlers = localThis.build5({
          subscribeToNotesForUrl: jest.fn((url, uid, email, onNotes) => { callbacks.notes = onNotes; return unsubscribeNote; }),
          subscribeToComments: jest.fn((noteId, user, onComments) => { callbacks.comments = onComments; return unsubscribeComment; })
        });

        await handlers.subscribeNotes('https://example.com', SENDER);
        await handlers.subscribeCommentsHandler('note-1', SENDER);
        callbacks.notes([]);
        callbacks.comments([]);
        await flush();

        expect(localThis.store.removeNote).toHaveBeenCalledWith('123-0');
        expect(localThis.store.removeComment).toHaveBeenCalledWith('123-note-1');
        expect(unsubscribeNote).toHaveBeenCalledTimes(1);
        expect(unsubscribeComment).toHaveBeenCalledTimes(1);
        expect(await handlers.getRealtimeSyncStatus()).toEqual({ success: true, degraded: false, restorable: true });
      });

      it('should keep a newer entry when an older listener finds its tab unreachable', async () => {
        const callbacks = [];
        localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
        const handlers = localThis.build5({
          subscribeToNotesForUrl: jest.fn((url, uid, email, onNotes) => { callbacks.push(onNotes); return jest.fn(); })
        });

        await handlers.subscribeNotes('https://example.com/a', SENDER);
        await handlers.subscribeNotes('https://example.com/b', SENDER);
        callbacks[0]([]);
        await flush();

        expect(localThis.store.removeNote).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/b');
      });

      it('should work without a store', async () => {
        const handlers = localThis.build2({ commentSubscriptions: localThis.commentSubscriptions });

        await expect(handlers.subscribeNotes('https://example.com', SENDER)).resolves.toEqual({ success: true });
        await expect(handlers.unsubscribeNotes(SENDER)).resolves.toEqual({ success: true });
        await expect(handlers.getRealtimeSyncStatus())
          .resolves.toEqual({ success: true, degraded: false, restorable: false });
      });

      it('should derive degraded from desired entries that have no listener', async () => {
        const handlers = localThis.build5();

        await handlers.subscribeNotes('https://example.com', SENDER);
        expect((await handlers.getRealtimeSyncStatus()).degraded).toBe(false);

        localThis.noteSubscriptions.clear();
        expect((await handlers.getRealtimeSyncStatus()).degraded).toBe(true);

        await handlers.unsubscribeNotes(SENDER);
        await handlers.subscribeCommentsHandler('note-1', SENDER);
        localThis.commentSubscriptions.clear();
        expect((await handlers.getRealtimeSyncStatus()).degraded).toBe(true);
      });

      describe('hydration', () => {
        it('should finish hydrating before requests, and let the requests win per key', async () => {
          const hydrated = deferred();
          localThis.store.hydrate.mockReturnValue(hydrated.promise);
          const subscribe = jest.fn().mockReturnValue(jest.fn());
          const handlers = localThis.build5({ subscribeToNotesForUrl: subscribe });

          const request = handlers.subscribeNotes('https://example.com/new', SENDER);
          await flush();
          expect(subscribe).not.toHaveBeenCalled();

          hydrated.resolve({
            notes: [
              { subKey: '123-0', tabId: 123, frameId: 0, url: 'https://example.com/old' },
              { subKey: '123-1', tabId: 123, frameId: 1, url: 'https://example.com/frame' }
            ],
            comments: [{ subKey: '123-note-9', tabId: 123, noteId: 'note-9' }]
          });

          expect(await request).toEqual({ success: true });
          expect(subscribe).toHaveBeenCalledTimes(1);
          expect(subscribe.mock.calls[0][0]).toBe('https://example.com/new');
          expect(localThis.store.hydrate).toHaveBeenCalledTimes(1);
          // The hydrated entries of other keys are desired but have no listener yet
          expect(await handlers.getRealtimeSyncStatus()).toEqual({ success: true, degraded: true, restorable: true });
        });

        it('should not bring back the stored entries of a tab that closed while hydrating', async () => {
          const hydrated = deferred();
          localThis.store.hydrate.mockReturnValue(hydrated.promise);
          const handlers = localThis.build5();

          const status = handlers.getRealtimeSyncStatus();
          await flush();
          const released = handlers.releaseTab(123);
          hydrated.resolve({
            notes: [{ subKey: '123-0', tabId: 123, frameId: 0, url: 'https://example.com/' }],
            comments: [{ subKey: '123-note-1', tabId: 123, noteId: 'note-1' }]
          });
          await released;

          expect(await status).toEqual({ success: true, degraded: false, restorable: true });
        });

        it('should keep working when the stored subscriptions cannot be read, and read them again later', async () => {
          localThis.store.hydrate.mockResolvedValueOnce(null);
          const handlers = localThis.build5();

          await expect(handlers.subscribeNotes('https://example.com', SENDER)).resolves.toEqual({ success: true });
          expect(localThis.store.hydrate).toHaveBeenCalledTimes(1);
          expect(localThis.store.saveNote).toHaveBeenCalledWith('123-0', expect.any(Object));

          await handlers.unsubscribeNotes(SENDER);
          expect(localThis.store.hydrate).toHaveBeenCalledTimes(2);
        });

        it('should add what a later successful read returns without replacing the requests', async () => {
          localThis.store.hydrate
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
              notes: [
                { subKey: '123-0', tabId: 123, frameId: 0, url: 'https://example.com/stale' },
                { subKey: '123-1', tabId: 123, frameId: 1, url: 'https://example.com/frame' }
              ],
              comments: []
            });
          const handlers = localThis.build5();

          await handlers.subscribeNotes('https://example.com/page', SENDER);
          await handlers.getRealtimeSyncStatus();

          expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/page');
          expect(await handlers.getRealtimeSyncStatus()).toEqual({ success: true, degraded: true, restorable: true });
        });
      });
    });

    describe('closed tabs', () => {
      it('should keep the second oldest closed tab when the limit is passed', async () => {
        const handlers = localThis.build2();

        for (let tabId = 1; tabId <= 501; tabId += 1) {
          handlers.releaseTab(tabId);
        }

        expect(await handlers.subscribeNotes('https://example.com', { tab: { id: 2 }, frameId: 0 }))
          .toEqual({ success: true, cancelled: true });
      });
    });

    describe('cancelled note subscribes', () => {
      it('should stop before subscribing when an unsubscribe arrives during the user lookup', async () => {
        const user = deferred();
        localThis.deps.getCurrentUser.mockImplementation(() => user.promise);
        const handlers = localThis.build2();

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeNotes(SENDER);
        user.resolve(localThis.mockUser);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true });
        expect(localThis.deps.subscribeToNotesForUrl).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.has('123-0')).toBe(false);
      });

      it('should not unsubscribe a newer subscription when an older one resumes after its lookup', async () => {
        const user = deferred();
        const newUnsubscribe = jest.fn();
        localThis.deps.getCurrentUser
          .mockImplementationOnce(() => user.promise)
          .mockResolvedValue(localThis.mockUser);
        const subscribe = jest.fn().mockReturnValue(newUnsubscribe);
        const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe });

        const pendingOld = handlers.subscribeNotes('https://example.com/old', SENDER);
        await flush();
        const pendingNew = handlers.subscribeNotes('https://example.com/new', SENDER);
        user.resolve(localThis.mockUser);

        expect(await pendingOld).toEqual({ success: true, cancelled: true });
        expect(await pendingNew).toEqual({ success: true });
        expect(subscribe).toHaveBeenCalledTimes(1);
        expect(newUnsubscribe).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/new');
      });

      it('should release the new listener when an unsubscribe arrives during an in-flight subscribe', async () => {
        const lateUnsubscribe = jest.fn();
        const started = deferred();
        const handlers = localThis.build2({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeNotes(SENDER);
        started.resolve(lateUnsubscribe);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true });
        expect(lateUnsubscribe).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.has('123-0')).toBe(false);
      });

      it('should leave exactly one listener, for the latest request, when a subscribe is replaced in flight', async () => {
        const oldUnsubscribe = jest.fn();
        const newUnsubscribe = jest.fn();
        const oldStarted = deferred();
        const subscribe = jest.fn()
          .mockImplementationOnce(() => oldStarted.promise)
          .mockReturnValueOnce(newUnsubscribe);
        const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe });

        const pendingOld = handlers.subscribeNotes('https://example.com/old', SENDER);
        await flush();
        const pendingNew = handlers.subscribeNotes('https://example.com/new', SENDER);
        oldStarted.resolve(oldUnsubscribe);

        expect(await pendingOld).toEqual({ success: true, cancelled: true });
        expect(await pendingNew).toEqual({ success: true });
        expect(subscribe).toHaveBeenCalledTimes(2);
        expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
        expect(newUnsubscribe).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.size).toBe(1);
        expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/new');
      });

      it('should start only the latest of several requests queued behind an in-flight subscribe', async () => {
        const oldUnsubscribe = jest.fn();
        const oldStarted = deferred();
        const subscribe = jest.fn()
          .mockImplementationOnce(() => oldStarted.promise)
          .mockReturnValue(jest.fn());
        const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe });

        const pendingOld = handlers.subscribeNotes('https://example.com/a', SENDER);
        await flush();
        const second = handlers.subscribeNotes('https://example.com/b', SENDER);
        const third = handlers.subscribeNotes('https://example.com/c', SENDER);
        oldStarted.resolve(oldUnsubscribe);

        expect(await pendingOld).toEqual({ success: true, cancelled: true });
        expect(await second).toEqual({ success: true, cancelled: true });
        expect(await third).toEqual({ success: true });
        expect(subscribe).toHaveBeenCalledTimes(2);
        expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/c');
      });

      it('should subscribe normally again after a cancel on the same key', async () => {
        const handlers = localThis.build2();

        await handlers.subscribeNotes('https://example.com', SENDER);
        await handlers.unsubscribeNotes(SENDER);
        const result = await handlers.subscribeNotes('https://example.com', SENDER);

        expect(result).toEqual({ success: true });
        expect(localThis.noteSubscriptions.has('123-0')).toBe(true);
      });

      it('should report a cancel when the newer subscribe fails, and keep that entry desired', async () => {
        const started = deferred();
        const oldUnsubscribe = jest.fn();
        localThis.deps.getCurrentUser
          .mockResolvedValueOnce(localThis.mockUser)
          .mockResolvedValueOnce(null);
        const subscribe = jest.fn(() => started.promise);
        const handlers = localThis.build2({
          subscribeToNotesForUrl: subscribe,
          subscriptionStore: { hydrate: jest.fn().mockResolvedValue({ notes: [], comments: [] }), saveNote: jest.fn(), removeNote: jest.fn() }
        });

        const pendingOld = handlers.subscribeNotes('https://example.com/old', SENDER);
        await flush();
        const newer = handlers.subscribeNotes('https://example.com/new', SENDER);
        started.resolve(oldUnsubscribe);

        expect((await newer).success).toBe(false);
        expect(await pendingOld).toEqual({ success: true, cancelled: true });
        expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.size).toBe(0);
        expect((await handlers.getRealtimeSyncStatus()).degraded).toBe(true);
      });

      it('should log a failing release instead of failing the subscribe', async () => {
        const started = deferred();
        const failing = jest.fn(() => { throw new Error('release failed'); });
        const handlers = localThis.build2({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeNotes(SENDER);
        started.resolve(failing);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true, released: false });
        expect(localThis.mockLog.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to release a subscription'),
          '123-0',
          expect.any(Error)
        );
      });

      it('should warn when a cancelled listener has no unsubscribe function', async () => {
        const started = deferred();
        const handlers = localThis.build2({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeNotes(SENDER);
        started.resolve(undefined);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true, released: false });
        expect(localThis.mockLog.warn).toHaveBeenCalledWith(
          expect.stringContaining('no unsubscribe function'),
          '123-0'
        );
      });

      it('should not let a late callback of a replaced listener remove the newer entry', async () => {
        const callbacks = [];
        const subscribe = jest.fn((url, uid, email, onNotes) => {
          callbacks.push(onNotes);
          return jest.fn();
        });
        localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('navigating'));
        const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe });

        await handlers.subscribeNotes('https://example.com/a', SENDER);
        await handlers.subscribeNotes('https://example.com/b', SENDER);
        callbacks[0]([]);
        await flush();

        expect(localThis.noteSubscriptions.get('123-0').url).toBe('https://example.com/b');
      });

      it('should replace a registered subscription without unsubscribing it twice', async () => {
        const first = jest.fn();
        const second = deferred();
        const subscribe = jest.fn()
          .mockReturnValueOnce(first)
          .mockImplementationOnce(() => second.promise);
        const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe });

        await handlers.subscribeNotes('https://example.com/a', SENDER);
        const pending = handlers.subscribeNotes('https://example.com/b', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeNotes(SENDER);
        second.resolve(jest.fn());
        await pending;
        await unsubscribed;

        expect(first).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.has('123-0')).toBe(false);
      });

      it('should only cancel the subscribe of its own tab and frame', async () => {
        const started = deferred();
        const unsubscribe = jest.fn();
        const handlers = localThis.build2({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        await handlers.unsubscribeNotes({ tab: { id: 123 }, frameId: 1 });
        await handlers.unsubscribeNotes({ tab: { id: 456 }, frameId: 0 });
        started.resolve(unsubscribe);

        expect(await pending).toEqual({ success: true });
        expect(unsubscribe).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.has('123-0')).toBe(true);
      });
    });

    describe('cancelled comment subscribes', () => {
      beforeEach(() => {
        localThis.commentSubscriptions = new Map();
        localThis.deps.subscribeToComments = jest.fn().mockReturnValue(jest.fn());
        localThis.build3 = (extra = {}) => localThis.build2({
          commentSubscriptions: localThis.commentSubscriptions,
          subscribeToComments: localThis.deps.subscribeToComments,
          ...extra
        });
      });

      it('should stop before subscribing when an unsubscribe arrives during the user lookup', async () => {
        const user = deferred();
        localThis.deps.getCurrentUser.mockImplementation(() => user.promise);
        const handlers = localThis.build3();

        const pending = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeCommentsHandler('note-1', SENDER);
        user.resolve(localThis.mockUser);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true });
        expect(localThis.deps.subscribeToComments).not.toHaveBeenCalled();
        expect(localThis.commentSubscriptions.has('123-note-1')).toBe(false);
      });

      it('should not unsubscribe a newer subscription when an older one resumes after its lookup', async () => {
        const user = deferred();
        const newUnsubscribe = jest.fn();
        localThis.deps.getCurrentUser
          .mockImplementationOnce(() => user.promise)
          .mockResolvedValue(localThis.mockUser);
        const subscribe = jest.fn().mockReturnValue(newUnsubscribe);
        const handlers = localThis.build3({ subscribeToComments: subscribe });

        const pendingOld = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        const pendingNew = handlers.subscribeCommentsHandler('note-1', SENDER);
        user.resolve(localThis.mockUser);

        expect(await pendingOld).toEqual({ success: true, cancelled: true });
        expect(await pendingNew).toEqual({ success: true });
        expect(subscribe).toHaveBeenCalledTimes(1);
        expect(newUnsubscribe).not.toHaveBeenCalled();
        expect(localThis.commentSubscriptions.get('123-note-1')).toBe(newUnsubscribe);
      });

      it('should release a comment listener that finishes starting after an unsubscribe', async () => {
        const lateUnsubscribe = jest.fn();
        const started = deferred();
        const handlers = localThis.build3({ subscribeToComments: jest.fn(() => started.promise) });

        const pending = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeCommentsHandler('note-1', SENDER);
        started.resolve(lateUnsubscribe);

        expect(await pending).toEqual({ success: true, cancelled: true });
        expect(await unsubscribed).toEqual({ success: true });
        expect(lateUnsubscribe).toHaveBeenCalledTimes(1);
        expect(localThis.commentSubscriptions.has('123-note-1')).toBe(false);
      });

      it('should leave exactly one comment listener when a subscribe is replaced in flight', async () => {
        const oldUnsubscribe = jest.fn();
        const newUnsubscribe = jest.fn();
        const oldStarted = deferred();
        const subscribe = jest.fn()
          .mockImplementationOnce(() => oldStarted.promise)
          .mockReturnValueOnce(newUnsubscribe);
        const handlers = localThis.build3({ subscribeToComments: subscribe });

        const pendingOld = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        const pendingNew = handlers.subscribeCommentsHandler('note-1', SENDER);
        oldStarted.resolve(oldUnsubscribe);

        expect(await pendingOld).toEqual({ success: true, cancelled: true });
        expect(await pendingNew).toEqual({ success: true });
        expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
        expect(newUnsubscribe).not.toHaveBeenCalled();
        expect(localThis.commentSubscriptions.size).toBe(1);
        expect(localThis.commentSubscriptions.get('123-note-1')).toBe(newUnsubscribe);
      });

      it('should log a failing release and warn about a missing unsubscribe function', async () => {
        const failing = jest.fn(() => { throw new Error('release failed'); });
        for (const late of [failing, undefined]) {
          const started = deferred();
          const handlers = localThis.build3({ subscribeToComments: jest.fn(() => started.promise) });

          const pending = handlers.subscribeCommentsHandler('note-1', SENDER);
          await flush();
          const unsubscribed = handlers.unsubscribeCommentsHandler('note-1', SENDER);
          started.resolve(late);

          expect(await pending).toEqual({ success: true, cancelled: true });
          expect(await unsubscribed).toEqual({ success: true, released: false });
        }
        expect(localThis.mockLog.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to release a subscription'),
          '123-note-1',
          expect.any(Error)
        );
        expect(localThis.mockLog.warn).toHaveBeenCalledWith(
          expect.stringContaining('no unsubscribe function'),
          '123-note-1'
        );
      });

      it('should not let a late callback of a replaced listener remove the newer entry', async () => {
        const callbacks = [];
        const newUnsubscribe = jest.fn();
        const subscribe = jest.fn()
          .mockImplementationOnce((noteId, user, onComments) => {
            callbacks.push(onComments);
            return jest.fn();
          })
          .mockReturnValueOnce(newUnsubscribe);
        localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('navigating'));
        const handlers = localThis.build3({ subscribeToComments: subscribe });

        await handlers.subscribeCommentsHandler('note-1', SENDER);
        await handlers.subscribeCommentsHandler('note-1', SENDER);
        callbacks[0]([]);
        await flush();

        expect(localThis.commentSubscriptions.get('123-note-1')).toBe(newUnsubscribe);
        expect(newUnsubscribe).not.toHaveBeenCalled();
      });

      it('should replace a registered comment subscription without unsubscribing it twice', async () => {
        const first = jest.fn();
        const second = deferred();
        const subscribe = jest.fn()
          .mockReturnValueOnce(first)
          .mockImplementationOnce(() => second.promise);
        const handlers = localThis.build3({ subscribeToComments: subscribe });

        await handlers.subscribeCommentsHandler('note-1', SENDER);
        const pending = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        const unsubscribed = handlers.unsubscribeCommentsHandler('note-1', SENDER);
        second.resolve(jest.fn());
        await pending;
        await unsubscribed;

        expect(first).toHaveBeenCalledTimes(1);
        expect(localThis.commentSubscriptions.has('123-note-1')).toBe(false);
      });

      it('should only cancel the subscribe of its own tab and note', async () => {
        const started = deferred();
        const unsubscribe = jest.fn();
        const handlers = localThis.build3({ subscribeToComments: jest.fn(() => started.promise) });

        const pending = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        await handlers.unsubscribeCommentsHandler('note-2', SENDER);
        await handlers.unsubscribeCommentsHandler('note-1', { tab: { id: 456 }, frameId: 0 });
        await handlers.unsubscribeNotes(SENDER);
        started.resolve(unsubscribe);

        expect(await pending).toEqual({ success: true });
        expect(unsubscribe).not.toHaveBeenCalled();
        expect(localThis.commentSubscriptions.has('123-note-1')).toBe(true);
      });
    });

    describe('releaseTab', () => {
      beforeEach(() => {
        localThis.commentSubscriptions = new Map();
        localThis.build4 = (extra = {}) => localThis.build2({
          commentSubscriptions: localThis.commentSubscriptions,
          subscribeToComments: localThis.deps.subscribeToComments,
          ...extra
        });
      });

      it('should release the note and comment subscriptions of every frame of the tab only', async () => {
        const unsubs = {
          tab0: jest.fn(), tab1: jest.fn(), other: jest.fn(),
          c1: jest.fn(), c2: jest.fn(), cOther: jest.fn()
        };
        localThis.noteSubscriptions.set('123-0', { unsubscribe: unsubs.tab0 });
        localThis.noteSubscriptions.set('123-1', { unsubscribe: unsubs.tab1 });
        localThis.noteSubscriptions.set('1234-0', { unsubscribe: unsubs.other });
        localThis.commentSubscriptions.set('123-note-1', unsubs.c1);
        localThis.commentSubscriptions.set('123-note-2', unsubs.c2);
        localThis.commentSubscriptions.set('12-note-1', unsubs.cOther);

        await localThis.build4().releaseTab(123);

        for (const key of ['tab0', 'tab1', 'c1', 'c2']) {
          expect(unsubs[key]).toHaveBeenCalledTimes(1);
        }
        expect(unsubs.other).not.toHaveBeenCalled();
        expect(unsubs.cOther).not.toHaveBeenCalled();
        expect([...localThis.noteSubscriptions.keys()]).toEqual(['1234-0']);
        expect([...localThis.commentSubscriptions.keys()]).toEqual(['12-note-1']);
      });

      it('should log a failing release and still release the rest', async () => {
        const failing = jest.fn(() => { throw new Error('release failed'); });
        const healthy = jest.fn();
        localThis.noteSubscriptions.set('123-0', { unsubscribe: failing });
        localThis.noteSubscriptions.set('123-1', { unsubscribe: healthy });
        localThis.commentSubscriptions.set('123-note-1', failing);
        localThis.commentSubscriptions.set('123-note-2', healthy);

        await localThis.build4().releaseTab(123);

        expect(healthy).toHaveBeenCalledTimes(2);
        expect(localThis.noteSubscriptions.size).toBe(0);
        expect(localThis.commentSubscriptions.size).toBe(0);
        expect(localThis.mockLog.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to release a subscription'), '123-0', expect.any(Error)
        );
        expect(localThis.mockLog.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to release a subscription'), '123-note-1', expect.any(Error)
        );
      });

      it('should cancel a note subscribe that is still starting when the tab closes', async () => {
        const started = deferred();
        const lateUnsubscribe = jest.fn();
        const handlers = localThis.build4({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const released = handlers.releaseTab(123);
        started.resolve(lateUnsubscribe);

        expect(await pending).toEqual({ success: true, cancelled: true });
        await released;
        expect(lateUnsubscribe).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.size).toBe(0);
      });

      it('should cancel a comment subscribe that is still starting when the tab closes', async () => {
        const started = deferred();
        const lateUnsubscribe = jest.fn();
        const handlers = localThis.build4({ subscribeToComments: jest.fn(() => started.promise) });

        const pending = handlers.subscribeCommentsHandler('note-1', SENDER);
        await flush();
        const released = handlers.releaseTab(123);
        started.resolve(lateUnsubscribe);

        expect(await pending).toEqual({ success: true, cancelled: true });
        await released;
        expect(lateUnsubscribe).toHaveBeenCalledTimes(1);
        expect(localThis.commentSubscriptions.size).toBe(0);
      });

      it('should cancel a subscribe that is still looking up the user when the tab closes', async () => {
        const user = deferred();
        localThis.deps.getCurrentUser.mockImplementation(() => user.promise);
        const handlers = localThis.build4();

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const released = handlers.releaseTab(123);
        user.resolve(localThis.mockUser);

        expect(await pending).toEqual({ success: true, cancelled: true });
        await released;
        expect(localThis.deps.subscribeToNotesForUrl).not.toHaveBeenCalled();
      });

      it('should not affect a subscribe of another tab', async () => {
        const started = deferred();
        const unsubscribe = jest.fn();
        const handlers = localThis.build4({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', SENDER);
        await flush();
        const released = handlers.releaseTab(456);
        started.resolve(unsubscribe);

        expect(await pending).toEqual({ success: true });
        await released;
        expect(unsubscribe).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.has('123-0')).toBe(true);
      });

      it('should cancel a subscribe that is starting when the tab closes and refuse a later one for it', async () => {
        const oldStarted = deferred();
        const oldUnsubscribe = jest.fn();
        const subscribe = jest.fn().mockImplementationOnce(() => oldStarted.promise);
        const handlers = localThis.build4({ subscribeToNotesForUrl: subscribe });

        const pendingOld = handlers.subscribeNotes('https://example.com/old', SENDER);
        await flush();
        const released = handlers.releaseTab(123);
        const late = await handlers.subscribeNotes('https://example.com/new', SENDER);
        oldStarted.resolve(oldUnsubscribe);

        expect(late).toEqual({ success: true, cancelled: true });
        expect(await pendingOld).toEqual({ success: true, cancelled: true });
        await released;
        expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
        expect(subscribe).toHaveBeenCalledTimes(1);
        expect(localThis.noteSubscriptions.size).toBe(0);
      });

      it('should keep a subscribe that is starting for a tab whose id is a prefix match', async () => {
        const started = deferred();
        const unsubscribe = jest.fn();
        const handlers = localThis.build4({ subscribeToNotesForUrl: jest.fn(() => started.promise) });

        const pending = handlers.subscribeNotes('https://example.com', { tab: { id: 1234 }, frameId: 0 });
        await flush();
        const released = Promise.all([handlers.releaseTab(12), handlers.releaseTab(123)]);
        started.resolve(unsubscribe);

        expect(await pending).toEqual({ success: true });
        await released;
        expect(unsubscribe).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.has('1234-0')).toBe(true);
      });

      it('should release only once and register nothing for a tab after it was released', async () => {
        const unsubscribe = jest.fn();
        localThis.noteSubscriptions.set('123-0', { unsubscribe });
        const subscribe = jest.fn().mockReturnValue(jest.fn());
        const subscribeComments = jest.fn().mockReturnValue(jest.fn());
        const handlers = localThis.build4({
          subscribeToNotesForUrl: subscribe,
          subscribeToComments: subscribeComments
        });

        await handlers.releaseTab(123);
        await handlers.releaseTab(123);
        const notes = await handlers.subscribeNotes('https://example.com', SENDER);
        const comments = await handlers.subscribeCommentsHandler('note-1', SENDER);

        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(notes).toEqual({ success: true, cancelled: true });
        expect(comments).toEqual({ success: true, cancelled: true });
        expect(subscribe).not.toHaveBeenCalled();
        expect(subscribeComments).not.toHaveBeenCalled();
        expect(localThis.noteSubscriptions.size).toBe(0);
        expect(localThis.commentSubscriptions.size).toBe(0);
      });

      it('should keep subscribing for other tabs after one closed', async () => {
        const handlers = localThis.build4();

        await handlers.releaseTab(123);
        const result = await handlers.subscribeNotes('https://example.com', { tab: { id: 456 }, frameId: 0 });

        expect(result).toEqual({ success: true });
        expect(localThis.noteSubscriptions.has('456-0')).toBe(true);
      });

      it('should forget the oldest closed tab after the limit', async () => {
        const handlers = localThis.build4();

        for (let tabId = 1; tabId <= 501; tabId += 1) {
          handlers.releaseTab(tabId);
        }
        const oldest = await handlers.subscribeNotes('https://example.com', { tab: { id: 1 }, frameId: 0 });
        const newest = await handlers.subscribeNotes('https://example.com', { tab: { id: 501 }, frameId: 0 });

        expect(oldest).toEqual({ success: true });
        expect(newest).toEqual({ success: true, cancelled: true });
      });

      it('should warn about entries without an unsubscribe function and still drop them', async () => {
        localThis.noteSubscriptions.set('123-0', {});
        localThis.noteSubscriptions.set('123-1', null);
        localThis.commentSubscriptions.set('123-note-1', undefined);

        await localThis.build4().releaseTab(123);

        expect(localThis.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('no unsubscribe function'), '123-0');
        expect(localThis.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('no unsubscribe function'), '123-1');
        expect(localThis.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('no unsubscribe function'), '123-note-1');
        expect(localThis.noteSubscriptions.size).toBe(0);
        expect(localThis.commentSubscriptions.size).toBe(0);
        expect(localThis.mockLog.error).not.toHaveBeenCalled();
      });

      it('should not log a release as done when the unsubscribe throws', async () => {
        localThis.noteSubscriptions.set('123-0', { unsubscribe: () => { throw new Error('boom'); } });

        await localThis.build4().releaseTab(123);

        expect(localThis.mockLog.debug).not.toHaveBeenCalledWith(expect.stringContaining('Released a subscription'), '123-0');
      });

      it('should do nothing for a tab without subscriptions', async () => {
        await expect(localThis.build4().releaseTab(999)).resolves.toBeUndefined();
      });
    });

    it('should clean up the subscription when the tab cannot be reached', async () => {
      const unsubscribe = jest.fn();
      let onNotes;
      localThis.deps.subscribeToNotesForUrl = jest.fn((url, uid, email, notesCb) => {
        onNotes = notesCb;
        return unsubscribe;
      });
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
      const handlers = localThis.build2({ subscribeToNotesForUrl: localThis.deps.subscribeToNotesForUrl });

      await handlers.subscribeNotes('https://example.com', SENDER);
      onNotes([{ id: 'n1' }]);
      await flush();

      expect(unsubscribe).toHaveBeenCalled();
      expect(localThis.noteSubscriptions.has('123-0')).toBe(false);
    });

    it('should log when cleaning up an unreachable tab fails, and skip non-function unsubscribes', async () => {
      let onNotes;
      const failing = jest.fn(() => { throw new Error('unsubscribe failed'); });
      let returned = failing;
      const subscribe = jest.fn((url, uid, email, notesCb) => {
        onNotes = notesCb;
        return returned;
      });
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
      const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe });

      await handlers.subscribeNotes('https://example.com', SENDER);
      onNotes([]);
      await flush();
      expect(localThis.mockLog.error).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(Error));

      returned = undefined;
      localThis.mockLog.error.mockClear();
      await handlers.subscribeNotes('https://example.com', SENDER);
      onNotes([]);
      await flush();
      expect(localThis.mockLog.error).not.toHaveBeenCalled();
    });

    it('should not push updates or errors when the tabs API is unavailable', async () => {
      let onNotes;
      let onError;
      const subscribe = jest.fn((url, uid, email, notesCb, errorCb) => {
        onNotes = notesCb;
        onError = errorCb;
        return jest.fn();
      });
      const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe, chromeTabs: null });

      await handlers.subscribeNotes('https://example.com', SENDER);
      onNotes([]);
      onError(new Error('boom'));

      expect(localThis.mockLog.error).toHaveBeenCalledWith('Note subscription error:', expect.any(Error));
    });

    it('should ignore a failed error notification to the tab', async () => {
      let onError;
      const subscribe = jest.fn((url, uid, email, notesCb, errorCb) => {
        onError = errorCb;
        return jest.fn();
      });
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
      const handlers = localThis.build2({ subscribeToNotesForUrl: subscribe });

      await handlers.subscribeNotes('https://example.com', SENDER);
      onError(new Error('boom'));
      await flush();

      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(
        123, expect.objectContaining({ action: 'subscriptionError', type: 'notes' }), { frameId: 0 }
      );
    });
  });

  describe('subscribeCommentsHandler edge cases', () => {
    beforeEach(() => {
      localThis.commentSubscriptions = new Map();
      localThis.deps.subscribeToComments = jest.fn().mockReturnValue(jest.fn());
      localThis.build2 = (extra = {}) => localThis.build({
        chromeTabs: localThis.mockChromeTabs,
        commentSubscriptions: localThis.commentSubscriptions,
        ...extra
      });
    });

    it('should require Firebase when only a cached user exists', async () => {
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ user: localThis.mockUser });

      const result = await localThis.build2().subscribeCommentsHandler('note-1', SENDER);

      expect(result).toEqual({ success: false, error: expect.any(String) });
      expect(localThis.deps.subscribeToComments).not.toHaveBeenCalled();
    });

    it('should report an unavailable subscription service', async () => {
      const result = await localThis.build2({ subscribeToComments: undefined })
        .subscribeCommentsHandler('note-1', SENDER);

      expect(result).toEqual({ success: false, error: 'Subscription service not available' });
    });

    it('should clean up the subscription when the tab cannot be reached', async () => {
      const unsubscribe = jest.fn();
      let onComments;
      const subscribe = jest.fn((noteId, user, commentsCb) => {
        onComments = commentsCb;
        return unsubscribe;
      });
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
      const handlers = localThis.build2({ subscribeToComments: subscribe });

      await handlers.subscribeCommentsHandler('note-1', SENDER);
      onComments([{ id: 'c1' }]);
      await flush();

      expect(unsubscribe).toHaveBeenCalled();
      expect(localThis.commentSubscriptions.has('123-note-1')).toBe(false);
    });

    it('should log when cleaning up an unreachable tab fails, and skip non-function unsubscribes', async () => {
      let onComments;
      let returned = jest.fn(() => { throw new Error('unsubscribe failed'); });
      const subscribe = jest.fn((noteId, user, commentsCb) => {
        onComments = commentsCb;
        return returned;
      });
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
      const handlers = localThis.build2({ subscribeToComments: subscribe });

      await handlers.subscribeCommentsHandler('note-1', SENDER);
      onComments([]);
      await flush();
      expect(localThis.mockLog.error).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(Error));

      returned = undefined;
      localThis.mockLog.error.mockClear();
      await handlers.subscribeCommentsHandler('note-1', SENDER);
      onComments([]);
      await flush();
      expect(localThis.mockLog.error).not.toHaveBeenCalled();
    });

    it('should not push updates or errors when the tabs API is unavailable', async () => {
      let onComments;
      let onError;
      const subscribe = jest.fn((noteId, user, commentsCb, errorCb) => {
        onComments = commentsCb;
        onError = errorCb;
        return jest.fn();
      });
      const handlers = localThis.build2({ subscribeToComments: subscribe, chromeTabs: null });

      await handlers.subscribeCommentsHandler('note-1', SENDER);
      onComments([]);
      onError(new Error('boom'));

      expect(localThis.mockLog.error).toHaveBeenCalledWith('Comment subscription error:', expect.any(Error));
    });

    it('should ignore a failed error notification to the tab', async () => {
      let onError;
      const subscribe = jest.fn((noteId, user, commentsCb, errorCb) => {
        onError = errorCb;
        return jest.fn();
      });
      localThis.mockChromeTabs.sendMessage.mockRejectedValue(new Error('closed'));
      const handlers = localThis.build2({ subscribeToComments: subscribe });

      await handlers.subscribeCommentsHandler('note-1', SENDER);
      onError(new Error('boom'));
      await flush();

      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(
        123, expect.objectContaining({ action: 'subscriptionError', type: 'comments' })
      );
    });
  });

  describe('error handling', () => {
    it('should return failures and log them when the store throws while a request is recorded', async () => {
      const boom = () => { throw new Error('store broke'); };
      const subscriptionStore = {
        hydrate: jest.fn().mockResolvedValue({ notes: [], comments: [] }),
        saveNote: boom, saveComment: boom, removeNote: boom, removeComment: boom, removeTab: jest.fn()
      };
      const handlers = localThis.build({
        subscribeToNotesForUrl: jest.fn(), subscribeToComments: jest.fn(), subscriptionStore
      });

      await expect(handlers.subscribeNotes('https://example.com', SENDER))
        .resolves.toEqual({ success: false, error: 'store broke' });
      await expect(handlers.subscribeCommentsHandler('note-1', SENDER))
        .resolves.toEqual({ success: false, error: 'store broke' });
      await expect(handlers.unsubscribeNotes(SENDER))
        .resolves.toEqual({ success: false, error: 'store broke' });
      await expect(handlers.unsubscribeCommentsHandler('note-1', SENDER))
        .resolves.toEqual({ success: false, error: 'store broke' });
      expect(localThis.mockLog.error).toHaveBeenCalledWith('Subscribe notes error:', expect.any(Error));
      expect(localThis.mockLog.error).toHaveBeenCalledWith('Subscribe comments error:', expect.any(Error));
      expect(localThis.mockLog.error).toHaveBeenCalledWith('Unsubscribe notes error:', expect.any(Error));
      expect(localThis.mockLog.error).toHaveBeenCalledWith('Unsubscribe comments error:', expect.any(Error));
    });

  it('should return failures when the user cannot be determined for subscriptions', async () => {
    localThis.deps.getCurrentUser.mockRejectedValue(new Error('auth down'));
    localThis.deps.subscribeToNotesForUrl = jest.fn();
    localThis.deps.subscribeToComments = jest.fn();
    const handlers = localThis.build();

    await expect(handlers.subscribeNotes('https://example.com', SENDER))
      .resolves.toEqual({ success: false, error: 'auth down' });
    await expect(handlers.subscribeCommentsHandler('note-1', SENDER))
      .resolves.toEqual({ success: false, error: 'auth down' });
  });

  it('should drop the entries even when unsubscribing throws', async () => {
    const throwing = () => { throw new Error('unsubscribe failed'); };
    const noteSubscriptions = new Map([['123-0', { unsubscribe: throwing }]]);
    const commentSubscriptions = new Map([['123-note-1', throwing]]);
    const handlers = localThis.build({ noteSubscriptions, commentSubscriptions });

    await expect(handlers.unsubscribeNotes(SENDER)).resolves.toEqual({ success: true, released: false });
    await expect(handlers.unsubscribeCommentsHandler('note-1', SENDER)).resolves.toEqual({ success: true, released: false });

    expect(noteSubscriptions.size).toBe(0);
    expect(commentSubscriptions.size).toBe(0);
    expect(localThis.mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to release a subscription'), '123-0', expect.any(Error)
    );
    expect(localThis.mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to release a subscription'), '123-note-1', expect.any(Error)
    );
  });

  it('should return a failure when the subscription store itself fails', async () => {
    const broken = { get: () => { throw new Error('store failed'); } };
    const handlers = localThis.build({ noteSubscriptions: broken, commentSubscriptions: broken });

    await expect(handlers.unsubscribeNotes(SENDER))
      .resolves.toEqual({ success: false, error: 'store failed' });
    await expect(handlers.unsubscribeCommentsHandler('note-1', SENDER))
      .resolves.toEqual({ success: false, error: 'store failed' });
  });

  });

});
