/**
 * Content Script Unit Tests
 * Tests the main content script logic patterns
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Content Script Logic', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="root">
        <header id="main-header">Header</header>
        <main id="content">
          <article id="article-1">
            <h1 id="title">Title</h1>
            <p id="paragraph">Content paragraph</p>
          </article>
        </main>
      </div>
    `;
    
    chrome.runtime.sendMessage.mockClear();
    chrome.runtime.onMessage.addListener.mockClear();
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
  });
  
  describe('message handling', () => {
    it('should setup message listener', () => {
      function setupMessageListeners(handlers) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          const handler = handlers[message.action];
          if (handler) {
            handler(message, sendResponse);
            return true; // Keep channel open for async response
          }
          sendResponse({ success: false, error: 'Unknown action' });
        });
      }
      
      const handlers = {
        enableSelectionMode: jest.fn(),
        loadNotes: jest.fn()
      };
      
      setupMessageListeners(handlers);
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
    
    it('should handle enableSelectionMode action', () => {
      const handleEnableSelectionMode = jest.fn(() => ({ success: true }));
      
      function handleMessage(message, handlers) {
        const handler = handlers[message.action];
        if (handler) {
          return handler(message);
        }
        return { success: false, error: 'Unknown action' };
      }
      
      const result = handleMessage(
        { action: 'enableSelectionMode' },
        { enableSelectionMode: handleEnableSelectionMode }
      );
      
      expect(handleEnableSelectionMode).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
    
    it('should handle unknown actions', () => {
      function handleMessage(message, handlers) {
        const handler = handlers[message.action];
        if (handler) {
          return handler(message);
        }
        return { success: false, error: 'Unknown action' };
      }
      
      const result = handleMessage({ action: 'unknownAction' }, {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown action');
    });
  });
  
  describe('shadow DOM container', () => {
    it('should create shadow container', () => {
      function createShadowContainer() {
        const container = document.createElement('div');
        container.id = 'sticky-notes-extension-root';
        const shadow = container.attachShadow({ mode: 'closed' });
        document.body.appendChild(container);
        return { container, shadow };
      }
      
      const { container, shadow } = createShadowContainer();
      
      expect(container.id).toBe('sticky-notes-extension-root');
      expect(shadow).toBeDefined();
      expect(document.getElementById('sticky-notes-extension-root')).toBe(container);
    });
    
    it('should inject styles into shadow DOM', () => {
      function injectStyles(shadow, css) {
        const style = document.createElement('style');
        style.textContent = css;
        shadow.appendChild(style);
        return style;
      }
      
      const container = document.createElement('div');
      const shadow = container.attachShadow({ mode: 'open' });
      
      const style = injectStyles(shadow, '.test { color: red; }');
      
      expect(shadow.querySelector('style')).toBe(style);
      expect(style.textContent).toContain('.test');
    });
  });
  
  describe('note management', () => {
    it('should store notes in a Map', () => {
      const notes = new Map();
      
      const note1 = { id: 'note-1', content: 'Test 1' };
      const note2 = { id: 'note-2', content: 'Test 2' };
      
      notes.set(note1.id, note1);
      notes.set(note2.id, note2);
      
      expect(notes.size).toBe(2);
      expect(notes.get('note-1')).toBe(note1);
    });
    
    it('should delete notes from Map', () => {
      const notes = new Map();
      notes.set('note-1', { id: 'note-1' });
      
      notes.delete('note-1');
      
      expect(notes.has('note-1')).toBe(false);
    });
    
    it('should clear all notes', () => {
      const notes = new Map();
      notes.set('note-1', {});
      notes.set('note-2', {});
      
      notes.clear();
      
      expect(notes.size).toBe(0);
    });
  });
  
  describe('element selection', () => {
    it('should identify valid elements for annotation', () => {
      function shouldIgnoreElement(element) {
        if (!element) return true;
        
        const ignoredTags = ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD'];
        return ignoredTags.includes(element.tagName);
      }
      
      expect(shouldIgnoreElement(null)).toBe(true);
      expect(shouldIgnoreElement(document.body)).toBe(true);
      expect(shouldIgnoreElement(document.documentElement)).toBe(true);
      expect(shouldIgnoreElement(document.getElementById('title'))).toBe(false);
    });
    
    it('should check if element is part of extension', () => {
      function isExtensionElement(element, rootId) {
        if (!element) return false;
        
        let current = element;
        while (current) {
          if (current.id === rootId) return true;
          current = current.parentElement;
        }
        return false;
      }
      
      const root = document.createElement('div');
      root.id = 'sticky-notes-extension-root';
      const child = document.createElement('div');
      root.appendChild(child);
      document.body.appendChild(root);
      
      expect(isExtensionElement(child, 'sticky-notes-extension-root')).toBe(true);
      expect(isExtensionElement(document.getElementById('title'), 'sticky-notes-extension-root')).toBe(false);
    });
  });
  
  describe('URL handling', () => {
    it('should track current URL', () => {
      let currentUrl = window.location.href;
      
      function handleUrlChange(newUrl, callback) {
        if (newUrl !== currentUrl) {
          const oldUrl = currentUrl;
          currentUrl = newUrl;
          callback(oldUrl, newUrl);
        }
      }
      
      const callback = jest.fn();
      handleUrlChange('https://example.com/new-page', callback);
      
      expect(callback).toHaveBeenCalled();
      expect(currentUrl).toBe('https://example.com/new-page');
    });
    
    it('should not trigger callback for same URL', () => {
      let currentUrl = 'https://example.com/page';
      
      function handleUrlChange(newUrl, callback) {
        if (newUrl !== currentUrl) {
          currentUrl = newUrl;
          callback();
        }
      }
      
      const callback = jest.fn();
      handleUrlChange('https://example.com/page', callback);
      
      expect(callback).not.toHaveBeenCalled();
    });
  });
  
  describe('note loading', () => {
    it('should request notes from background', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        notes: [{ id: '1', content: 'Test' }]
      });
      
      async function loadNotes(url) {
        const response = await chrome.runtime.sendMessage({
          action: 'getNotes',
          url
        });
        
        if (response.success) {
          return response.notes;
        }
        throw new Error(response.error || 'Failed to load notes');
      }
      
      const notes = await loadNotes('https://example.com');
      
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('1');
    });
    
    it('should handle load failure', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Network error'
      });
      
      async function loadNotes(url) {
        const response = await chrome.runtime.sendMessage({
          action: 'getNotes',
          url
        });
        
        if (response.success) {
          return response.notes;
        }
        throw new Error(response.error || 'Failed to load notes');
      }
      
      await expect(loadNotes('https://example.com')).rejects.toThrow('Network error');
    });
  });
  
  describe('note saving', () => {
    it('should save note to background', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        note: { id: 'new-id', content: 'Test' }
      });
      
      async function saveNote(noteData) {
        const response = await chrome.runtime.sendMessage({
          action: 'saveNote',
          note: noteData
        });
        
        if (response.success) {
          return response.note;
        }
        throw new Error(response.error || 'Failed to save note');
      }
      
      const note = await saveNote({
        url: 'https://example.com',
        selector: '#title',
        content: 'Test'
      });
      
      expect(note.id).toBe('new-id');
    });
  });
  
  describe('note deletion', () => {
    it('should delete note from background', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      async function deleteNote(noteId) {
        const response = await chrome.runtime.sendMessage({
          action: 'deleteNote',
          noteId
        });
        
        return response.success;
      }
      
      const result = await deleteNote('note-1');
      expect(result).toBe(true);
    });
  });
  
  describe('extension context invalidation', () => {
    it('should detect context invalidation error', () => {
      function isContextInvalidatedError(error) {
        return error?.message?.includes('Extension context invalidated');
      }
      
      expect(isContextInvalidatedError(
        new Error('Extension context invalidated')
      )).toBe(true);
      
      expect(isContextInvalidatedError(
        new Error('Network error')
      )).toBe(false);
    });
    
    it('should handle context invalidation gracefully', async () => {
      async function sendMessageSafe(message) {
        try {
          return await chrome.runtime.sendMessage(message);
        } catch (error) {
          if (error.message?.includes('Extension context invalidated')) {
            return { 
              success: false, 
              error: 'Extension was updated. Please refresh the page.' 
            };
          }
          throw error;
        }
      }
      
      chrome.runtime.sendMessage.mockRejectedValue(
        new Error('Extension context invalidated')
      );
      
      const result = await sendMessageSafe({ action: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('refresh');
    });
  });
  
  describe('race condition prevention', () => {
    it('should prevent concurrent note loading', async () => {
      let isLoading = false;
      const loadAttempts = [];
      
      async function loadNotesWithLock(url) {
        if (isLoading) {
          return { skipped: true };
        }
        
        isLoading = true;
        loadAttempts.push(url);
        
        try {
          await new Promise(r => setTimeout(r, 100)); // Simulate async
          return { loaded: true };
        } finally {
          isLoading = false;
        }
      }
      
      // Start two concurrent loads
      const results = await Promise.all([
        loadNotesWithLock('url1'),
        loadNotesWithLock('url2')
      ]);
      
      // One should be loaded, one should be skipped
      const loaded = results.filter(r => r.loaded);
      const skipped = results.filter(r => r.skipped);
      
      expect(loaded.length).toBe(1);
      expect(skipped.length).toBe(1);
    });
  });
  
  describe('escapeHtml utility', () => {
    it('should escape HTML characters', () => {
      function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }
      
      expect(escapeHtml('<script>alert("xss")</script>')).not.toContain('<script>');
      expect(escapeHtml('Hello & "World"')).toContain('&amp;');
    });
  });
  
  describe('mutation observer', () => {
    it('should create mutation observer', () => {
      const callback = jest.fn();
      const observer = new MutationObserver(callback);
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      expect(observer).toBeDefined();
      
      observer.disconnect();
    });
  });
});
