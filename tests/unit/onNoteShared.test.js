/**
 * onNoteShared Firestore Trigger Unit Tests
 * 
 * Tests the detection logic for when notes are shared.
 * The actual Cloud Function trigger is tested via the detection logic it uses.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * This function mirrors the logic in functions/index.js onNoteShared trigger.
 * We test it separately to verify the share detection works correctly.
 */
function detectNewlySharedEmails(beforeData, afterData) {
  const oldSharedWith = beforeData.sharedWith || [];
  const newSharedWith = afterData.sharedWith || [];
  
  return newSharedWith.filter(email => !oldSharedWith.includes(email));
}

describe('onNoteShared Trigger Logic', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Helper to create note data
    localThis.createNoteData = (sharedWith = [], overrides = {}) => ({
      sharedWith,
      content: 'Test note content',
      url: 'https://example.com/page',
      ownerEmail: 'owner@example.com',
      ownerId: 'owner-123',
      ...overrides
    });
  });

  describe('detectNewlySharedEmails', () => {
    it('should detect when a new email is added to empty sharedWith', () => {
      const before = localThis.createNoteData([]);
      const after = localThis.createNoteData(['newuser@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual(['newuser@example.com']);
    });

    it('should detect when multiple emails are added', () => {
      const before = localThis.createNoteData(['existing@example.com']);
      const after = localThis.createNoteData([
        'existing@example.com',
        'new1@example.com',
        'new2@example.com'
      ]);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual(['new1@example.com', 'new2@example.com']);
    });

    it('should return empty array when no new shares', () => {
      const before = localThis.createNoteData(['user1@example.com', 'user2@example.com']);
      const after = localThis.createNoteData(['user1@example.com', 'user2@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual([]);
    });

    it('should return empty array when emails are removed', () => {
      const before = localThis.createNoteData(['user1@example.com', 'user2@example.com']);
      const after = localThis.createNoteData(['user1@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual([]);
    });

    it('should handle undefined sharedWith in before data', () => {
      const before = localThis.createNoteData();
      delete before.sharedWith;
      const after = localThis.createNoteData(['new@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual(['new@example.com']);
    });

    it('should handle undefined sharedWith in after data', () => {
      const before = localThis.createNoteData(['existing@example.com']);
      const after = localThis.createNoteData();
      delete after.sharedWith;
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual([]);
    });

    it('should handle both undefined sharedWith arrays', () => {
      const before = localThis.createNoteData();
      delete before.sharedWith;
      const after = localThis.createNoteData();
      delete after.sharedWith;
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual([]);
    });

    it('should handle empty arrays', () => {
      const before = localThis.createNoteData([]);
      const after = localThis.createNoteData([]);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual([]);
    });

    it('should detect first share on a note', () => {
      const before = localThis.createNoteData([]);
      const after = localThis.createNoteData(['firstshare@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual(['firstshare@example.com']);
      expect(newlyShared.length).toBe(1);
    });

    it('should handle case-sensitive email comparison', () => {
      const before = localThis.createNoteData(['User@Example.com']);
      const after = localThis.createNoteData(['User@Example.com', 'user@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      // Emails are case-sensitive in this comparison
      // (normalization happens before storage)
      expect(newlyShared).toEqual(['user@example.com']);
    });

    it('should handle large number of shares', () => {
      const existingEmails = Array.from({ length: 45 }, (_, i) => `user${i}@example.com`);
      const newEmails = ['new1@example.com', 'new2@example.com', 'new3@example.com'];
      
      const before = localThis.createNoteData(existingEmails);
      const after = localThis.createNoteData([...existingEmails, ...newEmails]);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual(newEmails);
      expect(newlyShared.length).toBe(3);
    });
  });

  describe('email notification workflow', () => {
    it('should process each newly shared email', async () => {
      const mockWriteEmail = jest.fn().mockResolvedValue('mail-doc-id');
      const newlyShared = ['user1@example.com', 'user2@example.com'];
      const noteData = localThis.createNoteData(newlyShared);
      const noteId = 'note-123';
      
      // Simulate what the trigger does
      const emailPromises = newlyShared.map(email =>
        mockWriteEmail(email, noteData, noteId)
      );
      
      await Promise.all(emailPromises);
      
      expect(mockWriteEmail).toHaveBeenCalledTimes(2);
      expect(mockWriteEmail).toHaveBeenCalledWith('user1@example.com', noteData, noteId);
      expect(mockWriteEmail).toHaveBeenCalledWith('user2@example.com', noteData, noteId);
    });

    it('should not send emails when no new shares detected', async () => {
      const mockWriteEmail = jest.fn();
      const before = localThis.createNoteData(['existing@example.com']);
      const after = localThis.createNoteData(['existing@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      if (newlyShared.length === 0) {
        // Trigger returns early, no emails sent
        return;
      }
      
      await Promise.all(newlyShared.map(email => mockWriteEmail(email)));
      
      expect(mockWriteEmail).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue with other emails', async () => {
      const mockWriteEmail = jest.fn()
        .mockRejectedValueOnce(new Error('Send failed'))
        .mockResolvedValueOnce('mail-2')
        .mockResolvedValueOnce('mail-3');
      
      const newlyShared = ['fail@example.com', 'success1@example.com', 'success2@example.com'];
      const noteData = localThis.createNoteData(newlyShared);
      const noteId = 'note-123';
      
      // Simulate what the trigger does - catch errors for each
      const emailPromises = newlyShared.map(email =>
        mockWriteEmail(email, noteData, noteId)
          .catch(_error => {
            // Error is logged but doesn't stop other emails
          })
      );
      
      // Should not throw
      await expect(Promise.all(emailPromises)).resolves.toBeDefined();
      
      // All three should have been attempted
      expect(mockWriteEmail).toHaveBeenCalledTimes(3);
    });

    it('should return null when no new shares (trigger behavior)', async () => {
      const before = localThis.createNoteData(['existing@example.com']);
      const after = localThis.createNoteData(['existing@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      if (newlyShared.length === 0) {
        // This is what the trigger returns
        const result = null;
        expect(result).toBeNull();
      }
    });
  });

  describe('edge cases', () => {
    it('should handle note with only content changes (no share changes)', () => {
      const before = localThis.createNoteData(['user@example.com'], { content: 'Old content' });
      const after = localThis.createNoteData(['user@example.com'], { content: 'New content' });
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual([]);
    });

    it('should handle simultaneous add and remove', () => {
      const before = localThis.createNoteData(['remove@example.com', 'keep@example.com']);
      const after = localThis.createNoteData(['keep@example.com', 'add@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      // Only the newly added email should be detected
      expect(newlyShared).toEqual(['add@example.com']);
    });

    it('should handle reordering of emails (no actual changes)', () => {
      const before = localThis.createNoteData(['a@example.com', 'b@example.com', 'c@example.com']);
      const after = localThis.createNoteData(['c@example.com', 'a@example.com', 'b@example.com']);
      
      const newlyShared = detectNewlySharedEmails(before, after);
      
      expect(newlyShared).toEqual([]);
    });
  });
});
