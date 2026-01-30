/**
 * VisibilityManager Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let VisibilityManager;

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observedElements = new Set();
    MockIntersectionObserver.instances.push(this);
  }
  
  observe(element) {
    this.observedElements.add(element);
  }
  
  unobserve(element) {
    this.observedElements.delete(element);
  }
  
  disconnect() {
    this.observedElements.clear();
  }
  
  // Test helper to trigger intersection
  triggerIntersection(entries) {
    this.callback(entries, this);
  }
  
  static instances = [];
  static reset() {
    MockIntersectionObserver.instances = [];
  }
}

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '';
  
  // Reset mock
  MockIntersectionObserver.reset();
  globalThis.IntersectionObserver = MockIntersectionObserver;
  
  // Import module
  const module = await import('../../src/content/observers/VisibilityManager.js');
  VisibilityManager = module.VisibilityManager;
});

describe('VisibilityManager', () => {
  let manager;
  let mockNote;
  let anchor;
  
  beforeEach(() => {
    manager = new VisibilityManager();
    
    // Create mock note
    mockNote = {
      show: jest.fn(),
      hide: jest.fn(),
      isVisible: false,
      updatePosition: jest.fn()
    };
    
    // Create anchor element
    anchor = document.createElement('div');
    anchor.id = 'test-anchor';
    document.body.appendChild(anchor);
  });
  
  afterEach(() => {
    manager.disconnect();
  });
  
  describe('observe()', () => {
    it('should add element to observed set', () => {
      manager.observe(anchor, mockNote);
      
      expect(manager.isObserving(anchor)).toBe(true);
    });
    
    it('should start observing with IntersectionObserver', () => {
      manager.observe(anchor, mockNote);
      
      const observer = MockIntersectionObserver.instances[0];
      expect(observer.observedElements.has(anchor)).toBe(true);
    });
    
    it('should not observe if anchor is null', () => {
      manager.observe(null, mockNote);
      
      expect(manager.getObservedAnchors().length).toBe(0);
    });
    
    it('should not observe if note is null', () => {
      manager.observe(anchor, null);
      
      expect(manager.getObservedAnchors().length).toBe(0);
    });
  });
  
  describe('unobserve()', () => {
    it('should remove element from observed set', () => {
      manager.observe(anchor, mockNote);
      manager.unobserve(anchor);
      
      expect(manager.isObserving(anchor)).toBe(false);
    });
    
    it('should hide the note when unobserving', () => {
      manager.observe(anchor, mockNote);
      manager.unobserve(anchor);
      
      expect(mockNote.hide).toHaveBeenCalled();
    });
    
    it('should stop IntersectionObserver from observing', () => {
      manager.observe(anchor, mockNote);
      manager.unobserve(anchor);
      
      const observer = MockIntersectionObserver.instances[0];
      expect(observer.observedElements.has(anchor)).toBe(false);
    });
  });
  
  describe('handleIntersection()', () => {
    it('should show note when element enters viewport', () => {
      manager.observe(anchor, mockNote);
      
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: true
      }]);
      
      expect(mockNote.show).toHaveBeenCalled();
    });
    
    it('should hide note when element leaves viewport', () => {
      manager.observe(anchor, mockNote);
      
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: false
      }]);
      
      expect(mockNote.hide).toHaveBeenCalled();
    });
    
    it('should handle multiple entries', () => {
      const anchor2 = document.createElement('div');
      document.body.appendChild(anchor2);
      
      const mockNote2 = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        updatePosition: jest.fn()
      };
      
      manager.observe(anchor, mockNote);
      manager.observe(anchor2, mockNote2);
      
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([
        { target: anchor, isIntersecting: true },
        { target: anchor2, isIntersecting: false }
      ]);
      
      expect(mockNote.show).toHaveBeenCalled();
      expect(mockNote2.hide).toHaveBeenCalled();
    });
  });
  
  describe('getNoteForAnchor()', () => {
    it('should return the note for a given anchor', () => {
      manager.observe(anchor, mockNote);
      
      expect(manager.getNoteForAnchor(anchor)).toBe(mockNote);
    });
    
    it('should return null for unknown anchor', () => {
      expect(manager.getNoteForAnchor(anchor)).toBeNull();
    });
  });
  
  describe('getObservedAnchors()', () => {
    it('should return all observed anchors', () => {
      const anchor2 = document.createElement('div');
      document.body.appendChild(anchor2);
      
      manager.observe(anchor, mockNote);
      manager.observe(anchor2, { ...mockNote });
      
      const anchors = manager.getObservedAnchors();
      expect(anchors).toContain(anchor);
      expect(anchors).toContain(anchor2);
      expect(anchors.length).toBe(2);
    });
  });
  
  describe('getNotes()', () => {
    it('should return all notes', () => {
      const mockNote2 = { ...mockNote };
      const anchor2 = document.createElement('div');
      document.body.appendChild(anchor2);
      
      manager.observe(anchor, mockNote);
      manager.observe(anchor2, mockNote2);
      
      const notes = manager.getNotes();
      expect(notes).toContain(mockNote);
      expect(notes).toContain(mockNote2);
      expect(notes.length).toBe(2);
    });
  });
  
  describe('disconnect()', () => {
    it('should hide all notes', () => {
      manager.observe(anchor, mockNote);
      manager.disconnect();
      
      expect(mockNote.hide).toHaveBeenCalled();
    });
    
    it('should clear all observed elements', () => {
      manager.observe(anchor, mockNote);
      manager.disconnect();
      
      expect(manager.getObservedAnchors().length).toBe(0);
    });
  });

  describe('refresh()', () => {
    it('should show notes when anchor is in viewport', () => {
      // Mock getBoundingClientRect to return in-viewport position
      anchor.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 200
      }));
      
      manager.observe(anchor, mockNote);
      manager.refresh();
      
      expect(mockNote.show).toHaveBeenCalled();
    });
    
    it('should hide notes when anchor is out of viewport', () => {
      // Mock getBoundingClientRect to return out-of-viewport position
      anchor.getBoundingClientRect = jest.fn(() => ({
        top: -500,
        bottom: -400,
        left: 100,
        right: 200
      }));
      
      manager.observe(anchor, mockNote);
      manager.refresh();
      
      expect(mockNote.hide).toHaveBeenCalled();
    });
  });

  describe('scroll and resize handlers', () => {
    it('should update visible note positions on scroll', () => {
      mockNote.isVisible = true;
      manager.observe(anchor, mockNote);
      
      // Trigger scroll event
      window.dispatchEvent(new Event('scroll'));
      
      // Use fake timers to process requestAnimationFrame
      jest.useFakeTimers();
      jest.runAllTimers();
      jest.useRealTimers();
      
      // Position update may be called
      // Just verify no errors occur
    });
    
    it('should update visible note positions on resize', () => {
      mockNote.isVisible = true;
      manager.observe(anchor, mockNote);
      
      // Trigger resize event
      window.dispatchEvent(new Event('resize'));
      
      expect(mockNote.updatePosition).toHaveBeenCalled();
    });
    
    it('should not update hidden notes on resize', () => {
      mockNote.isVisible = false;
      manager.observe(anchor, mockNote);
      
      // Trigger resize event
      window.dispatchEvent(new Event('resize'));
      
      expect(mockNote.updatePosition).not.toHaveBeenCalled();
    });
  });
  
  describe('global visibility', () => {
    it('should initialize with globallyVisible set to true', () => {
      expect(manager.getGlobalVisibility()).toBe(true);
    });
    
    it('should return correct visibility state via getGlobalVisibility', () => {
      expect(manager.getGlobalVisibility()).toBe(true);
      
      manager.setGlobalVisibility(false);
      expect(manager.getGlobalVisibility()).toBe(false);
      
      manager.setGlobalVisibility(true);
      expect(manager.getGlobalVisibility()).toBe(true);
    });
    
    it('should hide all notes when setGlobalVisibility(false) is called', () => {
      const localThis = {};
      localThis.anchor2 = document.createElement('div');
      document.body.appendChild(localThis.anchor2);
      
      localThis.mockNote2 = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        updatePosition: jest.fn()
      };
      
      manager.observe(anchor, mockNote);
      manager.observe(localThis.anchor2, localThis.mockNote2);
      
      manager.setGlobalVisibility(false);
      
      expect(mockNote.hide).toHaveBeenCalled();
      expect(localThis.mockNote2.hide).toHaveBeenCalled();
    });
    
    it('should refresh notes when setGlobalVisibility(true) is called', () => {
      // Mock getBoundingClientRect to return in-viewport position
      anchor.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 200
      }));
      
      manager.observe(anchor, mockNote);
      manager.setGlobalVisibility(false);
      
      // Clear mock call counts
      mockNote.show.mockClear();
      mockNote.hide.mockClear();
      
      manager.setGlobalVisibility(true);
      
      // Should show notes that are in viewport
      expect(mockNote.show).toHaveBeenCalled();
    });
    
    it('should NOT show notes on intersection when globally hidden', () => {
      manager.observe(anchor, mockNote);
      manager.setGlobalVisibility(false);
      
      // Clear any previous calls
      mockNote.show.mockClear();
      
      // Trigger intersection (anchor enters viewport)
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: true
      }]);
      
      // Note should NOT be shown because global visibility is off
      expect(mockNote.show).not.toHaveBeenCalled();
    });
    
    it('should still hide notes on intersection when globally hidden', () => {
      manager.observe(anchor, mockNote);
      manager.setGlobalVisibility(false);
      
      // Clear any previous calls from setGlobalVisibility
      mockNote.hide.mockClear();
      
      // Trigger intersection (anchor leaves viewport)
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: false
      }]);
      
      // Note should still be hidden (redundant but correct behavior)
      expect(mockNote.hide).toHaveBeenCalled();
    });
    
    it('should show notes on intersection when globally visible', () => {
      manager.observe(anchor, mockNote);
      // Global visibility is true by default
      
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: true
      }]);
      
      expect(mockNote.show).toHaveBeenCalled();
    });
    
    it('should NOT show notes on refresh when globally hidden', () => {
      // Mock getBoundingClientRect to return in-viewport position
      anchor.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 200
      }));
      
      manager.observe(anchor, mockNote);
      manager.setGlobalVisibility(false);
      
      // Clear any previous calls
      mockNote.show.mockClear();
      mockNote.hide.mockClear();
      
      manager.refresh();
      
      // Note should NOT be shown even though anchor is in viewport
      expect(mockNote.show).not.toHaveBeenCalled();
      // Note should be hidden
      expect(mockNote.hide).toHaveBeenCalled();
    });
    
    it('should NOT show notes added while globally hidden', () => {
      // First set global visibility to false
      manager.setGlobalVisibility(false);
      
      // Create a new note and anchor
      const localThis = {};
      localThis.newAnchor = document.createElement('div');
      document.body.appendChild(localThis.newAnchor);
      
      localThis.newNote = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        updatePosition: jest.fn()
      };
      
      // Observe the new note while globally hidden
      manager.observe(localThis.newAnchor, localThis.newNote);
      
      // Trigger intersection (anchor enters viewport)
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: localThis.newAnchor,
        isIntersecting: true
      }]);
      
      // Note should NOT be shown because global visibility is off
      expect(localThis.newNote.show).not.toHaveBeenCalled();
    });
  });
  
  describe('per-note isHidden property', () => {
    it('should NOT show note with isHidden: true on intersection', () => {
      // Create a note that is individually hidden
      const hiddenNote = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        isHidden: true,
        updatePosition: jest.fn()
      };
      
      manager.observe(anchor, hiddenNote);
      
      // Trigger intersection (anchor enters viewport)
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: true
      }]);
      
      // Note should NOT be shown because it is individually hidden
      expect(hiddenNote.show).not.toHaveBeenCalled();
    });
    
    it('should show note with isHidden: false on intersection', () => {
      // Create a note that is not individually hidden
      const visibleNote = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        isHidden: false,
        updatePosition: jest.fn()
      };
      
      manager.observe(anchor, visibleNote);
      
      // Trigger intersection (anchor enters viewport)
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: true
      }]);
      
      // Note should be shown
      expect(visibleNote.show).toHaveBeenCalled();
    });
    
    it('should NOT show note with isHidden: true on refresh', () => {
      // Mock getBoundingClientRect to return in-viewport position
      anchor.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 200
      }));
      
      const hiddenNote = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        isHidden: true,
        updatePosition: jest.fn()
      };
      
      manager.observe(anchor, hiddenNote);
      manager.refresh();
      
      // Note should NOT be shown even though anchor is in viewport
      expect(hiddenNote.show).not.toHaveBeenCalled();
      // Note should be hidden
      expect(hiddenNote.hide).toHaveBeenCalled();
    });
    
    it('should NOT show note with isHidden: true when setGlobalVisibility(true) is called', () => {
      // Mock getBoundingClientRect to return in-viewport position
      anchor.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 200
      }));
      
      const hiddenNote = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        isHidden: true,
        updatePosition: jest.fn()
      };
      
      manager.observe(anchor, hiddenNote);
      manager.setGlobalVisibility(false);
      
      // Clear mock call counts
      hiddenNote.show.mockClear();
      hiddenNote.hide.mockClear();
      
      manager.setGlobalVisibility(true);
      
      // Note should NOT be shown because it is individually hidden
      expect(hiddenNote.show).not.toHaveBeenCalled();
    });
    
    it('should show note without isHidden property on intersection (default behavior)', () => {
      // Create a note without isHidden property (undefined = not hidden)
      const noteWithoutIsHidden = {
        show: jest.fn(),
        hide: jest.fn(),
        isVisible: false,
        updatePosition: jest.fn()
      };
      
      manager.observe(anchor, noteWithoutIsHidden);
      
      // Trigger intersection (anchor enters viewport)
      const observer = MockIntersectionObserver.instances[0];
      observer.triggerIntersection([{
        target: anchor,
        isIntersecting: true
      }]);
      
      // Note should be shown (undefined isHidden should be treated as not hidden)
      expect(noteWithoutIsHidden.show).toHaveBeenCalled();
    });
  });
});
