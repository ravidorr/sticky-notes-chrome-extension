/**
 * Definition of the Cloud Function that delivers mail documents (exported as
 * `sendMail` from index.js).
 *
 * The Firebase SDK functions are passed in, so the options, the params and the
 * config handed to the mail handler can be tested without loading the SDK.
 */

import { handleMailCreated } from './mailSender.js';

// timeoutSeconds (60s) must stay well below LEASE_MS (3 minutes, in milliseconds)
// in mailSender.js, or a live invocation could be reclaimed as abandoned.
export const MAIL_TRIGGER_OPTIONS = {
  document: 'mail/{mailId}',
  region: 'us-central1',
  timeoutSeconds: 60,
  retry: true
};

/**
 * Firestore trigger that delivers each document created in 'mail' over SMTP
 * and records the result in its `delivery` field.
 *
 * Requires the params SMTP_USER and MAIL_FROM and the secret SMTP_PASSWORD.
 * Permanent failures are recorded on the document and not retried. Transient
 * SMTP failures make the invocation throw so the platform retries it, up to a
 * bounded number of attempts. The invocation also throws while another
 * invocation holds the document's lease. Delivery is at-least-once across
 * crashes and timeouts. See mailSender.js for the retry and delivery behavior.
 *
 * @param {Object} sdk - Firebase SDK functions
 * @param {Function} sdk.onDocumentCreated - Firestore document-created trigger factory
 * @param {Function} sdk.defineSecret - Secret param factory
 * @param {Function} sdk.defineString - String param factory
 * @returns {Object} The trigger
 */
export function defineMailTrigger({ onDocumentCreated, defineSecret, defineString }) {
  const smtpPassword = defineSecret('SMTP_PASSWORD');
  const smtpUser = defineString('SMTP_USER');
  const mailFrom = defineString('MAIL_FROM');

  return onDocumentCreated(
    { ...MAIL_TRIGGER_OPTIONS, secrets: [smtpPassword] },
    (event) => handleMailCreated(event, {
      user: smtpUser.value(),
      password: smtpPassword.value(),
      from: mailFrom.value()
    })
  );
}
