/**
 * Popup Event Handlers
 * Extracted for testability with dependency injection
 */

import { isRestrictedUrl, THEME_COLORS, escapeHtml, stripHtml, truncate, isValidEmail, formatRelativeTime } from '../shared/utils.js';
import { popupLogger as defaultLog } from '../shared/logger.js';
import { t } from '../shared/i18n.js';
// Report generator is lazy-loaded to reduce initial bundle size
// import { ReportGenerator, REPORT_SCOPES, downloadReport } from '../shared/reportGenerator.js';

// Constants needed for report scope (avoid loading full module)
const REPORT_SCOPES = {
  CURRENT_PAGE: 'currentPage',
  ALL_NOTES: 'allNotes',
  SELECTED: 'selected',
  DATE_RANGE: 'dateRange'
};

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
   * Handle add page note button click
   * Creates a page-level note (not anchored to any element)
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleAddPageNote() {
    log.debug(' Add Page Note button clicked');
    
    try {
      // Get current active tab
      const [tab] = await chromeTabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        log.error('No active tab found');
        return { success: false, error: 'No active tab found' };
      }
      
      // Check if it's a restricted page
      if (isRestrictedUrl(tab.url)) {
        log.debug(' URL is restricted, cannot create note');
        return { success: false, error: 'Restricted URL' };
      }
      
      // Send createPageLevelNote message to content script
      log.debug(' Sending createPageLevelNote message to tab', tab.id);
      try {
        const response = await chromeTabs.sendMessage(tab.id, { action: 'createPageLevelNote' });
        
        if (response?.success) {
          if (showSuccessToast) {
            showSuccessToast(t('pageNoteCreated'));
          }
          windowClose();
          return { success: true };
        } else {
          log.error('Failed to create page note:', response?.error);
          if (showErrorToast) {
            showErrorToast(t('failedToCreatePageNote'));
          }
          return { success: false, error: response?.error || 'Unknown error' };
        }
      } catch (error) {
        log.error(' Message failed:', error.message);
        
        // Content script not loaded - inject it first
        if (error.message.includes('Receiving end does not exist') || 
            error.message.includes('Could not establish connection')) {
          log.error(' Content script not found, injecting...');
          await injectContentScript(tab.id);
          
          // Wait for the script to initialize with retry
          let retries = 5;
          let lastError = null;
          
          while (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
            try {
              const response = await chromeTabs.sendMessage(tab.id, { action: 'createPageLevelNote' });
              if (response?.success) {
                if (showSuccessToast) {
                  showSuccessToast(t('pageNoteCreated'));
                }
                windowClose();
                return { success: true };
              } else {
                // Content script responded with failure - no point in retrying
                log.error('Content script returned failure after injection:', response?.error);
                if (showErrorToast) {
                  showErrorToast(t('failedToCreatePageNote'));
                }
                return { success: false, error: response?.error || 'Unknown error' };
              }
            } catch (retryError) {
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
      log.error('Error creating page note:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToCreatePageNote'));
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
   * Leave a shared note (remove yourself from the shared list)
   * @param {string} noteId - Note ID to leave
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleLeaveNote(noteId) {
    try {
      const response = await chromeRuntime.sendMessage({
        action: 'leaveSharedNote',
        noteId
      });
      
      if (response.success) {
        if (showSuccessToast) {
          showSuccessToast(t('leftNote'));
        }
        return { success: true };
      } else {
        log.error('Leave note failed:', response.error);
        if (showErrorToast) {
          showErrorToast(response.error || t('failedToLeave'));
        }
        return { success: false, error: response.error };
      }
    } catch (error) {
      log.error('Leave note error:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToLeave'));
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
   * Generate a formatted report from notes
   * @param {Object} options - Report options (format, scope, includeMetadata, etc.)
   * @param {Array} currentPageNotes - Notes from the current page (for currentPage scope)
   * @returns {Promise<Object>} Result with success flag
   */
  async function handleGenerateReport(options, currentPageNotes = []) {
    try {
      // Determine which notes to include based on scope
      let notes = [];
      
      if (options.scope === REPORT_SCOPES.CURRENT_PAGE) {
        notes = currentPageNotes;
      } else if (options.scope === REPORT_SCOPES.ALL_NOTES || options.scope === REPORT_SCOPES.DATE_RANGE) {
        const result = await getAllNotes();
        if (!result.success) {
          return { success: false, error: result.error };
        }
        notes = result.notes;
      } else if (options.scope === REPORT_SCOPES.SELECTED) {
        // Selected notes would be filtered by selectedNoteIds in options
        if (!options.selectedNoteIds || options.selectedNoteIds.length === 0) {
          return { success: false, error: t('reportNoNotesSelected') || 'No notes selected' };
        }
        const result = await getAllNotes();
        if (!result.success) {
          return { success: false, error: result.error };
        }
        const selectedSet = new Set(options.selectedNoteIds);
        notes = result.notes.filter(n => selectedSet.has(n.id));
      }
      
      if (!notes || notes.length === 0) {
        if (showErrorToast) {
          showErrorToast(t('noNotesForReport') || 'No notes to include in report');
        }
        return { success: false, error: t('noNotesForReport') || 'No notes to include in report' };
      }
      
      // If comments are requested, fetch them for each note
      if (options.includeComments) {
        for (const note of notes) {
          try {
            const response = await chromeRuntime.sendMessage({
              action: 'getCommentsForNote',
              noteId: note.id
            });
            if (response?.success && response.comments) {
              note.comments = response.comments;
            }
          } catch {
            // If comments fail to load, continue without them
            note.comments = [];
          }
        }
      }
      
      // Get user context
      const user = await checkAuthState();
      const context = {
        userEmail: user?.email || ''
      };
      
      // Lazy load report generator only when needed
      const { ReportGenerator, downloadReport } = await import('../shared/reportGenerator.js');
      
      // Create generator and generate report
      const generator = new ReportGenerator(options);
      const report = await generator.generate(notes, context);
      
      // Download the report
      downloadReport(report);
      
      if (showSuccessToast) {
        showSuccessToast(t('reportGenerated') || 'Report generated');
      }
      
      return { success: true, filename: report.filename };
    } catch (error) {
      log.error('Generate report error:', error);
      if (showErrorToast) {
        showErrorToast(t('reportFailed') || 'Failed to generate report');
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
    const hiddenClass = note.isHidden ? ' note-item-hidden' : '';
    const orphanedAttr = note.isOrphaned ? ' data-orphaned="true"' : '';
    const hiddenAttr = note.isHidden ? ' data-hidden="true"' : '';
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
    
    // Visibility toggle button - eye icon for visible, eye-off for hidden
    const visibilityIcon = note.isHidden
      ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    const visibilityTitle = note.isHidden ? t('showNote') : t('hideNote');
    
    return `
      <div class="note-item${orphanedClass}${hiddenClass}" data-id="${note.id}"${orphanedAttr}${hiddenAttr}>
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
            <button class="note-item-btn note-item-btn-visibility" data-action="visibility" title="${visibilityTitle}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${visibilityIcon}
              </svg>
            </button>
            <button class="note-item-btn note-item-btn-expand" data-action="expand" title="${t('viewMetadata')}">
              <svg class="note-item-expand-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            ${!note.isShared ? `<button class="note-item-btn note-item-btn-share" data-action="share" title="${t('share')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
              </svg>
            </button>` : ''}
            ${note.isShared ? `<button class="note-item-btn note-item-btn-warning" data-action="leave" title="${t('leaveNote')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>` : `<button class="note-item-btn note-item-btn-danger" data-action="delete" title="${t('delete')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>`}
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

  /**
   * Get unread shared notes
   * @returns {Promise<Object>} Result with notes array
   */
  async function getUnreadSharedNotes() {
    try {
      const response = await chromeRuntime.sendMessage({
        action: 'getUnreadSharedNotes'
      });
      
      if (response.success) {
        return { success: true, notes: response.notes || [] };
      } else {
        log.error('Get unread shared notes failed:', response.error);
        return { success: false, notes: [], error: response.error };
      }
    } catch (error) {
      log.error('Get unread shared notes error:', error);
      return { success: false, notes: [], error: error.message };
    }
  }

  /**
   * Get the count of unread shared notes
   * @returns {Promise<Object>} Result with count
   */
  async function getUnreadSharedCount() {
    try {
      const response = await chromeRuntime.sendMessage({
        action: 'getUnreadSharedCount'
      });
      
      if (response.success) {
        return { success: true, count: response.count || 0 };
      } else {
        log.error('Get unread shared count failed:', response.error);
        return { success: false, count: 0, error: response.error };
      }
    } catch (error) {
      log.error('Get unread shared count error:', error);
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Mark a shared note as read
   * @param {string} noteId - Note ID to mark as read
   * @returns {Promise<Object>} Result
   */
  async function markSharedNoteAsRead(noteId) {
    try {
      const response = await chromeRuntime.sendMessage({
        action: 'markSharedNoteRead',
        noteId
      });
      
      return { success: response.success };
    } catch (error) {
      log.error('Mark shared note read error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Render a shared note item HTML
   * @param {Object} note - Note object
   * @returns {string} HTML string
   */
  function renderSharedNoteItem(note) {
    // Extract hostname from URL for display
    let displayUrl = '';
    try {
      const url = new URL(note.url);
      displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '');
      // Truncate if too long
      if (displayUrl.length > 40) {
        displayUrl = displayUrl.substring(0, 40) + '...';
      }
    } catch (_e) {
      displayUrl = note.url || '';
    }
    
    return `
      <div class="shared-note-item" data-id="${note.id}" data-url="${escapeHtml(note.url)}">
        <div class="shared-note-header">
          <div class="shared-note-unread-dot"></div>
          <div class="note-item-color" style="background: ${getThemeColor(note.theme)}"></div>
          <div class="shared-note-content">
            <div class="shared-note-text">${stripHtml(note.content) || t('emptyNote')}</div>
            <div class="shared-note-meta">
              <div class="shared-note-url">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                <span class="shared-note-url-text">${escapeHtml(displayUrl)}</span>
              </div>
              <div class="shared-note-info">
                <span class="shared-note-owner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  ${escapeHtml(note.ownerEmail || t('anonymous'))}
                </span>
                <span class="shared-note-time">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  ${formatRelativeTime(note.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render empty shared notes message
   * @returns {string} HTML string
   */
  function renderEmptySharedNotes() {
    return `
      <div class="notes-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
        <p>${t('noUnreadSharedNotes')}</p>
      </div>
    `;
  }

  /**
   * Filter notes by age (older than specified days)
   * @param {Array} notes - Array of notes to filter
   * @param {number} daysOld - Number of days (notes older than this will be returned)
   * @returns {Array} Filtered notes array
   */
  function filterNotesByAge(notes, daysOld) {
    if (!Array.isArray(notes) || notes.length === 0) {
      return [];
    }
    
    if (typeof daysOld !== 'number' || daysOld <= 0 || !isFinite(daysOld)) {
      return [];
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    cutoffDate.setHours(0, 0, 0, 0); // Start of day for consistent comparison
    
    return notes.filter(note => {
      if (!note.createdAt) {
        return false;
      }
      
      let noteDate;
      if (typeof note.createdAt === 'object' && note.createdAt.seconds) {
        // Firestore timestamp
        noteDate = new Date(note.createdAt.seconds * 1000);
      } else {
        noteDate = new Date(note.createdAt);
      }
      
      // Check for valid date
      if (isNaN(noteDate.getTime())) {
        return false;
      }
      
      return noteDate < cutoffDate;
    });
  }

  /**
   * Delete multiple old notes
   * @param {Array} notes - Array of notes to delete
   * @returns {Promise<Object>} Result with success flag and count
   */
  async function handleDeleteOldNotes(notes) {
    try {
      if (!Array.isArray(notes) || notes.length === 0) {
        return { success: true, count: 0 };
      }
      
      let deletedCount = 0;
      const errors = [];
      
      for (const note of notes) {
        try {
          const response = await chromeRuntime.sendMessage({
            action: 'deleteNote',
            noteId: note.id
          });
          
          if (response.success) {
            deletedCount++;
          } else {
            errors.push({ noteId: note.id, error: response.error });
          }
        } catch (error) {
          errors.push({ noteId: note.id, error: error.message });
        }
      }
      
      if (deletedCount > 0) {
        if (showSuccessToast) {
          showSuccessToast(t('oldNotesDeleted', [deletedCount]));
        }
      }
      
      if (errors.length > 0) {
        log.error('Some notes failed to delete:', errors);
      }
      
      return { success: true, count: deletedCount, errors };
    } catch (error) {
      log.error('Delete old notes error:', error);
      if (showErrorToast) {
        showErrorToast(t('failedToDelete'));
      }
      return { success: false, error: error.message };
    }
  }

  return {
    checkAuthState,
    handleLogin,
    handleLogout,
    handleAddNote,
    handleAddPageNote,
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
    handleLeaveNote,
    handleExportCSV,
    handleGenerateReport,
    getAllNotes,
    showShareModal,
    showConfirmDialog,
    formatTimestamp,
    // Shared notes handlers
    getUnreadSharedNotes,
    getUnreadSharedCount,
    markSharedNoteAsRead,
    renderSharedNoteItem,
    renderEmptySharedNotes,
    // Delete old notes handlers
    filterNotesByAge,
    handleDeleteOldNotes
  };
}

// Export default handlers for use in popup.js
export const defaultHandlers = createPopupHandlers();
