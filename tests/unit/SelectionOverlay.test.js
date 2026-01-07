/**
 * SelectionOverlay Component Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let SelectionOverlay;

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '';
  
  // Mock import.meta.env
  globalThis.import = { meta: { env: {} } };
  
  // Import module fresh for each test
  const module = await import('../../src/content/components/SelectionOverlay.js');
  SelectionOverlay = module.SelectionOverlay;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SelectionOverlay', () => {
  let overlay;
  let onSelect;
  let onCancel;
  
  beforeEach(() => {
    onSelect = jest.fn();
    onCancel = jest.fn();
    
    overlay = new SelectionOverlay({
      onSelect,
      onCancel
    });
    document.body.appendChild(overlay.element);
  });
  
  afterEach(() => {
    if (overlay) {
      overlay.destroy();
    }
  });
  
  describe('constructor', () => {
    it('should create overlay element', () => {
      expect(overlay.element).not.toBeNull();
      expect(overlay.element.className).toBe('sn-selection-overlay');
    });
    
    it('should create tooltip element', () => {
      expect(overlay.tooltip).not.toBeNull();
      expect(overlay.tooltip.className).toBe('sn-selection-tooltip');
    });
    
    it('should be active initially', () => {
      expect(overlay.isActive).toBe(true);
    });
    
    it('should store bound event handlers', () => {
      expect(overlay.boundHandleMouseOver).toBeInstanceOf(Function);
      expect(overlay.boundHandleMouseOut).toBeInstanceOf(Function);
      expect(overlay.boundHandleClick).toBeInstanceOf(Function);
      expect(overlay.boundHandleKeyDown).toBeInstanceOf(Function);
      expect(overlay.boundHandleMouseMove).toBeInstanceOf(Function);
    });
  });
  
  describe('isOwnElement', () => {
    it('should return true for extension root element', () => {
      const host = document.createElement('div');
      host.id = 'sticky-notes-extension-root';
      document.body.appendChild(host);
      
      expect(overlay.isOwnElement(host)).toBe(true);
    });
    
    it('should return true for null element', () => {
      expect(overlay.isOwnElement(null)).toBe(true);
    });
    
    it('should return false for regular elements', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      
      expect(overlay.isOwnElement(div)).toBe(false);
    });
  });
  
  describe('shouldIgnoreElement', () => {
    it('should ignore HTML tag', () => {
      expect(overlay.shouldIgnoreElement(document.documentElement)).toBe(true);
    });
    
    it('should ignore BODY tag', () => {
      expect(overlay.shouldIgnoreElement(document.body)).toBe(true);
    });
    
    it('should ignore SCRIPT tag', () => {
      const script = document.createElement('script');
      expect(overlay.shouldIgnoreElement(script)).toBe(true);
    });
    
    it('should ignore STYLE tag', () => {
      const style = document.createElement('style');
      expect(overlay.shouldIgnoreElement(style)).toBe(true);
    });
    
    it('should ignore null', () => {
      expect(overlay.shouldIgnoreElement(null)).toBe(true);
    });
    
    it('should not ignore DIV elements', () => {
      const div = document.createElement('div');
      expect(overlay.shouldIgnoreElement(div)).toBe(false);
    });
    
    it('should not ignore P elements', () => {
      const p = document.createElement('p');
      expect(overlay.shouldIgnoreElement(p)).toBe(false);
    });
  });
  
  describe('handleKeyDown', () => {
    it('should call onCancel when Escape is pressed', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      event.preventDefault = jest.fn();
      
      overlay.handleKeyDown(event);
      
      expect(onCancel).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });
    
    it('should not call onCancel for other keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      
      overlay.handleKeyDown(event);
      
      expect(onCancel).not.toHaveBeenCalled();
    });
    
    it('should not handle events when inactive', () => {
      overlay.isActive = false;
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      event.preventDefault = jest.fn();
      
      overlay.handleKeyDown(event);
      
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
  
  describe('removeHighlight', () => {
    it('should remove highlight class from element', () => {
      const div = document.createElement('div');
      div.classList.add('sn-element-highlight');
      document.body.appendChild(div);
      
      overlay.highlightedElement = div;
      overlay.removeHighlight();
      
      expect(div.classList.contains('sn-element-highlight')).toBe(false);
      expect(overlay.highlightedElement).toBeNull();
    });
    
    it('should handle null highlighted element', () => {
      overlay.highlightedElement = null;
      
      // Should not throw
      expect(() => overlay.removeHighlight()).not.toThrow();
    });
  });
  
  describe('destroy', () => {
    it('should set isActive to false', () => {
      overlay.destroy();
      expect(overlay.isActive).toBe(false);
    });
    
    it('should remove highlighted element class', () => {
      const div = document.createElement('div');
      div.classList.add('sn-element-highlight');
      document.body.appendChild(div);
      overlay.highlightedElement = div;
      
      overlay.destroy();
      
      expect(div.classList.contains('sn-element-highlight')).toBe(false);
    });
    
    it('should remove overlay element from DOM', () => {
      overlay.destroy();
      
      expect(overlay.element.parentNode).toBeNull();
    });
    
    it('should remove all highlight classes from document', () => {
      const div1 = document.createElement('div');
      div1.classList.add('sn-element-highlight');
      const div2 = document.createElement('div');
      div2.classList.add('sn-element-highlight');
      document.body.appendChild(div1);
      document.body.appendChild(div2);
      
      overlay.destroy();
      
      expect(document.querySelectorAll('.sn-element-highlight').length).toBe(0);
    });
  });
  
  describe('updateTooltip', () => {
    it('should set tooltip text content', () => {
      const div = document.createElement('div');
      overlay.updateTooltip(div);
      
      expect(overlay.tooltip.textContent).toContain('Click to add note');
    });
    
    it('should show tooltip', () => {
      const div = document.createElement('div');
      overlay.updateTooltip(div);
      
      expect(overlay.tooltip.style.display).toBe('block');
    });
  });
});
