/**
 * Note sharing tests
 *
 * Tests detection of newly shared addresses and the onNoteShared handler.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: { serverTimestamp: jest.fn() }
}));

const { findNewlyShared, handleNoteShared } = await import('../../functions/lib/noteSharing.js');

describe('noteSharing', () => {
  const localThis = {};

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
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

    it('should treat a missing sharedWith as empty on either side', () => {
      expect(findNewlyShared({}, { sharedWith: ['a@example.com'] })).toEqual(['a@example.com']);
      expect(findNewlyShared({ sharedWith: ['a@example.com'] }, {})).toEqual([]);
      expect(findNewlyShared({}, {})).toEqual([]);
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
      expect(console.log).toHaveBeenCalledWith('Queued share notifications for 2 user(s) on note note-1');
    });

    it('should do nothing when no address was added', async () => {
      const result = await localThis.handle({ sharedWith: ['a@example.com'] }, { sharedWith: ['a@example.com'] });

      expect(result).toBeNull();
      expect(localThis.writeEmail).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should not let one failed email block the others', async () => {
      localThis.writeEmail
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('mail-doc');

      await expect(localThis.handle({ sharedWith: [] }, { sharedWith: ['a@example.com', 'b@example.com'] }))
        .resolves.toBeNull();

      expect(localThis.writeEmail).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to send share notification to a@example.com:',
        expect.any(Error)
      );
    });
  });
});
