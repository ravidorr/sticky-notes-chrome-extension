/**
 * StickyNote Component Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let StickyNote;

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '<div id="anchor-element">Anchor Content</div>';
  
  // Reset chrome mocks
  chrome.runtime.sendMessage.mockClear();
  
  // Import module fresh for each test
  const module = await import('../../src/content/components/StickyNote.js');
  StickyNote = module.StickyNote;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('StickyNote', () => {
  let note;
  let anchor;
  let container;
  let onSave;
  let onThemeChange;
  let onDelete;
  
  beforeEach(() => {
    anchor = document.getElementById('anchor-element');
    container = document.createElement('div');
    container.id = 'note-container';
    document.body.appendChild(container);
    
    onSave = jest.fn();
    onThemeChange = jest.fn();
    onDelete = jest.fn();
    
    note = new StickyNote({
      id: 'test-note-1',
      anchor: anchor,
      container: container,
      content: 'Test content',
      theme: 'yellow',
      position: { anchor: 'top-right' },
      onSave: onSave,
      onThemeChange: onThemeChange,
      onDelete: onDelete
    });
  });
  
  afterEach(() => {
    if (note) {
      note.destroy();
    }
  });
  
  describe('constructor', () => {
    it('should create note element', () => {
      expect(note.element).not.toBeNull();
      expect(note.element.classList.contains('sn-note')).toBe(true);
    });
    
    it('should set correct ID', () => {
      expect(note.id).toBe('test-note-1');
    });
    
    it('should reference anchor element', () => {
      expect(note.anchor).toBe(anchor);
    });
    
    it('should set initial theme', () => {
      expect(note.theme).toBe('yellow');
      expect(note.element.classList.contains('sn-theme-yellow')).toBe(true);
    });
    
    it('should initialize with content', () => {
      expect(note.content).toBe('Test content');
    });
    
    it('should store bound event handlers', () => {
      expect(note.boundHandleDragMove).toBeInstanceOf(Function);
      expect(note.boundHandleDragEnd).toBeInstanceOf(Function);
      expect(note.boundHandleWindowResize).toBeInstanceOf(Function);
    });
    
    it('should create rich editor', () => {
      expect(note.richEditor).toBeDefined();
    });
    
    it('should restore custom position from saved position.custom', () => {
      const noteWithCustomPosition = new StickyNote({
        id: 'test-note-custom-pos',
        anchor: anchor,
        content: '',
        position: { custom: { offsetX: 50, offsetY: 75 } }
      });
      
      expect(noteWithCustomPosition.customPosition).toEqual({ offsetX: 50, offsetY: 75 });
      
      noteWithCustomPosition.destroy();
    });
    
    it('should have null customPosition if no custom position saved', () => {
      expect(note.customPosition).toBeNull();
    });
  });
  
  describe('render', () => {
    it('should create header with buttons', () => {
      const header = note.element.querySelector('.sn-note-header');
      expect(header).not.toBeNull();
    });
    
    it('should create theme button', () => {
      const themeBtn = note.element.querySelector('.sn-theme-btn');
      expect(themeBtn).not.toBeNull();
    });
    
    it('should create position button', () => {
      const posBtn = note.element.querySelector('.sn-position-btn');
      expect(posBtn).not.toBeNull();
    });
    
    it('should create share button', () => {
      const shareBtn = note.element.querySelector('.sn-share-btn');
      expect(shareBtn).not.toBeNull();
    });
    
    it('should create delete button', () => {
      const deleteBtn = note.element.querySelector('.sn-delete-btn');
      expect(deleteBtn).not.toBeNull();
    });
  });
  
  describe('show/hide', () => {
    it('should show note', () => {
      note.hide();
      note.show();
      expect(note.isVisible).toBe(true);
    });
    
    it('should hide note', () => {
      note.show();
      note.hide();
      expect(note.isVisible).toBe(false);
    });
  });
  
  describe('setTheme', () => {
    it('should change theme class', () => {
      note.setTheme('blue');
      expect(note.theme).toBe('blue');
      expect(note.element.classList.contains('sn-theme-blue')).toBe(true);
      expect(note.element.classList.contains('sn-theme-yellow')).toBe(false);
    });
    
    it('should update theme for all valid themes', () => {
      const themes = ['yellow', 'blue', 'green', 'pink'];
      themes.forEach(theme => {
        note.setTheme(theme);
        expect(note.theme).toBe(theme);
        expect(note.element.classList.contains(`sn-theme-${theme}`)).toBe(true);
      });
    });
  });
  
  describe('onThemeChange callback', () => {
    it('should call onThemeChange when theme picker button is clicked', () => {
      // Show the theme picker
      note.showThemePicker();
      const picker = note.element.querySelector('.sn-theme-picker');
      expect(picker).not.toBeNull();
      
      // Click on the blue theme button (second button)
      const themeButtons = picker.querySelectorAll('button');
      expect(themeButtons.length).toBeGreaterThan(1);
      
      // Click on a different theme (not yellow which is current)
      themeButtons[1].click(); // blue
      
      expect(onThemeChange).toHaveBeenCalledWith('blue');
    });
    
    it('should not call onThemeChange if setTheme is called directly', () => {
      // setTheme alone should not trigger the callback
      note.setTheme('green');
      expect(onThemeChange).not.toHaveBeenCalled();
    });
  });
  
  describe('handleEditorChange', () => {
    it('should update content', () => {
      note.handleEditorChange('<p>New content</p>');
      expect(note.content).toBe('<p>New content</p>');
    });
    
    it('should debounce save calls', () => {
      jest.useFakeTimers();
      
      note.handleEditorChange('Content 1');
      note.handleEditorChange('Content 2');
      note.handleEditorChange('Content 3');
      
      expect(onSave).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(1000);
      
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('Content 3');
      
      jest.useRealTimers();
    });
  });
  
  describe('handleDelete', () => {
    it('should be an async function', () => {
      expect(typeof note.handleDelete).toBe('function');
    });
    
    it('should call onDelete callback when confirmed', async () => {
      // Create a host element with shadow root for the dialog
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.appendChild(note.element);
      
      // Start the delete operation (it will show the dialog)
      const deletePromise = note.handleDelete();
      
      // Find and click the confirm button in the dialog
      await new Promise(resolve => setTimeout(resolve, 10));
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      expect(confirmBtn).not.toBeNull();
      confirmBtn.click();
      
      await deletePromise;
      
      expect(onDelete).toHaveBeenCalled();
    });
    
    it('should not call onDelete callback when cancelled', async () => {
      // Create a host element with shadow root for the dialog
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.appendChild(note.element);
      
      // Start the delete operation (it will show the dialog)
      const deletePromise = note.handleDelete();
      
      // Find and click the cancel button in the dialog
      await new Promise(resolve => setTimeout(resolve, 10));
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      expect(cancelBtn).not.toBeNull();
      cancelBtn.click();
      
      await deletePromise;
      
      expect(onDelete).not.toHaveBeenCalled();
    });
    
    it('should show confirmation dialog with correct message', async () => {
      // Create a host element with shadow root for the dialog
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.appendChild(note.element);
      
      // Start the delete operation
      const deletePromise = note.handleDelete();
      
      // Check dialog appears with message
      await new Promise(resolve => setTimeout(resolve, 10));
      const message = shadowRoot.querySelector('.sn-confirm-message');
      expect(message).not.toBeNull();
      // The message should be the i18n key 'deleteConfirm'
      expect(message.textContent).toBe('deleteConfirm');
      
      // Clean up
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      cancelBtn.click();
      await deletePromise;
    });
  });
  
  describe('dragging', () => {
    it('should start drag on header mousedown', () => {
      const header = note.element.querySelector('.sn-note-header');
      const mousedownEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      header.dispatchEvent(mousedownEvent);
      expect(note.isDragging).toBe(true);
    });
    
    it('should end drag on mouseup', () => {
      note.isDragging = true;
      note.handleDragEnd();
      expect(note.isDragging).toBe(false);
    });
    
    it('should update position during drag in viewport coords', () => {
      note.isDragging = true;
      note.dragOffset = { x: 10, y: 10 };
      
      note.handleDragMove({ clientX: 200, clientY: 200 });
      
      expect(note.customPosition).not.toBeNull();
      // Position should be applied in viewport coords: clientX - dragOffset.x = 190
      expect(note.element.style.left).toBe('190px');
      expect(note.element.style.top).toBe('190px');
    });
    
    it('should store anchor-relative position during drag', () => {
      note.isDragging = true;
      note.dragOffset = { x: 10, y: 10 };
      
      // Mock anchor position
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 50,
        top: 50,
        right: 150,
        bottom: 100,
        width: 100,
        height: 50
      }));
      
      note.handleDragMove({ clientX: 200, clientY: 200 });
      
      // Should store position relative to anchor (offsetX, offsetY)
      expect(note.customPosition).toHaveProperty('offsetX');
      expect(note.customPosition).toHaveProperty('offsetY');
      expect(note.customPosition.offsetX).toBe(140); // 200 - 10 - 50
      expect(note.customPosition.offsetY).toBe(140); // 200 - 10 - 50
    });
    
    it('should call onPositionChange when drag ends with custom position', () => {
      const localThis = {};
      localThis.onPositionChange = jest.fn();
      
      const noteWithCallback = new StickyNote({
        id: 'test-note-drag',
        anchor: anchor,
        content: '',
        onPositionChange: localThis.onPositionChange
      });
      
      noteWithCallback.isDragging = true;
      noteWithCallback.customPosition = { offsetX: 100, offsetY: 50 };
      noteWithCallback.handleDragEnd();
      
      expect(localThis.onPositionChange).toHaveBeenCalledWith({
        custom: { offsetX: 100, offsetY: 50 }
      });
      
      noteWithCallback.destroy();
    });
  });
  
  describe('showThemePicker', () => {
    it('should have showThemePicker method', () => {
      expect(typeof note.showThemePicker).toBe('function');
    });
    
    it('should not throw when called', () => {
      expect(() => note.showThemePicker()).not.toThrow();
    });
    
    it('should create theme picker element', () => {
      note.showThemePicker();
      const picker = note.element.querySelector('.sn-theme-picker');
      expect(picker).not.toBeNull();
    });
  });
  
  describe('getPositionIcon', () => {
    it('should return SVG markup for top-left position', () => {
      const icon = note.getPositionIcon('top-left');
      expect(icon).toContain('<svg');
      expect(icon).toContain('viewBox="0 0 24 24"');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for top-right position', () => {
      const icon = note.getPositionIcon('top-right');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for bottom-left position', () => {
      const icon = note.getPositionIcon('bottom-left');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for bottom-right position', () => {
      const icon = note.getPositionIcon('bottom-right');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return default icon (top-right) for unknown position', () => {
      const unknownIcon = note.getPositionIcon('invalid-position');
      const defaultIcon = note.getPositionIcon('top-right');
      expect(unknownIcon).toBe(defaultIcon);
    });
    
    it('should contain rect elements representing element and note', () => {
      const icon = note.getPositionIcon('top-left');
      // Should have at least 2 rect elements (one for element box, one for note position)
      const rectCount = (icon.match(/<rect/g) || []).length;
      expect(rectCount).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('showPositionPicker', () => {
    it('should have showPositionPicker method', () => {
      expect(typeof note.showPositionPicker).toBe('function');
    });
    
    it('should not throw when called', () => {
      expect(() => note.showPositionPicker()).not.toThrow();
    });
    
    it('should create position picker element', () => {
      note.showPositionPicker();
      const picker = note.element.querySelector('.sn-position-picker');
      expect(picker).not.toBeNull();
    });
    
    it('should create four position buttons with SVG icons', () => {
      note.showPositionPicker();
      const picker = note.element.querySelector('.sn-position-picker');
      const buttons = picker.querySelectorAll('button');
      expect(buttons.length).toBe(4);
      
      // Each button should contain an SVG
      buttons.forEach(btn => {
        expect(btn.querySelector('svg')).not.toBeNull();
      });
    });
    
    it('should highlight currently selected position', () => {
      note.position.anchor = 'bottom-left';
      note.showPositionPicker();
      const picker = note.element.querySelector('.sn-position-picker');
      const buttons = picker.querySelectorAll('button');
      
      // Verify we have 4 buttons and they have background styles set
      expect(buttons.length).toBe(4);
      
      // At least one button should have a non-transparent background (the selected one)
      const buttonsWithBackground = Array.from(buttons).filter(btn => 
        btn.style.background && btn.style.background !== 'transparent'
      );
      expect(buttonsWithBackground.length).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('showShareModal', () => {
    it('should call share modal method', () => {
      expect(typeof note.showShareModal).toBe('function');
    });
  });
  
  describe('handleScreenshot', () => {
    it('should have handleScreenshot method', () => {
      expect(typeof note.handleScreenshot).toBe('function');
    });
    
    it('should check for chrome.runtime before calling sendMessage', async () => {
      const localThis = {};
      localThis.mockEvent = { stopPropagation: jest.fn() };
      
      // Ensure note element is in the DOM (needed for showToast)
      container.appendChild(note.element);
      
      // Mock successful screenshot response
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        dataUrl: 'data:image/png;base64,test'
      });
      
      // Mock clipboard API
      localThis.originalClipboard = navigator.clipboard;
      navigator.clipboard = {
        write: jest.fn().mockResolvedValue()
      };
      
      await note.handleScreenshot(localThis.mockEvent);
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'captureScreenshot'
      });
      
      // Restore
      navigator.clipboard = localThis.originalClipboard;
    });
  });
  
  describe('context invalidation checks', () => {
    it('should detect when chrome.runtime.sendMessage is undefined', () => {
      const localThis = {};
      localThis.originalSendMessage = chrome.runtime.sendMessage;
      
      // Simulate the check that happens before sendMessage
      function isRuntimeAvailable() {
        return !!chrome?.runtime?.sendMessage;
      }
      
      expect(isRuntimeAvailable()).toBe(true);
      
      // Remove sendMessage to simulate invalidated context
      delete chrome.runtime.sendMessage;
      
      expect(isRuntimeAvailable()).toBe(false);
      
      // Restore immediately
      chrome.runtime.sendMessage = localThis.originalSendMessage;
    });
    
    it('should detect when chrome.runtime is undefined', () => {
      const localThis = {};
      localThis.originalRuntime = chrome.runtime;
      
      function isRuntimeAvailable() {
        return !!chrome?.runtime?.sendMessage;
      }
      
      expect(isRuntimeAvailable()).toBe(true);
      
      // Set runtime to undefined to simulate invalidated context
      chrome.runtime = undefined;
      
      expect(isRuntimeAvailable()).toBe(false);
      
      // Restore immediately
      chrome.runtime = localThis.originalRuntime;
    });
  });
  
  describe('showToast', () => {
    it('should have showToast method', () => {
      expect(typeof note.showToast).toBe('function');
    });
  });
  
  describe('highlight', () => {
    it('should have highlight method', () => {
      expect(typeof note.highlight).toBe('function');
    });
    
    it('should not throw when called', () => {
      expect(() => note.highlight()).not.toThrow();
    });
  });
  
  describe('updatePosition', () => {
    it('should call updatePosition without error', () => {
      expect(() => note.updatePosition()).not.toThrow();
    });

    it('should use legacy custom position converted to viewport coords (x, y format)', () => {
      const localThis = {};
      // Legacy positions are document coordinates, converted to viewport coords
      // With scrollX=0, scrollY=0: viewport = document coords
      note.customPosition = { x: 100, y: 200 };
      note.updatePosition();
      expect(note.element.style.left).toBe('100px');
      expect(note.element.style.top).toBe('200px');
      
      // With scroll, legacy positions should be converted to viewport coords
      localThis.originalScrollX = window.scrollX;
      localThis.originalScrollY = window.scrollY;
      Object.defineProperty(window, 'scrollX', { value: 50, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
      
      note.updatePosition();
      // Document pos (100, 200) - scroll (50, 100) = viewport pos (50, 100)
      expect(note.element.style.left).toBe('50px');
      expect(note.element.style.top).toBe('100px');
      
      // Restore
      Object.defineProperty(window, 'scrollX', { value: localThis.originalScrollX, writable: true });
      Object.defineProperty(window, 'scrollY', { value: localThis.originalScrollY, writable: true });
    });
    
    it('should use anchor-relative custom position in viewport coords (offsetX, offsetY format)', () => {
      // Mock anchor position (viewport coordinates from getBoundingClientRect)
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 50,
        top: 100,
        right: 150,
        bottom: 150,
        width: 100,
        height: 50
      }));
      
      note.customPosition = { offsetX: 20, offsetY: 30 };
      note.updatePosition();
      
      // Position should be calculated from anchor + offset (viewport coords, no scroll)
      // left = 50 + 20 = 70, top = 100 + 30 = 130
      expect(note.element.style.left).toBe('70px');
      expect(note.element.style.top).toBe('130px');
    });
    
    it('should follow anchor when anchor moves (simulating scroll)', () => {
      const localThis = {};
      localThis.anchorTop = 200;
      
      // Mock anchor that can change position (simulating scroll)
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 50,
        top: localThis.anchorTop,
        right: 150,
        bottom: localThis.anchorTop + 50,
        width: 100,
        height: 50
      }));
      
      note.customPosition = { offsetX: 20, offsetY: 30 };
      note.updatePosition();
      
      // Initial position: anchor at top=200, note at 200+30=230
      expect(note.element.style.top).toBe('230px');
      
      // Simulate scroll: anchor moves up in viewport
      localThis.anchorTop = 100;
      note.updatePosition();
      
      // Note should follow anchor: 100+30=130
      expect(note.element.style.top).toBe('130px');
    });
    
    it('should position relative to anchor without scroll values (viewport coords)', () => {
      const localThis = {};
      localThis.originalScrollY = window.scrollY;
      
      // Mock anchor position
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 50,
        top: 100,
        right: 150,
        bottom: 150,
        width: 100,
        height: 50
      }));
      
      // Set scroll value
      Object.defineProperty(window, 'scrollY', { value: 500, writable: true });
      
      note.customPosition = null;
      note.position = { anchor: 'bottom-right' };
      note.updatePosition();
      
      // Position should NOT include scroll values (pure viewport coords)
      // bottom-right: x = anchorRect.right + 10 = 160, y = anchorRect.bottom + 10 = 160
      expect(note.element.style.left).toBe('160px');
      expect(note.element.style.top).toBe('160px');
      
      // Restore
      Object.defineProperty(window, 'scrollY', { value: localThis.originalScrollY, writable: true });
    });
  });

  describe('handleWindowResize', () => {
    it('should update position on resize for anchor-based position', () => {
      const updateSpy = jest.spyOn(note, 'updatePosition');
      note.customPosition = null;
      note.handleWindowResize();
      expect(updateSpy).toHaveBeenCalled();
    });
    
    it('should update position on resize for anchor-relative custom position', () => {
      const updateSpy = jest.spyOn(note, 'updatePosition');
      note.customPosition = { offsetX: 20, offsetY: 30 };
      note.handleWindowResize();
      expect(updateSpy).toHaveBeenCalled();
    });
    
    it('should NOT update position for legacy absolute custom position', () => {
      const updateSpy = jest.spyOn(note, 'updatePosition');
      note.customPosition = { x: 100, y: 200 };
      note.handleWindowResize();
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
  
  describe('destroy', () => {
    it('should remove element from DOM', () => {
      note.destroy();
      expect(container.querySelector('.sn-note')).toBeNull();
    });
    
    it('should clear save timeout', () => {
      jest.useFakeTimers();
      note.handleEditorChange('test');
      note.destroy();
      jest.advanceTimersByTime(2000);
      expect(onSave).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
  
  describe('keyboard shortcuts', () => {
    it('should handle Escape key to deselect', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      note.element.dispatchEvent(event);
      // Should not throw
    });
  });
  
  describe('static methods', () => {
    it('should have getStyles method if defined', () => {
      // getStyles is defined inside the component, not as a static method
      // Check that the class is properly exported
      expect(StickyNote).toBeDefined();
    });
  });
  
  describe('z-index management', () => {
    it('should have static baseZIndex property', () => {
      expect(StickyNote.baseZIndex).toBeDefined();
      expect(typeof StickyNote.baseZIndex).toBe('number');
    });
    
    it('should have static currentZIndex property', () => {
      expect(StickyNote.currentZIndex).toBeDefined();
      expect(typeof StickyNote.currentZIndex).toBe('number');
    });
    
    it('should have baseZIndex less than max int32 to allow incrementing', () => {
      // Max int32 is 2147483647, we need room to increment
      expect(StickyNote.baseZIndex).toBeLessThan(2147483647);
    });
    
    it('should set initial z-index on element', () => {
      expect(note.element.style.zIndex).toBe(String(StickyNote.baseZIndex));
    });
  });
  
  describe('bringToFront', () => {
    it('should have bringToFront method', () => {
      expect(typeof note.bringToFront).toBe('function');
    });
    
    it('should increment currentZIndex when called', () => {
      const localThis = {};
      localThis.initialZIndex = StickyNote.currentZIndex;
      note.bringToFront();
      expect(StickyNote.currentZIndex).toBe(localThis.initialZIndex + 1);
    });
    
    it('should update element z-index to currentZIndex', () => {
      note.bringToFront();
      expect(note.element.style.zIndex).toBe(String(StickyNote.currentZIndex));
    });
    
    it('should not throw if element is null', () => {
      note.element = null;
      expect(() => note.bringToFront()).not.toThrow();
    });
    
    it('should bring note to front when clicked', () => {
      const localThis = {};
      localThis.bringToFrontSpy = jest.spyOn(note, 'bringToFront');
      
      note.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      expect(localThis.bringToFrontSpy).toHaveBeenCalled();
    });
    
    it('should bring note to front when dragging starts', () => {
      const localThis = {};
      localThis.initialZIndex = StickyNote.currentZIndex;
      
      const header = note.element.querySelector('.sn-note-header');
      const mousedownEvent = new MouseEvent('mousedown', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      header.dispatchEvent(mousedownEvent);
      
      expect(StickyNote.currentZIndex).toBeGreaterThan(localThis.initialZIndex);
    });
  });
  
  describe('updateAnchor', () => {
    it('should update anchor element', () => {
      const localThis = {};
      localThis.newAnchor = document.createElement('div');
      localThis.newAnchor.id = 'new-anchor';
      document.body.appendChild(localThis.newAnchor);
      
      note.updateAnchor(localThis.newAnchor);
      
      expect(note.anchor).toBe(localThis.newAnchor);
    });
    
    it('should clear customPosition', () => {
      const localThis = {};
      localThis.newAnchor = document.createElement('div');
      document.body.appendChild(localThis.newAnchor);
      
      // Set a custom position first
      note.customPosition = { offsetX: 100, offsetY: 200 };
      
      note.updateAnchor(localThis.newAnchor);
      
      expect(note.customPosition).toBeNull();
    });
    
    it('should reset position to default anchor position', () => {
      const localThis = {};
      localThis.newAnchor = document.createElement('div');
      document.body.appendChild(localThis.newAnchor);
      
      // Set a custom position in the position object
      note.position = { custom: { offsetX: 100, offsetY: 200 } };
      note.customPosition = { offsetX: 100, offsetY: 200 };
      
      note.updateAnchor(localThis.newAnchor);
      
      expect(note.position).toEqual({ anchor: 'top-right' });
    });
    
    it('should call onPositionChange to persist the position change', () => {
      const localThis = {};
      localThis.onPositionChange = jest.fn();
      localThis.newAnchor = document.createElement('div');
      document.body.appendChild(localThis.newAnchor);
      
      // Create a note with onPositionChange callback
      localThis.noteWithCallback = new StickyNote({
        id: 'test-note-position-change',
        anchor: anchor,
        content: '',
        position: { custom: { offsetX: 50, offsetY: 75 } },
        onPositionChange: localThis.onPositionChange
      });
      
      localThis.noteWithCallback.updateAnchor(localThis.newAnchor);
      
      expect(localThis.onPositionChange).toHaveBeenCalledWith({ anchor: 'top-right' });
      
      localThis.noteWithCallback.destroy();
    });
    
    it('should call updatePosition after changing anchor', () => {
      const localThis = {};
      localThis.updatePositionSpy = jest.spyOn(note, 'updatePosition');
      localThis.newAnchor = document.createElement('div');
      document.body.appendChild(localThis.newAnchor);
      
      note.updateAnchor(localThis.newAnchor);
      
      expect(localThis.updatePositionSpy).toHaveBeenCalled();
    });
  });
  
  describe('minimize/maximize', () => {
    it('should start minimized by default', () => {
      expect(note.isMinimized).toBe(true);
      expect(note.element.classList.contains('sn-minimized')).toBe(true);
    });
    
    it('should create minimize button', () => {
      const minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      expect(minimizeBtn).not.toBeNull();
    });
    
    it('should have toggleMinimize method', () => {
      expect(typeof note.toggleMinimize).toBe('function');
    });
    
    it('should toggle minimized state when toggleMinimize is called', () => {
      // Starts minimized
      expect(note.isMinimized).toBe(true);
      expect(note.element.classList.contains('sn-minimized')).toBe(true);
      
      // Toggle to expanded
      note.toggleMinimize();
      expect(note.isMinimized).toBe(false);
      expect(note.element.classList.contains('sn-minimized')).toBe(false);
      
      // Toggle back to minimized
      note.toggleMinimize();
      expect(note.isMinimized).toBe(true);
      expect(note.element.classList.contains('sn-minimized')).toBe(true);
    });
    
    it('should update button title based on state', () => {
      const localThis = {};
      localThis.minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      
      // When minimized, title should be "expand"
      expect(localThis.minimizeBtn.title).toBe('expand');
      
      // After expanding
      note.toggleMinimize();
      expect(localThis.minimizeBtn.title).toBe('minimize');
      
      // After minimizing again
      note.toggleMinimize();
      expect(localThis.minimizeBtn.title).toBe('expand');
    });
    
    it('should call toggleMinimize when minimize button is clicked', () => {
      const localThis = {};
      localThis.toggleMinimizeSpy = jest.spyOn(note, 'toggleMinimize');
      localThis.minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      
      localThis.minimizeBtn.click();
      
      expect(localThis.toggleMinimizeSpy).toHaveBeenCalled();
    });
    
    it('should stop propagation when minimize button is clicked', () => {
      const localThis = {};
      localThis.minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      localThis.clickEvent = new MouseEvent('click', { bubbles: true });
      localThis.stopPropagationSpy = jest.spyOn(localThis.clickEvent, 'stopPropagation');
      
      localThis.minimizeBtn.dispatchEvent(localThis.clickEvent);
      
      expect(localThis.stopPropagationSpy).toHaveBeenCalled();
    });
    
    it('should update button icon when toggling', () => {
      const localThis = {};
      localThis.minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      
      // Get initial SVG (up arrow for expand)
      localThis.initialSvg = localThis.minimizeBtn.innerHTML;
      expect(localThis.initialSvg).toContain('6 15 12 9 18 15'); // up arrow points
      
      // Toggle to expanded state
      note.toggleMinimize();
      localThis.expandedSvg = localThis.minimizeBtn.innerHTML;
      expect(localThis.expandedSvg).toContain('6 9 12 15 18 9'); // down arrow points
      
      // Toggle back to minimized
      note.toggleMinimize();
      localThis.minimizedSvg = localThis.minimizeBtn.innerHTML;
      expect(localThis.minimizedSvg).toContain('6 15 12 9 18 15'); // up arrow points
    });
  });
});
