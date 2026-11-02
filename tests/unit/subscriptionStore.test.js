/**
 * Subscription store unit tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createSubscriptionStore } from '../../src/background/subscriptionStore.js';

function makeArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: jest.fn(async (keys) => Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]))),
    set: jest.fn(async (items) => { Object.assign(data, JSON.parse(JSON.stringify(items))); })
  };
}

describe('subscription store', () => {
  let area;
  let log;
  let store;

  beforeEach(() => {
    area = makeArea();
    log = { error: jest.fn() };
    store = createSubscriptionStore(area, log);
  });

  it('loads nothing from empty storage', async () => {
    expect(await store.load()).toEqual({ notes: [], comments: [] });
  });

  it('saves and loads note and comment descriptors with their keys', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'https://a.test' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });

    expect(await store.load()).toEqual({
      notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: 'https://a.test' }],
      comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1' }]
    });
    expect(area.data.subscriptions.notes['1-0'].url).toBe('https://a.test');
  });

  it('reads what an earlier worker stored', async () => {
    area = makeArea({ subscriptions: { notes: { '2-0': { tabId: 2, frameId: 0, url: 'u' } }, comments: {} } });
    store = createSubscriptionStore(area, log);

    expect((await store.load()).notes).toEqual([{ subKey: '2-0', tabId: 2, frameId: 0, url: 'u' }]);
  });

  it('ignores stored values of the wrong shape', async () => {
    for (const stored of [undefined, null, 'text', [], { notes: [], comments: 'x' }]) {
      store = createSubscriptionStore(makeArea({ subscriptions: stored }), log);
      expect(await store.load()).toEqual({ notes: [], comments: [] });
    }
  });

  it('removes a single note or comment descriptor', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.saveNote('1-1', { tabId: 1, frameId: 1, url: 'b' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });

    await store.removeNote('1-0');
    await store.removeComment('1-n1');

    expect(await store.load()).toEqual({
      notes: [{ subKey: '1-1', tabId: 1, frameId: 1, url: 'b' }],
      comments: []
    });
  });

  it('removes every descriptor of a tab and only that tab', async () => {
    await store.saveNote('12-0', { tabId: 12, frameId: 0, url: 'a' });
    await store.saveNote('123-0', { tabId: 123, frameId: 0, url: 'b' });
    await store.saveNote('123-1', { tabId: 123, frameId: 1, url: 'c' });
    await store.saveComment('123-n1', { tabId: 123, noteId: 'n1' });
    await store.saveComment('12-n1', { tabId: 12, noteId: 'n1' });

    await store.removeTab(123);

    const loaded = await store.load();
    expect(loaded.notes.map((note) => note.subKey)).toEqual(['12-0']);
    expect(loaded.comments.map((comment) => comment.subKey)).toEqual(['12-n1']);
  });

  it('clears everything', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });

    await store.clear();

    expect(await store.load()).toEqual({ notes: [], comments: [] });
  });

  it('keeps operations in call order when callers do not wait', async () => {
    store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    store.removeNote('1-0');
    store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'b' });

    expect((await store.load()).notes).toEqual([{ subKey: '1-0', tabId: 1, frameId: 0, url: 'b' }]);
  });

  it('reads storage once and writes after every change', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.saveNote('1-1', { tabId: 1, frameId: 1, url: 'b' });
    await store.load();

    expect(area.get).toHaveBeenCalledTimes(1);
    expect(area.set).toHaveBeenCalledTimes(2);
  });

  it('is degraded while a failed subscription is left', async () => {
    expect(await store.isDegraded()).toBe(false);

    await store.setFailed(['note:1-0', 'comment:1-n1']);
    expect(await store.isDegraded()).toBe(true);

    await store.setFailed([]);
    expect(await store.isDegraded()).toBe(false);
  });

  it('is no longer degraded once every failed key was handled', async () => {
    await store.setFailed(['note:1-0', 'comment:1-n1', 'note:2-0', 'comment:2-n1', 'note:3-0']);

    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.removeComment('1-n1');
    await store.removeTab(2);
    expect(await store.isDegraded()).toBe(true);

    await store.removeNote('3-0');
    expect(await store.isDegraded()).toBe(false);
  });

  describe('loadAndClaim', () => {
    it('gives the claim the stored descriptors with their keys and stores the skipped keys', async () => {
      await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
      await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });
      const claim = jest.fn(() => ({ skippedKeys: ['comment:1-n1'], extra: 42 }));

      const result = await store.loadAndClaim(claim);

      expect(claim).toHaveBeenCalledWith({
        notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: 'a' }],
        comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1' }]
      });
      expect(result).toEqual({ skippedKeys: ['comment:1-n1'], extra: 42 });
      expect(await store.isDegraded()).toBe(true);
      expect(area.data.subscriptions.failed).toEqual(['comment:1-n1']);
    });

    it('replaces the failed list of an earlier run', async () => {
      await store.setFailed(['note:9-0']);

      await store.loadAndClaim(() => ({ skippedKeys: [] }));

      expect(await store.isDegraded()).toBe(false);
    });

    it('sees what was queued before it, and what is queued after it cannot be undone by its list', async () => {
      store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'before' });
      const claim = jest.fn(() => ({ skippedKeys: ['note:1-0'] }));

      const claiming = store.loadAndClaim(claim);
      store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'after' });
      await claiming;

      expect(claim.mock.calls[0][0].notes[0].url).toBe('before');
      expect(await store.isDegraded()).toBe(false);
    });

    it('returns null when storage cannot be read or written', async () => {
      area.get.mockRejectedValueOnce(new Error('read failed'));
      expect(await store.loadAndClaim(() => ({ skippedKeys: [] }))).toBeNull();

      area.set.mockRejectedValueOnce(new Error('write failed'));
      expect(await store.loadAndClaim(() => ({ skippedKeys: [] }))).toBeNull();
    });
  });

  it('adds failed keys without losing the ones already there', async () => {
    await store.setFailed(['note:1-0']);

    await store.addFailed(['comment:1-n1', 'note:1-0']);

    await store.removeNote('1-0');
    expect(await store.isDegraded()).toBe(true);
    await store.removeComment('1-n1');
    expect(await store.isDegraded()).toBe(false);
  });

  it('also clears a failed comment by subscribing to it, and everything by clearing', async () => {
    await store.setFailed(['comment:1-n1', 'note:2-0']);

    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });
    expect(await store.isDegraded()).toBe(true);

    await store.clear();
    expect(await store.isDegraded()).toBe(false);
  });

  it('keeps unrelated failed keys of other tabs when a tab is removed', async () => {
    await store.setFailed(['note:12-0', 'comment:12-n1', 'note:123-0']);

    await store.removeTab(123);

    expect(await store.isDegraded()).toBe(true);
    await store.removeTab(12);
    expect(await store.isDegraded()).toBe(false);
  });

  it('ignores failed values of the wrong shape in storage', async () => {
    store = createSubscriptionStore(makeArea({ subscriptions: { failed: 'x' } }), log);
    expect(await store.isDegraded()).toBe(false);

    store = createSubscriptionStore(makeArea({ subscriptions: { failed: [1, 'note:1-0', null] } }), log);
    expect(await store.isDegraded()).toBe(true);
  });

  it('logs and carries on when storage fails, and returns null when it cannot be read', async () => {
    area.get.mockRejectedValueOnce(new Error('read failed'));
    expect(await store.load()).toBeNull();

    area.set.mockRejectedValueOnce(new Error('write failed'));
    await expect(store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' })).resolves.toBeUndefined();
    await expect(store.setFailed(['note:1-0'])).resolves.toBeUndefined();

    area.get.mockRejectedValueOnce(new Error('read failed'));
    store = createSubscriptionStore(area, log);
    expect(await store.isDegraded()).toBe(false);
    expect(log.error).toHaveBeenCalledTimes(3);
  });

  it('reads storage again after a failed write instead of trusting its cache', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    area.set.mockRejectedValueOnce(new Error('write failed'));

    await store.saveNote('1-1', { tabId: 1, frameId: 1, url: 'b' });
    const loaded = await store.load();

    expect(loaded.notes.map((note) => note.subKey)).toEqual(['1-0']);
  });
});
