/**
 * Restore subscriptions
 * Recreates the real-time subscriptions a stopped background worker held, from the descriptors in
 * the subscription store, through the same handlers the content scripts use.
 */

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
 * Ask which tabs and frames still exist. A tab Chrome says does not exist is 'closed'; any other
 * failure leaves the tab 'unknown', and its subscriptions are kept for the next start.
 * @param {Object} deps - { tabs, webNavigation, log }
 * @param {number[]} tabIds - Tab IDs to check
 * @returns {Promise<Map<number, { status: string, frames: Set<number> }>>} State per tab
 */
async function findLiveFrames({ tabs, webNavigation, log }, tabIds) {
  const states = new Map();
  await Promise.all(tabIds.map(async (tabId) => {
    try {
      await tabs.get(tabId);
    } catch (error) {
      const closed = /no tab with id/i.test(error?.message || '');
      if (!closed) {
        log.error('Could not check tab', tabId, error);
      }
      states.set(tabId, { status: closed ? 'closed' : 'unknown', frames: new Set() });
      return;
    }
    try {
      const frames = await webNavigation.getAllFrames({ tabId });
      if (!Array.isArray(frames)) {
        throw new Error('No frame information');
      }
      states.set(tabId, { status: 'live', frames: new Set(frames.map((frame) => frame.frameId)) });
    } catch (error) {
      log.error('Could not list the frames of tab', tabId, error);
      states.set(tabId, { status: 'unknown', frames: new Set() });
    }
  }));
  return states;
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
 * because that request may fail and nothing retries it.
 * A subscribe that comes back cancelled counts as done.
 * @param {Object} deps - { store, handlers, tabs, webNavigation, log, wait }
 * @returns {Promise<{ restored: number, failed: number, dropped: number }>} What happened
 */
export async function restoreSubscriptions(deps) {
  const { store, handlers, log, wait = defaultWait } = deps;
  const saved = await store.load();
  if (!saved) {
    log.error('Could not read the stored subscriptions; real-time sync cannot be restored');
    return { restored: 0, failed: 0, dropped: 0 };
  }

  const total = saved.notes.length + saved.comments.length;
  if (total === 0) {
    await store.setFailed([]);
    return { restored: 0, failed: 0, dropped: 0 };
  }

  const claims = [];
  const skippedKeys = [];
  for (const note of saved.notes) {
    const generation = handlers.claimRestore('note', note.subKey);
    if (generation !== null) {
      claims.push({ kind: 'note', descriptor: note, generation });
    } else {
      skippedKeys.push(failedKey({ kind: 'note', descriptor: note }));
    }
  }
  for (const comment of saved.comments) {
    const generation = handlers.claimRestore('comment', comment.subKey);
    if (generation !== null) {
      claims.push({ kind: 'comment', descriptor: comment, generation });
    } else {
      skippedKeys.push(failedKey({ kind: 'comment', descriptor: comment }));
    }
  }
  // A key a content script already handled is not restored and not counted as dropped. Its
  // request may still fail, and nothing retries it, so it stays in the failed list until that
  // request subscribes or unsubscribes for the key (which removes it from the list).
  const skipped = skippedKeys.length;

  const user = await lookupUser(handlers, wait);
  if (!user.ok) {
    await store.setFailed([...claims.map(failedKey), ...skippedKeys]);
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
    if (state.status === 'unknown') {
      unresolvedKeys.push(failedKey({ kind, descriptor }));
    } else if (state.status === 'closed') {
      handlers.releaseTab(descriptor.tabId);
      dropped += 1;
    } else if (kind === 'note' && !state.frames.has(descriptor.frameId)) {
      await store.removeNote(descriptor.subKey);
      dropped += 1;
    } else if (kind === 'note') {
      jobs.push({
        key: failedKey({ kind, descriptor }),
        label: `note ${descriptor.subKey}`,
        run: () => handlers.subscribeNotes(
          descriptor.url, { tab: { id: descriptor.tabId }, frameId: descriptor.frameId }, generation
        )
      });
    } else {
      jobs.push({
        key: failedKey({ kind, descriptor }),
        label: `comment ${descriptor.subKey}`,
        run: () => handlers.subscribeCommentsHandler(
          descriptor.noteId, { tab: { id: descriptor.tabId } }, generation
        )
      });
    }
  }

  let pending = jobs;
  let errors = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length > 0; attempt += 1) {
    const results = await Promise.all(pending.map((job) => job.run().catch((error) => ({
      success: false,
      error: error?.message
    }))));
    errors = pending.map((job, index) => ({ job, result: results[index] }))
      .filter(({ result }) => result?.success !== true);
    pending = errors.map(({ job }) => job);
    if (pending.length > 0 && attempt < MAX_ATTEMPTS - 1) {
      await wait(BASE_DELAY_MS * 2 ** attempt);
    }
  }

  const failed = pending.length + unresolvedKeys.length;
  await store.setFailed([...pending.map((job) => job.key), ...unresolvedKeys, ...skippedKeys]);
  for (const { job, result } of errors) {
    log.error(`Could not restore ${job.label}:`, result?.error);
  }
  if (failed > 0) {
    log.error(`Could not restore ${failed} real-time subscription(s); sync is degraded`);
  }

  return { restored: jobs.length - pending.length, failed, dropped };
}
