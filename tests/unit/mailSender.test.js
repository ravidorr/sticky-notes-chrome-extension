/**
 * Mail Sender Unit Tests
 *
 * Tests delivery of documents queued in the 'mail' collection: claiming,
 * lease reclaim, retry of transient failures and outcome recording.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: {
    serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' }))
  }
}));

const {
  deliverMail,
  createTransport,
  handleMailCreated,
  isTransientError,
  MAX_ATTEMPTS,
  LEASE_MS
} = await import('../../functions/lib/mailSender.js');
const { MAIL_TRIGGER_OPTIONS } = await import('../../functions/lib/mailTrigger.js');

describe('mailSender', () => {
  const localThis = {};

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    localThis.nowMs = 1000000;
    localThis.store = {};
    localThis.docRef = {
      id: 'mail-1',
      update: jest.fn(async (patch) => {
        Object.assign(localThis.store, patch);
      })
    };

    // Transactions run one at a time against the same store, like Firestore
    localThis.queue = Promise.resolve();
    localThis.db = {
      runTransaction: jest.fn((fn) => {
        const run = localThis.queue.then(() => fn({
          get: async () => ({ data: () => localThis.store }),
          update: (ref, patch) => Object.assign(localThis.store, patch)
        }));
        localThis.queue = run.catch(() => {});
        return run;
      })
    };

    localThis.transport = {
      sendMail: jest.fn().mockResolvedValue({
        messageId: 'abc',
        accepted: ['to@example.com'],
        rejected: []
      })
    };
    localThis.config = { user: 'me@example.com', password: 'pw', from: 'me@example.com' };
    localThis.deps = {
      db: localThis.db,
      transport: localThis.transport,
      now: () => localThis.nowMs,
      serverTimestamp: () => ({ toMillis: () => localThis.nowMs })
    };
    localThis.mail = {
      to: 'to@example.com',
      message: { subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }
    };
    localThis.send = () => deliverMail(
      localThis.docRef, localThis.mail, localThis.config, localThis.deps
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('deliverMail', () => {
    it('should send the email and record SUCCESS', async () => {
      const result = await localThis.send();

      expect(result).toBe('SUCCESS');
      expect(localThis.transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        from: 'me@example.com',
        to: ['to@example.com'],
        subject: 'Hi',
        html: '<p>Hi</p>',
        text: 'Hi'
      }));
      expect(localThis.store.delivery).toEqual({
        state: 'SUCCESS',
        endTime: expect.anything(),
        attempts: 1,
        info: { messageId: 'abc', accepted: ['to@example.com'], rejected: [] }
      });
    });

    it('should honor per-document from, replyTo and array recipients', async () => {
      localThis.mail.from = 'other@example.com';
      localThis.mail.replyTo = 'reply@example.com';
      localThis.mail.to = ['a@example.com', 'b@example.com'];
      localThis.mail.cc = 'c@example.com';
      localThis.mail.bcc = ['d@example.com'];

      await localThis.send();

      expect(localThis.transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        from: 'other@example.com',
        replyTo: 'reply@example.com',
        to: ['a@example.com', 'b@example.com'],
        cc: ['c@example.com'],
        bcc: ['d@example.com']
      }));
    });

    it('should send html-only and text-only bodies', async () => {
      localThis.mail.message = { subject: 'Hi', html: '<p>Hi</p>' };
      expect(await localThis.send()).toBe('SUCCESS');

      localThis.store = {};
      localThis.mail.message = { subject: 'Hi', text: 'Hi' };
      expect(await localThis.send()).toBe('SUCCESS');
    });

    it('should default missing info fields and warn about rejected recipients', async () => {
      localThis.transport.sendMail.mockResolvedValue({ rejected: ['bad@example.com'] });

      const result = await localThis.send();

      expect(result).toBe('SUCCESS');
      expect(localThis.store.delivery.info).toEqual({
        messageId: null,
        accepted: [],
        rejected: ['bad@example.com']
      });
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('bad@example.com'));
    });

    it.each(['SUCCESS', 'ERROR'])('should skip documents already in state %s', async (state) => {
      localThis.store.delivery = { state, attempts: 1 };

      const result = await localThis.send();

      expect(result).toBe('SKIPPED');
      expect(localThis.transport.sendMail).not.toHaveBeenCalled();
      expect(localThis.docRef.update).not.toHaveBeenCalled();
    });

    it('should report BUSY while another invocation holds a fresh claim', async () => {
      localThis.store.delivery = {
        state: 'PROCESSING',
        attempts: 1,
        startTime: { toMillis: () => localThis.nowMs - 1000 }
      };

      const result = await localThis.send();

      expect(result).toBe('BUSY');
      expect(localThis.transport.sendMail).not.toHaveBeenCalled();
    });

    it('should reclaim a PROCESSING claim older than the lease', async () => {
      localThis.store.delivery = {
        state: 'PROCESSING',
        attempts: 1,
        startTime: { toMillis: () => localThis.nowMs - LEASE_MS - 1 }
      };

      const result = await localThis.send();

      expect(result).toBe('SUCCESS');
      expect(localThis.store.delivery.attempts).toBe(2);
      expect(localThis.transport.sendMail).toHaveBeenCalledTimes(1);
    });

    it('should send once when two invocations race for the same document', async () => {
      const results = await Promise.all([localThis.send(), localThis.send()]);

      expect(results.sort()).toEqual(['BUSY', 'SUCCESS']);
      expect(localThis.transport.sendMail).toHaveBeenCalledTimes(1);
    });

    it('should record RETRY for a transient failure and succeed on the next attempt', async () => {
      localThis.transport.sendMail.mockRejectedValueOnce(
        Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
      );

      expect(await localThis.send()).toBe('RETRY');
      expect(localThis.store.delivery).toEqual(expect.objectContaining({
        state: 'RETRY',
        attempts: 1,
        error: 'timed out',
        code: 'ETIMEDOUT'
      }));

      expect(await localThis.send()).toBe('SUCCESS');
      expect(localThis.store.delivery.attempts).toBe(2);
      expect(localThis.transport.sendMail).toHaveBeenCalledTimes(2);
    });

    it('should record ERROR when a transient failure hits the last attempt', async () => {
      localThis.store.delivery = { state: 'RETRY', attempts: MAX_ATTEMPTS - 1 };
      localThis.transport.sendMail.mockRejectedValue(
        Object.assign(new Error('still down'), { code: 'ECONNECTION' })
      );

      expect(await localThis.send()).toBe('ERROR');
      expect(localThis.store.delivery).toEqual(expect.objectContaining({
        state: 'ERROR',
        attempts: MAX_ATTEMPTS
      }));
    });

    it('should give up without sending once attempts are exhausted', async () => {
      localThis.store.delivery = { state: 'RETRY', attempts: MAX_ATTEMPTS };

      const result = await localThis.send();

      expect(result).toBe('SKIPPED');
      expect(localThis.transport.sendMail).not.toHaveBeenCalled();
      expect(localThis.store.delivery.state).toBe('ERROR');
      expect(localThis.store.delivery.error).toContain('Gave up');
    });

    it('should record ERROR without retrying a permanent failure', async () => {
      localThis.transport.sendMail.mockRejectedValue(
        Object.assign(new Error('bad login'), { code: 'EAUTH', responseCode: 535 })
      );

      expect(await localThis.send()).toBe('ERROR');
      expect(localThis.store.delivery).toEqual(expect.objectContaining({
        state: 'ERROR',
        error: 'bad login',
        code: 'EAUTH'
      }));
    });

    it('should record ERROR when there are no recipients', async () => {
      localThis.mail.to = [];

      expect(await localThis.send()).toBe('ERROR');
      expect(localThis.store.delivery.error).toBe('Mail document has no recipients');
      expect(localThis.transport.sendMail).not.toHaveBeenCalled();
    });

    it('should record ERROR when the message has no body', async () => {
      localThis.mail.message = { subject: 'Hi' };

      expect(await localThis.send()).toBe('ERROR');
      expect(localThis.store.delivery.error).toBe('Mail document has no message body');
    });

    it('should record an explicit ERROR naming unset SMTP settings', async () => {
      localThis.config = { user: '', password: '', from: '' };

      expect(await localThis.send()).toBe('ERROR');
      expect(localThis.store.delivery.error).toBe(
        'SMTP is not configured: missing SMTP_USER, SMTP_PASSWORD, MAIL_FROM'
      );
      expect(localThis.transport.sendMail).not.toHaveBeenCalled();
    });

    it('should not require MAIL_FROM when the document sets from', async () => {
      localThis.config.from = '';
      localThis.mail.from = 'doc@example.com';

      expect(await localThis.send()).toBe('SUCCESS');
    });

    it('should keep reporting SUCCESS when recording the success state fails', async () => {
      localThis.docRef.update.mockRejectedValue(new Error('firestore down'));

      await expect(localThis.send()).resolves.toBe('SUCCESS');

      expect(localThis.transport.sendMail).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('SUCCESS could not be recorded'),
        expect.any(Error)
      );
    });

    it('should keep the original outcome when recording the error state fails', async () => {
      localThis.transport.sendMail.mockRejectedValue(new Error('rejected'));
      localThis.docRef.update.mockRejectedValue(new Error('firestore down'));

      await expect(localThis.send()).resolves.toBe('ERROR');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR could not be recorded'),
        expect.any(Error)
      );
    });

    it('should propagate a claim transaction failure', async () => {
      localThis.db.runTransaction.mockRejectedValue(new Error('aborted'));

      await expect(localThis.send()).rejects.toThrow('aborted');
      expect(localThis.transport.sendMail).not.toHaveBeenCalled();
    });

    it('should build its own transport from nodemailer when none is injected', async () => {
      const smtp = { sendMail: jest.fn().mockResolvedValue({ messageId: 'x' }) };
      localThis.deps.transport = undefined;
      localThis.deps.nodemailer = { createTransport: jest.fn().mockReturnValue(smtp) };

      expect(await localThis.send()).toBe('SUCCESS');
      expect(localThis.deps.nodemailer.createTransport).toHaveBeenCalledTimes(1);
      expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    });

    it('should record ERROR when the transport cannot be created', async () => {
      localThis.deps.transport = undefined;
      localThis.deps.nodemailer = {
        createTransport: jest.fn(() => { throw new Error('no transport'); })
      };

      expect(await localThis.send()).toBe('ERROR');
      expect(localThis.store.delivery.error).toBe('no transport');
    });
  });

  describe('createTransport', () => {
    it('should configure Gmail SMTP with timeouts and map password to pass', async () => {
      const nodemailer = { createTransport: jest.fn().mockReturnValue('transport') };

      const result = await createTransport({ user: 'me@example.com', password: 'pw' }, nodemailer);

      expect(result).toBe('transport');
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        auth: { user: 'me@example.com', pass: 'pw' }
      });
    });
  });

  describe('lease', () => {
    it('should outlast the sendMail function timeout, or a live invocation could be reclaimed', () => {
      // timeoutSeconds is in seconds and LEASE_MS in milliseconds
      expect(MAIL_TRIGGER_OPTIONS.timeoutSeconds * 1000).toBeLessThan(LEASE_MS);
    });
  });

  describe('isTransientError', () => {
    it.each(['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'ESOCKET', 'ETIMEDOUT'])(
      'should treat %s as transient',
      (code) => {
        expect(isTransientError({ code })).toBe(true);
      }
    );

    it.each(['ECONNREFUSED', 'ECONNRESET'])(
      'should treat a system error nodemailer reports as ESOCKET with originalCode %s as transient',
      (originalCode) => {
        // nodemailer replaces the system code with ESOCKET and keeps it in originalCode
        expect(isTransientError({ code: 'EOTHER', originalCode })).toBe(true);
      }
    );

    it('should not treat an unrelated originalCode as transient', () => {
      expect(isTransientError({ code: 'EAUTH', originalCode: 'EACCES' })).toBe(false);
    });

    it('should treat 4xx SMTP replies as transient', () => {
      expect(isTransientError({ responseCode: 421 })).toBe(true);
      expect(isTransientError({ responseCode: 452 })).toBe(true);
    });

    it('should treat auth, 5xx, unknown and empty errors as permanent', () => {
      expect(isTransientError({ code: 'EAUTH', responseCode: 535 })).toBe(false);
      expect(isTransientError({ responseCode: 550 })).toBe(false);
      expect(isTransientError(new Error('plain'))).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });
  });

  describe('handleMailCreated', () => {
    beforeEach(() => {
      localThis.event = {
        params: { mailId: 'mail-1' },
        data: { ref: localThis.docRef, data: () => localThis.mail }
      };
      localThis.handle = () => handleMailCreated(
        localThis.event, localThis.config, localThis.deps
      );
    });

    it('should warn and do nothing when the event has no data', async () => {
      localThis.event.data = undefined;

      await expect(localThis.handle()).resolves.toBeNull();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no document data'));
      expect(localThis.transport.sendMail).not.toHaveBeenCalled();
    });

    it('should deliver the document and log the outcome', async () => {
      await expect(localThis.handle()).resolves.toBeNull();

      expect(localThis.transport.sendMail).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('sendMail: mail mail-1 -> SUCCESS');
    });

    it('should log SKIPPED without throwing', async () => {
      localThis.store.delivery = { state: 'SUCCESS', attempts: 1 };

      await expect(localThis.handle()).resolves.toBeNull();
      expect(console.log).toHaveBeenCalledWith('sendMail: mail mail-1 -> SKIPPED');
    });

    it('should log ERROR at error severity without throwing', async () => {
      localThis.transport.sendMail.mockRejectedValue(new Error('bad login'));

      await expect(localThis.handle()).resolves.toBeNull();
      expect(console.error).toHaveBeenCalledWith('sendMail: mail mail-1 -> ERROR');
    });

    it('should throw on a transient failure so the platform retries', async () => {
      localThis.transport.sendMail.mockRejectedValue(
        Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
      );

      await expect(localThis.handle()).rejects.toThrow('-> RETRY, retrying');
    });

    it('should throw while another invocation still holds the claim', async () => {
      localThis.store.delivery = {
        state: 'PROCESSING',
        attempts: 1,
        startTime: { toMillis: () => localThis.nowMs }
      };

      await expect(localThis.handle()).rejects.toThrow('-> BUSY, retrying');
    });

    it('should tolerate an event without params', async () => {
      localThis.event.params = undefined;

      await expect(localThis.handle()).resolves.toBeNull();
      expect(console.log).toHaveBeenCalledWith('sendMail: mail undefined -> SUCCESS');
    });
  });
});
