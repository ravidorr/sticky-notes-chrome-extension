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
      unshareNoteInFirestore: jest.fn(),
      leaveSharedNoteInFirestore: jest.fn(),
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
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Unknown action|unknownAction)$/);
    });
  });

  describe('handleLogin', () => {
    it('should return user on successful login', async () => {
      localThis.deps.signInWithGoogle.mockResolvedValue(localThis.mockUser);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
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
    
    it('should migrate local notes to Firebase on successful login', async () => {
      localThis.deps.signInWithGoogle.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createNote.mockResolvedValue({ id: 'firebase-note-1' });
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: 'local-1', url: 'https://example.com', content: 'Test note 1', selector: '#el1' },
          { id: 'local-2', url: 'https://example.com', content: 'Test note 2', selector: '#el2' }
        ]
      });
      localThis.mockChromeStorage.local.remove = jest.fn().mockResolvedValue();
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(true);
      expect(result.migration.migrated).toBe(2);
      expect(localThis.deps.createNote).toHaveBeenCalledTimes(2);
      expect(localThis.mockChromeStorage.local.remove).toHaveBeenCalledWith(['notes']);
    });
    
    it('should not migrate when no local notes exist', async () => {
      localThis.deps.signInWithGoogle.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(true);
      expect(result.migration.migrated).toBe(0);
      expect(localThis.deps.createNote).not.toHaveBeenCalled();
    });
    
    it('should not migrate when Firebase is not configured', async () => {
      localThis.deps.signInWithGoogle.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [{ id: 'local-1', url: 'https://example.com', content: 'Test' }]
      });
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(true);
      expect(result.migration.migrated).toBe(0);
      expect(localThis.deps.createNote).not.toHaveBeenCalled();
    });
    
    it('should keep failed notes in local storage', async () => {
      localThis.deps.signInWithGoogle.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createNote
        .mockResolvedValueOnce({ id: 'firebase-1' })
        .mockRejectedValueOnce(new Error('Firebase error'));
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: 'local-1', url: 'https://example.com', content: 'Note 1', selector: '#el1' },
          { id: 'local-2', url: 'https://example.com', content: 'Note 2', selector: '#el2' }
        ]
      });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.handleLogin();
      
      expect(result.success).toBe(true);
      expect(result.migration.migrated).toBe(1);
      expect(result.migration.failed).toBe(1);
      // Should keep the failed note in local storage
      expect(localThis.mockChromeStorage.local.set).toHaveBeenCalledWith({
        notes: expect.arrayContaining([
          expect.objectContaining({ id: 'local-2' })
        ])
      });
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
      expect(localThis.deps.getNotesForUrl).toHaveBeenCalledWith('https://example.com', 'user-123', 'test@example.com');
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
      expect(result.notes.map((note) => note.id)).toContain('1');
      expect(result.notes.map((note) => note.id)).toContain('3');
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
      expect(localThis.deps.createNote).toHaveBeenCalledWith(noteData, 'user-123', 'test@example.com');
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
      expect(localThis.mockLog.error).toHaveBeenCalled();
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
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Note not found|noteNotFound)$/);
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

    it('should fall back to local storage when Firebase fails with non-permission error', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteNoteFromFirestore.mockRejectedValue(new Error('Network error'));
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [{ id: 'note-1' }] });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.deleteNote('note-1');
      
      expect(result.success).toBe(true);
    });

    it('should return permission error when non-owner tries to delete', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteNoteFromFirestore.mockRejectedValue(new Error('Only the owner can delete this note'));
      
      const result = await localThis.handlers.deleteNote('note-1');
      
      expect(result.success).toBe(false);
      // Should NOT fall back to local storage for permission errors
      expect(localThis.mockChromeStorage.local.get).not.toHaveBeenCalled();
      // Should return a user-friendly permission error
      expect(result.error).toMatch(/^(Only the owner can delete this note|onlyOwnerCanDelete)$/);
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
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Note not found|noteNotFound)$/);
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
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(You must be logged in to share notes|mustBeLoggedInToShare)$/);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.shareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Sharing requires Firebase to be configured|sharingRequiresFirebase)$/);
    });

    it('should validate note ID', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result1 = await localThis.handlers.shareNote('', 'friend@example.com');
      expect(result1.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result1.error).toMatch(/^(Invalid note ID|invalidNoteId)$/);
      
      const result2 = await localThis.handlers.shareNote(null, 'friend@example.com');
      expect(result2.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result2.error).toMatch(/^(Invalid note ID|invalidNoteId)$/);
    });

    it('should validate email format', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.isValidEmail.mockReturnValue(false);
      
      const result = await localThis.handlers.shareNote('note-1', 'invalid-email');
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Invalid email address|invalidEmailAddress)$/);
    });

    it('should prevent self-sharing', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.shareNote('note-1', 'test@example.com');
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(You cannot share a note with yourself|cannotShareWithSelf)$/);
    });

    it('should be case-insensitive for self-share check', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.shareNote('note-1', 'TEST@EXAMPLE.COM');
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(You cannot share a note with yourself|cannotShareWithSelf)$/);
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

  describe('unshareNote', () => {
    it('should unshare note successfully', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.unshareNoteInFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.unshareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(true);
      expect(localThis.deps.unshareNoteInFirestore).toHaveBeenCalledWith('note-1', 'friend@example.com', 'user-123');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.unshareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(You must be logged in to share notes|mustBeLoggedInToShare)$/);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.unshareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Sharing requires Firebase to be configured|sharingRequiresFirebase)$/);
    });

    it('should validate note ID', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result1 = await localThis.handlers.unshareNote('', 'friend@example.com');
      expect(result1.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result1.error).toMatch(/^(Invalid note ID|invalidNoteId)$/);
      
      const result2 = await localThis.handlers.unshareNote(null, 'friend@example.com');
      expect(result2.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result2.error).toMatch(/^(Invalid note ID|invalidNoteId)$/);
    });

    it('should validate email format', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.isValidEmail.mockReturnValue(false);
      
      const result = await localThis.handlers.unshareNote('note-1', 'invalid-email');
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Invalid email address|invalidEmailAddress)$/);
    });

    it('should lowercase email before unsharing', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.unshareNoteInFirestore.mockResolvedValue();
      
      await localThis.handlers.unshareNote('note-1', 'FRIEND@EXAMPLE.COM');
      
      expect(localThis.deps.unshareNoteInFirestore).toHaveBeenCalledWith('note-1', 'friend@example.com', 'user-123');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.unshareNoteInFirestore.mockRejectedValue(new Error('Unshare failed'));
      
      const result = await localThis.handlers.unshareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unshare failed');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });

    it('should return error when unshareNoteInFirestore is not available', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.unshareNoteInFirestore = null;
      
      // Recreate handlers with updated deps
      localThis.handlers = createHandlers(localThis.deps);
      
      const result = await localThis.handlers.unshareNote('note-1', 'friend@example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unshare service not available');
    });
  });

  describe('leaveSharedNote', () => {
    it('should leave shared note successfully', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.leaveSharedNoteInFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.leaveSharedNote('note-1');
      
      expect(result.success).toBe(true);
      expect(localThis.deps.leaveSharedNoteInFirestore).toHaveBeenCalledWith('note-1', 'test@example.com');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.leaveSharedNote('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(You must be logged in to share notes|mustBeLoggedInToShare)$/);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.leaveSharedNote('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(Sharing requires Firebase to be configured|sharingRequiresFirebase)$/);
    });

    it('should validate note ID', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result1 = await localThis.handlers.leaveSharedNote('');
      expect(result1.success).toBe(false);
      expect(result1.error).toMatch(/^(Invalid note ID|invalidNoteId)$/);
      
      const result2 = await localThis.handlers.leaveSharedNote(null);
      expect(result2.success).toBe(false);
      expect(result2.error).toMatch(/^(Invalid note ID|invalidNoteId)$/);
    });

    it('should require user email', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue({ uid: 'user-123', email: null });
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.leaveSharedNote('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('User email not available');
    });

    it('should lowercase email when leaving', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue({ uid: 'user-123', email: 'TEST@EXAMPLE.COM' });
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.leaveSharedNoteInFirestore.mockResolvedValue();
      
      await localThis.handlers.leaveSharedNote('note-1');
      
      expect(localThis.deps.leaveSharedNoteInFirestore).toHaveBeenCalledWith('note-1', 'test@example.com');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.leaveSharedNoteInFirestore.mockRejectedValue(new Error('Leave failed'));
      
      const result = await localThis.handlers.leaveSharedNote('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Leave failed');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });

    it('should return error when leaveSharedNoteInFirestore is not available', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.leaveSharedNoteInFirestore = null;
      
      // Recreate handlers with updated deps
      localThis.handlers = createHandlers(localThis.deps);
      
      const result = await localThis.handlers.leaveSharedNote('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Leave service not available');
    });
  });

  describe('captureScreenshot', () => {
    beforeEach(() => {
      // Add chromeTabs mock to deps
      localThis.mockChromeTabs = {
        query: jest.fn(),
        captureVisibleTab: jest.fn()
      };
      localThis.deps.chromeTabs = localThis.mockChromeTabs;
      
      // Recreate handlers with updated deps
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should capture screenshot successfully', async () => {
      const mockDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, windowId: 1 }]);
      localThis.mockChromeTabs.captureVisibleTab.mockResolvedValue(mockDataUrl);
      
      const result = await localThis.handlers.captureScreenshot();
      
      expect(result.success).toBe(true);
      expect(result.dataUrl).toBe(mockDataUrl);
      expect(localThis.mockChromeTabs.captureVisibleTab).toHaveBeenCalledWith(1, {
        format: 'png',
        quality: 100
      });
    });

    it('should return error when no active tab', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([]);
      
      const result = await localThis.handlers.captureScreenshot();
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(No active tab found|noActiveTab)$/);
    });

    it('should return error when chromeTabs is not available', async () => {
      localThis.deps.chromeTabs = null;
      localThis.handlers = createHandlers(localThis.deps);
      
      const result = await localThis.handlers.captureScreenshot();
      
      expect(result.success).toBe(false);
      // Check for either translated text or i18n key
      expect(result.error).toMatch(/^(Tabs API not available|tabsApiNotAvailable)$/);
    });

    it('should return error when capture fails', async () => {
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, windowId: 1 }]);
      localThis.mockChromeTabs.captureVisibleTab.mockRejectedValue(new Error('Capture failed'));
      
      const result = await localThis.handlers.captureScreenshot();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Capture failed');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });

    it('should be routable via handleMessage', async () => {
      const mockDataUrl = 'data:image/png;base64,test';
      localThis.mockChromeTabs.query.mockResolvedValue([{ id: 1, windowId: 1 }]);
      localThis.mockChromeTabs.captureVisibleTab.mockResolvedValue(mockDataUrl);
      
      const result = await localThis.handlers.handleMessage({ action: 'captureScreenshot' }, null);
      
      expect(result.success).toBe(true);
      expect(result.dataUrl).toBe(mockDataUrl);
    });
  });

  describe('addComment', () => {
    beforeEach(() => {
      localThis.deps.createCommentInFirestore = jest.fn();
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should add comment successfully', async () => {
      const mockComment = { id: 'comment-1', content: 'Test comment', authorId: 'user-123' };
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createCommentInFirestore.mockResolvedValue(mockComment);
      
      const result = await localThis.handlers.addComment('note-1', { content: 'Test comment' });
      
      expect(result.success).toBe(true);
      expect(result.comment).toEqual(mockComment);
      expect(localThis.deps.createCommentInFirestore).toHaveBeenCalledWith('note-1', { content: 'Test comment' }, localThis.mockUser);
    });

    it('should add reply comment successfully', async () => {
      const mockComment = { id: 'comment-2', content: 'Reply', parentId: 'comment-1' };
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createCommentInFirestore.mockResolvedValue(mockComment);
      
      const result = await localThis.handlers.addComment('note-1', { content: 'Reply', parentId: 'comment-1' });
      
      expect(result.success).toBe(true);
      expect(result.comment.parentId).toBe('comment-1');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.addComment('note-1', { content: 'Test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(You must be logged in to comment|mustBeLoggedInToComment)$/);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.addComment('note-1', { content: 'Test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(Comments require Firebase to be configured|commentsRequireFirebase)$/);
    });

    it('should return error when comment service not available', async () => {
      localThis.deps.createCommentInFirestore = undefined;
      localThis.handlers = createHandlers(localThis.deps);
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.addComment('note-1', { content: 'Test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Comment service not available');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createCommentInFirestore.mockRejectedValue(new Error('Failed to add'));
      
      const result = await localThis.handlers.addComment('note-1', { content: 'Test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to add');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });

    it('should be routable via handleMessage', async () => {
      const mockComment = { id: 'comment-1', content: 'Test' };
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.createCommentInFirestore.mockResolvedValue(mockComment);
      
      const result = await localThis.handlers.handleMessage({ 
        action: 'addComment', 
        noteId: 'note-1', 
        comment: { content: 'Test' } 
      }, null);
      
      expect(result.success).toBe(true);
      expect(result.comment).toEqual(mockComment);
    });
  });

  describe('editComment', () => {
    beforeEach(() => {
      localThis.deps.updateCommentInFirestore = jest.fn();
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should edit comment successfully', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.updateCommentInFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.editComment('note-1', 'comment-1', { content: 'Updated' });
      
      expect(result.success).toBe(true);
      expect(localThis.deps.updateCommentInFirestore).toHaveBeenCalledWith('note-1', 'comment-1', { content: 'Updated' }, 'user-123');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.editComment('note-1', 'comment-1', { content: 'Updated' });
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(You must be logged in to comment|mustBeLoggedInToComment)$/);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.editComment('note-1', 'comment-1', { content: 'Updated' });
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(Comments require Firebase to be configured|commentsRequireFirebase)$/);
    });

    it('should return error when comment service not available', async () => {
      localThis.deps.updateCommentInFirestore = undefined;
      localThis.handlers = createHandlers(localThis.deps);
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.editComment('note-1', 'comment-1', { content: 'Updated' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Comment service not available');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.updateCommentInFirestore.mockRejectedValue(new Error('Permission denied'));
      
      const result = await localThis.handlers.editComment('note-1', 'comment-1', { content: 'Updated' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });

    it('should be routable via handleMessage', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.updateCommentInFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.handleMessage({ 
        action: 'editComment', 
        noteId: 'note-1', 
        commentId: 'comment-1',
        updates: { content: 'Updated' }
      }, null);
      
      expect(result.success).toBe(true);
    });
  });

  describe('deleteCommentHandler', () => {
    beforeEach(() => {
      localThis.deps.deleteCommentFromFirestore = jest.fn();
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should delete comment successfully', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteCommentFromFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.deleteCommentHandler('note-1', 'comment-1');
      
      expect(result.success).toBe(true);
      expect(localThis.deps.deleteCommentFromFirestore).toHaveBeenCalledWith('note-1', 'comment-1', 'user-123');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.deleteCommentHandler('note-1', 'comment-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(You must be logged in to comment|mustBeLoggedInToComment)$/);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.deleteCommentHandler('note-1', 'comment-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(Comments require Firebase to be configured|commentsRequireFirebase)$/);
    });

    it('should return error when comment service not available', async () => {
      localThis.deps.deleteCommentFromFirestore = undefined;
      localThis.handlers = createHandlers(localThis.deps);
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.deleteCommentHandler('note-1', 'comment-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Comment service not available');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteCommentFromFirestore.mockRejectedValue(new Error('Not found'));
      
      const result = await localThis.handlers.deleteCommentHandler('note-1', 'comment-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not found');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });

    it('should be routable via handleMessage', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteCommentFromFirestore.mockResolvedValue();
      
      const result = await localThis.handlers.handleMessage({ 
        action: 'deleteComment', 
        noteId: 'note-1', 
        commentId: 'comment-1'
      }, null);
      
      expect(result.success).toBe(true);
    });
  });

  describe('getComments', () => {
    beforeEach(() => {
      localThis.deps.getCommentsForNoteFromFirestore = jest.fn();
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should get comments successfully', async () => {
      const mockComments = [
        { id: 'comment-1', content: 'First', authorId: 'user-1' },
        { id: 'comment-2', content: 'Second', authorId: 'user-2' }
      ];
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getCommentsForNoteFromFirestore.mockResolvedValue(mockComments);
      
      const result = await localThis.handlers.getComments('note-1');
      
      expect(result.success).toBe(true);
      expect(result.comments).toEqual(mockComments);
      expect(localThis.deps.getCommentsForNoteFromFirestore).toHaveBeenCalledWith('note-1', localThis.mockUser);
    });

    it('should return empty array when no comments', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getCommentsForNoteFromFirestore.mockResolvedValue([]);
      
      const result = await localThis.handlers.getComments('note-1');
      
      expect(result.success).toBe(true);
      expect(result.comments).toEqual([]);
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.getComments('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(You must be logged in to comment|mustBeLoggedInToComment)$/);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.getComments('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^(Comments require Firebase to be configured|commentsRequireFirebase)$/);
    });

    it('should return error when comment service not available', async () => {
      localThis.deps.getCommentsForNoteFromFirestore = undefined;
      localThis.handlers = createHandlers(localThis.deps);
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      
      const result = await localThis.handlers.getComments('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Comment service not available');
    });

    it('should return error on failure', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getCommentsForNoteFromFirestore.mockRejectedValue(new Error('Note not found'));
      
      const result = await localThis.handlers.getComments('note-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Note not found');
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });

    it('should be routable via handleMessage', async () => {
      const mockComments = [{ id: 'comment-1', content: 'Test' }];
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getCommentsForNoteFromFirestore.mockResolvedValue(mockComments);
      
      const result = await localThis.handlers.handleMessage({ 
        action: 'getComments', 
        noteId: 'note-1'
      }, null);
      
      expect(result.success).toBe(true);
      expect(result.comments).toEqual(mockComments);
    });
  });

  describe('subscribeNotes', () => {
    beforeEach(() => {
      localThis.deps.subscribeToNotesForUrl = jest.fn();
      localThis.deps.noteSubscriptions = new Map();
      localThis.mockChromeTabs = {
        query: jest.fn(),
        captureVisibleTab: jest.fn(),
        sendMessage: jest.fn()
      };
      localThis.deps.chromeTabs = localThis.mockChromeTabs;
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should subscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(mockUnsubscribe);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(result.success).toBe(true);
      expect(localThis.deps.subscribeToNotesForUrl).toHaveBeenCalledWith(
        'https://example.com',
        localThis.mockUser.uid,
        localThis.mockUser.email,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.subscribeNotes('https://example.com', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(result.success).toBe(false);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(result.success).toBe(false);
    });

    it('should clean up existing subscription before creating new one', async () => {
      const oldUnsubscribe = jest.fn();
      // Use composite key: tabId-frameId (frameId defaults to 0 for main frame)
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: oldUnsubscribe });
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(jest.fn());
      
      const sender = { tab: { id: 123 }, frameId: 0 };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      expect(oldUnsubscribe).toHaveBeenCalled();
    });

    it('should use composite key with frameId for subscriptions', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(mockUnsubscribe);
      
      // Main frame subscription (frameId = 0)
      const mainFrameSender = { tab: { id: 123 }, frameId: 0 };
      await localThis.handlers.subscribeNotes('https://example.com', mainFrameSender);
      
      // iframe subscription (frameId = 456)
      const iframeSender = { tab: { id: 123 }, frameId: 456 };
      await localThis.handlers.subscribeNotes('https://example.com/iframe', iframeSender);
      
      // Both subscriptions should exist independently
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(true);
      expect(localThis.deps.noteSubscriptions.has('123-456')).toBe(true);
    });

    it('should default frameId to 0 when not provided', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(mockUnsubscribe);
      
      // Sender without explicit frameId
      const sender = { tab: { id: 123 } };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      // Should use '123-0' as the key
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(true);
    });

    it('should send updates to specific frame using frameId option', async () => {
      let notesCallback;
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockImplementation((url, uid, email, onNotes) => {
        notesCallback = onNotes;
        return jest.fn();
      });
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({});
      
      // Subscribe from an iframe (frameId = 456)
      const sender = { tab: { id: 123 }, frameId: 456 };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      // Simulate a notes update
      const mockNotes = [{ id: 'note-1', content: 'Test' }];
      notesCallback(mockNotes);
      
      // Verify sendMessage was called with frameId option
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'notesUpdated', notes: mockNotes },
        { frameId: 456 }
      );
    });

    it('should send error to specific frame using frameId option', async () => {
      let errorCallback;
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockImplementation((url, uid, email, onNotes, onError) => {
        errorCallback = onError;
        return jest.fn();
      });
      localThis.mockChromeTabs.sendMessage.mockResolvedValue({});
      
      // Subscribe from an iframe (frameId = 789)
      const sender = { tab: { id: 123 }, frameId: 789 };
      await localThis.handlers.subscribeNotes('https://example.com', sender);
      
      // Simulate an error
      errorCallback(new Error('Subscription failed'));
      
      // Verify sendMessage was called with frameId option
      expect(localThis.mockChromeTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'subscriptionError', type: 'notes', error: 'Subscription failed' },
        { frameId: 789 }
      );
    });

    it('should be routable via handleMessage', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToNotesForUrl.mockReturnValue(jest.fn());
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.handleMessage(
        { action: 'subscribeToNotes', url: 'https://example.com' },
        sender
      );
      
      expect(result.success).toBe(true);
    });
  });

  describe('unsubscribeNotes', () => {
    beforeEach(() => {
      localThis.deps.noteSubscriptions = new Map();
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should unsubscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      // Use composite key: tabId-frameId
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: mockUnsubscribe });
      
      const sender = { tab: { id: 123 }, frameId: 0 };
      const result = await localThis.handlers.unsubscribeNotes(sender);
      
      expect(result.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(false);
    });

    it('should return success even when no subscription exists', async () => {
      const sender = { tab: { id: 123 }, frameId: 0 };
      const result = await localThis.handlers.unsubscribeNotes(sender);
      
      expect(result.success).toBe(true);
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.unsubscribeNotes({});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

    it('should be routable via handleMessage', async () => {
      const sender = { tab: { id: 123 }, frameId: 0 };
      const result = await localThis.handlers.handleMessage(
        { action: 'unsubscribeFromNotes' },
        sender
      );
      
      expect(result.success).toBe(true);
    });

    it('should only unsubscribe the specific frame', async () => {
      const mainFrameUnsubscribe = jest.fn();
      const iframeUnsubscribe = jest.fn();
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: mainFrameUnsubscribe });
      localThis.deps.noteSubscriptions.set('123-456', { unsubscribe: iframeUnsubscribe });
      
      // Unsubscribe only the iframe
      const iframeSender = { tab: { id: 123 }, frameId: 456 };
      const result = await localThis.handlers.unsubscribeNotes(iframeSender);
      
      expect(result.success).toBe(true);
      expect(iframeUnsubscribe).toHaveBeenCalled();
      expect(mainFrameUnsubscribe).not.toHaveBeenCalled();
      // Main frame subscription should still exist
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(true);
      expect(localThis.deps.noteSubscriptions.has('123-456')).toBe(false);
    });

    it('should default frameId to 0 when not provided', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.noteSubscriptions.set('123-0', { unsubscribe: mockUnsubscribe });
      
      // Sender without explicit frameId
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.unsubscribeNotes(sender);
      
      expect(result.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(localThis.deps.noteSubscriptions.has('123-0')).toBe(false);
    });
  });

  describe('subscribeCommentsHandler', () => {
    beforeEach(() => {
      localThis.deps.subscribeToComments = jest.fn();
      localThis.deps.commentSubscriptions = new Map();
      localThis.mockChromeTabs = {
        query: jest.fn(),
        captureVisibleTab: jest.fn(),
        sendMessage: jest.fn()
      };
      localThis.deps.chromeTabs = localThis.mockChromeTabs;
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should subscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToComments.mockReturnValue(mockUnsubscribe);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(true);
      expect(localThis.deps.subscribeToComments).toHaveBeenCalledWith(
        'note-1',
        localThis.mockUser,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.subscribeCommentsHandler('note-1', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.subscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(false);
    });

    it('should clean up existing subscription before creating new one', async () => {
      const oldUnsubscribe = jest.fn();
      localThis.deps.commentSubscriptions.set('123-note-1', oldUnsubscribe);
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToComments.mockReturnValue(jest.fn());
      
      const sender = { tab: { id: 123 } };
      await localThis.handlers.subscribeCommentsHandler('note-1', sender);
      
      expect(oldUnsubscribe).toHaveBeenCalled();
    });

    it('should be routable via handleMessage', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToComments.mockReturnValue(jest.fn());
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.handleMessage(
        { action: 'subscribeToComments', noteId: 'note-1' },
        sender
      );
      
      expect(result.success).toBe(true);
    });
  });

  describe('unsubscribeCommentsHandler', () => {
    beforeEach(() => {
      localThis.deps.commentSubscriptions = new Map();
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should unsubscribe successfully', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.commentSubscriptions.set('123-note-1', mockUnsubscribe);
      
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.unsubscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(localThis.deps.commentSubscriptions.has('123-note-1')).toBe(false);
    });

    it('should return success even when no subscription exists', async () => {
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.unsubscribeCommentsHandler('note-1', sender);
      
      expect(result.success).toBe(true);
    });

    it('should return error when tab ID not available', async () => {
      const result = await localThis.handlers.unsubscribeCommentsHandler('note-1', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });

    it('should be routable via handleMessage', async () => {
      const sender = { tab: { id: 123 } };
      const result = await localThis.handlers.handleMessage(
        { action: 'unsubscribeFromComments', noteId: 'note-1' },
        sender
      );
      
      expect(result.success).toBe(true);
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
      expect(typeof handlers.captureScreenshot).toBe('function');
      // Comment handlers
      expect(typeof handlers.addComment).toBe('function');
      expect(typeof handlers.editComment).toBe('function');
      expect(typeof handlers.deleteCommentHandler).toBe('function');
      expect(typeof handlers.getComments).toBe('function');
      // Subscription handlers
      expect(typeof handlers.subscribeNotes).toBe('function');
      expect(typeof handlers.unsubscribeNotes).toBe('function');
      expect(typeof handlers.subscribeCommentsHandler).toBe('function');
      expect(typeof handlers.unsubscribeCommentsHandler).toBe('function');
      // Badge management
      expect(typeof handlers.updateOrphanedBadge).toBe('function');
    });
  });
  
  describe('updateOrphanedBadge', () => {
    it('should set badge text when count > 0', async () => {
      const handlers = createHandlers(localThis.deps);
      const sender = { tab: { id: 1 } };
      
      const result = await handlers.updateOrphanedBadge(3, sender);
      
      expect(result.success).toBe(true);
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
        text: '3',
        tabId: 1
      });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: '#f59e0b',
        tabId: 1
      });
    });
    
    it('should clear badge when count is 0', async () => {
      const handlers = createHandlers(localThis.deps);
      const sender = { tab: { id: 1 } };
      
      const result = await handlers.updateOrphanedBadge(0, sender);
      
      expect(result.success).toBe(true);
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
        text: '',
        tabId: 1
      });
    });
    
    it('should handle missing tab ID', async () => {
      const handlers = createHandlers(localThis.deps);
      const sender = {}; // No tab
      
      const result = await handlers.updateOrphanedBadge(2, sender);
      
      // Should still work, just without tabId
      expect(result.success).toBe(true);
    });
  });
  
  describe('handleMessage updateOrphanedCount', () => {
    it('should route updateOrphanedCount to updateOrphanedBadge', async () => {
      const handlers = createHandlers(localThis.deps);
      const sender = { tab: { id: 1 } };
      
      const result = await handlers.handleMessage(
        { action: 'updateOrphanedCount', count: 5 },
        sender
      );
      
      expect(result.success).toBe(true);
      expect(chrome.action.setBadgeText).toHaveBeenCalled();
    });
  });
  
  describe('getTabUrl', () => {
    it('should return tab URL from sender', () => {
      const handlers = createHandlers(localThis.deps);
      const sender = { tab: { url: 'https://example.com/page' } };
      
      const result = handlers.getTabUrl(sender);
      
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/page');
    });
    
    it('should return error when tab URL not available', () => {
      const handlers = createHandlers(localThis.deps);
      const sender = { tab: {} }; // No URL
      
      const result = handlers.getTabUrl(sender);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab URL not available');
    });
    
    it('should return error when no tab in sender', () => {
      const handlers = createHandlers(localThis.deps);
      const sender = {}; // No tab
      
      const result = handlers.getTabUrl(sender);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab URL not available');
    });
  });
  
  describe('handleMessage getTabUrl', () => {
    it('should route getTabUrl message to getTabUrl handler', async () => {
      const handlers = createHandlers(localThis.deps);
      const sender = { tab: { url: 'https://example.com/iframe-test' } };
      
      const result = await handlers.handleMessage(
        { action: 'getTabUrl' },
        sender
      );
      
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/iframe-test');
    });
  });
  
  describe('getAllNotes', () => {
    it('should return all notes from local storage when not using Firebase', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: '1', ownerId: 'user-123', content: 'Note 1' },
          { id: '2', ownerId: 'user-123', content: 'Note 2' }
        ]
      });
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.getAllNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes.length).toBe(2);
    });
    
    it('should filter notes by current user', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: '1', ownerId: 'user-123', content: 'My note' },
          { id: '2', ownerId: 'other-user', content: 'Other user note' }
        ]
      });
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.getAllNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes.length).toBe(1);
      expect(result.notes[0].ownerId).toBe('user-123');
    });
    
    it('should return empty array on error', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.getAllNotes();
      
      expect(result.success).toBe(false);
      expect(result.notes).toEqual([]);
    });
  });
  
  describe('deleteAllNotes', () => {
    it('should delete all notes from local storage', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: '1', ownerId: 'user-123', content: 'Note 1' },
          { id: '2', ownerId: 'user-123', content: 'Note 2' }
        ]
      });
      localThis.mockChromeStorage.local.set.mockResolvedValue();
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.deleteAllNotes();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(localThis.mockChromeStorage.local.set).toHaveBeenCalledWith({ notes: [] });
    });
    
    it('should delete from Firebase when configured', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.deleteNoteFromFirestore.mockResolvedValue();
      localThis.mockChromeStorage.local.get.mockResolvedValue({
        notes: [
          { id: '1', ownerId: 'user-123', content: 'Note 1' }
        ]
      });
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.deleteAllNotes();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(localThis.deps.deleteNoteFromFirestore).toHaveBeenCalledWith('1', 'user-123');
    });
    
    it('should return count 0 when no notes exist', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.deleteAllNotes();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });
  
  describe('handleMessage getAllNotes', () => {
    it('should route getAllNotes message to getAllNotes handler', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.handleMessage({ action: 'getAllNotes' }, null);
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual([]);
    });
  });
  
  describe('handleMessage deleteAllNotes', () => {
    it('should route deleteAllNotes message to deleteAllNotes handler', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      localThis.mockChromeStorage.local.get.mockResolvedValue({ notes: [] });
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.handleMessage({ action: 'deleteAllNotes' }, null);
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('broadcastDisableSelectionMode', () => {
    it('should send disableSelectionMode to all frames in tab', async () => {
      const sender = { tab: { id: 123 } };
      
      // Mock chrome.webNavigation.getAllFrames
      global.chrome = {
        ...global.chrome,
        webNavigation: {
          getAllFrames: jest.fn().mockResolvedValue([
            { frameId: 0 },
            { frameId: 1 },
            { frameId: 2 }
          ])
        }
      };
      
      localThis.deps.chromeTabs = {
        sendMessage: jest.fn().mockResolvedValue({ success: true })
      };
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.broadcastDisableSelectionMode(sender);
      
      expect(result.success).toBe(true);
      expect(localThis.deps.chromeTabs.sendMessage).toHaveBeenCalledTimes(3);
      expect(localThis.deps.chromeTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'disableSelectionMode' },
        { frameId: 0 }
      );
      expect(localThis.deps.chromeTabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'disableSelectionMode' },
        { frameId: 1 }
      );
    });
    
    it('should return error when tab ID not available', async () => {
      const sender = {}; // No tab
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.broadcastDisableSelectionMode(sender);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab ID not available');
    });
    
    it('should succeed even if no frames are found', async () => {
      const sender = { tab: { id: 123 } };
      
      global.chrome = {
        ...global.chrome,
        webNavigation: {
          getAllFrames: jest.fn().mockResolvedValue([])
        }
      };
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.broadcastDisableSelectionMode(sender);
      
      expect(result.success).toBe(true);
    });
    
    it('should handle sendMessage failures gracefully', async () => {
      const sender = { tab: { id: 123 } };
      
      global.chrome = {
        ...global.chrome,
        webNavigation: {
          getAllFrames: jest.fn().mockResolvedValue([
            { frameId: 0 },
            { frameId: 1 }
          ])
        }
      };
      
      localThis.deps.chromeTabs = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Frame closed'))
      };
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.broadcastDisableSelectionMode(sender);
      
      // Should still succeed even if individual sends fail
      expect(result.success).toBe(true);
    });
  });
  
  describe('handleMessage broadcastDisableSelectionMode', () => {
    it('should route broadcastDisableSelectionMode to handler', async () => {
      const sender = { tab: { id: 456 } };
      
      global.chrome = {
        ...global.chrome,
        webNavigation: {
          getAllFrames: jest.fn().mockResolvedValue([])
        }
      };
      
      const handlers = createHandlers(localThis.deps);
      const result = await handlers.handleMessage(
        { action: 'broadcastDisableSelectionMode' },
        sender
      );
      
      expect(result.success).toBe(true);
    });
  });

  describe('getUnreadSharedCount', () => {
    beforeEach(() => {
      localThis.deps.getSharedNotesForUser = jest.fn();
      localThis.deps.chromeAction = {
        setBadgeText: jest.fn().mockResolvedValue(),
        setBadgeBackgroundColor: jest.fn().mockResolvedValue()
      };
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should return count of unread shared notes', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockResolvedValue([
        { id: 'note-1' },
        { id: 'note-2' },
        { id: 'note-3' }
      ]);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({
        [`seenSharedNotes_${localThis.mockUser.uid}`]: ['note-1']
      });
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(2); // note-2 and note-3 are unread
    });

    it('should return 0 when user is not logged in', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should return 0 when Firebase is not configured', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should return 0 when no shared notes exist', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockResolvedValue([]);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({});
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockRejectedValue(new Error('Network error'));
      
      const result = await localThis.handlers.getUnreadSharedCount();
      
      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toBe('Network error');
    });
  });

  describe('markSharedNoteRead', () => {
    beforeEach(() => {
      localThis.deps.getSharedNotesForUser = jest.fn().mockResolvedValue([]);
      localThis.deps.chromeAction = {
        setBadgeText: jest.fn().mockResolvedValue(),
        setBadgeBackgroundColor: jest.fn().mockResolvedValue()
      };
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should mark a note as read', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({
        [`seenSharedNotes_${localThis.mockUser.uid}`]: ['existing-note']
      });
      localThis.deps.chromeStorage.local.set.mockResolvedValue();
      
      const result = await localThis.handlers.markSharedNoteRead('new-note');
      
      expect(result.success).toBe(true);
      expect(localThis.deps.chromeStorage.local.set).toHaveBeenCalledWith({
        [`seenSharedNotes_${localThis.mockUser.uid}`]: ['existing-note', 'new-note']
      });
    });

    it('should not duplicate already-read note', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({
        [`seenSharedNotes_${localThis.mockUser.uid}`]: ['note-1']
      });
      
      const result = await localThis.handlers.markSharedNoteRead('note-1');
      
      expect(result.success).toBe(true);
      expect(localThis.deps.chromeStorage.local.set).not.toHaveBeenCalled();
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.markSharedNoteRead('note-1');
      
      expect(result.success).toBe(false);
    });

    it('should require note ID', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      
      const result = await localThis.handlers.markSharedNoteRead(null);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Note ID required');
    });
  });

  describe('subscribeToSharedNotesGlobal', () => {
    beforeEach(() => {
      localThis.deps.subscribeToSharedNotes = jest.fn();
      localThis.deps.getSharedNotesForUser = jest.fn().mockResolvedValue([]);
      localThis.deps.sharedNotesSubscription = { current: null };
      localThis.deps.chromeAction = {
        setBadgeText: jest.fn().mockResolvedValue(),
        setBadgeBackgroundColor: jest.fn().mockResolvedValue()
      };
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should subscribe to shared notes', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToSharedNotes.mockReturnValue(() => {});
      localThis.deps.chromeStorage.local.get.mockResolvedValue({});
      
      const result = await localThis.handlers.subscribeToSharedNotesGlobal();
      
      expect(result.success).toBe(true);
      expect(localThis.deps.subscribeToSharedNotes).toHaveBeenCalledWith(
        localThis.mockUser.email,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should require login', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.subscribeToSharedNotesGlobal();
      
      expect(result.success).toBe(false);
    });

    it('should require Firebase configuration', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.subscribeToSharedNotesGlobal();
      
      expect(result.success).toBe(false);
    });

    it('should clean up existing subscription before creating new one', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.sharedNotesSubscription.current = mockUnsubscribe;
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.subscribeToSharedNotes.mockReturnValue(() => {});
      localThis.deps.chromeStorage.local.get.mockResolvedValue({});
      
      await localThis.handlers.subscribeToSharedNotesGlobal();
      
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('unsubscribeFromSharedNotesGlobal', () => {
    beforeEach(() => {
      localThis.deps.sharedNotesSubscription = { current: null };
      localThis.deps.chromeAction = {
        setBadgeText: jest.fn().mockResolvedValue(),
        setBadgeBackgroundColor: jest.fn().mockResolvedValue()
      };
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should unsubscribe and clear badge', async () => {
      const mockUnsubscribe = jest.fn();
      localThis.deps.sharedNotesSubscription.current = mockUnsubscribe;
      
      const result = await localThis.handlers.unsubscribeFromSharedNotesGlobal();
      
      expect(result.success).toBe(true);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(localThis.deps.chromeAction.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('should succeed even if no subscription exists', async () => {
      localThis.deps.sharedNotesSubscription.current = null;
      
      const result = await localThis.handlers.unsubscribeFromSharedNotesGlobal();
      
      expect(result.success).toBe(true);
    });
  });

  describe('updateUnreadSharedBadge', () => {
    beforeEach(() => {
      localThis.deps.getSharedNotesForUser = jest.fn().mockResolvedValue([]);
      localThis.deps.chromeAction = {
        setBadgeText: jest.fn().mockResolvedValue(),
        setBadgeBackgroundColor: jest.fn().mockResolvedValue()
      };
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should set badge when there are unread notes', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockResolvedValue([
        { id: 'note-1' },
        { id: 'note-2' }
      ]);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({});
      
      const result = await localThis.handlers.updateUnreadSharedBadge();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(localThis.deps.chromeAction.setBadgeText).toHaveBeenCalledWith({ text: '2' });
      expect(localThis.deps.chromeAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3b82f6' });
    });

    it('should clear badge when no unread notes', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockResolvedValue([]);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({});
      
      const result = await localThis.handlers.updateUnreadSharedBadge();
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(localThis.deps.chromeAction.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('getUnreadSharedNotes', () => {
    beforeEach(() => {
      localThis.deps.getSharedNotesForUser = jest.fn().mockResolvedValue([]);
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should return unread shared notes', async () => {
      const sharedNotes = [
        { id: 'note-1', content: 'Note 1', url: 'https://example.com' },
        { id: 'note-2', content: 'Note 2', url: 'https://example.com/page' },
        { id: 'note-3', content: 'Note 3', url: 'https://other.com' }
      ];
      
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockResolvedValue(sharedNotes);
      // note-1 has been seen, so only note-2 and note-3 should be returned
      localThis.deps.chromeStorage.local.get.mockResolvedValue({
        [`seenSharedNotes_${localThis.mockUser.uid}`]: ['note-1']
      });
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(2);
      expect(result.notes.map(note => note.id)).toEqual(['note-2', 'note-3']);
    });

    it('should return empty array when user not logged in', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(null);
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual([]);
    });

    it('should return empty array when user has no email', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue({ uid: 'user-123', email: null });
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual([]);
    });

    it('should return empty array when Firebase not configured', async () => {
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(false);
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes).toEqual([]);
    });

    it('should return all notes when none are seen', async () => {
      const sharedNotes = [
        { id: 'note-1', content: 'Note 1' },
        { id: 'note-2', content: 'Note 2' }
      ];
      
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockResolvedValue(sharedNotes);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({});
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(2);
    });

    it('should handle errors gracefully', async () => {
      localThis.deps.getCurrentUser.mockRejectedValue(new Error('Auth error'));
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      
      expect(result.success).toBe(false);
      expect(result.notes).toEqual([]);
      expect(localThis.mockLog.error).toHaveBeenCalled();
    });
  });

  describe('handleMessage - getUnreadSharedNotes', () => {
    beforeEach(() => {
      localThis.deps.getSharedNotesForUser = jest.fn().mockResolvedValue([]);
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should route getUnreadSharedNotes action correctly', async () => {
      const sharedNotes = [{ id: 'note-1', content: 'Test' }];
      
      localThis.deps.getCurrentUser.mockResolvedValue(localThis.mockUser);
      localThis.deps.isFirebaseConfigured.mockReturnValue(true);
      localThis.deps.getSharedNotesForUser.mockResolvedValue(sharedNotes);
      localThis.deps.chromeStorage.local.get.mockResolvedValue({});
      
      const result = await localThis.handlers.handleMessage({ action: 'getUnreadSharedNotes' }, null);
      
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(1);
    });
  });

  describe('handleMessage - injectContentScript', () => {
    beforeEach(() => {
      localThis.deps.chromeTabs = {
        sendMessage: jest.fn()
      };
      localThis.handlers = createHandlers(localThis.deps);
    });

    it('should inject content scripts successfully with allFrames', async () => {
      localThis.deps.chromeTabs.sendMessage.mockRejectedValue(new Error('No receiver')); // ping fails
      globalThis.chrome.scripting = {
        executeScript: jest.fn().mockResolvedValue([{ result: true }])
      };
      
      const result = await localThis.handlers.handleMessage(
        { action: 'injectContentScript', tabId: 1, url: 'https://example.com' },
        null
      );
      
      expect(result.success).toBe(true);
      expect(result.injected).toBe(true);
      expect(globalThis.chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
      // Verify allFrames: true is set for iframe support
      expect(globalThis.chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ tabId: 1, allFrames: true })
        })
      );
    });

    it('should return alreadyInjected when content script responds to ping', async () => {
      localThis.deps.chromeTabs.sendMessage.mockResolvedValue({ success: true }); // ping succeeds
      
      const result = await localThis.handlers.handleMessage(
        { action: 'injectContentScript', tabId: 1, url: 'https://example.com' },
        null
      );
      
      expect(result.success).toBe(true);
      expect(result.alreadyInjected).toBe(true);
    });

    it('should return error for restricted URLs', async () => {
      const result = await localThis.handlers.handleMessage(
        { action: 'injectContentScript', tabId: 1, url: 'chrome://extensions' },
        null
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Restricted URL');
    });

    it('should return error for empty URL', async () => {
      const result = await localThis.handlers.handleMessage(
        { action: 'injectContentScript', tabId: 1, url: '' },
        null
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Restricted URL');
    });

    it('should handle injection failure gracefully', async () => {
      localThis.deps.chromeTabs.sendMessage.mockRejectedValue(new Error('No receiver'));
      globalThis.chrome.scripting = {
        executeScript: jest.fn().mockRejectedValue(new Error('Injection failed'))
      };
      
      const result = await localThis.handlers.handleMessage(
        { action: 'injectContentScript', tabId: 1, url: 'https://example.com' },
        null
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Injection failed');
    });
  });
});
