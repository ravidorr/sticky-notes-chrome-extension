/**
 * Background runtime
 * Wires the subscription store, the handlers, the tab cleanup, the keep-alive alarm and the restore
 * of a stopped worker's subscriptions. Kept out of index.js (which is excluded from coverage in
 * jest.config.js and only bootstraps outside Jest) so that the wiring is tested by calling it with
 * fake chrome and Firebase dependencies.
 */

import { createHandlers as defaultCreateHandlers } from './handlers.js';
import { registerTabCleanup } from './tabCleanup.js';
import { createSubscriptionStore } from './subscriptionStore.js';
import { restoreSubscriptions } from './restoreSubscriptions.js';

const KEEP_ALIVE_ALARM = 'keepAlive';

// Chrome may fire alarms no more often than every 30 seconds, and raises a shorter period to that
const KEEP_ALIVE_PERIOD_MINUTES = 0.4;

/**
 * Create the background runtime
 * @param {Object} deps - Dependencies
 * @param {Object} deps.chrome - chrome or a compatible object (storage, tabs, webNavigation, action, alarms)
 * @param {Object} deps.handlerDeps - The Firebase (lazy) functions and utilities the handlers take
 * @param {Object} deps.log - Logger
 * @param {Function} [deps.createHandlers] - Handlers factory (replaced in tests)
 * @returns {{ handlers: Object, subscriptionStore: Object|null, start: Function }} The handlers, the
 *   store (null without chrome.storage.session) and start, which registers the listeners
 */
export function createBackgroundRuntime({ chrome, handlerDeps, log, createHandlers = defaultCreateHandlers }) {
  // Track active subscriptions, keyed per tab and frame (notes) or per tab and note (comments)
  const noteSubscriptions = new Map(); // `${tabId}-${frameId}` -> { url, frameId, unsubscribe }
  const commentSubscriptions = new Map(); // `${tabId}-${noteId}` -> unsubscribe Function

  // Track global shared notes subscription
  const sharedNotesSubscription = { current: null };

  // Describes the desired subscriptions in chrome.storage.session, so they can be restored when
  // Chrome stops this worker (its Firestore listeners die with it) and starts it again
  const subscriptionStore = chrome.storage.session
    ? createSubscriptionStore(chrome.storage.session, log)
    : null;
  if (!subscriptionStore) {
    log.warn('chrome.storage.session is not available: real-time subscriptions cannot be restored');
  }

  const handlers = createHandlers({
    ...handlerDeps,
    noteSubscriptions,
    commentSubscriptions,
    sharedNotesSubscription,
    subscriptionStore,
    log,
    chromeStorage: chrome.storage,
    chromeTabs: chrome.tabs,
    chromeWebNavigation: chrome.webNavigation,
    chromeAction: chrome.action
  });

  /**
   * Register the listeners and restore the subscriptions a stopped worker held
   */
  let started = false;
  function start() {
    // Listeners registered twice would release and retry twice per event
    if (started) {
      return;
    }
    started = true;

    // Clean up subscriptions when a tab is closed
    registerTabCleanup(chrome.tabs, handlers, log);

    // Keep the service worker warm to reduce the popup opening delay. If Chrome stops it anyway,
    // the next alarm starts it again and the subscriptions it held are restored below. Each tick
    // also retries the subscriptions that failed to start, with a growing delay per entry.
    chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: KEEP_ALIVE_PERIOD_MINUTES });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === KEEP_ALIVE_ALARM) {
        handlers.retryPending()
          .catch((error) => log.error('Failed to retry real-time subscriptions:', error));
      }
    });

    // Restore the real-time subscriptions a stopped worker held (nothing to do, and no Firebase
    // SDK load, when there are none)
    if (subscriptionStore) {
      restoreSubscriptions({
        handlers,
        tabs: chrome.tabs,
        webNavigation: chrome.webNavigation
      }).catch((error) => log.error('Failed to restore real-time subscriptions:', error));
    }
  }

  return { handlers, subscriptionStore, start };
}
