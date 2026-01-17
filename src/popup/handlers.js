/**
 * Popup Event Handlers
 * Extracted for testability with dependency injection
 */

import { isRestrictedUrl, THEME_COLORS, escapeHtml, stripHtml, truncate, isValidEmail, formatRelativeTime } from '../shared/utils.js';
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
    showErrorToast = null,  // Will be provided by popup.js
    showSuccessToast = null // Will be provided by popup.js
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
      
      // Send enableSelectionMode to ALL frames in the tab
      // This is necessary because each frame has its own content script instance
      log.debug(' Sending enableSelectionMode message to all frames in tab', tab.id);
      try {
        // Get all frames in the tab
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        log.debug(' Found', frames?.length || 0, 'frames in tab');
        
        // Send to each frame - don't wait for all, just ensure message is sent
        const sendPromises = (frames || []).map(async (frame) => {
          try {
            await chromeTabs.sendMessage(tab.id, { action: 'enableSelectionMode' }, { frameId: frame.frameId });
            log.debug(' Sent to frame', frame.frameId);
          } catch (err) {
            // Frame might not have content script, that's okay
            log.debug(' Frame', frame.frameId, 'error:', err.message);
          }
        });
        
        // Also send without frameId as fallback (goes to all frames)
        sendPromises.push(
          chromeTabs.sendMessage(tab.id, { action: 'enableSelectionMode' }).catch(() => {})
        );
        
        await Promise.all(sendPromises);
        
        windowClose();
        return { success: true };
      } catch (error) {
        log.error(' First attempt failed:', error.message);
        
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
              await chromeTabs.sendMessage(tab.id, { action: 'enableSelectionMode' });
              log.debug(' Retry successful!');
              windowClose();
              return { success: true };
            } catch (retryError) {
              log.error(' Retry failed:', retryError);
              lastError = retryError;
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
      if (showErrorToast) {
        showErrorToast(t('couldNotEnableSelection'));
      }
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
   * For orphaned notes, shows them centered on screen
   * @param {string} noteId - Note ID
   * @param {boolean} isOrphaned - Whether the note is orphaned (element not found)
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleNoteClick(noteId, isOrphaned = false) {
    try {
      const [tab] = await chromeTabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        return { success: false, error: 'No active tab' };
      }
      
      // Use different action for orphaned notes
      const action = isOrphaned ? 'showOrphanedNote' : 'highlightNote';
      
      await chromeTabs.sendMessage(tab.id, { 
        action, 
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
    const orphanedClass = note.isOrphaned ? ' note-item-orphaned' : '';
    const orphanedAttr = note.isOrphaned ? ' data-orphaned="true"' : '';
    const orphanedHint = note.isOrphaned ? `
          <div class="note-item-orphan-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>${t('orphanedNoteHint')}</span>
          </div>` : '';
    
    return `
      <div class="note-item${orphanedClass}" data-id="${note.id}"${orphanedAttr}>
        <div class="note-item-color" style="background: ${getThemeColor(note.theme)}"></div>
        <div class="note-item-content">
          <div class="note-item-text">${stripHtml(note.content) || t('emptyNote')}</div>
          <div class="note-item-meta">
            <span class="note-item-selector">${escapeHtml(truncateSelector(note.selector))}</span>
          </div>${orphanedHint}
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

  /**
   * Delete a single note
   * @param {string} noteId - Note ID to delete
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleDeleteNote(noteId) {
    try {
      const response = await chromeRuntime.sendMessage({
        action: 'deleteNote',
        noteId
      });
      
      if (response.success) {
        if (showSuccessToast) {
          showSuccessToast(t('noteDeleted'));
        }
        return { success: true };
      } else {
        log.error('Delete note failed:', response.error);
        if (showErrorToast) {
          showErrorToast(response.error || t('failedToDelete'));
        }
        return { success: false, error: response.error };
      }
    } catch (error) {
      log.error('Delete note error:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToDelete'));
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete all notes for the current page
   * @param {Array} notes - Array of notes to delete
   * @returns {Promise<Object>} Result with success flag and count
   */
  async function handleDeleteAllFromPage(notes) {
    try {
      let deletedCount = 0;
      
      for (const note of notes) {
        const response = await chromeRuntime.sendMessage({
          action: 'deleteNote',
          noteId: note.id
        });
        
        if (response.success) {
          deletedCount++;
        }
      }
      
      if (showSuccessToast) {
        showSuccessToast(t('notesDeleted', [deletedCount]));
      }
      
      return { success: true, count: deletedCount };
    } catch (error) {
      log.error('Delete all from page error:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToDelete'));
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all notes for the current user
   * @returns {Promise<Object>} Result with notes array
   */
  async function getAllNotes() {
    try {
      const response = await chromeRuntime.sendMessage({
        action: 'getAllNotes'
      });
      
      if (response.success) {
        return { success: true, notes: response.notes || [] };
      } else {
        log.error('Get all notes failed:', response.error);
        return { success: false, notes: [], error: response.error };
      }
    } catch (error) {
      log.error('Get all notes error:', error);
      return { success: false, notes: [], error: error.message };
    }
  }

  /**
   * Delete all notes for the user
   * @returns {Promise<Object>} Result with success flag and count
   */
  async function handleDeleteAllNotes() {
    try {
      const response = await chromeRuntime.sendMessage({
        action: 'deleteAllNotes'
      });
      
      if (response.success) {
        if (showSuccessToast) {
          showSuccessToast(t('notesDeleted', [response.count || 0]));
        }
        return { success: true, count: response.count };
      } else {
        log.error('Delete all notes failed:', response.error);
        if (showErrorToast) {
          showErrorToast(response.error || t('failedToDelete'));
        }
        return { success: false, error: response.error };
      }
    } catch (error) {
      log.error('Delete all notes error:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToDelete'));
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Share a note with another user
   * @param {string} noteId - Note ID to share
   * @param {string} email - Email to share with
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleShareNote(noteId, email) {
    try {
      if (!isValidEmail(email)) {
        if (showErrorToast) {
          showErrorToast(t('invalidEmail'));
        }
        return { success: false, error: t('invalidEmail') };
      }
      
      const response = await chromeRuntime.sendMessage({
        action: 'shareNote',
        noteId,
        email
      });
      
      if (response.success) {
        if (showSuccessToast) {
          showSuccessToast(t('noteShared'));
        }
        return { success: true };
      } else {
        log.error('Share note failed:', response.error);
        if (showErrorToast) {
          showErrorToast(response.error || t('failedToShare'));
        }
        return { success: false, error: response.error };
      }
    } catch (error) {
      log.error('Share note error:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToShare'));
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Export notes to CSV format
   * @param {Array} notes - Array of notes to export
   * @param {string} filename - Filename for the CSV
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleExportCSV(notes, filename = 'sticky-notes.csv') {
    try {
      if (!notes || notes.length === 0) {
        if (showErrorToast) {
          showErrorToast(t('noNotesToExport'));
        }
        return { success: false, error: t('noNotesToExport') };
      }
      
      // CSV headers
      const headers = ['ID', 'URL', 'Selector', 'Content', 'Theme', 'Created At', 'Updated At', 'Owner Email', 'Shared With'];
      
      // Escape CSV field
      const escapeCSV = (field) => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        // If field contains comma, newline, or quote, wrap in quotes and escape internal quotes
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      
      // Build CSV content
      const rows = [headers.join(',')];
      
      for (const note of notes) {
        const row = [
          escapeCSV(note.id),
          escapeCSV(note.url),
          escapeCSV(note.selector),
          escapeCSV(stripHtml(note.content)),
          escapeCSV(note.theme),
          escapeCSV(formatTimestamp(note.createdAt)),
          escapeCSV(formatTimestamp(note.updatedAt)),
          escapeCSV(note.ownerEmail),
          escapeCSV(Array.isArray(note.sharedWith) ? note.sharedWith.join('; ') : '')
        ];
        rows.push(row.join(','));
      }
      
      const csvContent = rows.join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      
      if (showSuccessToast) {
        showSuccessToast(t('exportedNotes', [notes.length]));
      }
      
      return { success: true, count: notes.length };
    } catch (error) {
      log.error('Export CSV error:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToExport'));
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Format timestamp for display
   * @param {any} timestamp - Timestamp (Date, string, or Firestore timestamp)
   * @returns {string} Formatted date string
   */
  function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    
    let date;
    if (typeof timestamp === 'object' && timestamp.seconds) {
      // Firestore timestamp
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) return '';
    
    return date.toISOString();
  }

  /**
   * Render a note item with expanded functionality (actions, metadata)
   * @param {Object} note - Note object
   * @returns {string} HTML string
   */
  function renderNoteItemExpanded(note) {
    const orphanedClass = note.isOrphaned ? ' note-item-orphaned' : '';
    const orphanedAttr = note.isOrphaned ? ' data-orphaned="true"' : '';
    const sharedBadge = note.isShared ? `
      <span class="note-item-shared-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
        Shared
      </span>` : '';
    const orphanedHint = note.isOrphaned ? `
      <div class="note-item-orphan-hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>${t('orphanedNoteHint')}</span>
      </div>` : '';
    
    const sharedWithText = note.sharedWith && note.sharedWith.length > 0 
      ? note.sharedWith.join(', ') 
      : t('notShared');
    
    return `
      <div class="note-item${orphanedClass}" data-id="${note.id}"${orphanedAttr}>
        <div class="note-item-header">
          <div class="note-item-color" style="background: ${getThemeColor(note.theme)}"></div>
          <div class="note-item-content">
            <div class="note-item-text">${stripHtml(note.content) || t('emptyNote')}</div>
            <div class="note-item-meta">
              <span class="note-item-selector">${escapeHtml(truncateSelector(note.selector))}</span>
              ${sharedBadge}
            </div>${orphanedHint}
          </div>
          <div class="note-item-actions">
            <button class="note-item-btn note-item-btn-expand" data-action="expand" title="${t('viewMetadata')}">
              <svg class="note-item-expand-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <button class="note-item-btn note-item-btn-share" data-action="share" title="${t('share')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
              </svg>
            </button>
            <button class="note-item-btn note-item-btn-danger" data-action="delete" title="${t('delete')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="note-item-details">
          <div class="note-item-detail-row">
            <span class="note-item-detail-label">${t('metadataElement')}</span>
            <span class="note-item-detail-value mono">${escapeHtml(note.selector)}</span>
          </div>
          <div class="note-item-detail-row">
            <span class="note-item-detail-label">${t('theme')}</span>
            <span class="note-item-detail-value">
              <span class="note-item-theme-dot" style="background: ${getThemeColor(note.theme)}; display: inline-block;"></span>
              ${note.theme || 'yellow'}
            </span>
          </div>
          <div class="note-item-detail-row">
            <span class="note-item-detail-label">${t('createdAt')}</span>
            <span class="note-item-detail-value">${formatRelativeTime(note.createdAt)}</span>
          </div>
          <div class="note-item-detail-row">
            <span class="note-item-detail-label">${t('metadataOwner')}</span>
            <span class="note-item-detail-value">${escapeHtml(note.ownerEmail || t('anonymous'))}</span>
          </div>
          <div class="note-item-detail-row">
            <span class="note-item-detail-label">${t('sharedWith')}</span>
            <span class="note-item-detail-value">${escapeHtml(sharedWithText)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Show share modal in popup
   * @param {string} noteId - Note ID to share
   * @returns {Promise<void>}
   */
  function showShareModal(noteId) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.className = 'confirm-backdrop';
      
      const modal = document.createElement('div');
      modal.className = 'confirm-dialog';
      modal.innerHTML = `
        <div class="confirm-message" style="margin-bottom: 12px;">
          <strong>${t('shareNote')}</strong>
          <p style="margin-top: 8px; font-size: 13px; color: #6b7280;">${t('shareDescription')}</p>
        </div>
        <input type="email" class="share-email-input" placeholder="${t('emailPlaceholder')}" style="
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 13px;
          margin-bottom: 16px;
          outline: none;
        ">
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn-cancel">${t('cancel')}</button>
          <button class="confirm-btn" style="background: #3b82f6; color: white;">${t('shareButton')}</button>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      const emailInput = modal.querySelector('.share-email-input');
      const cancelBtn = modal.querySelector('.confirm-btn-cancel');
      const shareBtn = modal.querySelector('.confirm-btn:not(.confirm-btn-cancel)');
      
      emailInput.focus();
      
      const cleanup = () => {
        overlay.remove();
        resolve();
      };
      
      cancelBtn.addEventListener('click', cleanup);
      
      shareBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (email) {
          await handleShareNote(noteId, email);
        }
        cleanup();
      });
      
      emailInput.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
          const email = emailInput.value.trim();
          if (email) {
            await handleShareNote(noteId, email);
          }
          cleanup();
        } else if (event.key === 'Escape') {
          cleanup();
        }
      });
      
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          cleanup();
        }
      });
    });
  }

  /**
   * Show confirm dialog in popup
   * @param {string} message - Confirmation message
   * @returns {Promise<boolean>} True if confirmed
   */
  function showConfirmDialog(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-backdrop';
      
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = `
        <p class="confirm-message">${message}</p>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn-cancel">${t('cancel')}</button>
          <button class="confirm-btn confirm-btn-confirm">${t('confirm')}</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const cancelBtn = dialog.querySelector('.confirm-btn-cancel');
      const confirmBtn = dialog.querySelector('.confirm-btn-confirm');
      
      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          cleanup(false);
        } else if (event.key === 'Enter') {
          cleanup(true);
        }
      };
      
      const cleanup = (result) => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
        resolve(result);
      };
      
      cancelBtn.addEventListener('click', () => cleanup(false));
      confirmBtn.addEventListener('click', () => cleanup(true));
      
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          cleanup(false);
        }
      });
      
      document.addEventListener('keydown', handleKeydown);
    });
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
    renderNoteItemExpanded,
    renderEmptyNotes,
    // New handlers
    handleDeleteNote,
    handleDeleteAllFromPage,
    handleDeleteAllNotes,
    handleShareNote,
    handleExportCSV,
    getAllNotes,
    showShareModal,
    showConfirmDialog,
    formatTimestamp
  };
}

// Export default handlers for use in popup.js
export const defaultHandlers = createPopupHandlers();
