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
  
  // Track global visibility state for the mock
  let mockGloballyVisible = true;
  localThis.visibilityManager = {
    observe: jest.fn(),
    unobserve: jest.fn(),
    setGlobalVisibility: jest.fn((visible) => {
      mockGloballyVisible = visible;
    }),
    getGlobalVisibility: jest.fn(() => mockGloballyVisible),
    // Expose setter for tests to manipulate internal state
    _setMockVisibility: (visible) => { mockGloballyVisible = visible; }
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
  
  describe('highlightNote', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should highlight a note by ID', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'highlight-note-001',
        selector: '#anchor-element',
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      manager.createNoteFromData(noteData);
      const note = manager.notes.get(noteData.id);
      const highlightSpy = jest.spyOn(note, 'highlight');
      const showSpy = jest.spyOn(note, 'show');
      const bringToFrontSpy = jest.spyOn(note, 'bringToFront');
      
      manager.highlightNote(noteData.id);
      
      // Advance timers past the 400ms delay
      jest.advanceTimersByTime(500);
      
      expect(showSpy).toHaveBeenCalled();
      expect(bringToFrontSpy).toHaveBeenCalled();
      expect(highlightSpy).toHaveBeenCalled();
      
      note.destroy();
    });
    
    it('should not maximize note by default when highlighting', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'highlight-no-max-001',
        selector: '#anchor-element',
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      manager.createNoteFromData(noteData);
      const note = manager.notes.get(noteData.id);
      const maximizeSpy = jest.spyOn(note, 'maximize');
      
      manager.highlightNote(noteData.id);
      
      // Advance timers past the 400ms delay
      jest.advanceTimersByTime(500);
      
      expect(maximizeSpy).not.toHaveBeenCalled();
      
      note.destroy();
    });
    
    it('should maximize note when maximize parameter is true', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'highlight-max-001',
        selector: '#anchor-element',
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      manager.createNoteFromData(noteData);
      const note = manager.notes.get(noteData.id);
      const maximizeSpy = jest.spyOn(note, 'maximize');
      
      manager.highlightNote(noteData.id, true);
      
      // Advance timers past the 400ms delay
      jest.advanceTimersByTime(500);
      
      expect(maximizeSpy).toHaveBeenCalled();
      
      note.destroy();
    });
    
    it('should do nothing for non-existent note', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Should not throw
      expect(() => manager.highlightNote('non-existent-id')).not.toThrow();
    });
    
    it('should scroll anchor into view', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      const scrollIntoViewSpy = jest.spyOn(anchor, 'scrollIntoView');
      
      const noteData = {
        id: 'highlight-scroll-001',
        selector: '#anchor-element',
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      manager.createNoteFromData(noteData);
      
      manager.highlightNote(noteData.id);
      
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
      
      const note = manager.notes.get(noteData.id);
      note.destroy();
    });
    
    it('should highlight anchor element when highlighting note from popup', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const noteData = {
        id: 'highlight-anchor-001',
        selector: '#anchor-element',
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      manager.createNoteFromData(noteData);
      
      manager.highlightNote(noteData.id);
      
      // Anchor should not be highlighted immediately (waiting for scroll)
      expect(anchor.classList.contains('sn-element-highlight')).toBe(false);
      
      // Advance past scroll animation delay
      jest.advanceTimersByTime(400);
      
      // Now anchor should be highlighted
      expect(anchor.classList.contains('sn-element-highlight')).toBe(true);
      
      // Advance past highlight removal delay (2000ms)
      jest.advanceTimersByTime(2000);
      
      // Highlight should be removed
      expect(anchor.classList.contains('sn-element-highlight')).toBe(false);
      
      const note = manager.notes.get(noteData.id);
      note.destroy();
    });
  });
  
  describe('highlightAndMaximizeNote', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should call highlightNote with maximize=true', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const highlightNoteSpy = jest.spyOn(manager, 'highlightNote');
      
      manager.highlightAndMaximizeNote('some-note-id');
      
      expect(highlightNoteSpy).toHaveBeenCalledWith('some-note-id', true);
      
      highlightNoteSpy.mockRestore();
    });
    
    it('should highlight and maximize an existing note', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'highlight-and-max-001',
        selector: '#anchor-element',
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      // Create note as minimized (default)
      manager.createNoteFromData(noteData);
      const note = manager.notes.get(noteData.id);
      expect(note.isMinimized).toBe(true);
      
      const highlightSpy = jest.spyOn(note, 'highlight');
      const maximizeSpy = jest.spyOn(note, 'maximize');
      
      manager.highlightAndMaximizeNote(noteData.id);
      
      // Advance timers past the 400ms delay
      jest.advanceTimersByTime(500);
      
      expect(highlightSpy).toHaveBeenCalled();
      expect(maximizeSpy).toHaveBeenCalled();
      expect(note.isMinimized).toBe(false);
      
      note.destroy();
    });
  });
  
  describe('race condition simulation', () => {
    it('should handle real-time update winning the race - note still created maximized', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
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
    
    it('should mark shared notes as read when created', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const sharedNoteData = {
        id: 'shared-note-001',
        selector: '#anchor-element',
        content: 'Shared content',
        theme: 'blue',
        position: { anchor: 'top-right' },
        isShared: true
      };
      
      manager.createNoteFromData(sharedNoteData);
      
      // Should have called sendMessage with markSharedNoteRead action
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'markSharedNoteRead',
        noteId: 'shared-note-001'
      });
      
      const note = manager.notes.get('shared-note-001');
      note.destroy();
    });
    
    it('should not mark non-shared notes as read', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const ownedNoteData = {
        id: 'owned-note-001',
        selector: '#anchor-element',
        content: 'My note',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isShared: false
      };
      
      manager.createNoteFromData(ownedNoteData);
      
      // Should NOT have called markSharedNoteRead
      expect(localThis.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'markSharedNoteRead' })
      );
      
      const note = manager.notes.get('owned-note-001');
      note.destroy();
    });
  });
  
  describe('markSharedNoteAsRead', () => {
    it('should send markSharedNoteRead message', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: true });
      const manager = new NoteManager(localThis);
      
      await manager.markSharedNoteAsRead('note-123');
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'markSharedNoteRead',
        noteId: 'note-123'
      });
    });
    
    it('should handle errors gracefully', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Network error'));
      const manager = new NoteManager(localThis);
      
      // Should not throw
      await expect(manager.markSharedNoteAsRead('note-123')).resolves.toBeUndefined();
    });
    
    it('should not log error for context invalidated errors', async () => {
      const localThis = createMockDependencies();
      const contextError = new Error('Extension context invalidated');
      localThis.sendMessage.mockRejectedValue(contextError);
      localThis.isContextInvalidatedError.mockReturnValue(true);
      const manager = new NoteManager(localThis);
      
      await manager.markSharedNoteAsRead('note-123');
      
      // Should have checked if it's a context error
      expect(localThis.isContextInvalidatedError).toHaveBeenCalledWith(contextError);
    });
  });

  describe('addPendingNote', () => {
    it('should add note to orphanedNotes and pendingNotes', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = { id: 'pending-note-1', selector: '.missing', content: 'Test' };
      manager.addPendingNote(noteData);
      
      expect(manager.orphanedNotes.has('pending-note-1')).toBe(true);
      expect(manager.pendingNotes.has('pending-note-1')).toBe(true);
      expect(manager.orphanedNotes.get('pending-note-1').noteData).toBe(noteData);
    });
    
    it('should call updateOrphanedBadge', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = { id: 'pending-note-2', selector: '.missing', content: 'Test' };
      manager.addPendingNote(noteData);
      
      // updateOrphanedBadge should have been called
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateOrphanedCount',
        count: 1
      });
    });
  });

  describe('updateOrphanedBadge', () => {
    it('should send updateOrphanedCount message with count', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.orphanedNotes.set('orphan-1', { noteData: {}, addedAt: Date.now() });
      manager.orphanedNotes.set('orphan-2', { noteData: {}, addedAt: Date.now() });
      
      await manager.updateOrphanedBadge();
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateOrphanedCount',
        count: 2
      });
    });
    
    it('should handle errors gracefully', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Network error'));
      const manager = new NoteManager(localThis);
      
      // Should not throw
      await expect(manager.updateOrphanedBadge()).resolves.toBeUndefined();
    });
  });

  describe('getOrphanedNotes', () => {
    it('should return array of orphaned note data with isOrphaned flag', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData1 = { id: 'orphan-1', content: 'Content 1' };
      const noteData2 = { id: 'orphan-2', content: 'Content 2' };
      manager.orphanedNotes.set('orphan-1', { noteData: noteData1, addedAt: Date.now() });
      manager.orphanedNotes.set('orphan-2', { noteData: noteData2, addedAt: Date.now() });
      
      const result = manager.getOrphanedNotes();
      
      expect(result).toHaveLength(2);
      expect(result[0].isOrphaned).toBe(true);
      expect(result[1].isOrphaned).toBe(true);
    });
    
    it('should return empty array when no orphaned notes', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const result = manager.getOrphanedNotes();
      
      expect(result).toEqual([]);
    });
  });

  describe('checkPendingNotes', () => {
    it('should do nothing when no pending notes', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Should not throw
      manager.checkPendingNotes();
      expect(manager.pendingNotes.size).toBe(0);
    });
    
    it('should resolve pending notes when anchor element appears', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'pending-resolve-1',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      // Add as pending
      manager.pendingNotes.set(noteData.id, { noteData, addedAt: Date.now() });
      manager.orphanedNotes.set(noteData.id, { noteData, addedAt: Date.now() });
      
      // Check pending notes - anchor element exists
      manager.checkPendingNotes();
      
      // Should have been removed from pending and orphaned
      expect(manager.pendingNotes.has(noteData.id)).toBe(false);
      expect(manager.orphanedNotes.has(noteData.id)).toBe(false);
      
      // Should have created the note
      expect(manager.notes.has(noteData.id)).toBe(true);
      
      manager.notes.get(noteData.id).destroy();
    });
    
    it('should use fuzzy matching when exact selector fails', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'pending-fuzzy-1',
        selector: '.non-existent-selector',
        anchorText: 'Anchor Content',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      // Set up fuzzy match to return the anchor element
      const anchor = document.getElementById('anchor-element');
      localThis.selectorEngine.findBestMatch.mockReturnValue(anchor);
      
      manager.pendingNotes.set(noteData.id, { noteData, addedAt: Date.now() });
      manager.orphanedNotes.set(noteData.id, { noteData, addedAt: Date.now() });
      
      manager.checkPendingNotes();
      
      expect(localThis.selectorEngine.findBestMatch).toHaveBeenCalled();
    });
  });

  describe('clearPendingNotes', () => {
    it('should clear both pending and orphaned notes', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.pendingNotes.set('p1', { noteData: {}, addedAt: Date.now() });
      manager.orphanedNotes.set('o1', { noteData: {}, addedAt: Date.now() });
      
      manager.clearPendingNotes();
      
      expect(manager.pendingNotes.size).toBe(0);
      expect(manager.orphanedNotes.size).toBe(0);
    });
    
    it('should update badge after clearing', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.orphanedNotes.set('o1', { noteData: {}, addedAt: Date.now() });
      
      manager.clearPendingNotes();
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateOrphanedCount',
        count: 0
      });
    });
  });

  describe('loadNotes', () => {
    it('should fetch notes and create them', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({
        success: true,
        notes: [
          { id: 'loaded-1', selector: '#anchor-element', content: 'Note 1', theme: 'yellow', position: { anchor: 'top-right' } }
        ]
      });
      const manager = new NoteManager(localThis);
      const subscribeToNotes = jest.fn();
      
      await manager.loadNotes(subscribeToNotes);
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'getNotes',
        url: 'https://example.com/page'
      });
      expect(manager.notes.has('loaded-1')).toBe(true);
      
      manager.notes.get('loaded-1').destroy();
    });
    
    it('should subscribe to notes when user is logged in', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: true, notes: [] });
      const manager = new NoteManager(localThis);
      const subscribeToNotes = jest.fn();
      
      await manager.loadNotes(subscribeToNotes);
      
      expect(subscribeToNotes).toHaveBeenCalled();
    });
    
    it('should not subscribe when user is not logged in', async () => {
      const localThis = createMockDependencies();
      localThis.getCurrentUser.mockReturnValue(null);
      localThis.sendMessage.mockResolvedValue({ success: true, notes: [] });
      const manager = new NoteManager(localThis);
      const subscribeToNotes = jest.fn();
      
      await manager.loadNotes(subscribeToNotes);
      
      expect(subscribeToNotes).not.toHaveBeenCalled();
    });
    
    it('should handle errors gracefully', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Network error'));
      const manager = new NoteManager(localThis);
      const subscribeToNotes = jest.fn();
      
      // Should not throw
      await expect(manager.loadNotes(subscribeToNotes)).resolves.toBeUndefined();
    });
  });

  describe('handleNoteSave', () => {
    it('should send updateNote message', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      await manager.handleNoteSave('note-1', 'Updated content');
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateNote',
        note: { id: 'note-1', content: 'Updated content' }
      });
    });
    
    it('should handle errors gracefully', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Save failed'));
      const manager = new NoteManager(localThis);
      
      await expect(manager.handleNoteSave('note-1', 'content')).resolves.toBeUndefined();
    });
  });

  describe('handleThemeChange', () => {
    it('should send updateNote message with theme', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      await manager.handleThemeChange('note-1', 'blue');
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateNote',
        note: { id: 'note-1', theme: 'blue' }
      });
    });
  });

  describe('handlePositionChange', () => {
    it('should send updateNote message with position', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      await manager.handlePositionChange('note-1', { anchor: 'bottom-left' });
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateNote',
        note: { id: 'note-1', position: { anchor: 'bottom-left' } }
      });
    });
  });

  describe('handleNoteDelete', () => {
    it('should delete note and clean up', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: true });
      const manager = new NoteManager(localThis);
      
      // Create a note first
      const noteData = {
        id: 'delete-me',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      manager.createNoteFromData(noteData);
      expect(manager.notes.has('delete-me')).toBe(true);
      
      await manager.handleNoteDelete('delete-me');
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'deleteNote',
        noteId: 'delete-me'
      });
      expect(manager.notes.has('delete-me')).toBe(false);
    });
    
    it('should not remove note if delete fails', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: false });
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'keep-me',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      manager.createNoteFromData(noteData);
      
      await manager.handleNoteDelete('keep-me');
      
      expect(manager.notes.has('keep-me')).toBe(true);
      manager.notes.get('keep-me').destroy();
    });
  });

  describe('comment handlers', () => {
    describe('handleAddComment', () => {
      it('should send addComment message and return comment', async () => {
        const localThis = createMockDependencies();
        const createdComment = { id: 'comment-1', content: 'Test comment' };
        localThis.sendMessage.mockResolvedValue({ success: true, comment: createdComment });
        const manager = new NoteManager(localThis);
        
        const result = await manager.handleAddComment('note-1', { content: 'Test comment' });
        
        expect(localThis.sendMessage).toHaveBeenCalledWith({
          action: 'addComment',
          noteId: 'note-1',
          comment: { content: 'Test comment' }
        });
        expect(result).toBe(createdComment);
      });
      
      it('should throw error on failure', async () => {
        const localThis = createMockDependencies();
        localThis.sendMessage.mockResolvedValue({ success: false, error: 'Failed' });
        const manager = new NoteManager(localThis);
        
        await expect(manager.handleAddComment('note-1', { content: 'Test' }))
          .rejects.toThrow();
      });
    });

    describe('handleEditComment', () => {
      it('should send editComment message', async () => {
        const localThis = createMockDependencies();
        localThis.sendMessage.mockResolvedValue({ success: true });
        const manager = new NoteManager(localThis);
        
        const result = await manager.handleEditComment('note-1', 'comment-1', { content: 'Updated' });
        
        expect(localThis.sendMessage).toHaveBeenCalledWith({
          action: 'editComment',
          noteId: 'note-1',
          commentId: 'comment-1',
          updates: { content: 'Updated' }
        });
        expect(result).toBe(true);
      });
    });

    describe('handleDeleteComment', () => {
      it('should send deleteComment message', async () => {
        const localThis = createMockDependencies();
        localThis.sendMessage.mockResolvedValue({ success: true });
        const manager = new NoteManager(localThis);
        
        const result = await manager.handleDeleteComment('note-1', 'comment-1');
        
        expect(localThis.sendMessage).toHaveBeenCalledWith({
          action: 'deleteComment',
          noteId: 'note-1',
          commentId: 'comment-1'
        });
        expect(result).toBe(true);
      });
    });

    describe('handleLoadComments', () => {
      it('should send getComments message and return comments', async () => {
        const localThis = createMockDependencies();
        const comments = [{ id: 'c1' }, { id: 'c2' }];
        localThis.sendMessage.mockResolvedValue({ success: true, comments });
        const manager = new NoteManager(localThis);
        
        const result = await manager.handleLoadComments('note-1');
        
        expect(localThis.sendMessage).toHaveBeenCalledWith({
          action: 'getComments',
          noteId: 'note-1'
        });
        expect(result).toEqual(comments);
      });
      
      it('should return empty array when comments is undefined', async () => {
        const localThis = createMockDependencies();
        localThis.sendMessage.mockResolvedValue({ success: true });
        const manager = new NoteManager(localThis);
        
        const result = await manager.handleLoadComments('note-1');
        
        expect(result).toEqual([]);
      });
    });
  });

  describe('handleReanchor', () => {
    it('should update note with new selector', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      await manager.handleReanchor('note-1', anchor);
      
      expect(localThis.selectorEngine.generate).toHaveBeenCalledWith(anchor);
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateNote',
        note: expect.objectContaining({
          id: 'note-1',
          selector: '#anchor-element'
        })
      });
    });
    
    it('should not update if selector generation fails', async () => {
      const localThis = createMockDependencies();
      localThis.selectorEngine.generate.mockReturnValue(null);
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      await manager.handleReanchor('note-1', anchor);
      
      expect(localThis.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleElementSelect', () => {
    it('should handle reanchor when pendingReanchor is provided', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      const pendingReanchor = {
        id: 'reanchor-note',
        selector: '.old-selector',
        content: 'Test',
        theme: 'yellow'
      };
      
      await manager.handleElementSelect(anchor, pendingReanchor);
      
      // Should have called handleReanchor (which sends updateNote)
      expect(localThis.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'updateNote' })
      );
    });
    
    it('should create new note when no pendingReanchor', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({
        success: true,
        note: {
          id: 'new-note-from-select',
          selector: '#anchor-element',
          content: '',
          theme: 'yellow',
          position: { anchor: 'top-right' }
        }
      });
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      await manager.handleElementSelect(anchor);
      
      expect(localThis.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'saveNote' })
      );
      expect(manager.notes.has('new-note-from-select')).toBe(true);
      
      manager.notes.get('new-note-from-select').destroy();
    });
  });

  describe('createNoteAtElement', () => {
    it('should not create note if element is missing', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      await manager.createNoteAtElement(null, '#selector');
      
      expect(localThis.sendMessage).not.toHaveBeenCalled();
    });
    
    it('should not create note if selector is missing', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      await manager.createNoteAtElement(anchor, null);
      
      expect(localThis.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleRealtimeCommentsUpdate', () => {
    it('should update comments on note with comment section', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Create a note
      const noteData = {
        id: 'note-with-comments',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      manager.createNoteFromData(noteData);
      
      const note = manager.notes.get('note-with-comments');
      // Mock the commentSection with all required methods
      note.commentSection = { updateComments: jest.fn(), destroy: jest.fn() };
      
      const comments = [{ id: 'c1' }, { id: 'c2' }];
      manager.handleRealtimeCommentsUpdate('note-with-comments', comments);
      
      expect(note.commentSection.updateComments).toHaveBeenCalledWith(comments);
      
      note.destroy();
    });
    
    it('should do nothing if note does not exist', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Should not throw
      manager.handleRealtimeCommentsUpdate('non-existent', []);
    });
  });

  describe('updateUser', () => {
    it('should update user on all notes', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Create notes
      manager.createNoteFromData({
        id: 'user-note-1',
        selector: '#anchor-element',
        content: 'Test 1',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      
      const note = manager.notes.get('user-note-1');
      const setUserSpy = jest.spyOn(note, 'setUser');
      
      const newUser = { uid: 'new-user', email: 'new@example.com' };
      manager.updateUser(newUser);
      
      expect(setUserSpy).toHaveBeenCalledWith(newUser);
      
      note.destroy();
    });
  });

  describe('getAllNotesWithOrphanStatus', () => {
    it('should return active notes with isOrphaned false', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.createNoteFromData({
        id: 'active-note-1',
        selector: '#anchor-element',
        content: 'Active',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      
      const result = manager.getAllNotesWithOrphanStatus();
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('active-note-1');
      expect(result[0].isOrphaned).toBe(false);
      
      manager.notes.get('active-note-1').destroy();
    });
    
    it('should include orphaned notes with isOrphaned true', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.orphanedNotes.set('orphan-1', {
        noteData: { id: 'orphan-1', content: 'Orphaned' },
        addedAt: Date.now()
      });
      
      const result = manager.getAllNotesWithOrphanStatus();
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('orphan-1');
      expect(result[0].isOrphaned).toBe(true);
    });
    
    it('should not duplicate notes that are in both maps', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Create active note
      manager.createNoteFromData({
        id: 'both-note',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      
      // Also add to orphaned (shouldn't happen normally but test the guard)
      manager.orphanedNotes.set('both-note', {
        noteData: { id: 'both-note', content: 'Test' },
        addedAt: Date.now()
      });
      
      const result = manager.getAllNotesWithOrphanStatus();
      
      // Should only have one entry
      expect(result).toHaveLength(1);
      
      manager.notes.get('both-note').destroy();
    });
  });

  describe('showOrphanedNote', () => {
    it('should log warning if orphaned note not found', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Should not throw
      manager.showOrphanedNote('non-existent');
    });
    
    it('should create note UI for orphaned note', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'orphan-show-1',
        selector: '.missing',
        content: 'Orphaned content',
        theme: 'blue',
        position: { anchor: 'top-right' }
      };
      manager.orphanedNotes.set('orphan-show-1', { noteData, addedAt: Date.now() });
      
      manager.showOrphanedNote('orphan-show-1');
      
      expect(manager.notes.has('orphan-show-1')).toBe(true);
      
      manager.notes.get('orphan-show-1').destroy();
    });
    
    it('should enable global visibility when showing orphaned note if currently hidden', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Set global visibility to hidden
      localThis.visibilityManager._setMockVisibility(false);
      expect(localThis.visibilityManager.getGlobalVisibility()).toBe(false);
      
      const noteData = {
        id: 'orphan-show-visibility',
        selector: '.missing',
        content: 'Orphaned content',
        theme: 'blue',
        position: { anchor: 'top-right' }
      };
      manager.orphanedNotes.set('orphan-show-visibility', { noteData, addedAt: Date.now() });
      
      manager.showOrphanedNote('orphan-show-visibility');
      
      // Should have called setGlobalVisibility(true) to enable visibility
      expect(localThis.visibilityManager.setGlobalVisibility).toHaveBeenCalledWith(true);
      
      manager.notes.get('orphan-show-visibility').destroy();
    });
    
    it('should not call setGlobalVisibility when already visible', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Global visibility is already true by default
      expect(localThis.visibilityManager.getGlobalVisibility()).toBe(true);
      
      const noteData = {
        id: 'orphan-show-already-visible',
        selector: '.missing',
        content: 'Orphaned content',
        theme: 'blue',
        position: { anchor: 'top-right' }
      };
      manager.orphanedNotes.set('orphan-show-already-visible', { noteData, addedAt: Date.now() });
      
      manager.showOrphanedNote('orphan-show-already-visible');
      
      // setGlobalVisibility should NOT have been called since visibility is already true
      expect(localThis.visibilityManager.setGlobalVisibility).not.toHaveBeenCalled();
      
      manager.notes.get('orphan-show-already-visible').destroy();
    });
  });

  describe('positionNoteCentered', () => {
    it('should position note in center of viewport', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Create a note
      manager.createNoteFromData({
        id: 'center-note',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      
      const note = manager.notes.get('center-note');
      
      manager.positionNoteCentered(note);
      
      // Should have set left and top styles
      expect(note.element.style.left).toBeDefined();
      expect(note.element.style.top).toBeDefined();
      expect(note.customPosition).toBeDefined();
      
      note.destroy();
    });
    
    it('should do nothing if note has no element', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Should not throw
      manager.positionNoteCentered({ element: null });
    });
  });

  describe('handleOrphanedNoteDelete', () => {
    it('should delete orphaned note and clean up', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: true });
      const manager = new NoteManager(localThis);
      
      // Add orphaned note
      const noteData = { id: 'orphan-delete', content: 'Test' };
      manager.orphanedNotes.set('orphan-delete', { noteData, addedAt: Date.now() });
      manager.pendingNotes.set('orphan-delete', { noteData, addedAt: Date.now() });
      
      await manager.handleOrphanedNoteDelete('orphan-delete');
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'deleteNote',
        noteId: 'orphan-delete'
      });
      expect(manager.orphanedNotes.has('orphan-delete')).toBe(false);
      expect(manager.pendingNotes.has('orphan-delete')).toBe(false);
    });
    
    it('should not clean up when delete fails', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: false });
      const manager = new NoteManager(localThis);
      
      const noteData = { id: 'orphan-fail', content: 'Test' };
      manager.orphanedNotes.set('orphan-fail', { noteData, addedAt: Date.now() });
      manager.pendingNotes.set('orphan-fail', { noteData, addedAt: Date.now() });
      
      await manager.handleOrphanedNoteDelete('orphan-fail');
      
      // Should still be present since delete failed
      expect(manager.orphanedNotes.has('orphan-fail')).toBe(true);
      expect(manager.pendingNotes.has('orphan-fail')).toBe(true);
    });
    
    it('should handle context invalidated error silently', async () => {
      const localThis = createMockDependencies();
      const contextError = new Error('Extension context invalidated');
      localThis.sendMessage.mockRejectedValue(contextError);
      localThis.isContextInvalidatedError.mockReturnValue(true);
      const manager = new NoteManager(localThis);
      
      await manager.handleOrphanedNoteDelete('orphan-context');
      
      expect(localThis.isContextInvalidatedError).toHaveBeenCalledWith(contextError);
    });
    
    it('should destroy note UI when present in notes map', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: true });
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      // Create a note UI first
      const existingNote = new StickyNote({
        id: 'orphan-ui-test',
        anchor: anchor,
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      manager.notes.set('orphan-ui-test', existingNote);
      manager.orphanedNotes.set('orphan-ui-test', { noteData: { id: 'orphan-ui-test' }, addedAt: Date.now() });
      
      const destroySpy = jest.spyOn(existingNote, 'destroy');
      
      await manager.handleOrphanedNoteDelete('orphan-ui-test');
      
      expect(destroySpy).toHaveBeenCalled();
      expect(manager.notes.has('orphan-ui-test')).toBe(false);
    });
  });

  describe('createNoteFromData - edge cases', () => {
    it('should expand minimized note when isNewNote and note already exists', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Create note initially minimized
      const noteData = {
        id: 'expand-test',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      manager.createNoteFromData(noteData); // Created minimized by default
      
      const note = manager.notes.get('expand-test');
      expect(note.isMinimized).toBe(true);
      
      // Try to create again with isNewNote: true - should expand existing note
      manager.createNoteFromData(noteData, { isNewNote: true });
      
      // Note should now be maximized
      expect(note.isMinimized).toBe(false);
      
      note.destroy();
    });
    
    it('should skip already pending notes', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'pending-skip',
        selector: '.missing-selector',
        content: 'Test'
      };
      
      // Add to pending first
      manager.pendingNotes.set('pending-skip', { noteData, addedAt: Date.now() });
      
      // Try to create - should skip
      manager.createNoteFromData(noteData);
      
      // Should not be in notes (since it's pending)
      expect(manager.notes.has('pending-skip')).toBe(false);
    });
    
    it('should handle invalid selector gracefully', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'invalid-selector',
        selector: '[[[invalid',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      
      // Should not throw, should add to pending
      manager.createNoteFromData(noteData);
      
      expect(manager.orphanedNotes.has('invalid-selector')).toBe(true);
    });
    
    it('should disambiguate using fuzzy match when anchorText does not match exactly', () => {
      document.body.innerHTML = `
        <div class="sn-multi-target">First</div>
        <div class="sn-multi-target">Second</div>
      `;

      const localThis = createMockDependencies();
      const fuzzyMatch = document.querySelectorAll('.sn-multi-target')[1];
      localThis.selectorEngine.findBestMatch.mockReturnValue(fuzzyMatch);
      const manager = new NoteManager(localThis);

      const noteData = {
        id: 'note-fuzzy-disambig',
        selector: '.sn-multi-target',
        anchorText: 'SomeTextThatDoesNotMatchExactly',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };

      manager.createNoteFromData(noteData);

      expect(localThis.selectorEngine.findBestMatch).toHaveBeenCalled();
      
      const note = manager.notes.get('note-fuzzy-disambig');
      if (note) {
        note.destroy();
      }
    });
  });

  describe('handleRealtimeNotesUpdate - edge cases', () => {
    it('should handle null updatedNotes gracefully', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Should not throw
      manager.handleRealtimeNotesUpdate(null);
    });
    
    it('should remove notes that are no longer in the update', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      // Create existing note
      const existingNote = new StickyNote({
        id: 'to-remove',
        anchor: anchor,
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      manager.notes.set('to-remove', existingNote);
      localThis.container.appendChild(existingNote.element);
      
      // Call with empty array - should remove
      manager.handleRealtimeNotesUpdate([]);
      
      expect(manager.notes.has('to-remove')).toBe(false);
    });
    
    it('should update note theme when changed', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      // Create existing note
      const existingNote = new StickyNote({
        id: 'theme-update',
        anchor: anchor,
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      manager.notes.set('theme-update', existingNote);
      
      // Update with new theme
      manager.handleRealtimeNotesUpdate([{
        id: 'theme-update',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'blue',
        position: { anchor: 'top-right' }
      }]);
      
      expect(existingNote.theme).toBe('blue');
      
      existingNote.destroy();
    });
  });
  
  describe('error handling with context invalidated', () => {
    it('should not log handleThemeChange error for context invalidated', async () => {
      const localThis = createMockDependencies();
      const contextError = new Error('Extension context invalidated');
      localThis.sendMessage.mockRejectedValue(contextError);
      localThis.isContextInvalidatedError.mockReturnValue(true);
      const manager = new NoteManager(localThis);
      
      await manager.handleThemeChange('note-1', 'blue');
      
      expect(localThis.isContextInvalidatedError).toHaveBeenCalledWith(contextError);
    });
    
    it('should not log handlePositionChange error for context invalidated', async () => {
      const localThis = createMockDependencies();
      const contextError = new Error('Extension context invalidated');
      localThis.sendMessage.mockRejectedValue(contextError);
      localThis.isContextInvalidatedError.mockReturnValue(true);
      const manager = new NoteManager(localThis);
      
      await manager.handlePositionChange('note-1', { anchor: 'top-left' });
      
      expect(localThis.isContextInvalidatedError).toHaveBeenCalledWith(contextError);
    });
    
    it('should not log handleNoteDelete error for context invalidated', async () => {
      const localThis = createMockDependencies();
      const contextError = new Error('Extension context invalidated');
      localThis.sendMessage.mockRejectedValue(contextError);
      localThis.isContextInvalidatedError.mockReturnValue(true);
      const manager = new NoteManager(localThis);
      
      await manager.handleNoteDelete('note-1');
      
      expect(localThis.isContextInvalidatedError).toHaveBeenCalledWith(contextError);
    });
    
    it('should re-throw handleAddComment error', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Network error'));
      localThis.isContextInvalidatedError.mockReturnValue(false);
      const manager = new NoteManager(localThis);
      
      await expect(manager.handleAddComment('note-1', { content: 'test' }))
        .rejects.toThrow('Network error');
    });
    
    it('should re-throw handleEditComment error', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Edit failed'));
      localThis.isContextInvalidatedError.mockReturnValue(false);
      const manager = new NoteManager(localThis);
      
      await expect(manager.handleEditComment('note-1', 'comment-1', { content: 'updated' }))
        .rejects.toThrow('Edit failed');
    });
    
    it('should re-throw handleDeleteComment error', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Delete failed'));
      localThis.isContextInvalidatedError.mockReturnValue(false);
      const manager = new NoteManager(localThis);
      
      await expect(manager.handleDeleteComment('note-1', 'comment-1'))
        .rejects.toThrow('Delete failed');
    });
    
    it('should re-throw handleLoadComments error', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Load failed'));
      localThis.isContextInvalidatedError.mockReturnValue(false);
      const manager = new NoteManager(localThis);
      
      await expect(manager.handleLoadComments('note-1'))
        .rejects.toThrow('Load failed');
    });
  });

  describe('highlightNote - anchor not found', () => {
    it('should try to find anchor element when note.anchor is null', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'anchor-null-test',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      manager.createNoteFromData(noteData);
      
      const note = manager.notes.get('anchor-null-test');
      // Set anchor to null
      note.anchor = null;
      
      manager.highlightNote('anchor-null-test');
      
      // Should have re-found the anchor
      expect(note.anchor).not.toBeNull();
      
      note.destroy();
    });
    
    it('should return early when anchor cannot be found', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'no-anchor-test',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      };
      manager.createNoteFromData(noteData);
      
      const note = manager.notes.get('no-anchor-test');
      note.anchor = null;
      note.selector = '.non-existent-selector';
      
      const showSpy = jest.spyOn(note, 'show');
      
      manager.highlightNote('no-anchor-test');
      
      // Should not call show since anchor not found
      expect(showSpy).not.toHaveBeenCalled();
      
      note.destroy();
    });
  });

  describe('handleElementSelect - selector verification', () => {
    it('should warn when selector matches a different element', async () => {
      document.body.innerHTML = `
        <div id="first" class="duplicate">First</div>
        <div id="second" class="duplicate">Second</div>
      `;
      
      const localThis = createMockDependencies();
      // Return selector that matches first element, even though we're selecting second
      localThis.selectorEngine.generate.mockReturnValue('.duplicate');
      localThis.sendMessage.mockResolvedValue({
        success: true,
        note: { id: 'warn-note', selector: '.duplicate' }
      });
      const manager = new NoteManager(localThis);
      
      const secondElement = document.getElementById('second');
      
      await manager.handleElementSelect(secondElement);
      
      // Note should still be created despite the warning
      expect(localThis.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'saveNote' })
      );
    });
    
    it('should return early when selector generation fails', async () => {
      const localThis = createMockDependencies();
      localThis.selectorEngine.generate.mockReturnValue(null);
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      await manager.handleElementSelect(anchor);
      
      // Should not call sendMessage
      expect(localThis.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('createNoteAtElement - error handling', () => {
    it('should handle save failure', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockResolvedValue({ success: false, error: 'Save error' });
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      await manager.createNoteAtElement(anchor, '#anchor-element');
      
      // Should not create note on failure
      expect(manager.notes.size).toBe(0);
    });
    
    it('should handle context invalidated error', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Context invalidated'));
      localThis.isContextInvalidatedError.mockReturnValue(true);
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      await manager.createNoteAtElement(anchor, '#anchor-element');
      
      expect(localThis.isContextInvalidatedError).toHaveBeenCalled();
    });
  });

  describe('handleReanchor - error handling', () => {
    it('should handle sendMessage failure gracefully', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage.mockRejectedValue(new Error('Network error'));
      localThis.isContextInvalidatedError.mockReturnValue(false);
      const manager = new NoteManager(localThis);
      const anchor = document.getElementById('anchor-element');
      
      // Should not throw
      await expect(manager.handleReanchor('note-1', anchor)).resolves.toBeUndefined();
    });
  });
  
  describe('page-level notes', () => {
    describe('createPageLevelNote', () => {
      it('should create note with __PAGE__ selector', async () => {
        const localThis = createMockDependencies();
        localThis.getConsoleErrors = jest.fn(() => []);
        localThis.sendMessage.mockResolvedValueOnce({
          success: true,
          note: { id: 'page-note-1', selector: '__PAGE__', content: '' }
        });
        const manager = new NoteManager(localThis);
        
        const result = await manager.createPageLevelNote({ pageX: 100, pageY: 200 });
        
        expect(result).toBe(true);
        expect(localThis.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'saveNote',
            note: expect.objectContaining({
              selector: '__PAGE__',
              position: { pageX: 100, pageY: 200 }
            })
          })
        );
      });
      
      it('should use default position (10, 10) when not provided', async () => {
        const localThis = createMockDependencies();
        localThis.getConsoleErrors = jest.fn(() => []);
        localThis.sendMessage.mockResolvedValueOnce({
          success: true,
          note: { id: 'page-note-2', selector: '__PAGE__' }
        });
        const manager = new NoteManager(localThis);
        
        await manager.createPageLevelNote();
        
        expect(localThis.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            note: expect.objectContaining({
              position: { pageX: 10, pageY: 10 }
            })
          })
        );
      });
      
      it('should track note ID in sessionCreatedNoteIds', async () => {
        const localThis = createMockDependencies();
        localThis.getConsoleErrors = jest.fn(() => []);
        localThis.sendMessage.mockResolvedValueOnce({
          success: true,
          note: { id: 'tracked-page-note', selector: '__PAGE__' }
        });
        const manager = new NoteManager(localThis);
        
        await manager.createPageLevelNote();
        
        expect(manager.sessionCreatedNoteIds.has('tracked-page-note')).toBe(true);
      });
      
      it('should return false on save failure', async () => {
        const localThis = createMockDependencies();
        localThis.getConsoleErrors = jest.fn(() => []);
        localThis.sendMessage.mockResolvedValueOnce({ success: false, error: 'Failed' });
        const manager = new NoteManager(localThis);
        
        const result = await manager.createPageLevelNote();
        
        expect(result).toBe(false);
      });
      
      it('should return false on exception', async () => {
        const localThis = createMockDependencies();
        localThis.getConsoleErrors = jest.fn(() => []);
        localThis.sendMessage.mockRejectedValueOnce(new Error('Network error'));
        localThis.isContextInvalidatedError.mockReturnValue(false);
        const manager = new NoteManager(localThis);
        
        const result = await manager.createPageLevelNote();
        
        expect(result).toBe(false);
      });
    });
    
    describe('createNoteFromData with page-level notes', () => {
      it('should route page-level notes to createPageLevelNoteUI', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        const createPageLevelSpy = jest.spyOn(manager, 'createPageLevelNoteUI');
        
        const noteData = {
          id: 'page-note-routing',
          selector: '__PAGE__',
          content: 'Page note',
          position: { pageX: 50, pageY: 50 }
        };
        
        manager.createNoteFromData(noteData);
        
        expect(createPageLevelSpy).toHaveBeenCalledWith(noteData, expect.any(Object));
        
        createPageLevelSpy.mockRestore();
        const note = manager.notes.get('page-note-routing');
        if (note) note.destroy();
      });
      
      it('should not route regular notes to createPageLevelNoteUI', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        const createPageLevelSpy = jest.spyOn(manager, 'createPageLevelNoteUI');
        
        const noteData = {
          id: 'regular-note',
          selector: '#anchor-element',
          content: 'Regular note',
          theme: 'yellow',
          position: { anchor: 'top-right' }
        };
        
        manager.createNoteFromData(noteData);
        
        expect(createPageLevelSpy).not.toHaveBeenCalled();
        
        createPageLevelSpy.mockRestore();
        const note = manager.notes.get('regular-note');
        if (note) note.destroy();
      });
    });
    
    describe('createPageLevelNoteUI', () => {
      it('should create note with null anchor', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        
        const noteData = {
          id: 'page-ui-note',
          selector: '__PAGE__',
          content: 'Test',
          position: { pageX: 100, pageY: 200 }
        };
        
        manager.createPageLevelNoteUI(noteData);
        
        const note = manager.notes.get('page-ui-note');
        expect(note).toBeDefined();
        expect(note.anchor).toBeNull();
        expect(note.isPageLevel).toBe(true);
        
        note.destroy();
      });
      
      it('should show page-level notes when global visibility is true', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        
        // Global visibility is true by default
        expect(localThis.visibilityManager.getGlobalVisibility()).toBe(true);
        
        const noteData = {
          id: 'visible-page-note',
          selector: '__PAGE__',
          content: 'Test'
        };
        
        manager.createPageLevelNoteUI(noteData);
        
        const note = manager.notes.get('visible-page-note');
        expect(note.isVisible).toBe(true);
        // Page-level notes don't use visibility manager
        expect(localThis.visibilityManager.observe).not.toHaveBeenCalled();
        
        note.destroy();
      });
      
      it('should not show page-level notes when global visibility is false', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        
        // Set global visibility to hidden
        localThis.visibilityManager._setMockVisibility(false);
        expect(localThis.visibilityManager.getGlobalVisibility()).toBe(false);
        
        const noteData = {
          id: 'hidden-page-note',
          selector: '__PAGE__',
          content: 'Test'
        };
        
        manager.createPageLevelNoteUI(noteData);
        
        const note = manager.notes.get('hidden-page-note');
        // Note should NOT be visible since global visibility is false
        expect(note.isVisible).toBe(false);
        // Page-level notes don't use visibility manager
        expect(localThis.visibilityManager.observe).not.toHaveBeenCalled();
        
        note.destroy();
      });
      
      it('should create note minimized when isNewNote is false (default)', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        
        const noteData = {
          id: 'minimized-page-note',
          selector: '__PAGE__',
          content: 'Test'
        };
        
        manager.createPageLevelNoteUI(noteData, { isNewNote: false });
        
        const note = manager.notes.get('minimized-page-note');
        expect(note.isMinimized).toBe(true);
        
        note.destroy();
      });
      
      it('should create note maximized when isNewNote is true', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        
        const noteData = {
          id: 'maximized-page-note',
          selector: '__PAGE__',
          content: 'Test'
        };
        
        manager.createPageLevelNoteUI(noteData, { isNewNote: true });
        
        const note = manager.notes.get('maximized-page-note');
        expect(note.isMinimized).toBe(false);
        
        note.destroy();
      });
      
      it('should mark shared page-level notes as read', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        
        const noteData = {
          id: 'shared-page-note',
          selector: '__PAGE__',
          content: 'Shared',
          isShared: true
        };
        
        manager.createPageLevelNoteUI(noteData);
        
        expect(localThis.sendMessage).toHaveBeenCalledWith({
          action: 'markSharedNoteRead',
          noteId: 'shared-page-note'
        });
        
        const note = manager.notes.get('shared-page-note');
        note.destroy();
      });
    });
    
    describe('highlightNote for page-level notes', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      
      afterEach(() => {
        jest.useRealTimers();
      });
      
      it('should scroll to page-level note position and highlight after scroll', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
        
        const noteData = {
          id: 'highlight-page-note',
          selector: '__PAGE__',
          content: 'Test',
          position: { pageX: 100, pageY: 200 }
        };
        
        manager.createPageLevelNoteUI(noteData);
        const note = manager.notes.get('highlight-page-note');
        const highlightSpy = jest.spyOn(note, 'highlight');
        const showSpy = jest.spyOn(note, 'show');
        const bringToFrontSpy = jest.spyOn(note, 'bringToFront');
        
        manager.highlightNote('highlight-page-note');
        
        // Should scroll to center the note in viewport
        expect(scrollToSpy).toHaveBeenCalledWith({
          left: Math.max(0, 100 - window.innerWidth / 2),
          top: Math.max(0, 200 - window.innerHeight / 2),
          behavior: 'smooth'
        });
        
        // Methods should not be called immediately (waiting for scroll)
        expect(showSpy).not.toHaveBeenCalled();
        expect(bringToFrontSpy).not.toHaveBeenCalled();
        expect(highlightSpy).not.toHaveBeenCalled();
        
        // Fast-forward past the scroll animation delay
        jest.advanceTimersByTime(400);
        
        // Now methods should be called
        expect(showSpy).toHaveBeenCalled();
        expect(bringToFrontSpy).toHaveBeenCalled();
        expect(highlightSpy).toHaveBeenCalled();
        
        scrollToSpy.mockRestore();
        note.destroy();
      });
      
      it('should maximize page-level note when maximize is true', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
        
        const noteData = {
          id: 'maximize-page-note',
          selector: '__PAGE__',
          content: 'Test',
          position: { pageX: 100, pageY: 100 }
        };
        
        manager.createPageLevelNoteUI(noteData);
        const note = manager.notes.get('maximize-page-note');
        const maximizeSpy = jest.spyOn(note, 'maximize');
        
        manager.highlightNote('maximize-page-note', true);
        
        // maximize should not be called immediately
        expect(maximizeSpy).not.toHaveBeenCalled();
        
        // Fast-forward past the scroll animation delay
        jest.advanceTimersByTime(400);
        
        expect(maximizeSpy).toHaveBeenCalled();
        
        scrollToSpy.mockRestore();
        note.destroy();
      });
      
      it('should use default position when note has no position set', () => {
        const localThis = createMockDependencies();
        const manager = new NoteManager(localThis);
        const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
        
        const noteData = {
          id: 'no-position-page-note',
          selector: '__PAGE__',
          content: 'Test'
          // No position property
        };
        
        manager.createPageLevelNoteUI(noteData);
        
        manager.highlightNote('no-position-page-note');
        
        // Should use default position (10, 10)
        expect(scrollToSpy).toHaveBeenCalledWith({
          left: Math.max(0, 10 - window.innerWidth / 2),
          top: Math.max(0, 10 - window.innerHeight / 2),
          behavior: 'smooth'
        });
        
        scrollToSpy.mockRestore();
        manager.notes.get('no-position-page-note').destroy();
      });
    });
  });

  describe('visibility toggle', () => {
    it('should delegate getNotesVisibility to visibilityManager', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Initial state is visible (from mock)
      expect(manager.getNotesVisibility()).toBe(true);
      expect(localThis.visibilityManager.getGlobalVisibility).toHaveBeenCalled();
      
      // Set mock to hidden
      localThis.visibilityManager._setMockVisibility(false);
      expect(manager.getNotesVisibility()).toBe(false);
    });
    
    it('should toggle visibility from true to false via visibilityManager', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Initial state is visible
      expect(manager.getNotesVisibility()).toBe(true);
      
      const result = manager.toggleAllVisibility();
      
      expect(result).toBe(false);
      expect(localThis.visibilityManager.setGlobalVisibility).toHaveBeenCalledWith(false);
    });
    
    it('should toggle visibility from false to true via visibilityManager', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Set initial state to hidden
      localThis.visibilityManager._setMockVisibility(false);
      
      const result = manager.toggleAllVisibility();
      
      expect(result).toBe(true);
      expect(localThis.visibilityManager.setGlobalVisibility).toHaveBeenCalledWith(true);
    });
    
    it('should delegate note showing/hiding to visibilityManager', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Toggle from visible to hidden
      manager.toggleAllVisibility();
      
      // Verify visibilityManager.setGlobalVisibility was called
      // The actual show/hide logic is now in VisibilityManager
      expect(localThis.visibilityManager.setGlobalVisibility).toHaveBeenCalledWith(false);
    });
    
    it('should handle empty notes map gracefully', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Should not throw with empty notes
      expect(() => manager.toggleAllVisibility()).not.toThrow();
      expect(localThis.visibilityManager.setGlobalVisibility).toHaveBeenCalledWith(false);
    });
    
    it('should hide notes without anchors when toggling to hidden', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Create an orphaned note (no anchor) via showOrphanedNote
      const noteData = {
        id: 'orphan-toggle-1',
        selector: '.missing',
        content: 'Orphaned content',
        theme: 'blue',
        position: { anchor: 'top-right' }
      };
      manager.orphanedNotes.set('orphan-toggle-1', { noteData, addedAt: Date.now() });
      manager.showOrphanedNote('orphan-toggle-1');
      
      const orphanNote = manager.notes.get('orphan-toggle-1');
      expect(orphanNote).toBeDefined();
      expect(orphanNote.anchor).toBeNull();
      
      const hideSpy = jest.spyOn(orphanNote, 'hide');
      
      // Toggle from visible to hidden
      manager.toggleAllVisibility();
      
      expect(hideSpy).toHaveBeenCalled();
      
      orphanNote.destroy();
    });
    
    it('should show notes without anchors when toggling to visible', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Set initial state to hidden
      localThis.visibilityManager._setMockVisibility(false);
      
      // Create an orphaned note (no anchor) via showOrphanedNote
      // Note: showOrphanedNote will enable visibility, so we need to manually
      // set it back to false for this test
      const noteData = {
        id: 'orphan-toggle-2',
        selector: '.missing',
        content: 'Orphaned content',
        theme: 'blue',
        position: { anchor: 'top-right' }
      };
      manager.orphanedNotes.set('orphan-toggle-2', { noteData, addedAt: Date.now() });
      manager.showOrphanedNote('orphan-toggle-2');
      localThis.visibilityManager._setMockVisibility(false);
      
      const orphanNote = manager.notes.get('orphan-toggle-2');
      const showSpy = jest.spyOn(orphanNote, 'show');
      
      // Toggle from hidden to visible
      manager.toggleAllVisibility();
      
      expect(showSpy).toHaveBeenCalled();
      
      orphanNote.destroy();
    });
    
    it('should not call show/hide on notes with anchors (delegated to visibilityManager)', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Create a note with an anchor
      manager.createNoteFromData({
        id: 'anchored-toggle',
        selector: '#anchor-element',
        content: 'Anchored content',
        theme: 'yellow',
        position: { anchor: 'top-right' }
      });
      
      const anchoredNote = manager.notes.get('anchored-toggle');
      expect(anchoredNote.anchor).not.toBeNull();
      
      const showSpy = jest.spyOn(anchoredNote, 'show');
      const hideSpy = jest.spyOn(anchoredNote, 'hide');
      
      // Toggle visibility
      manager.toggleAllVisibility();
      
      // Anchored notes should NOT have show/hide called directly by toggleAllVisibility
      // That responsibility is delegated to visibilityManager.setGlobalVisibility
      expect(showSpy).not.toHaveBeenCalled();
      expect(hideSpy).not.toHaveBeenCalled();
      
      anchoredNote.destroy();
    });
    
    it('should respect per-note isHidden when showing notes without anchors', () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      // Set initial state to hidden
      localThis.visibilityManager._setMockVisibility(false);
      
      // Create an orphaned note with isHidden: true
      const noteData = {
        id: 'orphan-hidden-1',
        selector: '.missing',
        content: 'Hidden orphan',
        theme: 'blue',
        position: { anchor: 'top-right' },
        isHidden: true
      };
      manager.orphanedNotes.set('orphan-hidden-1', { noteData, addedAt: Date.now() });
      manager.showOrphanedNote('orphan-hidden-1');
      localThis.visibilityManager._setMockVisibility(false);
      
      const orphanNote = manager.notes.get('orphan-hidden-1');
      orphanNote.isHidden = true; // Ensure the note is marked as hidden
      const showSpy = jest.spyOn(orphanNote, 'show');
      
      // Toggle from hidden to visible
      manager.toggleAllVisibility();
      
      // Note should NOT be shown because isHidden is true
      expect(showSpy).not.toHaveBeenCalled();
      
      orphanNote.destroy();
    });
  });
  
  describe('toggleNoteVisibility', () => {
    it('should toggle note isHidden from false to true', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.createNoteFromData({
        id: 'toggle-vis-1',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isHidden: false
      });
      
      const note = manager.notes.get('toggle-vis-1');
      expect(note.isHidden).toBe(false);
      
      const result = await manager.toggleNoteVisibility('toggle-vis-1');
      
      expect(result.success).toBe(true);
      expect(result.isHidden).toBe(true);
      expect(note.isHidden).toBe(true);
      
      note.destroy();
    });
    
    it('should toggle note isHidden from true to false', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.createNoteFromData({
        id: 'toggle-vis-2',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isHidden: true
      });
      
      const note = manager.notes.get('toggle-vis-2');
      note.isHidden = true; // Ensure it starts hidden
      
      const result = await manager.toggleNoteVisibility('toggle-vis-2');
      
      expect(result.success).toBe(true);
      expect(result.isHidden).toBe(false);
      expect(note.isHidden).toBe(false);
      
      note.destroy();
    });
    
    it('should hide note when toggling to hidden', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.createNoteFromData({
        id: 'toggle-vis-3',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isHidden: false
      });
      
      const note = manager.notes.get('toggle-vis-3');
      const hideSpy = jest.spyOn(note, 'hide');
      
      await manager.toggleNoteVisibility('toggle-vis-3');
      
      expect(hideSpy).toHaveBeenCalled();
      
      note.destroy();
    });
    
    it('should show note when toggling to visible if global visibility is on', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.createNoteFromData({
        id: 'toggle-vis-4',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isHidden: true
      });
      
      const note = manager.notes.get('toggle-vis-4');
      note.isHidden = true;
      const showSpy = jest.spyOn(note, 'show');
      
      await manager.toggleNoteVisibility('toggle-vis-4');
      
      expect(showSpy).toHaveBeenCalled();
      
      note.destroy();
    });
    
    it('should NOT show note when toggling to visible if global visibility is off', async () => {
      const localThis = createMockDependencies();
      localThis.visibilityManager._setMockVisibility(false);
      const manager = new NoteManager(localThis);
      
      manager.createNoteFromData({
        id: 'toggle-vis-5',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isHidden: true
      });
      
      const note = manager.notes.get('toggle-vis-5');
      note.isHidden = true;
      const showSpy = jest.spyOn(note, 'show');
      
      await manager.toggleNoteVisibility('toggle-vis-5');
      
      expect(showSpy).not.toHaveBeenCalled();
      
      note.destroy();
    });
    
    it('should persist visibility change via sendMessage', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      manager.createNoteFromData({
        id: 'toggle-vis-6',
        selector: '#anchor-element',
        content: 'Test',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isHidden: false
      });
      
      await manager.toggleNoteVisibility('toggle-vis-6');
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateNote',
        note: { id: 'toggle-vis-6', isHidden: true }
      });
      
      const note = manager.notes.get('toggle-vis-6');
      note.destroy();
    });
    
    it('should return error for non-existent note', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const result = await manager.toggleNoteVisibility('non-existent');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Note not found');
    });
    
    it('should toggle visibility for orphaned notes', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      const noteData = {
        id: 'orphan-toggle-vis',
        selector: '.missing',
        content: 'Orphan',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isHidden: false
      };
      manager.orphanedNotes.set('orphan-toggle-vis', { noteData, addedAt: Date.now() });
      
      const result = await manager.toggleNoteVisibility('orphan-toggle-vis');
      
      expect(result.success).toBe(true);
      expect(result.isHidden).toBe(true);
      expect(noteData.isHidden).toBe(true);
    });
  });
  
  describe('handleVisibilityChange', () => {
    it('should send update message with isHidden property', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      await manager.handleVisibilityChange('note-123', true);
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateNote',
        note: { id: 'note-123', isHidden: true }
      });
    });
    
    it('should send update message with isHidden false', async () => {
      const localThis = createMockDependencies();
      const manager = new NoteManager(localThis);
      
      await manager.handleVisibilityChange('note-456', false);
      
      expect(localThis.sendMessage).toHaveBeenCalledWith({
        action: 'updateNote',
        note: { id: 'note-456', isHidden: false }
      });
    });
    
    it('should not throw on error', async () => {
      const localThis = createMockDependencies();
      localThis.sendMessage = jest.fn().mockRejectedValue(new Error('Network error'));
      const manager = new NoteManager(localThis);
      
      await expect(manager.handleVisibilityChange('note-789', true)).resolves.not.toThrow();
    });
  });
});
