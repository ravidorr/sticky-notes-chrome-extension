/**
 * Firebase Notes Unit Tests
 * 
 * Tests Firestore CRUD operations with mocked dependencies.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock Firebase modules before import
jest.unstable_mockModule('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
  getFirestore: jest.fn(() => ({ name: 'mock-db' })),
  initializeFirestore: jest.fn(() => ({ name: 'mock-db' })),
  persistentLocalCache: jest.fn(),
  persistentSingleTabManager: jest.fn(),
  memoryLocalCache: jest.fn()
}));

jest.unstable_mockModule('firebase/app', () => ({
  initializeApp: jest.fn()
}));

jest.unstable_mockModule('firebase/auth', () => ({
  getAuth: jest.fn()
}));

// Import after mocking
const {
  createNote,
  getNotesForUrl,
  updateNote,
  deleteNote,
  shareNote
} = await import('../../src/firebase/notes.js');

describe('Firebase Notes', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Firestore deps
    localThis.mockDb = { name: 'mock-db' };
    
    localThis.mockDocRef = { id: 'doc-123' };
    localThis.mockCollectionRef = { id: 'collection' };
    
    localThis.deps = {
      db: localThis.mockDb,
      isFirebaseConfigured: jest.fn(() => true),
      collection: jest.fn(() => localThis.mockCollectionRef),
      doc: jest.fn(() => localThis.mockDocRef),
      addDoc: jest.fn(),
      getDoc: jest.fn(),
      getDocs: jest.fn(),
      updateDoc: jest.fn(),
      deleteDoc: jest.fn(),
      query: jest.fn((col) => col),
      where: jest.fn(() => ({})),
      orderBy: jest.fn(() => ({})),
      serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' }))
    };
  });

  describe('createNote', () => {
    it('should create a note successfully', async () => {
      const noteData = {
        url: 'https://example.com/page',
        selector: '#main-content',
        content: 'Test note',
        theme: 'blue'
      };
      
      localThis.deps.addDoc.mockResolvedValue({ id: 'new-note-123' });
      
      const result = await createNote(noteData, 'user-123', localThis.deps);
      
      expect(result.id).toBe('new-note-123');
      expect(result.url).toBe('https://example.com/page');
      expect(result.selector).toBe('#main-content');
      expect(result.theme).toBe('blue');
      expect(result.ownerId).toBe('user-123');
      expect(result.sharedWith).toEqual([]);
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(createNote({ url: 'https://example.com' }, 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error when db is null', async () => {
      localThis.deps.db = null;
      
      await expect(createNote({ url: 'https://example.com' }, 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid URL', async () => {
      await expect(createNote({ url: null, selector: '#main' }, 'user-123', localThis.deps))
        .rejects.toThrow('Invalid URL');
      
      await expect(createNote({ url: 123, selector: '#main' }, 'user-123', localThis.deps))
        .rejects.toThrow('Invalid URL');
    });

    it('should throw error when selector is missing', async () => {
      await expect(createNote({ url: 'https://example.com' }, 'user-123', localThis.deps))
        .rejects.toThrow('Selector is required');
    });

    it('should throw error for invalid selector', async () => {
      await expect(createNote({ 
        url: 'https://example.com', 
        selector: '<script>alert("xss")</script>' 
      }, 'user-123', localThis.deps)).rejects.toThrow('Invalid selector');
    });

    it('should default to yellow theme for invalid theme', async () => {
      localThis.deps.addDoc.mockResolvedValue({ id: 'note-123' });
      
      const result = await createNote({
        url: 'https://example.com',
        selector: '#main',
        theme: 'invalid-theme'
      }, 'user-123', localThis.deps);
      
      expect(result.theme).toBe('yellow');
    });

    it('should use valid theme when provided', async () => {
      localThis.deps.addDoc.mockResolvedValue({ id: 'note-123' });
      
      const result = await createNote({
        url: 'https://example.com',
        selector: '#main',
        theme: 'green'
      }, 'user-123', localThis.deps);
      
      expect(result.theme).toBe('green');
    });
  });

  describe('getNotesForUrl', () => {
    it('should get owned and shared notes', async () => {
      const mockOwnedDocs = [
        { id: 'owned-1', data: () => ({ url: 'https://example.com', content: 'Owned note' }) }
      ];
      const mockSharedDocs = [
        { id: 'shared-1', data: () => ({ url: 'https://example.com', content: 'Shared note' }) }
      ];
      
      localThis.deps.getDocs
        .mockResolvedValueOnce({ forEach: (cb) => mockOwnedDocs.forEach(cb), size: 1 })
        .mockResolvedValueOnce({ forEach: (cb) => mockSharedDocs.forEach(cb), size: 1 });
      
      const notes = await getNotesForUrl('https://example.com', 'user-123', 'user@example.com', localThis.deps);
      
      expect(notes).toHaveLength(2);
      expect(notes[0].id).toBe('owned-1');
      expect(notes[1].id).toBe('shared-1');
      expect(notes[1].isShared).toBe(true);
    });

    it('should deduplicate notes by ID', async () => {
      const mockDocs = [
        { id: 'note-1', data: () => ({ content: 'Note' }) }
      ];
      
      localThis.deps.getDocs
        .mockResolvedValueOnce({ forEach: (cb) => mockDocs.forEach(cb), size: 1 })
        .mockResolvedValueOnce({ forEach: (cb) => mockDocs.forEach(cb), size: 1 });
      
      const notes = await getNotesForUrl('https://example.com', 'user-123', 'user@example.com', localThis.deps);
      
      expect(notes).toHaveLength(1);
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(getNotesForUrl('https://example.com', 'user-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });
    
    it('should handle missing email gracefully', async () => {
      const mockOwnedDocs = [
        { id: 'owned-1', data: () => ({ url: 'https://example.com', content: 'Owned note' }) }
      ];
      
      localThis.deps.getDocs
        .mockResolvedValueOnce({ forEach: (cb) => mockOwnedDocs.forEach(cb), size: 1 });
      
      // Pass null/undefined email - should still return owned notes
      const notes = await getNotesForUrl('https://example.com', 'user-123', null, localThis.deps);
      
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('owned-1');
    });
  });

  describe('updateNote', () => {
    it('should update note when user is owner', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: [] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await expect(updateNote('note-123', { content: 'Updated' }, 'user-123', localThis.deps))
        .resolves.toBeUndefined();
      
      expect(localThis.deps.updateDoc).toHaveBeenCalled();
    });

    it('should update note when user is in sharedWith', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: ['user-123'] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await expect(updateNote('note-123', { content: 'Updated' }, 'user-123', localThis.deps))
        .resolves.toBeUndefined();
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => false
      });
      
      await expect(updateNote('note-123', {}, 'user-123', localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when permission denied', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: [] })
      });
      
      await expect(updateNote('note-123', {}, 'user-123', localThis.deps))
        .rejects.toThrow('Permission denied');
    });

    it('should only update allowed fields', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123' })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await updateNote('note-123', { 
        content: 'Updated', 
        theme: 'blue',
        ownerId: 'hacker'  // Should be ignored
      }, 'user-123', localThis.deps);
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.content).toBe('Updated');
      expect(updateCall.theme).toBe('blue');
      expect(updateCall.ownerId).toBeUndefined();
      expect(updateCall.updatedAt).toBeDefined();
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(updateNote('note-123', {}, 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });
  });

  describe('deleteNote', () => {
    it('should delete note when user is owner', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123' })
      });
      localThis.deps.deleteDoc.mockResolvedValue();
      
      await expect(deleteNote('note-123', 'user-123', localThis.deps))
        .resolves.toBeUndefined();
      
      expect(localThis.deps.deleteDoc).toHaveBeenCalled();
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => false
      });
      
      await expect(deleteNote('note-123', 'user-123', localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when not owner', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user' })
      });
      
      await expect(deleteNote('note-123', 'user-123', localThis.deps))
        .rejects.toThrow('Only the owner can delete this note');
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(deleteNote('note-123', 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });
  });

  describe('shareNote', () => {
    it('should share note successfully', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: [] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await expect(shareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .resolves.toBeUndefined();
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.sharedWith).toContain('friend@example.com');
    });

    it('should lowercase email before sharing', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: [] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await shareNote('note-123', 'FRIEND@EXAMPLE.COM', 'user-123', localThis.deps);
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.sharedWith).toContain('friend@example.com');
    });

    it('should not duplicate when already shared', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: ['friend@example.com'] })
      });
      
      await shareNote('note-123', 'friend@example.com', 'user-123', localThis.deps);
      
      expect(localThis.deps.updateDoc).not.toHaveBeenCalled();
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(shareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(shareNote('', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid note ID');
      
      await expect(shareNote(null, 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });

    it('should throw error for invalid user identifier', async () => {
      await expect(shareNote('note-123', '', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid user identifier');
      
      await expect(shareNote('note-123', null, 'user-123', localThis.deps))
        .rejects.toThrow('Invalid user identifier');
    });

    it('should throw error for invalid owner ID', async () => {
      await expect(shareNote('note-123', 'friend@example.com', '', localThis.deps))
        .rejects.toThrow('Invalid owner ID');
      
      await expect(shareNote('note-123', 'friend@example.com', null, localThis.deps))
        .rejects.toThrow('Invalid owner ID');
    });

    it('should throw error for empty user identifier after trim', async () => {
      await expect(shareNote('note-123', '   ', 'user-123', localThis.deps))
        .rejects.toThrow('User identifier cannot be empty');
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => false
      });
      
      await expect(shareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when not owner', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user' })
      });
      
      await expect(shareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Only the owner can share this note');
    });

    it('should throw error when max shares reached', async () => {
      const maxSharedWith = Array(50).fill('user@example.com').map((e, i) => `user${i}@example.com`);
      
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: maxSharedWith })
      });
      
      await expect(shareNote('note-123', 'newuser@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Cannot share with more than 50 users');
    });
  });
});
