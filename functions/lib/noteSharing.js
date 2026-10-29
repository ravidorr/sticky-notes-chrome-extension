/**
 * Share detection for the onNoteShared trigger.
 */

import { writeShareNotificationEmail } from './email.js';

/**
 * Finds the addresses that were added to a note's sharedWith list.
 *
 * @param {Object} before - Note data before the update
 * @param {Object} after - Note data after the update
 * @returns {string[]} Newly added email addresses
 */
export function findNewlyShared(before, after) {
  const oldSharedWith = before.sharedWith || [];
  const newSharedWith = after.sharedWith || [];
  return newSharedWith.filter(email => !oldSharedWith.includes(email));
}

/**
 * Handler for note updates: queues a share-notification email for each newly
 * added recipient. One failed email never blocks the others.
 *
 * @param {Object} event - Firestore document-updated event
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<null>}
 */
export async function handleNoteShared(event, deps = {}) {
  const writeEmail = deps.writeShareNotificationEmail || writeShareNotificationEmail;
  const before = event.data.before.data();
  const after = event.data.after.data();

  const newlyShared = findNewlyShared(before, after);
  if (newlyShared.length === 0) {
    return null;
  }

  const noteId = event.params.noteId;

  const emailPromises = newlyShared.map(email =>
    writeEmail(email, after, noteId)
      .catch(error => {
        console.error(`Failed to send share notification to ${email}:`, error);
        // Don't throw - we don't want one failed email to block others
      })
  );

  await Promise.all(emailPromises);

  console.log(`Queued share notifications for ${newlyShared.length} user(s) on note ${noteId}`);
  return null;
}
