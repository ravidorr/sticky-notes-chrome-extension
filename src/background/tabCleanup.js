/**
 * Tab cleanup wiring
 * Releases the subscriptions of a tab when it closes. Kept out of index.js (which is not covered
 * by the unit tests) so that the wiring itself is tested.
 */

/**
 * Release a closed tab's subscriptions through the handlers
 * @param {Object} tabs - chrome.tabs (or a compatible object with onRemoved)
 * @param {Object} handlers - Background handlers (needs releaseTab)
 * @param {Object} log - Logger
 */
export function registerTabCleanup(tabs, handlers, log) {
  tabs.onRemoved.addListener((tabId) => {
    try {
      handlers.releaseTab(tabId);
    } catch (error) {
      log.error('Failed to release the subscriptions of tab', tabId, error);
    }
  });
}
