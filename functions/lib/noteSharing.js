/**
 * Share detection and handling for the onNoteShared trigger.
 */

import { createHash } from 'node:crypto';
import { MailValidationError, writeShareNotificationEmail } from './email.js';

// A retry replays the share-time snapshot, so it must not go on for long. Past this
// age the handler logs and gives up instead of throwing.
export const MAX_RETRY_AGE_MS = 2 * 60 * 60 * 1000;

// Firestore status for a request that is invalid however often it is repeated
const INVALID_ARGUMENT_CODES = new Set([3, 'invalid-argument']);

/**
 * Decides whether a failed mail write is worth retrying. Writes are idempotent,
 * so retrying is cheap and the default is to retry: network errors without a
 * Firestore code, and faults that a redeploy or an IAM fix can clear
 * (permission-denied, not-found), all get another attempt. Only input that can
 * never produce an email is permanent.
 *
 * @param {Error & {code?: number|string}} error - Write error
 * @returns {boolean} True when a retry could succeed
 */
export function isRetryableWriteError(error) {
  return !(error instanceof MailValidationError) && !INVALID_ARGUMENT_CODES.has(error?.code);
}

/**
 * Builds the mail document ID for one recipient of one trigger event. The event
 * ID is the same on every retry of an event and different for the next share,
 * so a retry never queues a second email but sharing again still emails. The
 * result is a SHA-256 hex digest of both values, so it is not readable, and an
 * address in a different case gets a different ID, as in findNewlyShared.
 *
 * @param {string} eventId - Trigger event ID
 * @param {string} email - Recipient address
 * @returns {string} Stable document ID
 */
export function mailIdFor(eventId, email) {
  return createHash('sha256').update(JSON.stringify([eventId, email])).digest('hex');
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
 * write failed for a retryable reason the handler throws after all recipients
 * were tried, and the platform retries the event: recipients already queued are
 * skipped by their mail ID. A retry replays the snapshot taken at share time and
 * is abandoned, with an error log, once the event is older than MAX_RETRY_AGE_MS.
 * Permanent failures are logged and skipped.
 *
 * @param {Object} event - Firestore document-updated event
 * @param {Object} deps - Optional dependencies for testing
 * @param {Function} [deps.writeShareNotificationEmail] - Replacement for the email writer
 * @param {Function} [deps.now] - Current time in milliseconds
 * @returns {Promise<null>}
 * @throws {AggregateError} When a write failed in a retryable way, so the platform
 *   retries the event; it carries the underlying errors
 */
export async function handleNoteShared(event, deps = {}) {
  const writeEmail = deps.writeShareNotificationEmail || writeShareNotificationEmail;
  const now = deps.now || Date.now;

  if (!event.data) {
    console.error(`onNoteShared: event for note ${event.params?.noteId} carried no document data, no share email was queued`);
    return null;
  }

  const before = event.data.before.data() ?? {};
  const after = event.data.after.data() ?? {};

  const newlyShared = findNewlyShared(before, after);
  if (newlyShared.length === 0) {
    return null;
  }

  const noteId = event.params.noteId;

  // The mail ID is built from the event ID. Cloud events always carry one; without
  // it the writer falls back to add(), and a retry would queue duplicates, so the
  // handler must not ask for one.
  const idempotent = Boolean(event.id);
  if (!idempotent) {
    console.error(`onNoteShared: event for note ${noteId} has no id, so writes cannot be idempotent and failures will not be retried`);
  }

  // Each write is isolated, because a thrown error would abort the remaining
  // recipients. The async wrapper turns a synchronous throw from the writer into
  // a rejection.
  const results = await Promise.allSettled(
    newlyShared.map(async (email) => writeEmail(
      email,
      after,
      noteId,
      idempotent ? { mailId: mailIdFor(event.id, email) } : {}
    ))
  );

  let queued = 0;
  const retryable = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      queued += 1;
      return;
    }
    const permanent = !isRetryableWriteError(result.reason);
    if (!permanent) {
      retryable.push(result.reason);
    }
    console.error(
      `Failed to queue share notification for ${newlyShared[index]} on note ${noteId} ` +
      `(${permanent ? 'permanent, dropped' : 'retryable'}, code ${result.reason?.code ?? 'none'}):`,
      result.reason
    );
  });

  console.log(`Queued share notifications for ${queued} of ${newlyShared.length} user(s) on note ${noteId}`);

  if (retryable.length === 0 || !idempotent) {
    return null;
  }

  const ageMs = now() - Date.parse(event.time);
  if (ageMs > MAX_RETRY_AGE_MS) {
    console.error(
      `onNoteShared: giving up on ${retryable.length} share email(s) for note ${noteId} ` +
      `after ${Math.round(ageMs / 60000)} minutes, they were not queued`
    );
    return null;
  }

  // A stable message keeps Error Reporting from splitting one outage into a group per note
  throw new AggregateError(retryable, 'onNoteShared: mail writes failed, retrying');
}
