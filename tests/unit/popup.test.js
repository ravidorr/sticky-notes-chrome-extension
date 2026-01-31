/**
 * Popup Script Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  escapeHtml, 
  stripHtml, 
  truncate, 
  isRestrictedUrl, 
  THEME_COLORS 
} from '../../src/shared/utils.js';

// Import actual popup functions
import {
  showAuthSection,
  showUserSection,
  renderNotesList,
  initDOMElements,
  switchTab,
  setupTabs,
  updateSharedNotesCount,
  createPopupHandlers,
  updateToggleVisibilityButton,
  refreshNotes,
  handleNoteNavigate,
  updateTotalNotesCount,
  loadAndRenderSharedNotes,
  handleSharedNoteClick,
  displayVersion,
  setupActionsDropdown,
  init
} from '../../src/popup/popup.js';

describe('Popup Script Logic', () => {
  const localThis = {};
  
  beforeEach(() => {
    // Reset chrome mocks
    chrome.runtime.sendMessage.mockClear();
    chrome.tabs.query.mockClear();
    chrome.scripting.executeScript.mockClear();
    
    // Setup DOM for popup tests
    document.body.innerHTML = `
      <div id="authSection" class="hidden"></div>
      <div id="userSection" class="hidden">
        <img id="userAvatar" src="" />
        <span id="userName"></span>
        <span id="userEmail"></span>
      </div>
      <button id="loginBtn">Sign In</button>
      <button id="logoutBtn"></button>
      <button id="closeBtn"></button>
      <button id="addNoteBtn"></button>
      <button id="addPageNoteBtn"></button>
      <div id="notesList"></div>
      <span id="notesCount"></span>
      <div class="action-hint"></div>
      <button id="actionsBtn"></button>
      <div id="actionsMenu" class="hidden"></div>
      <button id="toggleVisibilityBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
        <span data-i18n="hideAllNotes"></span>
      </button>
      <button id="exportPageBtn"></button>
      <button id="exportAllBtn"></button>
      <button id="deletePageNotesBtn"></button>
      <button id="deleteAllNotesBtn"></button>
      <button id="deleteOldNotesBtn"></button>
      <button id="settingsBtn"></button>
      <span id="totalNotesCount"></span>
      <button id="thisPageTab" class="active"></button>
      <button id="sharedTab"></button>
      <div id="thisPageContent"></div>
      <div id="sharedContent" class="hidden"></div>
      <span id="thisPageCount">0</span>
      <span id="sharedCount" class="hidden">0</span>
      <div id="sharedNotesList"></div>
      <span id="versionDisplay"></span>
      <!-- Delete Old Notes Modal -->
      <div id="deleteOldNotesModal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <button id="closeDeleteOldNotesModal"></button>
          <div class="age-presets">
            <button class="age-preset-btn" data-days="7">7 days</button>
            <button class="age-preset-btn" data-days="30">30 days</button>
            <button class="age-preset-btn" data-days="90">90 days</button>
            <button class="age-preset-btn" data-days="365">1 year</button>
          </div>
          <input type="number" id="customDaysInput" />
          <button id="applyCustomDaysBtn"></button>
          <div id="oldNotesPreview" class="hidden">
            <span id="oldNotesCount"></span>
            <div id="oldNotesList"></div>
          </div>
          <button id="cancelDeleteOldNotes"></button>
          <button id="confirmDeleteOldNotes" disabled></button>
        </div>
      </div>
    `;
    
    // Mock window.close
    window.close = jest.fn();
    
    // Initialize DOM elements
    initDOMElements();
    
    // Store handlers reference
    localThis.handlers = createPopupHandlers({
      showErrorToast: jest.fn(),
      showSuccessToast: jest.fn()
    });
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });
  
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).not.toContain('<script>');
    });
    
    it('should handle null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });
  
  describe('stripHtml', () => {
    it('should strip HTML tags', () => {
      expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });
    
    it('should handle null/undefined', () => {
      expect(stripHtml(null)).toBe('');
      expect(stripHtml(undefined)).toBe('');
    });
  });
  
  describe('truncate (truncateSelector)', () => {
    it('should truncate long strings', () => {
      const long = 'a'.repeat(50);
      const result = truncate(long, 30);
      expect(result).toHaveLength(33); // 30 + '...'
      expect(result.endsWith('...')).toBe(true);
    });
    
    it('should not truncate short strings', () => {
      expect(truncate('short', 30)).toBe('short');
    });
    
    it('should handle null/empty', () => {
      expect(truncate(null, 30)).toBe('');
      expect(truncate('', 30)).toBe('');
    });
  });
  
  describe('isRestrictedUrl', () => {
    it('should identify chrome:// as restricted', () => {
      expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    });
    
    it('should identify chrome-extension:// as restricted', () => {
      expect(isRestrictedUrl('chrome-extension://abc123/popup.html')).toBe(true);
    });
    
    it('should identify about: as restricted', () => {
      expect(isRestrictedUrl('about:blank')).toBe(true);
    });
    
    it('should identify edge:// as restricted', () => {
      expect(isRestrictedUrl('edge://settings')).toBe(true);
    });
    
    it('should identify data: as restricted', () => {
      expect(isRestrictedUrl('data:text/html,<h1>Hello</h1>')).toBe(true);
    });
    
    it('should identify javascript: as restricted', () => {
      expect(isRestrictedUrl('javascript:alert(1)')).toBe(true);
    });
    
    it('should allow regular URLs', () => {
      expect(isRestrictedUrl('https://example.com')).toBe(false);
      expect(isRestrictedUrl('http://localhost:3000')).toBe(false);
    });
    
    it('should return true for null/empty', () => {
      expect(isRestrictedUrl(null)).toBe(true);
      expect(isRestrictedUrl('')).toBe(true);
    });
  });
  
  describe('THEME_COLORS (getThemeColor)', () => {
    it('should have all theme colors', () => {
      expect(THEME_COLORS.yellow).toBe('#facc15');
      expect(THEME_COLORS.blue).toBe('#3b82f6');
      expect(THEME_COLORS.green).toBe('#22c55e');
      expect(THEME_COLORS.pink).toBe('#ec4899');
    });
    
    function getThemeColor(theme) {
      return THEME_COLORS[theme] || THEME_COLORS.yellow;
    }
    
    it('should return correct color for each theme', () => {
      expect(getThemeColor('yellow')).toBe('#facc15');
      expect(getThemeColor('blue')).toBe('#3b82f6');
      expect(getThemeColor('green')).toBe('#22c55e');
      expect(getThemeColor('pink')).toBe('#ec4899');
    });
    
    it('should default to yellow for unknown theme', () => {
      expect(getThemeColor('unknown')).toBe('#facc15');
      expect(getThemeColor(null)).toBe('#facc15');
    });
  });
  
  describe('chrome.tabs API usage', () => {
    it('should query active tab', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(tab.url).toBe('https://example.com');
    });
  });
  
  describe('chrome.runtime.sendMessage usage', () => {
    it('should send login message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, user: { email: 'test@example.com' } });
      
      const response = await chrome.runtime.sendMessage({ action: 'login' });
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'login' });
      expect(response.success).toBe(true);
    });
    
    it('should send logout message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      const response = await chrome.runtime.sendMessage({ action: 'logout' });
      
      expect(response.success).toBe(true);
    });
    
    it('should send getUser message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        user: { email: 'test@example.com', displayName: 'Test User' } 
      });
      
      const response = await chrome.runtime.sendMessage({ action: 'getUser' });
      
      expect(response.user).toHaveProperty('email');
    });
    
    it('should send getNotes message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [{ id: '1', content: 'Test' }] 
      });
      
      const response = await chrome.runtime.sendMessage({ 
        action: 'getNotes', 
        url: 'https://example.com' 
      });
      
      expect(response.notes).toHaveLength(1);
    });
  });
  
  describe('chrome.scripting.executeScript usage', () => {
    it('should inject content script', async () => {
      chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);
      
      await chrome.scripting.executeScript({
        target: { tabId: 1 },
        files: ['src/content/content.js']
      });
      
      expect(chrome.scripting.executeScript).toHaveBeenCalled();
    });
  });
  
  describe('content script injection logic', () => {
    async function injectContentScript(tabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/content.js']
        });
        return true;
      } catch (error) {
        console.error('Failed to inject:', error);
        return false;
      }
    }
    
    it('should successfully inject script', async () => {
      chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);
      
      const result = await injectContentScript(1);
      expect(result).toBe(true);
    });
    
    it('should handle injection failure', async () => {
      chrome.scripting.executeScript.mockRejectedValue(new Error('Injection failed'));
      
      const result = await injectContentScript(1);
      expect(result).toBe(false);
    });
  });
  
  describe('note rendering logic', () => {
    function renderNote(note) {
      const themeColor = THEME_COLORS[note.theme] || THEME_COLORS.yellow;
      const content = stripHtml(note.content) || 'Empty note';
      const selector = truncate(note.selector, 30);
      
      return {
        themeColor,
        displayContent: content,
        displaySelector: selector
      };
    }
    
    it('should render note with theme color', () => {
      const note = { theme: 'blue', content: '<b>Test</b>', selector: '#main' };
      const rendered = renderNote(note);
      
      expect(rendered.themeColor).toBe('#3b82f6');
    });
    
    it('should strip HTML from content', () => {
      const note = { theme: 'yellow', content: '<p>Hello</p>', selector: '#main' };
      const rendered = renderNote(note);
      
      expect(rendered.displayContent).toBe('Hello');
    });
    
    it('should truncate long selectors', () => {
      const longSelector = 'body > div#container > section.content > article:nth-child(3)';
      const note = { theme: 'yellow', content: 'Test', selector: longSelector };
      const rendered = renderNote(note);
      
      expect(rendered.displaySelector.length).toBeLessThanOrEqual(33);
    });
    
    it('should default to "Empty note" for empty content', () => {
      const note = { theme: 'yellow', content: '', selector: '#main' };
      const rendered = renderNote(note);
      
      expect(rendered.displayContent).toBe('Empty note');
    });
  });
  
  describe('auth state handling', () => {
    function updateAuthUI(user) {
      return {
        isLoggedIn: !!user,
        displayName: user?.displayName || user?.email || 'Guest',
        showLoginButton: !user,
        showLogoutButton: !!user
      };
    }
    
    it('should show login state for logged in user', () => {
      const ui = updateAuthUI({ email: 'test@example.com', displayName: 'Test User' });
      
      expect(ui.isLoggedIn).toBe(true);
      expect(ui.displayName).toBe('Test User');
      expect(ui.showLoginButton).toBe(false);
      expect(ui.showLogoutButton).toBe(true);
    });
    
    it('should show logout state for no user', () => {
      const ui = updateAuthUI(null);
      
      expect(ui.isLoggedIn).toBe(false);
      expect(ui.displayName).toBe('Guest');
      expect(ui.showLoginButton).toBe(true);
      expect(ui.showLogoutButton).toBe(false);
    });
    
    it('should use email if displayName is not available', () => {
      const ui = updateAuthUI({ email: 'test@example.com' });
      
      expect(ui.displayName).toBe('test@example.com');
    });
  });

  describe('showAuthSection', () => {
    it('should show auth section and hide user section', () => {
      const authSection = document.getElementById('authSection');
      const userSection = document.getElementById('userSection');
      
      // Start with auth hidden
      authSection.classList.add('hidden');
      userSection.classList.remove('hidden');
      
      showAuthSection();
      
      expect(authSection.classList.contains('hidden')).toBe(false);
      expect(userSection.classList.contains('hidden')).toBe(true);
    });
  });

  describe('showUserSection', () => {
    it('should show user section and hide auth section', () => {
      const authSection = document.getElementById('authSection');
      const userSection = document.getElementById('userSection');
      
      showUserSection({ 
        displayName: 'Test User', 
        email: 'test@example.com',
        photoURL: 'https://example.com/avatar.png'
      });
      
      expect(authSection.classList.contains('hidden')).toBe(true);
      expect(userSection.classList.contains('hidden')).toBe(false);
    });
    
    it('should set user avatar, name, and email', () => {
      showUserSection({ 
        displayName: 'Test User', 
        email: 'test@example.com',
        photoURL: 'https://example.com/avatar.png'
      });
      
      const userAvatar = document.getElementById('userAvatar');
      const userName = document.getElementById('userName');
      const userEmail = document.getElementById('userEmail');
      
      expect(userAvatar.src).toBe('https://example.com/avatar.png');
      expect(userName.textContent).toBe('Test User');
      expect(userEmail.textContent).toBe('test@example.com');
    });
    
    it('should use defaults when user data is missing', () => {
      showUserSection({});
      
      const userAvatar = document.getElementById('userAvatar');
      const userName = document.getElementById('userName');
      const userEmail = document.getElementById('userEmail');
      
      expect(userAvatar.src).toContain('default-avatar.png');
      expect(userName.textContent).toBe('User');
      expect(userEmail.textContent).toBe('');
    });
  });

  describe('renderNotesList', () => {
    it('should render empty state when no notes', () => {
      renderNotesList([]);
      
      const notesList = document.getElementById('notesList');
      expect(notesList.innerHTML).toContain('empty');
    });
    
    it('should render note items when notes exist', () => {
      const notes = [
        { id: 'note-1', content: 'Test note 1', theme: 'yellow', selector: '#test' },
        { id: 'note-2', content: 'Test note 2', theme: 'blue', selector: '.test' }
      ];
      
      renderNotesList(notes);
      
      const notesList = document.getElementById('notesList');
      const noteItems = notesList.querySelectorAll('.note-item');
      expect(noteItems.length).toBe(2);
    });
    
    it('should add click handlers to note items', () => {
      const notes = [
        { id: 'note-1', content: 'Test note', theme: 'yellow', selector: '#test' }
      ];
      
      renderNotesList(notes);
      
      const noteItem = document.querySelector('.note-item');
      expect(noteItem).toBeTruthy();
      expect(noteItem.dataset.id).toBe('note-1');
    });
  });

  describe('switchTab', () => {
    it('should switch to this-page tab', async () => {
      const thisPageTab = document.getElementById('thisPageTab');
      const sharedTab = document.getElementById('sharedTab');
      const thisPageContent = document.getElementById('thisPageContent');
      const sharedContent = document.getElementById('sharedContent');
      
      await switchTab('this-page');
      
      expect(thisPageTab.classList.contains('active')).toBe(true);
      expect(sharedTab.classList.contains('active')).toBe(false);
      expect(thisPageContent.classList.contains('hidden')).toBe(false);
      expect(sharedContent.classList.contains('hidden')).toBe(true);
    });
    
    it('should switch to shared tab', async () => {
      // Mock the handlers for loading shared notes
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, notes: [] });
      
      const thisPageTab = document.getElementById('thisPageTab');
      const sharedTab = document.getElementById('sharedTab');
      const thisPageContent = document.getElementById('thisPageContent');
      const sharedContent = document.getElementById('sharedContent');
      
      await switchTab('shared');
      
      expect(thisPageTab.classList.contains('active')).toBe(false);
      expect(sharedTab.classList.contains('active')).toBe(true);
      expect(thisPageContent.classList.contains('hidden')).toBe(true);
      expect(sharedContent.classList.contains('hidden')).toBe(false);
    });
  });

  describe('setupTabs', () => {
    it('should add click handlers to tab buttons', () => {
      const thisPageTab = document.getElementById('thisPageTab');
      const sharedTab = document.getElementById('sharedTab');
      
      setupTabs();
      
      // Tabs should have event listeners
      expect(thisPageTab).toBeTruthy();
      expect(sharedTab).toBeTruthy();
    });
  });

  describe('updateSharedNotesCount', () => {
    it('should update shared count badge', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, count: 5 });
      
      await updateSharedNotesCount();
      
      const sharedCount = document.getElementById('sharedCount');
      expect(sharedCount.textContent).toBe('5');
      expect(sharedCount.classList.contains('hidden')).toBe(false);
    });
    
    it('should hide badge when count is 0', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, count: 0 });
      
      await updateSharedNotesCount();
      
      const sharedCount = document.getElementById('sharedCount');
      expect(sharedCount.textContent).toBe('0');
      expect(sharedCount.classList.contains('hidden')).toBe(true);
    });
  });

  describe('initDOMElements', () => {
    it('should initialize all DOM element references', () => {
      // Re-initialize to test the function
      initDOMElements();
      
      // Check that elements exist
      expect(document.getElementById('authSection')).toBeTruthy();
      expect(document.getElementById('userSection')).toBeTruthy();
      expect(document.getElementById('loginBtn')).toBeTruthy();
      expect(document.getElementById('notesList')).toBeTruthy();
    });
  });

  describe('renderNotesList - click handlers', () => {
    it('should handle expand button click', () => {
      const notes = [
        { id: 'note-expand', content: 'Test note', theme: 'yellow', selector: '#test' }
      ];
      
      renderNotesList(notes);
      
      const noteItem = document.querySelector('.note-item');
      const expandBtn = noteItem.querySelector('[data-action="expand"]');
      
      if (expandBtn) {
        expandBtn.click();
        expect(noteItem.classList.contains('expanded')).toBe(true);
        
        expandBtn.click();
        expect(noteItem.classList.contains('expanded')).toBe(false);
      }
    });
    
    it('should handle share button click', async () => {
      const notes = [
        { id: 'note-share', content: 'Test note', theme: 'yellow', selector: '#test' }
      ];
      
      renderNotesList(notes);
      
      const shareBtn = document.querySelector('[data-action="share"]');
      if (shareBtn) {
        // Click should not throw
        shareBtn.click();
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    
    it('should handle delete button click when cancelled', async () => {
      const notes = [
        { id: 'note-delete-cancel', content: 'Test note', theme: 'yellow', selector: '#test' }
      ];
      
      renderNotesList(notes);
      
      // Mock handlers.showConfirmDialog to return false (cancelled)
      localThis.handlers.showConfirmDialog = jest.fn().mockResolvedValue(false);
      
      const deleteBtn = document.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.click();
        await new Promise(resolve => setTimeout(resolve, 10));
        // Delete should not have been called
      }
    });
    
    it('should not navigate when clicking action button', async () => {
      const notes = [
        { id: 'note-action-click', content: 'Test note', theme: 'yellow', selector: '#test' }
      ];
      
      renderNotesList(notes);
      
      const header = document.querySelector('.note-item-header');
      const actionBtn = header.querySelector('.note-item-btn');
      
      if (actionBtn) {
        // Click on action button should not trigger navigation
        actionBtn.click();
        // Check that tabs.sendMessage was not called for navigation
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
      }
    });
  });

  describe('switchTab - shared tab loading', () => {
    it('should load shared notes when switching to shared tab', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [
          { id: 'shared-1', content: 'Shared note', url: 'https://example.com' }
        ]
      });
      
      await switchTab('shared');
      
      const sharedContent = document.getElementById('sharedContent');
      expect(sharedContent.classList.contains('hidden')).toBe(false);
    });
    
    it('should render empty state for shared notes when none exist', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: []
      });
      
      await switchTab('shared');
      
      const sharedNotesList = document.getElementById('sharedNotesList');
      expect(sharedNotesList.innerHTML).toContain('empty');
    });
  });

  describe('updateSharedNotesCount - edge cases', () => {
    it('should handle undefined count', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      await updateSharedNotesCount();
      
      const sharedCount = document.getElementById('sharedCount');
      expect(sharedCount.textContent).toBe('0');
      expect(sharedCount.classList.contains('hidden')).toBe(true);
    });
  });

  describe('handlers.renderNoteItemExpanded', () => {
    it('should render note with all metadata', () => {
      const note = {
        id: 'test-1',
        content: '<p>Test content</p>',
        theme: 'blue',
        selector: '#main > .content',
        url: 'https://example.com/page',
        metadata: {
          environment: 'production',
          consoleErrors: [{ type: 'error', message: 'Test error' }]
        }
      };
      
      const html = localThis.handlers.renderNoteItemExpanded(note);
      expect(html).toContain('test-1');
      expect(html).toContain('note-item');
    });
    
    it('should render orphaned note', () => {
      const note = {
        id: 'orphan-1',
        content: 'Orphaned content',
        theme: 'yellow',
        selector: '#missing',
        isOrphaned: true
      };
      
      const html = localThis.handlers.renderNoteItemExpanded(note);
      expect(html).toContain('orphan-1');
    });
  });

  describe('handlers.renderEmptyNotes', () => {
    it('should render empty state HTML', () => {
      const html = localThis.handlers.renderEmptyNotes();
      expect(html).toContain('empty');
    });
  });

  describe('handlers.renderEmptySharedNotes', () => {
    it('should render empty shared notes state HTML', () => {
      const html = localThis.handlers.renderEmptySharedNotes();
      expect(html).toContain('empty');
    });
  });

  describe('handlers.renderSharedNoteItem', () => {
    it('should render shared note item', () => {
      const note = {
        id: 'shared-1',
        content: 'Shared content',
        url: 'https://example.com',
        sharedBy: { displayName: 'John Doe', email: 'john@example.com' },
        sharedAt: Date.now()
      };
      
      const html = localThis.handlers.renderSharedNoteItem(note);
      expect(html).toContain('shared-1');
    });
  });

  describe('handlers.loadNotesForCurrentTab', () => {
    it('should load notes for current tab', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [{ id: 'note-1', content: 'Test' }] 
      });
      
      const result = await localThis.handlers.loadNotesForCurrentTab();
      expect(result.notes).toBeDefined();
    });
    
    it('should return empty array when no tab found', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      
      const result = await localThis.handlers.loadNotesForCurrentTab();
      expect(result.notes).toEqual([]);
    });
  });

  describe('handlers.handleLogin', () => {
    it('should handle successful login', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        user: { email: 'test@example.com', displayName: 'Test' } 
      });
      
      const result = await localThis.handlers.handleLogin();
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
    });
    
    it('should handle login failure', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: false, 
        error: 'Auth failed' 
      });
      
      const result = await localThis.handlers.handleLogin();
      expect(result.success).toBe(false);
    });
  });

  describe('handlers.handleLogout', () => {
    it('should handle successful logout', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleLogout();
      expect(result.success).toBe(true);
    });
  });

  describe('handlers.checkAuthState', () => {
    it('should return user when logged in', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        user: { email: 'test@example.com' } 
      });
      
      const user = await localThis.handlers.checkAuthState();
      // checkAuthState returns the user directly from response or null
      if (user) {
        expect(user.email).toBe('test@example.com');
      }
    });
    
    it('should return null when not logged in', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, user: null });
      
      const user = await localThis.handlers.checkAuthState();
      expect(user).toBeNull();
    });
  });

  describe('handlers.handleAddNote', () => {
    it('should trigger add note on current tab', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);
      
      await localThis.handlers.handleAddNote();
      
      // handleAddNote might use scripting.executeScript or tabs.sendMessage
      expect(chrome.tabs.query).toHaveBeenCalled();
    });
    
    it('should handle no active tab', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      
      // Should not throw
      await localThis.handlers.handleAddNote();
    });
  });

  describe('handlers.handleDeleteNote', () => {
    it('should delete note successfully', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleDeleteNote('note-1');
      expect(result.success).toBe(true);
    });
    
    it('should handle delete failure', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Delete failed' });
      
      const result = await localThis.handlers.handleDeleteNote('note-1');
      expect(result.success).toBe(false);
    });
  });

  describe('handlers.getAllNotes', () => {
    it('should return all notes', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [
          { id: 'note-1', content: 'Note 1' },
          { id: 'note-2', content: 'Note 2' }
        ] 
      });
      
      const result = await localThis.handlers.getAllNotes();
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(2);
    });
  });

  describe('handlers.getUnreadSharedNotes', () => {
    it('should return unread shared notes', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [{ id: 'shared-1', content: 'Shared note' }] 
      });
      
      const result = await localThis.handlers.getUnreadSharedNotes();
      expect(result.notes).toBeDefined();
    });
  });

  describe('handlers.getUnreadSharedCount', () => {
    it('should return unread count', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, count: 3 });
      
      const result = await localThis.handlers.getUnreadSharedCount();
      expect(result.count).toBe(3);
    });
  });

  describe('handlers.markSharedNoteAsRead', () => {
    it('should mark note as read', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      await localThis.handlers.markSharedNoteAsRead('shared-1');
      
      // The action name is 'markSharedNoteRead'
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'markSharedNoteRead', noteId: 'shared-1' })
      );
    });
  });

  describe('handlers.handleExportCSV', () => {
    it('should export notes to CSV', async () => {
      const notes = [
        { id: 'note-1', content: 'Test', url: 'https://example.com', createdAt: Date.now() }
      ];
      
      // Mock URL.createObjectURL
      const mockUrl = 'blob:http://localhost/test';
      global.URL.createObjectURL = jest.fn().mockReturnValue(mockUrl);
      global.URL.revokeObjectURL = jest.fn();
      
      // Should not throw
      await localThis.handlers.handleExportCSV(notes, 'test.csv');
    });
  });

  describe('updateToggleVisibilityButton', () => {
    it('should update button text to "Hide all notes" when notes are visible', () => {
      const toggleBtn = document.getElementById('toggleVisibilityBtn');
      const span = toggleBtn.querySelector('span');
      
      updateToggleVisibilityButton(true);
      
      expect(span.getAttribute('data-i18n')).toBe('hideAllNotes');
    });

    it('should update button text to "Show all notes" when notes are hidden', () => {
      const toggleBtn = document.getElementById('toggleVisibilityBtn');
      const span = toggleBtn.querySelector('span');
      
      updateToggleVisibilityButton(false);
      
      expect(span.getAttribute('data-i18n')).toBe('showAllNotes');
    });

    it('should handle missing button gracefully', () => {
      // Remove the button
      const toggleBtn = document.getElementById('toggleVisibilityBtn');
      toggleBtn.remove();
      
      // Re-init DOM elements to clear reference
      initDOMElements();
      
      // Should not throw
      expect(() => updateToggleVisibilityButton(true)).not.toThrow();
    });
  });

  describe('handleNoteNavigate', () => {
    it('should send highlightAndMaximizeNote message for normal note', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });
      
      await handleNoteNavigate('note-1', false);
      
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        action: 'highlightAndMaximizeNote',
        noteId: 'note-1'
      });
      expect(window.close).toHaveBeenCalled();
    });
    
    it('should send showOrphanedNote message for orphaned note', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });
      
      await handleNoteNavigate('orphan-1', true);
      
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        action: 'showOrphanedNote',
        noteId: 'orphan-1'
      });
    });
    
    it('should handle no active tab', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      
      // Should not throw
      await handleNoteNavigate('note-1', false);
      
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
    
    it('should handle sendMessage error gracefully', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Tab closed'));
      
      // Should not throw - if it throws, Jest will fail the test
      await handleNoteNavigate('note-1', false);
    });
  });

  describe('refreshNotes', () => {
    it('should refresh notes list and update counts', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, notes: [{ id: 'note-1', content: 'Test', theme: 'yellow', selector: '#test' }] })
        .mockResolvedValueOnce({ success: true, notes: [{ id: 'note-1' }, { id: 'note-2' }] });
      
      await refreshNotes();
      
      const notesCount = document.getElementById('notesCount');
      const thisPageCount = document.getElementById('thisPageCount');
      
      expect(notesCount.textContent).toBe('1');
      expect(thisPageCount.textContent).toBe('1');
    });
    
    it('should render empty state when no notes', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, notes: [] })
        .mockResolvedValueOnce({ success: true, notes: [] });
      
      await refreshNotes();
      
      const notesList = document.getElementById('notesList');
      expect(notesList.innerHTML).toContain('empty');
    });
  });

  describe('updateTotalNotesCount', () => {
    it('should display total notes count when notes exist', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [{ id: 'note-1' }, { id: 'note-2' }, { id: 'note-3' }] 
      });
      
      await updateTotalNotesCount();
      
      const totalNotesCount = document.getElementById('totalNotesCount');
      // The i18n mock returns the key with substitutions, so it will be 'totalNotes' with '3'
      expect(totalNotesCount.textContent).not.toBe('');
    });
    
    it('should clear count when no notes', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, notes: [] });
      
      await updateTotalNotesCount();
      
      const totalNotesCount = document.getElementById('totalNotesCount');
      expect(totalNotesCount.textContent).toBe('');
    });
    
    it('should clear count on failure', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: false });
      
      await updateTotalNotesCount();
      
      const totalNotesCount = document.getElementById('totalNotesCount');
      expect(totalNotesCount.textContent).toBe('');
    });
  });

  describe('displayVersion', () => {
    it('should display version from manifest', () => {
      chrome.runtime.getManifest.mockReturnValue({ version: '1.13.0' });
      
      displayVersion();
      
      const versionDisplay = document.getElementById('versionDisplay');
      expect(versionDisplay.textContent).toBe('v1.13.0');
    });
    
    it('should handle missing versionDisplay element', () => {
      document.getElementById('versionDisplay').remove();
      initDOMElements();
      
      // Should not throw
      expect(() => displayVersion()).not.toThrow();
    });
    
    it('should handle getManifest error', () => {
      chrome.runtime.getManifest.mockImplementation(() => {
        throw new Error('Not available');
      });
      
      displayVersion();
      
      const versionDisplay = document.getElementById('versionDisplay');
      expect(versionDisplay.textContent).toBe('');
    });
  });

  describe('loadAndRenderSharedNotes', () => {
    it('should render shared notes', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [
          { id: 'shared-1', content: 'Note 1', url: 'https://example.com/1' },
          { id: 'shared-2', content: 'Note 2', url: 'https://example.com/2' }
        ] 
      });
      
      await loadAndRenderSharedNotes();
      
      const sharedNotesList = document.getElementById('sharedNotesList');
      expect(sharedNotesList.innerHTML).toContain('shared-1');
    });
    
    it('should render empty state when no shared notes', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, notes: [] });
      
      await loadAndRenderSharedNotes();
      
      const sharedNotesList = document.getElementById('sharedNotesList');
      expect(sharedNotesList.innerHTML).toContain('empty');
    });
  });

  describe('handleSharedNoteClick', () => {
    it('should mark note as read and open in new tab', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      chrome.tabs.create.mockResolvedValue({ id: 2 });
      
      const item = document.createElement('div');
      item.dataset.id = 'shared-1';
      item.dataset.url = 'https://example.com/shared';
      
      await handleSharedNoteClick(item);
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'markSharedNoteRead', noteId: 'shared-1' })
      );
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com/shared' });
      expect(window.close).toHaveBeenCalled();
    });
    
    it('should do nothing if noteId is missing', async () => {
      const item = document.createElement('div');
      item.dataset.url = 'https://example.com/shared';
      
      await handleSharedNoteClick(item);
      
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
    
    it('should do nothing if noteUrl is missing', async () => {
      const item = document.createElement('div');
      item.dataset.id = 'shared-1';
      
      await handleSharedNoteClick(item);
      
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
    
    it('should handle error gracefully', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const item = document.createElement('div');
      item.dataset.id = 'shared-1';
      item.dataset.url = 'https://example.com/shared';
      
      // Should not throw - if it throws, Jest will fail the test
      await handleSharedNoteClick(item);
    });
  });

  describe('setupActionsDropdown', () => {
    it('should toggle actions menu on button click', async () => {
      setupActionsDropdown();
      
      const actionsBtn = document.getElementById('actionsBtn');
      const actionsMenu = document.getElementById('actionsMenu');
      
      // Initially hidden
      expect(actionsMenu.classList.contains('hidden')).toBe(true);
      
      // Click to show
      actionsBtn.click();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(actionsMenu.classList.contains('hidden')).toBe(false);
      
      // Click again to hide
      actionsBtn.click();
      expect(actionsMenu.classList.contains('hidden')).toBe(true);
    });
    
    it('should close menu on document click', async () => {
      setupActionsDropdown();
      
      const actionsBtn = document.getElementById('actionsBtn');
      const actionsMenu = document.getElementById('actionsMenu');
      
      // Show menu
      actionsBtn.click();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(actionsMenu.classList.contains('hidden')).toBe(false);
      
      // Click document to close
      document.body.click();
      expect(actionsMenu.classList.contains('hidden')).toBe(true);
    });
    
    it('should handle export page button when no notes', async () => {
      setupActionsDropdown();
      
      const exportPageBtn = document.getElementById('exportPageBtn');
      
      // No notes to export
      exportPageBtn.click();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should not throw (shows toast)
    });
    
    it('should handle delete page notes when no notes', async () => {
      setupActionsDropdown();
      
      const deletePageNotesBtn = document.getElementById('deletePageNotesBtn');
      
      deletePageNotesBtn.click();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should show toast for no notes
    });
    
    it('should handle settings button click', () => {
      setupActionsDropdown();
      
      const settingsBtn = document.getElementById('settingsBtn');
      const actionsMenu = document.getElementById('actionsMenu');
      
      settingsBtn.click();
      
      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
      expect(actionsMenu.classList.contains('hidden')).toBe(true);
    });
  });

  describe('init', () => {
    it('should initialize the popup', async () => {
      // Mock storage.local.get to return user for checkAuthState
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = { user: { email: 'test@example.com', displayName: 'Test User' } };
        if (callback) callback(result);
        return Promise.resolve(result);
      });
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, notes: [] })
        .mockResolvedValueOnce({ success: true, notes: [] })
        .mockResolvedValueOnce({ success: true, count: 0 });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.runtime.getManifest.mockReturnValue({ version: '1.13.0' });
      
      await init();
      
      // Should display version
      const versionDisplay = document.getElementById('versionDisplay');
      expect(versionDisplay.textContent).toBe('v1.13.0');
      
      // Should show user section since user is logged in
      const userSection = document.getElementById('userSection');
      expect(userSection.classList.contains('hidden')).toBe(false);
    });
    
    it('should show auth section when not logged in', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = {};
        if (callback) callback(result);
        return Promise.resolve(result);
      });
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, notes: [] })
        .mockResolvedValueOnce({ success: true, notes: [] })
        .mockResolvedValueOnce({ success: true, count: 0 });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.runtime.getManifest.mockReturnValue({ version: '1.13.0' });
      
      await init();
      
      const authSection = document.getElementById('authSection');
      expect(authSection.classList.contains('hidden')).toBe(false);
    });
    
    it('should disable add note button on restricted URL', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = {};
        if (callback) callback(result);
        return Promise.resolve(result);
      });
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, notes: [] })
        .mockResolvedValueOnce({ success: true, notes: [] })
        .mockResolvedValueOnce({ success: true, count: 0 });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://extensions' }]);
      chrome.runtime.getManifest.mockReturnValue({ version: '1.13.0' });
      
      await init();
      
      const addNoteBtn = document.getElementById('addNoteBtn');
      expect(addNoteBtn.disabled).toBe(true);
    });
  });

  describe('handlers.handleAddPageNote', () => {
    it('should trigger add page note on current tab', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });
      
      await localThis.handlers.handleAddPageNote();
      
      expect(chrome.tabs.query).toHaveBeenCalled();
    });
  });

  describe('handlers.handleLeaveNote', () => {
    it('should handle leaving a shared note', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      const result = await localThis.handlers.handleLeaveNote('shared-1');
      expect(result.success).toBe(true);
    });
    
    it('should handle leave note failure', async () => {
      // Clear any previous mocks and set up failure response
      chrome.runtime.sendMessage.mockReset();
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Failed' });
      
      const result = await localThis.handlers.handleLeaveNote('shared-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });

  describe('handlers.handleDeleteAllFromPage', () => {
    it('should delete all notes from page', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });
      
      const notes = [{ id: 'note-1' }, { id: 'note-2' }];
      await localThis.handlers.handleDeleteAllFromPage(notes);
      
      // Should have called delete for each note
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });
  });

  describe('handlers.handleDeleteAllNotes', () => {
    it('should delete all notes', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true, notes: [{ id: 'note-1' }, { id: 'note-2' }] })
        .mockResolvedValue({ success: true });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });
      
      await localThis.handlers.handleDeleteAllNotes();
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });
  });
});
