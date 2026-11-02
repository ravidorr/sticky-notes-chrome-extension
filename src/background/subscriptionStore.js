/**
 * Subscription store
 * Keeps a description of the real-time subscriptions the background worker holds, in
 * chrome.storage.session, so a worker that Chrome stopped (which drops its Firestore listeners)
 * can restore them when it starts again. The session area survives a worker restart but is
 * cleared when the browser restarts and when the extension is reloaded, updated or disabled,
 * which is right: tab IDs are not valid after any of those.
 */

const SUBSCRIPTIONS_KEY = 'subscriptions';
const STATUS_KEY = 'realtimeSyncStatus';

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
    await area.set({ [SUBSCRIPTIONS_KEY]: state });
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
      try {
        await save();
      } catch (error) {
        // The cached state holds a change that was not written: read storage again next time
        state = null;
        throw error;
      }
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
     * @param {{ tabId: number, noteId: string }} descriptor - What restore needs
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
    },

    /**
     * Record whether the last restore that had work to do left subscriptions unrestored
     * @param {boolean} degraded - True when real-time sync is degraded
     */
    setDegraded(degraded) {
      return enqueue(() => area.set({ [STATUS_KEY]: { degraded: Boolean(degraded) } }));
    },

    /**
     * @returns {Promise<boolean>} True when the last restore left subscriptions unrestored
     */
    isDegraded() {
      return enqueue(async () => {
        const stored = await area.get([STATUS_KEY]);
        return stored?.[STATUS_KEY]?.degraded === true;
      }, false);
    }
  };
}
