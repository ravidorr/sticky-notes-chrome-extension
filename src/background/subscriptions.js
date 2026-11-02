/**
 * Subscription manager
 * Owns the real-time note and comment subscriptions of the background worker as two states:
 *
 * - Desired: an in-memory Map of entries { descriptor, confirmed } per key. It is hydrated once
 *   from the subscription store and written through to it. `confirmed` is true for an entry a page
 *   just wrote (a subscribe request) and false for one read back from storage.
 * - Actual: the noteSubscriptions and commentSubscriptions maps of listeners.
 *
 * Every request (subscribe, unsubscribe, tab close, "tab unreachable") replaces or deletes the
 * desired entry, then queues a reconcile for the key on a per-key promise chain. A reconcile reads
 * the latest desired entry and makes the listener match it, so there is one writer of the listeners
 * and requests that race each other are ordered by the chain instead of by claims and generations.
 * A request that was superseded while it waited returns { success: true, cancelled: true }.
 */

import { t } from '../shared/i18n.js';
import { checkDescriptor, findLiveFrames } from './restoreSubscriptions.js';

// Tabs that were closed (the most recent ones), so a subscribe that reaches the worker after
// tabs.onRemoved registers nothing. Tab IDs are not reused within a browser session.
const MAX_REMEMBERED_CLOSED_TABS = 500;

/**
 * Create the subscription manager with injected dependencies
 * @param {Object} deps - Dependencies
 * @returns {Object} Subscription functions
 */
export function createSubscriptionManager(deps) {
  const {
    subscribeToNotesForUrl,
    subscribeToComments,
    isFirebaseConfigured,
    getUserIfConfigured,
    noteSubscriptions = new Map(),
    commentSubscriptions = new Map(),
    subscriptionStore = null,
    log,
    chromeTabs = null
  } = deps;

  const desiredNotes = new Map();
  const desiredComments = new Map();
  const kinds = {
    note: { desired: desiredNotes, actual: noteSubscriptions },
    comment: { desired: desiredComments, actual: commentSubscriptions }
  };

  // The desired entry each running listener was started for, as `${kind}:${key}`. A listener that
  // was not started for the current entry is replaced, so a new request always gets a fresh listener.
  const startedFor = new Map();
  const chains = new Map();
  const closedTabs = new Set();

  /**
   * Remember a closed tab, forgetting the oldest one past the limit
   * @param {number} tabId - ID of the closed tab
   */
  function rememberClosedTab(tabId) {
    closedTabs.add(tabId);
    if (closedTabs.size > MAX_REMEMBERED_CLOSED_TABS) {
      closedTabs.delete(closedTabs.values().next().value);
    }
  }

  // Hydration: one read of the store. Requests wait for it. If it fails, everything stays in
  // memory (the store writes nothing until a later read works) and the next request tries again.
  let hydration = null;

  /**
   * Add the stored descriptors the worker does not know yet. Entries a request wrote win per key,
   * and the descriptors of a tab that closed meanwhile are left out.
   * @param {{ notes: Object[], comments: Object[] }} saved - Hydrated descriptors, with their subKey
   */
  function mergeSaved(saved) {
    for (const [kind, descriptors] of [['note', saved.notes], ['comment', saved.comments]]) {
      for (const { subKey, ...descriptor } of descriptors) {
        // A tab that closed while the store was being read must not come back
        if (!kinds[kind].desired.has(subKey) && !closedTabs.has(descriptor.tabId)) {
          kinds[kind].desired.set(subKey, { descriptor, confirmed: false });
        }
      }
    }
  }

  /**
   * Wait for the desired state to be read from the store
   * @returns {Promise<void>}
   */
  function ready() {
    if (!subscriptionStore) {
      return Promise.resolve();
    }
    if (!hydration) {
      hydration = subscriptionStore.hydrate().then((saved) => {
        if (saved) {
          mergeSaved(saved);
        } else {
          hydration = null;
        }
      });
    }
    return hydration;
  }

  /**
   * Replace the desired entry of a key and store its descriptor
   * @param {string} kind - 'note' or 'comment'
   * @param {string} key - Subscription key
   * @param {Object} descriptor - What a restore needs
   * @returns {Object} The new entry
   */
  function setDesired(kind, key, descriptor) {
    const entry = { descriptor, confirmed: true };
    kinds[kind].desired.set(key, entry);
    if (kind === 'note') {
      subscriptionStore?.saveNote(key, descriptor);
    } else {
      subscriptionStore?.saveComment(key, descriptor);
    }
    return entry;
  }

  /**
   * Delete the desired entry of a key and its stored descriptor
   * @param {string} kind - 'note' or 'comment'
   * @param {string} key - Subscription key
   */
  function dropDesired(kind, key) {
    kinds[kind].desired.delete(key);
    if (kind === 'note') {
      subscriptionStore?.removeNote(key);
    } else {
      subscriptionStore?.removeComment(key);
    }
  }

  /**
   * Report whether real-time sync is degraded, and whether subscriptions can be restored at all
   * @returns {Promise<Object>} { success: true, degraded, restorable }; degraded is true while a
   *   desired subscription has no listener
   */
  async function getRealtimeSyncStatus() {
    await ready();
    const missing = ({ desired, actual }) => [...desired.keys()].some((key) => !actual.has(key));
    return {
      success: true,
      degraded: Object.values(kinds).some(missing),
      restorable: Boolean(subscriptionStore)
    };
  }

  /**
   * Release a listener. Never throws: a missing unsubscribe function or a failing release is
   * logged and swallowed. Does not touch any subscription map, so the caller drops the entry
   * (a throwing unsubscribe is not worth retrying, and a stale entry would wedge its key).
   * @param {Function|undefined} unsubscribe - Unsubscribe function of the listener, if any
   * @param {string} subKey - Subscription key, for the log
   * @param {string} reason - Why the listener is released, for the log
   * @returns {boolean} True if the listener was released
   */
  function releaseListener(unsubscribe, subKey, reason) {
    if (typeof unsubscribe !== 'function') {
      log.warn(`Subscription has no unsubscribe function (${reason}):`, subKey);
      return false;
    }
    try {
      unsubscribe();
      log.debug(`Released a subscription (${reason}):`, subKey);
      return true;
    } catch (error) {
      log.error(`Failed to release a subscription (${reason}):`, subKey, error);
      return false;
    }
  }

  /**
   * Add released: false to a successful result when the listener could not be released, so the
   * caller can tell (it is only logged otherwise, and logging is off by default)
   * @param {Object} result - Result to return
   * @param {boolean} released - Whether the listener was released
   * @returns {Object} The result, with released: false added on a failed release
   */
  function withRelease(result, released) {
    return released ? result : { ...result, released: false };
  }

  /**
   * Start the note listener of a desired entry
   * @param {string} key - Subscription key
   * @param {Object} entry - The desired entry to start
   * @returns {Promise<Object>} Result
   */
  async function startNote(key, entry) {
    const { tabId, frameId, url } = entry.descriptor;
    const user = await getUserIfConfigured();
    if (desiredNotes.get(key) !== entry) {
      return { success: true, cancelled: true };
    }
    if (!user) {
      return { success: false, error: t('mustBeLoggedInForRealtime') };
    }
    if (!isFirebaseConfigured()) {
      return { success: false, error: t('realtimeSyncRequiresFirebase') };
    }
    if (!subscribeToNotesForUrl) {
      return { success: false, error: 'Subscription service not available' };
    }
    // Set up the subscription (await since lazy-loaded functions return promises)
    const unsubscribe = await subscribeToNotesForUrl(
      url,
      user.uid,
      user.email,
      (notes) => {
        // Push updates to the specific frame only
        if (chromeTabs) {
          chromeTabs.sendMessage(tabId, {
            action: 'notesUpdated',
            notes
          }, { frameId }).catch(() => {
            // Tab/frame might be closed: drop the entry if it is still this one, and release
            forget('note', key, entry);
          });
        }
      },
      (error) => {
        log.error('Note subscription error:', error);
        if (chromeTabs) {
          chromeTabs.sendMessage(tabId, {
            action: 'subscriptionError',
            type: 'notes',
            error: error.message
          }, { frameId }).catch(() => {});
        }
      }
    );
    // An unsubscribe or a newer request that arrived meanwhile is queued behind this step, and
    // releases or replaces this listener right after it registers
    noteSubscriptions.set(key, { url, frameId, unsubscribe });
    startedFor.set(`note:${key}`, entry);
    log.debug('Subscribed to notes for tab', tabId, 'frame', frameId, 'url', url);
    return desiredNotes.get(key) === entry ? { success: true } : { success: true, cancelled: true };
  }

  /**
   * Start the comment listener of a desired entry
   * @param {string} key - Subscription key
   * @param {Object} entry - The desired entry to start
   * @returns {Promise<Object>} Result
   */
  async function startComment(key, entry) {
    const { tabId, noteId } = entry.descriptor;
    const user = await getUserIfConfigured();
    if (desiredComments.get(key) !== entry) {
      return { success: true, cancelled: true };
    }
    if (!user) {
      return { success: false, error: t('mustBeLoggedInToComment') };
    }
    if (!isFirebaseConfigured()) {
      return { success: false, error: t('commentsRequireFirebase') };
    }
    if (!subscribeToComments) {
      return { success: false, error: 'Subscription service not available' };
    }
    const unsubscribe = await subscribeToComments(
      noteId,
      user,
      (comments) => {
        // Push updates to the tab
        if (chromeTabs) {
          chromeTabs.sendMessage(tabId, {
            action: 'commentsUpdated',
            noteId,
            comments
          }).catch(() => {
            // Tab might be closed: drop the entry if it is still this one, and release
            forget('comment', key, entry);
          });
        }
      },
      (error) => {
        log.error('Comment subscription error:', error);
        if (chromeTabs) {
          chromeTabs.sendMessage(tabId, {
            action: 'subscriptionError',
            type: 'comments',
            noteId,
            error: error.message
          }).catch(() => {});
        }
      }
    );
    commentSubscriptions.set(key, unsubscribe);
    startedFor.set(`comment:${key}`, entry);
    log.debug('Subscribed to comments for tab', tabId, 'note', noteId);
    return desiredComments.get(key) === entry ? { success: true } : { success: true, cancelled: true };
  }

  /**
   * Make the listener of a key match its desired entry
   * @param {string} kind - 'note' or 'comment'
   * @param {string} key - Subscription key
   * @param {Object} [options] - { entry, reason }: the entry this step is for (the step is
   *   cancelled when another entry replaced it while it waited), and why a listener is released
   * @returns {Promise<Object>} Result
   */
  async function reconcileStep(kind, key, { entry, reason = 'unsubscribed' } = {}) {
    try {
      const { desired, actual } = kinds[kind];
      const current = desired.get(key);
      if (entry && current !== entry) {
        return { success: true, cancelled: true };
      }
      const existing = actual.get(key);
      const slot = `${kind}:${key}`;
      if (actual.has(key) && current && startedFor.get(slot) === current) {
        return { success: true };
      }
      let released = true;
      if (actual.has(key)) {
        const unsubscribe = kind === 'note' ? existing?.unsubscribe : existing;
        released = releaseListener(unsubscribe, key, current ? 'replaced' : reason);
        actual.delete(key);
        startedFor.delete(slot);
      }
      if (!current) {
        return withRelease({ success: true }, released);
      }
      return await (kind === 'note' ? startNote(key, current) : startComment(key, current));
    } catch (error) {
      log.error(kind === 'note' ? 'Subscribe notes error:' : 'Subscribe comments error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue a reconcile on the chain of its key, behind the ones queued before it
   * @param {string} kind - 'note' or 'comment'
   * @param {string} key - Subscription key
   * @param {Object} [options] - See reconcileStep
   * @returns {Promise<Object>} Result of the step (it never rejects)
   */
  function reconcile(kind, key, options) {
    const slot = `${kind}:${key}`;
    const run = (chains.get(slot) || Promise.resolve()).then(() => reconcileStep(kind, key, options));
    chains.set(slot, run);
    run.then(() => {
      if (chains.get(slot) === run) {
        chains.delete(slot);
      }
    });
    return run;
  }

  /**
   * Delete a desired entry that is still the given one, then reconcile (which releases its
   * listener). Another entry that replaced it in the meantime is left alone.
   * @param {string} kind - 'note' or 'comment'
   * @param {string} key - Subscription key
   * @param {Object} entry - The entry the caller knows about
   * @returns {Promise<Object>} Result of the reconcile, or { success: true } if the entry was replaced
   */
  function forget(kind, key, entry) {
    if (kinds[kind].desired.get(key) !== entry) {
      return Promise.resolve({ success: true });
    }
    dropDesired(kind, key);
    return reconcile(kind, key, { reason: 'tab unreachable' });
  }

  /**
   * Subscribe to real-time note updates for a URL
   * @param {string} url - Page URL
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Promise<Object>} Result; cancelled is true when the subscribe was superseded or
   *   cancelled. A failed subscribe keeps its desired entry, so a later attempt can retry it.
   */
  async function subscribeNotes(url, sender) {
    try {
      const tabId = sender?.tab?.id;
      const frameId = sender?.frameId ?? 0;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      await ready();

      // A subscribe that arrives after its tab closed would register a listener nothing releases
      if (closedTabs.has(tabId)) {
        return { success: true, cancelled: true };
      }

      // Use composite key to handle multiple frames (main frame + iframes)
      const key = `${tabId}-${frameId}`;
      const entry = setDesired('note', key, { tabId, frameId, url });
      return await reconcile('note', key, { entry });
    } catch (error) {
      log.error('Subscribe notes error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe from note updates
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Promise<Object>} Result
   */
  async function unsubscribeNotes(sender) {
    try {
      const tabId = sender?.tab?.id;
      const frameId = sender?.frameId ?? 0;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      await ready();

      const key = `${tabId}-${frameId}`;
      dropDesired('note', key);
      return await reconcile('note', key);
    } catch (error) {
      log.error('Unsubscribe notes error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe to real-time comment updates for a note
   * @param {string} noteId - Note ID
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Promise<Object>} Result; cancelled is true when the subscribe was superseded or
   *   cancelled. A failed subscribe keeps its desired entry, so a later attempt can retry it.
   */
  async function subscribeCommentsHandler(noteId, sender) {
    try {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      await ready();

      if (closedTabs.has(tabId)) {
        return { success: true, cancelled: true };
      }

      const key = `${tabId}-${noteId}`;
      const entry = setDesired('comment', key, { tabId, noteId, tabUrl: sender?.tab?.url });
      return await reconcile('comment', key, { entry });
    } catch (error) {
      log.error('Subscribe comments error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe from comment updates
   * @param {string} noteId - Note ID
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Promise<Object>} Result
   */
  async function unsubscribeCommentsHandler(noteId, sender) {
    try {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      await ready();

      const key = `${tabId}-${noteId}`;
      dropDesired('comment', key);
      return await reconcile('comment', key);
    } catch (error) {
      log.error('Unsubscribe comments error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Forget every note and comment subscription of a closed tab, in all of its frames, release
   * their listeners (also those still starting, right after they register), forget the stored
   * descriptors, and remember the tab as closed so a later subscribe for it registers nothing
   * @param {number} tabId - ID of the closed tab
   * @returns {Promise<void>} Resolves when the listeners are released; it never rejects
   */
  function releaseTab(tabId) {
    const prefix = `${tabId}-`;
    rememberClosedTab(tabId);
    subscriptionStore?.removeTab(tabId);

    const releases = [];
    for (const [kind, { desired, actual }] of Object.entries(kinds)) {
      const keys = new Set([...desired.keys(), ...actual.keys()]);
      for (const key of keys) {
        if (key.startsWith(prefix)) {
          desired.delete(key);
          releases.push(reconcile(kind, key, { reason: 'tab closed' }));
        }
      }
    }
    return Promise.all(releases).then(() => undefined);
  }

  /**
   * Restore the subscriptions a stopped worker held, from the entries read back from storage
   * (confirmed: false) that no page has written since. Closed tabs and frames that no longer
   * exist, or that navigated, are dropped; what cannot be checked or started is kept, and is tried
   * again at the next worker start. Nobody signed in keeps the entries too.
   * @param {Object} deps - { tabs, webNavigation }
   * @returns {Promise<{ restored: number, failed: number, dropped: number }>} What happened
   */
  async function restore({ tabs, webNavigation }) {
    await ready();
    const entries = [];
    for (const [kind, { desired }] of Object.entries(kinds)) {
      for (const [key, entry] of desired) {
        if (!entry.confirmed) {
          entries.push({ kind, key, entry });
        }
      }
    }
    const result = { restored: 0, failed: 0, dropped: 0 };
    if (entries.length === 0) {
      return result;
    }

    let user;
    try {
      user = await getUserIfConfigured();
    } catch (error) {
      log.error(`Could not look up the user; ${entries.length} real-time subscription(s) not restored:`, error);
      result.failed = entries.length;
      return result;
    }
    if (!user) {
      log.info('Nobody is signed in: real-time subscriptions are not restored');
      return result;
    }

    const tabIds = [...new Set(entries.map(({ entry }) => entry.descriptor.tabId))];
    const states = await findLiveFrames({ tabs, webNavigation, log }, tabIds);

    for (const [tabId, state] of states) {
      if (state.status === 'closed') {
        result.dropped += entries.filter(({ entry }) => entry.descriptor.tabId === tabId).length;
        await releaseTab(tabId);
      }
    }

    await Promise.all(entries.map(async ({ kind, key, entry }) => {
      const state = states.get(entry.descriptor.tabId);
      // A request that wrote the key during the lookups wins, and a closed tab was dropped above
      if (state.status === 'closed' || kinds[kind].desired.get(key) !== entry) {
        return;
      }
      const check = state.status === 'live' ? checkDescriptor(kind, entry.descriptor, state) : state.status;
      if (check === 'unknown') {
        result.failed += 1;
      } else if (check === 'gone') {
        await forget(kind, key, entry);
        result.dropped += 1;
      } else {
        if (kind === 'comment' && typeof entry.descriptor.tabUrl !== 'string' && typeof state.tabUrl === 'string') {
          // An older descriptor: store the tab URL now, so the navigation check works from here on
          entry.descriptor = { ...entry.descriptor, tabUrl: state.tabUrl };
          subscriptionStore?.saveComment(key, entry.descriptor);
        }
        const outcome = await reconcile(kind, key, { entry });
        if (outcome.success !== true) {
          log.error(`Could not restore ${kind} ${key}:`, outcome.error);
          result.failed += 1;
        } else if (outcome.cancelled !== true) {
          result.restored += 1;
        }
      }
    }));

    if (result.failed > 0) {
      log.error(`Could not restore ${result.failed} real-time subscription(s); sync is degraded`);
    }
    return result;
  }

  return {
    subscribeNotes,
    unsubscribeNotes,
    subscribeCommentsHandler,
    unsubscribeCommentsHandler,
    releaseTab,
    restore,
    getRealtimeSyncStatus
  };
}
