/**
 * Restore integration test: the real handlers, the real subscription store and the real restore,
 * with the Firestore subscriptions faked.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHandlers } from '../../src/background/handlers.js';
import { createSubscriptionStore } from '../../src/background/subscriptionStore.js';
import { restoreSubscriptions } from '../../src/background/restoreSubscriptions.js';

function makeArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: async (keys) => Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]])),
    set: async (items) => { Object.assign(data, JSON.parse(JSON.stringify(items))); }
  };
}

const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('restore with the real handlers and store', () => {
  let area;
  let store;
  let noteSubscriptions;
  let commentSubscriptions;
  let subscribeToNotesForUrl;
  let handlers;
  let tabs;
  let webNavigation;

  const restore = () => restoreSubscriptions({
    store, handlers, tabs, webNavigation, log, wait: async () => {}
  });

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
    handlers = createHandlers({
      getCurrentUser: async () => ({ uid: 'u1', email: 'a@b.test' }),
      isFirebaseConfigured: () => true,
      subscribeToNotesForUrl,
      subscribeToComments: jest.fn(async () => jest.fn()),
      noteSubscriptions,
      commentSubscriptions,
      subscriptionStore: store,
      log,
      chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}) },
      chromeStorage: { local: { get: async () => ({}) } }
    });
    tabs = { get: jest.fn(async (tabId) => ({ id: tabId, url: 'https://old.test/' })) };
    webNavigation = { getAllFrames: jest.fn(async () => [{ frameId: 0, url: 'https://old.test/' }]) };
  });

  it('restores the stored subscriptions and keeps their descriptors', async () => {
    expect(await restore()).toEqual({ restored: 2, failed: 0, dropped: 0 });

    expect(subscribeToNotesForUrl).toHaveBeenCalledWith('https://old.test/', 'u1', 'a@b.test', expect.any(Function), expect.any(Function));
    expect(noteSubscriptions.get('7-0').url).toBe('https://old.test/');
    expect(commentSubscriptions.has('7-n1')).toBe(true);
    expect((await store.load()).notes).toHaveLength(1);
    expect((await store.load()).comments[0].tabUrl).toBe('https://old.test/');
  });

  it('leaves a newer content-script subscribe alone', async () => {
    const claimed = restore();
    await handlers.subscribeNotes('https://new.test', { tab: { id: 7 }, frameId: 0 });
    await claimed;
    await flush();

    expect(noteSubscriptions.get('7-0').url).toBe('https://new.test');
    expect((await store.load()).notes[0].url).toBe('https://new.test');
  });

  it('does not bring back a subscription the content script cancelled before the restore claimed it', async () => {
    await handlers.unsubscribeNotes({ tab: { id: 7 }, frameId: 0 });
    await handlers.unsubscribeCommentsHandler('n1', { tab: { id: 7 } });

    const result = await restore();
    await flush();

    expect(result.restored).toBe(0);
    expect(noteSubscriptions.size).toBe(0);
    expect(commentSubscriptions.size).toBe(0);
    expect(await store.load()).toEqual({ notes: [], comments: [] });
  });

  it('drops the descriptors of a tab that closed while the worker was down', async () => {
    tabs.get.mockRejectedValue(new Error('No tab with id: 7.'));

    expect(await restore()).toEqual({ restored: 0, failed: 0, dropped: 2 });
    await flush();

    expect(await store.load()).toEqual({ notes: [], comments: [] });
    expect(await handlers.subscribeNotes('https://late.test', { tab: { id: 7 }, frameId: 0 }))
      .toEqual({ success: true, cancelled: true });
  });

  it('stays degraded when the content-script subscribe that claimed a key first fails, until the key is settled', async () => {
    let fail;
    subscribeToNotesForUrl.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; }));

    const contentSubscribe = handlers.subscribeNotes('https://new.test', { tab: { id: 7 }, frameId: 0 });
    await flush();
    await restore();
    fail(new Error('listener failed'));
    expect((await contentSubscribe).success).toBe(false);

    expect(await store.isDegraded()).toBe(true);
    expect(noteSubscriptions.has('7-0')).toBe(false);

    await handlers.subscribeNotes('https://new.test', { tab: { id: 7 }, frameId: 0 });
    await handlers.subscribeCommentsHandler('n1', { tab: { id: 7 } });
    await flush();

    expect(await store.isDegraded()).toBe(false);
  });

  it('is not degraded when the request that claimed a key first settles it while the restore is still working', async () => {
    let finish;
    subscribeToNotesForUrl.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(jest.fn()); }));
    const slowUser = {};
    slowUser.promise = new Promise((resolve) => { slowUser.resolve = resolve; });
    const getCurrentUser = jest.fn()
      .mockResolvedValueOnce({ uid: 'u1', email: 'a@b.test' })
      .mockImplementationOnce(() => slowUser.promise)
      .mockResolvedValue({ uid: 'u1', email: 'a@b.test' });
    handlers = createHandlers({
      getCurrentUser,
      isFirebaseConfigured: () => true,
      subscribeToNotesForUrl,
      subscribeToComments: jest.fn(async () => jest.fn()),
      noteSubscriptions,
      commentSubscriptions,
      subscriptionStore: store,
      log,
      chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}) },
      chromeStorage: { local: { get: async () => ({}) } }
    });

    const contentSubscribe = handlers.subscribeNotes('https://new.test', { tab: { id: 7 }, frameId: 0 });
    await flush();
    const restoring = restore();
    await flush();
    finish();
    await contentSubscribe;
    slowUser.resolve({ uid: 'u1', email: 'a@b.test' });
    await restoring;
    await flush();

    expect(noteSubscriptions.get('7-0').url).toBe('https://new.test');
    expect(await store.isDegraded()).toBe(false);
  });

  it('is not degraded when a content-script subscribe already settled a key before the restore loaded', async () => {
    await handlers.subscribeNotes('https://new.test', { tab: { id: 7 }, frameId: 0 });
    await handlers.subscribeCommentsHandler('n1', { tab: { id: 7 } });

    const result = await restore();
    await flush();

    expect(result).toEqual({ restored: 0, failed: 0, dropped: 0 });
    expect(await store.isDegraded()).toBe(false);
    expect(noteSubscriptions.get('7-0').url).toBe('https://new.test');
  });

  it('stays degraded when a content-script subscribe replaced the restore and then failed', async () => {
    const slowUser = {};
    slowUser.promise = new Promise((resolve) => { slowUser.resolve = resolve; });
    const getCurrentUser = jest.fn()
      .mockImplementationOnce(() => slowUser.promise)
      .mockResolvedValue({ uid: 'u1', email: 'a@b.test' });
    subscribeToNotesForUrl.mockRejectedValueOnce(new Error('listener failed'));
    handlers = createHandlers({
      getCurrentUser,
      isFirebaseConfigured: () => true,
      subscribeToNotesForUrl,
      subscribeToComments: jest.fn(async () => jest.fn()),
      noteSubscriptions,
      commentSubscriptions,
      subscriptionStore: store,
      log,
      chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}) },
      chromeStorage: { local: { get: async () => ({}) } }
    });

    const restoring = restore();
    await flush();
    const content = await handlers.subscribeNotes('https://new.test', { tab: { id: 7 }, frameId: 0 });
    slowUser.resolve({ uid: 'u1', email: 'a@b.test' });
    await restoring;
    await flush();

    expect(content.success).toBe(false);
    expect(noteSubscriptions.has('7-0')).toBe(false);
    expect(await store.isDegraded()).toBe(true);
  });

  it('is not degraded when the request that cancelled the restore was an unsubscribe or a tab close', async () => {
    const slowUser = {};
    slowUser.promise = new Promise((resolve) => { slowUser.resolve = resolve; });
    const getCurrentUser = jest.fn()
      .mockImplementationOnce(() => slowUser.promise)
      .mockResolvedValue({ uid: 'u1', email: 'a@b.test' });
    handlers = createHandlers({
      getCurrentUser,
      isFirebaseConfigured: () => true,
      subscribeToNotesForUrl,
      subscribeToComments: jest.fn(async () => jest.fn()),
      noteSubscriptions,
      commentSubscriptions,
      subscriptionStore: store,
      log,
      chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}) },
      chromeStorage: { local: { get: async () => ({}) } }
    });

    const restoring = restore();
    await flush();
    await handlers.unsubscribeNotes({ tab: { id: 7 }, frameId: 0 });
    handlers.releaseTab(7);
    slowUser.resolve({ uid: 'u1', email: 'a@b.test' });
    await restoring;
    await flush();

    expect(await store.isDegraded()).toBe(false);
    expect(await store.load()).toEqual({ notes: [], comments: [] });
  });

  it('does not subscribe to the previous page when a tab navigated while the worker was stopped', async () => {
    tabs.get.mockResolvedValue({ id: 7, url: 'https://new.test/page' });
    webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://new.test/page' }]);

    expect(await restore()).toEqual({ restored: 0, failed: 0, dropped: 2 });
    await flush();

    expect(subscribeToNotesForUrl).not.toHaveBeenCalled();
    expect(noteSubscriptions.size).toBe(0);
    expect(await store.load()).toEqual({ notes: [], comments: [] });
  });

  it('keeps the descriptor a new page saved while the restore was dropping the stale one', async () => {
    const slowUser = {};
    slowUser.promise = new Promise((resolve) => { slowUser.resolve = resolve; });
    const getCurrentUser = jest.fn()
      .mockImplementationOnce(() => slowUser.promise)
      .mockResolvedValue({ uid: 'u1', email: 'a@b.test' });
    handlers = createHandlers({
      getCurrentUser,
      isFirebaseConfigured: () => true,
      subscribeToNotesForUrl,
      subscribeToComments: jest.fn(async () => jest.fn()),
      noteSubscriptions,
      commentSubscriptions,
      subscriptionStore: store,
      log,
      chromeTabs: { sendMessage: jest.fn().mockResolvedValue({}) },
      chromeStorage: { local: { get: async () => ({}) } }
    });
    tabs.get.mockResolvedValue({ id: 7, url: 'https://new.test/' });
    webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, url: 'https://new.test/' }]);

    const restoring = restore();
    await flush();
    await handlers.subscribeNotes('https://new.test/', { tab: { id: 7 }, frameId: 0 });
    await handlers.subscribeCommentsHandler('n1', { tab: { id: 7, url: 'https://new.test/' } });
    slowUser.resolve({ uid: 'u1', email: 'a@b.test' });
    await restoring;
    await flush();

    const stored = await store.load();
    expect(stored.notes.map((note) => note.url)).toEqual(['https://new.test/']);
    expect(stored.comments.map((comment) => comment.tabUrl)).toEqual(['https://new.test/']);
  });
});
