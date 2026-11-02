/**
 * Subscription store
 * Keeps a description of the real-time subscriptions the background worker wants (see
 * subscriptions.js), in chrome.storage.session, so a worker that Chrome stopped (which drops its
 * Firestore listeners) can restore them when it starts again. The session area survives a worker
 * restart but is cleared when the browser restarts and when the extension is reloaded, updated or
 * disabled, which is right: tab IDs are not valid after any of those.
 *
 * Every change writes the whole state, so a failed write is fixed by the next write. The state is
 * read once (hydrate). If that read fails, changes are kept in memory and nothing is written
 * until a later read works, so the stored state that could not be read is never overwritten.
 */

const SUBSCRIPTIONS_KEY = 'subscriptions';

/**
 * Normalize what was read from storage
 * @param {*} stored - Stored value
 * @returns {{ notes: Object, comments: Object }} Subscription descriptors by subscription key
 */
function normalize(stored) {
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  return {
    notes: isObject(stored?.notes) ? { ...stored.notes } : {},
    comments: isObject(stored?.comments) ? { ...stored.comments } : {}
  };
}

/**
 * Create a subscription store
 * Every operation runs through one queue, in call order, so callers can fire and forget without
 * two writes overtaking each other, and no operation ever rejects: failures are logged.
 * @param {{ get: Function, set: Function }} area - A chrome.storage area (session)
 * @param {{ error: Function }} log - Logger
 * @returns {Object} The store
 */
export function createSubscriptionStore(area, log) {
  let state = { notes: {}, comments: {} };
  let loaded = false;
  // Changes made while the stored state could not be read, applied on top of it once it can be
  let pending = [];
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
   * Write the whole state
   */
  async function save() {
    await area.set({ [SUBSCRIPTIONS_KEY]: state });
  }

  /**
   * Read the stored state once, then apply the changes made before it could be read
   * @returns {Promise<boolean>} True if the state is loaded
   */
  async function ensureLoaded() {
    if (loaded) {
      return true;
    }
    let stored;
    try {
      stored = await area.get([SUBSCRIPTIONS_KEY]);
    } catch (error) {
      log.error('Could not read the stored subscriptions:', error);
      return false;
    }
    state = normalize(stored?.[SUBSCRIPTIONS_KEY]);
    loaded = true;
    if (pending.length > 0) {
      pending.forEach((change) => change(state));
      pending = [];
      try {
        await save();
      } catch (error) {
        // Memory holds the merged state; the next write writes it again
        log.error('Could not write the merged subscriptions:', error);
      }
    }
    return true;
  }

  /**
   * Change the stored descriptors and write them
   * @param {Function} change - Mutates the state
   * @returns {Promise<void>}
   */
  function update(change) {
    return enqueue(async () => {
      if (!(await ensureLoaded())) {
        pending.push(change);
        return;
      }
      change(state);
      await save();
    });
  }

  return {
    /**
     * Read every stored descriptor (once; a later call after a failed read tries again)
     * @returns {Promise<{ notes: Object[], comments: Object[] }|null>} Descriptors, each with its
     *   subKey and including the changes made while storage could not be read, or null if storage
     *   still cannot be read
     */
    hydrate() {
      return enqueue(async () => {
        if (!(await ensureLoaded())) {
          return null;
        }
        const withKey = (descriptors) => Object.entries(descriptors)
          .map(([subKey, descriptor]) => ({ subKey, ...descriptor }));
        return { notes: withKey(state.notes), comments: withKey(state.comments) };
      }, null);
    },

    /**
     * Store a note subscription
     * @param {string} subKey - `${tabId}-${frameId}`
     * @param {{ tabId: number, frameId: number, url: string }} descriptor - What restore needs
     */
    saveNote(subKey, descriptor) {
      return update((current) => { current.notes[subKey] = descriptor; });
    },

    /**
     * @param {string} subKey - `${tabId}-${frameId}`
     */
    removeNote(subKey) {
      return update((current) => { delete current.notes[subKey]; });
    },

    /**
     * Store a comment subscription
     * @param {string} subKey - `${tabId}-${noteId}`
     * @param {{ tabId: number, noteId: string, tabUrl?: string }} descriptor - What restore needs
     */
    saveComment(subKey, descriptor) {
      return update((current) => { current.comments[subKey] = descriptor; });
    },

    /**
     * @param {string} subKey - `${tabId}-${noteId}`
     */
    removeComment(subKey) {
      return update((current) => { delete current.comments[subKey]; });
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
      });
    },

    /**
     * Forget every descriptor
     */
    clear() {
      return update((current) => {
        current.notes = {};
        current.comments = {};
      });
    }
  };
}
