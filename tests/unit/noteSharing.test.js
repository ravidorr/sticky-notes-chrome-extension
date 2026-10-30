/**
 * Note sharing tests
 *
 * Tests detection of newly shared addresses and the onNoteShared handler.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const getFirestore = jest.fn();

// email.js, which handleNoteShared uses by default, imports firestore
jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore,
  FieldValue: { serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })) }
}));

const { findNewlyShared, handleNoteShared, isRetryableWriteError, mailIdFor, MAX_RETRY_AGE_MS } =
  await import('../../functions/lib/noteSharing.js');
const { MailValidationError } = await import('../../functions/lib/email.js');

describe('noteSharing', () => {
  const localThis = {};

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    getFirestore.mockReset();
    localThis.writeEmail = jest.fn().mockResolvedValue('mail-doc');
    localThis.event = (before, after, id, time) => ({
      id,
      time,
      params: { noteId: 'note-1' },
      data: { before: { data: () => before }, after: { data: () => after } }
    });
    localThis.now = Date.parse('2026-10-29T12:00:00.000Z');
    localThis.freshTime = '2026-10-29T11:59:00.000Z';
    localThis.staleTime = new Date(localThis.now - MAX_RETRY_AGE_MS - 60000).toISOString();
    localThis.unavailable = Object.assign(new Error('unavailable'), { code: 14 });
    localThis.handle = (before, after, id, time) => handleNoteShared(
      localThis.event(before, after, id, time),
      { writeShareNotificationEmail: localThis.writeEmail, now: () => localThis.now }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findNewlyShared', () => {
    it('should detect an address added to an empty list', () => {
      expect(findNewlyShared({ sharedWith: [] }, { sharedWith: ['a@example.com'] })).toEqual(['a@example.com']);
    });

    it('should detect several added addresses and keep existing ones out', () => {
      const result = findNewlyShared(
        { sharedWith: ['old@example.com'] },
        { sharedWith: ['old@example.com', 'a@example.com', 'b@example.com'] }
      );

      expect(result).toEqual(['a@example.com', 'b@example.com']);
    });

    it('should return nothing when the list is unchanged or addresses were removed', () => {
      expect(findNewlyShared({ sharedWith: ['a@example.com'] }, { sharedWith: ['a@example.com'] })).toEqual([]);
      expect(findNewlyShared({ sharedWith: ['a@example.com', 'b@example.com'] }, { sharedWith: ['a@example.com'] })).toEqual([]);
    });

    it('should ignore reordering', () => {
      expect(findNewlyShared({ sharedWith: ['a', 'b', 'c'] }, { sharedWith: ['c', 'a', 'b'] })).toEqual([]);
    });

    it('should return only the added address when one is added and another removed', () => {
      expect(findNewlyShared({ sharedWith: ['remove', 'keep'] }, { sharedWith: ['keep', 'add'] })).toEqual(['add']);
    });

    it('should match addresses exactly, so a different case counts as new', () => {
      expect(findNewlyShared({ sharedWith: ['user@example.com'] }, { sharedWith: ['User@example.com'] }))
        .toEqual(['User@example.com']);
    });

    it('should treat a missing sharedWith as empty on either side', () => {
      expect(findNewlyShared({}, { sharedWith: ['a@example.com'] })).toEqual(['a@example.com']);
      expect(findNewlyShared({ sharedWith: ['a@example.com'] }, {})).toEqual([]);
      expect(findNewlyShared({}, {})).toEqual([]);
    });

    it('should treat a sharedWith that is not an array as empty', () => {
      expect(findNewlyShared({ sharedWith: 'a@example.com' }, { sharedWith: 'b@example.com' })).toEqual([]);
      expect(findNewlyShared(undefined, { sharedWith: ['a@example.com'] })).toEqual(['a@example.com']);
    });
  });

  describe('handleNoteShared', () => {
    it('should queue an email for each newly shared address', async () => {
      const after = { sharedWith: ['old@example.com', 'a@example.com', 'b@example.com'], content: 'Hi' };

      const result = await localThis.handle({ sharedWith: ['old@example.com'] }, after);

      expect(result).toBeNull();
      expect(localThis.writeEmail).toHaveBeenCalledTimes(2);
      expect(localThis.writeEmail).toHaveBeenCalledWith('a@example.com', after, 'note-1', {});
      expect(localThis.writeEmail).toHaveBeenCalledWith('b@example.com', after, 'note-1', {});
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 2 of 2 user(s) on note note-1');
    });

    it('should write to the mail collection with the real email writer by default', async () => {
      const add = jest.fn().mockResolvedValue({ id: 'mail-doc-1' });
      const collection = jest.fn(() => ({ add }));
      getFirestore.mockReturnValue({ collection });
      const after = {
        sharedWith: ['a@example.com'],
        ownerEmail: 'owner@example.com',
        content: 'Hi',
        url: 'https://example.com/page'
      };

      await expect(handleNoteShared(localThis.event({ sharedWith: [] }, after))).resolves.toBeNull();

      expect(collection).toHaveBeenCalledWith('mail');
      expect(add).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@example.com' }));
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 1 of 1 user(s) on note note-1');
    });

    it('should treat a missing before or after snapshot as empty', async () => {
      await expect(localThis.handle(undefined, { sharedWith: ['a@example.com'] })).resolves.toBeNull();
      expect(localThis.writeEmail).toHaveBeenCalledTimes(1);

      localThis.writeEmail.mockClear();
      await expect(localThis.handle({ sharedWith: ['a@example.com'] }, undefined)).resolves.toBeNull();
      expect(localThis.writeEmail).not.toHaveBeenCalled();
    });

    it('should do nothing when no address was added', async () => {
      const result = await localThis.handle({ sharedWith: ['a@example.com'] }, { sharedWith: ['a@example.com'] });

      expect(result).toBeNull();
      expect(localThis.writeEmail).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should not let one failed email block the others, and count only the queued ones', async () => {
      localThis.writeEmail
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('mail-doc');

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com', 'b@example.com'] }))
        .resolves.toBeNull();

      expect(localThis.writeEmail).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to queue share notification for a@example.com on note note-1 (retryable, code none):',
        expect.any(Error)
      );
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 1 of 2 user(s) on note note-1');
    });

    it('should report zero queued when every write fails', async () => {
      localThis.writeEmail.mockRejectedValue(new Error('firestore down'));

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com', 'b@example.com'] }))
        .resolves.toBeNull();

      // Two failed writes, plus one error that the event has no id
      expect(console.error).toHaveBeenCalledTimes(3);
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 0 of 2 user(s) on note note-1');
    });

    it('should treat a synchronous throw from the writer as a failed write, not a crash', async () => {
      localThis.writeEmail
        .mockImplementationOnce(() => { throw new Error('sync boom'); })
        .mockResolvedValueOnce('mail-doc');

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com', 'b@example.com'] }))
        .resolves.toBeNull();

      expect(localThis.writeEmail).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 1 of 2 user(s) on note note-1');
    });

    it('should give each recipient a stable mail ID derived from the event', async () => {
      const after = { sharedWith: ['a@example.com', 'b@example.com'] };

      await localThis.handle({ sharedWith: [] }, after, 'evt-1');
      await localThis.handle({ sharedWith: [] }, after, 'evt-1');

      const byEmail = (email) => localThis.writeEmail.mock.calls
        .filter((call) => call[0] === email)
        .map((call) => call[3].mailId);
      expect(byEmail('a@example.com')).toEqual([mailIdFor('evt-1', 'a@example.com'), mailIdFor('evt-1', 'a@example.com')]);
      expect(byEmail('b@example.com')[0]).toBe(mailIdFor('evt-1', 'b@example.com'));
      expect(mailIdFor('evt-1', 'a@example.com')).not.toBe(mailIdFor('evt-1', 'b@example.com'));
    });

    it('should use a different mail ID when the same address is shared again in a later event', async () => {
      const after = { sharedWith: ['a@example.com'] };

      await localThis.handle({ sharedWith: [] }, after, 'evt-1');
      await localThis.handle({ sharedWith: [] }, after, 'evt-2');

      const ids = localThis.writeEmail.mock.calls.map((call) => call[3].mailId);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('should make mail IDs 64 character hex digests that do not collide when the separator moves', () => {
      expect(mailIdFor('evt-1', 'a@example.com')).toMatch(/^[0-9a-f]{64}$/);
      expect(mailIdFor('a:b', 'c')).not.toBe(mailIdFor('a', 'b:c'));
    });

    it('should pass the event ID through the real writer so the mail document is created by ID', async () => {
      const create = jest.fn().mockResolvedValue({});
      const doc = jest.fn(() => ({ create }));
      const add = jest.fn();
      getFirestore.mockReturnValue({ collection: jest.fn(() => ({ doc, add })) });
      const after = { sharedWith: ['a@example.com'], ownerEmail: 'owner@example.com', content: 'Hi', url: 'https://example.com/p' };

      await expect(handleNoteShared(localThis.event({ sharedWith: [] }, after, 'evt-1', localThis.freshTime)))
        .resolves.toBeNull();

      expect(doc).toHaveBeenCalledWith(mailIdFor('evt-1', 'a@example.com'));
      expect(create).toHaveBeenCalledTimes(1);
      expect(add).not.toHaveBeenCalled();
    });

    it('should skip recipients that an earlier attempt already queued when the event is retried', async () => {
      const create = jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 6 }))
        .mockResolvedValueOnce({});
      getFirestore.mockReturnValue({ collection: jest.fn(() => ({ doc: jest.fn(() => ({ create })), add: jest.fn() })) });
      const after = { sharedWith: ['a@example.com', 'b@example.com'], ownerEmail: 'owner@example.com', content: 'Hi', url: 'https://example.com/p' };

      await expect(handleNoteShared(localThis.event({ sharedWith: [] }, after, 'evt-1', localThis.freshTime)))
        .resolves.toBeNull();

      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 2 of 2 user(s) on note note-1');
    });

    it('should try every recipient, then throw so the platform retries, after a retryable failure', async () => {
      localThis.writeEmail
        .mockRejectedValueOnce(localThis.unavailable)
        .mockResolvedValueOnce('mail-doc');

      const error = await localThis.handle(
        { sharedWith: [] },
        { sharedWith: ['a@example.com', 'b@example.com'] },
        'evt-1',
        localThis.freshTime
      ).catch((caught) => caught);

      expect(error).toBeInstanceOf(AggregateError);
      expect(error.message).toBe('onNoteShared: mail writes failed, retrying');
      expect(error.errors).toEqual([localThis.unavailable]);
      expect(localThis.writeEmail).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 1 of 2 user(s) on note note-1');
    });

    it('should retry when the event has no time, because its age is unknown', async () => {
      localThis.writeEmail.mockRejectedValue(localThis.unavailable);

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com'] }, 'evt-1'))
        .rejects.toBeInstanceOf(AggregateError);
    });

    it('should still throw for a mix of a permanent and a retryable failure, and report only the retryable one', async () => {
      localThis.writeEmail
        .mockRejectedValueOnce(new MailValidationError('Owner email is required in note data'))
        .mockRejectedValueOnce(localThis.unavailable)
        .mockResolvedValueOnce('mail-doc');

      const error = await localThis.handle(
        { sharedWith: [] },
        { sharedWith: ['a@example.com', 'b@example.com', 'c@example.com'] },
        'evt-1',
        localThis.freshTime
      ).catch((caught) => caught);

      expect(error.errors).toEqual([localThis.unavailable]);
      expect(localThis.writeEmail).toHaveBeenCalledTimes(3);
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 1 of 3 user(s) on note note-1');
    });

    it('should not retry a permanent failure, and should say it was dropped', async () => {
      localThis.writeEmail.mockRejectedValue(new MailValidationError('Owner email is required in note data'));

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com'] }, 'evt-1', localThis.freshTime))
        .resolves.toBeNull();

      expect(console.error).toHaveBeenCalledWith(
        'Failed to queue share notification for a@example.com on note note-1 (permanent, dropped, code none):',
        expect.any(MailValidationError)
      );
    });

    it('should give up with an error log, not a throw, once the event is too old', async () => {
      localThis.writeEmail.mockRejectedValue(localThis.unavailable);

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com'] }, 'evt-1', localThis.staleTime))
        .resolves.toBeNull();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('giving up on 1 share email(s) for note note-1'));
    });

    it('should still retry just inside the age limit', async () => {
      localThis.writeEmail.mockRejectedValue(localThis.unavailable);
      const justInside = new Date(localThis.now - MAX_RETRY_AGE_MS + 60000).toISOString();

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com'] }, 'evt-1', justInside))
        .rejects.toBeInstanceOf(AggregateError);
    });

    it('should log an error and not throw when the event has no id, because a retry could duplicate emails', async () => {
      localThis.writeEmail.mockRejectedValue(localThis.unavailable);

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com'] }, undefined, localThis.freshTime))
        .resolves.toBeNull();

      expect(localThis.writeEmail).toHaveBeenCalledWith('a@example.com', expect.anything(), 'note-1', {});
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('has no id'));
    });

    it('should treat only invalid input as permanent, and retry everything else', () => {
      for (const error of [
        localThis.unavailable,
        new Error('plain'),
        { code: 'ECONNRESET' },
        { code: 2 },
        { code: 7 },
        { code: 'permission-denied' },
        { code: 5 },
        undefined,
        null
      ]) {
        expect(isRetryableWriteError(error)).toBe(true);
      }
      for (const error of [new MailValidationError('x'), { code: 3 }, { code: 'invalid-argument' }]) {
        expect(isRetryableWriteError(error)).toBe(false);
      }
    });

    it('should log an error and do nothing when the event has no data', async () => {
      await expect(handleNoteShared({ params: { noteId: 'note-1' } }, { writeShareNotificationEmail: localThis.writeEmail }))
        .resolves.toBeNull();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('carried no document data'));
      expect(localThis.writeEmail).not.toHaveBeenCalled();
    });

    it('should treat a snapshot with no data as an empty note', async () => {
      await expect(localThis.handle(undefined, { sharedWith: ['a@example.com'] })).resolves.toBeNull();

      expect(localThis.writeEmail).toHaveBeenCalledTimes(1);
    });
  });
});
