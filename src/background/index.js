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
  shareNote as shareNoteInFirestore,
  unshareNote as unshareNoteInFirestore,
  subscribeToNotesForUrl,
  subscribeToSharedNotes,
  getSharedNotesForUser
} from '../firebase/notes.js';
import {
  createComment as createCommentInFirestore,
  getCommentsForNote as getCommentsForNoteFromFirestore,
  updateComment as updateCommentInFirestore,
  deleteComment as deleteCommentFromFirestore,
  subscribeToComments
} from '../firebase/comments.js';
import { initializeFirebase, isFirebaseConfigured } from '../firebase/config.js';
import { generateId, isValidEmail } from '../shared/utils.js';
import { backgroundLogger as log } from '../shared/logger.js';
import { createHandlers } from './handlers.js';
import { getUrlChangedMessageFromHistoryUpdate } from './navigation.js';

// Track active subscriptions by tab ID
const noteSubscriptions = new Map(); // tabId -> { url: string, unsubscribe: Function }
const commentSubscriptions = new Map(); // `${tabId}-${noteId}` -> unsubscribe Function

// Track global shared notes subscription
const sharedNotesSubscription = { current: null };

// Create handlers with actual dependencies
const handlers = createHandlers({
  signInWithGoogle,
  signOut,
  getCurrentUser,
  createNote,
  getNotesForUrl,
  updateNoteInFirestore,
  deleteNoteFromFirestore,
  shareNoteInFirestore,
  unshareNoteInFirestore,
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
  noteSubscriptions,
  commentSubscriptions,
  sharedNotesSubscription,
  generateId,
  isValidEmail,
  log,
  chromeStorage: chrome.storage,
  chromeTabs: chrome.tabs,
  chromeAction: chrome.action
});

const { handleMessage } = handlers;

/**
 * Bootstrap the background service worker
 * Separated for testability - not called in test environment
 */
export function bootstrap() {
  // Initialize Firebase if configured
  if (isFirebaseConfigured()) {
    initializeFirebase();
  }

  // Create context menu for creating notes
  // Only show on regular web pages (http/https), not on restricted pages (chrome://, about:, etc.)
  chrome.contextMenus.create({
    id: 'create-sticky-note',
    title: chrome.i18n.getMessage('contextMenuCreateNote') || 'Create Sticky Note Here',
    contexts: ['page', 'selection', 'image', 'link'],
    documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
  }, () => {
    // Ignore error if menu already exists (e.g., during hot reload)
    if (chrome.runtime.lastError) {
      log.debug('Context menu creation:', chrome.runtime.lastError.message);
    }
  });

  // Handle context menu click
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'create-sticky-note' && tab?.id) {
      log.debug('Context menu clicked, frameId:', info.frameId, 'frameUrl:', info.frameUrl, 'pageUrl:', info.pageUrl);
      
      // Send to all frames - each frame will check if it has the right-clicked element
      // This is necessary because Chrome's frameId may not match where the contextmenu event was captured
      try {
        // First try the specific frame that Chrome reports
        if (info.frameId !== undefined) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'createNoteAtClick' }, { frameId: info.frameId });
            return; // Success, we're done
          } catch (frameError) {
            log.debug('Specific frame failed, trying all frames:', frameError.message);
          }
        }
        
        // If specific frame failed or frameId not available, broadcast to all frames
        // Each content script will check if it has lastRightClickedElement
        await chrome.tabs.sendMessage(tab.id, { action: 'createNoteAtClick' });
      } catch (error) {
        log.warn('Failed to send createNoteAtClick message:', error);
      }
    }
  });

  // Listen for messages from popup and content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate async response
    return true;
  });

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
    const payload = getUrlChangedMessageFromHistoryUpdate(details);
    if (!payload) return;

    chrome.tabs.sendMessage(payload.tabId, payload.message).catch(() => {
      // Content script might not be loaded yet
    });
  });

  // Clean up subscriptions when tab is closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    // Clean up note subscriptions for this tab
    const noteSub = noteSubscriptions.get(tabId);
    if (noteSub) {
      try {
        noteSub.unsubscribe();
      } catch (error) {
        log.error('Error cleaning up note subscription:', error);
      }
      noteSubscriptions.delete(tabId);
      log.debug('Cleaned up note subscription for tab', tabId);
    }
    
    // Clean up comment subscriptions for this tab
    for (const [key, unsubscribe] of commentSubscriptions.entries()) {
      if (key.startsWith(`${tabId}-`)) {
        try {
          unsubscribe();
        } catch (error) {
          log.error('Error cleaning up comment subscription:', key, error);
        }
        commentSubscriptions.delete(key);
        log.debug('Cleaned up comment subscription', key);
      }
    }
  });

  // Log when service worker starts
  log.info('Sticky Notes background service worker started');
  log.info('Firebase configured:', isFirebaseConfigured());
  log.info('Auth configured:', isAuthConfigured());
  
  // Initialize shared notes subscription if user is already logged in
  if (isFirebaseConfigured()) {
    getCurrentUser().then(user => {
      if (user && user.email) {
        handlers.subscribeToSharedNotesGlobal().then(() => {
          log.info('Initialized shared notes subscription for logged-in user');
        }).catch(error => {
          log.error('Failed to initialize shared notes subscription:', error);
        });
      }
    }).catch(error => {
      log.debug('Could not check user state on startup:', error.message);
    });
  }
}

// Only bootstrap in non-test environment
if (typeof globalThis.__JEST__ === 'undefined') {
  bootstrap();
}

// Re-export for testing
export { createHandlers } from './handlers.js';
export { handlers };
