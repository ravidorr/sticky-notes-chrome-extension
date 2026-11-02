/**
 * Background Script Message Handlers
 * Extracted for testability with dependency injection
 * 
 * Note: Firebase and Chrome API dependencies are injected to enable testing.
 * The index.js file provides the actual implementations.
 */

import { generateId as defaultGenerateId, isValidEmail as defaultIsValidEmail } from '../shared/utils.js';
import { backgroundLogger as defaultLog } from '../shared/logger.js';
import { t } from '../shared/i18n.js';

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
    unshareNoteInFirestore,
    leaveSharedNoteInFirestore,
    isFirebaseConfigured,
    // Comment service functions
    createCommentInFirestore,
    getCommentsForNoteFromFirestore,
    updateCommentInFirestore,
    deleteCommentFromFirestore,
    // Real-time subscription functions
    subscribeToNotesForUrl,
    subscribeToComments,
    // Global shared notes subscription
    subscribeToSharedNotes,
    getSharedNotesForUser,
    noteSubscriptions = new Map(),
    commentSubscriptions = new Map(),
    sharedNotesSubscription = { current: null },
    subscriptionStore = null,
    generateId = defaultGenerateId,
    isValidEmail = defaultIsValidEmail,
    log = defaultLog,
    chromeStorage = typeof chrome !== 'undefined' ? chrome.storage : null,
    chromeTabs = typeof chrome !== 'undefined' ? chrome.tabs : null,
    chromeAction = typeof chrome !== 'undefined' ? chrome.action : null
  } = deps;

  /**
   * Handle incoming messages
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info (contains tab info)
   * @returns {Promise<Object>} Response
   */
  async function handleMessage(message, sender) {
    log.debug('Handling message action:', message.action);
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
      
      case 'unshareNote':
        return unshareNote(message.noteId, message.email);
      
      case 'leaveSharedNote':
        return leaveSharedNote(message.noteId);
      
      case 'getUser':
        return getUser();
      
      case 'injectContentScript':
        return injectContentScriptIntoTab(message.tabId, message.url);
      
      case 'captureScreenshot':
        return captureScreenshot();
      
      // Comment actions
      case 'addComment':
        return addComment(message.noteId, message.comment);
      
      case 'editComment':
        return editComment(message.noteId, message.commentId, message.updates);
      
      case 'deleteComment':
        return deleteCommentHandler(message.noteId, message.commentId);
      
      case 'getComments':
        return getComments(message.noteId);
      
      // Real-time subscription actions
      case 'subscribeToNotes':
        return subscribeNotes(message.url, sender);
      
      case 'unsubscribeFromNotes':
        return unsubscribeNotes(sender);
      
      case 'subscribeToComments':
        return subscribeCommentsHandler(message.noteId, sender);
      
      case 'unsubscribeFromComments':
        return unsubscribeCommentsHandler(message.noteId, sender);
      
      // Real-time sync health (set when a worker restart could not restore every subscription)
      case 'getRealtimeSyncStatus':
        return getRealtimeSyncStatus();
      
      // Badge management for orphaned notes
      case 'updateOrphanedCount':
        return updateOrphanedBadge(message.count, sender);
      
      // Tab URL for iframe support
      case 'getTabUrl':
        return getTabUrl(sender);
      
      case 'getAllNotes':
        return getAllNotes();
      
      case 'deleteAllNotes':
        return deleteAllNotes();
      
      // Selection mode broadcast (for iframe support)
      case 'broadcastDisableSelectionMode':
        return broadcastDisableSelectionMode(sender);
      
      // Unread shared notes badge management
      case 'getUnreadSharedCount':
        return getUnreadSharedCount();
      
      case 'getUnreadSharedNotes':
        return getUnreadSharedNotes();
      
      case 'markSharedNoteRead':
        return markSharedNoteRead(message.noteId);
      
      case 'subscribeToSharedNotesGlobal':
        return subscribeToSharedNotesGlobal();
      
      case 'unsubscribeFromSharedNotesGlobal':
        return unsubscribeFromSharedNotesGlobal();
      
      default:
        log.warn('Unknown action received:', message.action, 'Full message:', JSON.stringify(message));
        return { success: false, error: t('unknownAction') };
    }
  }
  
  /**
   * Update extension icon badge for orphaned notes
   * @param {number} count - Number of orphaned notes
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Object} Result
   */
  async function updateOrphanedBadge(count, sender) {
    try {
      const tabId = sender?.tab?.id;
      
      if (count > 0) {
        // Show badge with count
        await chrome.action.setBadgeText({ 
          text: count.toString(),
          tabId: tabId 
        });
        await chrome.action.setBadgeBackgroundColor({ 
          color: '#f59e0b', // Orange/amber warning color
          tabId: tabId 
        });
      } else {
        // Clear badge
        await chrome.action.setBadgeText({ 
          text: '',
          tabId: tabId 
        });
      }
      
      return { success: true };
    } catch (error) {
      log.error('Error updating orphaned badge:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the tab URL for iframe support
   * Returns the main page URL even when called from an iframe
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Object} Result with tab URL
   */
  function getTabUrl(sender) {
    const tabUrl = sender?.tab?.url;
    if (!tabUrl) {
      return { success: false, error: 'Tab URL not available' };
    }
    return { success: true, url: tabUrl };
  }

  /**
   * Broadcast disableSelectionMode to all frames in the tab
   * This ensures all frames (main + iframes) exit selection mode when ESC is pressed
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Promise<Object>} Result
   */
  async function broadcastDisableSelectionMode(sender) {
    try {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      
      log.debug('Broadcasting disableSelectionMode to all frames in tab', tabId);
      
      // Get all frames in the tab
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      
      if (!frames || frames.length === 0) {
        return { success: true }; // No frames to notify
      }
      
      // Send to each frame
      const sendPromises = frames.map(async (frame) => {
        try {
          await chromeTabs.sendMessage(tabId, { action: 'disableSelectionMode' }, { frameId: frame.frameId });
          log.debug('Sent disableSelectionMode to frame', frame.frameId);
        } catch {
          // Frame might not have content script or is already closed, that's okay
        }
      });
      
      await Promise.all(sendPromises);
      
      return { success: true };
    } catch (error) {
      log.error('Broadcast disableSelectionMode error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Migrate local notes to Firebase after user login
   * @param {Object} user - The logged in user
   * @returns {Promise<Object>} Migration result with count of migrated notes
   */
  async function migrateLocalNotesToFirebase(user) {
    if (!isFirebaseConfigured() || !user) {
      return { migrated: 0 };
    }
    
    try {
      // Get all notes from local storage
      const result = await chromeStorage.local.get(['notes']);
      const localNotes = result.notes || [];
      
      if (localNotes.length === 0) {
        log.debug('No local notes to migrate');
        return { migrated: 0 };
      }
      
      log.debug(`Found ${localNotes.length} local notes to migrate`);
      
      let migratedCount = 0;
      const failedNotes = [];
      
      // Migrate each note to Firebase
      for (const note of localNotes) {
        try {
          // Create note in Firebase with the user's ID
          // Remove the old local ID so Firebase generates a new one
          const noteToMigrate = {
            url: note.url,
            selector: note.selector,
            content: note.content,
            theme: note.theme || 'yellow',
            position: note.position || { anchor: 'top-right' },
            anchorText: note.anchorText || '',
            metadata: note.metadata || {},
            createdAt: note.createdAt || new Date().toISOString()
          };
          
          await createNote(noteToMigrate, user.uid, user.email);
          migratedCount++;
          log.debug(`Migrated note: ${note.id}`);
        } catch (error) {
          log.error(`Failed to migrate note ${note.id}:`, error);
          failedNotes.push(note);
        }
      }
      
      // Clear local notes only if all migrations succeeded
      if (failedNotes.length === 0) {
        await chromeStorage.local.remove(['notes']);
        log.debug('Cleared local notes after successful migration');
      } else {
        // Keep only the failed notes in local storage
        await chromeStorage.local.set({ notes: failedNotes });
        log.warn(`Kept ${failedNotes.length} notes in local storage due to migration failures`);
      }
      
      log.debug(`Migration complete: ${migratedCount} notes migrated`);
      return { migrated: migratedCount, failed: failedNotes.length };
    } catch (error) {
      log.error('Migration error:', error);
      return { migrated: 0, error: error.message };
    }
  }
  
  /**
   * Get the current user only when Firebase is configured.
   * Avoids loading the Firebase SDK for local-only usage.
   * @returns {Promise<Object|null>}
   */
  async function getUserIfConfigured() {
    const firebaseConfigured = isFirebaseConfigured();
    if (firebaseConfigured === false) {
      if (chromeStorage?.local?.get) {
        try {
          const result = await chromeStorage.local.get(['user']);
          return result.user || null;
        } catch (error) {
          log.warn('Failed to read cached user:', error);
        }
      }
      return null;
    }
    return getCurrentUser();
  }

  /**
   * Handle login
   */
  async function handleLogin() {
    try {
      const user = await signInWithGoogle();
      
      // Migrate local notes to Firebase after successful login
      const migrationResult = await migrateLocalNotesToFirebase(user);
      if (migrationResult.migrated > 0) {
        log.debug(`Migrated ${migrationResult.migrated} local notes to Firebase`);
      }
      
      // Subscribe to global shared notes after login
      if (user && user.email) {
        await subscribeToSharedNotesGlobal();
      }
      
      return { success: true, user, migration: migrationResult };
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
      // Unsubscribe from global shared notes before logout
      await unsubscribeFromSharedNotesGlobal();
      
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
      const user = await getUserIfConfigured();
      return { success: true, user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Inject content script into a tab
   * Called after popup has already obtained permission
   * @param {number} tabId - Tab ID
   * @param {string} url - Tab URL
   * @returns {Promise<Object>} Result
   */
  async function injectContentScriptIntoTab(tabId, url) {
    try {
      // Skip restricted URLs
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
          url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('moz-extension://')) {
        return { success: false, error: 'Restricted URL' };
      }

      // Check if already injected
      try {
        await chromeTabs.sendMessage(tabId, { action: 'ping' });
        return { success: true, alreadyInjected: true };
      } catch {
        // Not injected, proceed
      }

      // Inject content scripts (permission should already be granted by popup)
      // allFrames: true is required to inject into iframes, matching the old declarative manifest
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['src/content/pageContext.js'],
        world: 'MAIN'
      });
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['src/content/content.js']
      });
      
      return { success: true, injected: true };
    } catch (error) {
      log.error('Failed to inject content script:', error);
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
      const user = await getUserIfConfigured();
      log.debug(' getNotes called with URL:', url);
      log.debug(' Current user:', user ? { uid: user.uid, email: user.email } : 'null');
      log.debug(' Firebase configured:', isFirebaseConfigured());
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          log.debug(' Querying Firestore for notes...');
          log.debug(' User:', { uid: user.uid, email: user.email });
          const notes = await getNotesForUrl(url, user.uid, user.email);
          log.debug(' Firestore returned', notes.length, 'notes:', notes);
          return { success: true, notes };
        } catch (error) {
          log.error(' Firestore query failed:', error.message);
          log.error(' Full error:', error);
          // Check if this is a missing index error
          if (error.message && error.message.includes('index')) {
            log.error(' This appears to be a missing Firestore index error. Please create the required indexes in Firebase Console.');
          }
          log.warn(' Falling back to local storage');
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
      const user = await getUserIfConfigured();
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          const newNote = await createNote(note, user.uid, user.email);
          return { success: true, note: newNote };
        } catch (error) {
          log.error('Firestore save failed, falling back to local storage:', error);
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
        ownerEmail: user?.email || null,
        isHidden: note.isHidden || false,
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
      const user = await getUserIfConfigured();
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          await updateNoteInFirestore(note.id, note, user.uid);
          return { success: true, note };
        } catch (error) {
          log.error('Firestore update failed, falling back to local storage:', error);
        }
      }
      
      // Fallback to local storage
      const result = await chromeStorage.local.get(['notes']);
      const notes = result.notes || [];
      
      const index = notes.findIndex(item => item.id === note.id);
      if (index === -1) {
        return { success: false, error: t('noteNotFound') };
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
      const user = await getUserIfConfigured();
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        try {
          await deleteNoteFromFirestore(noteId, user.uid);
          return { success: true };
        } catch (error) {
          // Check for permission errors - don't fall back to local storage for these
          const errorMessage = error.message || '';
          if (errorMessage.includes('Only the owner can delete') || 
              errorMessage.includes('Permission denied')) {
            // Return the translated version of the permission error
            return { success: false, error: t('onlyOwnerCanDelete') };
          }
          // For other errors (network issues, etc.), fall back to local storage
          log.error('Firestore delete failed, falling back to local storage:', error);
        }
      }
      
      // Fallback to local storage
      const result = await chromeStorage.local.get(['notes']);
      const notes = result.notes || [];
      
      const filteredNotes = notes.filter(item => item.id !== noteId);
      
      if (filteredNotes.length === notes.length) {
        return { success: false, error: t('noteNotFound') };
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
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('sharingRequiresFirebase') };
      }

      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToShare') };
      }
      
      // Validate noteId format
      if (!noteId || typeof noteId !== 'string' || noteId.length === 0) {
        return { success: false, error: t('invalidNoteId') };
      }
      
      // Validate email format (server-side validation)
      if (!isValidEmail(email)) {
        return { success: false, error: t('invalidEmailAddress') };
      }
      
      // Prevent sharing with yourself
      if (email.toLowerCase() === user.email?.toLowerCase()) {
        return { success: false, error: t('cannotShareWithSelf') };
      }
      
      await shareNoteInFirestore(noteId, email.toLowerCase(), user.uid);
      
      return { success: true };
    } catch (error) {
      log.error('Share note error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unshare a note (remove a user from shared list)
   * @param {string} noteId - Note ID
   * @param {string} email - Email of user to remove from sharing
   */
  async function unshareNote(noteId, email) {
    try {
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('sharingRequiresFirebase') };
      }

      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToShare') };
      }
      
      // Validate noteId format
      if (!noteId || typeof noteId !== 'string' || noteId.length === 0) {
        return { success: false, error: t('invalidNoteId') };
      }
      
      // Validate email format (server-side validation)
      if (!isValidEmail(email)) {
        return { success: false, error: t('invalidEmailAddress') };
      }
      
      if (!unshareNoteInFirestore) {
        return { success: false, error: 'Unshare service not available' };
      }
      
      await unshareNoteInFirestore(noteId, email.toLowerCase(), user.uid);
      
      return { success: true };
    } catch (error) {
      log.error('Unshare note error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Leave a shared note (remove yourself from the shared list)
   * @param {string} noteId - Note ID
   */
  async function leaveSharedNote(noteId) {
    try {
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('sharingRequiresFirebase') };
      }

      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToShare') };
      }
      
      // Validate noteId format
      if (!noteId || typeof noteId !== 'string' || noteId.length === 0) {
        return { success: false, error: t('invalidNoteId') };
      }
      
      if (!user.email) {
        return { success: false, error: 'User email not available' };
      }
      
      if (!leaveSharedNoteInFirestore) {
        return { success: false, error: 'Leave service not available' };
      }
      
      await leaveSharedNoteInFirestore(noteId, user.email.toLowerCase());
      
      return { success: true };
    } catch (error) {
      log.error('Leave shared note error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Capture a screenshot of the current tab
   * @returns {Promise<Object>} Result with dataUrl or error
   */
  async function captureScreenshot() {
    try {
      if (!chromeTabs) {
        return { success: false, error: t('tabsApiNotAvailable') };
      }
      
      // Get the active tab
      const [tab] = await chromeTabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        return { success: false, error: t('noActiveTab') };
      }
      
      // Capture the visible tab
      const dataUrl = await chromeTabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 100
      });
      
      return { success: true, dataUrl };
    } catch (error) {
      log.error('Screenshot capture error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add a comment to a note
   * @param {string} noteId - Note ID
   * @param {Object} commentData - Comment data { content, parentId }
   * @returns {Promise<Object>} Result with created comment
   */
  async function addComment(noteId, commentData) {
    try {
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('commentsRequireFirebase') };
      }

      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToComment') };
      }
      
      if (!createCommentInFirestore) {
        return { success: false, error: 'Comment service not available' };
      }
      
      const comment = await createCommentInFirestore(noteId, commentData, user);
      
      return { success: true, comment };
    } catch (error) {
      log.error('Add comment error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Edit a comment
   * @param {string} noteId - Note ID
   * @param {string} commentId - Comment ID
   * @param {Object} updates - Updates { content }
   * @returns {Promise<Object>} Result
   */
  async function editComment(noteId, commentId, updates) {
    try {
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('commentsRequireFirebase') };
      }

      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToComment') };
      }
      
      if (!updateCommentInFirestore) {
        return { success: false, error: 'Comment service not available' };
      }
      
      await updateCommentInFirestore(noteId, commentId, updates, user.uid);
      
      return { success: true };
    } catch (error) {
      log.error('Edit comment error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a comment
   * @param {string} noteId - Note ID
   * @param {string} commentId - Comment ID
   * @returns {Promise<Object>} Result
   */
  async function deleteCommentHandler(noteId, commentId) {
    try {
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('commentsRequireFirebase') };
      }

      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToComment') };
      }
      
      if (!deleteCommentFromFirestore) {
        return { success: false, error: 'Comment service not available' };
      }
      
      await deleteCommentFromFirestore(noteId, commentId, user.uid);
      
      return { success: true };
    } catch (error) {
      log.error('Delete comment error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get comments for a note
   * @param {string} noteId - Note ID
   * @returns {Promise<Object>} Result with comments array
   */
  async function getComments(noteId) {
    try {
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('commentsRequireFirebase') };
      }

      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToComment') };
      }
      
      if (!getCommentsForNoteFromFirestore) {
        return { success: false, error: 'Comment service not available' };
      }
      
      const comments = await getCommentsForNoteFromFirestore(noteId, user);
      
      return { success: true, comments };
    } catch (error) {
      log.error('Get comments error:', error);
      return { success: false, error: error.message };
    }
  }

  // Every subscribe and unsubscribe bumps the generation of its key (tab and frame for notes, tab
  // and note for comments). A subscribe that sees a different generation than the one it took was
  // superseded or cancelled: it stops, or releases the listener it just created, instead of
  // registering it. The latest request wins, even when it then fails before creating a listener.
  const noteSubGenerations = new Map();
  const commentSubGenerations = new Map();
  
  // Generations come from one counter that never repeats, so removing a key (releaseTab) can never
  // make a later subscribe reuse the number of an older one that is still starting
  let lastGeneration = 0;
  
  // Tabs that were closed (the most recent ones), so a subscribe that reaches the worker after
  // tabs.onRemoved registers nothing. Tab IDs are not reused within a browser session.
  const MAX_REMEMBERED_CLOSED_TABS = 500;
  const closedTabs = new Set();
  
  /**
   * Remember a closed tab, forgetting the oldest one past the limit
   * @param {number} tabId - ID of the closed tab
   */
  function rememberClosedTab(tabId) {
    closedTabs.add(tabId);
    if (closedTabs.size > MAX_REMEMBERED_CLOSED_TABS) {
      closedTabs.delete(closedTabs.values().next().value);
    }
  }
  
  /**
   * Report whether real-time sync is degraded, and whether subscriptions can be restored at all
   * @returns {Promise<Object>} { success: true, degraded, restorable }; degraded is true while a
   *   subscription the last restore could not restore is still unrestored
   */
  async function getRealtimeSyncStatus() {
    return {
      success: true,
      degraded: subscriptionStore ? await subscriptionStore.isDegraded() : false,
      restorable: Boolean(subscriptionStore)
    };
  }
  
  /**
   * Take a new generation for a subscription key
   * @param {Map<string, number>} generations - Latest generation per subscription key
   * @param {string} subKey - Subscription key
   * @returns {number} The new generation
   */
  function bumpGeneration(generations, subKey) {
    lastGeneration += 1;
    generations.set(subKey, lastGeneration);
    return lastGeneration;
  }
  
  /**
   * Cancel a subscribe that is still starting for a key, and mark the key as touched so a restore
   * that has not claimed it yet leaves it alone. A closed tab gets no entry.
   * @param {Map<string, number>} generations - Latest generation per subscription key
   * @param {string} subKey - Subscription key
   * @param {number} tabId - ID of the tab the key belongs to
   */
  function cancelSubscribe(generations, subKey, tabId) {
    if (!closedTabs.has(tabId)) {
      bumpGeneration(generations, subKey);
    }
  }
  
  /**
   * Claim a key for a restore after a worker restart, before anything is awaited. Returns null
   * when a content script already subscribed or unsubscribed for the key since the worker
   * started: that request is newer than the stored descriptor, so the restore must skip the key.
   * @param {string} kind - 'note' or 'comment'
   * @param {string} subKey - Subscription key
   * @returns {number|null} The generation the restore subscribes with, or null to skip the key
   */
  function claimRestore(kind, subKey) {
    const generations = kind === 'note' ? noteSubGenerations : commentSubGenerations;
    return generations.has(subKey) ? null : bumpGeneration(generations, subKey);
  }
  
  /**
   * Report whether a subscription is registered right now
   * @param {string} kind - 'note' or 'comment'
   * @param {string} subKey - Subscription key
   * @returns {boolean} True if the worker holds a listener for the key
   */
  function isSubscribed(kind, subKey) {
    return (kind === 'note' ? noteSubscriptions : commentSubscriptions).has(subKey);
  }
  
  /**
   * Release a listener. Never throws: a missing unsubscribe function or a failing release is
   * logged and swallowed. Does not touch any subscription map, so the caller drops the entry
   * (a throwing unsubscribe is not worth retrying, and a stale entry would wedge its key).
   * @param {Function|undefined} unsubscribe - Unsubscribe function of the listener, if any
   * @param {string} subKey - Subscription key, for the log
   * @param {string} reason - Why the listener is released, for the log
   * @returns {boolean} True if the listener was released
   */
  function releaseListener(unsubscribe, subKey, reason) {
    if (typeof unsubscribe !== 'function') {
      log.warn(`Subscription has no unsubscribe function (${reason}):`, subKey);
      return false;
    }
    try {
      unsubscribe();
      log.debug(`Released a subscription (${reason}):`, subKey);
      return true;
    } catch (error) {
      log.error(`Failed to release a subscription (${reason}):`, subKey, error);
      return false;
    }
  }
  
  /**
   * Add released: false to a successful result when the listener could not be released, so the
   * caller can tell (it is only logged otherwise, and logging is off by default)
   * @param {Object} result - Result to return
   * @param {boolean} released - Whether the listener was released
   * @returns {Object} The result, with released: false added on a failed release
   */
  function withRelease(result, released) {
    return released ? result : { ...result, released: false };
  }
  
  /**
   * Subscribe to real-time note updates for a URL
   * @param {string} url - Page URL
   * @param {Object} sender - Message sender (contains tab info)
   * @param {number} [claimedGeneration] - Generation claimed by a restore; a normal request takes a new one
   * @returns {Promise<Object>} Result; cancelled is true when the subscribe was superseded or
   *   cancelled and holds no listener (released is false if its listener could not be released)
   */
  async function subscribeNotes(url, sender, claimedGeneration) {
    try {
      const tabId = sender?.tab?.id;
      const frameId = sender?.frameId ?? 0;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      
      // A subscribe that arrives after its tab closed would register a listener nothing releases
      if (closedTabs.has(tabId)) {
        return { success: true, cancelled: true };
      }
      
      // Use composite key to handle multiple frames (main frame + iframes)
      const subKey = `${tabId}-${frameId}`;
      
      // Take the generation before the first await, so an unsubscribe or a newer subscribe that
      // arrives while the user lookup is pending cancels this one. A restore claimed its generation
      // earlier and keeps it for every retry, so any request that came in since cancels the restore.
      let generation = claimedGeneration;
      if (generation === undefined) {
        generation = bumpGeneration(noteSubGenerations, subKey);
      } else if (noteSubGenerations.get(subKey) !== generation) {
        return { success: true, cancelled: true };
      }
      
      const user = await getUserIfConfigured();
      
      if (noteSubGenerations.get(subKey) !== generation) {
        return { success: true, cancelled: true };
      }
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInForRealtime') };
      }
      
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('realtimeSyncRequiresFirebase') };
      }
      
      if (!subscribeToNotesForUrl) {
        return { success: false, error: 'Subscription service not available' };
      }
      
      // Clean up existing subscription for this tab/frame
      const existingSub = noteSubscriptions.get(subKey);
      if (existingSub) {
        releaseListener(existingSub.unsubscribe, subKey, 'replaced');
        noteSubscriptions.delete(subKey);
      }
      
      // Set up new subscription (await since lazy-loaded functions return promises)
      const unsubscribe = await subscribeToNotesForUrl(
        url,
        user.uid,
        user.email,
        (notes) => {
          // Push updates to the specific frame only
          if (chromeTabs) {
            chromeTabs.sendMessage(tabId, {
              action: 'notesUpdated',
              notes
            }, { frameId }).catch(() => {
              // Tab/frame might be closed, clean up subscription
              releaseListener(unsubscribe, subKey, 'tab unreachable');
              // Only drop the entry if it is still this subscription, not a newer one
              if (noteSubscriptions.get(subKey)?.unsubscribe === unsubscribe) {
                noteSubscriptions.delete(subKey);
                subscriptionStore?.removeNote(subKey);
              }
            });
          }
        },
        (error) => {
          log.error('Note subscription error:', error);
          if (chromeTabs) {
            chromeTabs.sendMessage(tabId, {
              action: 'subscriptionError',
              type: 'notes',
              error: error.message
            }, { frameId }).catch(() => {});
          }
        }
      );
      
      // A newer subscribe or an unsubscribe arrived while this one was starting: release this
      // listener instead of letting it replace the newer one or outlive the unsubscribe
      if (noteSubGenerations.get(subKey) !== generation) {
        const released = releaseListener(unsubscribe, subKey, 'cancelled while starting');
        return withRelease({ success: true, cancelled: true }, released);
      }
      
      noteSubscriptions.set(subKey, { url, frameId, unsubscribe });
      subscriptionStore?.saveNote(subKey, { tabId, frameId, url });
      log.debug('Subscribed to notes for tab', tabId, 'frame', frameId, 'url', url);
      
      return { success: true };
    } catch (error) {
      log.error('Subscribe notes error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe from note updates
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Promise<Object>} Result
   */
  async function unsubscribeNotes(sender) {
    try {
      const tabId = sender?.tab?.id;
      const frameId = sender?.frameId ?? 0;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      
      const subKey = `${tabId}-${frameId}`;
      cancelSubscribe(noteSubGenerations, subKey, tabId);
      const sub = noteSubscriptions.get(subKey);
      let released = true;
      if (sub) {
        released = releaseListener(sub.unsubscribe, subKey, 'unsubscribed');
        noteSubscriptions.delete(subKey);
      }
      // Also when there is no entry: a replacement that was still starting is cancelled here
      subscriptionStore?.removeNote(subKey);
      
      return withRelease({ success: true }, released);
    } catch (error) {
      log.error('Unsubscribe notes error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe to real-time comment updates for a note
   * @param {string} noteId - Note ID
   * @param {Object} sender - Message sender (contains tab info)
   * @param {number} [claimedGeneration] - Generation claimed by a restore; a normal request takes a new one
   * @returns {Promise<Object>} Result; cancelled is true when the subscribe was superseded or
   *   cancelled and holds no listener (released is false if its listener could not be released)
   */
  async function subscribeCommentsHandler(noteId, sender, claimedGeneration) {
    try {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      
      if (closedTabs.has(tabId)) {
        return { success: true, cancelled: true };
      }
      
      const subKey = `${tabId}-${noteId}`;
      
      // Take the generation before the first await (see subscribeNotes)
      let generation = claimedGeneration;
      if (generation === undefined) {
        generation = bumpGeneration(commentSubGenerations, subKey);
      } else if (commentSubGenerations.get(subKey) !== generation) {
        return { success: true, cancelled: true };
      }
      
      const user = await getUserIfConfigured();
      
      if (commentSubGenerations.get(subKey) !== generation) {
        return { success: true, cancelled: true };
      }
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToComment') };
      }
      
      if (!isFirebaseConfigured()) {
        return { success: false, error: t('commentsRequireFirebase') };
      }
      
      if (!subscribeToComments) {
        return { success: false, error: 'Subscription service not available' };
      }
      
      // Clean up existing subscription
      const existingSub = commentSubscriptions.get(subKey);
      if (existingSub) {
        releaseListener(existingSub, subKey, 'replaced');
        commentSubscriptions.delete(subKey);
      }
      
      // Set up new subscription (await since lazy-loaded functions return promises)
      const unsubscribe = await subscribeToComments(
        noteId,
        user,
        (comments) => {
          // Push updates to the tab
          if (chromeTabs) {
            chromeTabs.sendMessage(tabId, {
              action: 'commentsUpdated',
              noteId,
              comments
            }).catch(() => {
              // Tab might be closed, clean up subscription
              releaseListener(unsubscribe, subKey, 'tab unreachable');
              // Only drop the entry if it is still this subscription, not a newer one
              if (commentSubscriptions.get(subKey) === unsubscribe) {
                commentSubscriptions.delete(subKey);
                subscriptionStore?.removeComment(subKey);
              }
            });
          }
        },
        (error) => {
          log.error('Comment subscription error:', error);
          if (chromeTabs) {
            chromeTabs.sendMessage(tabId, {
              action: 'subscriptionError',
              type: 'comments',
              noteId,
              error: error.message
            }).catch(() => {});
          }
        }
      );
      
      // A newer subscribe or an unsubscribe arrived while this one was starting: release this
      // listener instead of letting it replace the newer one or outlive the unsubscribe
      if (commentSubGenerations.get(subKey) !== generation) {
        const released = releaseListener(unsubscribe, subKey, 'cancelled while starting');
        return withRelease({ success: true, cancelled: true }, released);
      }
      
      commentSubscriptions.set(subKey, unsubscribe);
      subscriptionStore?.saveComment(subKey, { tabId, noteId, tabUrl: sender?.tab?.url });
      log.debug('Subscribed to comments for tab', tabId, 'note', noteId);
      
      return { success: true };
    } catch (error) {
      log.error('Subscribe comments error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe from comment updates
   * @param {string} noteId - Note ID
   * @param {Object} sender - Message sender (contains tab info)
   * @returns {Promise<Object>} Result
   */
  async function unsubscribeCommentsHandler(noteId, sender) {
    try {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        return { success: false, error: 'Tab ID not available' };
      }
      
      const subKey = `${tabId}-${noteId}`;
      cancelSubscribe(commentSubGenerations, subKey, tabId);
      const unsub = commentSubscriptions.get(subKey);
      let released = true;
      if (unsub) {
        released = releaseListener(unsub, subKey, 'unsubscribed');
        commentSubscriptions.delete(subKey);
      }
      subscriptionStore?.removeComment(subKey);
      
      return withRelease({ success: true }, released);
    } catch (error) {
      log.error('Unsubscribe comments error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all notes for the current user
   * Uses Firestore if configured, otherwise falls back to local storage
   * @returns {Promise<Object>} Result with notes array
   */
  async function getAllNotes() {
    try {
      const user = await getUserIfConfigured();
      
      // TODO: Add Firestore getAllUserNotes when firebase/notes.js supports it
      // For now, use local storage approach
      
      // Get notes from local storage
      const result = await chromeStorage.local.get(['notes']);
      const allNotes = result.notes || [];
      
      // If user is logged in, filter to their notes only
      let userNotes = allNotes;
      if (user) {
        userNotes = allNotes.filter(note => 
          note.ownerId === user.uid || note.ownerId === 'local'
        );
      }
      
      return { success: true, notes: userNotes };
    } catch (error) {
      log.error('Get all notes error:', error);
      return { success: false, notes: [], error: error.message };
    }
  }

  /**
   * Delete all notes for the current user
   * Uses Firestore if configured, otherwise falls back to local storage
   * @returns {Promise<Object>} Result with count of deleted notes
   */
  async function deleteAllNotes() {
    try {
      const user = await getUserIfConfigured();
      
      // First get all notes to delete
      const { notes } = await getAllNotes();
      
      if (notes.length === 0) {
        return { success: true, count: 0 };
      }
      
      let deletedCount = 0;
      
      // Try Firestore first if configured and user is logged in
      if (isFirebaseConfigured() && user) {
        for (const note of notes) {
          try {
            await deleteNoteFromFirestore(note.id, user.uid);
            deletedCount++;
          } catch (error) {
            log.error('Failed to delete note from Firestore:', note.id, error);
          }
        }
        
        if (deletedCount > 0) {
          return { success: true, count: deletedCount };
        }
      }
      
      // Fallback to local storage
      const result = await chromeStorage.local.get(['notes']);
      const allNotes = result.notes || [];
      
      // Filter out user's notes (keep notes from other users if any)
      const noteIdsToDelete = new Set(notes.map(note => note.id));
      const remainingNotes = allNotes.filter(note => !noteIdsToDelete.has(note.id));
      
      await chromeStorage.local.set({ notes: remainingNotes });
      
      return { success: true, count: notes.length };
    } catch (error) {
      log.error('Delete all notes error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the count of unread shared notes
   * @returns {Promise<Object>} Result with count
   */
  async function getUnreadSharedCount() {
    try {
      const user = await getUserIfConfigured();
      
      if (!user || !user.email) {
        return { success: true, count: 0 };
      }
      
      if (!isFirebaseConfigured() || !getSharedNotesForUser) {
        return { success: true, count: 0 };
      }
      
      // Get all shared notes for the user
      const sharedNotes = await getSharedNotesForUser(user.email);
      
      // Get seen notes from storage
      const storageKey = `seenSharedNotes_${user.uid}`;
      const result = await chromeStorage.local.get([storageKey]);
      const seenNoteIds = new Set(result[storageKey] || []);
      
      // Count unread notes
      const unreadCount = sharedNotes.filter(note => !seenNoteIds.has(note.id)).length;
      
      return { success: true, count: unreadCount };
    } catch (error) {
      log.error('Get unread shared count error:', error);
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Get all unread shared notes (notes shared with user that haven't been viewed)
   * @returns {Promise<Object>} Result with notes array
   */
  async function getUnreadSharedNotes() {
    try {
      const user = await getUserIfConfigured();
      
      if (!user || !user.email) {
        return { success: true, notes: [] };
      }
      
      if (!isFirebaseConfigured() || !getSharedNotesForUser) {
        return { success: true, notes: [] };
      }
      
      // Get all shared notes for the user
      const sharedNotes = await getSharedNotesForUser(user.email);
      
      // Get seen notes from storage
      const storageKey = `seenSharedNotes_${user.uid}`;
      const result = await chromeStorage.local.get([storageKey]);
      const seenNoteIds = new Set(result[storageKey] || []);
      
      // Filter to only unread notes
      const unreadNotes = sharedNotes.filter(note => !seenNoteIds.has(note.id));
      
      return { success: true, notes: unreadNotes };
    } catch (error) {
      log.error('Get unread shared notes error:', error);
      return { success: false, notes: [], error: error.message };
    }
  }

  /**
   * Mark a shared note as read
   * @param {string} noteId - Note ID to mark as read
   * @returns {Promise<Object>} Result
   */
  async function markSharedNoteRead(noteId) {
    try {
      const user = await getUserIfConfigured();
      
      if (!user) {
        return { success: false, error: t('mustBeLoggedInToShare') };
      }
      
      if (!noteId) {
        return { success: false, error: 'Note ID required' };
      }
      
      const storageKey = `seenSharedNotes_${user.uid}`;
      const result = await chromeStorage.local.get([storageKey]);
      const seenNoteIds = result[storageKey] || [];
      
      if (!seenNoteIds.includes(noteId)) {
        seenNoteIds.push(noteId);
        await chromeStorage.local.set({ [storageKey]: seenNoteIds });
        
        // Update the badge after marking as read
        await updateUnreadSharedBadge();
      }
      
      return { success: true };
    } catch (error) {
      log.error('Mark shared note read error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update the extension icon badge with unread shared notes count
   * Called internally when shared notes change
   * @returns {Promise<Object>} Result
   */
  async function updateUnreadSharedBadge() {
    try {
      const result = await getUnreadSharedCount();
      const count = result.count || 0;
      
      if (!chromeAction) {
        return { success: false, error: 'Action API not available' };
      }
      
      if (count > 0) {
        // Show badge with count (global, not per-tab)
        await chromeAction.setBadgeText({ text: count.toString() });
        await chromeAction.setBadgeBackgroundColor({ color: '#3b82f6' }); // Blue for shared notes
      } else {
        // Clear badge
        await chromeAction.setBadgeText({ text: '' });
      }
      
      return { success: true, count };
    } catch (error) {
      log.error('Update unread shared badge error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe to global shared notes updates
   * This provides real-time updates for all notes shared with the user
   * @returns {Promise<Object>} Result
   */
  async function subscribeToSharedNotesGlobal() {
    try {
      const user = await getUserIfConfigured();
      
      if (!user || !user.email) {
        return { success: false, error: t('mustBeLoggedInForRealtime') };
      }
      
      if (!isFirebaseConfigured() || !subscribeToSharedNotes) {
        return { success: false, error: t('realtimeSyncRequiresFirebase') };
      }
      
      // Clean up existing subscription
      if (sharedNotesSubscription.current && typeof sharedNotesSubscription.current === 'function') {
        sharedNotesSubscription.current();
        sharedNotesSubscription.current = null;
      }
      
      // Set up new subscription (await since lazy-loaded functions return promises)
      sharedNotesSubscription.current = await subscribeToSharedNotes(
        user.email,
        async (sharedNotes) => {
          // Update the badge whenever shared notes change
          await updateUnreadSharedBadge();
          
          log.debug('Shared notes updated, count:', sharedNotes.length);
        },
        (error) => {
          log.error('Shared notes subscription error:', error);
        }
      );
      
      // Update badge immediately
      await updateUnreadSharedBadge();
      
      log.debug('Subscribed to global shared notes for user:', user.email);
      return { success: true };
    } catch (error) {
      log.error('Subscribe to shared notes global error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe from global shared notes updates
   * @returns {Promise<Object>} Result
   */
  async function unsubscribeFromSharedNotesGlobal() {
    try {
      if (sharedNotesSubscription.current) {
        sharedNotesSubscription.current();
        sharedNotesSubscription.current = null;
        log.debug('Unsubscribed from global shared notes');
      }
      
      // Clear the badge
      if (chromeAction) {
        await chromeAction.setBadgeText({ text: '' });
      }
      
      return { success: true };
    } catch (error) {
      log.error('Unsubscribe from shared notes global error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Release every note and comment subscription of a closed tab, in all of its frames, forget
   * its generations so a subscribe still starting for it is cancelled, forget its stored
   * descriptors, and remember the tab as closed so a later subscribe for it registers nothing
   * @param {number} tabId - ID of the closed tab
   */
  function releaseTab(tabId) {
    const prefix = `${tabId}-`;
    rememberClosedTab(tabId);
    subscriptionStore?.removeTab(tabId);
    
    for (const [subKey, sub] of [...noteSubscriptions.entries()]) {
      if (subKey.startsWith(prefix)) {
        releaseListener(sub?.unsubscribe, subKey, 'tab closed');
        noteSubscriptions.delete(subKey);
      }
    }
    
    for (const [subKey, unsubscribe] of [...commentSubscriptions.entries()]) {
      if (subKey.startsWith(prefix)) {
        releaseListener(unsubscribe, subKey, 'tab closed');
        commentSubscriptions.delete(subKey);
      }
    }
    
    // An in-flight subscribe compares its generation with the stored one, so removing the entry
    // cancels it, and the maps do not keep an entry for every tab that ever subscribed
    for (const generations of [noteSubGenerations, commentSubGenerations]) {
      for (const subKey of [...generations.keys()]) {
        if (subKey.startsWith(prefix)) {
          generations.delete(subKey);
        }
      }
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
    shareNote,
    unshareNote,
    leaveSharedNote,
    captureScreenshot,
    // Comment handlers
    addComment,
    editComment,
    deleteCommentHandler,
    getComments,
    // Subscription handlers
    subscribeNotes,
    unsubscribeNotes,
    subscribeCommentsHandler,
    unsubscribeCommentsHandler,
    releaseTab,
    claimRestore,
    isSubscribed,
    getRealtimeSyncStatus,
    // Badge management
    updateOrphanedBadge,
    // Iframe support
    getTabUrl,
    broadcastDisableSelectionMode,
    // Bulk operations
    getAllNotes,
    deleteAllNotes,
    // Unread shared notes
    getUnreadSharedCount,
    getUnreadSharedNotes,
    markSharedNoteRead,
    updateUnreadSharedBadge,
    subscribeToSharedNotesGlobal,
    unsubscribeFromSharedNotesGlobal
  };
}

// For backwards compatibility - create handlers with default deps
// This will be used by index.js after providing the real dependencies
export const defaultHandlers = createHandlers();
