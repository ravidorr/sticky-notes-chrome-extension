/**
 * Background navigation helpers
 * Extracted for unit testing without pulling Firebase deps
 */

/**
 * For SPA navigations (webNavigation.onHistoryStateUpdated), only top-frame updates
 * should produce a tab-level urlChanged event. Subframe updates would incorrectly clear notes.
 * @param {Object} details
 * @returns {{tabId: number, message: {action: 'urlChanged', url: string}} | null}
 */
export function getUrlChangedMessageFromHistoryUpdate(details) {
  if (!details || typeof details.tabId !== 'number') return null;
  if (details.frameId !== 0) return null;
  return {
    tabId: details.tabId,
    message: { action: 'urlChanged', url: details.url }
  };
}

