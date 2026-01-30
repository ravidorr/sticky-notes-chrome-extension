/**
 * Popup Script
 * Handles the extension popup UI and interactions
 */

import { createPopupHandlers } from './handlers.js';
import { initializeI18n, t } from '../shared/i18n.js';
import { isRestrictedUrl } from '../shared/utils.js';

/**
 * Show a toast notification in the popup
 * @param {string} message - Message to display
 * @param {string} type - 'error' or 'success'
 */
function showToast(message, type = 'error') {
  // Remove existing toast if any
  const existing = document.querySelector('.popup-toast');
  if (existing) {
    existing.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `popup-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Create handlers with toast support
const handlers = createPopupHandlers({
  showErrorToast: (msg) => showToast(msg, 'error'),
  showSuccessToast: (msg) => showToast(msg, 'success')
});

// DOM Elements (will be populated after DOMContentLoaded)
let authSection, userSection, loginBtn, logoutBtn, closeBtn;
let userAvatar, userName, userEmail;
let addNoteBtn, notesList, notesCount, actionHint;
let actionsBtn, actionsMenu, exportPageBtn, exportAllBtn, deletePageNotesBtn, deleteAllNotesBtn;
let totalNotesCount, versionDisplay;
// Tab elements
let thisPageTab, sharedTab, thisPageContent, sharedContent;
let thisPageCount, sharedCount, sharedNotesList;

// Current page notes (for actions)
let currentPageNotes = [];

/**
 * Initialize DOM elements
 */
function initDOMElements() {
  authSection = document.getElementById('authSection');
  userSection = document.getElementById('userSection');
  loginBtn = document.getElementById('loginBtn');
  logoutBtn = document.getElementById('logoutBtn');
  closeBtn = document.getElementById('closeBtn');
  userAvatar = document.getElementById('userAvatar');
  userName = document.getElementById('userName');
  userEmail = document.getElementById('userEmail');
  addNoteBtn = document.getElementById('addNoteBtn');
  notesList = document.getElementById('notesList');
  notesCount = document.getElementById('notesCount');
  actionHint = document.querySelector('.action-hint');
  
  // New elements
  actionsBtn = document.getElementById('actionsBtn');
  actionsMenu = document.getElementById('actionsMenu');
  exportPageBtn = document.getElementById('exportPageBtn');
  exportAllBtn = document.getElementById('exportAllBtn');
  deletePageNotesBtn = document.getElementById('deletePageNotesBtn');
  deleteAllNotesBtn = document.getElementById('deleteAllNotesBtn');
  totalNotesCount = document.getElementById('totalNotesCount');
  
  // Tab elements
  thisPageTab = document.getElementById('thisPageTab');
  sharedTab = document.getElementById('sharedTab');
  thisPageContent = document.getElementById('thisPageContent');
  sharedContent = document.getElementById('sharedContent');
  thisPageCount = document.getElementById('thisPageCount');
  sharedCount = document.getElementById('sharedCount');
  sharedNotesList = document.getElementById('sharedNotesList');
  
  // Version display
  versionDisplay = document.getElementById('versionDisplay');
}

/**
 * Display version from manifest
 * Reads the version from chrome.runtime.getManifest() to ensure it's always in sync
 */
function displayVersion() {
  if (!versionDisplay) return;
  
  try {
    const manifest = chrome.runtime.getManifest();
    versionDisplay.textContent = `v${manifest.version}`;
  } catch {
    // Fallback for testing environment where chrome API is not available
    versionDisplay.textContent = '';
  }
}

/**
 * Disable add note button for restricted pages
 * @param {string} url - Current tab URL
 */
function updateAddNoteButtonState(url) {
  if (isRestrictedUrl(url)) {
    addNoteBtn.disabled = true;
    actionHint.textContent = t('restrictedPageHint');
    actionHint.classList.add('restricted');
  }
}

/**
 * Show authentication section
 */
function showAuthSection() {
  authSection.classList.remove('hidden');
  userSection.classList.add('hidden');
}

/**
 * Show user section
 * @param {Object} user - User object with name, email, avatar
 */
function showUserSection(user) {
  authSection.classList.add('hidden');
  userSection.classList.remove('hidden');
  
  userAvatar.src = user.photoURL || 'icons/default-avatar.png';
  userName.textContent = user.displayName || 'User';
  userEmail.textContent = user.email || '';
}

/**
 * Render notes list
 * @param {Array} notes - Array of note objects
 */
function renderNotesList(notes) {
  // Store for actions
  currentPageNotes = notes;
  
  if (notes.length === 0) {
    notesList.innerHTML = handlers.renderEmptyNotes();
    return;
  }
  
  notesList.innerHTML = notes.map(note => handlers.renderNoteItemExpanded(note)).join('');
  
  // Add event handlers for each note item
  notesList.querySelectorAll('.note-item').forEach(item => {
    const noteId = item.dataset.id;
    const isOrphaned = item.dataset.orphaned === 'true';
    
    // Click on note header to jump to note (excluding action buttons)
    const header = item.querySelector('.note-item-header');
    header.addEventListener('click', (event) => {
      // Don't navigate if clicking an action button
      if (event.target.closest('.note-item-btn')) return;
      handleNoteNavigate(noteId, isOrphaned);
    });
    
    // Expand/collapse metadata
    const expandBtn = item.querySelector('[data-action="expand"]');
    if (expandBtn) {
      expandBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        item.classList.toggle('expanded');
        expandBtn.title = item.classList.contains('expanded') ? t('hideMetadata') : t('viewMetadata');
      });
    }
    
    // Share button
    const shareBtn = item.querySelector('[data-action="share"]');
    if (shareBtn) {
      shareBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await handlers.showShareModal(noteId);
      });
    }
    
    // Delete button
    const deleteBtn = item.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const confirmed = await handlers.showConfirmDialog(t('deleteConfirm'));
        if (confirmed) {
          const result = await handlers.handleDeleteNote(noteId);
          if (result.success) {
            // Refresh the notes list
            await refreshNotes();
          }
        }
      });
    }
    
    // Leave button (for shared notes)
    const leaveBtn = item.querySelector('[data-action="leave"]');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const confirmed = await handlers.showConfirmDialog(t('leaveNoteConfirm'));
        if (confirmed) {
          const result = await handlers.handleLeaveNote(noteId);
          if (result.success) {
            // Refresh the notes list
            await refreshNotes();
          }
        }
      });
    }
  });
}

/**
 * Handle clicking a note to navigate and maximize
 * @param {string} noteId - Note ID
 * @param {boolean} isOrphaned - Whether note is orphaned
 */
async function handleNoteNavigate(noteId, isOrphaned) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) return;
    
    // Use action that highlights AND maximizes the note
    const action = isOrphaned ? 'showOrphanedNote' : 'highlightAndMaximizeNote';
    
    await chrome.tabs.sendMessage(tab.id, { 
      action, 
      noteId 
    });
    
    window.close();
  } catch (_error) {
    showToast(t('couldNotEnableSelection'), 'error');
  }
}

/**
 * Refresh the notes list
 */
async function refreshNotes() {
  const notesResult = await handlers.loadNotesForCurrentTab();
  renderNotesList(notesResult.notes);
  notesCount.textContent = notesResult.notes.length;
  
  // Update "This Page" tab count badge
  thisPageCount.textContent = notesResult.notes.length.toString();
  
  // Also update total notes count
  await updateTotalNotesCount();
}

/**
 * Update total notes count in footer
 */
async function updateTotalNotesCount() {
  const result = await handlers.getAllNotes();
  if (result.success && result.notes.length > 0) {
    totalNotesCount.textContent = t('totalNotes', [result.notes.length]);
  } else {
    totalNotesCount.textContent = '';
  }
}

/**
 * Switch between tabs
 * @param {string} tabName - 'this-page' or 'shared'
 */
async function switchTab(tabName) {
  
  // Update tab button states
  thisPageTab.classList.toggle('active', tabName === 'this-page');
  sharedTab.classList.toggle('active', tabName === 'shared');
  
  // Update tab content visibility
  thisPageContent.classList.toggle('hidden', tabName !== 'this-page');
  sharedContent.classList.toggle('hidden', tabName !== 'shared');
  
  // Load shared notes when switching to shared tab
  if (tabName === 'shared') {
    await loadAndRenderSharedNotes();
  }
}

/**
 * Load and render shared notes
 */
async function loadAndRenderSharedNotes() {
  const result = await handlers.getUnreadSharedNotes();
  
  if (result.notes.length === 0) {
    sharedNotesList.innerHTML = handlers.renderEmptySharedNotes();
    return;
  }
  
  sharedNotesList.innerHTML = result.notes.map(note => handlers.renderSharedNoteItem(note)).join('');
  
  // Add click handlers for each shared note item
  sharedNotesList.querySelectorAll('.shared-note-item').forEach(item => {
    item.addEventListener('click', () => handleSharedNoteClick(item));
  });
}

/**
 * Handle clicking on a shared note - mark as read and open URL in new tab
 * @param {HTMLElement} item - The clicked note item element
 */
async function handleSharedNoteClick(item) {
  const noteId = item.dataset.id;
  const noteUrl = item.dataset.url;
  
  if (!noteId || !noteUrl) return;
  
  try {
    // Mark as read first
    await handlers.markSharedNoteAsRead(noteId);
    
    // Open in new tab
    await chrome.tabs.create({ url: noteUrl });
    
    // Close popup
    window.close();
  } catch  {
    showToast(t('failedToOpenNote') || 'Failed to open note', 'error');
  }
}

/**
 * Update the shared notes count badge
 */
async function updateSharedNotesCount() {
  const result = await handlers.getUnreadSharedCount();
  const count = result.count || 0;
  
  sharedCount.textContent = count.toString();
  sharedCount.classList.toggle('hidden', count === 0);
}

/**
 * Setup tab navigation
 */
function setupTabs() {
  thisPageTab.addEventListener('click', () => switchTab('this-page'));
  sharedTab.addEventListener('click', () => switchTab('shared'));
}

/**
 * Handle login button click
 */
async function onLogin() {
  // Disable button and show loading state
  loginBtn.disabled = true;
  const originalText = loginBtn.innerHTML;
  loginBtn.innerHTML = `<span class="spinner"></span> ${t('signingIn')}`;
  
  try {
    const result = await handlers.handleLogin();
    if (result.success) {
      showUserSection(result.user);
    } else {
      // Show error to user
      showToast(result.error || t('loginFailed'), 'error');
    }
  } catch (error) {
    showToast(error.message || t('loginFailed'), 'error');
  } finally {
    // Restore button state
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalText;
  }
}

/**
 * Handle logout button click
 */
async function onLogout() {
  const result = await handlers.handleLogout();
  if (result.success) {
    showAuthSection();
  }
}

/**
 * Initialize the popup
 */
async function init() {
  // Initialize i18n for HTML elements
  initializeI18n();
  
  initDOMElements();
  
  // Display version from manifest
  displayVersion();
  
  // Check auth state
  const user = await handlers.checkAuthState();
  if (user) {
    showUserSection(user);
  } else {
    showAuthSection();
  }
  
  // Get current tab and check if restricted
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    updateAddNoteButtonState(tab.url);
  }
  
  // Load notes for current tab
  const notesResult = await handlers.loadNotesForCurrentTab();
  renderNotesList(notesResult.notes);
  notesCount.textContent = notesResult.notes.length;
  
  // Update "This Page" tab count badge
  thisPageCount.textContent = notesResult.notes.length.toString();
  
  // Update total notes count
  await updateTotalNotesCount();
  
  // Update shared notes count badge
  await updateSharedNotesCount();
  
  // Setup event listeners
  loginBtn.addEventListener('click', onLogin);
  logoutBtn.addEventListener('click', onLogout);
  addNoteBtn.addEventListener('click', () => handlers.handleAddNote());
  closeBtn.addEventListener('click', () => window.close());
  
  // Setup tabs
  setupTabs();
  
  // Actions dropdown
  setupActionsDropdown();
}

/**
 * Setup actions dropdown menu
 */
function setupActionsDropdown() {
  // Toggle dropdown
  actionsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    actionsMenu.classList.toggle('hidden');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    actionsMenu.classList.add('hidden');
  });
  
  // Export notes from this page
  exportPageBtn.addEventListener('click', async () => {
    actionsMenu.classList.add('hidden');
    if (currentPageNotes.length > 0) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const hostname = tab?.url ? new URL(tab.url).hostname : 'page';
      const filename = `sticky-notes-${hostname}-${new Date().toISOString().slice(0, 10)}.csv`;
      await handlers.handleExportCSV(currentPageNotes, filename);
    } else {
      showToast(t('noNotesToExport'), 'error');
    }
  });
  
  // Export all notes
  exportAllBtn.addEventListener('click', async () => {
    actionsMenu.classList.add('hidden');
    const result = await handlers.getAllNotes();
    if (result.success && result.notes.length > 0) {
      const filename = `sticky-notes-all-${new Date().toISOString().slice(0, 10)}.csv`;
      await handlers.handleExportCSV(result.notes, filename);
    } else {
      showToast(t('noNotesToExport'), 'error');
    }
  });
  
  // Delete all notes from this page
  deletePageNotesBtn.addEventListener('click', async () => {
    actionsMenu.classList.add('hidden');
    if (currentPageNotes.length === 0) {
      showToast(t('noNotesYet'), 'error');
      return;
    }
    const confirmed = await handlers.showConfirmDialog(
      t('deleteAllFromPageConfirm', [currentPageNotes.length])
    );
    if (confirmed) {
      await handlers.handleDeleteAllFromPage(currentPageNotes);
      await refreshNotes();
    }
  });
  
  // Delete all notes
  deleteAllNotesBtn.addEventListener('click', async () => {
    actionsMenu.classList.add('hidden');
    const result = await handlers.getAllNotes();
    if (!result.success || result.notes.length === 0) {
      showToast(t('noNotesToExport'), 'error');
      return;
    }
    const confirmed = await handlers.showConfirmDialog(
      t('deleteAllNotesConfirm', [result.notes.length])
    );
    if (confirmed) {
      await handlers.handleDeleteAllNotes();
      await refreshNotes();
    }
  });
}

// Initialize popup when DOM is ready
// Guard with test environment check
if (typeof globalThis.__JEST__ === 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

// Export for testing
export { 
  init, 
  showAuthSection, 
  showUserSection, 
  renderNotesList,
  initDOMElements,
  refreshNotes,
  handleNoteNavigate,
  updateTotalNotesCount,
  setupActionsDropdown,
  // Tab functions
  switchTab,
  loadAndRenderSharedNotes,
  handleSharedNoteClick,
  updateSharedNotesCount,
  setupTabs,
  // Version display
  displayVersion
};
export { createPopupHandlers } from './handlers.js';
