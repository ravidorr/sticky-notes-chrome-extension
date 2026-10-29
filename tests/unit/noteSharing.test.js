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

const { findNewlyShared, handleNoteShared } = await import('../../functions/lib/noteSharing.js');

describe('noteSharing', () => {
  const localThis = {};

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    getFirestore.mockReset();
    localThis.writeEmail = jest.fn().mockResolvedValue('mail-doc');
    localThis.event = (before, after) => ({
      params: { noteId: 'note-1' },
      data: { before: { data: () => before }, after: { data: () => after } }
    });
    localThis.handle = (before, after) => handleNoteShared(
      localThis.event(before, after),
      { writeShareNotificationEmail: localThis.writeEmail }
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
      expect(localThis.writeEmail).toHaveBeenCalledWith('a@example.com', after, 'note-1');
      expect(localThis.writeEmail).toHaveBeenCalledWith('b@example.com', after, 'note-1');
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
        'Failed to queue share notification for a@example.com on note note-1:',
        expect.any(Error)
      );
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 1 of 2 user(s) on note note-1');
    });

    it('should report zero queued when every write fails', async () => {
      localThis.writeEmail.mockRejectedValue(new Error('firestore down'));

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com', 'b@example.com'] }))
        .resolves.toBeNull();

      expect(console.error).toHaveBeenCalledTimes(2);
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

    it('should warn and do nothing when the event has no data', async () => {
      await expect(handleNoteShared({ params: { noteId: 'note-1' } }, { writeShareNotificationEmail: localThis.writeEmail }))
        .resolves.toBeNull();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('carried no document data'));
      expect(localThis.writeEmail).not.toHaveBeenCalled();
    });

    it('should treat a snapshot with no data as an empty note', async () => {
      await expect(localThis.handle(undefined, { sharedWith: ['a@example.com'] })).resolves.toBeNull();

      expect(localThis.writeEmail).toHaveBeenCalledTimes(1);
    });
  });
});
