/**
 * Mail Sender Unit Tests
 *
 * Tests delivery of documents queued in the 'mail' collection.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: {
    serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' }))
  }
}));

const { deliverMail } = await import('../../functions/lib/mailSender.js');

describe('mailSender', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();

    localThis.docData = {};
    localThis.docRef = { id: 'mail-1', update: jest.fn().mockResolvedValue() };
    localThis.tx = {
      get: jest.fn(async () => ({ data: () => localThis.docData })),
      update: jest.fn()
    };
    localThis.db = {
      runTransaction: jest.fn(async (fn) => fn(localThis.tx))
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
      serverTimestamp: () => 'ts'
    };
    localThis.mail = {
      to: 'to@example.com',
      message: { subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }
    };
  });

  it('should send the email and record SUCCESS', async () => {
    const result = await deliverMail(localThis.docRef, localThis.mail, localThis.config, localThis.deps);

    expect(result).toBe('SUCCESS');
    expect(localThis.transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'me@example.com',
      to: ['to@example.com'],
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi'
    }));
    expect(localThis.tx.update).toHaveBeenCalledWith(localThis.docRef, {
      delivery: expect.objectContaining({ state: 'PROCESSING' })
    });
    expect(localThis.docRef.update).toHaveBeenCalledWith({
      delivery: expect.objectContaining({
        state: 'SUCCESS',
        info: { messageId: 'abc', accepted: ['to@example.com'], rejected: [] }
      })
    });
  });

  it('should honor a per-document from address and array recipients', async () => {
    localThis.mail.from = 'other@example.com';
    localThis.mail.to = ['a@example.com', 'b@example.com'];
    localThis.mail.cc = 'c@example.com';

    await deliverMail(localThis.docRef, localThis.mail, localThis.config, localThis.deps);

    expect(localThis.transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'other@example.com',
      to: ['a@example.com', 'b@example.com'],
      cc: ['c@example.com'],
      bcc: []
    }));
  });

  it('should skip documents that were already claimed', async () => {
    localThis.docData = { delivery: { state: 'PROCESSING' } };

    const result = await deliverMail(localThis.docRef, localThis.mail, localThis.config, localThis.deps);

    expect(result).toBe('SKIPPED');
    expect(localThis.transport.sendMail).not.toHaveBeenCalled();
    expect(localThis.docRef.update).not.toHaveBeenCalled();
  });

  it('should record ERROR when sending fails', async () => {
    localThis.transport.sendMail.mockRejectedValue(new Error('smtp down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await deliverMail(localThis.docRef, localThis.mail, localThis.config, localThis.deps);

    expect(result).toBe('ERROR');
    expect(localThis.docRef.update).toHaveBeenCalledWith({
      delivery: expect.objectContaining({ state: 'ERROR', error: 'smtp down' })
    });
  });

  it('should record ERROR when there are no recipients', async () => {
    localThis.mail.to = undefined;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await deliverMail(localThis.docRef, localThis.mail, localThis.config, localThis.deps);

    expect(result).toBe('ERROR');
    expect(localThis.transport.sendMail).not.toHaveBeenCalled();
  });

  it('should record ERROR when the message has no body', async () => {
    localThis.mail.message = { subject: 'Hi' };
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await deliverMail(localThis.docRef, localThis.mail, localThis.config, localThis.deps);

    expect(result).toBe('ERROR');
  });
});
