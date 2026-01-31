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
    
    // Append note element to container for showToast to work
    container.appendChild(note.element);
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
      expect(note.boundHandleNoteMouseEnter).toBeInstanceOf(Function);
      expect(note.boundHandleNoteMouseLeave).toBeInstanceOf(Function);
    });
    
    it('should create rich editor', () => {
      expect(note.richEditor).toBeDefined();
    });
    
    it('should pass maxLength to rich editor', () => {
      expect(note.richEditor.maxLength).toBe(50000);
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

    it('should create metadata panel', () => {
      const metadataPanel = note.element.querySelector('.sn-metadata-panel');
      expect(metadataPanel).not.toBeNull();
    });

    it('should display note ID in metadata', () => {
      const noteIdElement = note.element.querySelector('.sn-metadata-note-id');
      expect(noteIdElement).not.toBeNull();
      expect(noteIdElement.textContent).toBe('test-note-1');
    });

    it('should display owner email when provided', () => {
      const localThis = {};
      localThis.noteWithOwner = new StickyNote({
        id: 'test-note-owner',
        anchor: anchor,
        container: container,
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        ownerEmail: 'test@example.com',
        ownerId: 'uid123',
        onSave: onSave,
        onThemeChange: onThemeChange,
        onDelete: onDelete
      });

      localThis.ownerElement = localThis.noteWithOwner.element.querySelector('.sn-metadata-owner');
      expect(localThis.ownerElement).not.toBeNull();
      expect(localThis.ownerElement.textContent).toBe('test@example.com');

      localThis.noteWithOwner.destroy();
    });

    it('should display owner UID when provided', () => {
      const localThis = {};
      localThis.noteWithOwner = new StickyNote({
        id: 'test-note-uid',
        anchor: anchor,
        container: container,
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        ownerEmail: 'test@example.com',
        ownerId: 'uid123abc',
        onSave: onSave,
        onThemeChange: onThemeChange,
        onDelete: onDelete
      });

      localThis.ownerIdElement = localThis.noteWithOwner.element.querySelector('.sn-metadata-owner-id');
      expect(localThis.ownerIdElement).not.toBeNull();
      expect(localThis.ownerIdElement.textContent).toBe('uid123abc');

      localThis.noteWithOwner.destroy();
    });

    it('should show fallback text when owner info not provided', () => {
      // The default note doesn't have ownerEmail or ownerId
      const localThis = {};
      localThis.ownerElement = note.element.querySelector('.sn-metadata-owner');
      localThis.ownerIdElement = note.element.querySelector('.sn-metadata-owner-id');
      localThis.noteIdElement = note.element.querySelector('.sn-metadata-note-id');

      // Owner should show 'anonymous' (i18n key)
      expect(localThis.ownerElement.textContent).toBe('anonymous');
      // Owner ID should show 'notAvailable' (i18n key)
      expect(localThis.ownerIdElement.textContent).toBe('notAvailable');
      // Note ID should still show the actual ID
      expect(localThis.noteIdElement.textContent).toBe('test-note-1');
    });

    it('should create copy buttons for each metadata row', () => {
      const localThis = {};
      localThis.copyButtons = note.element.querySelectorAll('.sn-metadata-copy-btn');
      // 7 metadata rows: URL, Browser, Viewport, Element, Owner, Owner UID, Note ID
      expect(localThis.copyButtons.length).toBe(7);
    });

    it('should have data-copy-value attribute on copy buttons', () => {
      const localThis = {};
      localThis.copyButtons = note.element.querySelectorAll('.sn-metadata-copy-btn');
      localThis.copyButtons.forEach(btn => {
        expect(btn.hasAttribute('data-copy-value')).toBe(true);
      });
    });

    it('should have tooltip on copy buttons', () => {
      const localThis = {};
      localThis.copyButtons = note.element.querySelectorAll('.sn-metadata-copy-btn');
      localThis.copyButtons.forEach(btn => {
        expect(btn.getAttribute('title')).toBe('copyMetadata');
      });
    });

    it('should have SVG icon in copy buttons', () => {
      const localThis = {};
      localThis.copyButtons = note.element.querySelectorAll('.sn-metadata-copy-btn');
      localThis.copyButtons.forEach(btn => {
        expect(btn.querySelector('svg')).not.toBeNull();
      });
    });
  });

  describe('handleMetadataCopy', () => {
    it('should copy metadata value to clipboard', async () => {
      const localThis = {};
      localThis.copyButton = note.element.querySelector('.sn-metadata-copy-btn[data-copy-value="test-note-1"]');
      expect(localThis.copyButton).not.toBeNull();

      await localThis.copyButton.click();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-note-1');
    });

    it('should show success toast after copying', async () => {
      const localThis = {};
      localThis.showToastSpy = jest.spyOn(note, 'showToast');
      localThis.copyButton = note.element.querySelector('.sn-metadata-copy-btn[data-copy-value="test-note-1"]');

      localThis.copyButton.click();
      // Click handlers are async but DOM click isn't awaitable - flush microtasks
      await new Promise((resolve) => process.nextTick(resolve));

      expect(localThis.showToastSpy).toHaveBeenCalledWith('copiedToClipboard');
      localThis.showToastSpy.mockRestore();
    });

    it('should show error toast when clipboard write fails', async () => {
      const localThis = {};
      localThis.showToastSpy = jest.spyOn(note, 'showToast');
      navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));
      // Ensure fallback doesn't run in this test (execCommand may not exist in jsdom)
      localThis.originalExecCommand = document.execCommand;
      document.execCommand = undefined;

      localThis.copyButton = note.element.querySelector('.sn-metadata-copy-btn[data-copy-value="test-note-1"]');
      localThis.copyButton.click();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(localThis.showToastSpy).toHaveBeenCalledWith('failedToCopy', 'error');
      document.execCommand = localThis.originalExecCommand;
      localThis.showToastSpy.mockRestore();
    });

    it('should fall back to execCommand copy when Clipboard API is blocked', async () => {
      const localThis = {};
      localThis.showToastSpy = jest.spyOn(note, 'showToast');

      navigator.clipboard.writeText.mockClear();
      navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Permissions policy violation'));
      localThis.execCommandSpy = jest.fn(() => true);
      localThis.originalExecCommand = document.execCommand;
      document.execCommand = localThis.execCommandSpy;
      // Simulate Permissions Policy explicitly blocking clipboard-write
      localThis.originalPermissionsPolicy = document.permissionsPolicy;
      document.permissionsPolicy = { allowsFeature: jest.fn(() => false) };

      localThis.copyButton = note.element.querySelector('.sn-metadata-copy-btn[data-copy-value="test-note-1"]');
      localThis.copyButton.click();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(localThis.execCommandSpy).toHaveBeenCalledWith('copy');
      expect(localThis.showToastSpy).toHaveBeenCalledWith('copiedToClipboard');
      // Clipboard API should not be attempted if policy blocks it
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

      document.permissionsPolicy = localThis.originalPermissionsPolicy;
      document.execCommand = localThis.originalExecCommand;
      localThis.showToastSpy.mockRestore();
    });

    it('should show error toast when copy value is empty', async () => {
      const localThis = {};
      localThis.showToastSpy = jest.spyOn(note, 'showToast');
      // Find a copy button with empty value (e.g., owner email when not provided)
      localThis.copyButton = note.element.querySelector('.sn-metadata-copy-btn[data-copy-value=""]');
      
      if (localThis.copyButton) {
        await localThis.copyButton.click();
        expect(localThis.showToastSpy).toHaveBeenCalledWith('failedToCopy', 'error');
      }
      localThis.showToastSpy.mockRestore();
    });

    it('should stop event propagation when copy button is clicked', async () => {
      const localThis = {};
      localThis.copyButton = note.element.querySelector('.sn-metadata-copy-btn[data-copy-value="test-note-1"]');
      localThis.stopPropagationCalled = false;

      localThis.copyButton.addEventListener('click', (event) => {
        // Check if stopPropagation was called by checking if event bubbles
        localThis.originalStopPropagation = event.stopPropagation;
        event.stopPropagation = () => {
          localThis.stopPropagationCalled = true;
          localThis.originalStopPropagation.call(event);
        };
      }, { capture: true });

      await localThis.copyButton.click();
      expect(localThis.stopPropagationCalled).toBe(true);
    });

    it('should copy full URL value not truncated display value', async () => {
      const localThis = {};
      localThis.fullUrl = 'https://example.com/very/long/path/that/would/be/truncated/in/display';
      localThis.noteWithLongUrl = new StickyNote({
        id: 'test-note-url',
        anchor: anchor,
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        metadata: {
          url: localThis.fullUrl,
          browser: 'Chrome 120',
          viewport: '1920x1080'
        },
        onSave: onSave,
        onThemeChange: onThemeChange,
        onDelete: onDelete
      });
      container.appendChild(localThis.noteWithLongUrl.element);

      navigator.clipboard.writeText.mockClear();
      // Find the URL copy button (first one)
      localThis.copyButtons = localThis.noteWithLongUrl.element.querySelectorAll('.sn-metadata-copy-btn');
      localThis.urlCopyButton = localThis.copyButtons[0];

      await localThis.urlCopyButton.click();

      // Should copy the full URL, not truncated
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(localThis.fullUrl);

      localThis.noteWithLongUrl.destroy();
    });

    it('should copy correct values for all metadata fields', async () => {
      const localThis = {};
      localThis.noteWithAllMetadata = new StickyNote({
        id: 'test-note-all-meta',
        anchor: anchor,
        selector: '#my-element > .child',
        content: 'Test content',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        metadata: {
          url: 'https://test.com/page',
          browser: 'Firefox 121',
          viewport: '1280x720'
        },
        ownerEmail: 'owner@test.com',
        ownerId: 'uid-abc-123',
        onSave: onSave,
        onThemeChange: onThemeChange,
        onDelete: onDelete
      });
      container.appendChild(localThis.noteWithAllMetadata.element);

      localThis.copyButtons = localThis.noteWithAllMetadata.element.querySelectorAll('.sn-metadata-copy-btn');
      
      // Test each copy button has the correct value
      expect(localThis.copyButtons[0].dataset.copyValue).toBe('https://test.com/page'); // URL
      expect(localThis.copyButtons[1].dataset.copyValue).toBe('Firefox 121'); // Browser
      expect(localThis.copyButtons[2].dataset.copyValue).toBe('1280x720'); // Viewport
      expect(localThis.copyButtons[3].dataset.copyValue).toBe('#my-element > .child'); // Element selector
      expect(localThis.copyButtons[4].dataset.copyValue).toBe('owner@test.com'); // Owner email
      expect(localThis.copyButtons[5].dataset.copyValue).toBe('uid-abc-123'); // Owner UID
      expect(localThis.copyButtons[6].dataset.copyValue).toBe('test-note-all-meta'); // Note ID

      localThis.noteWithAllMetadata.destroy();
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
    it('should return SVG markup for auto position', () => {
      const icon = note.getPositionIcon('auto');
      expect(icon).toContain('<svg');
      expect(icon).toContain('viewBox="0 0 24 24"');
      expect(icon).toContain('</svg>');
      // Auto icon should have a crosshair-like design with circle
      expect(icon).toContain('<circle');
    });
    
    it('should return SVG markup for top-left position', () => {
      const icon = note.getPositionIcon('top-left');
      expect(icon).toContain('<svg');
      expect(icon).toContain('viewBox="0 0 24 24"');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for top-center position', () => {
      const icon = note.getPositionIcon('top-center');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for top-right position', () => {
      const icon = note.getPositionIcon('top-right');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for center-left position', () => {
      const icon = note.getPositionIcon('center-left');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for center-right position', () => {
      const icon = note.getPositionIcon('center-right');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for bottom-left position', () => {
      const icon = note.getPositionIcon('bottom-left');
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
    
    it('should return SVG markup for bottom-center position', () => {
      const icon = note.getPositionIcon('bottom-center');
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
    
    it('should create nine position buttons with SVG icons (including auto)', () => {
      note.showPositionPicker();
      const picker = note.element.querySelector('.sn-position-picker');
      const buttons = picker.querySelectorAll('button');
      expect(buttons.length).toBe(9);
      
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
      
      // Verify we have 9 buttons (including auto) and they have background styles set
      expect(buttons.length).toBe(9);
      
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
    
    it('should create modal overlay when called', () => {
      note.showShareModal();
      
      const overlay = container.querySelector('.sn-modal-overlay');
      expect(overlay).not.toBeNull();
      
      // Clean up
      overlay.remove();
    });
    
    it('should create modal with email input', () => {
      note.showShareModal();
      
      const modal = container.querySelector('.sn-modal');
      const emailInput = modal.querySelector('input[type="email"]');
      expect(emailInput).not.toBeNull();
      
      // Clean up
      container.querySelector('.sn-modal-overlay').remove();
    });
    
    it('should close modal when cancel button is clicked', async () => {
      note.showShareModal();
      
      const modal = container.querySelector('.sn-modal');
      const cancelBtn = modal.querySelector('.sn-btn-secondary');
      expect(cancelBtn).not.toBeNull();
      
      cancelBtn.click();
      
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const overlay = container.querySelector('.sn-modal-overlay');
      // Modal should be removed or have closing class
      expect(!overlay || overlay.classList.contains('sn-closing')).toBe(true);
    });
    
    it('should close modal when Escape key is pressed', async () => {
      note.showShareModal();
      
      const overlay = container.querySelector('.sn-modal-overlay');
      expect(overlay).not.toBeNull();
      
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      overlay.dispatchEvent(escapeEvent);
      
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const afterOverlay = container.querySelector('.sn-modal-overlay');
      expect(!afterOverlay || afterOverlay.classList.contains('sn-closing')).toBe(true);
    });
    
    it('should close modal when clicking overlay background', async () => {
      note.showShareModal();
      
      const overlay = container.querySelector('.sn-modal-overlay');
      expect(overlay).not.toBeNull();
      
      // Click on overlay (not the modal itself)
      overlay.click();
      
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const afterOverlay = container.querySelector('.sn-modal-overlay');
      expect(!afterOverlay || afterOverlay.classList.contains('sn-closing')).toBe(true);
    });
    
    it('should not submit share form with invalid email', async () => {
      chrome.runtime.sendMessage.mockClear();
      
      note.showShareModal();
      
      const modal = container.querySelector('.sn-modal');
      const emailInput = modal.querySelector('input[type="email"]');
      const shareBtn = modal.querySelector('.sn-btn-primary');
      
      emailInput.value = 'invalid-email';
      shareBtn.click();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should NOT have called shareNote with invalid email
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'shareNote', email: 'invalid-email' })
      );
      
      // Clean up
      container.querySelector('.sn-modal-overlay')?.remove();
    });
    
    it('should share successfully with valid email', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      note.showShareModal();
      
      const modal = container.querySelector('.sn-modal');
      const emailInput = modal.querySelector('input[type="email"]');
      const shareBtn = modal.querySelector('.sn-btn-primary');
      
      emailInput.value = 'valid@example.com';
      shareBtn.click();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'shareNote',
        noteId: 'test-note-1',
        email: 'valid@example.com'
      });
    });
    
    it('should handle Enter key to submit share form', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      note.showShareModal();
      
      const modal = container.querySelector('.sn-modal');
      const emailInput = modal.querySelector('input[type="email"]');
      
      emailInput.value = 'enter@example.com';
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      emailInput.dispatchEvent(enterEvent);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'shareNote',
        noteId: 'test-note-1',
        email: 'enter@example.com'
      });
    });
    
    it('should focus email input when modal opens', () => {
      note.showShareModal();
      
      const modal = container.querySelector('.sn-modal');
      const emailInput = modal.querySelector('input[type="email"]');
      
      expect(document.activeElement).toBe(emailInput);
      
      // Clean up
      container.querySelector('.sn-modal-overlay').remove();
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
    
    it('should position top-center (above element, horizontally centered)', () => {
      // Mock note dimensions
      Object.defineProperty(note.element, 'offsetWidth', { value: 200, configurable: true });
      Object.defineProperty(note.element, 'offsetHeight', { value: 100, configurable: true });
      
      // Mock anchor position
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 100,
        top: 200,
        right: 300,
        bottom: 250,
        width: 200,
        height: 50
      }));
      
      note.customPosition = null;
      note.position = { anchor: 'top-center' };
      note.updatePosition();
      
      // top-center: x = anchorRect.left + (anchorWidth - noteWidth) / 2 = 100 + (200 - 200) / 2 = 100
      // y = anchorRect.top - noteHeight - 10 = 200 - 100 - 10 = 90
      expect(note.element.style.left).toBe('100px');
      expect(note.element.style.top).toBe('90px');
    });
    
    it('should position bottom-center (below element, horizontally centered)', () => {
      // Mock note dimensions
      Object.defineProperty(note.element, 'offsetWidth', { value: 200, configurable: true });
      Object.defineProperty(note.element, 'offsetHeight', { value: 100, configurable: true });
      
      // Mock anchor position
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 100,
        top: 200,
        right: 300,
        bottom: 250,
        width: 200,
        height: 50
      }));
      
      note.customPosition = null;
      note.position = { anchor: 'bottom-center' };
      note.updatePosition();
      
      // bottom-center: x = anchorRect.left + (anchorWidth - noteWidth) / 2 = 100 + (200 - 200) / 2 = 100
      // y = anchorRect.bottom + 10 = 250 + 10 = 260
      expect(note.element.style.left).toBe('100px');
      expect(note.element.style.top).toBe('260px');
    });
    
    it('should position center-left (to the left, vertically centered)', () => {
      // Mock note dimensions
      Object.defineProperty(note.element, 'offsetWidth', { value: 200, configurable: true });
      Object.defineProperty(note.element, 'offsetHeight', { value: 100, configurable: true });
      
      // Mock anchor position
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 300,
        top: 200,
        right: 500,
        bottom: 300,
        width: 200,
        height: 100
      }));
      
      note.customPosition = null;
      note.position = { anchor: 'center-left' };
      note.updatePosition();
      
      // center-left: x = anchorRect.left - noteWidth - 10 = 300 - 200 - 10 = 90
      // y = anchorRect.top + (anchorHeight - noteHeight) / 2 = 200 + (100 - 100) / 2 = 200
      expect(note.element.style.left).toBe('90px');
      expect(note.element.style.top).toBe('200px');
    });
    
    it('should position center-right (to the right, vertically centered)', () => {
      // Mock note dimensions
      Object.defineProperty(note.element, 'offsetWidth', { value: 200, configurable: true });
      Object.defineProperty(note.element, 'offsetHeight', { value: 100, configurable: true });
      
      // Mock anchor position
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 100,
        top: 200,
        right: 300,
        bottom: 300,
        width: 200,
        height: 100
      }));
      
      note.customPosition = null;
      note.position = { anchor: 'center-right' };
      note.updatePosition();
      
      // center-right: x = anchorRect.right + 10 = 300 + 10 = 310
      // y = anchorRect.top + (anchorHeight - noteHeight) / 2 = 200 + (100 - 100) / 2 = 200
      expect(note.element.style.left).toBe('310px');
      expect(note.element.style.top).toBe('200px');
    });
    
    it('should use auto position and calculate best position dynamically', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      
      // Set viewport size
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      // Mock note dimensions
      Object.defineProperty(note.element, 'offsetWidth', { value: 200, configurable: true });
      Object.defineProperty(note.element, 'offsetHeight', { value: 100, configurable: true });
      
      // Mock anchor in top-left corner of viewport - should position to bottom-right
      note.anchor.getBoundingClientRect = jest.fn(() => ({
        left: 50,
        top: 50,
        right: 150,
        bottom: 100,
        width: 100,
        height: 50
      }));
      
      note.customPosition = null;
      note.position = { anchor: 'auto' };
      note.updatePosition();
      
      // With anchor in top-left, the auto position should choose a position with most space
      // The note should be positioned somewhere (we just verify it doesn't throw and sets a position)
      expect(note.element.style.left).toBeDefined();
      expect(note.element.style.top).toBeDefined();
      
      // Restore
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });
  });

  describe('calculateBestPosition', () => {
    it('should have calculateBestPosition method', () => {
      expect(typeof note.calculateBestPosition).toBe('function');
    });
    
    it('should return a bottom position when anchor is in top-left of viewport', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      // Anchor in top-left corner
      const anchorRect = {
        left: 50,
        top: 50,
        right: 150,
        bottom: 100,
        width: 100,
        height: 50
      };
      
      const result = note.calculateBestPosition(anchorRect, 200, 100);
      
      // With anchor at top-left, a bottom or right position should be preferred (more space below and to the right)
      expect(['bottom-left', 'bottom-center', 'bottom-right', 'center-right']).toContain(result);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });
    
    it('should return a top or left position when anchor is in bottom-right of viewport', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      // Anchor in bottom-right corner
      const anchorRect = {
        left: 874,
        top: 618,
        right: 974,
        bottom: 718,
        width: 100,
        height: 100
      };
      
      const result = note.calculateBestPosition(anchorRect, 200, 100);
      
      // With anchor at bottom-right, a top or left position should be preferred (more space above and to the left)
      expect(['top-left', 'top-center', 'top-right', 'center-left']).toContain(result);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });
    
    it('should prefer positions where note fits completely', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 400, writable: true, configurable: true });
      
      // Anchor in the middle
      const anchorRect = {
        left: 200,
        top: 150,
        right: 300,
        bottom: 250,
        width: 100,
        height: 100
      };
      
      // Note that needs 150x80 - should fit in multiple positions
      const result = note.calculateBestPosition(anchorRect, 150, 80);
      
      // Result should be one of the valid positions
      expect(['top-left', 'top-center', 'top-right', 'center-left', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']).toContain(result);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });
    
    it('should handle edge case when anchor is at viewport edge', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      // Anchor at top edge
      const anchorRect = {
        left: 400,
        top: 0,
        right: 500,
        bottom: 50,
        width: 100,
        height: 50
      };
      
      const result = note.calculateBestPosition(anchorRect, 200, 100);
      
      // Should return a position that fits below the anchor
      expect(['bottom-left', 'bottom-center', 'bottom-right', 'center-left', 'center-right']).toContain(result);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });
    
    it('should return a valid position even for very large notes', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 400, writable: true, configurable: true });
      
      // Anchor in middle
      const anchorRect = {
        left: 200,
        top: 150,
        right: 300,
        bottom: 250,
        width: 100,
        height: 100
      };
      
      // Very large note that won't fit anywhere cleanly
      const result = note.calculateBestPosition(anchorRect, 400, 300);
      
      // Should still return a valid position (best effort)
      expect(['top-left', 'top-center', 'top-right', 'center-left', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']).toContain(result);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });
  });

  describe('clampToViewport', () => {
    it('should have clampToViewport method', () => {
      expect(typeof note.clampToViewport).toBe('function');
    });

    it('should not modify position within viewport bounds', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      const result = note.clampToViewport(100, 100, 200, 150);
      
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });

    it('should clamp position when note extends beyond left edge', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      const result = note.clampToViewport(-50, 100, 200, 150);
      
      // Should clamp to padding (10px from edge)
      expect(result.x).toBe(10);
      expect(result.y).toBe(100);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });

    it('should clamp position when note extends beyond right edge', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      // Note at x=900 with width=200 would extend to 1100, beyond 1024
      const result = note.clampToViewport(900, 100, 200, 150);
      
      // Should clamp to viewport - noteWidth - padding = 1024 - 200 - 10 = 814
      expect(result.x).toBe(814);
      expect(result.y).toBe(100);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });

    it('should clamp position when note extends beyond top edge', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      const result = note.clampToViewport(100, -30, 200, 150);
      
      // Should clamp to padding (10px from edge)
      expect(result.x).toBe(100);
      expect(result.y).toBe(10);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });

    it('should clamp position when note extends beyond bottom edge', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      // Note at y=700 with height=150 would extend to 850, beyond 768
      const result = note.clampToViewport(100, 700, 200, 150);
      
      // Should clamp to viewport - noteHeight - padding = 768 - 150 - 10 = 608
      expect(result.x).toBe(100);
      expect(result.y).toBe(608);
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
    });

    it('should clamp position on multiple edges simultaneously', () => {
      const localThis = {};
      localThis.originalInnerWidth = window.innerWidth;
      localThis.originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      
      // Note at corner extending beyond both right and bottom
      const result = note.clampToViewport(900, 700, 200, 150);
      
      expect(result.x).toBe(814); // 1024 - 200 - 10
      expect(result.y).toBe(608); // 768 - 150 - 10
      
      Object.defineProperty(window, 'innerWidth', { value: localThis.originalInnerWidth, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: localThis.originalInnerHeight, writable: true, configurable: true });
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
    
    it('should recalculate auto position on resize', () => {
      const updateSpy = jest.spyOn(note, 'updatePosition');
      const calculateSpy = jest.spyOn(note, 'calculateBestPosition');
      
      note.customPosition = null;
      note.position = { anchor: 'auto' };
      
      // Mock note dimensions
      Object.defineProperty(note.element, 'offsetWidth', { value: 200, configurable: true });
      Object.defineProperty(note.element, 'offsetHeight', { value: 100, configurable: true });
      
      note.handleWindowResize();
      
      expect(updateSpy).toHaveBeenCalled();
      // updatePosition should call calculateBestPosition when position is 'auto'
      expect(calculateSpy).toHaveBeenCalled();
    });
  });
  
  describe('anchor highlight on hover', () => {
    it('should add highlight class to anchor on mouse enter', () => {
      note.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      
      expect(anchor.classList.contains('sn-element-highlight')).toBe(true);
    });
    
    it('should remove highlight class from anchor on mouse leave', () => {
      // First trigger mouse enter to add the class
      note.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(anchor.classList.contains('sn-element-highlight')).toBe(true);
      
      // Then trigger mouse leave
      note.element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      expect(anchor.classList.contains('sn-element-highlight')).toBe(false);
    });
    
    it('should not throw when anchor is null on mouse enter', () => {
      note.anchor = null;
      expect(() => {
        note.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }).not.toThrow();
    });
    
    it('should not throw when anchor is null on mouse leave', () => {
      note.anchor = null;
      expect(() => {
        note.element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      }).not.toThrow();
    });
    
    it('should not highlight anchor during selection mode', () => {
      document.body.classList.add('sn-selection-mode');
      
      note.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      
      expect(anchor.classList.contains('sn-element-highlight')).toBe(false);
      
      document.body.classList.remove('sn-selection-mode');
    });
    
    it('should not highlight when anchor is removed from DOM', () => {
      // Remove anchor from DOM
      anchor.parentNode.removeChild(anchor);
      
      note.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      
      expect(anchor.classList.contains('sn-element-highlight')).toBe(false);
      
      // Re-add anchor for other tests
      document.body.appendChild(anchor);
    });
    
    it('should clean up highlight class when note is destroyed', () => {
      // First trigger mouse enter to add the class
      note.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(anchor.classList.contains('sn-element-highlight')).toBe(true);
      
      // Destroy the note
      note.destroy();
      note = null; // Prevent afterEach from calling destroy again
      
      // Highlight should be removed
      expect(anchor.classList.contains('sn-element-highlight')).toBe(false);
    });
    
    it('should call handleNoteMouseEnter directly', () => {
      note.handleNoteMouseEnter();
      expect(anchor.classList.contains('sn-element-highlight')).toBe(true);
    });
    
    it('should call handleNoteMouseLeave directly', () => {
      anchor.classList.add('sn-element-highlight');
      note.handleNoteMouseLeave();
      expect(anchor.classList.contains('sn-element-highlight')).toBe(false);
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

    it('should toggle visibility on Ctrl+H', () => {
      const localThis = {};
      localThis.handleHideClickSpy = jest.spyOn(note, 'handleHideClick');
      
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        ctrlKey: true,
        bubbles: true 
      });
      
      // Spy on preventDefault and stopPropagation
      localThis.preventDefaultSpy = jest.spyOn(event, 'preventDefault');
      localThis.stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
      
      note.handleKeyDown(event);
      
      expect(localThis.preventDefaultSpy).toHaveBeenCalled();
      expect(localThis.stopPropagationSpy).toHaveBeenCalled();
      expect(localThis.handleHideClickSpy).toHaveBeenCalledWith(event);
      
      localThis.handleHideClickSpy.mockRestore();
    });

    it('should toggle visibility on Cmd+H (Mac)', () => {
      const localThis = {};
      localThis.handleHideClickSpy = jest.spyOn(note, 'handleHideClick');
      
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        metaKey: true, // Cmd key on Mac
        bubbles: true 
      });
      
      note.handleKeyDown(event);
      
      expect(localThis.handleHideClickSpy).toHaveBeenCalledWith(event);
      
      localThis.handleHideClickSpy.mockRestore();
    });

    it('should not toggle visibility on Ctrl+Shift+H (reserved for toggle all)', () => {
      const localThis = {};
      localThis.handleHideClickSpy = jest.spyOn(note, 'handleHideClick');
      
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        ctrlKey: true,
        shiftKey: true, // Shift key pressed - this is for toggle all notes
        bubbles: true 
      });
      
      note.handleKeyDown(event);
      
      expect(localThis.handleHideClickSpy).not.toHaveBeenCalled();
      
      localThis.handleHideClickSpy.mockRestore();
    });

    it('should not toggle visibility on H key without modifier', () => {
      const localThis = {};
      localThis.handleHideClickSpy = jest.spyOn(note, 'handleHideClick');
      
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        bubbles: true 
      });
      
      note.handleKeyDown(event);
      
      expect(localThis.handleHideClickSpy).not.toHaveBeenCalled();
      
      localThis.handleHideClickSpy.mockRestore();
    });

    it('should handle uppercase H key with Ctrl', () => {
      const localThis = {};
      localThis.handleHideClickSpy = jest.spyOn(note, 'handleHideClick');
      
      const event = new KeyboardEvent('keydown', { 
        key: 'H', // Uppercase
        ctrlKey: true,
        bubbles: true 
      });
      
      note.handleKeyDown(event);
      
      expect(localThis.handleHideClickSpy).toHaveBeenCalledWith(event);
      
      localThis.handleHideClickSpy.mockRestore();
    });

    it('should toggle visibility when Ctrl+H is dispatched from RichEditor (event bubbling)', () => {
      const localThis = {};
      // Mock queryCommandState which RichEditor uses for toolbar state
      localThis.originalQueryCommandState = document.queryCommandState;
      document.queryCommandState = jest.fn().mockReturnValue(false);
      
      localThis.handleHideClickSpy = jest.spyOn(note, 'handleHideClick');
      
      // Get the RichEditor's contenteditable element (where user types)
      const editorContent = note.richEditor.editor;
      expect(editorContent).toBeTruthy();
      expect(editorContent.contentEditable).toBe('true');
      
      // Dispatch Ctrl+H on the editor content - should bubble up to note
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      
      editorContent.dispatchEvent(event);
      
      // Event should have bubbled up and triggered handleHideClick
      expect(localThis.handleHideClickSpy).toHaveBeenCalled();
      
      localThis.handleHideClickSpy.mockRestore();
      document.queryCommandState = localThis.originalQueryCommandState;
    });

    it('should toggle visibility when Cmd+H is dispatched from RichEditor on Mac (event bubbling)', () => {
      const localThis = {};
      // Mock queryCommandState which RichEditor uses for toolbar state
      localThis.originalQueryCommandState = document.queryCommandState;
      document.queryCommandState = jest.fn().mockReturnValue(false);
      
      localThis.handleHideClickSpy = jest.spyOn(note, 'handleHideClick');
      
      const editorContent = note.richEditor.editor;
      
      // Dispatch Cmd+H on the editor content - should bubble up to note
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        metaKey: true,
        bubbles: true,
        cancelable: true
      });
      
      editorContent.dispatchEvent(event);
      
      expect(localThis.handleHideClickSpy).toHaveBeenCalled();
      
      localThis.handleHideClickSpy.mockRestore();
      document.queryCommandState = localThis.originalQueryCommandState;
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
  
  describe('truncateUrl', () => {
    it('should return empty string for null/undefined', () => {
      expect(note.truncateUrl(null)).toBe('');
      expect(note.truncateUrl(undefined)).toBe('');
    });
    
    it('should truncate long paths', () => {
      const longUrl = 'https://example.com/very/long/path/that/exceeds/thirty/characters/limit';
      const result = note.truncateUrl(longUrl);
      expect(result.length).toBeLessThan(longUrl.length);
      expect(result).toContain('...');
    });
    
    it('should handle short paths without truncation', () => {
      const shortUrl = 'https://example.com/short';
      const result = note.truncateUrl(shortUrl);
      expect(result).not.toContain('...');
    });
    
    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      const result = note.truncateUrl(invalidUrl);
      expect(result).toBe(invalidUrl);
    });
    
    it('should truncate long invalid URLs', () => {
      const longInvalid = 'a'.repeat(50);
      const result = note.truncateUrl(longInvalid);
      expect(result.length).toBeLessThanOrEqual(40);
      expect(result).toContain('...');
    });
  });

  describe('truncateSelector', () => {
    it('should return empty string for null/undefined', () => {
      expect(note.truncateSelector(null)).toBe('');
      expect(note.truncateSelector(undefined)).toBe('');
    });
    
    it('should truncate long selectors', () => {
      const longSelector = '.very-long-class-name > .another-long-class > span.nested-element';
      const result = note.truncateSelector(longSelector);
      expect(result.length).toBeLessThanOrEqual(35);
      expect(result).toContain('...');
    });
    
    it('should not truncate short selectors', () => {
      const shortSelector = '#my-id';
      const result = note.truncateSelector(shortSelector);
      expect(result).toBe(shortSelector);
    });
  });

  describe('renderConsoleErrors', () => {
    it('should return empty string when no errors', () => {
      const localThis = {};
      localThis.noteNoErrors = new StickyNote({
        id: 'no-errors',
        anchor: anchor,
        content: '',
        metadata: { consoleErrors: [] }
      });
      
      const result = localThis.noteNoErrors.renderConsoleErrors();
      expect(result).toBe('');
      
      localThis.noteNoErrors.destroy();
    });
    
    it('should return empty string when consoleErrors is undefined', () => {
      const localThis = {};
      localThis.noteUndefined = new StickyNote({
        id: 'undefined-errors',
        anchor: anchor,
        content: '',
        metadata: {}
      });
      
      const result = localThis.noteUndefined.renderConsoleErrors();
      expect(result).toBe('');
      
      localThis.noteUndefined.destroy();
    });
    
    it('should render console errors section when errors exist', () => {
      const localThis = {};
      localThis.noteWithErrors = new StickyNote({
        id: 'with-errors',
        anchor: anchor,
        content: '',
        metadata: {
          consoleErrors: [
            { type: 'console.error', message: 'Test error', timestamp: Date.now() }
          ]
        }
      });
      
      const result = localThis.noteWithErrors.renderConsoleErrors();
      expect(result).toContain('sn-console-errors');
      expect(result).toContain('Test error');
      
      localThis.noteWithErrors.destroy();
    });
    
    it('should handle errors without timestamp', () => {
      const localThis = {};
      localThis.noteNoTimestamp = new StickyNote({
        id: 'no-timestamp',
        anchor: anchor,
        content: '',
        metadata: {
          consoleErrors: [
            { type: 'console.error', message: 'Error without time' }
          ]
        }
      });
      
      const result = localThis.noteNoTimestamp.renderConsoleErrors();
      expect(result).toContain('Error without time');
      
      localThis.noteNoTimestamp.destroy();
    });
  });

  describe('getErrorTypeLabel', () => {
    it('should return correct label for console.error', () => {
      expect(note.getErrorTypeLabel('console.error')).toBe('consoleErrorType');
    });
    
    it('should return correct label for console.warn', () => {
      expect(note.getErrorTypeLabel('console.warn')).toBe('consoleWarnType');
    });
    
    it('should return correct label for exception', () => {
      expect(note.getErrorTypeLabel('exception')).toBe('consoleExceptionType');
    });
    
    it('should return correct label for unhandledrejection', () => {
      expect(note.getErrorTypeLabel('unhandledrejection')).toBe('consolePromiseType');
    });
    
    it('should return raw type for unknown types', () => {
      expect(note.getErrorTypeLabel('custom-type')).toBe('custom-type');
    });
  });

  describe('getEnvironment', () => {
    it('should return stored environment if available', () => {
      const localThis = {};
      localThis.noteWithEnv = new StickyNote({
        id: 'env-test',
        anchor: anchor,
        content: '',
        metadata: { environment: 'staging' }
      });
      
      expect(localThis.noteWithEnv.getEnvironment()).toBe('staging');
      
      localThis.noteWithEnv.destroy();
    });
    
    it('should auto-detect environment from URL if not stored', () => {
      const localThis = {};
      localThis.noteAutoDetect = new StickyNote({
        id: 'env-auto',
        anchor: anchor,
        content: '',
        metadata: { url: 'https://localhost:3000/app' }
      });
      
      const env = localThis.noteAutoDetect.getEnvironment();
      expect(['local', 'development', 'staging', 'production']).toContain(env);
      
      localThis.noteAutoDetect.destroy();
    });
  });

  describe('getEnvironmentLabel', () => {
    it('should return translated label for each environment', () => {
      expect(note.getEnvironmentLabel('local')).toBe('envLocal');
      expect(note.getEnvironmentLabel('development')).toBe('envDevelopment');
      expect(note.getEnvironmentLabel('staging')).toBe('envStaging');
      expect(note.getEnvironmentLabel('production')).toBe('envProduction');
    });
    
    it('should return production label for unknown environment', () => {
      expect(note.getEnvironmentLabel('unknown')).toBe('envProduction');
    });
  });

  describe('toggleConsoleErrors', () => {
    it('should toggle console errors list visibility', () => {
      const localThis = {};
      localThis.noteWithErrors = new StickyNote({
        id: 'toggle-errors',
        anchor: anchor,
        content: '',
        metadata: {
          consoleErrors: [
            { type: 'console.error', message: 'Test error' }
          ]
        }
      });
      container.appendChild(localThis.noteWithErrors.element);
      
      const toggle = localThis.noteWithErrors.element.querySelector('.sn-console-errors-toggle');
      const list = localThis.noteWithErrors.element.querySelector('.sn-console-errors-list');
      
      if (toggle && list) {
        // Initially hidden
        expect(list.classList.contains('sn-hidden')).toBe(true);
        
        // Toggle to show
        toggle.click();
        expect(list.classList.contains('sn-hidden')).toBe(false);
        
        // Toggle to hide
        toggle.click();
        expect(list.classList.contains('sn-hidden')).toBe(true);
      }
      
      localThis.noteWithErrors.destroy();
    });
  });

  describe('handleEnvironmentClick', () => {
    it('should toggle environment dropdown', () => {
      const localThis = {};
      localThis.envBadge = note.element.querySelector('.sn-environment-badge');
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.envBadge && localThis.dropdown) {
        expect(localThis.dropdown.classList.contains('sn-hidden')).toBe(true);
        
        localThis.envBadge.click();
        expect(localThis.dropdown.classList.contains('sn-hidden')).toBe(false);
        
        localThis.envBadge.click();
        expect(localThis.dropdown.classList.contains('sn-hidden')).toBe(true);
      }
    });
  });

  describe('handleEnvironmentBadgeKeydown', () => {
    it('should open dropdown on Enter key', () => {
      const localThis = {};
      localThis.envBadge = note.element.querySelector('.sn-environment-badge');
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.envBadge && localThis.dropdown) {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        event.preventDefault = jest.fn();
        localThis.envBadge.dispatchEvent(event);
        
        expect(event.preventDefault).toHaveBeenCalled();
      }
    });
    
    it('should open dropdown on Space key', () => {
      const localThis = {};
      localThis.envBadge = note.element.querySelector('.sn-environment-badge');
      
      if (localThis.envBadge) {
        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
        event.preventDefault = jest.fn();
        localThis.envBadge.dispatchEvent(event);
        
        expect(event.preventDefault).toHaveBeenCalled();
      }
    });
    
    it('should close dropdown on Escape key', () => {
      const localThis = {};
      localThis.envBadge = note.element.querySelector('.sn-environment-badge');
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.envBadge && localThis.dropdown) {
        // First open
        localThis.envBadge.click();
        
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        event.preventDefault = jest.fn();
        localThis.envBadge.dispatchEvent(event);
        
        expect(localThis.dropdown.classList.contains('sn-hidden')).toBe(true);
      }
    });
  });

  describe('handleEnvironmentSelect', () => {
    it('should close dropdown when selecting same environment', () => {
      const localThis = {};
      localThis.envBadge = note.element.querySelector('.sn-environment-badge');
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.envBadge && localThis.dropdown) {
        // Open dropdown
        localThis.envBadge.click();
        
        // Click on already selected option
        const currentEnv = note.getEnvironment();
        const option = localThis.dropdown.querySelector(`[data-env="${currentEnv}"]`);
        if (option) {
          option.click();
          expect(localThis.dropdown.classList.contains('sn-hidden')).toBe(true);
        }
      }
    });
    
    it('should update environment when selecting new value', () => {
      const localThis = {};
      localThis.envBadge = note.element.querySelector('.sn-environment-badge');
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.envBadge && localThis.dropdown) {
        localThis.envBadge.click();
        
        const newEnvOption = localThis.dropdown.querySelector('[data-env="staging"]');
        if (newEnvOption) {
          newEnvOption.click();
          expect(note.metadata.environment).toBe('staging');
        }
      }
    });
  });

  describe('handleEnvironmentOptionKeydown', () => {
    it('should navigate with arrow keys', () => {
      const localThis = {};
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.dropdown) {
        note.openEnvironmentDropdown();
        
        const options = localThis.dropdown.querySelectorAll('.sn-env-option');
        if (options.length > 1) {
          const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
          event.preventDefault = jest.fn();
          options[0].dispatchEvent(event);
          
          expect(event.preventDefault).toHaveBeenCalled();
        }
      }
    });
    
    it('should select on Enter key', () => {
      const localThis = {};
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.dropdown) {
        note.openEnvironmentDropdown();
        
        const option = localThis.dropdown.querySelector('[data-env="staging"]');
        if (option) {
          const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
          event.preventDefault = jest.fn();
          option.dispatchEvent(event);
          
          expect(event.preventDefault).toHaveBeenCalled();
        }
      }
    });
  });

  describe('handleDocumentClick', () => {
    it('should close dropdown when clicking outside', () => {
      const localThis = {};
      localThis.envBadge = note.element.querySelector('.sn-environment-badge');
      localThis.dropdown = note.element.querySelector('.sn-environment-dropdown');
      
      if (localThis.envBadge && localThis.dropdown) {
        localThis.envBadge.click();
        expect(localThis.dropdown.classList.contains('sn-hidden')).toBe(false);
        
        // Click outside
        document.body.click();
        expect(localThis.dropdown.classList.contains('sn-hidden')).toBe(true);
      }
    });
    
    it('should handle click when element is destroyed', () => {
      const localThis = {};
      localThis.destroyedNote = new StickyNote({
        id: 'destroyed-test',
        anchor: anchor,
        content: ''
      });
      localThis.destroyedNote.element = null;
      
      // Should not throw
      expect(() => localThis.destroyedNote.handleDocumentClick(new MouseEvent('click'))).not.toThrow();
    });
  });

  describe('copyTextToClipboard', () => {
    it('should use legacy execCommand when Clipboard API fails', async () => {
      const localThis = {};
      localThis.originalClipboard = navigator.clipboard;
      localThis.execCommandCalled = false;
      
      navigator.clipboard = {
        writeText: jest.fn().mockRejectedValue(new Error('Blocked'))
      };
      
      localThis.originalExecCommand = document.execCommand;
      document.execCommand = jest.fn(() => {
        localThis.execCommandCalled = true;
        return true;
      });
      
      await note.copyTextToClipboard('test text');
      
      expect(localThis.execCommandCalled).toBe(true);
      
      navigator.clipboard = localThis.originalClipboard;
      document.execCommand = localThis.originalExecCommand;
    });
    
    it('should throw when both Clipboard API and execCommand fail', async () => {
      const localThis = {};
      localThis.originalClipboard = navigator.clipboard;
      localThis.originalExecCommand = document.execCommand;
      
      navigator.clipboard = {
        writeText: jest.fn().mockRejectedValue(new Error('Blocked'))
      };
      document.execCommand = undefined;
      
      await expect(note.copyTextToClipboard('test')).rejects.toThrow();
      
      navigator.clipboard = localThis.originalClipboard;
      document.execCommand = localThis.originalExecCommand;
    });
  });

  describe('dataUrlToBlob', () => {
    it('should convert data URL to blob', async () => {
      const localThis = {};
      localThis.originalFetch = global.fetch;
      
      localThis.mockBlob = new Blob(['test'], { type: 'image/png' });
      global.fetch = jest.fn().mockResolvedValue({
        blob: () => Promise.resolve(localThis.mockBlob)
      });
      
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const blob = await note.dataUrlToBlob(dataUrl);
      expect(blob).toBe(localThis.mockBlob);
      
      global.fetch = localThis.originalFetch;
    });
  });

  describe('showToast', () => {
    it('should remove existing toast before creating new one', () => {
      note.showToast('First toast');
      note.showToast('Second toast');
      
      const toasts = container.querySelectorAll('.sn-toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toBe('Second toast');
    });
    
    it('should not throw when container is null', () => {
      const localThis = {};
      localThis.orphanNote = new StickyNote({
        id: 'orphan-toast',
        anchor: anchor,
        content: ''
      });
      // Don't append to container
      
      expect(() => localThis.orphanNote.showToast('test')).not.toThrow();
    });
  });

  describe('handleAutoShare', () => {
    it('should not share when note has no ID', async () => {
      const localThis = {};
      localThis.noteNoId = new StickyNote({
        id: null,
        anchor: anchor,
        content: ''
      });
      
      await localThis.noteNoId.handleAutoShare('test@example.com');
      
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'shareNote' })
      );
    });
    
    it('should not share with self', async () => {
      const localThis = {};
      localThis.noteWithUser = new StickyNote({
        id: 'share-self-test',
        anchor: anchor,
        content: '',
        user: { email: 'me@example.com' }
      });
      
      await localThis.noteWithUser.handleAutoShare('me@example.com');
      
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'shareNote' })
      );
      
      localThis.noteWithUser.destroy();
    });
    
    it('should share successfully when note has ID', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      const localThis = {};
      localThis.shareNote = new StickyNote({
        id: 'share-test-note',
        anchor: anchor,
        content: 'Test content',
        user: { email: 'owner@example.com' }
      });
      container.appendChild(localThis.shareNote.element);
      
      // Spy on showToast to verify toast notification
      localThis.showToastSpy = jest.spyOn(localThis.shareNote, 'showToast');
      
      await localThis.shareNote.handleAutoShare('other@example.com');
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'shareNote',
        noteId: 'share-test-note',
        email: 'other@example.com'
      });
      
      // Verify toast is shown for success (t() returns key name in tests)
      expect(localThis.showToastSpy).toHaveBeenCalledWith('noteShared');
      
      localThis.showToastSpy.mockRestore();
      localThis.shareNote.destroy();
    });
    
    it('should handle share error gracefully with custom error message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'User not found' });
      
      const localThis = {};
      localThis.shareNote = new StickyNote({
        id: 'share-error-note',
        anchor: anchor,
        content: 'Test content'
      });
      container.appendChild(localThis.shareNote.element);
      
      // Spy on showToast to verify error toast notification
      localThis.showToastSpy = jest.spyOn(localThis.shareNote, 'showToast');
      
      // Should not throw - if it throws, Jest will fail the test
      await localThis.shareNote.handleAutoShare('invalid@example.com');
      
      // Verify error toast is shown with the error message
      expect(localThis.showToastSpy).toHaveBeenCalledWith('User not found', 'error');
      
      localThis.showToastSpy.mockRestore();
      localThis.shareNote.destroy();
    });
    
    it('should show fallback error toast when response has no error message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: false });
      
      const localThis = {};
      localThis.shareNote = new StickyNote({
        id: 'share-error-fallback',
        anchor: anchor,
        content: 'Test content'
      });
      container.appendChild(localThis.shareNote.element);
      
      // Spy on showToast to verify error toast notification
      localThis.showToastSpy = jest.spyOn(localThis.shareNote, 'showToast');
      
      await localThis.shareNote.handleAutoShare('test@example.com');
      
      // Verify fallback error toast is shown (t() returns key name in tests)
      expect(localThis.showToastSpy).toHaveBeenCalledWith('failedToShare', 'error');
      
      localThis.showToastSpy.mockRestore();
      localThis.shareNote.destroy();
    });
    
    it('should handle network error gracefully', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const localThis = {};
      localThis.shareNote = new StickyNote({
        id: 'share-network-error',
        anchor: anchor,
        content: 'Test content'
      });
      container.appendChild(localThis.shareNote.element);
      
      // Spy on showToast to verify error toast notification
      localThis.showToastSpy = jest.spyOn(localThis.shareNote, 'showToast');
      
      // Should not throw - if it throws, Jest will fail the test
      await localThis.shareNote.handleAutoShare('test@example.com');
      
      // Verify error toast is shown for network errors (t() returns key name in tests)
      expect(localThis.showToastSpy).toHaveBeenCalledWith('failedToShare', 'error');
      
      localThis.showToastSpy.mockRestore();
      localThis.shareNote.destroy();
    });
    
    it('should handle case-insensitive self-share check', async () => {
      const localThis = {};
      localThis.noteWithUser = new StickyNote({
        id: 'case-share-test',
        anchor: anchor,
        content: '',
        user: { email: 'ME@EXAMPLE.COM' }
      });
      
      await localThis.noteWithUser.handleAutoShare('me@example.com');
      
      // Should not have called shareNote for self
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'shareNote' })
      );
      
      localThis.noteWithUser.destroy();
    });
  });

  describe('handleAutoUnshare', () => {
    it('should not unshare when note has no ID', async () => {
      const localThis = {};
      localThis.noteNoId = new StickyNote({
        id: null,
        anchor: anchor,
        content: ''
      });
      
      await localThis.noteNoId.handleAutoUnshare('test@example.com');
      
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'unshareNote' })
      );
    });
    
    it('should unshare successfully when note has ID', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      const localThis = {};
      localThis.unshareNote = new StickyNote({
        id: 'unshare-test-note',
        anchor: anchor,
        content: 'Test content'
      });
      
      await localThis.unshareNote.handleAutoUnshare('other@example.com');
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'unshareNote',
        noteId: 'unshare-test-note',
        email: 'other@example.com'
      });
      
      localThis.unshareNote.destroy();
    });
    
    it('should handle unshare error gracefully', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Failed' });
      
      const localThis = {};
      localThis.unshareNote = new StickyNote({
        id: 'unshare-error-note',
        anchor: anchor,
        content: 'Test content'
      });
      
      // Should not throw - if it throws, Jest will fail the test
      await localThis.unshareNote.handleAutoUnshare('test@example.com');
      
      localThis.unshareNote.destroy();
    });
    
    it('should handle network error gracefully', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));
      
      const localThis = {};
      localThis.unshareNote = new StickyNote({
        id: 'unshare-network-error',
        anchor: anchor,
        content: 'Test content'
      });
      
      // Should not throw - if it throws, Jest will fail the test
      await localThis.unshareNote.handleAutoUnshare('test@example.com');
      
      localThis.unshareNote.destroy();
    });
  });

  describe('minimize/maximize', () => {
    it('should start minimized by default (existing notes)', () => {
      expect(note.isMinimized).toBe(true);
      expect(note.element.classList.contains('sn-minimized')).toBe(true);
    });

    it('should start maximized when isMinimized: false is passed (new notes)', () => {
      const localThis = {};
      localThis.newNote = new StickyNote({
        id: 'new-note-1',
        anchor: anchor,
        container: container,
        content: 'New note content',
        theme: 'yellow',
        position: { anchor: 'top-right' },
        isMinimized: false,
        onSave: onSave,
        onThemeChange: onThemeChange,
        onDelete: onDelete
      });

      expect(localThis.newNote.isMinimized).toBe(false);
      expect(localThis.newNote.element.classList.contains('sn-minimized')).toBe(false);

      localThis.newNote.destroy();
    });
    
    it('should create minimize button', () => {
      const minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      expect(minimizeBtn).not.toBeNull();
    });
    
    it('should have toggleMinimize method', () => {
      expect(typeof note.toggleMinimize).toBe('function');
    });
    
    it('should toggle minimized state when toggleMinimize is called', () => {
      // Starts minimized (default for existing notes)
      expect(note.isMinimized).toBe(true);
      expect(note.element.classList.contains('sn-minimized')).toBe(true);

      // Toggle to maximized
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

      // When minimized (default for existing notes), title should be "expand"
      expect(localThis.minimizeBtn.title).toBe('expand');

      // After maximizing
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

      // Get initial SVG (up arrow for expand - note starts minimized)
      localThis.initialSvg = localThis.minimizeBtn.innerHTML;
      expect(localThis.initialSvg).toContain('6 15 12 9 18 15'); // up arrow points

      // Toggle to maximized state
      note.toggleMinimize();
      localThis.maximizedSvg = localThis.minimizeBtn.innerHTML;
      expect(localThis.maximizedSvg).toContain('6 9 12 15 18 9'); // down arrow points

      // Toggle back to minimized
      note.toggleMinimize();
      localThis.minimizedSvg = localThis.minimizeBtn.innerHTML;
      expect(localThis.minimizedSvg).toContain('6 15 12 9 18 15'); // up arrow points
    });
    
    it('should have maximize method', () => {
      expect(typeof note.maximize).toBe('function');
    });
    
    it('should have minimize method', () => {
      expect(typeof note.minimize).toBe('function');
    });
    
    it('should maximize when calling maximize() on minimized note', () => {
      // Note starts minimized by default
      expect(note.isMinimized).toBe(true);
      
      note.maximize();
      
      expect(note.isMinimized).toBe(false);
      expect(note.element.classList.contains('sn-minimized')).toBe(false);
    });
    
    it('should do nothing when calling maximize() on already maximized note', () => {
      // First maximize the note
      note.maximize();
      expect(note.isMinimized).toBe(false);
      
      // Call maximize again - should not change state
      note.maximize();
      expect(note.isMinimized).toBe(false);
    });
    
    it('should minimize when calling minimize() on maximized note', () => {
      // First maximize the note
      note.maximize();
      expect(note.isMinimized).toBe(false);
      
      note.minimize();
      
      expect(note.isMinimized).toBe(true);
      expect(note.element.classList.contains('sn-minimized')).toBe(true);
    });
    
    it('should do nothing when calling minimize() on already minimized note', () => {
      // Note starts minimized by default
      expect(note.isMinimized).toBe(true);
      
      // Call minimize again - should not change state
      note.minimize();
      expect(note.isMinimized).toBe(true);
    });
    
    it('should update UI correctly when maximize is called', () => {
      const localThis = {};
      localThis.minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      
      note.maximize();
      
      expect(localThis.minimizeBtn.title).toBe('minimize');
      expect(localThis.minimizeBtn.innerHTML).toContain('6 9 12 15 18 9'); // down arrow
    });
    
    it('should update UI correctly when minimize is called', () => {
      const localThis = {};
      localThis.minimizeBtn = note.element.querySelector('.sn-minimize-btn');
      
      // First maximize
      note.maximize();
      
      // Then minimize
      note.minimize();
      
      expect(localThis.minimizeBtn.title).toBe('expand');
      expect(localThis.minimizeBtn.innerHTML).toContain('6 15 12 9 18 15'); // up arrow
    });
  });

  describe('page-level notes', () => {
    let pageNote;
    
    beforeEach(() => {
      pageNote = new StickyNote({
        id: 'page-note-1',
        anchor: null,
        selector: '__PAGE__',
        content: 'Page-level note content',
        theme: 'blue',
        position: { pageX: 100, pageY: 200 },
        onSave: onSave,
        onThemeChange: onThemeChange,
        onDelete: onDelete
      });
      container.appendChild(pageNote.element);
    });
    
    afterEach(() => {
      if (pageNote) {
        pageNote.destroy();
      }
    });
    
    describe('constructor', () => {
      it('should identify as page-level note', () => {
        expect(pageNote.isPageLevel).toBe(true);
      });
      
      it('should have null anchor', () => {
        expect(pageNote.anchor).toBeNull();
      });
      
      it('should have __PAGE__ selector', () => {
        expect(pageNote.selector).toBe('__PAGE__');
      });
    });
    
    describe('render', () => {
      it('should display page-level label instead of selector in metadata', () => {
        const localThis = {};
        localThis.selectorElement = pageNote.element.querySelector('.sn-metadata-selector');
        expect(localThis.selectorElement.textContent).toBe('pageLevel');
      });
      
      it('should not have copy button for page-level selector', () => {
        const localThis = {};
        // Page-level notes have fewer copy buttons (no selector copy button)
        localThis.copyButtons = pageNote.element.querySelectorAll('.sn-metadata-copy-btn');
        // Should have 6 instead of 7 (no selector copy button)
        expect(localThis.copyButtons.length).toBe(6);
      });
    });
    
    describe('updatePosition', () => {
      it('should position based on pageX/pageY coordinates', () => {
        pageNote.updatePosition();
        // With scrollX=0, scrollY=0: viewport coords = page coords
        expect(pageNote.element.style.left).toBe('100px');
        expect(pageNote.element.style.top).toBe('200px');
      });
      
      it('should convert page coordinates to viewport coordinates when scrolled', () => {
        const localThis = {};
        localThis.originalScrollX = window.scrollX;
        localThis.originalScrollY = window.scrollY;
        Object.defineProperty(window, 'scrollX', { value: 50, writable: true });
        Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
        
        pageNote.updatePosition();
        
        // viewport = page - scroll: (100-50, 200-100) = (50, 100)
        expect(pageNote.element.style.left).toBe('50px');
        expect(pageNote.element.style.top).toBe('100px');
        
        Object.defineProperty(window, 'scrollX', { value: localThis.originalScrollX, writable: true });
        Object.defineProperty(window, 'scrollY', { value: localThis.originalScrollY, writable: true });
      });
      
      it('should use default position (10, 10) when pageX/pageY not set', () => {
        const localThis = {};
        localThis.defaultPageNote = new StickyNote({
          id: 'default-page-note',
          anchor: null,
          selector: '__PAGE__',
          content: '',
          position: {}
        });
        container.appendChild(localThis.defaultPageNote.element);
        
        localThis.defaultPageNote.updatePosition();
        expect(localThis.defaultPageNote.element.style.left).toBe('10px');
        expect(localThis.defaultPageNote.element.style.top).toBe('10px');
        
        localThis.defaultPageNote.destroy();
      });
    });
    
    describe('dragging', () => {
      it('should store page coordinates during drag', () => {
        pageNote.isDragging = true;
        pageNote.dragOffset = { x: 10, y: 10 };
        
        pageNote.handleDragMove({ clientX: 150, clientY: 250 });
        
        // Position should be stored as page coordinates
        // With no scroll: page = viewport, so pageX = 140, pageY = 240
        expect(pageNote.position.pageX).toBe(140);
        expect(pageNote.position.pageY).toBe(240);
      });
      
      it('should store page coordinates accounting for scroll during drag', () => {
        const localThis = {};
        localThis.originalScrollX = window.scrollX;
        localThis.originalScrollY = window.scrollY;
        Object.defineProperty(window, 'scrollX', { value: 50, writable: true });
        Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
        
        pageNote.isDragging = true;
        pageNote.dragOffset = { x: 10, y: 10 };
        
        pageNote.handleDragMove({ clientX: 150, clientY: 250 });
        
        // viewport = 140, 240; page = viewport + scroll = (190, 340)
        expect(pageNote.position.pageX).toBe(190);
        expect(pageNote.position.pageY).toBe(340);
        
        Object.defineProperty(window, 'scrollX', { value: localThis.originalScrollX, writable: true });
        Object.defineProperty(window, 'scrollY', { value: localThis.originalScrollY, writable: true });
      });
      
      it('should call onPositionChange when drag ends', () => {
        const localThis = {};
        localThis.onPositionChange = jest.fn();
        
        localThis.dragNote = new StickyNote({
          id: 'drag-page-note',
          anchor: null,
          selector: '__PAGE__',
          content: '',
          position: { pageX: 100, pageY: 200 },
          onPositionChange: localThis.onPositionChange
        });
        container.appendChild(localThis.dragNote.element);
        
        localThis.dragNote.isDragging = true;
        localThis.dragNote.position = { pageX: 150, pageY: 250 };
        localThis.dragNote.handleDragEnd();
        
        expect(localThis.onPositionChange).toHaveBeenCalledWith({ pageX: 150, pageY: 250 });
        
        localThis.dragNote.destroy();
      });
    });
    
    describe('handleWindowResize', () => {
      it('should always update position for page-level notes', () => {
        const localThis = {};
        localThis.updateSpy = jest.spyOn(pageNote, 'updatePosition');
        
        pageNote.handleWindowResize();
        
        expect(localThis.updateSpy).toHaveBeenCalled();
      });
    });
    
    describe('anchor highlight', () => {
      it('should not throw when hovering (no anchor to highlight)', () => {
        expect(() => {
          pageNote.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        }).not.toThrow();
      });
      
      it('should not throw when leaving (no anchor to unhighlight)', () => {
        expect(() => {
          pageNote.element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        }).not.toThrow();
      });
    });
  });
});
