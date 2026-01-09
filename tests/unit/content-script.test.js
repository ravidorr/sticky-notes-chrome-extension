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
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async
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
      const loaded = results.filter(result => result.loaded);
      const skipped = results.filter(result => result.skipped);
      
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
  
  describe('context menu - right-click tracking', () => {
    it('should track last right-clicked element', () => {
      let lastRightClickedElement = null;
      
      document.addEventListener('contextmenu', (e) => {
        lastRightClickedElement = e.target;
      }, true);
      
      const element = document.getElementById('title');
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(event);
      
      expect(lastRightClickedElement).toBe(element);
    });
    
    it('should update tracked element on subsequent right-clicks', () => {
      let lastRightClickedElement = null;
      
      const handler = (e) => {
        lastRightClickedElement = e.target;
      };
      document.addEventListener('contextmenu', handler, true);
      
      // First right-click
      const element1 = document.getElementById('title');
      element1.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      expect(lastRightClickedElement).toBe(element1);
      
      // Second right-click on different element
      const element2 = document.getElementById('paragraph');
      element2.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      expect(lastRightClickedElement).toBe(element2);
      
      document.removeEventListener('contextmenu', handler, true);
    });
  });
  
  describe('context menu - createNoteAtClick message handling', () => {
    it('should handle createNoteAtClick action', () => {
      const createNoteAtClick = jest.fn(() => Promise.resolve());
      
      function handleMessage(message, handlers) {
        const handler = handlers[message.action];
        if (handler) {
          return handler(message);
        }
        return { success: false, error: 'Unknown action' };
      }
      
      handleMessage(
        { action: 'createNoteAtClick' },
        { createNoteAtClick }
      );
      
      expect(createNoteAtClick).toHaveBeenCalled();
    });
    
    it('should not create note without right-clicked element', async () => {
      let lastRightClickedElement = null;
      let noteCreated = false;
      
      async function createNoteAtClick() {
        if (!lastRightClickedElement) {
          return { success: false, error: 'No element' };
        }
        noteCreated = true;
        return { success: true };
      }
      
      const result = await createNoteAtClick();
      
      expect(result.success).toBe(false);
      expect(noteCreated).toBe(false);
    });
    
    it('should create note with tracked element', async () => {
      let lastRightClickedElement = document.getElementById('title');
      let createdSelector = null;
      
      function generateSelector(element) {
        return `#${element.id}`;
      }
      
      async function createNoteAtClick() {
        if (!lastRightClickedElement) {
          return { success: false, error: 'No element' };
        }
        
        const selector = generateSelector(lastRightClickedElement);
        if (!selector) {
          return { success: false, error: 'Could not generate selector' };
        }
        
        createdSelector = selector;
        return { success: true, selector };
      }
      
      const result = await createNoteAtClick();
      
      expect(result.success).toBe(true);
      expect(createdSelector).toBe('#title');
    });
  });
  
  describe('context menu - note creation at element', () => {
    it('should save note with correct metadata', async () => {
      const element = document.getElementById('article-1');
      const selector = '#article-1';
      
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        note: { id: 'new-id', selector, content: '' }
      });
      
      async function createNoteAtElement(element, selector) {
        const noteData = {
          url: window.location.href,
          selector: selector,
          content: '',
          theme: 'yellow',
          position: { anchor: 'top-right' },
          anchorText: element.textContent?.trim().substring(0, 100) || '',
          metadata: {
            url: window.location.href,
            title: document.title,
            browser: 'Test Browser',
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date().toISOString()
          }
        };
        
        const response = await chrome.runtime.sendMessage({
          action: 'saveNote',
          note: noteData
        });
        
        return response;
      }
      
      const result = await createNoteAtElement(element, selector);
      
      expect(result.success).toBe(true);
      expect(result.note.selector).toBe('#article-1');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'saveNote',
          note: expect.objectContaining({
            selector: '#article-1',
            theme: 'yellow',
            content: ''
          })
        })
      );
    });
    
    it('should handle missing element gracefully', async () => {
      async function createNoteAtElement(element, selector) {
        if (!element || !selector) {
          return { success: false, error: 'Missing element or selector' };
        }
        return { success: true };
      }
      
      const result = await createNoteAtElement(null, null);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing element or selector');
    });
    
    it('should handle save failure', async () => {
      const element = document.getElementById('title');
      
      chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Storage quota exceeded'
      });
      
      async function createNoteAtElement(element, selector) {
        const response = await chrome.runtime.sendMessage({
          action: 'saveNote',
          note: { selector, content: '' }
        });
        
        if (!response.success) {
          return { success: false, error: response.error };
        }
        return response;
      }
      
      const result = await createNoteAtElement(element, '#title');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage quota exceeded');
    });
  });
});
