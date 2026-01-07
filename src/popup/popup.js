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
  console.log('[Popup] Add Note button clicked');
  
  try {
    // Get current active tab
    console.log('[Popup] Querying active tab...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.error('[Popup] No active tab found');
      return;
    }
    
    console.log('[Popup] Active tab:', { id: tab.id, url: tab.url });
    
    // Check if it's a restricted page
    if (isRestrictedUrl(tab.url)) {
      console.log('[Popup] URL is restricted, cannot inject content script');
      alert('Cannot add notes to this page. Chrome system pages and extension pages are not supported.');
      return;
    }
    
    // Try to send message to content script
    console.log('[Popup] Sending enableSelectionMode message to tab', tab.id);
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'enableSelectionMode' });
      console.log('[Popup] Content script responded:', response);
    } catch (error) {
      console.log('[Popup] First message failed:', error.message);
      
      // Content script not loaded - inject it first
      if (error.message.includes('Receiving end does not exist') || 
          error.message.includes('Could not establish connection')) {
        console.log('[Popup] Content script not found, injecting...');
        await injectContentScript(tab.id);
        
        // Wait for the script to initialize with retry
        let retries = 5;
        let lastError = null;
        
        while (retries > 0) {
          console.log(`[Popup] Waiting 200ms before retry ${6 - retries}/5...`);
          await new Promise(resolve => setTimeout(resolve, 200));
          try {
            console.log('[Popup] Retrying message...');
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'enableSelectionMode' });
            console.log('[Popup] Retry successful! Response:', response);
            window.close();
            return; // Success!
          } catch (retryError) {
            console.log(`[Popup] Retry failed:`, retryError.message);
            lastError = retryError;
            retries--;
          }
        }
        
        throw lastError || new Error('Content script failed to respond after injection');
      } else {
        throw error;
      }
    }
    
    // Close the popup
    console.log('[Popup] Success! Closing popup...');
    window.close();
  } catch (error) {
    console.error('[Popup] Error enabling selection mode:', error);
    alert('Could not enable selection mode. Please refresh the page and try again.');
  }
}

/**
 * Check if URL is restricted (can't inject content scripts)
 * @param {string} url - URL to check
 * @returns {boolean} True if restricted
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  
  const restrictedPatterns = [
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^about:/,
    /^edge:\/\//,
    /^brave:\/\//,
    /^opera:\/\//,
    /^vivaldi:\/\//,
    /^file:\/\//,
    /^view-source:/,
    /^devtools:\/\//,
    /^data:/,
    /^blob:/,
    /^javascript:/
  ];
  
  return restrictedPatterns.some(pattern => pattern.test(url));
}

/**
 * Inject content script into tab
 * @param {number} tabId - Tab ID
 */
async function injectContentScript(tabId) {
  console.log('[Popup] Attempting to inject content script into tab', tabId);
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js']
    });
    console.log('[Popup] Content script injection successful. Results:', results);
  } catch (error) {
    console.error('[Popup] Failed to inject content script:', error);
    throw new Error(`Could not inject content script: ${error.message}`);
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
    
    console.log('[Popup] Loading notes for tab:', tab.url);
    
    // Get notes from background script (which uses Firestore if configured)
    const response = await chrome.runtime.sendMessage({
      action: 'getNotes',
      url: tab.url
    });
    
    if (!response.success) {
      console.error('[Popup] Failed to get notes:', response.error);
      return;
    }
    
    const pageNotes = response.notes || [];
    
    console.log('[Popup] Notes received from background:', pageNotes.length);
    pageNotes.forEach((note, i) => {
      console.log(`[Popup] Note ${i}:`, { id: note.id, url: note.url, content: note.content?.substring(0, 50) });
    });
    
    // Update UI
    renderNotesList(pageNotes);
    notesCount.textContent = pageNotes.length;
  } catch (error) {
    console.error('[Popup] Error loading notes:', error);
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
        <div class="note-item-text">${stripHtml(note.content) || 'Empty note'}</div>
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
 * Strip HTML tags and get plain text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  addNoteBtn.addEventListener('click', handleAddNote);
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', init);
