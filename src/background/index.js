/**
 * Background Service Worker
 * Handles authentication, storage, and message passing
 * 
 * PERFORMANCE OPTIMIZATION: Uses lazy-loading for Firebase SDK
 * to minimize cold start time. Firebase is loaded only when needed.
 */

// Lightweight imports only - no Firebase SDK at startup
import { generateId, isValidEmail } from '../shared/utils.js';
import { backgroundLogger as log } from '../shared/logger.js';
import { initLogLevel } from '../shared/logLevel.js';
import { createHandlers } from './handlers.js';
import { registerTabCleanup } from './tabCleanup.js';
import { createSubscriptionStore } from './subscriptionStore.js';
import { restoreSubscriptions } from './restoreSubscriptions.js';
import { getUrlChangedMessageFromHistoryUpdate } from './navigation.js';

// Lazy-loading imports for Firebase (no SDK loaded at import time)
import {
  isFirebaseConfiguredSync,
  signInWithGoogleLazy,
  signOutLazy,
  getCurrentUserLazy,
  createNoteLazy,
  getNotesForUrlLazy,
  updateNoteLazy,
  deleteNoteLazy,
  shareNoteLazy,
  unshareNoteLazy,
  leaveSharedNoteLazy,
  subscribeToNotesForUrlLazy,
  subscribeToSharedNotesLazy,
  getSharedNotesForUserLazy,
  createCommentLazy,
  getCommentsForNoteLazy,
  updateCommentLazy,
  deleteCommentLazy,
  subscribeToCommentsLazy
} from '../firebase/lazy.js';

// Apply the logLevel preference (fire and forget; initLogLevel never rejects)
initLogLevel();

// Track active subscriptions, keyed per tab and frame (notes) or per tab and note (comments)
const noteSubscriptions = new Map(); // `${tabId}-${frameId}` -> { url, frameId, unsubscribe }
const commentSubscriptions = new Map(); // `${tabId}-${noteId}` -> unsubscribe Function

// Track global shared notes subscription
const sharedNotesSubscription = { current: null };

// Describes the subscriptions above in chrome.storage.session, so they can be restored when Chrome
// stops this worker (its Firestore listeners die with it) and starts it again
const subscriptionStore = chrome.storage.session
  ? createSubscriptionStore(chrome.storage.session, log)
  : null;
if (!subscriptionStore) {
  log.warn('chrome.storage.session is not available: real-time subscriptions cannot be restored');
}

// Create handlers with lazy-loaded dependencies
// These wrappers ensure Firebase is only loaded when actually used
const handlers = createHandlers({
  signInWithGoogle: signInWithGoogleLazy,
  signOut: signOutLazy,
  getCurrentUser: getCurrentUserLazy,
  createNote: createNoteLazy,
  getNotesForUrl: getNotesForUrlLazy,
  updateNoteInFirestore: updateNoteLazy,
  deleteNoteFromFirestore: deleteNoteLazy,
  shareNoteInFirestore: shareNoteLazy,
  unshareNoteInFirestore: unshareNoteLazy,
  leaveSharedNoteInFirestore: leaveSharedNoteLazy,
  isFirebaseConfigured: isFirebaseConfiguredSync,
  // Comment service functions
  createCommentInFirestore: createCommentLazy,
  getCommentsForNoteFromFirestore: getCommentsForNoteLazy,
  updateCommentInFirestore: updateCommentLazy,
  deleteCommentFromFirestore: deleteCommentLazy,
  // Real-time subscription functions
  subscribeToNotesForUrl: subscribeToNotesForUrlLazy,
  subscribeToComments: subscribeToCommentsLazy,
  // Global shared notes subscription
  subscribeToSharedNotes: subscribeToSharedNotesLazy,
  getSharedNotesForUser: getSharedNotesForUserLazy,
  noteSubscriptions,
  commentSubscriptions,
  sharedNotesSubscription,
  subscriptionStore,
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
  // Firebase is now lazy-loaded - no eager initialization needed
  // This allows the service worker to start immediately without
  // waiting for the ~800KB Firebase SDK to be parsed/compiled

  // Listen for messages from popup and content scripts FIRST
  // This ensures the extension is responsive immediately
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate async response
    return true;
  });

  // Context menus are created in onInstalled (see below) - they persist across sessions

  /**
   * Check if we have host permission for a URL
   * @param {string} url - URL to check permission for
   * @returns {Promise<boolean>}
   */
  async function hasHostPermission(url) {
    try {
      const origin = new URL(url).origin + '/*';
      return await chrome.permissions.contains({ origins: [origin] });
    } catch {
      return false;
    }
  }

  /**
   * Inject content scripts into a tab if not already injected
   * @param {number} tabId - Tab ID to inject into
   * @param {string} url - Tab URL (for permission check)
   * @returns {Promise<boolean>} - Whether injection was successful
   */
  async function ensureContentScriptInjected(tabId, url) {
    // Skip restricted URLs
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
        url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('moz-extension://')) {
      return false;
    }

    // Check if content script is already injected
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return true; // Already injected
    } catch {
      // Not injected, need to inject
    }

    // Check if we have permission
    const hasPermission = await hasHostPermission(url);
    if (!hasPermission) {
      log.debug('No host permission for:', url);
      return false;
    }

    // Inject content scripts
    // allFrames: true is required to inject into iframes, matching the old declarative manifest
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['src/content/pageContext.js'],
        world: 'MAIN'
      });
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['src/content/content.js']
      });
      log.debug('Content scripts injected into tab', tabId);
      return true;
    } catch (error) {
      log.debug('Failed to inject content scripts:', error.message);
      return false;
    }
  }

  // Handle context menu click
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id || !tab?.url) return;
    
    if (info.menuItemId === 'create-sticky-note') {
      log.debug('Context menu clicked, frameId:', info.frameId, 'frameUrl:', info.frameUrl, 'pageUrl:', info.pageUrl);
      
      // Ensure content script is injected
      const injected = await ensureContentScriptInjected(tab.id, tab.url);
      if (!injected) {
        // No permission - user needs to click the popup first to grant permission
        log.warn('No permission for this page. User needs to open popup first to grant permission.');
        return;
      }
      
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
    } else if (info.menuItemId === 'create-page-note') {
      log.debug('Page note context menu clicked, frameId:', info.frameId);
      
      // Ensure content script is injected
      const injected = await ensureContentScriptInjected(tab.id, tab.url);
      if (!injected) {
        // No permission - user needs to click the popup first to grant permission
        log.warn('No permission for this page. User needs to open popup first to grant permission.');
        return;
      }
      
      // Send to top frame only for page-level notes
      // The content script will use the right-click position from the contextmenu event
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'createPageLevelNote' });
      } catch (error) {
        log.warn('Failed to send createPageLevelNote message:', error);
      }
    } else if (info.menuItemId === 'open-dashboard') {
      // Open the dashboard in a new tab
      chrome.tabs.create({ 
        url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
      });
    }
  });

  // Listen for keyboard shortcuts
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-dashboard') {
      chrome.tabs.create({ 
        url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
      });
    } else if (command === 'toggle-all-notes') {
      // Send message to active tab's content script to toggle visibility
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          await chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'toggleAllNotesVisibility' 
          });
        }
      } catch (error) {
        log.debug('Could not toggle notes visibility:', error.message);
      }
    }
  });

  // Listen for tab updates to inject content scripts automatically
  // This runs when user navigates to a page and we have permission for it
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      // Try to inject content scripts (will check permission internally)
      const injected = await ensureContentScriptInjected(tabId, tab.url);
      
      if (injected) {
        // Notify content script about page load
        chrome.tabs.sendMessage(tabId, { action: 'pageLoaded', url: tab.url })
          .catch(() => {
            // Content script might not be ready yet, that's okay
          });
      }
    }
  });

  // Listen for history state updates (SPA navigation)
  chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
    const payload = getUrlChangedMessageFromHistoryUpdate(details);
    if (!payload) return;

    // Ensure content script is injected (for SPAs where initial load might not have had permission)
    await ensureContentScriptInjected(payload.tabId, details.url);

    chrome.tabs.sendMessage(payload.tabId, payload.message).catch(() => {
      // Content script might not be loaded yet
    });
  });

  // Clean up subscriptions when tab is closed
  registerTabCleanup(chrome.tabs, handlers, log);

  // Create context menus on every service worker startup
  // Context menus can get lost when the extension is disabled/enabled, reloaded, 
  // or after browser updates, so we recreate them on every startup
  chrome.contextMenus.removeAll(() => {
    // Create context menu for creating notes
    chrome.contextMenus.create({
      id: 'create-sticky-note',
      title: chrome.i18n.getMessage('contextMenuCreateNote') || 'Create Sticky Note Here',
      contexts: ['page', 'selection', 'image', 'link'],
      documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
    });
    
    // Create context menu for creating page-level notes
    chrome.contextMenus.create({
      id: 'create-page-note',
      title: chrome.i18n.getMessage('contextMenuCreatePageNote') || 'Create Page Note',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
    });
    
    // Create context menu for opening the dashboard
    chrome.contextMenus.create({
      id: 'open-dashboard',
      title: chrome.i18n.getMessage('contextMenuOpenDashboard') || 'Open Notes Dashboard',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
    });
    
    log.debug('Context menus created');
  });

  // Handle extension install/update
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      // Open options page on first install (includes welcome section and permission prompt)
      chrome.runtime.openOptionsPage();
      log.info('Opened options page for new installation');
    } else if (details.reason === 'update') {
      // Check if user has all-sites permission
      const hasAllSites = await chrome.permissions.contains({ origins: ['<all_urls>'] });
      
      if (!hasAllSites) {
        // Open options page to prompt for permission on update
        // This is important because we removed declarative content_scripts
        chrome.runtime.openOptionsPage();
        log.info('Opened options page for permission prompt after update');
      }
    }
  });

  // Set up service worker keep-alive to prevent cold starts
  // This keeps the service worker warm, reducing popup opening delay. If Chrome stops the worker
  // anyway, the next alarm starts it again and the subscriptions it held are restored below.
  // Chrome may fire alarms no more often than every 30 seconds.
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
      // Minimal work to keep the service worker alive
      // This prevents cold start delays when opening popup
    }
  });

  // Restore the real-time subscriptions a stopped worker held (nothing to do, and no Firebase
  // SDK load, when there are none)
  if (subscriptionStore) {
    restoreSubscriptions({
      store: subscriptionStore,
      handlers,
      tabs: chrome.tabs,
      webNavigation: chrome.webNavigation,
      log
    }).catch((error) => log.error('Failed to restore real-time subscriptions:', error));
  }

  // Log when service worker starts
  log.info('Sticky Notes background service worker started');
  log.info('Firebase configured:', isFirebaseConfiguredSync());
  
  // NOTE: We removed eager Firebase initialization at startup.
  // The previous code called getCurrentUserLazy() which loaded the entire
  // Firebase SDK (~800KB) during service worker startup.
  // Shared notes subscription is now initialized on-demand when user interacts.
}

// Only bootstrap in non-test environment
if (typeof globalThis.__JEST__ === 'undefined') {
  bootstrap();
}

// Re-export for testing
export { createHandlers } from './handlers.js';
export { handlers };
