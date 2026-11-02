/**
 * Subscription store
 * Keeps a description of the real-time subscriptions the background worker holds, in
 * chrome.storage.session, so a worker that Chrome stopped (which drops its Firestore listeners)
 * can restore them when it starts again. The session area survives a worker restart but is
 * cleared when the browser restarts and when the extension is reloaded, updated or disabled,
 * which is right: tab IDs are not valid after any of those.
 */

const SUBSCRIPTIONS_KEY = 'subscriptions';

/**
 * Normalize what was read from storage
 * @param {*} stored - Stored value
 * @returns {{ notes: Object, comments: Object, failed: string[] }} Subscription descriptors by
 *   subscription key, and the keys the last restore could not restore
 */
function normalize(stored) {
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  return {
    notes: isObject(stored?.notes) ? { ...stored.notes } : {},
    comments: isObject(stored?.comments) ? { ...stored.comments } : {},
    failed: Array.isArray(stored?.failed) ? stored.failed.filter((key) => typeof key === 'string') : []
  };
}

/**
 * Check that a stored descriptor is still the one a caller saw
 * @param {Object|undefined} stored - Descriptor in the store
 * @param {Object} expected - Descriptor the caller loaded earlier (may carry extra fields, such as subKey)
 * @returns {boolean} True if every stored field has the expected value
 */
function isSameDescriptor(stored, expected) {
  return Boolean(stored) && Object.keys(stored).every((field) => stored[field] === expected[field]);
}

/**
 * Create a subscription store
 * Every operation runs through one queue, in call order, so callers can fire and forget without
 * two writes overtaking each other, and no operation ever rejects: failures are logged, and a
 * failed read makes load() return null.
 * @param {{ get: Function, set: Function }} area - A chrome.storage area (session)
 * @param {{ error: Function }} log - Logger
 * @returns {Object} The store
 */
export function createSubscriptionStore(area, log) {
  let state = null;
  let chain = Promise.resolve();

  /**
   * Run a task after the ones queued before it
   * @param {Function} task - Async task
   * @param {*} fallback - Result when the task fails
   * @returns {Promise<*>} The task result, or the fallback
   */
  function enqueue(task, fallback) {
    const run = chain.then(task).catch((error) => {
      log.error('Subscription store operation failed:', error);
      return fallback;
    });
    chain = run;
    return run;
  }

  /**
   * Read the stored descriptors once
   */
  async function ensureLoaded() {
    if (!state) {
      const stored = await area.get([SUBSCRIPTIONS_KEY]);
      state = normalize(stored?.[SUBSCRIPTIONS_KEY]);
    }
  }

  /**
   * Write the cached descriptors
   */
  async function save() {
    try {
      await area.set({ [SUBSCRIPTIONS_KEY]: state });
    } catch (error) {
      // The cached state holds a change that was not written: read storage again next time
      state = null;
      throw error;
    }
  }

  /**
   * Change the stored descriptors and write them
   * @param {Function} change - Mutates the state
   * @returns {Promise<void>}
   */
  function update(change) {
    return enqueue(async () => {
      await ensureLoaded();
      change(state);
      await save();
    });
  }

  return {
    /**
     * Read every stored descriptor
     * @returns {Promise<{ notes: Object[], comments: Object[] }|null>} Descriptors, each with its
     *   subKey, or null if storage could not be read
     */
    load() {
      return enqueue(async () => {
        await ensureLoaded();
        const withKey = (descriptors) => Object.entries(descriptors).map(([subKey, descriptor]) => ({ subKey, ...descriptor }));
        return { notes: withKey(state.notes), comments: withKey(state.comments) };
      }, null);
    },

    /**
     * Read every stored descriptor, let the caller claim them, and record the keys it skipped as the
     * failed list, all in one queue step. Operations queued before this one are in the snapshot, and
     * operations queued after it (a content script that subscribes or unsubscribes meanwhile) run
     * after the failed list was written, so none of them can be undone by it.
     * @param {Function} claim - Called with the snapshot ({ notes, comments }, descriptors with their
     *   subKey); returns an object with skippedKeys (`note:${subKey}` and `comment:${subKey}`)
     * @returns {Promise<Object|null>} What claim returned, or null if storage could not be read or written
     */
    loadAndClaim(claim) {
      return enqueue(async () => {
        await ensureLoaded();
        const withKey = (descriptors) => Object.entries(descriptors).map(([subKey, descriptor]) => ({ subKey, ...descriptor }));
        const claimed = claim({ notes: withKey(state.notes), comments: withKey(state.comments) });
        state.failed = [...claimed.skippedKeys];
        await save();
        return claimed;
      }, null);
    },

    /**
     * Store a note subscription
     * @param {string} subKey - `${tabId}-${frameId}`
     * @param {{ tabId: number, frameId: number, url: string }} descriptor - What restore needs
     */
    saveNote(subKey, descriptor) {
      return update((current) => {
        current.notes[subKey] = descriptor;
        current.failed = current.failed.filter((key) => key !== `note:${subKey}`);
      });
    },

    /**
     * @param {string} subKey - `${tabId}-${frameId}`
     * @param {Object} [expected] - If given, remove only when the stored descriptor still equals it,
     *   so a newer descriptor saved under the same key in the meantime is kept
     */
    removeNote(subKey, expected) {
      return update((current) => {
        if (expected && !isSameDescriptor(current.notes[subKey], expected)) {
          return;
        }
        delete current.notes[subKey];
        current.failed = current.failed.filter((key) => key !== `note:${subKey}`);
      });
    },

    /**
     * Store a comment subscription
     * @param {string} subKey - `${tabId}-${noteId}`
     * @param {{ tabId: number, noteId: string, tabUrl?: string }} descriptor - What restore needs
     */
    saveComment(subKey, descriptor) {
      return update((current) => {
        current.comments[subKey] = descriptor;
        current.failed = current.failed.filter((key) => key !== `comment:${subKey}`);
      });
    },

    /**
     * @param {string} subKey - `${tabId}-${noteId}`
     * @param {Object} [expected] - If given, remove only when the stored descriptor still equals it
     */
    removeComment(subKey, expected) {
      return update((current) => {
        if (expected && !isSameDescriptor(current.comments[subKey], expected)) {
          return;
        }
        delete current.comments[subKey];
        current.failed = current.failed.filter((key) => key !== `comment:${subKey}`);
      });
    },

    /**
     * Forget every descriptor of a tab (all frames, all notes)
     * @param {number} tabId - ID of the closed tab
     */
    removeTab(tabId) {
      const prefix = `${tabId}-`;
      const without = (descriptors) => Object.fromEntries(
        Object.entries(descriptors).filter(([subKey]) => !subKey.startsWith(prefix))
      );
      return update((current) => {
        current.notes = without(current.notes);
        current.comments = without(current.comments);
        current.failed = current.failed.filter((key) => !key.slice(key.indexOf(':') + 1).startsWith(prefix));
      });
    },

    /**
     * Forget every descriptor
     */
    clear() {
      return update((current) => {
        current.notes = {};
        current.comments = {};
        current.failed = [];
      });
    },

    /**
     * Record the subscriptions the last restore could not restore. The list shrinks by itself when
     * a content script (or a later restore) subscribes or unsubscribes for one of those keys.
     * @param {string[]} keys - `note:${subKey}` and `comment:${subKey}` of the failed subscriptions
     */
    setFailed(keys) {
      return update((current) => { current.failed = [...keys]; });
    },

    /**
     * Add keys to the failed list (see setFailed). Unlike setFailed this keeps what is there, and it
     * only adds keys whose descriptor is still stored: a key that was unsubscribed or whose tab was
     * closed in the meantime (which removed its descriptor) is not brought back by a caller that
     * learns of it late.
     * @param {string[]} keys - `note:${subKey}` and `comment:${subKey}` of the failed subscriptions
     */
    addFailed(keys) {
      return update((current) => {
        const stored = (key) => {
          const subKey = key.slice(key.indexOf(':') + 1);
          return key.startsWith('note:') ? subKey in current.notes : subKey in current.comments;
        };
        current.failed = [...new Set([...current.failed, ...keys.filter(stored)])];
      });
    },

    /**
     * @returns {Promise<boolean>} True while some subscription the last restore could not restore
     *   is still unrestored
     */
    isDegraded() {
      return enqueue(async () => {
        await ensureLoaded();
        return state.failed.length > 0;
      }, false);
    }
  };
}
