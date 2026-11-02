/**
 * Restore subscriptions unit tests
 * The restore runs in the subscription manager (manager.restore); these tests use the real manager
 * with a fake store, controllable Firestore subscriptions and fake tab APIs.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createSubscriptionManager } from '../../src/background/subscriptions.js';
import { restoreSubscriptions, checkDescriptor } from '../../src/background/restoreSubscriptions.js';
import { createCompositeUrl } from '../../src/shared/utils.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const deferred = () => {
  const result = {};
  result.promise = new Promise((resolve, reject) => {
    result.resolve = resolve;
    result.reject = reject;
  });
  return result;
};

describe('restore', () => {
  let saved;
  let store;
  let manager;
  let tabs;
  let webNavigation;
  let log;
  let user;
  let noteSubscriptions;
  let commentSubscriptions;
  let subscribeToNotesForUrl;
  let subscribeToComments;

  const run = () => restoreSubscriptions({ handlers: manager, tabs, webNavigation });
  const build = (extra = {}) => createSubscriptionManager({
    subscribeToNotesForUrl,
    subscribeToComments,
    isFirebaseConfigured: () => true,
    getUserIfConfigured: async () => user,
    noteSubscriptions,
    commentSubscriptions,
    subscriptionStore: store,
    log,
    chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}) },
    ...extra
  });

  beforeEach(() => {
    saved = {
      notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: 'https://a.test/' }],
      comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1', tabUrl: 'https://a.test/' }]
    };
    store = {
      hydrate: jest.fn(async () => saved),
      saveNote: jest.fn(),
      saveComment: jest.fn(),
      removeNote: jest.fn(),
      removeComment: jest.fn(),
      removeTab: jest.fn()
    };
    user = { uid: 'u1', email: 'a@b.test' };
    noteSubscriptions = new Map();
    commentSubscriptions = new Map();
    subscribeToNotesForUrl = jest.fn(async () => jest.fn());
    subscribeToComments = jest.fn(async () => jest.fn());
    tabs = { get: jest.fn(async (tabId) => ({ id: tabId, url: 'https://a.test/' })) };
    webNavigation = {
      getAllFrames: jest.fn(async () => [
        { frameId: 0, url: 'https://a.test/' },
        { frameId: 2, url: 'https://frame.test/x' }
      ])
    };
    log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    manager = build();
  });

  describe('what is stored', () => {
    it('does nothing when nothing was stored', async () => {
      saved = { notes: [], comments: [] };

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(tabs.get).not.toHaveBeenCalled();
    });

    it('overwrites nothing when the stored subscriptions cannot be read', async () => {
      store.hydrate.mockResolvedValue(null);

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(store.removeComment).not.toHaveBeenCalled();
      expect(store.removeTab).not.toHaveBeenCalled();
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    });

    it('restores note and comment subscriptions and leaves their descriptors stored', async () => {
      expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });

      expect(subscribeToNotesForUrl).toHaveBeenCalledWith(
        'https://a.test/', 'u1', 'a@b.test', expect.any(Function), expect.any(Function)
      );
      expect(subscribeToComments).toHaveBeenCalledWith('n1', user, expect.any(Function), expect.any(Function));
      expect(noteSubscriptions.has('1-0')).toBe(true);
      expect(commentSubscriptions.has('1-n1')).toBe(true);
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(store.removeComment).not.toHaveBeenCalled();
      expect(await manager.getRealtimeSyncStatus()).toEqual({ success: true, degraded: false, restorable: true });
    });

    it('does not start a second listener when the restore runs again for entries that are running', async () => {
      await run();
      subscribeToNotesForUrl.mockClear();
      subscribeToComments.mockClear();

      expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(subscribeToComments).not.toHaveBeenCalled();
    });

    it('does not restore an entry a page wrote since the worker started', async () => {
      await manager.subscribeNotes('https://a.test/', { tab: { id: 1 }, frameId: 0 });
      subscribeToNotesForUrl.mockClear();

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 0 });
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    });
  });

  describe('the user', () => {
    it('keeps the entries and retries at the next start when the user lookup fails', async () => {
      manager = build({ getUserIfConfigured: async () => { throw new Error('auth down'); } });

      expect(await run()).toEqual({ restored: 0, failed: 2, dropped: 0 });
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Could not look up the user'), expect.any(Error));
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(store.removeTab).not.toHaveBeenCalled();
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(await manager.getRealtimeSyncStatus()).toEqual({ success: true, degraded: true, restorable: true });
    });

    it('keeps the entries and restores nothing when nobody is signed in', async () => {
      user = null;

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(store.removeComment).not.toHaveBeenCalled();
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(await manager.getRealtimeSyncStatus()).toEqual({ success: true, degraded: true, restorable: true });
    });
  });

  describe('tabs and frames', () => {
    it('drops the entries of a tab Chrome says is closed, with its stored descriptors', async () => {
      tabs.get.mockRejectedValue(new Error('No tab with id: 1.'));

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 2 });
      expect(store.removeTab).toHaveBeenCalledWith(1);
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(await manager.subscribeNotes('https://a.test/', { tab: { id: 1 }, frameId: 0 }))
        .toEqual({ success: true, cancelled: true });
      expect(await manager.getRealtimeSyncStatus()).toEqual({ success: true, degraded: false, restorable: true });
    });

    it('keeps a tab it could not check and counts it as failed', async () => {
      tabs.get.mockRejectedValue(new Error('browser busy'));

      expect(await run()).toEqual({ restored: 0, failed: 2, dropped: 0 });
      expect(store.removeTab).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith('Could not check tab', 1, expect.any(Error));
    });

    it('tolerates a missing error message when a tab check fails', async () => {
      tabs.get.mockRejectedValue(undefined);

      expect((await run()).failed).toBe(2);
    });

    it('drops note entries of frames that no longer exist but keeps the tab comments', async () => {
      webNavigation.getAllFrames.mockResolvedValue([{ frameId: 5, url: 'https://other.test/' }]);

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 1 });
      expect(store.removeNote).toHaveBeenCalledWith('1-0');
      expect(commentSubscriptions.has('1-n1')).toBe(true);
    });

    it('keeps a tab whose frames cannot be listed instead of dropping its notes', async () => {
      webNavigation.getAllFrames.mockRejectedValue(new Error('frames failed'));

      expect(await run()).toEqual({ restored: 0, failed: 2, dropped: 0 });
      expect(store.removeNote).not.toHaveBeenCalled();

      webNavigation.getAllFrames.mockResolvedValue(null);
      manager = build();
      expect((await run()).failed).toBe(2);
    });

    it('drops the entries of a frame that navigated while the worker was stopped', async () => {
      webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://a.test/other-page' }]);
      tabs.get.mockResolvedValue({ id: 1, url: 'https://a.test/other-page' });

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 2 });
      expect(store.removeNote).toHaveBeenCalledWith('1-0');
      expect(store.removeComment).toHaveBeenCalledWith('1-n1');
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    });

    it('restores an iframe note whose composite URL still matches, and drops one that navigated', async () => {
      saved = {
        notes: [
          { subKey: '1-2', tabId: 1, frameId: 2, url: createCompositeUrl('https://a.test/', 'https://frame.test/x', false) },
          { subKey: '1-3', tabId: 1, frameId: 3, url: createCompositeUrl('https://a.test/', 'https://frame.test/old', false) }
        ],
        comments: []
      };
      webNavigation.getAllFrames.mockResolvedValue([
        { frameId: 0, url: 'https://a.test/' },
        { frameId: 2, url: 'https://frame.test/x' },
        { frameId: 3, url: 'https://frame.test/new' }
      ]);

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 1 });
      expect(noteSubscriptions.has('1-2')).toBe(true);
      expect(store.removeNote).toHaveBeenCalledWith('1-3');
    });
  });

  describe('descriptors that cannot be compared', () => {
    it('stores the tab URL of a comment descriptor that has none, and restores it', async () => {
      saved = { notes: [], comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1' }] };

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 0 });
      expect(store.saveComment).toHaveBeenCalledWith('1-n1', { tabId: 1, noteId: 'n1', tabUrl: 'https://a.test/' });
    });

    it('keeps a comment descriptor stored without a tab URL when the live tab has none either', async () => {
      saved = { notes: [], comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1' }] };
      tabs.get.mockResolvedValue({ id: 1 });

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 0 });
      expect(store.saveComment).not.toHaveBeenCalled();
    });

    it('keeps entries it cannot compare because the tab or frame URL is unknown, and counts them as failed', async () => {
      tabs.get.mockResolvedValue({ id: 1 });

      expect(await run()).toEqual({ restored: 0, failed: 2, dropped: 0 });
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(store.removeComment).not.toHaveBeenCalled();
      expect(await manager.getRealtimeSyncStatus()).toEqual({ success: true, degraded: true, restorable: true });

      tabs.get.mockResolvedValue({ id: 1, url: 'https://a.test/' });
      webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }]);
      manager = build();
      expect((await run()).failed).toBe(1);
    });

    it('reports an unknown tab URL for a comment that stored one', () => {
      expect(checkDescriptor('comment', { tabUrl: 'https://a.test/' }, { frames: new Map() })).toBe('unknown');
    });
  });

  describe('races with the page', () => {
    it('skips a stale entry a newer subscribe replaced during the frame lookup, and keeps the page listener', async () => {
      const lookup = deferred();
      tabs.get.mockImplementation(() => lookup.promise);
      const restoring = run();
      await flush();

      const pageUnsubscribe = jest.fn();
      subscribeToNotesForUrl.mockResolvedValue(pageUnsubscribe);
      const request = manager.subscribeNotes('https://a.test/new', { tab: { id: 1 }, frameId: 0 });
      lookup.resolve({ id: 1, url: 'https://a.test/new' });

      expect(await request).toEqual({ success: true });
      // The comment descriptor is for the old page, so it is dropped; the stale note entry is skipped
      expect(await restoring).toEqual({ restored: 0, failed: 0, dropped: 1 });
      expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);
      expect(subscribeToNotesForUrl.mock.calls[0][0]).toBe('https://a.test/new');
      expect(noteSubscriptions.get('1-0').unsubscribe).toBe(pageUnsubscribe);
      expect(pageUnsubscribe).not.toHaveBeenCalled();
    });

    it('leaves no listener behind when the page unsubscribes during the frame lookup', async () => {
      const lookup = deferred();
      tabs.get.mockImplementation(() => lookup.promise);
      const restoring = run();
      await flush();

      const unsubscribed = manager.unsubscribeNotes({ tab: { id: 1 }, frameId: 0 });
      await manager.unsubscribeCommentsHandler('n1', { tab: { id: 1 } });
      lookup.resolve({ id: 1, url: 'https://a.test/' });

      expect(await unsubscribed).toEqual({ success: true });
      expect(await restoring).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(subscribeToComments).not.toHaveBeenCalled();
      expect(noteSubscriptions.size).toBe(0);
      expect(commentSubscriptions.size).toBe(0);
    });

    it('keeps the entry a new page saved while the restore was dropping the stale one', async () => {
      const lookup = deferred();
      tabs.get.mockImplementation(() => lookup.promise);
      webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://a.test/new-page' }]);
      const restoring = run();
      await flush();

      const request = manager.subscribeNotes('https://a.test/new-page', { tab: { id: 1 }, frameId: 0 });
      lookup.resolve({ id: 1, url: 'https://a.test/new-page' });

      expect(await request).toEqual({ success: true });
      const result = await restoring;
      expect(result.restored).toBe(0);
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(noteSubscriptions.get('1-0').url).toBe('https://a.test/new-page');
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
    });
  });

  describe('failures', () => {
    it('keeps an entry whose subscribe fails, logs it, and reports sync as degraded', async () => {
      subscribeToNotesForUrl.mockRejectedValue(new Error('down'));

      expect(await run()).toEqual({ restored: 1, failed: 1, dropped: 0 });
      expect(log.error).toHaveBeenCalledWith('Could not restore note 1-0:', 'down');
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('sync is degraded'));
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(await manager.getRealtimeSyncStatus()).toEqual({ success: true, degraded: true, restorable: true });
    });

    it('does not let one failing entry stop the others', async () => {
      subscribeToNotesForUrl.mockRejectedValue(new Error('boom'));

      expect(await run()).toEqual({ restored: 1, failed: 1, dropped: 0 });
      expect(subscribeToComments).toHaveBeenCalledTimes(1);
    });

    it('retries a failed entry at the next worker start', async () => {
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('not ready'));
      expect((await run()).failed).toBe(1);

      manager = build();
      expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });
      expect(noteSubscriptions.has('1-0')).toBe(true);
    });

    it('counts an entry whose restore a newer request cancelled as neither restored nor failed', async () => {
      const started = deferred();
      subscribeToNotesForUrl.mockImplementation(() => started.promise);
      const restoring = run();
      await flush();
      await flush();

      const request = manager.subscribeNotes('https://a.test/', { tab: { id: 1 }, frameId: 0 });
      started.resolve(jest.fn());
      subscribeToNotesForUrl.mockImplementation(async () => jest.fn());

      expect(await request).toEqual({ success: true });
      expect(await restoring).toEqual({ restored: 1, failed: 0, dropped: 0 });
    });
  });
});
