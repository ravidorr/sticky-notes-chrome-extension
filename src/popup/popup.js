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
  showErrorToast: (msg) => showToast(msg, 'error')
});

// DOM Elements (will be populated after DOMContentLoaded)
let authSection, userSection, loginBtn, logoutBtn, closeBtn;
let userAvatar, userName, userEmail;
let addNoteBtn, notesList, notesCount, actionHint;

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
  if (notes.length === 0) {
    notesList.innerHTML = handlers.renderEmptyNotes();
    return;
  }
  
  notesList.innerHTML = notes.map(note => handlers.renderNoteItem(note)).join('');
  
  // Add click handlers
  notesList.querySelectorAll('.note-item').forEach(item => {
    const isOrphaned = item.dataset.orphaned === 'true';
    item.addEventListener('click', () => handlers.handleNoteClick(item.dataset.id, isOrphaned));
  });
}

/**
 * Handle login button click
 */
async function onLogin() {
  const result = await handlers.handleLogin();
  if (result.success) {
    showUserSection(result.user);
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
  
  // Setup event listeners
  loginBtn.addEventListener('click', onLogin);
  logoutBtn.addEventListener('click', onLogout);
  addNoteBtn.addEventListener('click', () => handlers.handleAddNote());
  closeBtn.addEventListener('click', () => window.close());
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
  initDOMElements 
};
export { createPopupHandlers } from './handlers.js';
