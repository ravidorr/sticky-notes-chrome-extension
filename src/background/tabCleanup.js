/**
 * Tab cleanup wiring
 * Releases the subscriptions of a tab when it closes. Kept out of index.js (which is excluded
 * from coverage in jest.config.js) so that the wiring itself is tested.
 */

/**
 * Release a closed tab's subscriptions through the handlers.
 * releaseTab is not expected to throw (releaseListener swallows listener errors); the catch only
 * keeps an unexpected error from escaping the event listener.
 * @param {{ onRemoved: { addListener: Function } }} tabs - chrome.tabs or a compatible object
 * @param {{ releaseTab: Function }} handlers - Background handlers
 * @param {{ error: Function }} log - Logger
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
