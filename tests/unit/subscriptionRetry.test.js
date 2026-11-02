/**
 * Subscription retry tests: typed outcomes, the keep-alive retry with backoff, permanent errors,
 * logout and login, and the per-attempt subscribe timeout.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createSubscriptionManager, SUBSCRIBE_TIMEOUT_MS } from '../../src/background/subscriptions.js';
import { createHandlers } from '../../src/background/handlers.js';
import { createSubscriptionStore } from '../../src/background/subscriptionStore.js';
import { restoreSubscriptions } from '../../src/background/restoreSubscriptions.js';

const SENDER = { tab: { id: 1, url: 'https://a.test/' }, frameId: 0 };
const PAGE = 'https://a.test/';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  const result = {};
  result.promise = new Promise((resolve, reject) => {
    result.resolve = resolve;
    result.reject = reject;
  });
  return result;
};

function makeArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: jest.fn(async (keys) => Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]))),
    set: jest.fn(async (items) => { Object.assign(data, JSON.parse(JSON.stringify(items))); })
  };
}

describe('retry and outcomes', () => {
  let log;
  let user;
  let configured;
  let noteSubscriptions;
  let commentSubscriptions;
  let subscribeToNotesForUrl;
  let subscribeToComments;
  let chromeTabs;
  let chromeWebNavigation;
  let store;
  let manager;

  const build = (extra = {}) => createSubscriptionManager({
    subscribeToNotesForUrl,
    subscribeToComments,
    isFirebaseConfigured: () => configured,
    getUserIfConfigured: async () => user,
    noteSubscriptions,
    commentSubscriptions,
    subscriptionStore: store,
    log,
    chromeTabs,
    chromeWebNavigation,
    ...extra
  });

  beforeEach(() => {
    log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    user = { uid: 'u1', email: 'a@b.test' };
    configured = true;
    noteSubscriptions = new Map();
    commentSubscriptions = new Map();
    subscribeToNotesForUrl = jest.fn(async () => jest.fn());
    subscribeToComments = jest.fn(async () => jest.fn());
    chromeTabs = {
      sendMessage: jest.fn().mockResolvedValue({}),
      get: jest.fn(async (tabId) => ({ id: tabId, url: PAGE }))
    };
    chromeWebNavigation = { getAllFrames: jest.fn(async () => [{ frameId: 0, url: PAGE }]) };
    store = {
      hydrate: jest.fn(async () => ({ notes: [], comments: [] })),
      saveNote: jest.fn(),
      saveComment: jest.fn(),
      removeNote: jest.fn(),
      removeComment: jest.fn(),
      removeTab: jest.fn(),
      clear: jest.fn()
    };
    manager = build();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('retry on the keep-alive alarm', () => {
    it('keeps a failing request as a desired entry, and the next alarm tick retries it successfully', async () => {
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('sdk not ready'));

      expect(await manager.subscribeNotes(PAGE, SENDER)).toEqual({ success: false, error: 'sdk not ready' });
      expect(noteSubscriptions.size).toBe(0);
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: true });

      expect(await manager.retryPending()).toEqual({ restored: 1, failed: 0, dropped: 0 });

      expect(noteSubscriptions.has('1-0')).toBe(true);
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
      expect(store.removeNote).not.toHaveBeenCalled();
    });

    it('retries comments too', async () => {
      subscribeToComments.mockRejectedValueOnce(new Error('sdk not ready'));

      await manager.subscribeCommentsHandler('n1', SENDER);
      expect(await manager.retryPending()).toEqual({ restored: 1, failed: 0, dropped: 0 });

      expect(commentSubscriptions.has('1-n1')).toBe(true);
    });

    it('waits 1, 2 and 4 ticks and then 8 ticks between attempts', async () => {
      subscribeToNotesForUrl.mockRejectedValue(new Error('down'));
      await manager.subscribeNotes(PAGE, SENDER);
      const attempts = [];

      for (let tick = 1; tick <= 24; tick += 1) {
        const before = subscribeToNotesForUrl.mock.calls.length;
        await manager.retryPending();
        if (subscribeToNotesForUrl.mock.calls.length > before) {
          attempts.push(tick);
        }
      }

      expect(attempts).toEqual([1, 3, 7, 15, 23]);
    });

    it('starts the backoff over for a new request', async () => {
      subscribeToNotesForUrl.mockRejectedValue(new Error('down'));
      await manager.subscribeNotes(PAGE, SENDER);
      await manager.retryPending();
      await manager.retryPending();
      await manager.retryPending();
      subscribeToNotesForUrl.mockClear();

      await manager.subscribeNotes(PAGE, SENDER);
      subscribeToNotesForUrl.mockClear();
      await manager.retryPending();

      expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);
    });

    it('does nothing when nothing failed', async () => {
      await manager.subscribeNotes(PAGE, SENDER);

      expect(await manager.retryPending()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(chromeTabs.get).not.toHaveBeenCalled();
    });

    it('stops retrying an entry that was unsubscribed or already has a listener', async () => {
      subscribeToNotesForUrl.mockRejectedValue(new Error('down'));
      await manager.subscribeNotes(PAGE, SENDER);
      await manager.subscribeNotes(PAGE, { tab: { id: 1 }, frameId: 3 });
      await manager.unsubscribeNotes(SENDER);
      noteSubscriptions.set('1-3', { unsubscribe: jest.fn() });
      subscribeToNotesForUrl.mockClear();

      expect(await manager.retryPending()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    });

    it('retries entries restored from storage whose user lookup failed', async () => {
      store.hydrate.mockResolvedValue({
        notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: PAGE }],
        comments: []
      });
      let failing = true;
      manager = build({
        getUserIfConfigured: async () => {
          if (failing) {
            throw new Error('auth down');
          }
          return user;
        }
      });

      expect(await restoreSubscriptions({ handlers: manager, tabs: chromeTabs, webNavigation: chromeWebNavigation }))
        .toEqual({ restored: 0, failed: 1, dropped: 0 });
      failing = false;

      expect(await manager.retryPending()).toEqual({ restored: 1, failed: 0, dropped: 0 });
      expect(noteSubscriptions.has('1-0')).toBe(true);
    });

    it('retries an entry whose page could not be compared yet', async () => {
      store.hydrate.mockResolvedValue({
        notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: PAGE }],
        comments: []
      });
      chromeTabs.get.mockResolvedValueOnce({ id: 1 });

      expect(await manager.restore({ tabs: chromeTabs, webNavigation: chromeWebNavigation }))
        .toEqual({ restored: 0, failed: 1, dropped: 0 });

      expect(await manager.retryPending()).toEqual({ restored: 1, failed: 0, dropped: 0 });
    });

    it('does not start a second attempt while one is still running, and does not skip a backoff step', async () => {
      const slow = deferred();
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('down'));
      await manager.subscribeNotes(PAGE, SENDER);
      subscribeToNotesForUrl.mockClear();
      subscribeToNotesForUrl.mockImplementationOnce(() => slow.promise);

      const first = manager.retryPending();
      await flush();
      expect(await manager.retryPending()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);

      slow.reject(new Error('still down'));
      expect(await first).toEqual({ restored: 0, failed: 1, dropped: 0 });

      // Two failures so far: the next attempt comes after 2 ticks
      subscribeToNotesForUrl.mockRejectedValue(new Error('still down'));
      subscribeToNotesForUrl.mockClear();
      await manager.retryPending();
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      await manager.retryPending();
      expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);
    });

    it('skips an attempt that a request superseded while it ran', async () => {
      const lookup = deferred();
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('down'));
      await manager.subscribeNotes(PAGE, SENDER);
      subscribeToNotesForUrl.mockClear();
      chromeTabs.get.mockImplementationOnce(() => lookup.promise);

      const attempt = manager.retryPending();
      await flush();
      expect(await manager.subscribeNotes(PAGE, SENDER)).toEqual({ success: true });
      lookup.resolve({ id: 1, url: PAGE });

      expect(await attempt).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);
      expect(noteSubscriptions.has('1-0')).toBe(true);
    });

    it('drops a stale page instead of subscribing to it when the retry runs', async () => {
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('down'));
      await manager.subscribeNotes(PAGE, SENDER);
      chromeTabs.get.mockResolvedValue({ id: 1, url: 'https://a.test/elsewhere' });
      chromeWebNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://a.test/elsewhere' }]);
      subscribeToNotesForUrl.mockClear();

      expect(await manager.retryPending()).toEqual({ restored: 0, failed: 0, dropped: 1 });

      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(store.removeNote).toHaveBeenCalledWith('1-0');
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
    });

    it('drops the entries of a tab that closed before the retry', async () => {
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('down'));
      await manager.subscribeNotes(PAGE, SENDER);
      chromeTabs.get.mockRejectedValue(new Error('No tab with id: 1.'));

      expect(await manager.retryPending()).toEqual({ restored: 0, failed: 0, dropped: 1 });
      expect(store.removeTab).toHaveBeenCalledWith(1);
    });
  });

  describe('permanent and transient errors', () => {
    it('does not retry nobody signed in, and logs it once', async () => {
      user = null;

      expect((await manager.subscribeNotes(PAGE, SENDER)).success).toBe(false);
      for (let tick = 0; tick < 10; tick += 1) {
        await manager.retryPending();
      }

      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(log.warn.mock.calls.filter((call) => /no-user/.test(call[0]))).toHaveLength(1);
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: true });
    });

    it('does not retry Firebase not configured, for notes and comments', async () => {
      configured = false;

      await manager.subscribeNotes(PAGE, SENDER);
      await manager.subscribeCommentsHandler('n1', SENDER);
      for (let tick = 0; tick < 10; tick += 1) {
        await manager.retryPending();
      }

      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
      expect(subscribeToComments).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not-configured'), '1-0');
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not-configured'), '1-n1');
    });

    it('logs a permanent outcome once when a later restore meets it again', async () => {
      configured = false;
      store.hydrate.mockResolvedValue({
        notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: PAGE }],
        comments: []
      });
      const apis = { tabs: chromeTabs, webNavigation: chromeWebNavigation };

      await manager.restore(apis);
      await manager.restore(apis);

      expect(log.warn.mock.calls.filter((call) => /not-configured/.test(call[0]))).toHaveLength(1);
    });

    it('does not retry an unavailable subscription service', async () => {
      manager = build({ subscribeToNotesForUrl: undefined, subscribeToComments: undefined });

      await manager.subscribeNotes(PAGE, SENDER);
      await manager.subscribeCommentsHandler('n1', SENDER);
      await manager.retryPending();

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('unavailable'), '1-0');
      expect(chromeTabs.get).not.toHaveBeenCalled();
    });

    it('retries a transient error, and a permanent outcome that later succeeds is logged again if it returns', async () => {
      user = null;
      await manager.subscribeNotes(PAGE, SENDER);
      user = { uid: 'u1', email: 'a@b.test' };
      await manager.subscribeNotes(PAGE, SENDER);
      user = null;
      await manager.reconcileAll();
      await manager.unsubscribeNotes(SENDER);
      await manager.subscribeNotes(PAGE, SENDER);

      expect(log.warn.mock.calls.filter((call) => /no-user/.test(call[0])).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('login and logout', () => {
    it('keeps entries while nobody is signed in and starts them after a login', async () => {
      user = null;
      await manager.subscribeNotes(PAGE, SENDER);
      await manager.subscribeCommentsHandler('n1', SENDER);
      expect(noteSubscriptions.size).toBe(0);

      user = { uid: 'u1', email: 'a@b.test' };
      expect(await manager.reconcileAll()).toEqual({ restored: 2, failed: 0, dropped: 0 });

      expect(noteSubscriptions.has('1-0')).toBe(true);
      expect(commentSubscriptions.has('1-n1')).toBe(true);
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
    });

    it('does nothing on a login when every entry has a listener', async () => {
      await manager.subscribeNotes(PAGE, SENDER);

      expect(await manager.reconcileAll()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);
    });

    it('checks the live page before it starts an entry on a login', async () => {
      user = null;
      await manager.subscribeNotes(PAGE, SENDER);
      user = { uid: 'u1', email: 'a@b.test' };
      chromeWebNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://a.test/elsewhere' }]);
      chromeTabs.get.mockResolvedValue({ id: 1, url: 'https://a.test/elsewhere' });

      expect(await manager.reconcileAll()).toEqual({ restored: 0, failed: 0, dropped: 1 });
      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    });

    it('clears every listener, the desired state and the store on a logout', async () => {
      const noteUnsubscribe = jest.fn();
      const commentUnsubscribe = jest.fn();
      subscribeToNotesForUrl.mockResolvedValue(noteUnsubscribe);
      subscribeToComments.mockResolvedValue(commentUnsubscribe);
      await manager.subscribeNotes(PAGE, SENDER);
      await manager.subscribeCommentsHandler('n1', SENDER);
      user = null;
      await manager.subscribeNotes(PAGE, { tab: { id: 2 }, frameId: 0 });

      await manager.clearAll();

      expect(noteUnsubscribe).toHaveBeenCalledTimes(1);
      expect(commentUnsubscribe).toHaveBeenCalledTimes(1);
      expect(noteSubscriptions.size).toBe(0);
      expect(commentSubscriptions.size).toBe(0);
      expect(store.clear).toHaveBeenCalledTimes(1);
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
      expect(await manager.retryPending()).toEqual({ restored: 0, failed: 0, dropped: 0 });
    });

    it('waits for the store to be cleared before it resolves', async () => {
      const cleared = deferred();
      store.clear.mockReturnValue(cleared.promise);
      let done = false;

      const clearing = manager.clearAll().then(() => { done = true; });
      await flush();
      expect(done).toBe(false);
      cleared.resolve();
      await clearing;

      expect(done).toBe(true);
    });

    it('releases a listener that is still starting when the logout clears everything', async () => {
      const started = deferred();
      const late = jest.fn();
      subscribeToNotesForUrl.mockImplementationOnce(() => started.promise);

      const subscribing = manager.subscribeNotes(PAGE, SENDER);
      await flush();
      const clearing = manager.clearAll();
      started.resolve(late);

      expect(await subscribing).toEqual({ success: true, cancelled: true });
      await clearing;
      expect(late).toHaveBeenCalledTimes(1);
      expect(noteSubscriptions.size).toBe(0);
    });

    it('waits for the store to be read, so a read in flight cannot bring entries back after the clear', async () => {
      const read = deferred();
      store.hydrate.mockReturnValue(read.promise);

      const clearing = manager.clearAll();
      await flush();
      read.resolve({ notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: PAGE }], comments: [] });
      await clearing;

      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
      expect(store.clear).toHaveBeenCalledTimes(1);
    });

    it('works without a store', async () => {
      manager = build({ subscriptionStore: null });
      await manager.subscribeNotes(PAGE, SENDER);

      await expect(manager.clearAll()).resolves.toBeUndefined();
      expect(noteSubscriptions.size).toBe(0);
    });
  });

  describe('subscribe timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('turns a subscribe that hangs past the timeout into a transient failure', async () => {
      subscribeToNotesForUrl.mockImplementationOnce(() => new Promise(() => {}));

      const request = manager.subscribeNotes(PAGE, SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);

      expect(await request).toEqual({ success: false, error: 'Subscription timed out' });
      expect(noteSubscriptions.size).toBe(0);
      expect(await manager.getRealtimeSyncStatus()).toMatchObject({ degraded: true });

      expect(await manager.retryPending()).toEqual({ restored: 1, failed: 0, dropped: 0 });
      expect(noteSubscriptions.has('1-0')).toBe(true);
    });

    it('does not block the key: a later request runs after the timeout', async () => {
      subscribeToNotesForUrl.mockImplementationOnce(() => new Promise(() => {}));

      const hung = manager.subscribeNotes(PAGE, SENDER);
      await jest.advanceTimersByTimeAsync(1000);
      const later = manager.subscribeNotes('https://a.test/other', SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);

      expect(await hung).toEqual({ success: true, cancelled: true });
      expect(await later).toEqual({ success: true });
      expect(noteSubscriptions.get('1-0').url).toBe('https://a.test/other');
    });

    it('does not time out a subscribe that finishes in time', async () => {
      const started = deferred();
      const unsubscribe = jest.fn();
      subscribeToNotesForUrl.mockImplementationOnce(() => started.promise);

      const request = manager.subscribeNotes(PAGE, SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS - 1);
      started.resolve(unsubscribe);

      expect(await request).toEqual({ success: true });
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
      expect(unsubscribe).not.toHaveBeenCalled();
      expect(noteSubscriptions.has('1-0')).toBe(true);
    });

    it('releases a listener that resolves after its timeout and never registers it', async () => {
      const started = deferred();
      const late = jest.fn();
      subscribeToNotesForUrl.mockImplementationOnce(() => started.promise);

      const request = manager.subscribeNotes(PAGE, SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
      expect((await request).success).toBe(false);
      started.resolve(late);
      await jest.advanceTimersByTimeAsync(0);

      expect(late).toHaveBeenCalledTimes(1);
      expect(noteSubscriptions.size).toBe(0);
    });

    it('does not let a late listener replace a newer one', async () => {
      const started = deferred();
      const late = jest.fn();
      const newer = jest.fn();
      subscribeToNotesForUrl
        .mockImplementationOnce(() => started.promise)
        .mockResolvedValueOnce(newer);

      const request = manager.subscribeNotes(PAGE, SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
      await request;
      await manager.retryPending();
      started.resolve(late);
      await jest.advanceTimersByTimeAsync(0);

      expect(late).toHaveBeenCalledTimes(1);
      expect(newer).not.toHaveBeenCalled();
      expect(noteSubscriptions.get('1-0').unsubscribe).toBe(newer);
    });

    it('times out a comment subscribe and releases its late listener', async () => {
      const started = deferred();
      const late = jest.fn();
      subscribeToComments.mockImplementationOnce(() => started.promise);

      const request = manager.subscribeCommentsHandler('n1', SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
      expect((await request).success).toBe(false);
      started.resolve(late);
      await jest.advanceTimersByTimeAsync(0);

      expect(late).toHaveBeenCalledTimes(1);
      expect(commentSubscriptions.size).toBe(0);
    });

    it('times out the user lookup of a restore and retries the entries on a tick', async () => {
      store.hydrate.mockResolvedValue({
        notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: PAGE }],
        comments: []
      });
      let hang = true;
      manager = build({ getUserIfConfigured: () => (hang ? new Promise(() => {}) : Promise.resolve(user)) });

      const restoring = manager.restore({ tabs: chromeTabs, webNavigation: chromeWebNavigation });
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
      expect(await restoring).toEqual({ restored: 0, failed: 1, dropped: 0 });

      hang = false;
      expect(await manager.retryPending()).toEqual({ restored: 1, failed: 0, dropped: 0 });
    });

    it('times out a user lookup that hangs, and ignores its late result', async () => {
      const lookup = deferred();
      manager = build({ getUserIfConfigured: () => lookup.promise });

      const request = manager.subscribeNotes(PAGE, SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
      expect(await request).toEqual({ success: false, error: 'Subscription timed out' });
      lookup.resolve(user);
      await jest.advanceTimersByTimeAsync(0);

      expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    });

    it('passes a failing subscribe through without waiting for the timeout', async () => {
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('denied'));

      expect(await manager.subscribeNotes(PAGE, SENDER)).toEqual({ success: false, error: 'denied' });
      expect(jest.getTimerCount()).toBe(0);
    });

    it('ignores the late failure of an abandoned subscribe', async () => {
      const started = deferred();
      subscribeToNotesForUrl.mockImplementationOnce(() => started.promise);

      const request = manager.subscribeNotes(PAGE, SENDER);
      await jest.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
      await request;
      started.reject(new Error('too late'));
      await jest.advanceTimersByTimeAsync(0);

      expect(noteSubscriptions.size).toBe(0);
    });

    it('turns a subscribe that throws synchronously into a failure', async () => {
      subscribeToNotesForUrl.mockImplementationOnce(() => { throw new Error('sync boom'); });

      expect(await manager.subscribeNotes(PAGE, SENDER)).toEqual({ success: false, error: 'sync boom' });
    });
  });
});

describe('logout and login through the handlers', () => {
  let area;
  let store;
  let log;
  let noteSubscriptions;
  let commentSubscriptions;
  let user;
  let handlers;
  let signOut;
  let tabs;

  const build = (extra = {}) => createHandlers({
    signInWithGoogle: jest.fn(async () => user),
    signOut,
    getCurrentUser: jest.fn(async () => user),
    isFirebaseConfigured: () => true,
    subscribeToNotesForUrl: jest.fn(async () => jest.fn()),
    subscribeToComments: jest.fn(async () => jest.fn()),
    createNote: jest.fn(),
    noteSubscriptions,
    commentSubscriptions,
    subscriptionStore: store,
    log,
    chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}), get: tabs.get },
    chromeWebNavigation: { getAllFrames: jest.fn(async () => [{ frameId: 0, url: 'https://old.test/' }]) },
    chromeStorage: { local: { get: async () => ({}), set: async () => {} } },
    ...extra
  });

  beforeEach(() => {
    jest.clearAllMocks();
    log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    area = makeArea({
      subscriptions: {
        notes: { '7-0': { tabId: 7, frameId: 0, url: 'https://old.test/' } },
        comments: { '7-n1': { tabId: 7, noteId: 'n1', tabUrl: 'https://old.test/' } }
      }
    });
    store = createSubscriptionStore(area, log);
    noteSubscriptions = new Map();
    commentSubscriptions = new Map();
    user = { uid: 'u1', email: 'a@b.test' };
    signOut = jest.fn(async () => {
      user = null;
    });
    tabs = { get: jest.fn(async (tabId) => ({ id: tabId, url: 'https://old.test/' })) };
    handlers = build();
  });

  it('logout releases all listeners and leaves the desired state and the store empty', async () => {
    await handlers.restore({ tabs: { get: tabs.get }, webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://old.test/' }] } });
    expect(noteSubscriptions.size).toBe(1);

    expect(await handlers.handleLogout()).toEqual({ success: true });

    expect(noteSubscriptions.size).toBe(0);
    expect(commentSubscriptions.size).toBe(0);
    expect(area.data.subscriptions).toEqual({ notes: {}, comments: {} });
    expect(await handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
  });

  it('a failed sign out keeps the subscriptions of the user who is still signed in', async () => {
    await handlers.restore({ tabs: { get: tabs.get }, webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://old.test/' }] } });
    signOut.mockRejectedValueOnce(new Error('network'));

    expect(await handlers.handleLogout()).toEqual({ success: false, error: 'network' });

    expect(noteSubscriptions.has('7-0')).toBe(true);
    expect(area.data.subscriptions.notes['7-0']).toBeDefined();
  });

  it('clears a subscribe that arrives while the sign out is running', async () => {
    let finishSignOut;
    signOut.mockImplementationOnce(() => new Promise((resolve) => { finishSignOut = () => { user = null; resolve(); }; }));

    const loggingOut = handlers.handleLogout();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handlers.subscribeNotes('https://old.test/', { tab: { id: 8 }, frameId: 0 });
    expect(noteSubscriptions.has('8-0')).toBe(true);
    finishSignOut();
    await loggingOut;

    expect(noteSubscriptions.size).toBe(0);
    expect(area.data.subscriptions).toEqual({ notes: {}, comments: {} });
  });

  it('after a logout, a login subscribes nothing stale: only the pages subscribe again', async () => {
    await handlers.restore({ tabs: { get: tabs.get }, webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://old.test/' }] } });
    await handlers.handleLogout();
    user = { uid: 'u2', email: 'c@d.test' };

    await handlers.handleLogin();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(noteSubscriptions.size).toBe(0);

    await handlers.subscribeNotes('https://old.test/', { tab: { id: 7 }, frameId: 0 });
    expect(noteSubscriptions.get('7-0').url).toBe('https://old.test/');
  });

  it('with nobody signed in at worker start the entries are kept, and a login applies them', async () => {
    user = null;

    const result = await handlers.restore({
      tabs: { get: tabs.get },
      webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://old.test/' }] }
    });

    expect(result).toEqual({ restored: 0, failed: 0, dropped: 0 });
    expect(area.data.subscriptions.notes['7-0']).toBeDefined();
    expect(noteSubscriptions.size).toBe(0);

    user = { uid: 'u1', email: 'a@b.test' };
    await handlers.handleLogin();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(noteSubscriptions.has('7-0')).toBe(true);
    expect(commentSubscriptions.has('7-n1')).toBe(true);
  });

  it('logs a login whose resume of the subscriptions fails, without failing the login', async () => {
    const brokenStore = { ...store, hydrate: () => { throw new Error('store broke'); } };
    handlers = build({ subscriptionStore: brokenStore });

    expect((await handlers.handleLogin()).success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(log.error).toHaveBeenCalledWith('Failed to resume real-time subscriptions:', expect.any(Error));
  });
});
