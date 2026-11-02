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
        notes: { '7-0': { tabId: 7, frameId: 0, url: 'https://old.test' } },
        comments: { '7-n1': { tabId: 7, noteId: 'n1' } }
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
    tabs = { get: jest.fn(async (tabId) => ({ id: tabId })) };
    webNavigation = { getAllFrames: jest.fn(async () => [{ frameId: 0 }]) };
  });

  it('restores the stored subscriptions and keeps their descriptors', async () => {
    expect(await restore()).toEqual({ restored: 2, failed: 0, dropped: 0 });

    expect(subscribeToNotesForUrl).toHaveBeenCalledWith('https://old.test', 'u1', 'a@b.test', expect.any(Function), expect.any(Function));
    expect(noteSubscriptions.get('7-0').url).toBe('https://old.test');
    expect(commentSubscriptions.has('7-n1')).toBe(true);
    expect((await store.load()).notes).toHaveLength(1);
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
});
