/**
 * Share detection and handling for the onNoteShared trigger.
 */

import { createHash } from 'node:crypto';
import { writeShareNotificationEmail } from './email.js';

// Firestore errors worth retrying, as gRPC codes and as their string names
const TRANSIENT_CODES = new Set([
  4, 8, 10, 13, 14,
  'deadline-exceeded', 'resource-exhausted', 'aborted', 'internal', 'unavailable'
]);

/**
 * Tells a temporary Firestore failure from a permanent one. Only temporary
 * failures are retried; an invalid note would fail the same way every time.
 *
 * @param {Error & {code?: number|string}} error - Write error
 * @returns {boolean} True when a retry could succeed
 */
export function isTransientWriteError(error) {
  return TRANSIENT_CODES.has(error?.code);
}

/**
 * Builds the mail document ID for one recipient of one trigger event. The event
 * ID is the same on every retry of an event and different for the next share,
 * so a retry never queues a second email but sharing again still emails.
 *
 * @param {string} eventId - Trigger event ID
 * @param {string} email - Recipient address
 * @returns {string} Stable document ID
 */
export function mailIdFor(eventId, email) {
  return createHash('sha256').update(`${eventId}:${email}`).digest('hex');
}

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
 * added recipient. Each mail document has a deterministic ID, so the trigger can
 * be retried safely. A failed write does not block the other recipients. When a
 * write failed for a temporary reason the handler throws after all recipients
 * were tried, and the platform retries the event (only the failed recipients are
 * queued again). Permanent failures are logged and skipped.
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

  // Each write is isolated, because a thrown error would abort the remaining
  // recipients. The async wrapper turns a synchronous throw from the writer into
  // a rejection. Without an event ID the write is not idempotent.
  const results = await Promise.allSettled(
    newlyShared.map(async (email) => writeEmail(
      email,
      after,
      noteId,
      event.id ? { mailId: mailIdFor(event.id, email) } : {}
    ))
  );

  let queued = 0;
  let transientFailures = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      queued += 1;
      return;
    }
    if (isTransientWriteError(result.reason)) {
      transientFailures += 1;
    }
    console.error(
      `Failed to queue share notification for ${newlyShared[index]} on note ${noteId}:`,
      result.reason
    );
  });

  const summary = `Queued share notifications for ${queued} of ${newlyShared.length} user(s) on note ${noteId}`;
  console.log(summary);

  if (transientFailures > 0) {
    throw new Error(`${summary}; ${transientFailures} failed temporarily, retrying`);
  }
  return null;
}
