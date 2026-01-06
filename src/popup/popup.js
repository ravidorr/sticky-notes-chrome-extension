/**
 * Popup Script
 * Handles the extension popup UI and interactions
 */

// DOM Elements
const authSection = document.getElementById('authSection');
const userSection = document.getElementById('userSection');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const addNoteBtn = document.getElementById('addNoteBtn');
const notesList = document.getElementById('notesList');
const notesCount = document.getElementById('notesCount');
const settingsBtn = document.getElementById('settingsBtn');

/**
 * Initialize the popup
 */
async function init() {
  // Check auth state
  await checkAuthState();
  
  // Load notes for current tab
  await loadNotesForCurrentTab();
  
  // Setup event listeners
  setupEventListeners();
}

/**
 * Check authentication state
 */
async function checkAuthState() {
  try {
    const result = await chrome.storage.local.get(['user']);
    if (result.user) {
      showUserSection(result.user);
    } else {
      showAuthSection();
    }
  } catch (error) {
    console.error('Error checking auth state:', error);
    showAuthSection();
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
 * Handle login button click
 */
async function handleLogin() {
  try {
    // Send message to background script to initiate login
    const response = await chrome.runtime.sendMessage({ action: 'login' });
    if (response.success) {
      showUserSection(response.user);
    } else {
      console.error('Login failed:', response.error);
    }
  } catch (error) {
    console.error('Login error:', error);
  }
}

/**
 * Handle logout button click
 */
async function handleLogout() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'logout' });
    if (response.success) {
      showAuthSection();
    }
  } catch (error) {
    console.error('Logout error:', error);
  }
}

/**
 * Handle add note button click
 */
async function handleAddNote() {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.error('No active tab found');
      return;
    }
    
    // Send message to content script to enable selection mode
    await chrome.tabs.sendMessage(tab.id, { action: 'enableSelectionMode' });
    
    // Close the popup
    window.close();
  } catch (error) {
    console.error('Error enabling selection mode:', error);
  }
}

/**
 * Load notes for the current tab
 */
async function loadNotesForCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      return;
    }
    
    // Get notes from storage
    const result = await chrome.storage.local.get(['notes']);
    const allNotes = result.notes || [];
    
    // Filter notes for current URL
    const currentUrl = new URL(tab.url);
    const pageNotes = allNotes.filter(note => {
      try {
        const noteUrl = new URL(note.url);
        return noteUrl.origin + noteUrl.pathname === currentUrl.origin + currentUrl.pathname;
      } catch {
        return false;
      }
    });
    
    // Update UI
    renderNotesList(pageNotes);
    notesCount.textContent = pageNotes.length;
  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

/**
 * Render notes list
 * @param {Array} notes - Array of note objects
 */
function renderNotesList(notes) {
  if (notes.length === 0) {
    notesList.innerHTML = `
      <div class="notes-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M7 8h10M7 12h10M7 16h6"/>
        </svg>
        <p>No notes on this page yet</p>
      </div>
    `;
    return;
  }
  
  notesList.innerHTML = notes.map(note => `
    <div class="note-item" data-id="${note.id}">
      <div class="note-item-color" style="background: ${getThemeColor(note.theme)}"></div>
      <div class="note-item-content">
        <div class="note-item-text">${escapeHtml(note.content) || 'Empty note'}</div>
        <div class="note-item-meta">
          <span class="note-item-selector">${escapeHtml(truncateSelector(note.selector))}</span>
        </div>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  notesList.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', () => handleNoteClick(item.dataset.id));
  });
}

/**
 * Handle note item click - scroll to element and highlight note
 * @param {string} noteId - Note ID
 */
async function handleNoteClick(noteId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      return;
    }
    
    // Send message to content script to highlight note
    await chrome.tabs.sendMessage(tab.id, { 
      action: 'highlightNote', 
      noteId 
    });
    
    // Close popup
    window.close();
  } catch (error) {
    console.error('Error highlighting note:', error);
  }
}

/**
 * Get theme color
 * @param {string} theme - Theme name
 * @returns {string} Color hex
 */
function getThemeColor(theme) {
  const colors = {
    yellow: '#facc15',
    blue: '#3b82f6',
    green: '#22c55e',
    pink: '#ec4899'
  };
  return colors[theme] || colors.yellow;
}

/**
 * Truncate selector for display
 * @param {string} selector - CSS selector
 * @returns {string} Truncated selector
 */
function truncateSelector(selector) {
  if (!selector) return '';
  if (selector.length <= 30) return selector;
  return selector.substring(0, 30) + '...';
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  addNoteBtn.addEventListener('click', handleAddNote);
  settingsBtn.addEventListener('click', () => {
    // TODO: Open settings page
    console.log('Settings clicked');
  });
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', init);
