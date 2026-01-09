/**
 * Popup Event Handlers
 * Extracted for testability with dependency injection
 */

import { isRestrictedUrl, THEME_COLORS, escapeHtml, stripHtml, truncate } from '../shared/utils.js';
import { popupLogger as defaultLog } from '../shared/logger.js';
import { t } from '../shared/i18n.js';

/**
 * Create popup handlers with injected dependencies
 * @param {Object} deps - Dependencies
 * @returns {Object} Handler functions
 */
export function createPopupHandlers(deps = {}) {
  const {
    log = defaultLog,
    chromeRuntime = chrome.runtime,
    chromeTabs = chrome.tabs,
    chromeScripting = chrome.scripting,
    chromeStorage = chrome.storage,
    windowClose = () => window.close(),
    alertFn = alert
  } = deps;

  /**
   * Check authentication state
   * @returns {Promise<Object|null>} User object or null
   */
  async function checkAuthState() {
    try {
      const result = await chromeStorage.local.get(['user']);
      return result.user || null;
    } catch (error) {
      log.error('Error checking auth state:', error);
      return null;
    }
  }

  /**
   * Handle login
   * @returns {Promise<Object>} Result with success flag and user/error
   */
  async function handleLogin() {
    try {
      const response = await chromeRuntime.sendMessage({ action: 'login' });
      if (response.success) {
        return { success: true, user: response.user };
      } else {
        log.error('Login failed:', response.error);
        return { success: false, error: response.error };
      }
    } catch (error) {
      log.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle logout
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleLogout() {
    try {
      const response = await chromeRuntime.sendMessage({ action: 'logout' });
      return { success: response.success };
    } catch (error) {
      log.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Inject content script into tab
   * @param {number} tabId - Tab ID
   * @returns {Promise<void>}
   */
  async function injectContentScript(tabId) {
    log.debug(' Attempting to inject content script into tab', tabId);
    try {
      const results = await chromeScripting.executeScript({
        target: { tabId },
        files: ['src/content/content.js']
      });
      log.debug(' Content script injection successful. Results:', results);
    } catch (error) {
      log.error('Failed to inject content script:', error);
      throw new Error(`Could not inject content script: ${error.message}`);
    }
  }

  /**
   * Handle add note button click
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleAddNote() {
    log.debug(' Add Note button clicked');
    
    try {
      // Get current active tab
      log.debug(' Querying active tab...');
      const [tab] = await chromeTabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        log.error('No active tab found');
        return { success: false, error: 'No active tab found' };
      }
      
      log.debug(' Active tab:', { id: tab.id, url: tab.url });
      
      // Check if it's a restricted page (fallback check - button should already be disabled)
      if (isRestrictedUrl(tab.url)) {
        log.debug(' URL is restricted, cannot inject content script');
        return { success: false, error: 'Restricted URL' };
      }
      
      // Try to send message to content script
      log.debug(' Sending enableSelectionMode message to tab', tab.id);
      try {
        const response = await chromeTabs.sendMessage(tab.id, { action: 'enableSelectionMode' });
        log.debug(' Content script responded:', response);
        windowClose();
        return { success: true };
      } catch (error) {
        log.error(' First message failed:', error.message);
        
        // Content script not loaded - inject it first
        if (error.message.includes('Receiving end does not exist') || 
            error.message.includes('Could not establish connection')) {
          log.error(' Content script not found, injecting...');
          await injectContentScript(tab.id);
          
          // Wait for the script to initialize with retry
          let retries = 5;
          let lastError = null;
          
          while (retries > 0) {
            log.debug(`Waiting 200ms before retry ${6 - retries}/5...`);
            await new Promise(resolve => setTimeout(resolve, 200));
            try {
              log.debug(' Retrying message...');
              const response = await chromeTabs.sendMessage(tab.id, { action: 'enableSelectionMode' });
              log.debug(' Retry successful! Response:', response);
              windowClose();
              return { success: true };
            } catch (error) {
              log.error(' Retry failed:', error);
              lastError = error;
              retries--;
            }
          }
          
          throw lastError || new Error('Content script failed to respond after injection');
        } else {
          throw error;
        }
      }
    } catch (error) {
      log.error('Error enabling selection mode:', error);
      alertFn(t('couldNotEnableSelection'));
      return { success: false, error: error.message };
    }
  }

  /**
   * Load notes for the current tab
   * @returns {Promise<Object>} Result with notes array
   */
  async function loadNotesForCurrentTab() {
    try {
      const [tab] = await chromeTabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        return { success: false, notes: [], error: 'No active tab' };
      }
      
      log.debug(' Loading notes for tab:', tab.url);
      
      const response = await chromeRuntime.sendMessage({
        action: 'getNotes',
        url: tab.url
      });
      
      if (!response.success) {
        log.error('Failed to get notes:', response.error);
        return { success: false, notes: [], error: response.error };
      }
      
      const pageNotes = response.notes || [];
      log.debug(' Notes received from background:', pageNotes.length);
      
      return { success: true, notes: pageNotes };
    } catch (error) {
      log.error('Error loading notes:', error);
      return { success: false, notes: [], error: error.message };
    }
  }

  /**
   * Handle note item click - scroll to element and highlight note
   * @param {string} noteId - Note ID
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleNoteClick(noteId) {
    try {
      const [tab] = await chromeTabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        return { success: false, error: 'No active tab' };
      }
      
      await chromeTabs.sendMessage(tab.id, { 
        action: 'highlightNote', 
        noteId 
      });
      
      windowClose();
      return { success: true };
    } catch (error) {
      log.error('Error highlighting note:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get theme color
   * @param {string} theme - Theme name
   * @returns {string} Color hex
   */
  function getThemeColor(theme) {
    return THEME_COLORS[theme] || THEME_COLORS.yellow;
  }

  /**
   * Truncate selector for display
   * @param {string} selector - CSS selector
   * @returns {string} Truncated selector
   */
  function truncateSelector(selector) {
    return truncate(selector, 30);
  }

  /**
   * Render a single note item HTML
   * @param {Object} note - Note object
   * @returns {string} HTML string
   */
  function renderNoteItem(note) {
    return `
      <div class="note-item" data-id="${note.id}">
        <div class="note-item-color" style="background: ${getThemeColor(note.theme)}"></div>
        <div class="note-item-content">
          <div class="note-item-text">${stripHtml(note.content) || t('emptyNote')}</div>
          <div class="note-item-meta">
            <span class="note-item-selector">${escapeHtml(truncateSelector(note.selector))}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render empty notes message
   * @returns {string} HTML string
   */
  function renderEmptyNotes() {
    return `
      <div class="notes-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M7 8h10M7 12h10M7 16h6"/>
        </svg>
        <p>${t('noNotesYet')}</p>
      </div>
    `;
  }

  return {
    checkAuthState,
    handleLogin,
    handleLogout,
    handleAddNote,
    loadNotesForCurrentTab,
    handleNoteClick,
    injectContentScript,
    getThemeColor,
    truncateSelector,
    renderNoteItem,
    renderEmptyNotes
  };
}

// Export default handlers for use in popup.js
export const defaultHandlers = createPopupHandlers();
