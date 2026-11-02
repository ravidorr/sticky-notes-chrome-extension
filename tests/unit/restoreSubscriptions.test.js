/**
 * Restore subscriptions unit tests
 */

import { readFileSync } from 'node:fs';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { restoreSubscriptions } from '../../src/background/restoreSubscriptions.js';

describe('restoreSubscriptions', () => {
  let store;
  let handlers;
  let tabs;
  let webNavigation;
  let log;
  let wait;
  let saved;

  const run = () => restoreSubscriptions({ store, handlers, tabs, webNavigation, log, wait });

  beforeEach(() => {
    saved = {
      notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: 'https://a.test' }],
      comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1' }]
    };
    store = {
      load: jest.fn(async () => saved),
      clear: jest.fn(async () => {}),
      removeNote: jest.fn(async () => {}),
      removeComment: jest.fn(async () => {}),
      setDegraded: jest.fn(async () => {})
    };
    handlers = {
      getUser: jest.fn(async () => ({ success: true, user: { uid: 'u1' } })),
      subscribeNotes: jest.fn(async () => ({ success: true })),
      subscribeCommentsHandler: jest.fn(async () => ({ success: true }))
    };
    tabs = { get: jest.fn(async (tabId) => ({ id: tabId })) };
    webNavigation = { getAllFrames: jest.fn(async () => [{ frameId: 0 }, { frameId: 2 }]) };
    log = { error: jest.fn() };
    wait = jest.fn(async () => {});
  });

  it('does nothing when no subscriptions were stored', async () => {
    saved = { notes: [], comments: [] };

    expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 0 });
    expect(handlers.getUser).not.toHaveBeenCalled();
    expect(store.setDegraded).not.toHaveBeenCalled();
  });

  it('restores note and comment subscriptions through the handlers', async () => {
    const result = await run();

    expect(handlers.subscribeNotes).toHaveBeenCalledWith('https://a.test', { tab: { id: 1 }, frameId: 0 });
    expect(handlers.subscribeCommentsHandler).toHaveBeenCalledWith('n1', { tab: { id: 1 } });
    expect(result).toEqual({ restored: 2, failed: 0, dropped: 0 });
    expect(store.setDegraded).toHaveBeenCalledWith(false);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('drops everything when nobody is signed in', async () => {
    handlers.getUser.mockResolvedValue({ success: true, user: null });

    expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 2 });
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(handlers.subscribeNotes).not.toHaveBeenCalled();
  });

  it('drops everything when the user lookup fails', async () => {
    handlers.getUser.mockResolvedValue(undefined);

    expect((await run()).dropped).toBe(2);
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('drops descriptors of closed tabs', async () => {
    tabs.get.mockRejectedValue(new Error('No tab with id'));

    expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 2 });
    expect(store.removeNote).toHaveBeenCalledWith('1-0');
    expect(store.removeComment).toHaveBeenCalledWith('1-n1');
    expect(handlers.subscribeNotes).not.toHaveBeenCalled();
  });

  it('drops note descriptors of frames that no longer exist but keeps the tab comments', async () => {
    webNavigation.getAllFrames.mockResolvedValue([{ frameId: 5 }]);

    expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 1 });
    expect(store.removeNote).toHaveBeenCalledWith('1-0');
    expect(handlers.subscribeCommentsHandler).toHaveBeenCalledTimes(1);
  });

  it('drops note descriptors when frame information is unavailable', async () => {
    webNavigation.getAllFrames.mockRejectedValue(new Error('no frames'));

    expect((await run()).dropped).toBe(1);
    expect(handlers.subscribeNotes).not.toHaveBeenCalled();

    webNavigation.getAllFrames.mockResolvedValue(null);
    expect((await run()).dropped).toBe(1);
  });

  it('retries a failed subscribe with a growing delay and then succeeds', async () => {
    handlers.subscribeNotes
      .mockResolvedValueOnce({ success: false, error: 'not ready' })
      .mockResolvedValueOnce({ success: false, error: 'not ready' })
      .mockResolvedValue({ success: true });

    expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });
    expect(handlers.subscribeNotes).toHaveBeenCalledTimes(3);
    expect(handlers.subscribeCommentsHandler).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls.map((call) => call[0])).toEqual([1000, 2000]);
    expect(store.setDegraded).toHaveBeenCalledWith(false);
  });

  it('flags sync as degraded and keeps the descriptors when a subscribe never works', async () => {
    handlers.subscribeNotes.mockResolvedValue({ success: false, error: 'down' });

    expect(await run()).toEqual({ restored: 1, failed: 1, dropped: 0 });
    expect(handlers.subscribeNotes).toHaveBeenCalledTimes(5);
    expect(wait.mock.calls.map((call) => call[0])).toEqual([1000, 2000, 4000, 8000]);
    expect(store.setDegraded).toHaveBeenCalledWith(true);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(store.removeNote).not.toHaveBeenCalled();
  });

  it('treats a cancelled subscribe as done and an empty result as a failure', async () => {
    handlers.subscribeNotes.mockResolvedValue({ success: true, cancelled: true });
    handlers.subscribeCommentsHandler.mockResolvedValue(undefined);

    expect(await run()).toEqual({ restored: 1, failed: 1, dropped: 0 });
  });

  it('waits with real timers by default', async () => {
    jest.useFakeTimers();
    handlers.subscribeNotes
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValue({ success: true });

    const pending = restoreSubscriptions({ store, handlers, tabs, webNavigation, log });
    await jest.advanceTimersByTimeAsync(1000);

    expect(await pending).toEqual({ restored: 2, failed: 0, dropped: 0 });
    jest.useRealTimers();
  });
});

describe('background bootstrap wiring', () => {
  // src/background/index.js is excluded from coverage and only bootstraps outside Jest, so this
  // guards the lines that connect the store, the handlers and the restore on worker start
  it('creates the store from chrome.storage.session, gives it to the handlers and restores on start', () => {
    const source = readFileSync(new URL('../../src/background/index.js', import.meta.url), 'utf8');

    expect(source).toMatch(/createSubscriptionStore\(chrome\.storage\.session, log\)/);
    expect(source).toMatch(/sharedNotesSubscription,\s+subscriptionStore,/);
    expect(source).toMatch(/restoreSubscriptions\(\{\s+store: subscriptionStore,\s+handlers,/);
    expect(source).not.toMatch(/onConnect/);
  });
});
