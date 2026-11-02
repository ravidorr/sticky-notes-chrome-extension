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

  it('hydrates nothing from empty storage', async () => {
    expect(await store.hydrate()).toEqual({ notes: [], comments: [] });
  });

  it('saves note and comment descriptors and hydrates them with their keys', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'https://a.test' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });

    expect(await store.hydrate()).toEqual({
      notes: [{ subKey: '1-0', tabId: 1, frameId: 0, url: 'https://a.test' }],
      comments: [{ subKey: '1-n1', tabId: 1, noteId: 'n1' }]
    });
    expect(area.data.subscriptions.notes['1-0'].url).toBe('https://a.test');
  });

  it('reads what an earlier worker stored', async () => {
    area = makeArea({ subscriptions: { notes: { '2-0': { tabId: 2, frameId: 0, url: 'u' } }, comments: {} } });
    store = createSubscriptionStore(area, log);

    expect((await store.hydrate()).notes).toEqual([{ subKey: '2-0', tabId: 2, frameId: 0, url: 'u' }]);
  });

  it('ignores stored values of the wrong shape, and a stored failed field', async () => {
    for (const stored of [undefined, null, 'text', [], { notes: [], comments: 'x' }]) {
      store = createSubscriptionStore(makeArea({ subscriptions: stored }), log);
      expect(await store.hydrate()).toEqual({ notes: [], comments: [] });
    }
    store = createSubscriptionStore(makeArea({ subscriptions: { notes: {}, comments: {}, failed: ['note:1-0'] } }), log);
    expect(await store.hydrate()).toEqual({ notes: [], comments: [] });
  });

  it('removes a single note or comment descriptor', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.saveNote('1-1', { tabId: 1, frameId: 1, url: 'b' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });
    await store.saveComment('1-n2', { tabId: 1, noteId: 'n2' });

    await store.removeNote('1-0');
    await store.removeComment('1-n1');

    const loaded = await store.hydrate();
    expect(loaded.notes.map((note) => note.subKey)).toEqual(['1-1']);
    expect(loaded.comments.map((comment) => comment.subKey)).toEqual(['1-n2']);
  });

  it('removes every descriptor of a tab and only that tab', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.saveNote('12-0', { tabId: 12, frameId: 0, url: 'b' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });
    await store.saveComment('2-n1', { tabId: 2, noteId: 'n1' });

    await store.removeTab(1);

    const loaded = await store.hydrate();
    expect(loaded.notes.map((note) => note.subKey)).toEqual(['12-0']);
    expect(loaded.comments.map((comment) => comment.subKey)).toEqual(['2-n1']);
  });

  it('clears everything', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });

    await store.clear();

    expect(await store.hydrate()).toEqual({ notes: [], comments: [] });
    expect(area.data.subscriptions).toEqual({ notes: {}, comments: {} });
  });

  it('keeps operations in call order when callers do not wait', async () => {
    store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    store.removeNote('1-0');
    store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'b' });

    expect((await store.hydrate()).notes).toEqual([{ subKey: '1-0', tabId: 1, frameId: 0, url: 'b' }]);
  });

  it('reads storage once and writes the whole state after every change', async () => {
    await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
    await store.saveComment('1-n1', { tabId: 1, noteId: 'n1' });
    await store.hydrate();

    expect(area.get).toHaveBeenCalledTimes(1);
    expect(area.set).toHaveBeenCalledTimes(2);
    expect(area.set).toHaveBeenLastCalledWith({
      subscriptions: {
        notes: { '1-0': { tabId: 1, frameId: 0, url: 'a' } },
        comments: { '1-n1': { tabId: 1, noteId: 'n1' } }
      }
    });
  });

  describe('storage write failure', () => {
    it('keeps memory authoritative and fixes the stored state with the next write', async () => {
      area.set.mockRejectedValueOnce(new Error('quota'));

      await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
      expect(log.error).toHaveBeenCalledWith('Subscription store operation failed:', expect.any(Error));
      expect(area.data.subscriptions).toBeUndefined();

      await store.saveNote('1-1', { tabId: 1, frameId: 1, url: 'b' });

      expect(Object.keys(area.data.subscriptions.notes)).toEqual(['1-0', '1-1']);
      expect(area.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('storage read failure', () => {
    it('returns null from hydrate and logs', async () => {
      area.get.mockRejectedValue(new Error('unavailable'));

      expect(await store.hydrate()).toBeNull();
      expect(log.error).toHaveBeenCalledWith('Could not read the stored subscriptions:', expect.any(Error));
    });

    it('writes nothing while storage cannot be read, so stored state is never overwritten', async () => {
      area = makeArea({ subscriptions: { notes: { '9-0': { tabId: 9, frameId: 0, url: 'old' } }, comments: {} } });
      area.get.mockRejectedValue(new Error('unavailable'));
      store = createSubscriptionStore(area, log);

      await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'new' });
      await store.removeComment('1-n1');

      expect(area.set).not.toHaveBeenCalled();
      expect(area.data.subscriptions.notes['9-0'].url).toBe('old');
    });

    it('merges the changes made meanwhile on top of the stored state once it can be read, requests winning per key', async () => {
      area = makeArea({
        subscriptions: {
          notes: { '9-0': { tabId: 9, frameId: 0, url: 'old' }, '1-0': { tabId: 1, frameId: 0, url: 'stale' } },
          comments: { '1-n1': { tabId: 1, noteId: 'n1' } }
        }
      });
      area.get.mockRejectedValueOnce(new Error('unavailable')).mockRejectedValueOnce(new Error('unavailable'));
      store = createSubscriptionStore(area, log);

      await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'new' });
      await store.removeComment('1-n1');
      expect(area.set).not.toHaveBeenCalled();

      const loaded = await store.hydrate();

      expect(loaded.notes).toEqual([
        { subKey: '9-0', tabId: 9, frameId: 0, url: 'old' },
        { subKey: '1-0', tabId: 1, frameId: 0, url: 'new' }
      ]);
      expect(loaded.comments).toEqual([]);
      expect(area.set).toHaveBeenCalledTimes(1);
      expect(area.data.subscriptions.notes['1-0'].url).toBe('new');
      expect(area.data.subscriptions.comments).toEqual({});
    });

    it('keeps the merged state in memory when writing it fails', async () => {
      area.get.mockRejectedValueOnce(new Error('unavailable'));
      area.set.mockRejectedValueOnce(new Error('quota'));
      store = createSubscriptionStore(area, log);

      await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
      const loaded = await store.hydrate();

      expect(loaded.notes).toEqual([{ subKey: '1-0', tabId: 1, frameId: 0, url: 'a' }]);
      expect(log.error).toHaveBeenCalledWith('Could not write the merged subscriptions:', expect.any(Error));
    });

    it('applies a change that finds storage readable again after an earlier failed read', async () => {
      area.get.mockRejectedValueOnce(new Error('unavailable'));

      await store.saveNote('1-0', { tabId: 1, frameId: 0, url: 'a' });
      await store.saveNote('1-1', { tabId: 1, frameId: 1, url: 'b' });

      expect(Object.keys(area.data.subscriptions.notes)).toEqual(['1-0', '1-1']);
    });
  });
});
