/**
 * Mail sender - delivers documents written to the 'mail' collection.
 *
 * Self-managed replacement for the Firebase Trigger Email extension
 * (firestore-send-email). It reads the same document shape (to / cc / bcc /
 * replyTo / from / message) and records the outcome under `delivery` using a
 * subset of the extension's schema: `state`, `startTime`, `endTime`,
 * `attempts`, `error` and `info.{messageId, accepted, rejected}`. The states
 * are PROCESSING, RETRY, SUCCESS and ERROR. Attachments and custom headers
 * are not forwarded.
 *
 * Delivery is a lease-based state machine kept on the mail document:
 * - A document is claimed in a transaction (PROCESSING) before sending, so
 *   duplicate trigger deliveries cannot send the same email twice.
 * - A PROCESSING claim older than LEASE_MS is treated as abandoned (the
 *   invocation was killed) and can be reclaimed.
 * - Transient SMTP failures are recorded as RETRY and the trigger rethrows so
 *   the platform retries, up to MAX_ATTEMPTS. Permanent failures are recorded
 *   as ERROR and not retried.
 *
 * Guarantee: duplicate trigger deliveries never send twice. Across crashes it
 * is at-least-once: if an invocation dies, or a send times out, after the SMTP
 * server accepted the message but before SUCCESS is recorded, the reclaim or
 * retry can send the same email again. That is the cost of never losing one.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

// Transport timeouts stay well below the function timeout so a stalled
// connection normally reaches the error path instead of being killed mid-send.
// socketTimeout is an idle timeout, so a session that keeps making slow
// progress can still run longer.
const CONNECTION_TIMEOUT_MS = 10000;
const GREETING_TIMEOUT_MS = 10000;
const SOCKET_TIMEOUT_MS = 20000;

export const MAX_ATTEMPTS = 5;

// Must be longer than the sendMail Cloud Function timeout (MAIL_TRIGGER_OPTIONS
// in mailTrigger.js, currently 60s) plus margin.
export const LEASE_MS = 3 * 60 * 1000;

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EDNS',
  'ESOCKET',
  'ETIMEDOUT'
]);

/**
 * Creates a nodemailer transport. nodemailer is imported lazily because it is
 * only installed under functions/, so root-level unit tests inject a fake.
 *
 * @param {Object} config - SMTP settings
 * @param {string} config.user - SMTP username
 * @param {string} config.password - SMTP password (for Gmail, an app password)
 * @param {Object} [nodemailerLib] - Optional nodemailer module for testing
 * @returns {Promise<Object>} Transport with a sendMail method
 */
export async function createTransport({ user, password }, nodemailerLib) {
  const nodemailer = nodemailerLib || (await import('nodemailer')).default;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    auth: { user, pass: password }
  });
}

/**
 * Decides whether a send failure is worth retrying: network-level problems
 * and 4xx SMTP replies (temporary failures, rate limits). Authentication,
 * envelope and 5xx errors are permanent.
 *
 * @param {Error & {code?: string, responseCode?: number}} error - Send error
 * @returns {boolean} True when the failure is likely temporary
 */
export function isTransientError(error) {
  if (!error) return false;
  // nodemailer reports a system error such as a refused connection as ESOCKET
  // and keeps the system code (ECONNREFUSED, ECONNRESET, ...) in originalCode
  if (TRANSIENT_ERROR_CODES.has(error.code) || TRANSIENT_ERROR_CODES.has(error.originalCode)) return true;
  return typeof error.responseCode === 'number' &&
    error.responseCode >= 400 && error.responseCode < 500;
}

/**
 * Normalizes a recipient field (string or array) to an array of strings.
 *
 * @param {string|string[]|undefined} value - Recipient value
 * @returns {string[]} Recipient list
 */
function toList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Throws when SMTP settings are missing, naming the unset parameters so a
 * misconfigured deploy is not mistaken for an SMTP outage.
 *
 * @param {Object} config - Sender configuration
 * @param {Object} mail - The mail document data
 */
function assertConfig(config, mail) {
  const missing = [];
  if (!config.user) missing.push('SMTP_USER');
  if (!config.password) missing.push('SMTP_PASSWORD');
  if (!mail.from && !config.from) missing.push('MAIL_FROM');
  if (missing.length > 0) {
    throw new Error(`SMTP is not configured: missing ${missing.join(', ')}`);
  }
}

/**
 * Atomically claims a mail document for sending.
 *
 * - No state, or RETRY: claimed.
 * - PROCESSING within the lease: BUSY (another invocation is working on it).
 * - PROCESSING past the lease: reclaimed (the earlier invocation died).
 * - SUCCESS or ERROR: SKIPPED.
 * - Attempts exhausted: marked ERROR and SKIPPED.
 *
 * @param {Object} docRef - Firestore document reference
 * @param {Object} db - Firestore instance
 * @param {Function} serverTimestamp - Timestamp factory
 * @param {Function} now - Current time in milliseconds
 * @returns {Promise<{outcome: 'CLAIMED'|'SKIPPED'|'BUSY', attempts?: number}>} Claim result
 */
async function claimDocument(docRef, db, serverTimestamp, now) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const delivery = snap.data()?.delivery;
    const state = delivery?.state;
    const attempts = delivery?.attempts || 0;

    if (state === 'PROCESSING') {
      const startedAt = delivery.startTime?.toMillis?.();
      const expired = typeof startedAt === 'number' && now() - startedAt > LEASE_MS;
      if (!expired) {
        return { outcome: 'BUSY' };
      }
    } else if (state && state !== 'RETRY') {
      return { outcome: 'SKIPPED' };
    }

    if (attempts >= MAX_ATTEMPTS) {
      tx.update(docRef, {
        delivery: {
          state: 'ERROR',
          endTime: serverTimestamp(),
          attempts,
          error: `Gave up after ${attempts} attempts`
        }
      });
      return { outcome: 'SKIPPED' };
    }

    tx.update(docRef, {
      delivery: { state: 'PROCESSING', startTime: serverTimestamp(), attempts: attempts + 1 }
    });
    return { outcome: 'CLAIMED', attempts: attempts + 1 };
  });
}

/**
 * Writes the delivery outcome to the mail document without ever throwing, so a
 * failed write cannot replace the original error or turn a sent email into a
 * reported failure. A failure to record is logged with the intended state.
 *
 * @param {Object} docRef - Firestore document reference
 * @param {Object} delivery - The delivery field to store
 * @returns {Promise<void>}
 */
async function recordDelivery(docRef, delivery) {
  try {
    await docRef.update({ delivery });
  } catch (error) {
    console.error(
      `Mail ${docRef.id}: delivery state ${delivery.state} could not be recorded`,
      error
    );
  }
}

/**
 * Sends the email described by a mail document and records the outcome on the
 * document under `delivery`.
 *
 * @param {Object} docRef - Firestore document reference of the mail doc
 * @param {Object} mail - The mail document data
 * @param {Object} config - Sender configuration
 * @param {string} config.from - Default FROM address
 * @param {string} config.user - SMTP username
 * @param {string} config.password - SMTP password
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<'SUCCESS'|'ERROR'|'RETRY'|'SKIPPED'|'BUSY'>} Outcome. RETRY and
 *   BUSY mean the caller should let the platform retry the invocation.
 */
export async function deliverMail(docRef, mail, config, deps = {}) {
  const db = deps.db || getFirestore();
  const serverTimestamp = deps.serverTimestamp || (() => FieldValue.serverTimestamp());
  const now = deps.now || Date.now;

  const claim = await claimDocument(docRef, db, serverTimestamp, now);
  if (claim.outcome !== 'CLAIMED') {
    return claim.outcome;
  }
  const { attempts } = claim;

  let info;
  try {
    assertConfig(config, mail);

    const to = toList(mail.to);
    if (to.length === 0) {
      throw new Error('Mail document has no recipients');
    }
    if (!mail.message || (!mail.message.html && !mail.message.text)) {
      throw new Error('Mail document has no message body');
    }

    const transport = deps.transport || await createTransport(config, deps.nodemailer);
    info = await transport.sendMail({
      from: mail.from || config.from,
      replyTo: mail.replyTo,
      to,
      cc: toList(mail.cc),
      bcc: toList(mail.bcc),
      subject: mail.message.subject,
      text: mail.message.text,
      html: mail.message.html
    });
  } catch (error) {
    const willRetry = isTransientError(error) && attempts < MAX_ATTEMPTS;
    console.error(
      `Mail ${docRef.id}: send failed on attempt ${attempts} (${willRetry ? 'will retry' : 'giving up'})`,
      error
    );
    await recordDelivery(docRef, {
      state: willRetry ? 'RETRY' : 'ERROR',
      endTime: serverTimestamp(),
      attempts,
      error: error.message,
      code: error.code || null
    });
    return willRetry ? 'RETRY' : 'ERROR';
  }

  const rejected = info.rejected || [];
  if (rejected.length > 0) {
    console.warn(`Mail ${docRef.id}: recipients rejected by the server: ${rejected.join(', ')}`);
  }
  await recordDelivery(docRef, {
    state: 'SUCCESS',
    endTime: serverTimestamp(),
    attempts,
    info: {
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected
    }
  });
  return 'SUCCESS';
}

/**
 * Handler body for the sendMail trigger. Logs every outcome and throws when
 * the invocation should be retried by the platform (transient failure, or the
 * document is still being processed by another invocation).
 *
 * @param {Object} event - Firestore document-created event
 * @param {Object} config - Sender configuration (see deliverMail)
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<null>}
 */
export async function handleMailCreated(event, config, deps = {}) {
  const mailId = event.params?.mailId;
  const snapshot = event.data;
  if (!snapshot) {
    console.warn(`sendMail: event for mail ${mailId} carried no document data`);
    return null;
  }

  const result = await deliverMail(snapshot.ref, snapshot.data(), config, deps);
  const message = `sendMail: mail ${mailId} -> ${result}`;

  if (result === 'ERROR') {
    console.error(message);
  } else {
    console.log(message);
  }

  if (result === 'RETRY' || result === 'BUSY') {
    throw new Error(`${message}, retrying`);
  }
  return null;
}
