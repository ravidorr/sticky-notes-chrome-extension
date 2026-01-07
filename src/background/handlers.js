/**
 * Background Script Message Handlers
 * Extracted for testability with dependency injection
 * 
 * Note: Firebase and Chrome API dependencies are injected to enable testing.
 * The index.js file provides the actual implementations.
 */

import { generateId as defaultGenerateId, isValidEmail as defaultIsValidEmail } from '../shared/utils.js';
import { backgroundLogger as defaultLog } from '../shared/logger.js';

/**
 * Create handlers with injected dependencies
 * @param {Object} deps - Dependencies
 * @returns {Object} Handler functions
 */
export function createHandlers(deps = {}) {
  const {
    signInWithGoogle,
    signOut,
    getCurrentUser,
    createNote,
    getNotesForUrl,
    updateNoteInFirestore,
    deleteNoteFromFirestore,
    shareNoteInFirestore,
    isFirebaseConfigured,
    generateId = defaultGenerateId,
    isValidEmail = defaultIsValidEmail,
    log = defaultLog,
    chromeStorage = typeof chrome !== 'undefined' ? chrome.storage : null
  } = deps;

  /**
   * Handle incoming messages
   * @param {Object} message - Message object
   * @param {Object} _sender - Sender info
   * @returns {Promise<Object>} Response
   */
  async function handleMessage(message, _sender) {
    switch (message.action) {
      case 'login':
        return handleLogin();
      
      case 'logout':
        return handleLogout();
      
      case 'getNotes':
        return getNotes(message.url);
      
      case 'saveNote':
        return saveNote(message.note);
      
      case 'updateNote':
        return updateNote(message.note);
      
      case 'deleteNote':
        return deleteNote(message.noteId);
      
      case 'shareNote':
        return shareNote(message.noteId, message.email);
      
      case 'getUser':
        return getUser();
      
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  /**
   * Handle login
   */
  async function handleLogin() {
    try {
      const user = await signInWithGoogle();
      return { success: true, user };
    } catch (error) {
      log.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle logout
   */
  async function handleLogout() {
    try {
      await signOut();
      return { success: true };
    } catch (error) {
      log.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current user
   */
  async function getUser() {
    try {
      const user = await getCurrentUser();
      return { success: true, user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get notes for a URL
   * Uses Firestore if configured, otherwise falls back to local storage
   * @param {string} url - Page URL
   */
  async function getNotes(url) {
    try {
      const user = await getCurrentUser();
      log.debug(' getNotes called with URL:', url);
      log.debug(' Current user:', user ? { uid: user.uid, email: user.email } : 'null');
      log.debug(' Firebase configured:', isFirebaseConfigured());
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          log.debug(' Querying Firestore for notes...');
          const notes = await getNotesForUrl(url, user.uid);
          log.debug(' Firestore returned', notes.length, 'notes:', notes);
          return { success: true, notes };
        } catch (error) {
          log.warn(' Firestore query failed, falling back to local storage:', error);
        }
      }
      
      // Fallback to local storage
      const result = await chromeStorage.local.get(['notes']);
      const allNotes = result.notes || [];
      
      // Filter notes for the given URL
      const pageUrl = new URL(url);
      const pageNotes = allNotes.filter(note => {
        try {
          const noteUrl = new URL(note.url);
          return noteUrl.origin + noteUrl.pathname === pageUrl.origin + pageUrl.pathname;
        } catch {
          return false;
        }
      });
      
      return { success: true, notes: pageNotes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Save a new note
   * Uses Firestore if configured, otherwise falls back to local storage
   * @param {Object} note - Note object
   */
  async function saveNote(note) {
    try {
      const user = await getCurrentUser();
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          const newNote = await createNote(note, user.uid);
          return { success: true, note: newNote };
        } catch (error) {
          log.warn('Firestore save failed, falling back to local storage:', error);
        }
      }
      
      // Fallback to local storage
      const result = await chromeStorage.local.get(['notes']);
      const notes = result.notes || [];
      
      // Add note with generated ID and timestamps
      const newNote = {
        ...note,
        id: generateId('note'),
        ownerId: user?.uid || 'local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      notes.push(newNote);
      await chromeStorage.local.set({ notes });
      
      return { success: true, note: newNote };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update an existing note
   * Uses Firestore if configured, otherwise falls back to local storage
   * @param {Object} note - Note object with ID
   */
  async function updateNote(note) {
    try {
      const user = await getCurrentUser();
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          await updateNoteInFirestore(note.id, note, user.uid);
          return { success: true, note };
        } catch (error) {
          log.warn('Firestore update failed, falling back to local storage:', error);
        }
      }
      
      // Fallback to local storage
      const result = await chromeStorage.local.get(['notes']);
      const notes = result.notes || [];
      
      const index = notes.findIndex(item => item.id === note.id);
      if (index === -1) {
        return { success: false, error: 'Note not found' };
      }
      
      notes[index] = {
        ...notes[index],
        ...note,
        updatedAt: new Date().toISOString()
      };
      
      await chromeStorage.local.set({ notes });
      
      return { success: true, note: notes[index] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a note
   * Uses Firestore if configured, otherwise falls back to local storage
   * @param {string} noteId - Note ID
   */
  async function deleteNote(noteId) {
    try {
      const user = await getCurrentUser();
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          await deleteNoteFromFirestore(noteId, user.uid);
          return { success: true };
        } catch (error) {
          log.warn('Firestore delete failed, falling back to local storage:', error);
        }
      }
      
      // Fallback to local storage
      const result = await chromeStorage.local.get(['notes']);
      const notes = result.notes || [];
      
      const filteredNotes = notes.filter(item => item.id !== noteId);
      
      if (filteredNotes.length === notes.length) {
        return { success: false, error: 'Note not found' };
      }
      
      await chromeStorage.local.set({ notes: filteredNotes });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Share a note with another user
   * @param {string} noteId - Note ID
   * @param {string} email - Email of user to share with
   */
  async function shareNote(noteId, email) {
    try {
      const user = await getCurrentUser();
      
      if (!user) {
        return { success: false, error: 'You must be logged in to share notes' };
      }
      
      if (!isFirebaseConfigured()) {
        return { success: false, error: 'Sharing requires Firebase to be configured' };
      }
      
      // Validate noteId format
      if (!noteId || typeof noteId !== 'string' || noteId.length === 0) {
        return { success: false, error: 'Invalid note ID' };
      }
      
      // Validate email format (server-side validation)
      if (!isValidEmail(email)) {
        return { success: false, error: 'Invalid email address' };
      }
      
      // Prevent sharing with yourself
      if (email.toLowerCase() === user.email?.toLowerCase()) {
        return { success: false, error: 'You cannot share a note with yourself' };
      }
      
      await shareNoteInFirestore(noteId, email.toLowerCase(), user.uid);
      
      return { success: true };
    } catch (error) {
      log.error('Share note error:', error);
      return { success: false, error: error.message };
    }
  }

  return {
    handleMessage,
    handleLogin,
    handleLogout,
    getUser,
    getNotes,
    saveNote,
    updateNote,
    deleteNote,
    shareNote
  };
}

// For backwards compatibility - create handlers with default deps
// This will be used by index.js after providing the real dependencies
export const defaultHandlers = createHandlers();
