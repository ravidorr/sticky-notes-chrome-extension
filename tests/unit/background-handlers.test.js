/**
 * Background Handlers Unit Tests
 * Tests the actual handlers module with dependency injection
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHandlers } from '../../src/background/handlers.js';

describe('Background Handlers', () => {
  const localThis = {};

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock dependencies
    localThis.mockUser = { uid: 'user-123', email: 'test@example.com', displayName: 'Test User' };
    
    localThis.mockLog = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    localThis.mockChromeStorage = {
      local: {
        get: jest.fn(),
        set: jest.fn()
      }
    };
    
    localThis.deps = {
      signInWithGoogle: jest.fn(),
      signOut: jest.fn(),
      getCurrentUser: jest.fn(),
      createNote: jest.fn(),
      getNotesForUrl: jest.fn(),
      updateNoteInFirestore: jest.fn(),
      deleteNoteFromFirestore: jest.fn(),
      shareNoteInFirestore: jest.fn(),
      isFirebaseConfigured: jest.fn(),
      generateId: jest.fn(() => 'note_123_abc'),
      isValidEmail: jest.fn((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      log: localThis.mockLog,
      chromeStorage: localThis.mockChromeStorage
    };
    
    // Create handlers with mock deps
    localThis.handlers = createHandlers(localThis.deps);
  });

  describe('handleMessage', () => {
    it('should route login action to handleLogin', async () => {
      localThis.deps.signInWithGoogle.mockResolvedValue(localThis.mockUser);
      
      const result = await localThis.handlers.handleMessage({ action: 'login' }, null);
      
      expect(result.success).toBe(true);
      expect(result.user).toEqual(localThis.mockUser);
    });

    it('should route logout action to handleLogout', async () => {
      localThis.deps.signOut.mockResolvedValue();
      
      const result = await localThis.handlers.handleMessage({ action: 'logout' }, null);
      
      expect(result.success).toBe(true);
    });

    it('should route getUser action', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      
      const result = await localThis.handlers.handleMessage({ action: 'getUser' }, null);
      
      expect(result.success).toBe(true);
      expect(result.user).toEqual(localThis.mockUser);
    });

    it('should route getNotes action', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const result = await localThis.handlers.handleMessage({ action: 'getNotes', url: 'https://example.com' }, null);
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual([]);
    });

    it('should route saveNote action', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.handleMessage({ action: 'saveNote', note: { url: 'https://example.com', selector: '#main' } }, null);
      
      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
    });

    it('should route updateNote action', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [{ id: 'note-1', content: 'old' }] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.handleMessage({ action: 'updateNote', note: { id: 'note-1', content: 'new' } }, null);
      
      expect(result.success).toBe(true);
    });

    it('should route deleteNote action', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [{ id: 'note-1' }] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.handleMessage({ action: 'deleteNote', noteId: 'note-1' }, null);
      
      expect(result.success).toBe(true);
    });

    it('should route shareNote action', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.shareNoteInFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.handleMessage({ action: 'shareNote', noteId: 'note-1', email: 'friend@example.com' }, null);
      
      expect(result.success).toBe(true);
    });

    it('should return error for unknown action', async () => {
      const result = await localThis.handlers.handleMessage({ action: 'unknownAction' }, null);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown action');
    });
  });

  describe('handleLogin', () => {
    it('should return user on successful login', async () => {
      localThis.deps.signInWithGoogle.mockResolvedValue(localThis.mockUser);
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(true);
      expect(result.user).toEqual(localThis.mockUser);
    });

    it('should return error on login failure', async () => {
      localThis.deps.signInWithGoogle.mockRejectedValue(new Error('Auth failed'));
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Auth failed');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });

  describe('handleLogout', () => {
    it('should return success on logout', async () => {
      localThis.deps.signOut.mockResolvedValue();
      
      const result = await localThis.handlers.handleLogout();
      
      expect(result.success).toBe(true);
    });

    it('should return error on logout failure', async () => {
      localThis.deps.signOut.mockRejectedValue(new Error('Logout failed'));
      
      const result = await localThis.handlers.handleLogout();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Logout failed');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('should return user when logged in', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      
      const result = await localThis.handlers.getUser();
      
      expect(result.success).toBe(true);
      expect(result.user).toEqual(localThis.mockUser);
    });

    it('should return null user when not logged in', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.getUser();
      
      expect(result.success).toBe(true);
      expect(result.user).toBeNull();
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockRejectedValue(new Error('Failed'));
      
      const result = await localThis.handlers.getUser();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });

  describe('getNotes', () => {
    it('should get notes from Firestore when configured and logged in', async () => {
      const mockNotes = [{ id: '1', content: 'Test note' }];
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getNotesForUrl.mockResolvedValue(mockNotes);
      
      const result = await localThis.handlers.getNotes('https://example.com');
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual(mockNotes);
      expect(localThis.deps.getNotesForUrl).toHaveBeenCalledWith('https://example.com', 'user-123');
    });

    it('should fall back to local storage when Firebase fails', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getNotesForUrl.mockRejectedValue(new Error('Firebase error'));
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [{ id: '1', url: 'https://example.com/page', content: 'Local note' }]
      });
      
      const result = await localThis.handlers.getNotes('https://example.com/page');
      
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(1);
      expect(localThis.mockLog.warn).toHaveBeenCalled();
    });

    it('should use local storage when not logged in', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const result = await localThis.handlers.getNotes('https://example.com');
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual([]);
    });

    it('should filter notes by URL', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: '1', url: 'https://example.com/page' },
          { id: '2', url: 'https://other.com/page' },
          { id: '3', url: 'https://example.com/page?query=1' }
        ]
      });
      
      const result = await localThis.handlers.getNotes('https://example.com/page#section');
      
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(2);
      expect(result.notes.map(n => n.id)).toContain('1');
      expect(result.notes.map(n => n.id)).toContain('3');
    });

    it('should handle invalid note URLs gracefully', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: '1', url: 'invalid-url' },
          { id: '2', url: 'https://example.com/page' }
        ]
      });
      
      const result = await localThis.handlers.getNotes('https://example.com/page');
      
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(1);
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockRejectedValue(new Error('Failed'));
      
      const result = await localThis.handlers.getNotes('https://example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });

  describe('saveNote', () => {
    it('should save note to Firestore when configured and logged in', async () => {
      const noteData = { url: 'https://example.com', selector: '#main', content: 'Test' };
      const savedNote = { id: 'firestore-id', ...noteData };
      
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createNote.mockResolvedValue(savedNote);
      
      const result = await localThis.handlers.saveNote(noteData);
      
      expect(result.success).toBe(true);
      expect(result.note).toEqual(savedNote);
      expect(localThis.deps.createNote).toHaveBeenCalledWith(noteData, 'user-123');
    });

    it('should fall back to local storage when Firebase fails', async () => {
      const noteData = { url: 'https://example.com', selector: '#main', content: 'Test' };
      
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createNote.mockRejectedValue(new Error('Firebase error'));
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.saveNote(noteData);
      
      expect(result.success).toBe(true);
      expect(result.note.id).toBe('note_123_abc');
      expect(localThis.mockLog.warn).toHaveBeenCalled();
    });

    it('should save to local storage when not logged in', async () => {
      const noteData = { url: 'https://example.com', selector: '#main', content: 'Test' };
      
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.saveNote(noteData);
      
      expect(result.success).toBe(true);
      expect(result.note.ownerId).toBe('local');
      expect(result.note.createdAt).toBeDefined();
      expect(result.note.updatedAt).toBeDefined();
    });

    it('should append to existing notes', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [{ id: 'existing' }] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      await localThis.handlers.saveNote({ url: 'https://example.com' });
      
      expect(localThis.mockChromeStorage.local.set).toHaveBeenCalledWith({
        notes: expect.arrayContaining([
          { id: 'existing' },
          expect.objectContaining({ id: 'note_123_abc' })
        ])
      });
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockRejectedValue(new Error('Failed'));
      
      const result = await localThis.handlers.saveNote({});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });

  describe('updateNote', () => {
    it('should update note in Firestore when configured and logged in', async () => {
      const noteData = { id: 'note-1', content: 'Updated' };
      
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.updateNoteInFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.updateNote(noteData);
      
      expect(result.success).toBe(true);
      expect(result.note).toEqual(noteData);
      expect(localThis.deps.updateNoteInFirestore).toHaveBeenCalledWith('note-1', noteData, 'user-123');
    });

    it('should fall back to local storage when Firebase fails', async () => {
      const noteData = { id: 'note-1', content: 'Updated' };
      
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.updateNoteInFirestore.mockRejectedValue(new Error('Firebase error'));
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [{ id: 'note-1', content: 'Old' }] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.updateNote(noteData);
      
      expect(result.success).toBe(true);
      expect(result.note.content).toBe('Updated');
    });

    it('should update in local storage', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [{ id: 'note-1', content: 'Old', theme: 'yellow' }]
      });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.updateNote({ id: 'note-1', content: 'New' });
      
      expect(result.success).toBe(true);
      expect(result.note.content).toBe('New');
      expect(result.note.theme).toBe('yellow'); // Preserved
      expect(result.note.updatedAt).toBeDefined();
    });

    it('should return error when note not found', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const result = await localThis.handlers.updateNote({ id: 'nonexistent' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Note not found');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockRejectedValue(new Error('Failed'));
      
      const result = await localThis.handlers.updateNote({ id: 'note-1' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });

  describe('deleteNote', () => {
    it('should delete note from Firestore when configured and logged in', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteNoteFromFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.deleteNote('note-1');
      
      expect(result.success).toBe(true);
      expect(localThis.deps.deleteNoteFromFirestore).toHaveBeenCalledWith('note-1', 'user-123');
    });

    it('should fall back to local storage when Firebase fails', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteNoteFromFirestore.mockRejectedValue(new Error('Firebase error'));
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [{ id: 'note-1' }] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.deleteNote('note-1');
      
      expect(result.success).toBe(true);
    });

    it('should delete from local storage', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [{ id: 'note-1' }, { id: 'note-2' }]
      });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.deleteNote('note-1');
      
      expect(result.success).toBe(true);
      expect(localThis.mockChromeStorage.local.set).toHaveBeenCalledWith({
        notes: [{ id: 'note-2' }]
      });
    });

    it('should return error when note not found', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const result = await localThis.handlers.deleteNote('nonexistent');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Note not found');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockRejectedValue(new Error('Failed'));
      
      const result = await localThis.handlers.deleteNote('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });

  describe('shareNote', () => {
    it('should share note successfully', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.shareNoteInFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.shareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(true);
      expect(localThis.deps.shareNoteInFirestore).toHaveBeenCalledWith('note-1', 'friend@example.com', 'user-123');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.shareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('You must be logged in to share notes');
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.shareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Sharing requires Firebase to be configured');
    });

    it('should validate note ID', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result1 = await localThis.handlers.shareNote('', 'friend@example.com');
      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Invalid note ID');
      
      const result2 = await localThis.handlers.shareNote(null, 'friend@example.com');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Invalid note ID');
    });

    it('should validate email format', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.isValidEmail.mockReturnValue(false);
      
      const result = await localThis.handlers.shareNote('note-1', 'invalid-email');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address');
    });

    it('should prevent self-sharing', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.shareNote('note-1', 'test@example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('You cannot share a note with yourself');
    });

    it('should be case-insensitive for self-share check', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.shareNote('note-1', 'TEST@EXAMPLE.COM');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('You cannot share a note with yourself');
    });

    it('should lowercase email before sharing', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.shareNoteInFirestore.mockResolvedValue();
      
      await localThis.handlers.shareNote('note-1', 'FRIEND@EXAMPLE.COM');
      
      expect(localThis.deps.shareNoteInFirestore).toHaveBeenCalledWith('note-1', 'friend@example.com', 'user-123');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.shareNoteInFirestore.mockRejectedValue(new Error('Share failed'));
      
      const result = await localThis.handlers.shareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Share failed');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });

  describe('createHandlers', () => {
    it('should return all handler functions', () => {
      const handlers = createHandlers(localThis.deps);
      
      expect(typeof handlers.handleMessage).toBe('function');
      expect(typeof handlers.handleLogin).toBe('function');
      expect(typeof handlers.handleLogout).toBe('function');
      expect(typeof handlers.getUser).toBe('function');
      expect(typeof handlers.getNotes).toBe('function');
      expect(typeof handlers.saveNote).toBe('function');
      expect(typeof handlers.updateNote).toBe('function');
      expect(typeof handlers.deleteNote).toBe('function');
      expect(typeof handlers.shareNote).toBe('function');
    });
  });
});
