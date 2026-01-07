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
import { generateId, isValidEmail } from '../shared/utils.js';
import { backgroundLogger as log } from '../shared/logger.js';
import { createHandlers } from './handlers.js';

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
  generateId,
  isValidEmail,
  log,
  chromeStorage: chrome.storage
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
