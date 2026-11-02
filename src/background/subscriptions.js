/**
 * Subscription manager
 * Owns the real-time note and comment subscriptions of the background worker: starting,
 * replacing, cancelling and releasing listeners, and the bookkeeping that keeps requests that
 * race each other consistent. Extracted from handlers.js; the handlers build it and re-export
 * its functions.
 */

import { t } from '../shared/i18n.js';

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

  // Every subscribe and unsubscribe bumps the generation of its key (tab and frame for notes, tab
  // and note for comments). A subscribe that sees a different generation than the one it took was
  // superseded or cancelled: it stops, or releases the listener it just created, instead of
  // registering it. The latest request wins, even when it then fails before creating a listener.
  const noteSubGenerations = new Map();
  const commentSubGenerations = new Map();
  
  // Generations come from one counter that never repeats, so removing a key (releaseTab) can never
  // make a later subscribe reuse the number of an older one that is still starting
  let lastGeneration = 0;
  
  // Tabs that were closed (the most recent ones), so a subscribe that reaches the worker after
  // tabs.onRemoved registers nothing. Tab IDs are not reused within a browser session.
  const MAX_REMEMBERED_CLOSED_TABS = 500;
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
  
  /**
   * Report whether real-time sync is degraded, and whether subscriptions can be restored at all
   * @returns {Promise<Object>} { success: true, degraded, restorable }; degraded is true while a
   *   subscription the last restore could not restore is still unrestored
   */
  async function getRealtimeSyncStatus() {
    return {
      success: true,
      degraded: subscriptionStore ? await subscriptionStore.isDegraded() : false,
      restorable: Boolean(subscriptionStore)
    };
  }
  
  /**
   * Take a new generation for a subscription key
   * @param {Map<string, number>} generations - Latest generation per subscription key
   * @param {string} subKey - Subscription key
   * @returns {number} The new generation
   */
  function bumpGeneration(generations, subKey) {
    lastGeneration += 1;
    generations.set(subKey, lastGeneration);
    return lastGeneration;
  }
  
  /**
   * Cancel a subscribe that is still starting for a key, and mark the key as touched so a restore
   * that has not claimed it yet leaves it alone. A closed tab gets no entry.
   * @param {Map<string, number>} generations - Latest generation per subscription key
   * @param {string} subKey - Subscription key
   * @param {number} tabId - ID of the tab the key belongs to
   */
  function cancelSubscribe(generations, subKey, tabId) {
    if (!closedTabs.has(tabId)) {
      bumpGeneration(generations, subKey);
    }
  }
  
  /**
   * Claim a key for a restore after a worker restart, before anything is awaited. Returns null
   * when a content script already subscribed or unsubscribed for the key since the worker
   * started: that request is newer than the stored descriptor, so the restore must skip the key.
   * @param {string} kind - 'note' or 'comment'
   * @param {string} subKey - Subscription key
   * @returns {number|null} The generation the restore subscribes with, or null to skip the key
   */
  function claimRestore(kind, subKey) {
    const generations = kind === 'note' ? noteSubGenerations : commentSubGenerations;
    return generations.has(subKey) ? null : bumpGeneration(generations, subKey);
  }
  
  /**
   * Report whether a subscription is registered right now
   * @param {string} kind - 'note' or 'comment'
   * @param {string} subKey - Subscription key
   * @returns {boolean} True if the worker holds a listener for the key
   */
  function isSubscribed(kind, subKey) {
    return (kind === 'note' ? noteSubscriptions : commentSubscriptions).has(subKey);
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
   * Subscribe to real-time note updates for a URL
   * @param {string} url - Page URL
   * @param {Object} sender - Message sender (contains tab info)
   * @param {number} [claimedGeneration] - Generation claimed by a restore; a normal request takes a new one
   * @returns {Promise<Object>} Result; cancelled is true when the subscribe was superseded or
   *   cancelled and holds no listener (released is false if its listener could not be released)
   */
  async function subscribeNotes(url, sender, claimedGeneration) {
    try {
      const tabId = sender?.tab?.id;
      const frameId = sender?.frameId ?? 0;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      
      // A subscribe that arrives after its tab closed would register a listener nothing releases
      if (closedTabs.has(tabId)) {
        return { success: true, cancelled: true };
      }
      
      // Use composite key to handle multiple frames (main frame + iframes)
      const subKey = `${tabId}-${frameId}`;
      
      // Take the generation before the first await, so an unsubscribe or a newer subscribe that
      // arrives while the user lookup is pending cancels this one. A restore claimed its generation
      // earlier and keeps it for every retry, so any request that came in since cancels the restore.
      let generation = claimedGeneration;
      if (generation === undefined) {
        generation = bumpGeneration(noteSubGenerations, subKey);
      } else if (noteSubGenerations.get(subKey) !== generation) {
        return { success: true, cancelled: true };
      }
      
      const user = await getUserIfConfigured();
      
      if (noteSubGenerations.get(subKey) !== generation) {
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
      
      // Clean up existing subscription for this tab/frame
      const existingSub = noteSubscriptions.get(subKey);
      if (existingSub) {
        releaseListener(existingSub.unsubscribe, subKey, 'replaced');
        noteSubscriptions.delete(subKey);
      }
      
      // Set up new subscription (await since lazy-loaded functions return promises)
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
              // Tab/frame might be closed, clean up subscription
              releaseListener(unsubscribe, subKey, 'tab unreachable');
              // Only drop the entry if it is still this subscription, not a newer one
              if (noteSubscriptions.get(subKey)?.unsubscribe === unsubscribe) {
                noteSubscriptions.delete(subKey);
                subscriptionStore?.removeNote(subKey);
              }
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
      
      // A newer subscribe or an unsubscribe arrived while this one was starting: release this
      // listener instead of letting it replace the newer one or outlive the unsubscribe
      if (noteSubGenerations.get(subKey) !== generation) {
        const released = releaseListener(unsubscribe, subKey, 'cancelled while starting');
        return withRelease({ success: true, cancelled: true }, released);
      }
      
      noteSubscriptions.set(subKey, { url, frameId, unsubscribe });
      subscriptionStore?.saveNote(subKey, { tabId, frameId, url });
      log.debug('Subscribed to notes for tab', tabId, 'frame', frameId, 'url', url);
      
      return { success: true };
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
      
      const subKey = `${tabId}-${frameId}`;
      cancelSubscribe(noteSubGenerations, subKey, tabId);
      const sub = noteSubscriptions.get(subKey);
      let released = true;
      if (sub) {
        released = releaseListener(sub.unsubscribe, subKey, 'unsubscribed');
        noteSubscriptions.delete(subKey);
      }
      // Also when there is no entry: a replacement that was still starting is cancelled here
      subscriptionStore?.removeNote(subKey);
      
      return withRelease({ success: true }, released);
    } catch (error) {
      log.error('Unsubscribe notes error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe to real-time comment updates for a note
   * @param {string} noteId - Note ID
   * @param {Object} sender - Message sender (contains tab info)
   * @param {number} [claimedGeneration] - Generation claimed by a restore; a normal request takes a new one
   * @returns {Promise<Object>} Result; cancelled is true when the subscribe was superseded or
   *   cancelled and holds no listener (released is false if its listener could not be released)
   */
  async function subscribeCommentsHandler(noteId, sender, claimedGeneration) {
    try {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      
      if (closedTabs.has(tabId)) {
        return { success: true, cancelled: true };
      }
      
      const subKey = `${tabId}-${noteId}`;
      
      // Take the generation before the first await (see subscribeNotes)
      let generation = claimedGeneration;
      if (generation === undefined) {
        generation = bumpGeneration(commentSubGenerations, subKey);
      } else if (commentSubGenerations.get(subKey) !== generation) {
        return { success: true, cancelled: true };
      }
      
      const user = await getUserIfConfigured();
      
      if (commentSubGenerations.get(subKey) !== generation) {
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
      
      // Clean up existing subscription
      const existingSub = commentSubscriptions.get(subKey);
      if (existingSub) {
        releaseListener(existingSub, subKey, 'replaced');
        commentSubscriptions.delete(subKey);
      }
      
      // Set up new subscription (await since lazy-loaded functions return promises)
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
              // Tab might be closed, clean up subscription
              releaseListener(unsubscribe, subKey, 'tab unreachable');
              // Only drop the entry if it is still this subscription, not a newer one
              if (commentSubscriptions.get(subKey) === unsubscribe) {
                commentSubscriptions.delete(subKey);
                subscriptionStore?.removeComment(subKey);
              }
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
      
      // A newer subscribe or an unsubscribe arrived while this one was starting: release this
      // listener instead of letting it replace the newer one or outlive the unsubscribe
      if (commentSubGenerations.get(subKey) !== generation) {
        const released = releaseListener(unsubscribe, subKey, 'cancelled while starting');
        return withRelease({ success: true, cancelled: true }, released);
      }
      
      commentSubscriptions.set(subKey, unsubscribe);
      subscriptionStore?.saveComment(subKey, { tabId, noteId, tabUrl: sender?.tab?.url });
      log.debug('Subscribed to comments for tab', tabId, 'note', noteId);
      
      return { success: true };
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
      
      const subKey = `${tabId}-${noteId}`;
      cancelSubscribe(commentSubGenerations, subKey, tabId);
      const unsub = commentSubscriptions.get(subKey);
      let released = true;
      if (unsub) {
        released = releaseListener(unsub, subKey, 'unsubscribed');
        commentSubscriptions.delete(subKey);
      }
      subscriptionStore?.removeComment(subKey);
      
      return withRelease({ success: true }, released);
    } catch (error) {
      log.error('Unsubscribe comments error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Release every note and comment subscription of a closed tab, in all of its frames, forget
   * its generations so a subscribe still starting for it is cancelled, forget its stored
   * descriptors, and remember the tab as closed so a later subscribe for it registers nothing
   * @param {number} tabId - ID of the closed tab
   */
  function releaseTab(tabId) {
    const prefix = `${tabId}-`;
    rememberClosedTab(tabId);
    subscriptionStore?.removeTab(tabId);
    
    for (const [subKey, sub] of [...noteSubscriptions.entries()]) {
      if (subKey.startsWith(prefix)) {
        releaseListener(sub?.unsubscribe, subKey, 'tab closed');
        noteSubscriptions.delete(subKey);
      }
    }
    
    for (const [subKey, unsubscribe] of [...commentSubscriptions.entries()]) {
      if (subKey.startsWith(prefix)) {
        releaseListener(unsubscribe, subKey, 'tab closed');
        commentSubscriptions.delete(subKey);
      }
    }
    
    // An in-flight subscribe compares its generation with the stored one, so removing the entry
    // cancels it, and the maps do not keep an entry for every tab that ever subscribed
    for (const generations of [noteSubGenerations, commentSubGenerations]) {
      for (const subKey of [...generations.keys()]) {
        if (subKey.startsWith(prefix)) {
          generations.delete(subKey);
        }
      }
    }
  }

  return {
    subscribeNotes,
    unsubscribeNotes,
    subscribeCommentsHandler,
    unsubscribeCommentsHandler,
    releaseTab,
    claimRestore,
    isSubscribed,
    getRealtimeSyncStatus
  };
}
