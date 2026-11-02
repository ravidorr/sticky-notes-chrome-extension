/**
 * Restore subscriptions
 * Recreates the real-time subscriptions a stopped background worker held, from the descriptors in
 * the subscription store, through the same handlers the content scripts use.
 */

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask which tabs and frames still exist
 * @param {Object} deps - { tabs, webNavigation }
 * @param {number[]} tabIds - Tab IDs to check
 * @returns {Promise<Map<number, Set<number>>>} Frame IDs of every tab that still exists
 */
async function findLiveFrames({ tabs, webNavigation }, tabIds) {
  const live = new Map();
  await Promise.all(tabIds.map(async (tabId) => {
    try {
      await tabs.get(tabId);
    } catch (_error) {
      return;
    }
    let frames = [];
    try {
      frames = (await webNavigation.getAllFrames({ tabId })) || [];
    } catch (_error) {
      // Without frame information a tab's notes subscriptions cannot be validated, so they are dropped
    }
    live.set(tabId, new Set(frames.map((frame) => frame.frameId)));
  }));
  return live;
}

/**
 * Restore the stored subscriptions
 * Descriptors of closed tabs and frames are dropped, and so are all of them when nobody is signed
 * in. A failed subscribe is retried with a growing delay; subscriptions that still fail are kept
 * (the next worker start tries again) and real-time sync is flagged as degraded.
 * @param {Object} deps - { store, handlers, tabs, webNavigation, log, wait }
 * @returns {Promise<{ restored: number, failed: number, dropped: number }>} What happened
 */
export async function restoreSubscriptions(deps) {
  const { store, handlers, log, wait = defaultWait } = deps;
  const saved = await store.load();
  const total = saved.notes.length + saved.comments.length;
  if (total === 0) {
    return { restored: 0, failed: 0, dropped: 0 };
  }

  const userResult = await handlers.getUser();
  if (!userResult?.user) {
    await store.clear();
    return { restored: 0, failed: 0, dropped: total };
  }

  const tabIds = [...new Set([...saved.notes, ...saved.comments].map((descriptor) => descriptor.tabId))];
  const live = await findLiveFrames(deps, tabIds);

  const jobs = [];
  for (const note of saved.notes) {
    if (live.get(note.tabId)?.has(note.frameId)) {
      jobs.push({
        run: () => handlers.subscribeNotes(note.url, { tab: { id: note.tabId }, frameId: note.frameId })
      });
    } else {
      await store.removeNote(note.subKey);
    }
  }
  for (const comment of saved.comments) {
    if (live.has(comment.tabId)) {
      jobs.push({
        run: () => handlers.subscribeCommentsHandler(comment.noteId, { tab: { id: comment.tabId } })
      });
    } else {
      await store.removeComment(comment.subKey);
    }
  }
  const dropped = total - jobs.length;

  let pending = jobs;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length > 0; attempt += 1) {
    const results = await Promise.all(pending.map((job) => job.run()));
    pending = pending.filter((job, index) => results[index]?.success !== true);
    if (pending.length > 0 && attempt < MAX_ATTEMPTS - 1) {
      await wait(BASE_DELAY_MS * 2 ** attempt);
    }
  }

  await store.setDegraded(pending.length > 0);
  if (pending.length > 0) {
    log.error(`Could not restore ${pending.length} real-time subscription(s); sync is degraded`);
  }

  return { restored: jobs.length - pending.length, failed: pending.length, dropped };
}
