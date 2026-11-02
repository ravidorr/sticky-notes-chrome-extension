/**
 * Restore subscriptions
 * Helpers that check a stored subscription descriptor against the live tabs and frames, and the
 * entry point that restores the subscriptions a stopped background worker held. The restore
 * itself runs in the subscription manager (manager.restore), which owns the desired state.
 */

import { createCompositeUrl, normalizeUrl } from '../shared/utils.js';

/**
 * Ask which tabs and frames still exist, and what they show now. A tab Chrome says does not exist
 * is 'closed'; any other failure leaves the tab 'unknown', and its subscriptions are kept for the
 * next start.
 * @param {Object} deps - { tabs, webNavigation, log }
 * @param {number[]} tabIds - Tab IDs to check
 * @returns {Promise<Map<number, { status: string, tabUrl: string, frames: Map<number, string> }>>}
 *   State per tab: its URL, and the URL of each of its frames by frame ID
 */
export async function findLiveFrames({ tabs, webNavigation, log }, tabIds) {
  const states = new Map();
  await Promise.all(tabIds.map(async (tabId) => {
    let tab;
    try {
      tab = await tabs.get(tabId);
    } catch (error) {
      const closed = /no tab with id/i.test(error?.message || '');
      if (!closed) {
        log.error('Could not check tab', tabId, error);
      }
      states.set(tabId, { status: closed ? 'closed' : 'unknown', frames: new Map() });
      return;
    }
    try {
      const frames = await webNavigation.getAllFrames({ tabId });
      if (!Array.isArray(frames)) {
        throw new Error('No frame information');
      }
      states.set(tabId, {
        status: 'live',
        tabUrl: tab?.url,
        frames: new Map(frames.map((frame) => [frame.frameId, frame.url]))
      });
    } catch (error) {
      log.error('Could not list the frames of tab', tabId, error);
      states.set(tabId, { status: 'unknown', frames: new Map() });
    }
  }));
  return states;
}

/**
 * Decide whether a stored descriptor still describes what its tab shows. A tab or frame that
 * navigated while the worker was stopped keeps its ID (the top frame is always 0), but the page
 * that owned the descriptor is gone and the new page subscribes for itself.
 * @param {string} kind - 'note' or 'comment'
 * @param {Object} descriptor - Stored descriptor
 * @param {{ tabUrl: string, frames: Map<number, string> }} state - What the live tab shows
 * @returns {string} 'current', 'gone' (frame missing or page navigated) or 'unknown' (no URL to compare)
 */
export function checkDescriptor(kind, descriptor, state) {
  if (kind === 'comment') {
    // Comment descriptors carry the tab URL of the page (older ones do not: keep them)
    if (typeof descriptor.tabUrl !== 'string') {
      return 'current';
    }
    if (typeof state.tabUrl !== 'string') {
      return 'unknown';
    }
    return normalizeUrl(descriptor.tabUrl) === normalizeUrl(state.tabUrl) ? 'current' : 'gone';
  }
  if (!state.frames.has(descriptor.frameId)) {
    return 'gone';
  }
  const frameUrl = state.frames.get(descriptor.frameId);
  if (typeof state.tabUrl !== 'string' || typeof frameUrl !== 'string') {
    return 'unknown';
  }
  const current = createCompositeUrl(state.tabUrl, frameUrl, descriptor.frameId === 0);
  return current === descriptor.url ? 'current' : 'gone';
}

/**
 * Restore the subscriptions a stopped worker held, through the subscription manager
 * @param {Object} deps - { handlers, tabs, webNavigation }; handlers carries the manager's restore
 * @returns {Promise<{ restored: number, failed: number, dropped: number }>} What happened
 */
export function restoreSubscriptions({ handlers, tabs, webNavigation }) {
  return handlers.restore({ tabs, webNavigation });
}
