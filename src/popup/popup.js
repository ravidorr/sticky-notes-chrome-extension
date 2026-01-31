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
let addNoteBtn, addPageNoteBtn, notesList, notesCount, actionHint;
let actionsBtn, actionsMenu, toggleVisibilityBtn, exportPageBtn, exportAllBtn, deletePageNotesBtn, deleteAllNotesBtn, deleteOldNotesBtn, settingsBtn;
// Delete old notes modal elements
let deleteOldNotesModal, closeDeleteOldNotesModal, agePresetBtns, customDaysInput, applyCustomDaysBtn;
let oldNotesPreview, oldNotesCount, oldNotesList, cancelDeleteOldNotes, confirmDeleteOldNotes;
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
  addPageNoteBtn = document.getElementById('addPageNoteBtn');
  notesList = document.getElementById('notesList');
  notesCount = document.getElementById('notesCount');
  actionHint = document.querySelector('.action-hint');
  
  // New elements
  actionsBtn = document.getElementById('actionsBtn');
  actionsMenu = document.getElementById('actionsMenu');
  toggleVisibilityBtn = document.getElementById('toggleVisibilityBtn');
  exportPageBtn = document.getElementById('exportPageBtn');
  exportAllBtn = document.getElementById('exportAllBtn');
  deletePageNotesBtn = document.getElementById('deletePageNotesBtn');
  deleteAllNotesBtn = document.getElementById('deleteAllNotesBtn');
  deleteOldNotesBtn = document.getElementById('deleteOldNotesBtn');
  settingsBtn = document.getElementById('settingsBtn');
  totalNotesCount = document.getElementById('totalNotesCount');
  
  // Delete old notes modal elements
  deleteOldNotesModal = document.getElementById('deleteOldNotesModal');
  closeDeleteOldNotesModal = document.getElementById('closeDeleteOldNotesModal');
  agePresetBtns = document.querySelectorAll('.age-preset-btn');
  customDaysInput = document.getElementById('customDaysInput');
  applyCustomDaysBtn = document.getElementById('applyCustomDaysBtn');
  oldNotesPreview = document.getElementById('oldNotesPreview');
  oldNotesCount = document.getElementById('oldNotesCount');
  oldNotesList = document.getElementById('oldNotesList');
  cancelDeleteOldNotes = document.getElementById('cancelDeleteOldNotes');
  confirmDeleteOldNotes = document.getElementById('confirmDeleteOldNotes');
  
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
 * Disable add note buttons for restricted pages
 * @param {string} url - Current tab URL
 */
function updateAddNoteButtonState(url) {
  if (isRestrictedUrl(url)) {
    addNoteBtn.disabled = true;
    if (addPageNoteBtn) {
      addPageNoteBtn.disabled = true;
    }
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
    
    // Visibility toggle button
    const visibilityBtn = item.querySelector('[data-action="visibility"]');
    if (visibilityBtn) {
      visibilityBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            const response = await chrome.tabs.sendMessage(tab.id, {
              action: 'toggleNoteVisibility',
              noteId
            });
            if (response?.success) {
              // Update the UI to reflect the new state
              const isHidden = response.isHidden;
              item.classList.toggle('note-item-hidden', isHidden);
              item.dataset.hidden = isHidden ? 'true' : '';
              
              // Update the button icon and title
              const svg = visibilityBtn.querySelector('svg');
              if (svg) {
                svg.innerHTML = isHidden
                  ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                  : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
              }
              visibilityBtn.title = isHidden ? t('showNote') : t('hideNote');
              
              showToast(isHidden ? t('noteHidden') : t('noteShown'));
            }
          }
        } catch {
          showToast(t('couldNotEnableSelection'), 'error');
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
  addPageNoteBtn.addEventListener('click', () => handlers.handleAddPageNote());
  closeBtn.addEventListener('click', () => window.close());
  
  // Setup tabs
  setupTabs();
  
  // Actions dropdown
  setupActionsDropdown();
}

/**
 * Update the toggle visibility button state based on current visibility
 * @param {boolean} notesVisible - Whether notes are currently visible
 */
function updateToggleVisibilityButton(notesVisible) {
  if (!toggleVisibilityBtn) return;
  
  const span = toggleVisibilityBtn.querySelector('span');
  const svg = toggleVisibilityBtn.querySelector('svg');
  
  if (notesVisible) {
    // Notes are visible, show "Hide all notes" with eye icon
    span.setAttribute('data-i18n', 'hideAllNotes');
    span.textContent = t('hideAllNotes');
    svg.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  } else {
    // Notes are hidden, show "Show all notes" with eye-off icon
    span.setAttribute('data-i18n', 'showAllNotes');
    span.textContent = t('showAllNotes');
    svg.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  }
}

/**
 * Setup actions dropdown menu
 */
function setupActionsDropdown() {
  // Toggle dropdown - also sync visibility state when opening
  actionsBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    const wasHidden = actionsMenu.classList.contains('hidden');
    actionsMenu.classList.toggle('hidden');
    
    // Sync visibility button state when opening dropdown
    if (wasHidden) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getNotesVisibility' });
          if (response?.success) {
            updateToggleVisibilityButton(response.notesVisible);
          }
        }
      } catch {
        // Content script not available, default to visible
        updateToggleVisibilityButton(true);
      }
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    actionsMenu.classList.add('hidden');
  });
  
  // Toggle visibility button
  toggleVisibilityBtn.addEventListener('click', async () => {
    actionsMenu.classList.add('hidden');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggleAllNotesVisibility' });
        if (response?.success) {
          updateToggleVisibilityButton(response.notesVisible);
        }
      }
    } catch {
      showToast(t('couldNotEnableSelection'), 'error');
    }
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
  
  // Delete old notes button - open modal
  deleteOldNotesBtn.addEventListener('click', () => {
    actionsMenu.classList.add('hidden');
    openDeleteOldNotesModal();
  });
  
  // Settings button - open options page
  settingsBtn.addEventListener('click', () => {
    actionsMenu.classList.add('hidden');
    chrome.runtime.openOptionsPage();
  });
  
  // Setup delete old notes modal
  setupDeleteOldNotesModal();
}

// State for delete old notes modal
let selectedDays = null;
let filteredOldNotes = [];

/**
 * Open the delete old notes modal
 */
function openDeleteOldNotesModal() {
  // Reset state
  selectedDays = null;
  filteredOldNotes = [];
  
  // Reset UI
  agePresetBtns.forEach(btn => btn.classList.remove('active'));
  customDaysInput.value = '';
  oldNotesPreview.classList.add('hidden');
  oldNotesList.innerHTML = '';
  oldNotesCount.textContent = '';
  confirmDeleteOldNotes.disabled = true;
  
  // Show modal
  deleteOldNotesModal.classList.remove('hidden');
}

/**
 * Close the delete old notes modal
 */
function closeDeleteOldNotesModalFn() {
  deleteOldNotesModal.classList.add('hidden');
  selectedDays = null;
  filteredOldNotes = [];
}

/**
 * Preview old notes based on selected days
 * @param {number} days - Number of days
 */
async function previewOldNotes(days) {
  selectedDays = days;
  
  // Fetch all notes
  const result = await handlers.getAllNotes();
  if (!result.success) {
    showToast(t('failedToDelete'), 'error');
    return;
  }
  
  // Filter by age
  filteredOldNotes = handlers.filterNotesByAge(result.notes, days);
  
  // Update preview
  oldNotesPreview.classList.remove('hidden');
  
  if (filteredOldNotes.length === 0) {
    oldNotesCount.textContent = t('noOldNotesFound', [days]);
    oldNotesCount.classList.add('empty');
    oldNotesList.innerHTML = '';
    confirmDeleteOldNotes.disabled = true;
  } else {
    oldNotesCount.textContent = t('notesFoundOlderThan', [filteredOldNotes.length, days]);
    oldNotesCount.classList.remove('empty');
    confirmDeleteOldNotes.disabled = false;
    
    // Render preview (max 5 notes)
    const previewNotes = filteredOldNotes.slice(0, 5);
    const remainingCount = filteredOldNotes.length - previewNotes.length;
    
    oldNotesList.innerHTML = previewNotes.map(note => renderOldNotePreviewItem(note)).join('');
    
    if (remainingCount > 0) {
      oldNotesList.innerHTML += `<div class="old-notes-more">${t('andMoreNotes', [remainingCount])}</div>`;
    }
  }
}

/**
 * Render a single note preview item for the delete old notes modal
 * @param {Object} note - Note object
 * @returns {string} HTML string
 */
function renderOldNotePreviewItem(note) {
  const themeColor = handlers.getThemeColor(note.theme);
  const content = note.content ? note.content.replace(/<[^>]*>/g, '').substring(0, 50) : t('emptyNote');
  
  // Extract hostname from URL
  let displayUrl = '';
  try {
    const url = new URL(note.url);
    displayUrl = url.hostname;
  } catch {
    displayUrl = note.url || '';
  }
  
  return `
    <div class="old-note-item">
      <div class="old-note-color" style="background: ${themeColor}"></div>
      <div class="old-note-content">
        <div class="old-note-text">${content}</div>
        <div class="old-note-url">${displayUrl}</div>
      </div>
    </div>
  `;
}

/**
 * Setup delete old notes modal event listeners
 */
function setupDeleteOldNotesModal() {
  // Close modal button
  closeDeleteOldNotesModal.addEventListener('click', closeDeleteOldNotesModalFn);
  
  // Cancel button
  cancelDeleteOldNotes.addEventListener('click', closeDeleteOldNotesModalFn);
  
  // Click on backdrop to close
  deleteOldNotesModal.querySelector('.modal-backdrop').addEventListener('click', closeDeleteOldNotesModalFn);
  
  // Age preset buttons
  agePresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days, 10);
      
      // Update active state
      agePresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customDaysInput.value = '';
      
      // Preview notes
      previewOldNotes(days);
    });
  });
  
  // Custom days input - on Enter key
  customDaysInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      applyCustomDays();
    }
  });
  
  // Apply custom days button
  applyCustomDaysBtn.addEventListener('click', applyCustomDays);
  
  // Confirm delete button
  confirmDeleteOldNotes.addEventListener('click', async () => {
    if (filteredOldNotes.length === 0) return;
    
    // Show confirmation
    const confirmed = await handlers.showConfirmDialog(
      t('deleteOldNotesConfirm', [filteredOldNotes.length])
    );
    
    if (confirmed) {
      // Delete the notes
      const result = await handlers.handleDeleteOldNotes(filteredOldNotes);
      
      if (result.success) {
        closeDeleteOldNotesModalFn();
        await refreshNotes();
      }
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !deleteOldNotesModal.classList.contains('hidden')) {
      closeDeleteOldNotesModalFn();
    }
  });
}

/**
 * Apply custom days from input
 */
function applyCustomDays() {
  const days = parseInt(customDaysInput.value, 10);
  
  if (!days || days <= 0 || days > 9999) {
    showToast(t('invalidEmail'), 'error'); // Generic invalid input message
    return;
  }
  
  // Clear preset selection
  agePresetBtns.forEach(b => b.classList.remove('active'));
  
  // Preview notes
  previewOldNotes(days);
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
  displayVersion,
  // Visibility toggle
  updateToggleVisibilityButton,
  // Delete old notes modal
  openDeleteOldNotesModal,
  closeDeleteOldNotesModalFn,
  previewOldNotes,
  renderOldNotePreviewItem,
  setupDeleteOldNotesModal,
  applyCustomDays
};
export { createPopupHandlers } from './handlers.js';
