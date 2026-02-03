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
  onSnapshot: jest.fn(),
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
  getAuth: jest.fn(),
  initializeAuth: jest.fn(() => ({ name: 'mock-auth' })),
  browserLocalPersistence: { type: 'LOCAL' },
  indexedDBLocalPersistence: { type: 'LOCAL' }
}));

// Import after mocking
const {
  createNote,
  getNotesForUrl,
  updateNote,
  deleteNote,
  shareNote,
  unshareNote,
  leaveSharedNote,
  subscribeToNotesForUrl,
  getSharedNotesForUser,
  subscribeToSharedNotes
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
      serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
      onSnapshot: jest.fn()
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
      
      const result = await createNote(noteData, 'user-123', 'user@example.com', localThis.deps);
      
      expect(result.id).toBe('new-note-123');
      expect(result.url).toBe('https://example.com/page');
      expect(result.selector).toBe('#main-content');
      expect(result.theme).toBe('blue');
      expect(result.ownerId).toBe('user-123');
      expect(result.ownerEmail).toBe('user@example.com');
      expect(result.sharedWith).toEqual([]);
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(createNote({ url: 'https://example.com' }, 'user-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error when db is null', async () => {
      localThis.deps.db = null;
      
      await expect(createNote({ url: 'https://example.com' }, 'user-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid URL', async () => {
      await expect(createNote({ url: null, selector: '#main' }, 'user-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Invalid URL');
      
      await expect(createNote({ url: 123, selector: '#main' }, 'user-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Invalid URL');
    });

    it('should throw error when selector is missing', async () => {
      await expect(createNote({ url: 'https://example.com' }, 'user-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Selector is required');
    });

    it('should throw error for invalid selector', async () => {
      await expect(createNote({ 
        url: 'https://example.com', 
        selector: '<script>alert("xss")</script>' 
      }, 'user-123', 'user@example.com', localThis.deps)).rejects.toThrow('Invalid selector');
    });

    it('should default to yellow theme for invalid theme', async () => {
      localThis.deps.addDoc.mockResolvedValue({ id: 'note-123' });
      
      const result = await createNote({
        url: 'https://example.com',
        selector: '#main',
        theme: 'invalid-theme'
      }, 'user-123', 'user@example.com', localThis.deps);
      
      expect(result.theme).toBe('yellow');
    });

    it('should use valid theme when provided', async () => {
      localThis.deps.addDoc.mockResolvedValue({ id: 'note-123' });
      
      const result = await createNote({
        url: 'https://example.com',
        selector: '#main',
        theme: 'green'
      }, 'user-123', 'user@example.com', localThis.deps);
      
      expect(result.theme).toBe('green');
    });

    it('should default isHidden to false when not provided', async () => {
      localThis.deps.addDoc.mockResolvedValue({ id: 'note-123' });
      
      const result = await createNote({
        url: 'https://example.com',
        selector: '#main'
      }, 'user-123', 'user@example.com', localThis.deps);
      
      expect(result.isHidden).toBe(false);
    });

    it('should preserve isHidden when provided', async () => {
      localThis.deps.addDoc.mockResolvedValue({ id: 'note-123' });
      
      const result = await createNote({
        url: 'https://example.com',
        selector: '#main',
        isHidden: true
      }, 'user-123', 'user@example.com', localThis.deps);
      
      expect(result.isHidden).toBe(true);
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

    it('should allow updating isHidden field', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123' })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await updateNote('note-123', { 
        isHidden: true
      }, 'user-123', localThis.deps);
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.isHidden).toBe(true);
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
      const maxSharedWith = Array(50).fill('user@example.com').map((_email, index) => `user${index}@example.com`);
      
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: maxSharedWith })
      });
      
      await expect(shareNote('note-123', 'newuser@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Cannot share with more than 50 users');
    });
  });

  describe('unshareNote', () => {
    it('should unshare note successfully', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: ['friend@example.com', 'other@example.com'] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await expect(unshareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .resolves.toBeUndefined();
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.sharedWith).not.toContain('friend@example.com');
      expect(updateCall.sharedWith).toContain('other@example.com');
    });

    it('should lowercase email before unsharing', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: ['friend@example.com'] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await unshareNote('note-123', 'FRIEND@EXAMPLE.COM', 'user-123', localThis.deps);
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.sharedWith).not.toContain('friend@example.com');
      expect(updateCall.sharedWith).toEqual([]);
    });

    it('should handle unsharing when email not in list', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'user-123', sharedWith: ['other@example.com'] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await unshareNote('note-123', 'friend@example.com', 'user-123', localThis.deps);
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.sharedWith).toEqual(['other@example.com']);
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(unshareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(unshareNote('', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid note ID');
      
      await expect(unshareNote(null, 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });

    it('should throw error for invalid email address', async () => {
      await expect(unshareNote('note-123', '', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid email address');
      
      await expect(unshareNote('note-123', null, 'user-123', localThis.deps))
        .rejects.toThrow('Invalid email address');
    });

    it('should throw error for invalid owner ID', async () => {
      await expect(unshareNote('note-123', 'friend@example.com', '', localThis.deps))
        .rejects.toThrow('Invalid owner ID');
      
      await expect(unshareNote('note-123', 'friend@example.com', null, localThis.deps))
        .rejects.toThrow('Invalid owner ID');
    });

    it('should throw error for empty email after trim', async () => {
      await expect(unshareNote('note-123', '   ', 'user-123', localThis.deps))
        .rejects.toThrow('Email address cannot be empty');
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => false
      });
      
      await expect(unshareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when not owner', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user' })
      });
      
      await expect(unshareNote('note-123', 'friend@example.com', 'user-123', localThis.deps))
        .rejects.toThrow('Only the owner can modify sharing');
    });
  });

  describe('leaveSharedNote', () => {
    it('should leave shared note successfully', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: ['user@example.com', 'other@example.com'] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await expect(leaveSharedNote('note-123', 'user@example.com', localThis.deps))
        .resolves.toBeUndefined();
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.sharedWith).not.toContain('user@example.com');
      expect(updateCall.sharedWith).toContain('other@example.com');
    });

    it('should lowercase email before leaving', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: ['user@example.com'] })
      });
      localThis.deps.updateDoc.mockResolvedValue();
      
      await leaveSharedNote('note-123', 'USER@EXAMPLE.COM', localThis.deps);
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.sharedWith).toEqual([]);
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(leaveSharedNote('note-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(leaveSharedNote('', 'user@example.com', localThis.deps))
        .rejects.toThrow('Invalid note ID');
      
      await expect(leaveSharedNote(null, 'user@example.com', localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });

    it('should throw error for invalid email address', async () => {
      await expect(leaveSharedNote('note-123', '', localThis.deps))
        .rejects.toThrow('Invalid email address');
      
      await expect(leaveSharedNote('note-123', null, localThis.deps))
        .rejects.toThrow('Invalid email address');
    });

    it('should throw error for empty email after trim', async () => {
      await expect(leaveSharedNote('note-123', '   ', localThis.deps))
        .rejects.toThrow('Email address cannot be empty');
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => false
      });
      
      await expect(leaveSharedNote('note-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when user not in shared list', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: ['someone-else@example.com'] })
      });
      
      await expect(leaveSharedNote('note-123', 'user@example.com', localThis.deps))
        .rejects.toThrow('You are not in the shared list for this note');
    });
  });

  describe('subscribeToNotesForUrl', () => {
    it('should call onError when Firebase is not configured', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      const unsubscribe = subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        'user@example.com',
        onUpdate,
        onError,
        { ...localThis.deps, db: null, isFirebaseConfigured: () => false }
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Firebase is not configured');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should set up onSnapshot listeners for owned and shared notes', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const mockUnsubscribe = jest.fn();

      localThis.deps.onSnapshot.mockReturnValue(mockUnsubscribe);
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      const unsubscribe = subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should set up two listeners (owned + shared)
      expect(localThis.deps.onSnapshot).toHaveBeenCalledTimes(2);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should only set up one listener when no email provided', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const mockUnsubscribe = jest.fn();

      localThis.deps.onSnapshot.mockReturnValue(mockUnsubscribe);
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        null, // No email
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should only set up one listener (owned only)
      expect(localThis.deps.onSnapshot).toHaveBeenCalledTimes(1);
    });

    it('should call onUpdate with merged notes when snapshot fires', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      let ownedCallback;

      localThis.deps.onSnapshot.mockImplementation((query, successCb) => {
        ownedCallback = successCb;
        return jest.fn();
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        null, // No email, so only owned query
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate snapshot with notes
      const mockSnapshot = {
        forEach: (cb) => {
          cb({ id: 'note-1', data: () => ({ content: 'Test' }) });
          cb({ id: 'note-2', data: () => ({ content: 'Test 2' }) });
        }
      };
      ownedCallback(mockSnapshot);

      expect(onUpdate).toHaveBeenCalledWith([
        { id: 'note-1', content: 'Test' },
        { id: 'note-2', content: 'Test 2' }
      ]);
    });

    it('should call onError when snapshot listener errors', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      let errorCallback;

      localThis.deps.onSnapshot.mockImplementation((query, successCb, errorCb) => {
        errorCallback = errorCb;
        return jest.fn();
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        null,
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate error
      const mockError = new Error('Firestore error');
      errorCallback(mockError);

      expect(onError).toHaveBeenCalledWith(mockError);
    });

    it('should unsubscribe from all listeners when unsubscribe is called', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const mockUnsubOwned = jest.fn();
      const mockUnsubShared = jest.fn();

      let callCount = 0;
      localThis.deps.onSnapshot.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? mockUnsubOwned : mockUnsubShared;
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      const unsubscribe = subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      unsubscribe();

      expect(mockUnsubOwned).toHaveBeenCalled();
      expect(mockUnsubShared).toHaveBeenCalled();
    });

    it('should dedupe notes that appear in both owned and shared', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      let ownedCallback, sharedCallback;
      let callCount = 0;

      localThis.deps.onSnapshot.mockImplementation((query, successCb) => {
        callCount++;
        if (callCount === 1) {
          ownedCallback = successCb;
        } else {
          sharedCallback = successCb;
        }
        return jest.fn();
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate owned snapshot
      ownedCallback({
        forEach: (cb) => {
          cb({ id: 'note-1', data: () => ({ content: 'Owned' }) });
        }
      });

      // Simulate shared snapshot with same note ID
      sharedCallback({
        forEach: (cb) => {
          cb({ id: 'note-1', data: () => ({ content: 'Shared' }) }); // Same ID
          cb({ id: 'note-2', data: () => ({ content: 'Only shared' }) });
        }
      });

      // Should only have 2 notes, not 3
      const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
      expect(lastCall).toHaveLength(2);
      expect(lastCall[0].id).toBe('note-1');
      expect(lastCall[1].id).toBe('note-2');
      expect(lastCall[1].isShared).toBe(true);
    });

    it('should call onError when url is invalid', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      const unsubscribe = subscribeToNotesForUrl(
        '',
        'user-123',
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Invalid URL');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call onError when userId is invalid', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      const unsubscribe = subscribeToNotesForUrl(
        'https://example.com',
        null,
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('User ID required');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call onError when onUpdate is not a function', () => {
      const onError = jest.fn();
      
      const unsubscribe = subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        'user@example.com',
        'not a function',
        onError,
        localThis.deps
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('onUpdate callback required');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return noop when onError is not a function', () => {
      const onUpdate = jest.fn();
      
      const unsubscribe = subscribeToNotesForUrl(
        'https://example.com',
        'user-123',
        'user@example.com',
        onUpdate,
        'not a function',
        localThis.deps
      );
      
      // Should return without error
      expect(typeof unsubscribe).toBe('function');
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getSharedNotesForUser', () => {
    it('should get all shared notes for a user', async () => {
      const mockSharedDocs = [
        { id: 'shared-1', data: () => ({ url: 'https://example.com', content: 'Shared note 1' }) },
        { id: 'shared-2', data: () => ({ url: 'https://other.com', content: 'Shared note 2' }) }
      ];
      
      localThis.deps.getDocs.mockResolvedValue({ forEach: (cb) => mockSharedDocs.forEach(cb), size: 2 });
      
      const notes = await getSharedNotesForUser('user@example.com', localThis.deps);
      
      expect(notes).toHaveLength(2);
      expect(notes[0].id).toBe('shared-1');
      expect(notes[0].isShared).toBe(true);
      expect(notes[1].id).toBe('shared-2');
      expect(notes[1].isShared).toBe(true);
    });

    it('should return empty array when no email provided', async () => {
      const notes = await getSharedNotesForUser(null, localThis.deps);
      
      expect(notes).toHaveLength(0);
      expect(localThis.deps.getDocs).not.toHaveBeenCalled();
    });

    it('should lowercase email for query', async () => {
      localThis.deps.getDocs.mockResolvedValue({ forEach: () => {}, size: 0 });
      
      await getSharedNotesForUser('USER@EXAMPLE.COM', localThis.deps);
      
      expect(localThis.deps.where).toHaveBeenCalledWith('sharedWith', 'array-contains', 'user@example.com');
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(getSharedNotesForUser('user@example.com', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error when db is null', async () => {
      localThis.deps.db = null;
      
      await expect(getSharedNotesForUser('user@example.com', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });
  });

  describe('subscribeToSharedNotes', () => {
    it('should call onError when Firebase is not configured', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      const unsubscribe = subscribeToSharedNotes(
        'user@example.com',
        onUpdate,
        onError,
        { ...localThis.deps, db: null, isFirebaseConfigured: () => false }
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Firebase is not configured');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call onError when email is not provided', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      const unsubscribe = subscribeToSharedNotes(
        null,
        onUpdate,
        onError,
        localThis.deps
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('User email required');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call onError when onUpdate is not a function', () => {
      const onError = jest.fn();
      
      const unsubscribe = subscribeToSharedNotes(
        'user@example.com',
        'not a function',
        onError,
        localThis.deps
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('onUpdate callback required');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return noop when onError is not a function', () => {
      const onUpdate = jest.fn();
      
      const unsubscribe = subscribeToSharedNotes(
        'user@example.com',
        onUpdate,
        'not a function',
        localThis.deps
      );
      
      // Should return without error
      expect(typeof unsubscribe).toBe('function');
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('should set up onSnapshot listener for shared notes', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const mockUnsubscribe = jest.fn();

      localThis.deps.onSnapshot.mockReturnValue(mockUnsubscribe);
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      const unsubscribe = subscribeToSharedNotes(
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(localThis.deps.onSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call onUpdate with shared notes when snapshot fires', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      let snapshotCallback;

      localThis.deps.onSnapshot.mockImplementation((query, successCb) => {
        snapshotCallback = successCb;
        return jest.fn();
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      subscribeToSharedNotes(
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate snapshot with notes
      const mockSnapshot = {
        forEach: (cb) => {
          cb({ id: 'note-1', data: () => ({ content: 'Shared 1' }) });
          cb({ id: 'note-2', data: () => ({ content: 'Shared 2' }) });
        }
      };
      snapshotCallback(mockSnapshot);

      expect(onUpdate).toHaveBeenCalledWith([
        { id: 'note-1', content: 'Shared 1', isShared: true },
        { id: 'note-2', content: 'Shared 2', isShared: true }
      ]);
    });

    it('should call onError when snapshot listener errors', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      let errorCallback;

      localThis.deps.onSnapshot.mockImplementation((query, successCb, errorCb) => {
        errorCallback = errorCb;
        return jest.fn();
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      subscribeToSharedNotes(
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate error
      const mockError = new Error('Firestore error');
      errorCallback(mockError);

      expect(onError).toHaveBeenCalledWith(mockError);
    });

    it('should unsubscribe when unsubscribe function is called', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const mockUnsubscribe = jest.fn();

      localThis.deps.onSnapshot.mockReturnValue(mockUnsubscribe);
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      const unsubscribe = subscribeToSharedNotes(
        'user@example.com',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should lowercase email for query', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();

      localThis.deps.onSnapshot.mockReturnValue(jest.fn());
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });

      subscribeToSharedNotes(
        'USER@EXAMPLE.COM',
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for async setup to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(localThis.deps.where).toHaveBeenCalledWith('sharedWith', 'array-contains', 'user@example.com');
    });
  });
});
