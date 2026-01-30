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
      const paragraph = document.createElement('p');
      expect(overlay.shouldIgnoreElement(paragraph)).toBe(false);
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

  describe('handleMouseOver', () => {
    it('should highlight target element', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      
      const event = { target: div };
      overlay.handleMouseOver(event);
      
      expect(div.classList.contains('sn-element-highlight')).toBe(true);
      expect(overlay.highlightedElement).toBe(div);
    });
    
    it('should not highlight if not active', () => {
      overlay.isActive = false;
      const div = document.createElement('div');
      document.body.appendChild(div);
      
      const event = { target: div };
      overlay.handleMouseOver(event);
      
      expect(div.classList.contains('sn-element-highlight')).toBe(false);
    });
    
    it('should ignore own elements', () => {
      const host = document.createElement('div');
      host.id = 'sticky-notes-extension-root';
      document.body.appendChild(host);
      
      const event = { target: host };
      overlay.handleMouseOver(event);
      
      expect(host.classList.contains('sn-element-highlight')).toBe(false);
    });
    
    it('should ignore body element', () => {
      const event = { target: document.body };
      overlay.handleMouseOver(event);
      
      expect(document.body.classList.contains('sn-element-highlight')).toBe(false);
    });
    
    it('should remove previous highlight before adding new one', () => {
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      document.body.appendChild(div1);
      document.body.appendChild(div2);
      
      overlay.handleMouseOver({ target: div1 });
      expect(div1.classList.contains('sn-element-highlight')).toBe(true);
      
      overlay.handleMouseOver({ target: div2 });
      expect(div1.classList.contains('sn-element-highlight')).toBe(false);
      expect(div2.classList.contains('sn-element-highlight')).toBe(true);
    });
  });

  describe('handleMouseOut', () => {
    it('should hide tooltip when moving to ignored element', () => {
      overlay.tooltip.style.display = 'block';
      
      const event = { relatedTarget: document.body };
      overlay.handleMouseOut(event);
      
      expect(overlay.tooltip.style.display).toBe('none');
    });
    
    it('should not hide tooltip when moving to valid element', () => {
      overlay.tooltip.style.display = 'block';
      
      const div = document.createElement('div');
      document.body.appendChild(div);
      const event = { relatedTarget: div };
      overlay.handleMouseOut(event);
      
      expect(overlay.tooltip.style.display).toBe('block');
    });
    
    it('should not handle if not active', () => {
      overlay.isActive = false;
      overlay.tooltip.style.display = 'block';
      
      const event = { relatedTarget: document.body };
      overlay.handleMouseOut(event);
      
      expect(overlay.tooltip.style.display).toBe('block');
    });
  });

  describe('handleMouseLeave', () => {
    it('should hide tooltip and remove highlight', () => {
      const div = document.createElement('div');
      div.classList.add('sn-element-highlight');
      document.body.appendChild(div);
      overlay.highlightedElement = div;
      overlay.tooltip.style.display = 'block';
      
      overlay.handleMouseLeave();
      
      expect(overlay.tooltip.style.display).toBe('none');
      expect(div.classList.contains('sn-element-highlight')).toBe(false);
    });
    
    it('should not handle if not active', () => {
      overlay.isActive = false;
      overlay.tooltip.style.display = 'block';
      
      overlay.handleMouseLeave();
      
      expect(overlay.tooltip.style.display).toBe('block');
    });
  });

  describe('handleMouseMove', () => {
    it('should position tooltip near cursor', () => {
      overlay.tooltip.style.display = 'block';
      // Mock getBoundingClientRect
      overlay.tooltip.getBoundingClientRect = () => ({ width: 100, height: 50 });
      
      const event = { clientX: 100, clientY: 100 };
      overlay.handleMouseMove(event);
      
      expect(overlay.tooltip.style.left).toBe('115px'); // 100 + 15 offset
      expect(overlay.tooltip.style.top).toBe('115px'); // 100 + 15 offset
    });
    
    it('should flip tooltip when near right edge', () => {
      overlay.tooltip.style.display = 'block';
      overlay.tooltip.getBoundingClientRect = () => ({ width: 100, height: 50 });
      
      // Near right edge of viewport
      const event = { clientX: window.innerWidth - 50, clientY: 100 };
      overlay.handleMouseMove(event);
      
      // Should flip to left side
      const leftValue = parseInt(overlay.tooltip.style.left);
      expect(leftValue).toBeLessThan(window.innerWidth - 50);
    });
    
    it('should flip tooltip when near bottom edge', () => {
      overlay.tooltip.style.display = 'block';
      overlay.tooltip.getBoundingClientRect = () => ({ width: 100, height: 50 });
      
      // Near bottom edge of viewport
      const event = { clientX: 100, clientY: window.innerHeight - 30 };
      overlay.handleMouseMove(event);
      
      // Should flip to top side
      const topValue = parseInt(overlay.tooltip.style.top);
      expect(topValue).toBeLessThan(window.innerHeight - 30);
    });
    
    it('should not handle if not active', () => {
      overlay.isActive = false;
      overlay.tooltip.style.display = 'block';
      overlay.tooltip.style.left = '0px';
      
      overlay.handleMouseMove({ clientX: 100, clientY: 100 });
      
      expect(overlay.tooltip.style.left).toBe('0px');
    });
    
    it('should not handle if tooltip is hidden', () => {
      overlay.tooltip.style.display = 'none';
      overlay.tooltip.style.left = '0px';
      
      overlay.handleMouseMove({ clientX: 100, clientY: 100 });
      
      expect(overlay.tooltip.style.left).toBe('0px');
    });
  });

  describe('handleClick', () => {
    it('should call onSelect with target element', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      
      const event = {
        target: div,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };
      
      overlay.handleClick(event);
      
      expect(onSelect).toHaveBeenCalledWith(div);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    });
    
    it('should not handle click if not active', () => {
      overlay.isActive = false;
      const div = document.createElement('div');
      document.body.appendChild(div);
      
      const event = {
        target: div,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };
      
      overlay.handleClick(event);
      
      expect(onSelect).not.toHaveBeenCalled();
    });
    
    it('should ignore clicks on own elements', () => {
      const host = document.createElement('div');
      host.id = 'sticky-notes-extension-root';
      document.body.appendChild(host);
      
      const event = {
        target: host,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };
      
      overlay.handleClick(event);
      
      expect(onSelect).not.toHaveBeenCalled();
    });
    
    it('should ignore clicks on body', () => {
      const event = {
        target: document.body,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };
      
      overlay.handleClick(event);
      
      expect(onSelect).not.toHaveBeenCalled();
    });
    
    it('should remove highlight after selection', () => {
      const div = document.createElement('div');
      div.classList.add('sn-element-highlight');
      document.body.appendChild(div);
      overlay.highlightedElement = div;
      
      const event = {
        target: div,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };
      
      overlay.handleClick(event);
      
      expect(div.classList.contains('sn-element-highlight')).toBe(false);
    });
  });

  describe('render', () => {
    it('should create overlay with correct class', () => {
      expect(overlay.element.className).toBe('sn-selection-overlay');
    });
    
    it('should create hidden tooltip', () => {
      expect(overlay.tooltip.style.display).toBe('none');
    });
    
    it('should append tooltip to overlay', () => {
      expect(overlay.element.contains(overlay.tooltip)).toBe(true);
    });
  });

  describe('setupEventListeners and removeEventListeners', () => {
    it('should add and remove event listeners without errors', () => {
      // Create a new overlay to test listeners
      const testOverlay = new SelectionOverlay({ onSelect: jest.fn(), onCancel: jest.fn() });
      
      // Should not throw when destroying (which removes listeners)
      expect(() => testOverlay.destroy()).not.toThrow();
    });
  });

  describe('default callbacks', () => {
    it('should use empty functions when callbacks not provided', () => {
      const overlayNoCallbacks = new SelectionOverlay({});
      
      // Should not throw when calling default callbacks
      expect(() => overlayNoCallbacks.onSelect()).not.toThrow();
      expect(() => overlayNoCallbacks.onCancel()).not.toThrow();
      
      overlayNoCallbacks.destroy();
    });
  });
});
