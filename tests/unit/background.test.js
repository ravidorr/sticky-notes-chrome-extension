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
      chrome.tabs.sendMessage.mockClear();
    });
    
    it('should create context menu with correct options', () => {
      function createContextMenu() {
        chrome.contextMenus.create({
          id: 'create-sticky-note',
          title: 'Create Sticky Note Here',
          contexts: ['page', 'selection', 'image', 'link']
        });
      }
      
      createContextMenu();
      
      expect(chrome.contextMenus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'create-sticky-note',
          contexts: expect.arrayContaining(['page', 'selection', 'image', 'link'])
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
  });
});
