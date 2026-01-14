/**
 * NoteManager Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let NoteManager;
let StickyNote;

// Mock dependencies
const createMockDependencies = () => {
  const localThis = {};
  
  localThis.notes = new Map();
  localThis.container = document.createElement('div');
  localThis.container.id = 'notes-container';
  document.body.appendChild(localThis.container);
  
  localThis.sendMessage = jest.fn(() => Promise.resolve({ success: true }));
  localThis.isContextInvalidatedError = jest.fn(() => false);
  localThis.getCurrentUser = jest.fn(() => ({ uid: 'user-123', email: 'test@example.com' }));
  localThis.getCurrentUrl = jest.fn(() => 'https://example.com/page');
  localThis.getTabUrl = jest.fn(() => 'https://example.com/page');
  localThis.getFrameUrl = jest.fn(() => 'https://example.com/page');
  localThis.isTopFrame = jest.fn(() => true);
  localThis.subscribeToComments = jest.fn();
  localThis.unsubscribeFromComments = jest.fn();
  localThis.showReanchorUI = jest.fn();
  
  localThis.selectorEngine = {
    generate: jest.fn((el) => `#${el.id || 'generated-selector'}`),
    findBestMatch: jest.fn(() => null)
  };
  
  localThis.visibilityManager = {
    observe: jest.fn(),
    unobserve: jest.fn()
  };
  
  return localThis;
};

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '<div id="anchor-element">Anchor Content</div>';
  
  // Reset chrome mocks
  chrome.runtime.sendMessage.mockClear();
  
  // Import modules fresh for each test
  const noteManagerModule = await import('../../src/content/app/NoteManager.js');
  NoteManager = noteManagerModule.NoteManager;
  
  const stickyNoteModule = await import('../../src/content/components/StickyNote.js');
  StickyNote = stickyNoteModule.StickyNote;
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('NoteManager', () => {
  describe('constructor', () => {
    it('should initialize with empty notes map', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      expect(manager.notes).toBeDefined();
      expect(manager.notes.size).toBe(0);
    });
    
    it('should initialize pendingNotes map', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      expect(manager.pendingNotes).toBeInstanceOf(Map);
      expect(manager.pendingNotes.size).toBe(0);
    });
    
    it('should initialize orphanedNotes map', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      expect(manager.orphanedNotes).toBeInstanceOf(Map);
      expect(manager.orphanedNotes.size).toBe(0);
    });
    
    it('should initialize sessionCreatedNoteIds map', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      expect(manager.sessionCreatedNoteIds).toBeInstanceOf(Map);
      expect(manager.sessionCreatedNoteIds.size).toBe(0);
    });
  });
  
  describe('sessionCreatedNoteIds tracking', () => {
    it('should track note ID after successful creation via handleElementSelect', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteId = 'new-note-123';
      localThis.sendMessage.mockResolvedValueOnce({
        success: true,
        note: {
          id: noteId,
          selector: '#anchor-element',
          content: '',
          theme: 'yellow',
          position: { anchor: 'top-right' }
        }
      });
      
      await manager.handleElementSelect(anchor);
      
      expect(manager.sessionCreatedNoteIds.has(noteId)).toBe(true);
    });
    
    it('should track note ID after successful creation via createNoteAtElement', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteId = 'context-menu-note-456';
      localThis.sendMessage.mockResolvedValueOnce({
        success: true,
        note: {
          id: noteId,
          selector: '#anchor-element',
          content: '',
          theme: 'yellow',
          position: { anchor: 'top-right' }
        }
      });
      
      await manager.createNoteAtElement(anchor, '#anchor-element');
      
      expect(manager.sessionCreatedNoteIds.has(noteId)).toBe(true);
    });
    
    it('should not track note ID when save fails', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      localThis.sendMessage.mockResolvedValueOnce({
        success: false,
        error: 'Save failed'
      });
      
      await manager.handleElementSelect(anchor);
      
      expect(manager.sessionCreatedNoteIds.size).toBe(0);
    });
    
    it('should purge tracked note IDs older than grace window', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteId = 'temp-note-789';
      // Insert an "old" marker and a "fresh" marker
      const now = Date.now();
      manager.sessionCreatedNoteIds.set(noteId, now - 20000);
      manager.sessionCreatedNoteIds.set('fresh-note-000', now);
      expect(manager.sessionCreatedNoteIds.size).toBe(2);

      // Any realtime update should trigger opportunistic purge
      manager.handleRealtimeNotesUpdate([]);

      expect(manager.sessionCreatedNoteIds.has(noteId)).toBe(false);
      expect(manager.sessionCreatedNoteIds.has('fresh-note-000')).toBe(true);
    });
  });
  
  describe('handleRealtimeNotesUpdate - race condition handling', () => {
    it('should create note as maximized (isNewNote: true) when ID is in sessionCreatedNoteIds', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteId = 'session-note-001';
      manager.sessionCreatedNoteIds.set(noteId, Date.now());
      
      const noteData = {
        id: noteId,
        selector: '#anchor-element',
        content: 'Test content',
        theme: 'blue',
        position: { anchor: 'top-right' }
      };
      
      // Spy on createNoteFromData to verify it's called with isNewNote: true
      const createSpy = jest.spyOn(manager, 'createNoteFromData');
      
      manager.handleRealtimeNotesUpdate([noteData]);
      
      expect(createSpy).toHaveBeenCalledWith(noteData, { isNewNote: true });
      
      createSpy.mockRestore();
    });
    
    it('should create note as minimized (isNewNote: false) when ID is NOT in sessionCreatedNoteIds', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteId = 'external-note-002';
      // Note: NOT adding to sessionCreatedNoteIds
      
      const noteData = {
        id: noteId,
        selector: '#anchor-element',
        content: 'External content',
        theme: 'green',
        position: { anchor: 'top-right' }
      };
      
      const createSpy = jest.spyOn(manager, 'createNoteFromData');
      
      manager.handleRealtimeNotesUpdate([noteData]);
      
      expect(createSpy).toHaveBeenCalledWith(noteData, { isNewNote: false });
      
      createSpy.mockRestore();
    });
    
    it('should not call createNoteFromData for notes that already exist', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteId = 'existing-note-003';
      
      // Create an existing note in the map
      const existingNote = new StickyNote({
        id: noteId,
        anchor: anchor,
        selector: '#anchor-element',
        content: 'Existing',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      manager.notes.set(noteId, existingNote);
      
      const noteData = {
        id: noteId,
        selector: '#anchor-element',
        content: 'Updated content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      const createSpy = jest.spyOn(manager, 'createNoteFromData');
      
      manager.handleRealtimeNotesUpdate([noteData]);
      
      // Should NOT call createNoteFromData since note exists
      expect(createSpy).not.toHaveBeenCalled();
      
      // But should update content
      expect(existingNote.content).toBe('Updated content');
      
      createSpy.mockRestore();
      existingNote.destroy();
    });
  });
  
  describe('createNoteFromData - isMinimized behavior', () => {
    it('should create note minimized when isNewNote is false (default)', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteData = {
        id: 'loaded-note-001',
        selector: '#anchor-element',
        content: 'Loaded content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      manager.createNoteFromData(noteData);
      
      const note = manager.notes.get(noteData.id);
      expect(note).toBeDefined();
      expect(note.isMinimized).toBe(true);
      expect(note.element.classList.contains('sn-minimized')).toBe(true);
      
      note.destroy();
    });
    
    it('should create note maximized when isNewNote is true', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteData = {
        id: 'new-note-002',
        selector: '#anchor-element',
        content: '',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      manager.createNoteFromData(noteData, { isNewNote: true });
      
      const note = manager.notes.get(noteData.id);
      expect(note).toBeDefined();
      expect(note.isMinimized).toBe(false);
      expect(note.element.classList.contains('sn-minimized')).toBe(false);
      
      note.destroy();
    });
  });

  describe('createNoteFromData - selector disambiguation', () => {
    it('should disambiguate when selector matches multiple elements using anchorText', () => {
      document.body.innerHTML = `
        <div class="sn-test-target">First</div>
        <div class="sn-test-target">Second</div>
      `;

      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);

      const noteData = {
        id: 'note-disambig-1',
        selector: '.sn-test-target',
        anchorText: 'Second',
        content: 'Loaded content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };

      manager.createNoteFromData(noteData);

      const note = manager.notes.get(noteData.id);
      expect(note).toBeDefined();
      expect((note.anchor?.textContent || '').trim()).toBe('Second');
      expect(localThis.selectorEngine.findBestMatch).not.toHaveBeenCalled();

      note.destroy();
    });
  });
  
  describe('clearAll', () => {
    it('should clear sessionCreatedNoteIds', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Add some tracked IDs
      manager.sessionCreatedNoteIds.set('note-1', Date.now());
      manager.sessionCreatedNoteIds.set('note-2', Date.now());
      expect(manager.sessionCreatedNoteIds.size).toBe(2);
      
      manager.clearAll();
      
      expect(manager.sessionCreatedNoteIds.size).toBe(0);
    });
    
    it('should clear notes map', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      // Create a note
      const noteData = {
        id: 'note-to-clear',
        selector: '#anchor-element',
        content: 'Content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      manager.createNoteFromData(noteData);
      expect(manager.notes.size).toBe(1);
      
      manager.clearAll();
      
      expect(manager.notes.size).toBe(0);
    });
    
    it('should clear pending and orphaned notes', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Add pending/orphaned notes
      manager.pendingNotes.set('pending-1', { noteData: {}, addedAt: Date.now() });
      manager.orphanedNotes.set('orphan-1', { noteData: {}, addedAt: Date.now() });
      
      manager.clearAll();
      
      expect(manager.pendingNotes.size).toBe(0);
      expect(manager.orphanedNotes.size).toBe(0);
    });
  });
  
  describe('race condition simulation', () => {
    it('should handle real-time update winning the race - note still created maximized', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteId = 'race-note-001';
      const noteData = {
        id: noteId,
        selector: '#anchor-element',
        content: '',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      // Simulate the race: first track the ID (as handleElementSelect would)
      manager.sessionCreatedNoteIds.set(noteId, Date.now());
      
      // Then real-time update comes in before direct creation
      manager.handleRealtimeNotesUpdate([noteData]);
      
      // Verify note was created maximized
      const note = manager.notes.get(noteId);
      expect(note).toBeDefined();
      expect(note.isMinimized).toBe(false);
      
      note.destroy();
    });
    
    it('should skip duplicate creation when note already exists', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteId = 'dup-note-001';
      const noteData = {
        id: noteId,
        selector: '#anchor-element',
        content: '',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      // First creation
      manager.createNoteFromData(noteData, { isNewNote: true });
      expect(manager.notes.size).toBe(1);
      
      // Second creation attempt (should be skipped)
      manager.createNoteFromData(noteData, { isNewNote: false });
      expect(manager.notes.size).toBe(1);
      
      // Note should still be maximized from first creation
      const note = manager.notes.get(noteId);
      expect(note.isMinimized).toBe(false);
      
      note.destroy();
    });
  });
});
