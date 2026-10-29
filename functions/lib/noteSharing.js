/**
 * Share detection and handling for the onNoteShared trigger.
 */

import { writeShareNotificationEmail } from './email.js';

function sharedWithOf(note) {
  return Array.isArray(note?.sharedWith) ? note.sharedWith : [];
}

/**
 * Finds the addresses that were added to a note's sharedWith list. Matching is
 * exact, so addresses that differ only in case count as different.
 *
 * @param {Object} before - Note data before the update
 * @param {Object} after - Note data after the update
 * @returns {string[]} Newly added email addresses
 */
export function findNewlyShared(before, after) {
  const oldSharedWith = sharedWithOf(before);
  return sharedWithOf(after).filter(email => !oldSharedWith.includes(email));
}

/**
 * Handler for note updates: queues a share-notification email for each newly
 * added recipient. A failed write is logged and skipped. It is not retried
 * (onNoteShared has no retry policy) and it does not block the other
 * recipients.
 *
 * @param {Object} event - Firestore document-updated event
 * @param {Object} deps - Optional dependencies for testing
 * @param {Function} [deps.writeShareNotificationEmail] - Replacement for the email writer
 * @returns {Promise<null>}
 */
export async function handleNoteShared(event, deps = {}) {
  const writeEmail = deps.writeShareNotificationEmail || writeShareNotificationEmail;

  if (!event.data) {
    console.warn(`onNoteShared: event for note ${event.params?.noteId} carried no document data`);
    return null;
  }

  const before = event.data.before.data() ?? {};
  const after = event.data.after.data() ?? {};

  const newlyShared = findNewlyShared(before, after);
  if (newlyShared.length === 0) {
    return null;
  }

  const noteId = event.params.noteId;

  // Each write is isolated, because a thrown error would be dropped by the
  // platform and would also abort the remaining recipients. The async wrapper
  // turns a synchronous throw from the writer into a rejection.
  const results = await Promise.allSettled(
    newlyShared.map(async (email) => writeEmail(email, after, noteId))
  );

  let queued = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      queued += 1;
      return;
    }
    console.error(
      `Failed to queue share notification for ${newlyShared[index]} on note ${noteId}:`,
      result.reason
    );
  });

  console.log(`Queued share notifications for ${queued} of ${newlyShared.length} user(s) on note ${noteId}`);
  return null;
}
