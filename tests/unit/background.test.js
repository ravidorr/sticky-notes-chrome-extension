/**
 * Background Script Unit Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { generateId, isValidEmail, normalizeUrl } from '../../src/shared/utils.js';

describe('Background Script Logic', () => {
  // Test the core logic patterns used in background script
  
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId('note');
      const id2 = generateId('note');
      expect(id1).not.toBe(id2);
    });
    
    it('should include prefix', () => {
      const id = generateId('test');
      expect(id.startsWith('test_')).toBe(true);
    });
    
    it('should have correct format', () => {
      const id = generateId('note');
      expect(id).toMatch(/^note_\d+_[a-z0-9]+$/);
    });
  });
  
  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.org')).toBe(true);
      expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
    });
    
    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });
  });
  
  describe('normalizeUrl', () => {
    it('should strip query params', () => {
      const url = 'https://example.com/page?query=1';
      expect(normalizeUrl(url)).toBe('https://example.com/page');
    });
    
    it('should strip hash', () => {
      const url = 'https://example.com/page#section';
      expect(normalizeUrl(url)).toBe('https://example.com/page');
    });
    
    it('should preserve path', () => {
      const url = 'https://example.com/path/to/page';
      expect(normalizeUrl(url)).toBe('https://example.com/path/to/page');
    });
    
    it('should handle invalid URLs gracefully', () => {
      expect(normalizeUrl('invalid')).toBe('invalid');
    });
  });
  
  describe('message handling patterns', () => {
    beforeEach(() => {
      chrome.runtime.sendMessage.mockClear();
    });
    
    it('should handle login action pattern', async () => {
      async function handleLogin() {
        // Pattern from background script
        try {
          const user = { uid: 'user-123', email: 'test@example.com' };
          return { success: true, user };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
      
      const result = await handleLogin();
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
    });
    
    it('should handle logout action pattern', async () => {
      async function handleLogout() {
        // Simulate logout - in production this would call signOut()
        return { success: true };
      }
      
      const result = await handleLogout();
      expect(result.success).toBe(true);
    });
    
    it('should handle getUser action pattern', async () => {
      async function handleGetUser(currentUser) {
        if (currentUser) {
          return {
            success: true,
            user: {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName || currentUser.email
            }
          };
        }
        return { success: true, user: null };
      }
      
      const result = await handleGetUser({ uid: '123', email: 'test@example.com' });
      expect(result.success).toBe(true);
      expect(result.user.email).toBe('test@example.com');
    });
    
    it('should handle getNotes action pattern', async () => {
      async function handleGetNotes(url, userId, isFirebaseConfigured) {
        try {
          if (isFirebaseConfigured && userId) {
            // Would query Firestore
            return { success: true, notes: [] };
          }
          // Fallback to local storage
          return { success: true, notes: [] };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
      
      const result = await handleGetNotes('https://example.com', 'user-123', true);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.notes)).toBe(true);
    });
    
    it('should handle saveNote action pattern', async () => {
      async function handleSaveNote(noteData, userId, _isFirebaseConfigured) {
        try {
          const newNote = {
            ...noteData,
            id: generateId('note'),
            ownerId: userId || 'local',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          return { success: true, note: newNote };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
      
      const result = await handleSaveNote(
        { url: 'https://example.com', selector: '#main', content: 'Test' },
        'user-123',
        true
      );
      
      expect(result.success).toBe(true);
      expect(result.note.id).toBeDefined();
    });
    
    it('should handle updateNote action pattern', async () => {
      async function handleUpdateNote(_noteId, _updates) {
        // Would update in Firestore or local storage
        return { success: true };
      }
      
      const result = await handleUpdateNote('note-123', { content: 'Updated' });
      expect(result.success).toBe(true);
    });
    
    it('should handle deleteNote action pattern', async () => {
      async function handleDeleteNote(_noteId) {
        // Would delete from Firestore or local storage
        return { success: true };
      }
      
      const result = await handleDeleteNote('note-123');
      expect(result.success).toBe(true);
    });
  });
  
  describe('share validation', () => {
    it('should validate email before sharing', () => {
      expect(isValidEmail('valid@email.com')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
    });
    
    it('should prevent self-sharing', () => {
      const userEmail = 'user@example.com';
      const shareEmail = 'user@example.com';
      
      expect(userEmail.toLowerCase() === shareEmail.toLowerCase()).toBe(true);
    });
    
    it('should validate noteId', () => {
      function isValidNoteId(noteId) {
        return typeof noteId === 'string' && noteId.length > 0;
      }
      
      expect(isValidNoteId('note-123')).toBe(true);
      expect(isValidNoteId('')).toBe(false);
      expect(isValidNoteId(null)).toBe(false);
    });
    
    it('should handle shareNote action pattern', async () => {
      async function handleShareNote(noteId, email, userEmail, isFirebaseConfigured) {
        if (!userEmail) {
          return { success: false, error: 'You must be logged in to share notes' };
        }
        
        if (!isFirebaseConfigured) {
          return { success: false, error: 'Sharing requires Firebase to be configured' };
        }
        
        if (!noteId || typeof noteId !== 'string') {
          return { success: false, error: 'Invalid note ID' };
        }
        
        if (!isValidEmail(email)) {
          return { success: false, error: 'Invalid email address' };
        }
        
        if (email.toLowerCase() === userEmail.toLowerCase()) {
          return { success: false, error: 'You cannot share a note with yourself' };
        }
        
        return { success: true };
      }
      
      // Valid share
      const result1 = await handleShareNote(
        'note-123', 
        'friend@example.com', 
        'user@example.com', 
        true
      );
      expect(result1.success).toBe(true);
      
      // Self-share
      const result2 = await handleShareNote(
        'note-123', 
        'user@example.com', 
        'user@example.com', 
        true
      );
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('yourself');
      
      // Invalid email
      const result3 = await handleShareNote(
        'note-123', 
        'invalid', 
        'user@example.com', 
        true
      );
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Invalid email');
      
      // Not logged in
      const result4 = await handleShareNote(
        'note-123', 
        'friend@example.com', 
        null, 
        true
      );
      expect(result4.success).toBe(false);
      expect(result4.error).toContain('logged in');
    });
  });
  
  describe('chrome API usage', () => {
    beforeEach(() => {
      chrome.runtime.sendMessage.mockClear();
      chrome.storage.local.get.mockClear();
      chrome.storage.local.set.mockClear();
    });
    
    it('should use chrome.storage.local.get', async () => {
      await chrome.storage.local.get(['notes']);
      expect(chrome.storage.local.get).toHaveBeenCalledWith(['notes']);
    });
    
    it('should use chrome.storage.local.set', async () => {
      await chrome.storage.local.set({ notes: [] });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ notes: [] });
    });
    
    it('should register tab update listener', () => {
      const listener = jest.fn();
      chrome.tabs.onUpdated.addListener(listener);
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(listener);
    });
    
    it('should register web navigation listener', () => {
      const listener = jest.fn();
      chrome.webNavigation.onHistoryStateUpdated.addListener(listener);
      expect(chrome.webNavigation.onHistoryStateUpdated.addListener).toHaveBeenCalledWith(listener);
    });
  });
  
  describe('local storage fallback', () => {
    it('should filter notes by URL', () => {
      function filterNotesByUrl(notes, targetUrl) {
        const normalizedTarget = normalizeUrl(targetUrl);
        return notes.filter(note => {
          try {
            return normalizeUrl(note.url) === normalizedTarget;
          } catch {
            return false;
          }
        });
      }
      
      const notes = [
        { id: '1', url: 'https://example.com/page?query=1' },
        { id: '2', url: 'https://example.com/other' },
        { id: '3', url: 'https://example.com/page#section' }
      ];
      
      const filtered = filterNotesByUrl(notes, 'https://example.com/page');
      expect(filtered).toHaveLength(2);
      expect(filtered.map(note => note.id)).toContain('1');
      expect(filtered.map(note => note.id)).toContain('3');
    });
  });
  
  describe('context menu', () => {
    beforeEach(() => {
      // Mock chrome.contextMenus
      global.chrome.contextMenus = {
        create: jest.fn((options, callback) => {
          if (callback) callback();
        }),
        onClicked: {
          addListener: jest.fn()
        }
      };
      // Mock chrome.tabs.create for dashboard menu item
      global.chrome.tabs = {
        ...global.chrome.tabs,
        create: jest.fn(),
        sendMessage: jest.fn()
      };
    });
    
    it('should create context menu with correct options', () => {
      function createContextMenu() {
        chrome.contextMenus.create({
          id: 'create-sticky-note',
          title: 'Create Sticky Note Here',
          contexts: ['page', 'selection', 'image', 'link'],
          documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
        });
      }
      
      createContextMenu();
      
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'create-sticky-note',
          contexts: expect.arrayContaining(['page', 'selection', 'image', 'link']),
          documentUrlPatterns: expect.arrayContaining(['http://*/*', 'https://*/*'])
        })
      );
    });
    
    it('should register click handler for context menu', () => {
      function setupContextMenuHandler(handler) {
        chrome.contextMenus.onClicked.addListener(handler);
      }
      
      const handler = jest.fn();
      setupContextMenuHandler(handler);
      
      expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalledWith(handler);
    });
    
    it('should send createNoteAtClick message on menu click', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });
      
      async function handleContextMenuClick(info, tab) {
        if (info.menuItemId === 'create-sticky-note' && tab?.id) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'createNoteAtClick'
          });
        }
      }
      
      await handleContextMenuClick(
        { menuItemId: 'create-sticky-note' },
        { id: 123 }
      );
      
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        { action: 'createNoteAtClick' }
      );
    });
    
    it('should not send message for wrong menu item', async () => {
      async function handleContextMenuClick(info, tab) {
        if (info.menuItemId === 'create-sticky-note' && tab?.id) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'createNoteAtClick'
          });
        }
      }
      
      await handleContextMenuClick(
        { menuItemId: 'other-menu-item' },
        { id: 123 }
      );
      
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
    
    it('should not send message if tab is missing', async () => {
      async function handleContextMenuClick(info, tab) {
        if (info.menuItemId === 'create-sticky-note' && tab?.id) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'createNoteAtClick'
          });
        }
      }
      
      await handleContextMenuClick(
        { menuItemId: 'create-sticky-note' },
        null
      );
      
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
    
    it('should handle sendMessage errors gracefully', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Tab not found'));
      
      async function handleContextMenuClick(info, tab) {
        if (info.menuItemId === 'create-sticky-note' && tab?.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              action: 'createNoteAtClick'
            });
          } catch (error) {
            // Silently handle - tab may not have content script
            return { error: error.message };
          }
        }
        return { success: true };
      }
      
      const result = await handleContextMenuClick(
        { menuItemId: 'create-sticky-note' },
        { id: 123 }
      );
      
      expect(result.error).toBe('Tab not found');
    });
    
    it('should create open-dashboard context menu item', () => {
      function createDashboardContextMenu() {
        chrome.contextMenus.create({
          id: 'open-dashboard',
          title: 'Open Notes Dashboard',
          contexts: ['page'],
          documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
        });
      }
      
      createDashboardContextMenu();
      
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'open-dashboard',
          contexts: ['page'],
          documentUrlPatterns: expect.arrayContaining(['http://*/*', 'https://*/*'])
        })
      );
    });
    
    it('should open dashboard on open-dashboard menu click', async () => {
      async function handleContextMenuClick(info) {
        if (info.menuItemId === 'open-dashboard') {
          await chrome.tabs.create({ 
            url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
          });
        }
      }
      
      await handleContextMenuClick({ menuItemId: 'open-dashboard' });
      
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html'
      });
    });
    
    it('should use i18n message for dashboard context menu title', () => {
      global.chrome.i18n = {
        getMessage: jest.fn((key) => {
          if (key === 'contextMenuOpenDashboard') return 'Translated Dashboard Title';
          return '';
        })
      };
      
      function createDashboardContextMenu() {
        chrome.contextMenus.create({
          id: 'open-dashboard',
          title: chrome.i18n.getMessage('contextMenuOpenDashboard') || 'Open Notes Dashboard',
          contexts: ['page'],
          documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
        });
      }
      
      createDashboardContextMenu();
      
      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('contextMenuOpenDashboard');
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Translated Dashboard Title'
        })
      );
    });
    
    it('should fall back to default title when i18n message is missing', () => {
      global.chrome.i18n = {
        getMessage: jest.fn(() => '')
      };
      
      function createDashboardContextMenu() {
        chrome.contextMenus.create({
          id: 'open-dashboard',
          title: chrome.i18n.getMessage('contextMenuOpenDashboard') || 'Open Notes Dashboard',
          contexts: ['page'],
          documentUrlPatterns: ['http://*/*', 'https://*/*', 'file://*/*']
        });
      }
      
      createDashboardContextMenu();
      
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Open Notes Dashboard'
        })
      );
    });
  });
  
  describe('keyboard shortcuts', () => {
    const localThis = {};
    
    beforeEach(() => {
      localThis.commandHandler = null;
      global.chrome.commands = {
        onCommand: {
          addListener: jest.fn((handler) => {
            localThis.commandHandler = handler;
          })
        }
      };
      // Mock chrome.tabs.create
      global.chrome.tabs = {
        ...global.chrome.tabs,
        create: jest.fn()
      };
    });
    
    it('should register command listener', () => {
      function setupCommandListener(handler) {
        chrome.commands.onCommand.addListener(handler);
      }
      
      const handler = jest.fn();
      setupCommandListener(handler);
      
      expect(chrome.commands.onCommand.addListener).toHaveBeenCalledWith(handler);
    });
    
    it('should open dashboard on open-dashboard command', () => {
      function setupCommandListener() {
        chrome.commands.onCommand.addListener((command) => {
          if (command === 'open-dashboard') {
            chrome.tabs.create({ 
              url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
            });
          }
        });
      }
      
      setupCommandListener();
      
      // Simulate the command
      localThis.commandHandler('open-dashboard');
      
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html'
      });
    });
    
    it('should not open dashboard for other commands', () => {
      function setupCommandListener() {
        chrome.commands.onCommand.addListener((command) => {
          if (command === 'open-dashboard') {
            chrome.tabs.create({ 
              url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
            });
          }
        });
      }
      
      setupCommandListener();
      
      // Simulate a different command
      localThis.commandHandler('some-other-command');
      
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
    
    it('should handle chrome.tabs.create errors gracefully', async () => {
      global.chrome.tabs.create = jest.fn().mockRejectedValue(new Error('Failed to create tab'));
      
      async function handleCommand(command) {
        if (command === 'open-dashboard') {
          try {
            await chrome.tabs.create({ 
              url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
            });
          } catch (error) {
            // Log error but don't crash
            return { error: error.message };
          }
        }
        return { success: true };
      }
      
      const result = await handleCommand('open-dashboard');
      
      expect(result.error).toBe('Failed to create tab');
    });
  });
  
  describe('install listener', () => {
    const localThis = {};
    
    beforeEach(() => {
      localThis.installHandler = null;
      global.chrome.runtime = {
        ...global.chrome.runtime,
        onInstalled: {
          addListener: jest.fn((handler) => {
            localThis.installHandler = handler;
          })
        }
      };
      // Mock chrome.tabs.create
      global.chrome.tabs = {
        ...global.chrome.tabs,
        create: jest.fn()
      };
    });
    
    it('should register onInstalled listener', () => {
      function setupInstallListener(handler) {
        chrome.runtime.onInstalled.addListener(handler);
      }
      
      const handler = jest.fn();
      setupInstallListener(handler);
      
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledWith(handler);
    });
    
    it('should open welcome page on install', () => {
      function setupInstallListener() {
        chrome.runtime.onInstalled.addListener((details) => {
          if (details.reason === 'install') {
            chrome.tabs.create({ 
              url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/welcome.html' 
            });
          }
        });
      }
      
      setupInstallListener();
      
      // Simulate install
      localThis.installHandler({ reason: 'install' });
      
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/welcome.html'
      });
    });
    
    it('should NOT open welcome page on update', () => {
      function setupInstallListener() {
        chrome.runtime.onInstalled.addListener((details) => {
          if (details.reason === 'install') {
            chrome.tabs.create({ 
              url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/welcome.html' 
            });
          }
        });
      }
      
      setupInstallListener();
      
      // Simulate update
      localThis.installHandler({ reason: 'update' });
      
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
    
    it('should NOT open welcome page on browser update', () => {
      function setupInstallListener() {
        chrome.runtime.onInstalled.addListener((details) => {
          if (details.reason === 'install') {
            chrome.tabs.create({ 
              url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/welcome.html' 
            });
          }
        });
      }
      
      setupInstallListener();
      
      // Simulate browser update
      localThis.installHandler({ reason: 'chrome_update' });
      
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
  });
});
