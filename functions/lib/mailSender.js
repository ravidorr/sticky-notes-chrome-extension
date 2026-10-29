/**
 * Mail sender - delivers documents written to the 'mail' collection.
 *
 * Self-managed replacement for the Firebase Trigger Email extension
 * (firestore-send-email), which is being decommissioned. It keeps the same
 * document shape (to / message / delivery) so callers such as
 * writeShareNotificationEmail do not change.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

/**
 * Creates a nodemailer transport. nodemailer is imported lazily so unit tests
 * can inject a fake transport without the dependency installed.
 *
 * @param {Object} config - SMTP settings
 * @param {string} config.user - SMTP username
 * @param {string} config.password - SMTP password (app password)
 * @returns {Promise<Object>} Transport with a sendMail method
 */
export async function createTransport({ user, password }) {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user, pass: password }
  });
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
 * Atomically marks a mail document as PROCESSING. Returns false when another
 * invocation already claimed it or it was already handled, so retries and
 * duplicate trigger deliveries never send the same email twice.
 *
 * @param {Object} docRef - Firestore document reference
 * @param {Object} db - Firestore instance
 * @param {Function} serverTimestamp - Timestamp factory
 * @returns {Promise<boolean>} True when this invocation owns the document
 */
async function claimDocument(docRef, db, serverTimestamp) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const state = snap.data()?.delivery?.state;
    if (state) {
      return false;
    }
    tx.update(docRef, {
      delivery: { state: 'PROCESSING', startTime: serverTimestamp(), attempts: 1 }
    });
    return true;
  });
}

/**
 * Sends the email described by a mail document and records the outcome on the
 * document under `delivery`, matching the extension's behavior.
 *
 * @param {Object} docRef - Firestore document reference of the mail doc
 * @param {Object} mail - The mail document data
 * @param {Object} config - Sender configuration
 * @param {string} config.from - Default FROM address
 * @param {string} config.user - SMTP username
 * @param {string} config.password - SMTP password
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<'SUCCESS'|'ERROR'|'SKIPPED'>} Final delivery state
 */
export async function deliverMail(docRef, mail, config, deps = {}) {
  const db = deps.db || getFirestore();
  const serverTimestamp = deps.serverTimestamp || (() => FieldValue.serverTimestamp());

  const claimed = await claimDocument(docRef, db, serverTimestamp);
  if (!claimed) {
    return 'SKIPPED';
  }

  try {
    const to = toList(mail.to);
    if (to.length === 0) {
      throw new Error('Mail document has no recipients');
    }
    if (!mail.message || (!mail.message.html && !mail.message.text)) {
      throw new Error('Mail document has no message body');
    }

    const transport = deps.transport || await createTransport(config);
    const info = await transport.sendMail({
      from: mail.from || config.from,
      replyTo: mail.replyTo,
      to,
      cc: toList(mail.cc),
      bcc: toList(mail.bcc),
      subject: mail.message.subject,
      text: mail.message.text,
      html: mail.message.html
    });

    await docRef.update({
      delivery: {
        state: 'SUCCESS',
        endTime: serverTimestamp(),
        attempts: 1,
        info: {
          messageId: info.messageId || null,
          accepted: info.accepted || [],
          rejected: info.rejected || []
        }
      }
    });
    return 'SUCCESS';
  } catch (error) {
    console.error(`Failed to send mail ${docRef.id}:`, error);
    await docRef.update({
      delivery: {
        state: 'ERROR',
        endTime: serverTimestamp(),
        attempts: 1,
        error: error.message
      }
    });
    return 'ERROR';
  }
}
