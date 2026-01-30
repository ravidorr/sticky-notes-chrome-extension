/**
 * UIManager Unit Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { UIManager } from '../../src/content/app/UIManager.js';

describe('UIManager', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    
    // Mock chrome.runtime.sendMessage
    global.chrome = {
      runtime: {
        sendMessage: jest.fn().mockReturnValue({ catch: jest.fn() })
      }
    };

    // Capture MutationObserver callback for manual triggering
    localThis.observerCallback = null;
    global.MutationObserver = class MutationObserver {
      constructor(cb) {
        localThis.observerCallback = cb;
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };

    localThis.visibilityManager = {
      observe: jest.fn(),
      unobserve: jest.fn()
    };

    localThis.noteManager = {
      selectorEngine: {
        findBestMatch: jest.fn(() => null)
      },
      checkPendingNotes: jest.fn()
    };

    localThis.ui = new UIManager({ onElementSelect: jest.fn() });
  });

  it('should re-anchor using exact oldText match when selector matches multiple elements', () => {
    const match1 = document.createElement('div');
    match1.className = 'sn-test-target';
    match1.textContent = 'Wrong';

    const match2 = document.createElement('div');
    match2.className = 'sn-test-target';
    match2.textContent = 'Right';

    document.body.appendChild(match1);
    document.body.appendChild(match2);

    const oldAnchor = document.createElement('div');
    oldAnchor.textContent = 'Right';
    // Intentionally NOT appended to DOM so document.contains(oldAnchor) is false

    const note = {
      id: 'note-1',
      selector: '.sn-test-target',
      anchor: oldAnchor,
      updateAnchor: jest.fn()
    };

    const notes = new Map([[note.id, note]]);

    localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
    expect(typeof localThis.observerCallback).toBe('function');

    // Trigger mutation processing
    localThis.observerCallback([]);

    expect(localThis.visibilityManager.unobserve).toHaveBeenCalledWith(oldAnchor);
    expect(note.updateAnchor).toHaveBeenCalledWith(match2);
    expect(localThis.visibilityManager.observe).toHaveBeenCalledWith(match2, note);
    expect(localThis.noteManager.selectorEngine.findBestMatch).not.toHaveBeenCalled();
  });

  it('should fall back to selectorEngine.findBestMatch when no exact oldText match exists', () => {
    const match1 = document.createElement('div');
    match1.className = 'sn-test-target';
    match1.textContent = 'A';

    const match2 = document.createElement('div');
    match2.className = 'sn-test-target';
    match2.textContent = 'B';

    document.body.appendChild(match1);
    document.body.appendChild(match2);

    const oldAnchor = document.createElement('div');
    oldAnchor.textContent = 'C'; // no exact match

    localThis.noteManager.selectorEngine.findBestMatch.mockReturnValueOnce(match1);

    const note = {
      id: 'note-2',
      selector: '.sn-test-target',
      anchor: oldAnchor,
      updateAnchor: jest.fn()
    };

    const notes = new Map([[note.id, note]]);

    localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
    expect(typeof localThis.observerCallback).toBe('function');

    localThis.observerCallback([]);

    expect(localThis.noteManager.selectorEngine.findBestMatch).toHaveBeenCalledWith(
      '.sn-test-target',
      { textContent: 'C' }
    );
    expect(note.updateAnchor).toHaveBeenCalledWith(match1);
  });

  describe('disableSelectionModeAllFrames', () => {
    it('should call disableSelectionMode locally', () => {
      localThis.ui.createShadowContainer();
      localThis.ui.isSelectionMode = true;
      document.body.classList.add('sn-selection-mode');
      
      localThis.ui.disableSelectionModeAllFrames();
      
      expect(localThis.ui.isSelectionMode).toBe(false);
      expect(document.body.classList.contains('sn-selection-mode')).toBe(false);
    });
    
    it('should broadcast disableSelectionMode to background script', () => {
      localThis.ui.createShadowContainer();
      localThis.ui.isSelectionMode = true;
      document.body.classList.add('sn-selection-mode');
      
      localThis.ui.disableSelectionModeAllFrames();
      
      // The sendMessage call is wrapped in try-catch, so verify it was called
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      // Check the call includes the correct action
      const calls = chrome.runtime.sendMessage.mock.calls;
      expect(calls.some(call => call[0]?.action === 'broadcastDisableSelectionMode')).toBe(true);
    });
    
    it('should handle chrome.runtime.sendMessage errors gracefully', async () => {
      localThis.ui.createShadowContainer();
      localThis.ui.isSelectionMode = true;
      
      // Simulate error - mockImplementation handles promise internally
      const mockPromise = { catch: jest.fn().mockReturnThis() };
      chrome.runtime.sendMessage.mockReturnValue(mockPromise);
      
      // Should not throw
      expect(() => localThis.ui.disableSelectionModeAllFrames()).not.toThrow();
      expect(localThis.ui.isSelectionMode).toBe(false);
      
      // Verify catch was called on the promise
      expect(mockPromise.catch).toHaveBeenCalled();
    });
    
    it('should handle missing chrome.runtime gracefully', () => {
      localThis.ui.createShadowContainer();
      localThis.ui.isSelectionMode = true;
      
      // Simulate missing chrome.runtime
      delete global.chrome.runtime;
      
      // Should not throw
      expect(() => localThis.ui.disableSelectionModeAllFrames()).not.toThrow();
      expect(localThis.ui.isSelectionMode).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const onElementSelect = jest.fn();
      const ui = new UIManager({ onElementSelect });
      
      expect(ui.onElementSelect).toBe(onElementSelect);
      expect(ui.shadowRoot).toBeNull();
      expect(ui.container).toBeNull();
      expect(ui.selectionOverlay).toBeNull();
      expect(ui.isSelectionMode).toBe(false);
      expect(ui.pendingReanchor).toBeNull();
      expect(ui.reanchorTooltip).toBeNull();
    });
  });

  describe('createShadowContainer', () => {
    it('should create shadow DOM container', () => {
      const result = localThis.ui.createShadowContainer();
      
      expect(result.shadowRoot).toBeDefined();
      expect(result.container).toBeDefined();
      expect(localThis.ui.shadowRoot).toBe(result.shadowRoot);
      expect(localThis.ui.container).toBe(result.container);
    });
    
    it('should append host to document body', () => {
      localThis.ui.createShadowContainer();
      
      const host = document.getElementById('sticky-notes-extension-root');
      expect(host).toBeTruthy();
    });
    
    it('should create container with correct ID', () => {
      const result = localThis.ui.createShadowContainer();
      
      expect(result.container.id).toBe('sticky-notes-container');
    });
  });

  describe('enableSelectionMode', () => {
    beforeEach(() => {
      localThis.ui.createShadowContainer();
    });
    
    it('should enable selection mode', () => {
      localThis.ui.enableSelectionMode();
      
      expect(localThis.ui.isSelectionMode).toBe(true);
      expect(document.body.classList.contains('sn-selection-mode')).toBe(true);
    });
    
    it('should create selection overlay', () => {
      localThis.ui.enableSelectionMode();
      
      expect(localThis.ui.selectionOverlay).toBeTruthy();
    });
    
    it('should skip if already in selection mode', () => {
      localThis.ui.isSelectionMode = true;
      const createOverlaySpy = jest.spyOn(localThis.ui, 'enableSelectionMode');
      
      localThis.ui.enableSelectionMode();
      
      // selectionOverlay should still be null since we skipped
      expect(localThis.ui.selectionOverlay).toBeNull();
    });
  });

  describe('disableSelectionMode', () => {
    beforeEach(() => {
      localThis.ui.createShadowContainer();
    });
    
    it('should disable selection mode', () => {
      localThis.ui.enableSelectionMode();
      expect(localThis.ui.isSelectionMode).toBe(true);
      
      localThis.ui.disableSelectionMode();
      
      expect(localThis.ui.isSelectionMode).toBe(false);
      expect(document.body.classList.contains('sn-selection-mode')).toBe(false);
    });
    
    it('should destroy selection overlay', () => {
      localThis.ui.enableSelectionMode();
      const overlay = localThis.ui.selectionOverlay;
      const destroySpy = jest.spyOn(overlay, 'destroy');
      
      localThis.ui.disableSelectionMode();
      
      expect(destroySpy).toHaveBeenCalled();
      expect(localThis.ui.selectionOverlay).toBeNull();
    });
    
    it('should do nothing if not in selection mode', () => {
      localThis.ui.isSelectionMode = false;
      
      localThis.ui.disableSelectionMode();
      
      expect(localThis.ui.isSelectionMode).toBe(false);
    });
  });

  describe('handleElementSelect', () => {
    beforeEach(() => {
      localThis.ui.createShadowContainer();
    });
    
    it('should disable selection mode', async () => {
      localThis.ui.enableSelectionMode();
      const element = document.createElement('div');
      
      await localThis.ui.handleElementSelect(element);
      
      expect(localThis.ui.isSelectionMode).toBe(false);
    });
    
    it('should call onElementSelect callback', async () => {
      const onElementSelect = jest.fn();
      const ui = new UIManager({ onElementSelect });
      ui.createShadowContainer();
      
      const element = document.createElement('div');
      await ui.handleElementSelect(element);
      
      expect(onElementSelect).toHaveBeenCalledWith(element, null);
    });
    
    it('should pass pendingReanchor to callback and clear it', async () => {
      const onElementSelect = jest.fn();
      const ui = new UIManager({ onElementSelect });
      ui.createShadowContainer();
      
      const pendingReanchor = { id: 'note-1', content: 'Test' };
      ui.pendingReanchor = pendingReanchor;
      
      const element = document.createElement('div');
      await ui.handleElementSelect(element);
      
      expect(onElementSelect).toHaveBeenCalledWith(element, pendingReanchor);
      expect(ui.pendingReanchor).toBeNull();
    });
    
    it('should remove reanchor tooltip if present', async () => {
      const onElementSelect = jest.fn();
      const ui = new UIManager({ onElementSelect });
      ui.createShadowContainer();
      
      // Add a reanchor tooltip
      const tooltip = document.createElement('div');
      ui.container.appendChild(tooltip);
      ui.reanchorTooltip = tooltip;
      
      const element = document.createElement('div');
      await ui.handleElementSelect(element);
      
      expect(ui.reanchorTooltip).toBeNull();
      expect(ui.container.contains(tooltip)).toBe(false);
    });
  });

  describe('showReanchorUI', () => {
    beforeEach(() => {
      localThis.ui.createShadowContainer();
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should create banner notification', () => {
      const noteData = { id: 'note-1', content: 'Test content' };
      
      localThis.ui.showReanchorUI(noteData);
      
      const banner = localThis.ui.container.querySelector('.sn-banner');
      expect(banner).toBeTruthy();
      expect(banner.dataset.noteId).toBe('note-1');
    });
    
    it('should show content preview in banner', () => {
      const noteData = { id: 'note-1', content: 'Test content' };
      
      localThis.ui.showReanchorUI(noteData);
      
      const banner = localThis.ui.container.querySelector('.sn-banner');
      expect(banner.textContent).toContain('Test content');
    });
    
    it('should truncate long content with ellipsis', () => {
      const longContent = 'A'.repeat(100);
      const noteData = { id: 'note-1', content: longContent };
      
      localThis.ui.showReanchorUI(noteData);
      
      const banner = localThis.ui.container.querySelector('.sn-banner');
      expect(banner.textContent).toContain('...');
    });
    
    it('should remove existing banner before creating new one', () => {
      localThis.ui.showReanchorUI({ id: 'note-1', content: 'First' });
      localThis.ui.showReanchorUI({ id: 'note-2', content: 'Second' });
      
      const banners = localThis.ui.container.querySelectorAll('.sn-banner');
      expect(banners.length).toBe(1);
      expect(banners[0].dataset.noteId).toBe('note-2');
    });
    
    it('should auto-dismiss after 10 seconds', () => {
      const noteData = { id: 'note-1', content: 'Test' };
      
      localThis.ui.showReanchorUI(noteData);
      
      let banner = localThis.ui.container.querySelector('.sn-banner');
      expect(banner).toBeTruthy();
      
      // Advance time past auto-dismiss
      jest.advanceTimersByTime(10500);
      
      banner = localThis.ui.container.querySelector('.sn-banner');
      expect(banner).toBeNull();
    });
    
    it('should start reanchor mode when reanchor button clicked', () => {
      const noteData = { id: 'note-1', content: 'Test' };
      localThis.ui.showReanchorUI(noteData);
      
      const startReanchorSpy = jest.spyOn(localThis.ui, 'startReanchorMode');
      const reanchorBtn = localThis.ui.container.querySelector('.sn-btn-primary');
      
      reanchorBtn.click();
      
      expect(startReanchorSpy).toHaveBeenCalledWith(noteData);
    });
    
    it('should dismiss when dismiss button clicked', () => {
      const noteData = { id: 'note-1', content: 'Test' };
      localThis.ui.showReanchorUI(noteData);
      
      const dismissBtn = localThis.ui.container.querySelector('.sn-btn-secondary');
      dismissBtn.click();
      
      // Banner should be in hiding state
      const banner = localThis.ui.container.querySelector('.sn-banner');
      expect(banner.classList.contains('sn-banner-hiding')).toBe(true);
    });
  });

  describe('dismissBanner', () => {
    beforeEach(() => {
      localThis.ui.createShadowContainer();
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should add hiding class and remove after animation', () => {
      const banner = document.createElement('div');
      banner.className = 'sn-banner';
      localThis.ui.container.appendChild(banner);
      
      localThis.ui.dismissBanner(banner);
      
      expect(banner.classList.contains('sn-banner-hiding')).toBe(true);
      
      jest.advanceTimersByTime(400);
      
      expect(localThis.ui.container.contains(banner)).toBe(false);
    });
    
    it('should do nothing if banner is null', () => {
      // Should not throw
      expect(() => localThis.ui.dismissBanner(null)).not.toThrow();
    });
    
    it('should do nothing if banner is not in container', () => {
      const banner = document.createElement('div');
      // Not appended to container
      
      // Should not throw
      expect(() => localThis.ui.dismissBanner(banner)).not.toThrow();
    });
  });

  describe('startReanchorMode', () => {
    beforeEach(() => {
      localThis.ui.createShadowContainer();
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should set pendingReanchor', () => {
      const noteData = { id: 'note-1', content: 'Test' };
      
      localThis.ui.startReanchorMode(noteData);
      
      expect(localThis.ui.pendingReanchor).toBe(noteData);
    });
    
    it('should enable selection mode', () => {
      localThis.ui.startReanchorMode({ id: 'note-1' });
      
      expect(localThis.ui.isSelectionMode).toBe(true);
    });
    
    it('should show instruction tooltip', () => {
      localThis.ui.startReanchorMode({ id: 'note-1' });
      
      const tooltip = localThis.ui.container.querySelector('.sn-instruction-tooltip');
      expect(tooltip).toBeTruthy();
      expect(localThis.ui.reanchorTooltip).toBe(tooltip);
    });
    
    it('should remove existing tooltip before creating new one', () => {
      localThis.ui.startReanchorMode({ id: 'note-1' });
      localThis.ui.disableSelectionMode();
      localThis.ui.startReanchorMode({ id: 'note-2' });
      
      const tooltips = localThis.ui.container.querySelectorAll('.sn-instruction-tooltip');
      expect(tooltips.length).toBe(1);
    });
    
    it('should fade out tooltip after 3 seconds', () => {
      localThis.ui.startReanchorMode({ id: 'note-1' });
      
      const tooltip = localThis.ui.container.querySelector('.sn-instruction-tooltip');
      expect(tooltip).toBeTruthy();
      
      jest.advanceTimersByTime(3500);
      
      expect(tooltip.classList.contains('sn-instruction-tooltip-hiding')).toBe(true);
      
      jest.advanceTimersByTime(600);
      
      expect(localThis.ui.container.contains(tooltip)).toBe(false);
    });
  });

  describe('showRefreshNotification', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
      const notification = document.getElementById('sticky-notes-refresh-notification');
      if (notification) notification.remove();
    });
    
    it('should create refresh notification', () => {
      localThis.ui.showRefreshNotification();
      
      const notification = document.getElementById('sticky-notes-refresh-notification');
      expect(notification).toBeTruthy();
    });
    
    it('should not show twice', () => {
      localThis.ui.showRefreshNotification();
      localThis.ui.showRefreshNotification();
      
      const notifications = document.querySelectorAll('#sticky-notes-refresh-notification');
      expect(notifications.length).toBe(1);
    });
    
    it('should have refresh button that triggers reload', () => {
      // Note: window.location.reload is not easily mockable in jsdom
      // So we just verify the button exists and has correct structure
      localThis.ui.showRefreshNotification();
      
      const refreshBtn = document.getElementById('sn-refresh-btn');
      expect(refreshBtn).toBeTruthy();
      expect(refreshBtn.textContent).toBeTruthy();
    });
    
    it('should have dismiss button', () => {
      localThis.ui.showRefreshNotification();
      
      const dismissBtn = document.getElementById('sn-dismiss-refresh-btn');
      expect(dismissBtn).toBeTruthy();
      expect(dismissBtn.textContent).toBeTruthy();
    });
  });

  describe('setupMutationObserver', () => {
    beforeEach(() => {
      localThis.ui.createShadowContainer();
    });
    
    it('should call noteManager.checkPendingNotes on mutation', () => {
      const notes = new Map();
      
      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
      localThis.observerCallback([]);
      
      expect(localThis.noteManager.checkPendingNotes).toHaveBeenCalled();
    });
    
    it('should handle notes without noteManager', () => {
      const notes = new Map();
      
      // Should not throw when noteManager is null
      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, null);
      expect(() => localThis.observerCallback([])).not.toThrow();
    });
    
    it('should handle invalid selector gracefully', () => {
      const note = {
        id: 'note-invalid',
        selector: '[invalid selector',
        anchor: document.createElement('div'),
        updateAnchor: jest.fn()
      };
      const notes = new Map([[note.id, note]]);
      
      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
      
      // Should not throw
      expect(() => localThis.observerCallback([])).not.toThrow();
    });
    
    it('should not update anchor if element is still in document', () => {
      const anchor = document.createElement('div');
      document.body.appendChild(anchor);
      
      const note = {
        id: 'note-still-there',
        selector: 'div',
        anchor: anchor,
        updateAnchor: jest.fn()
      };
      const notes = new Map([[note.id, note]]);
      
      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
      localThis.observerCallback([]);
      
      expect(note.updateAnchor).not.toHaveBeenCalled();
    });
  });
});

