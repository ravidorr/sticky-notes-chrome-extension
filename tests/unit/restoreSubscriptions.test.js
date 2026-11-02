/**
 * Restore subscriptions unit tests
 */

import { readFileSync } from 'node:fs';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { restoreSubscriptions } from '../../src/background/restoreSubscriptions.js';

describe('restoreSubscriptions', () => {
  let store;
  let handlers;
  let tabs;
  let webNavigation;
  let log;
  let wait;
  let saved;
  let nextGeneration;

  const run = () => restoreSubscriptions({ store, handlers, tabs, webNavigation, log, wait });

  beforeEach(() => {
    saved = {
      notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: 'https://a.test' }],
      comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1' }]
    };
    nextGeneration = 10;
    store = {
      load: jest.fn(async () => saved),
      clear: jest.fn(async () => {}),
      removeNote: jest.fn(async () => {}),
      setFailed: jest.fn(async () => {}),
      addFailed: jest.fn(async () => {})
    };
    handlers = {
      getUser: jest.fn(async () => ({ success: true, user: { uid: 'u1' } })),
      claimRestore: jest.fn(() => { nextGeneration += 1; return nextGeneration; }),
      releaseTab: jest.fn(),
      subscribeNotes: jest.fn(async () => ({ success: true })),
      subscribeCommentsHandler: jest.fn(async () => ({ success: true }))
    };
    tabs = { get: jest.fn(async (tabId) => ({ id: tabId })) };
    webNavigation = { getAllFrames: jest.fn(async () => [{ frameId: 0 }, { frameId: 2 }]) };
    log = { error: jest.fn() };
    wait = jest.fn(async () => {});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('what is stored', () => {
    it('does nothing, and clears the failed list, when nothing was stored', async () => {
      saved = { notes: [], comments: [] };

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(store.setFailed).toHaveBeenCalledWith([]);
      expect(handlers.getUser).not.toHaveBeenCalled();
    });

    it('logs when the stored subscriptions cannot be read', async () => {
      store.load.mockResolvedValue(null);

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 0 });
      expect(log.error).toHaveBeenCalledTimes(1);
      expect(handlers.claimRestore).not.toHaveBeenCalled();
      expect(store.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('claiming keys', () => {
    it('claims every key before it looks anything up', async () => {
      handlers.getUser.mockImplementation(async () => {
        expect(handlers.claimRestore).toHaveBeenCalledTimes(2);
        return { success: true, user: { uid: 'u1' } };
      });

      await run();

      expect(handlers.claimRestore).toHaveBeenCalledWith('note', '1-0');
      expect(handlers.claimRestore).toHaveBeenCalledWith('comment', '1-n1');
    });

    it('subscribes with the claimed generation', async () => {
      await run();

      expect(handlers.subscribeNotes).toHaveBeenCalledWith('https://a.test', { tab: { id: 1 }, frameId: 0 }, 11);
      expect(handlers.subscribeCommentsHandler).toHaveBeenCalledWith('n1', { tab: { id: 1 } }, 12);
    });

    it('skips keys a content script already handled, without dropping them, and keeps them in the failed list', async () => {
      handlers.claimRestore.mockImplementation((kind) => (kind === 'note' ? null : 12));

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 0 });
      expect(handlers.subscribeNotes).not.toHaveBeenCalled();
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(store.setFailed).toHaveBeenCalledWith(['note:1-0']);
    });

    it('skips comment keys a content script already handled and keeps them in the failed list', async () => {
      handlers.claimRestore.mockImplementation((kind) => (kind === 'comment' ? null : 11));

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 0 });
      expect(handlers.subscribeCommentsHandler).not.toHaveBeenCalled();
      expect(store.setFailed).toHaveBeenCalledWith(['comment:1-n1']);
    });

    it('keeps skipped keys in the failed list next to the ones that failed', async () => {
      handlers.claimRestore.mockImplementation((kind) => (kind === 'comment' ? null : 11));
      handlers.subscribeNotes.mockResolvedValue({ success: false, error: 'down' });

      await run();

      expect(store.setFailed).toHaveBeenCalledWith(['comment:1-n1']);
      expect(store.addFailed).toHaveBeenLastCalledWith(['note:1-0']);
    });

    it('keeps skipped keys in the failed list when the user lookup keeps failing', async () => {
      handlers.claimRestore.mockImplementation((kind) => (kind === 'comment' ? null : 11));
      handlers.getUser.mockResolvedValue({ success: false });

      await run();

      expect(store.setFailed).toHaveBeenCalledWith(['comment:1-n1']);
      expect(store.addFailed).toHaveBeenCalledWith(['note:1-0']);
    });

    it('replaces the failed list before it awaits anything but the store, so later settles win', async () => {
      handlers.claimRestore.mockImplementation((kind) => (kind === 'comment' ? null : 11));
      handlers.getUser.mockImplementation(async () => {
        expect(store.setFailed).toHaveBeenCalledWith(['comment:1-n1']);
        return { success: true, user: { uid: 'u1' } };
      });

      await run();

      expect(store.setFailed).toHaveBeenCalledTimes(1);
    });

    it('does not clear descriptors a content script handled when nobody is signed in', async () => {
      handlers.claimRestore.mockImplementation((kind) => (kind === 'note' ? null : 12));
      handlers.getUser.mockResolvedValue({ success: true, user: null });

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 1 });
    });
  });

  describe('the user', () => {
    it('restores note and comment subscriptions for a signed-in user', async () => {
      expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });
      expect(store.setFailed).toHaveBeenCalledWith([]);
      expect(store.addFailed).toHaveBeenCalledWith([]);
      expect(log.error).not.toHaveBeenCalled();
    });

    it('drops everything when nobody is signed in', async () => {
      handlers.getUser.mockResolvedValue({ success: true, user: null });

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 2 });
      expect(store.clear).toHaveBeenCalledTimes(1);
      expect(handlers.subscribeNotes).not.toHaveBeenCalled();
    });

    it('keeps everything when the user lookup keeps failing, and flags sync as degraded', async () => {
      handlers.getUser.mockRejectedValueOnce(new Error('sdk not ready')).mockResolvedValue({ success: false });

      expect(await run()).toEqual({ restored: 0, failed: 2, dropped: 0 });
      expect(handlers.getUser).toHaveBeenCalledTimes(5);
      expect(wait.mock.calls.map((call) => call[0])).toEqual([1000, 2000, 4000, 8000]);
      expect(store.clear).not.toHaveBeenCalled();
      expect(store.addFailed).toHaveBeenCalledWith(['note:1-0', 'comment:1-n1']);
    });

    it('recovers when the user lookup works on a retry', async () => {
      handlers.getUser
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({ success: true, user: { uid: 'u1' } });

      expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });
      expect(store.clear).not.toHaveBeenCalled();
    });
  });

  describe('tabs and frames', () => {
    it('releases a tab Chrome says is closed, with its descriptors', async () => {
      tabs.get.mockRejectedValue(new Error('No tab with id: 1.'));

      expect(await run()).toEqual({ restored: 0, failed: 0, dropped: 2 });
      expect(handlers.releaseTab).toHaveBeenCalledWith(1);
      expect(handlers.subscribeNotes).not.toHaveBeenCalled();
    });

    it('keeps a tab it could not check and counts it as failed', async () => {
      tabs.get.mockRejectedValue(new Error('Tabs API unavailable'));

      expect(await run()).toEqual({ restored: 0, failed: 2, dropped: 0 });
      expect(handlers.releaseTab).not.toHaveBeenCalled();
      expect(store.addFailed).toHaveBeenCalledWith(['note:1-0', 'comment:1-n1']);
      expect(log.error).toHaveBeenCalledWith('Could not check tab', 1, expect.any(Error));
    });

    it('drops note descriptors of frames that no longer exist but keeps the tab comments', async () => {
      webNavigation.getAllFrames.mockResolvedValue([{ frameId: 5 }]);

      expect(await run()).toEqual({ restored: 1, failed: 0, dropped: 1 });
      expect(store.removeNote).toHaveBeenCalledWith('1-0');
      expect(handlers.subscribeCommentsHandler).toHaveBeenCalledTimes(1);
    });

    it('keeps a tab whose frames cannot be listed instead of dropping its notes', async () => {
      webNavigation.getAllFrames.mockRejectedValue(new Error('no frames'));

      expect(await run()).toEqual({ restored: 0, failed: 2, dropped: 0 });
      expect(store.removeNote).not.toHaveBeenCalled();

      webNavigation.getAllFrames.mockResolvedValue(null);
      expect((await run()).failed).toBe(2);
      expect(log.error).toHaveBeenCalledWith('Could not list the frames of tab', 1, expect.any(Error));
    });

    it('tolerates a missing error message when a tab check fails', async () => {
      tabs.get.mockRejectedValue(undefined);

      expect((await run()).failed).toBe(2);
    });
  });

  describe('failures', () => {
    it('retries a failed subscribe with a growing delay and then succeeds', async () => {
      handlers.subscribeNotes
        .mockResolvedValueOnce({ success: false, error: 'not ready' })
        .mockResolvedValueOnce({ success: false, error: 'not ready' })
        .mockResolvedValue({ success: true });

      expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });
      expect(handlers.subscribeNotes).toHaveBeenCalledTimes(3);
      expect(handlers.subscribeCommentsHandler).toHaveBeenCalledTimes(1);
      expect(wait.mock.calls.map((call) => call[0])).toEqual([1000, 2000]);
      expect(store.setFailed).toHaveBeenCalledWith([]);
    });

    it('retries with the generation it claimed, so a newer request cancels the retry', async () => {
      handlers.subscribeNotes
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValue({ success: true, cancelled: true });

      expect(await run()).toEqual({ restored: 2, failed: 0, dropped: 0 });
      expect(handlers.subscribeNotes.mock.calls.map((call) => call[2])).toEqual([11, 11]);
    });

    it('records the failed subscriptions, keeps the descriptors and logs every failure', async () => {
      handlers.subscribeNotes.mockResolvedValue({ success: false, error: 'down' });

      expect(await run()).toEqual({ restored: 1, failed: 1, dropped: 0 });
      expect(handlers.subscribeNotes).toHaveBeenCalledTimes(5);
      expect(wait.mock.calls.map((call) => call[0])).toEqual([1000, 2000, 4000, 8000]);
      expect(store.addFailed).toHaveBeenCalledWith(['note:1-0']);
      expect(store.removeNote).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith('Could not restore note 1-0:', 'down');
      expect(log.error).toHaveBeenCalledTimes(2);
    });

    it('does not let one rejected job stop the others', async () => {
      handlers.subscribeNotes.mockRejectedValue(new Error('boom'));

      expect(await run()).toEqual({ restored: 1, failed: 1, dropped: 0 });
      expect(handlers.subscribeCommentsHandler).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith('Could not restore note 1-0:', 'boom');
    });

    it('treats a cancelled subscribe as done and an empty result as a failure', async () => {
      handlers.subscribeNotes.mockResolvedValue({ success: true, cancelled: true });
      handlers.subscribeCommentsHandler.mockResolvedValue(undefined);

      expect(await run()).toEqual({ restored: 1, failed: 1, dropped: 0 });
      expect(log.error).toHaveBeenCalledWith('Could not restore comment 1-n1:', undefined);
    });

    it('waits with real timers by default', async () => {
      jest.useFakeTimers();
      handlers.subscribeNotes
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValue({ success: true });

      const pending = restoreSubscriptions({ store, handlers, tabs, webNavigation, log });
      await jest.advanceTimersByTimeAsync(1000);

      expect(await pending).toEqual({ restored: 2, failed: 0, dropped: 0 });
    });
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
