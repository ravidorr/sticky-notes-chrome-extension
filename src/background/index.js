/**
 * Background Service Worker
 * Handles authentication, storage, and message passing
 */

import { 
  signInWithGoogle, 
  signOut, 
  getCurrentUser, 
  isAuthConfigured 
} from '../firebase/auth.js';
import { 
  createNote, 
  getNotesForUrl, 
  updateNote as updateNoteInFirestore, 
  deleteNote as deleteNoteFromFirestore,
  shareNote as shareNoteInFirestore
} from '../firebase/notes.js';
import { initializeFirebase, isFirebaseConfigured } from '../firebase/config.js';
import { generateId, isValidEmail, normalizeUrl } from '../shared/utils.js';

// Initialize Firebase if configured
if (isFirebaseConfigured()) {
  initializeFirebase();
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  // Return true to indicate async response
  return true;
});

/**
 * Handle incoming messages
 * @param {Object} message - Message object
 * @param {Object} sender - Sender info
 * @returns {Promise<Object>} Response
 */
async function handleMessage(message, sender) {
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
    console.error('Login error:', error);
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
    console.error('Logout error:', error);
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
    console.log('[Background] getNotes called with URL:', url);
    console.log('[Background] Current user:', user ? { uid: user.uid, email: user.email } : 'null');
    console.log('[Background] Firebase configured:', isFirebaseConfigured());
    
    // Try Firestore first if configured and user is logged in
    if (isFirebaseConfigured() && user) {
      try {
        console.log('[Background] Querying Firestore for notes...');
        const notes = await getNotesForUrl(url, user.uid);
        console.log('[Background] Firestore returned', notes.length, 'notes:', notes);
        return { success: true, notes };
      } catch (error) {
        console.warn('[Background] Firestore query failed, falling back to local storage:', error);
      }
    }
    
    // Fallback to local storage
    const result = await chrome.storage.local.get(['notes']);
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
        console.warn('Firestore save failed, falling back to local storage:', error);
      }
    }
    
    // Fallback to local storage
    const result = await chrome.storage.local.get(['notes']);
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
    await chrome.storage.local.set({ notes });
    
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
        console.warn('Firestore update failed, falling back to local storage:', error);
      }
    }
    
    // Fallback to local storage
    const result = await chrome.storage.local.get(['notes']);
    const notes = result.notes || [];
    
    const index = notes.findIndex(n => n.id === note.id);
    if (index === -1) {
      return { success: false, error: 'Note not found' };
    }
    
    notes[index] = {
      ...notes[index],
      ...note,
      updatedAt: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ notes });
    
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
        console.warn('Firestore delete failed, falling back to local storage:', error);
      }
    }
    
    // Fallback to local storage
    const result = await chrome.storage.local.get(['notes']);
    const notes = result.notes || [];
    
    const filteredNotes = notes.filter(n => n.id !== noteId);
    
    if (filteredNotes.length === notes.length) {
      return { success: false, error: 'Note not found' };
    }
    
    await chrome.storage.local.set({ notes: filteredNotes });
    
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
    
    // SECURITY NOTE: Currently storing email in sharedWith array.
    // For production, implement a Cloud Function to:
    // 1. Look up the target user by email
    // 2. Verify they exist in the system
    // 3. Store their Firebase UID instead of email
    // 4. Send notification to the target user
    await shareNoteInFirestore(noteId, email.toLowerCase(), user.uid);
    
    return { success: true };
  } catch (error) {
    console.error('Share note error:', error);
    return { success: false, error: error.message };
  }
}

// generateId is now imported from shared/utils.js

// Listen for tab updates to inject content scripts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Notify content script about page load
    chrome.tabs.sendMessage(tabId, { action: 'pageLoaded', url: tab.url })
      .catch(() => {
        // Content script might not be loaded yet, that's okay
      });
  }
});

// Listen for history state updates (SPA navigation)
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  chrome.tabs.sendMessage(details.tabId, { 
    action: 'urlChanged', 
    url: details.url 
  }).catch(() => {
    // Content script might not be loaded yet
  });
});

// Log when service worker starts
console.log('Sticky Notes background service worker started');
console.log('Firebase configured:', isFirebaseConfigured());
console.log('Auth configured:', isAuthConfigured());
