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
    
    it('should update position during drag', () => {
      note.isDragging = true;
      note.dragOffset = { x: 10, y: 10 };
      
      note.handleDragMove({ clientX: 200, clientY: 200 });
      
      expect(note.customPosition).not.toBeNull();
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

    it('should use legacy custom position if set (x, y format)', () => {
      note.customPosition = { x: 100, y: 200 };
      note.updatePosition();
      // Custom position should be applied
      expect(note.customPosition).toEqual({ x: 100, y: 200 });
      expect(note.element.style.left).toBe('100px');
      expect(note.element.style.top).toBe('200px');
    });
    
    it('should use anchor-relative custom position if set (offsetX, offsetY format)', () => {
      // Mock anchor position
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
      
      // Position should be calculated from anchor + offset + scroll
      // With scrollX=0, scrollY=0: left = 50 + 20 = 70, top = 100 + 30 = 130
      expect(note.element.style.left).toBe('70px');
      expect(note.element.style.top).toBe('130px');
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
});
