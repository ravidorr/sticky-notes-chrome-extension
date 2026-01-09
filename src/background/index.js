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
  subscribeToNotesForUrl
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

// Track active subscriptions by tab ID
const noteSubscriptions = new Map(); // tabId -> { url: string, unsubscribe: Function }
const commentSubscriptions = new Map(); // `${tabId}-${noteId}` -> unsubscribe Function

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
  isFirebaseConfigured,
  // Comment service functions
  createCommentInFirestore,
  getCommentsForNoteFromFirestore,
  updateCommentInFirestore,
  deleteCommentFromFirestore,
  // Real-time subscription functions
  subscribeToNotesForUrl,
  subscribeToComments,
  noteSubscriptions,
  commentSubscriptions,
  generateId,
  isValidEmail,
  log,
  chromeStorage: chrome.storage,
  chromeTabs: chrome.tabs
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
    chrome.tabs.sendMessage(details.tabId, { 
      action: 'urlChanged', 
      url: details.url 
    }).catch(() => {
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
      } catch (e) {
        log.warn('Error cleaning up note subscription:', e);
      }
      noteSubscriptions.delete(tabId);
      log.debug('Cleaned up note subscription for tab', tabId);
    }
    
    // Clean up comment subscriptions for this tab
    for (const [key, unsubscribe] of commentSubscriptions.entries()) {
      if (key.startsWith(`${tabId}-`)) {
        try {
          unsubscribe();
        } catch (e) {
          log.warn('Error cleaning up comment subscription:', key, e);
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
}

// Only bootstrap in non-test environment
if (typeof globalThis.__JEST__ === 'undefined') {
  bootstrap();
}

// Re-export for testing
export { createHandlers } from './handlers.js';
export { handlers };
