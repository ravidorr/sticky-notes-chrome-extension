/**
 * Background runtime tests: the wiring of the store, the handlers, the tab cleanup, the keep-alive
 * alarm and the restore, exercised by calling createBackgroundRuntime with fake dependencies.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createBackgroundRuntime } from '../../src/background/runtime.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeSession(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: jest.fn(async (keys) => Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]))),
    set: jest.fn(async (items) => { Object.assign(data, JSON.parse(JSON.stringify(items))); })
  };
}

describe('createBackgroundRuntime', () => {
  let log;
  let session;
  let chromeFake;
  let handlerDeps;
  let subscribeToNotesForUrl;
  let subscribeToComments;
  let alarmListener;
  let tabRemovedListener;
  let user;

  const build = (extra = {}) => createBackgroundRuntime({ chrome: chromeFake, handlerDeps, log, ...extra });
  const note = '7-0';

  beforeEach(() => {
    log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    session = makeSession({
      subscriptions: {
        notes: { [note]: { tabId: 7, frameId: 0, url: 'https://old.test/' } },
        comments: { '7-n1': { tabId: 7, noteId: 'n1', tabUrl: 'https://old.test/' } }
      }
    });
    user = { uid: 'u1', email: 'a@b.test' };
    subscribeToNotesForUrl = jest.fn(async () => jest.fn());
    subscribeToComments = jest.fn(async () => jest.fn());
    alarmListener = null;
    tabRemovedListener = null;
    chromeFake = {
      storage: { session, local: { get: jest.fn(async () => ({})), set: jest.fn(async () => {}) } },
      tabs: {
        get: jest.fn(async (tabId) => ({ id: tabId, url: 'https://old.test/' })),
        sendMessage: jest.fn().mockResolvedValue({}),
        onRemoved: { addListener: jest.fn((listener) => { tabRemovedListener = listener; }) }
      },
      webNavigation: { getAllFrames: jest.fn(async () => [{ frameId: 0, url: 'https://old.test/' }]) },
      action: { setBadgeText: jest.fn() },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn((listener) => { alarmListener = listener; }) }
      }
    };
    handlerDeps = {
      getCurrentUser: jest.fn(async () => user),
      isFirebaseConfigured: () => true,
      subscribeToNotesForUrl,
      subscribeToComments,
      signOut: jest.fn(async () => {})
    };
  });

  it('builds the handlers with the injected dependencies and the chrome APIs', async () => {
    const createHandlers = jest.fn(() => ({ retryPending: jest.fn(), restore: jest.fn() }));

    build({ createHandlers });

    expect(createHandlers).toHaveBeenCalledWith(expect.objectContaining({
      getCurrentUser: handlerDeps.getCurrentUser,
      signOut: handlerDeps.signOut,
      noteSubscriptions: expect.any(Map),
      commentSubscriptions: expect.any(Map),
      sharedNotesSubscription: { current: null },
      subscriptionStore: expect.any(Object),
      log,
      chromeStorage: chromeFake.storage,
      chromeTabs: chromeFake.tabs,
      chromeWebNavigation: chromeFake.webNavigation,
      chromeAction: chromeFake.action
    }));
  });

  it('creates the store from chrome.storage.session and gives it to the handlers', async () => {
    const runtime = build();

    expect(runtime.subscriptionStore).not.toBeNull();
    await runtime.handlers.subscribeNotes('https://new.test/', { tab: { id: 8 }, frameId: 0 });
    await flush();

    expect(session.data.subscriptions.notes['8-0']).toEqual({ tabId: 8, frameId: 0, url: 'https://new.test/' });
    expect(await runtime.handlers.getRealtimeSyncStatus()).toMatchObject({ restorable: true });
  });

  it('works without chrome.storage.session: it warns, restores nothing and reports sync as not restorable', async () => {
    delete chromeFake.storage.session;
    const runtime = build();

    runtime.start();
    await flush();

    expect(runtime.subscriptionStore).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('chrome.storage.session is not available'));
    expect(chromeFake.tabs.get).not.toHaveBeenCalled();
    expect(await runtime.handlers.getRealtimeSyncStatus()).toMatchObject({ restorable: false });
  });

  describe('start', () => {
    it('registers the tab cleanup, which releases the subscriptions of a closed tab', async () => {
      const unsubscribe = jest.fn();
      subscribeToNotesForUrl.mockResolvedValue(unsubscribe);
      const runtime = build();
      runtime.start();

      await runtime.handlers.subscribeNotes('https://new.test/', { tab: { id: 8 }, frameId: 0 });
      tabRemovedListener(8);
      await flush();

      expect(chromeFake.tabs.onRemoved.addListener).toHaveBeenCalledTimes(1);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('creates the keep-alive alarm at the 30 second floor', () => {
      build().start();

      expect(chromeFake.alarms.create).toHaveBeenCalledWith('keepAlive', { periodInMinutes: 0.4 });
    });

    it('retries the subscriptions that failed to start on every keep-alive tick', async () => {
      subscribeToNotesForUrl.mockRejectedValueOnce(new Error('sdk not ready'));
      session.data.subscriptions = { notes: {}, comments: {} };
      const runtime = build();
      runtime.start();

      const failed = await runtime.handlers.subscribeNotes('https://old.test/', { tab: { id: 7 }, frameId: 0 });
      subscribeToNotesForUrl.mockClear();
      alarmListener({ name: 'keepAlive' });
      await flush();
      await flush();

      expect(failed.success).toBe(false);
      expect(subscribeToNotesForUrl).toHaveBeenCalledTimes(1);
      expect(await runtime.handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
    });

    it('ignores other alarms', async () => {
      const retryPending = jest.fn().mockResolvedValue({});
      build({ createHandlers: () => ({ retryPending, restore: jest.fn().mockResolvedValue({}) }) }).start();

      alarmListener({ name: 'somethingElse' });

      expect(retryPending).not.toHaveBeenCalled();
    });

    it('logs a failing retry instead of throwing out of the alarm listener', async () => {
      const failure = new Error('retry broke');
      const retryPending = jest.fn().mockRejectedValue(failure);
      build({ createHandlers: () => ({ retryPending, restore: jest.fn().mockResolvedValue({}) }) }).start();

      alarmListener({ name: 'keepAlive' });
      await flush();

      expect(log.error).toHaveBeenCalledWith('Failed to retry real-time subscriptions:', failure);
    });

    it('restores the subscriptions a stopped worker held, for the tabs that still exist', async () => {
      const runtime = build();

      runtime.start();
      await flush();
      await flush();

      expect(subscribeToNotesForUrl).toHaveBeenCalledWith(
        'https://old.test/', 'u1', 'a@b.test', expect.any(Function), expect.any(Function)
      );
      expect(subscribeToComments).toHaveBeenCalledTimes(1);
      expect(chromeFake.tabs.get).toHaveBeenCalledWith(7);
      expect(chromeFake.webNavigation.getAllFrames).toHaveBeenCalledWith({ tabId: 7 });
      expect(await runtime.handlers.getRealtimeSyncStatus()).toMatchObject({ degraded: false });
    });

    it('logs a failing restore instead of throwing', async () => {
      const failure = new Error('restore broke');
      build({
        createHandlers: () => ({ retryPending: jest.fn(), restore: jest.fn().mockRejectedValue(failure) })
      }).start();
      await flush();

      expect(log.error).toHaveBeenCalledWith('Failed to restore real-time subscriptions:', failure);
    });
  });
});
