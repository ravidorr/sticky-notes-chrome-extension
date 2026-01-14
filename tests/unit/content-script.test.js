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
    
    it('should handle chrome.runtime being undefined', async () => {
      const localThis = {};
      localThis.contextInvalidated = false;
      
      function handleContextInvalidated() {
        localThis.contextInvalidated = true;
      }
      
      async function sendMessageWithRuntimeCheck(message) {
        // Check if chrome.runtime is available (becomes undefined when context is invalidated)
        if (!chrome?.runtime?.sendMessage) {
          handleContextInvalidated();
          throw new Error('Extension context invalidated');
        }
        return await chrome.runtime.sendMessage(message);
      }
      
      // Simulate chrome.runtime being undefined by temporarily removing sendMessage
      localThis.originalSendMessage = chrome.runtime.sendMessage;
      delete chrome.runtime.sendMessage;
      
      await expect(sendMessageWithRuntimeCheck({ action: 'test' }))
        .rejects.toThrow('Extension context invalidated');
      expect(localThis.contextInvalidated).toBe(true);
      
      // Restore
      chrome.runtime.sendMessage = localThis.originalSendMessage;
    });
    
    it('should handle chrome.runtime itself being undefined', async () => {
      const localThis = {};
      localThis.contextInvalidated = false;
      
      function handleContextInvalidated() {
        localThis.contextInvalidated = true;
      }
      
      async function sendMessageWithRuntimeCheck(message) {
        // Check if chrome.runtime is available
        if (!chrome?.runtime?.sendMessage) {
          handleContextInvalidated();
          throw new Error('Extension context invalidated');
        }
        return await chrome.runtime.sendMessage(message);
      }
      
      // Simulate chrome.runtime being undefined
      localThis.originalRuntime = chrome.runtime;
      chrome.runtime = undefined;
      
      await expect(sendMessageWithRuntimeCheck({ action: 'test' }))
        .rejects.toThrow('Extension context invalidated');
      expect(localThis.contextInvalidated).toBe(true);
      
      // Restore
      chrome.runtime = localThis.originalRuntime;
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
      
      document.addEventListener('contextmenu', (event) => {
        lastRightClickedElement = event.target;
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
      
      const handler = (event) => {
        lastRightClickedElement = event .target;
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
      const lastRightClickedElement = null;
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
      const lastRightClickedElement = document.getElementById('title');
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
  
  describe('pending notes for SPA support', () => {
    it('should add note to pending queue when anchor not found', () => {
      const localThis = {};
      localThis.pendingNotes = new Map();
      localThis.pendingNoteTimeout = 10000;
      localThis.showReanchorUI = jest.fn();
      
      function addPendingNote(noteData) {
        const pendingEntry = {
          noteData,
          addedAt: Date.now(),
          timeoutId: setTimeout(() => {
            localThis.pendingNotes.delete(noteData.id);
            localThis.showReanchorUI(noteData);
          }, localThis.pendingNoteTimeout)
        };
        localThis.pendingNotes.set(noteData.id, pendingEntry);
      }
      
      const noteData = { id: 'note-1', selector: '#non-existent', content: 'Test' };
      addPendingNote(noteData);
      
      expect(localThis.pendingNotes.has('note-1')).toBe(true);
      expect(localThis.pendingNotes.get('note-1').noteData).toEqual(noteData);
      
      // Cleanup timeout
      clearTimeout(localThis.pendingNotes.get('note-1').timeoutId);
    });
    
    it('should resolve pending note when element appears', () => {
      const localThis = {};
      localThis.pendingNotes = new Map();
      localThis.resolved = [];
      
      // Add a pending note
      const noteData = { id: 'note-1', selector: '#dynamic-element', content: 'Test' };
      localThis.pendingNotes.set('note-1', {
        noteData,
        addedAt: Date.now(),
        timeoutId: null
      });
      
      function checkPendingNotes() {
        localThis.pendingNotes.forEach((pending, noteId) => {
          const anchorElement = document.querySelector(pending.noteData.selector);
          if (anchorElement) {
            localThis.resolved.push(noteId);
            localThis.pendingNotes.delete(noteId);
          }
        });
      }
      
      // Element doesn't exist yet
      checkPendingNotes();
      expect(localThis.resolved).toHaveLength(0);
      expect(localThis.pendingNotes.size).toBe(1);
      
      // Simulate SPA injecting the element
      const dynamicElement = document.createElement('div');
      dynamicElement.id = 'dynamic-element';
      document.body.appendChild(dynamicElement);
      
      // Now check again
      checkPendingNotes();
      expect(localThis.resolved).toContain('note-1');
      expect(localThis.pendingNotes.size).toBe(0);
    });
    
    it('should show re-anchor UI after timeout', async () => {
      const localThis = {};
      localThis.pendingNotes = new Map();
      localThis.showReanchorUI = jest.fn();
      
      // Use a very short timeout for testing
      const shortTimeout = 50;
      
      function addPendingNote(noteData) {
        const pendingEntry = {
          noteData,
          addedAt: Date.now(),
          timeoutId: setTimeout(() => {
            localThis.pendingNotes.delete(noteData.id);
            localThis.showReanchorUI(noteData);
          }, shortTimeout)
        };
        localThis.pendingNotes.set(noteData.id, pendingEntry);
      }
      
      const noteData = { id: 'note-timeout', selector: '#never-exists', content: 'Test' };
      addPendingNote(noteData);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, shortTimeout + 20));
      
      expect(localThis.showReanchorUI).toHaveBeenCalledWith(noteData);
      expect(localThis.pendingNotes.has('note-timeout')).toBe(false);
    });
    
    it('should clear pending notes on URL change', () => {
      const localThis = {};
      localThis.pendingNotes = new Map();
      
      // Add multiple pending notes with timeouts
      const timeoutIds = [];
      for (let i = 0; i < 3; i++) {
        const timeoutId = setTimeout(() => {}, 10000);
        timeoutIds.push(timeoutId);
        localThis.pendingNotes.set(`note-${i}`, {
          noteData: { id: `note-${i}` },
          timeoutId
        });
      }
      
      function clearPendingNotes() {
        localThis.pendingNotes.forEach((pending) => {
          clearTimeout(pending.timeoutId);
        });
        localThis.pendingNotes.clear();
      }
      
      expect(localThis.pendingNotes.size).toBe(3);
      
      clearPendingNotes();
      
      expect(localThis.pendingNotes.size).toBe(0);
    });
    
    it('should not duplicate pending notes', () => {
      const localThis = {};
      localThis.pendingNotes = new Map();
      
      function addPendingNote(noteData) {
        if (localThis.pendingNotes.has(noteData.id)) {
          return false; // Already pending
        }
        localThis.pendingNotes.set(noteData.id, { noteData });
        return true;
      }
      
      const noteData = { id: 'note-1', selector: '#test' };
      
      expect(addPendingNote(noteData)).toBe(true);
      expect(addPendingNote(noteData)).toBe(false);
      expect(localThis.pendingNotes.size).toBe(1);
    });
  });
  
  describe('highlightNote position persistence', () => {
    it('should clear customPosition when highlighting a note', () => {
      const localThis = {};
      localThis.note = {
        anchor: document.createElement('div'),
        selector: '#test',
        customPosition: { offsetX: 100, offsetY: 200 },
        position: { custom: { offsetX: 100, offsetY: 200 } },
        onPositionChange: jest.fn(),
        show: jest.fn(),
        bringToFront: jest.fn(),
        highlight: jest.fn()
      };
      
      function highlightNote(note) {
        if (!note || !note.anchor) return;
        
        // Reset custom position so note positions relative to anchor
        note.customPosition = null;
        // Persist the position change to storage
        note.position = { anchor: 'top-right' };
        note.onPositionChange(note.position);
      }
      
      highlightNote(localThis.note);
      
      expect(localThis.note.customPosition).toBeNull();
    });
    
    it('should reset position to default anchor when highlighting', () => {
      const localThis = {};
      localThis.note = {
        anchor: document.createElement('div'),
        customPosition: { offsetX: 100, offsetY: 200 },
        position: { custom: { offsetX: 100, offsetY: 200 } },
        onPositionChange: jest.fn(),
        show: jest.fn(),
        bringToFront: jest.fn(),
        highlight: jest.fn()
      };
      
      function highlightNote(note) {
        if (!note || !note.anchor) return;
        
        note.customPosition = null;
        note.position = { anchor: 'top-right' };
        note.onPositionChange(note.position);
      }
      
      highlightNote(localThis.note);
      
      expect(localThis.note.position).toEqual({ anchor: 'top-right' });
    });
    
    it('should call onPositionChange to persist position when highlighting', () => {
      const localThis = {};
      localThis.note = {
        anchor: document.createElement('div'),
        customPosition: { offsetX: 100, offsetY: 200 },
        position: { custom: { offsetX: 100, offsetY: 200 } },
        onPositionChange: jest.fn(),
        show: jest.fn(),
        bringToFront: jest.fn(),
        highlight: jest.fn()
      };
      
      function highlightNote(note) {
        if (!note || !note.anchor) return;
        
        note.customPosition = null;
        note.position = { anchor: 'top-right' };
        note.onPositionChange(note.position);
      }
      
      highlightNote(localThis.note);
      
      expect(localThis.note.onPositionChange).toHaveBeenCalledWith({ anchor: 'top-right' });
    });
    
    it('should not call onPositionChange if note has no anchor', () => {
      const localThis = {};
      localThis.note = {
        anchor: null,
        customPosition: { offsetX: 100, offsetY: 200 },
        position: { custom: { offsetX: 100, offsetY: 200 } },
        onPositionChange: jest.fn()
      };
      
      function highlightNote(note) {
        if (!note || !note.anchor) return;
        
        note.customPosition = null;
        note.position = { anchor: 'top-right' };
        note.onPositionChange(note.position);
      }
      
      highlightNote(localThis.note);
      
      expect(localThis.note.onPositionChange).not.toHaveBeenCalled();
      // customPosition should remain unchanged since early return
      expect(localThis.note.customPosition).toEqual({ offsetX: 100, offsetY: 200 });
    });
  });
  
  describe('orphaned notes management', () => {
    it('should track orphaned notes separately', () => {
      const localThis = {};
      localThis.orphanedNotes = new Map();
      localThis.pendingNotes = new Map();
      
      function addOrphanedNote(noteData) {
        const entry = { noteData, addedAt: Date.now() };
        localThis.orphanedNotes.set(noteData.id, entry);
        localThis.pendingNotes.set(noteData.id, entry);
      }
      
      addOrphanedNote({ id: 'note-1', selector: '#missing', content: 'Test' });
      
      expect(localThis.orphanedNotes.size).toBe(1);
      expect(localThis.pendingNotes.size).toBe(1);
      expect(localThis.orphanedNotes.has('note-1')).toBe(true);
    });
    
    it('should remove from orphanedNotes when anchor is found', () => {
      const localThis = {};
      localThis.orphanedNotes = new Map();
      localThis.pendingNotes = new Map();
      localThis.resolved = [];
      
      // Add orphaned note
      const noteData = { id: 'note-1', selector: '#found-element', content: 'Test' };
      localThis.orphanedNotes.set('note-1', { noteData });
      localThis.pendingNotes.set('note-1', { noteData });
      
      function resolveOrphanedNote(noteId) {
        localThis.pendingNotes.delete(noteId);
        localThis.orphanedNotes.delete(noteId);
        localThis.resolved.push(noteId);
      }
      
      resolveOrphanedNote('note-1');
      
      expect(localThis.orphanedNotes.size).toBe(0);
      expect(localThis.pendingNotes.size).toBe(0);
      expect(localThis.resolved).toContain('note-1');
    });
    
    it('should get all notes with orphan status', () => {
      const localThis = {};
      localThis.notes = new Map();
      localThis.orphanedNotes = new Map();
      
      // Add an active note
      localThis.notes.set('active-1', { 
        id: 'active-1', 
        content: 'Active', 
        theme: 'yellow', 
        selector: '#active' 
      });
      
      // Add an orphaned note
      localThis.orphanedNotes.set('orphan-1', { 
        noteData: { id: 'orphan-1', content: 'Orphaned', theme: 'blue', selector: '#missing' }
      });
      
      function getAllNotesWithOrphanStatus() {
        const allNotes = [];
        localThis.notes.forEach((note, id) => {
          allNotes.push({ ...note, id, isOrphaned: false });
        });
        localThis.orphanedNotes.forEach((entry, id) => {
          if (!localThis.notes.has(id)) {
            allNotes.push({ ...entry.noteData, isOrphaned: true });
          }
        });
        return allNotes;
      }
      
      const notes = getAllNotesWithOrphanStatus();
      
      expect(notes).toHaveLength(2);
      expect(notes.find((note) => note.id === 'active-1').isOrphaned).toBe(false);
      expect(notes.find((note) => note.id === 'orphan-1').isOrphaned).toBe(true);
    });
    
    it('should position orphaned note centered on viewport', () => {
      const localThis = {};
      localThis.element = document.createElement('div');
      localThis.element.style.width = '280px';
      localThis.element.style.height = '200px';
      document.body.appendChild(localThis.element);
      
      // Mock getBoundingClientRect
      localThis.element.getBoundingClientRect = jest.fn(() => ({
        width: 280,
        height: 200
      }));
      
      function positionCentered() {
        const rect = localThis.element.getBoundingClientRect();
        const x = (window.innerWidth - rect.width) / 2;
        const y = (window.innerHeight - rect.height) / 2;
        localThis.element.style.left = `${x}px`;
        localThis.element.style.top = `${y}px`;
        return { x, y };
      }
      
      const pos = positionCentered();
      
      // Should be centered
      expect(pos.x).toBe((window.innerWidth - 280) / 2);
      expect(pos.y).toBe((window.innerHeight - 200) / 2);
    });
    
    it('should update badge count when orphaned notes change', async () => {
      const localThis = {};
      localThis.orphanedNotes = new Map();
      localThis.badgeUpdates = [];
      
      async function updateOrphanedBadge() {
        localThis.badgeUpdates.push(localThis.orphanedNotes.size);
      }
      
      // Add orphaned note
      localThis.orphanedNotes.set('note-1', { noteData: { id: 'note-1' } });
      await updateOrphanedBadge();
      
      // Add another
      localThis.orphanedNotes.set('note-2', { noteData: { id: 'note-2' } });
      await updateOrphanedBadge();
      
      // Remove one
      localThis.orphanedNotes.delete('note-1');
      await updateOrphanedBadge();
      
      expect(localThis.badgeUpdates).toEqual([1, 2, 1]);
    });
    
    it('should clear both pending and orphaned notes on URL change', () => {
      const localThis = {};
      localThis.pendingNotes = new Map();
      localThis.orphanedNotes = new Map();
      
      // Add some notes
      localThis.pendingNotes.set('note-1', { noteData: { id: 'note-1' } });
      localThis.orphanedNotes.set('note-1', { noteData: { id: 'note-1' } });
      localThis.pendingNotes.set('note-2', { noteData: { id: 'note-2' } });
      localThis.orphanedNotes.set('note-2', { noteData: { id: 'note-2' } });
      
      function clearPendingNotes() {
        localThis.pendingNotes.clear();
        localThis.orphanedNotes.clear();
      }
      
      clearPendingNotes();
      
      expect(localThis.pendingNotes.size).toBe(0);
      expect(localThis.orphanedNotes.size).toBe(0);
    });
  });
  
  describe('iframe initialization guards', () => {
    it('should skip initialization for about: URLs', () => {
      function shouldInitialize(url, isTopFrame, innerWidth, innerHeight) {
        // Skip non-persistent URL schemes
        if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
          return false;
        }
        // For iframes, skip tiny frames
        if (!isTopFrame) {
          const minSize = 50;
          if (innerWidth < minSize || innerHeight < minSize) {
            return false;
          }
        }
        return true;
      }
      
      expect(shouldInitialize('about:blank', true, 800, 600)).toBe(false);
      expect(shouldInitialize('about:srcdoc', false, 800, 600)).toBe(false);
    });
    
    it('should skip initialization for blob: URLs', () => {
      function shouldInitialize(url, isTopFrame, innerWidth, innerHeight) {
        if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
          return false;
        }
        if (!isTopFrame) {
          const minSize = 50;
          if (innerWidth < minSize || innerHeight < minSize) {
            return false;
          }
        }
        return true;
      }
      
      expect(shouldInitialize('blob:https://example.com/uuid', true, 800, 600)).toBe(false);
      expect(shouldInitialize('blob:null/uuid', false, 800, 600)).toBe(false);
    });
    
    it('should skip initialization for data: URLs', () => {
      function shouldInitialize(url, isTopFrame, innerWidth, innerHeight) {
        if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
          return false;
        }
        if (!isTopFrame) {
          const minSize = 50;
          if (innerWidth < minSize || innerHeight < minSize) {
            return false;
          }
        }
        return true;
      }
      
      expect(shouldInitialize('data:text/html,<h1>Test</h1>', true, 800, 600)).toBe(false);
    });
    
    it('should skip initialization for tiny iframes', () => {
      function shouldInitialize(url, isTopFrame, innerWidth, innerHeight) {
        if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
          return false;
        }
        if (!isTopFrame) {
          const minSize = 50;
          if (innerWidth < minSize || innerHeight < minSize) {
            return false;
          }
        }
        return true;
      }
      
      // Tiny iframe (tracking pixel)
      expect(shouldInitialize('https://tracker.com/pixel', false, 1, 1)).toBe(false);
      // Small iframe (ad)
      expect(shouldInitialize('https://ads.com/banner', false, 49, 100)).toBe(false);
      expect(shouldInitialize('https://ads.com/banner', false, 100, 49)).toBe(false);
    });
    
    it('should allow initialization for normal iframes', () => {
      function shouldInitialize(url, isTopFrame, innerWidth, innerHeight) {
        if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
          return false;
        }
        if (!isTopFrame) {
          const minSize = 50;
          if (innerWidth < minSize || innerHeight < minSize) {
            return false;
          }
        }
        return true;
      }
      
      // Normal sized iframe
      expect(shouldInitialize('https://app.figma.com/embed', false, 800, 600)).toBe(true);
      // Minimum valid size
      expect(shouldInitialize('https://example.com/iframe', false, 50, 50)).toBe(true);
    });
    
    it('should allow initialization for main frame regardless of size', () => {
      function shouldInitialize(url, isTopFrame, innerWidth, innerHeight) {
        if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
          return false;
        }
        if (!isTopFrame) {
          const minSize = 50;
          if (innerWidth < minSize || innerHeight < minSize) {
            return false;
          }
        }
        return true;
      }
      
      // Main frame - size check doesn't apply
      expect(shouldInitialize('https://example.com', true, 800, 600)).toBe(true);
      // Even small main frame (popup window)
      expect(shouldInitialize('https://example.com', true, 30, 30)).toBe(true);
    });
    
    it('should allow initialization for normal http/https pages', () => {
      function shouldInitialize(url, isTopFrame, innerWidth, innerHeight) {
        if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
          return false;
        }
        if (!isTopFrame) {
          const minSize = 50;
          if (innerWidth < minSize || innerHeight < minSize) {
            return false;
          }
        }
        return true;
      }
      
      expect(shouldInitialize('https://www.google.com', true, 1920, 1080)).toBe(true);
      expect(shouldInitialize('http://localhost:3000', true, 800, 600)).toBe(true);
      expect(shouldInitialize('file:///Users/test/page.html', true, 800, 600)).toBe(true);
    });
  });
  
  describe('context menu frameId handling', () => {
    it('should include frameId in message options when available', () => {
      const localThis = {};
      localThis.messages = [];
      
      function handleContextMenuClick(info, tab, sendMessage) {
        if (info.menuItemId === 'create-sticky-note' && tab?.id) {
          const options = info.frameId !== undefined ? { frameId: info.frameId } : {};
          sendMessage(tab.id, { action: 'createNoteAtClick' }, options);
        }
      }
      
      const sendMessage = (tabId, message, options) => {
        localThis.messages.push({ tabId, message, options });
      };
      
      // Context menu clicked in an iframe (frameId = 123)
      handleContextMenuClick(
        { menuItemId: 'create-sticky-note', frameId: 123 },
        { id: 1 },
        sendMessage
      );
      
      expect(localThis.messages).toHaveLength(1);
      expect(localThis.messages[0].options).toEqual({ frameId: 123 });
    });
    
    it('should send to main frame when frameId is 0', () => {
      const localThis = {};
      localThis.messages = [];
      
      function handleContextMenuClick(info, tab, sendMessage) {
        if (info.menuItemId === 'create-sticky-note' && tab?.id) {
          const options = info.frameId !== undefined ? { frameId: info.frameId } : {};
          sendMessage(tab.id, { action: 'createNoteAtClick' }, options);
        }
      }
      
      const sendMessage = (tabId, message, options) => {
        localThis.messages.push({ tabId, message, options });
      };
      
      // Context menu clicked in main frame (frameId = 0)
      handleContextMenuClick(
        { menuItemId: 'create-sticky-note', frameId: 0 },
        { id: 1 },
        sendMessage
      );
      
      expect(localThis.messages).toHaveLength(1);
      expect(localThis.messages[0].options).toEqual({ frameId: 0 });
    });
    
    it('should send without frameId option when frameId is undefined', () => {
      const localThis = {};
      localThis.messages = [];
      
      function handleContextMenuClick(info, tab, sendMessage) {
        if (info.menuItemId === 'create-sticky-note' && tab?.id) {
          const options = info.frameId !== undefined ? { frameId: info.frameId } : {};
          sendMessage(tab.id, { action: 'createNoteAtClick' }, options);
        }
      }
      
      const sendMessage = (tabId, message, options) => {
        localThis.messages.push({ tabId, message, options });
      };
      
      // Context menu clicked without frameId info (older Chrome versions)
      handleContextMenuClick(
        { menuItemId: 'create-sticky-note' },
        { id: 1 },
        sendMessage
      );
      
      expect(localThis.messages).toHaveLength(1);
      expect(localThis.messages[0].options).toEqual({});
    });
  });
  
  describe('note metadata with frame context', () => {
    it('should include isTopFrame and frameUrl in note metadata for main frame', () => {
      function createNoteMetadata(url, title, isTopFrame) {
        return {
          url: url,
          title: title,
          browser: 'Test Browser',
          viewport: '800x600',
          timestamp: new Date().toISOString(),
          isTopFrame: isTopFrame,
          frameUrl: isTopFrame ? null : url
        };
      }
      
      const metadata = createNoteMetadata('https://example.com', 'Example', true);
      
      expect(metadata.isTopFrame).toBe(true);
      expect(metadata.frameUrl).toBeNull();
    });
    
    it('should include frameUrl in note metadata for iframes', () => {
      function createNoteMetadata(url, title, isTopFrame) {
        return {
          url: url,
          title: title,
          browser: 'Test Browser',
          viewport: '800x600',
          timestamp: new Date().toISOString(),
          isTopFrame: isTopFrame,
          frameUrl: isTopFrame ? null : url
        };
      }
      
      const metadata = createNoteMetadata('https://app.figma.com/embed/123', 'Figma', false);
      
      expect(metadata.isTopFrame).toBe(false);
      expect(metadata.frameUrl).toBe('https://app.figma.com/embed/123');
    });
  });
});
