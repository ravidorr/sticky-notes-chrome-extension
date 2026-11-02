/**
 * Restore subscriptions
 * Recreates the real-time subscriptions a stopped background worker held, from the descriptors in
 * the subscription store, through the same handlers the content scripts use.
 */

import { createCompositeUrl, normalizeUrl } from '../shared/utils.js';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

const failedKey = ({ kind, descriptor }) => `${kind}:${descriptor.subKey}`;

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Look up the signed-in user, retrying while the lookup itself fails (the worker has just started,
 * so the Firebase SDK may not be ready)
 * @param {Object} handlers - Background handlers
 * @param {Function} wait - Delay function
 * @returns {Promise<{ ok: boolean, user?: Object|null }>} ok is false if the lookup never worked
 */
async function lookupUser(handlers, wait) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let result;
    try {
      result = await handlers.getUser();
    } catch (error) {
      result = { success: false, error: error.message };
    }
    if (result?.success === true) {
      return { ok: true, user: result.user || null };
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await wait(BASE_DELAY_MS * 2 ** attempt);
    }
  }
  return { ok: false };
}

/**
 * Ask which tabs and frames still exist, and what they show now. A tab Chrome says does not exist
 * is 'closed'; any other failure leaves the tab 'unknown', and its subscriptions are kept for the
 * next start.
 * @param {Object} deps - { tabs, webNavigation, log }
 * @param {number[]} tabIds - Tab IDs to check
 * @returns {Promise<Map<number, { status: string, tabUrl: string, frames: Map<number, string> }>>}
 *   State per tab: its URL, and the URL of each of its frames by frame ID
 */
async function findLiveFrames({ tabs, webNavigation, log }, tabIds) {
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
function checkDescriptor(kind, descriptor, state) {
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
 * Restore the stored subscriptions
 * Every key is claimed from the handlers before anything is awaited, so a content script that
 * subscribes or unsubscribes in the meantime wins: a claim fails (and the key is skipped) when the
 * content script was first, and a restore that was claimed first is cancelled by a later request,
 * on its first attempt and on every retry. Descriptors of closed tabs, and of frames that no longer
 * exist, are dropped, and so are all of them when nobody is signed in. Anything that fails is
 * retried with a growing delay, kept for the next worker start, and recorded as failed: sync is
 * degraded until a content script or a later restore subscribes or unsubscribes for those keys.
 * Keys a content script claimed first are recorded the same way until its request settles them,
 * because that request may fail and nothing retries it (unless it already succeeded).
 * A subscribe that comes back cancelled counts as done, but its key is recorded as failed until the
 * request that cancelled it has registered a listener or unsubscribed.
 * @param {Object} deps - { store, handlers, tabs, webNavigation, log, wait }
 * @returns {Promise<{ restored: number, failed: number, dropped: number }>} What happened
 */
export async function restoreSubscriptions(deps) {
  const { store, handlers, log, wait = defaultWait } = deps;
  // Load, claim and record the skipped keys in one store step (see loadAndClaim)
  const loaded = await store.loadAndClaim((saved) => {
    const claimed = { claims: [], skippedKeys: [], total: saved.notes.length + saved.comments.length };
    const claim = (kind, descriptor) => {
      const generation = handlers.claimRestore(kind, descriptor.subKey);
      if (generation !== null) {
        claimed.claims.push({ kind, descriptor, generation });
      } else if (!handlers.isSubscribed(kind, descriptor.subKey)) {
        // A key a content script already handled is not restored and not counted as dropped. Unless
        // its request already succeeded, that request may still fail, and nothing retries it, so
        // the key stays in the failed list until the request subscribes or unsubscribes for it
        // (which removes it from the list).
        claimed.skippedKeys.push(failedKey({ kind, descriptor }));
      }
    };
    saved.notes.forEach((note) => claim('note', note));
    saved.comments.forEach((comment) => claim('comment', comment));
    return claimed;
  });
  if (!loaded) {
    log.error('Could not read the stored subscriptions; real-time sync cannot be restored');
    return { restored: 0, failed: 0, dropped: 0 };
  }

  const { claims, total } = loaded;
  if (total === 0) {
    return { restored: 0, failed: 0, dropped: 0 };
  }
  // Keys a content script handled are neither restored nor dropped by this run
  const skipped = total - claims.length;

  const user = await lookupUser(handlers, wait);
  if (!user.ok) {
    await store.addFailed(claims.map(failedKey));
    log.error(`Could not look up the user; ${claims.length} real-time subscription(s) not restored`);
    return { restored: 0, failed: claims.length, dropped: 0 };
  }
  if (!user.user) {
    await store.clear();
    return { restored: 0, failed: 0, dropped: total - skipped };
  }

  const tabIds = [...new Set(claims.map((claim) => claim.descriptor.tabId))];
  const states = await findLiveFrames(deps, tabIds);

  const jobs = [];
  let dropped = 0;
  const unresolvedKeys = [];
  for (const { kind, descriptor, generation } of claims) {
    const state = states.get(descriptor.tabId);
    const check = state.status === 'live' ? checkDescriptor(kind, descriptor, state) : state.status;
    if (check === 'unknown') {
      unresolvedKeys.push(failedKey({ kind, descriptor }));
    } else if (check === 'closed') {
      handlers.releaseTab(descriptor.tabId);
      dropped += 1;
    } else if (check === 'gone') {
      // Only if the stored descriptor is still the one loaded: the new page may have replaced it
      await (kind === 'note'
        ? store.removeNote(descriptor.subKey, descriptor)
        : store.removeComment(descriptor.subKey, descriptor));
      dropped += 1;
    } else if (kind === 'note') {
      jobs.push({
        kind,
        subKey: descriptor.subKey,
        key: failedKey({ kind, descriptor }),
        label: `note ${descriptor.subKey}`,
        run: () => handlers.subscribeNotes(
          descriptor.url, { tab: { id: descriptor.tabId }, frameId: descriptor.frameId }, generation
        )
      });
    } else {
      jobs.push({
        kind,
        subKey: descriptor.subKey,
        key: failedKey({ kind, descriptor }),
        label: `comment ${descriptor.subKey}`,
        run: () => handlers.subscribeCommentsHandler(
          // The tab URL is stored with the descriptor again, so the navigation check keeps working
          descriptor.noteId, { tab: { id: descriptor.tabId, url: state.tabUrl } }, generation
        )
      });
    }
  }

  let pending = jobs;
  let errors = [];
  const superseded = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length > 0; attempt += 1) {
    const results = await Promise.all(pending.map((job) => job.run().catch((error) => ({
      success: false,
      error: error?.message
    }))));
    pending.forEach((job, index) => {
      if (results[index]?.cancelled === true) {
        superseded.push(job);
      }
    });
    errors = pending.map((job, index) => ({ job, result: results[index] }))
      .filter(({ result }) => result?.success !== true);
    pending = errors.map(({ job }) => job);
    if (pending.length > 0 && attempt < MAX_ATTEMPTS - 1) {
      await wait(BASE_DELAY_MS * 2 ** attempt);
    }
  }

  // A restore that a newer request cancelled counts as done, but that request may still fail, so
  // the key stays recorded until it registers a listener or unsubscribes (which removes it from
  // the list). Checked and queued in the same step, so a request that registers in between
  // is either seen here or prunes the key after it was added.
  const unsettled = superseded
    .filter((job) => !handlers.isSubscribed(job.kind, job.subKey))
    .map((job) => job.key);

  const failed = pending.length + unresolvedKeys.length;
  await store.addFailed([...pending.map((job) => job.key), ...unresolvedKeys, ...unsettled]);
  for (const { job, result } of errors) {
    log.error(`Could not restore ${job.label}:`, result?.error);
  }
  if (failed > 0) {
    log.error(`Could not restore ${failed} real-time subscription(s); sync is degraded`);
  }

  return { restored: jobs.length - pending.length, failed, dropped };
}
