/**
 * Restore integration test: the real handlers, the real subscription store and the real restore,
 * with the Firestore subscriptions faked. Covers the regression matrix of the reconciler.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHandlers } from '../../src/background/handlers.js';
import { createSubscriptionStore } from '../../src/background/subscriptionStore.js';
import { restoreSubscriptions } from '../../src/background/restoreSubscriptions.js';

function makeArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: jest.fn(async (keys) => Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]))),
    set: jest.fn(async (items) => { Object.assign(data, JSON.parse(JSON.stringify(items))); })
  };
}

const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  const result = {};
  result.promise = new Promise((resolve, reject) => {
    result.resolve = resolve;
    result.reject = reject;
  });
  return result;
};

const USER = { uid: 'u1', email: 'a@b.test' };
const NOTE_SENDER = { tab: { id: 7 }, frameId: 0 };
const COMMENT_SENDER = { tab: { id: 7, url: 'https://old.test/' } };

describe('restore with the real handlers and store', () => {
  let area;
  let store;
  let noteSubscriptions;
  let commentSubscriptions;
  let subscribeToNotesForUrl;
  let subscribeToComments;
  let getCurrentUser;
  let handlers;
  let tabs;
  let webNavigation;

  const build = () => createHandlers({
    getCurrentUser,
    isFirebaseConfigured: () => true,
    subscribeToNotesForUrl,
    subscribeToComments,
    noteSubscriptions,
    commentSubscriptions,
    subscriptionStore: store,
    log,
    chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}) },
    chromeStorage: { local: { get: async () => ({}) } }
  });
  const restore = () => restoreSubscriptions({ handlers, tabs, webNavigation });
  const stored = () => area.data.subscriptions;

  beforeEach(() => {
    jest.clearAllMocks();
    area = makeArea({
      subscriptions: {
        notes: { '7-0': { tabId: 7, frameId: 0, url: 'https://old.test/' } },
        comments: { '7-n1': { tabId: 7, noteId: 'n1', tabUrl: 'https://old.test/' } }
      }
    });
    store = createSubscriptionStore(area, log);
    noteSubscriptions = new Map();
    commentSubscriptions = new Map();
    subscribeToNotesForUrl = jest.fn(async () => jest.fn());
    subscribeToComments = jest.fn(async () => jest.fn());
    getCurrentUser = jest.fn(async () => USER);
    handlers = build();
    tabs = { get: jest.fn(async (tabId) => ({ id: tabId, url: 'https://old.test/' })) };
    webNavigation = { getAllFrames: jest.fn(async () => [{ frameId: 0, url: 'https://old.test/' }]) };
  });

  it('restores the stored subscriptions and keeps their descriptors', async () => {
    expect(await restore()).toEqual({ restored: 2, failed: 0, dropped: 0 });

    expect(subscribeToNotesForUrl).toHaveBeenCalledWith('https://old.test/', 'u1', 'a@b.test', expect.any(Function), expect.any(Function));
    expect(noteSubscriptions.get('7-0').url).toBe('https://old.test/');
    expect(commentSubscriptions.has('7-n1')).toBe(true);
    expect(Object.keys(stored().notes)).toEqual(['7-0']);
    expect(stored().comments['7-n1'].tabUrl).toBe('https://old.test/');
    expect(await handlers.getRealtimeSyncStatus()).toEqual({ success: true, degraded: false, restorable: true });
  });

  it('requests queued during hydrate: hydration finishes first, then the requests win per key', async () => {
    const slowRead = deferred();
    area.get.mockImplementationOnce(() => slowRead.promise);

    const request = handlers.subscribeNotes('https://new.test', NOTE_SENDER);
    await flush();
    expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    slowRead.resolve({ subscriptions: area.data.subscriptions });

    expect(await request).toEqual({ success: true });
    expect(noteSubscriptions.get('7-0').url).toBe('https://new.test');
    expect(stored().notes['7-0'].url).toBe('https://new.test');
    // The stored comment was read back and is still desired
    expect(stored().comments['7-n1']).toBeDefined();
    expect(await handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: true });
  });

  it('restore versus a newer subscribe during the frame lookup: the restore skips its stale entry and the page listener survives', async () => {
    const lookup = deferred();
    tabs.get.mockImplementation(() => lookup.promise);

    const restoring = restore();
    await flush();
    const request = handlers.subscribeNotes('https://old.test/', NOTE_SENDER);
    lookup.resolve({ id: 7, url: 'https://old.test/' });

    expect(await request).toEqual({ success: true });
    await restoring;
    expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);
    expect(noteSubscriptions.size).toBe(1);
    expect(stored().notes['7-0'].url).toBe('https://old.test/');
  });

  it('restore versus an unsubscribe: no listener is left behind', async () => {
    const lookup = deferred();
    tabs.get.mockImplementation(() => lookup.promise);

    const restoring = restore();
    await flush();
    await handlers.unsubscribeNotes(NOTE_SENDER);
    await handlers.unsubscribeCommentsHandler('n1', COMMENT_SENDER);
    lookup.resolve({ id: 7, url: 'https://old.test/' });
    await restoring;
    await flush();

    expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    expect(noteSubscriptions.size).toBe(0);
    expect(commentSubscriptions.size).toBe(0);
    expect(stored()).toEqual({ notes: {}, comments: {} });
  });

  it('a new page replaces a stale entry mid-validation: the new entry survives', async () => {
    const lookup = deferred();
    tabs.get.mockImplementation(() => lookup.promise);
    webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://new.test/' }]);

    const restoring = restore();
    await flush();
    await handlers.subscribeNotes('https://new.test/', NOTE_SENDER);
    await handlers.subscribeCommentsHandler('n1', { tab: { id: 7, url: 'https://new.test/' } });
    lookup.resolve({ id: 7, url: 'https://new.test/' });
    await restoring;
    await flush();

    expect(Object.values(stored().notes).map((note) => note.url)).toEqual(['https://new.test/']);
    expect(Object.values(stored().comments).map((comment) => comment.tabUrl)).toEqual(['https://new.test/']);
    expect(noteSubscriptions.get('7-0').url).toBe('https://new.test/');
    expect(commentSubscriptions.has('7-n1')).toBe(true);
  });

  it('unsubscribe during an in-flight subscribe releases the new listener', async () => {
    const started = deferred();
    const lateUnsubscribe = jest.fn();
    subscribeToNotesForUrl.mockImplementationOnce(() => started.promise);

    const subscribing = handlers.subscribeNotes('https://new.test', NOTE_SENDER);
    await flush();
    const unsubscribing = handlers.unsubscribeNotes(NOTE_SENDER);
    started.resolve(lateUnsubscribe);

    expect(await subscribing).toEqual({ success: true, cancelled: true });
    expect(await unsubscribing).toEqual({ success: true });
    expect(lateUnsubscribe).toHaveBeenCalledTimes(1);
    expect(noteSubscriptions.size).toBe(0);
    expect(stored().notes).toEqual({});
  });

  it('replace during an in-flight subscribe leaves exactly one listener, for the latest request', async () => {
    const started = deferred();
    const firstUnsubscribe = jest.fn();
    const secondUnsubscribe = jest.fn();
    subscribeToNotesForUrl
      .mockImplementationOnce(() => started.promise)
      .mockResolvedValueOnce(secondUnsubscribe);

    const first = handlers.subscribeNotes('https://one.test', NOTE_SENDER);
    await flush();
    const second = handlers.subscribeNotes('https://two.test', NOTE_SENDER);
    started.resolve(firstUnsubscribe);

    expect(await first).toEqual({ success: true, cancelled: true });
    expect(await second).toEqual({ success: true });
    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
    expect(secondUnsubscribe).not.toHaveBeenCalled();
    expect(noteSubscriptions.size).toBe(1);
    expect(noteSubscriptions.get('7-0').url).toBe('https://two.test');
  });

  it('a tab that closed while the worker was down drops its entries', async () => {
    tabs.get.mockRejectedValue(new Error('No tab with id: 7.'));

    expect(await restore()).toEqual({ restored: 0, failed: 0, dropped: 2 });
    await flush();

    expect(stored()).toEqual({ notes: {}, comments: {} });
    expect(await handlers.subscribeNotes('https://late.test', NOTE_SENDER)).toEqual({ success: true, cancelled: true });
  });

  it('a frame that is gone while the worker was down drops its entry', async () => {
    webNavigation.getAllFrames.mockResolvedValue([{ frameId: 3, url: 'https://old.test/' }]);

    expect(await restore()).toEqual({ restored: 1, failed: 0, dropped: 1 });
    await flush();

    expect(stored().notes).toEqual({});
    expect(noteSubscriptions.size).toBe(0);
  });

  it('a frame that navigated while the worker was down drops its entries instead of subscribing to the previous page', async () => {
    tabs.get.mockResolvedValue({ id: 7, url: 'https://new.test/page' });
    webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://new.test/page' }]);

    expect(await restore()).toEqual({ restored: 0, failed: 0, dropped: 2 });
    await flush();

    expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    expect(noteSubscriptions.size).toBe(0);
    expect(stored()).toEqual({ notes: {}, comments: {} });
  });

  it('a user lookup failure keeps the entries, and the next start restores them', async () => {
    getCurrentUser.mockRejectedValueOnce(new Error('auth down'));

    expect(await restore()).toEqual({ restored: 0, failed: 2, dropped: 0 });
    expect(Object.keys(stored().notes)).toEqual(['7-0']);
    expect(await handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: true });

    handlers = build();
    expect(await restore()).toEqual({ restored: 2, failed: 0, dropped: 0 });
    expect(await handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
  });

  it('descriptors that cannot be compared are kept: no URL, and a comment stored without a tab URL', async () => {
    area.data.subscriptions.comments['7-n1'] = { tabId: 7, noteId: 'n1' };
    tabs.get.mockResolvedValue({ id: 7 });

    expect(await restore()).toEqual({ restored: 1, failed: 1, dropped: 0 });
    expect(Object.keys(stored().notes)).toEqual(['7-0']);
    expect(commentSubscriptions.has('7-n1')).toBe(true);
  });

  it('a failing page-side subscribe keeps a desired entry that the next start restores', async () => {
    subscribeToNotesForUrl.mockRejectedValueOnce(new Error('listener failed'));

    const failed = await handlers.subscribeNotes('https://old.test/', NOTE_SENDER);

    expect(failed).toEqual({ success: false, error: 'listener failed' });
    expect(noteSubscriptions.has('7-0')).toBe(false);
    expect(stored().notes['7-0'].url).toBe('https://old.test/');
    expect(await handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: true });

    handlers = build();
    expect(await restore()).toEqual({ restored: 2, failed: 0, dropped: 0 });
    expect(noteSubscriptions.has('7-0')).toBe(true);
  });

  it('a tab unreachable only removes its own entry', async () => {
    const callbacks = [];
    subscribeToNotesForUrl.mockImplementation(async (url, uid, email, onNotes) => {
      callbacks.push(onNotes);
      return jest.fn();
    });
    const sendMessage = jest.fn().mockRejectedValue(new Error('gone'));
    handlers = createHandlers({
      getCurrentUser,
      isFirebaseConfigured: () => true,
      subscribeToNotesForUrl,
      subscribeToComments,
      noteSubscriptions,
      commentSubscriptions,
      subscriptionStore: store,
      log,
      chromeTabs: { sendMessage },
      chromeStorage: { local: { get: async () => ({}) } }
    });

    await handlers.subscribeNotes('https://one.test', NOTE_SENDER);
    await handlers.subscribeNotes('https://two.test', { tab: { id: 7 }, frameId: 1 });
    callbacks[1]([]);
    await flush();

    expect(Object.keys(stored().notes).sort()).toEqual(['7-0']);
    expect(noteSubscriptions.has('7-0')).toBe(true);
    expect(noteSubscriptions.has('7-1')).toBe(false);
  });

  it('a subscribe after a tab closed registers nothing and returns cancelled', async () => {
    await handlers.releaseTab(7);

    expect(await handlers.subscribeNotes('https://late.test', NOTE_SENDER)).toEqual({ success: true, cancelled: true });
    expect(await handlers.subscribeCommentsHandler('n9', COMMENT_SENDER)).toEqual({ success: true, cancelled: true });
    expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    expect(stored()).toEqual({ notes: {}, comments: {} });
  });

  it('a storage write failure keeps memory authoritative', async () => {
    area.set.mockRejectedValue(new Error('quota'));

    expect(await handlers.subscribeNotes('https://new.test', NOTE_SENDER)).toEqual({ success: true });
    await flush();

    expect(noteSubscriptions.get('7-0').url).toBe('https://new.test');
    expect(log.error).toHaveBeenCalledWith('Subscription store operation failed:', expect.any(Error));
    expect(await handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: true });
  });

  it('a storage read failure overwrites nothing and still serves requests', async () => {
    area.get.mockRejectedValue(new Error('unavailable'));

    expect(await handlers.subscribeNotes('https://new.test', NOTE_SENDER)).toEqual({ success: true });
    expect(await restore()).toEqual({ restored: 0, failed: 0, dropped: 0 });
    await flush();

    expect(area.set).not.toHaveBeenCalled();
    expect(stored().notes['7-0'].url).toBe('https://old.test/');
    expect(noteSubscriptions.get('7-0').url).toBe('https://new.test');
  });
});
