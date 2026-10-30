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

  afterEach(() => {
    // Destroy any selection overlay so its document-level listeners do not leak between tests
    localThis.ui.disableSelectionMode();
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
    it('should skip when already in selection mode', () => {
      localThis.ui.isSelectionMode = true;
      localThis.ui.enableSelectionMode();

      expect(document.body.classList.contains('sn-selection-mode')).toBe(false);
      expect(localThis.ui.selectionOverlay).toBeFalsy();
    });

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
    
    it('should invoke reload when refresh button is clicked', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      localThis.ui.showRefreshNotification();

      expect(() => document.getElementById('sn-refresh-btn').click()).not.toThrow();
      errSpy.mockRestore();
    });

    it('should fade out and remove notification when dismissed', () => {
      localThis.ui.showRefreshNotification();
      const notification = document.getElementById('sticky-notes-refresh-notification');

      document.getElementById('sn-dismiss-refresh-btn').click();

      expect(notification.style.opacity).toBe('0');
      expect(notification.style.transform).toBe('translateX(100%)');
      jest.advanceTimersByTime(300);
      expect(document.getElementById('sticky-notes-refresh-notification')).toBeNull();
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

  describe('applyPreferencesStyles errors', () => {
    it('should swallow errors when the shadow root is not initialized', async () => {
      const fresh = new UIManager({ onElementSelect: jest.fn() });
      fresh.shadowRoot = null;

      await expect(fresh.applyPreferencesStyles()).resolves.toBeUndefined();
    });
  });

  describe('applyPreferencesStyles with stored preferences', () => {
    it('should set note width and font size CSS variables', async () => {
      global.chrome.storage = {
        sync: {
          get: jest.fn().mockResolvedValue({ preferences: { noteWidth: 360, fontSize: 'large' } })
        }
      };
      localThis.ui.createShadowContainer();
      await localThis.ui.applyPreferencesStyles();

      const host = localThis.ui.shadowRoot.host;
      expect(host.style.getPropertyValue('--sn-note-width')).toBe('360px');
      expect(host.style.getPropertyValue('--sn-font-size')).toBe('16px');
    });
  });

  describe('selection overlay callbacks', () => {
    it('should route overlay onSelect to handleElementSelect', () => {
      localThis.ui.createShadowContainer();
      const selectSpy = jest.spyOn(localThis.ui, 'handleElementSelect').mockResolvedValue();
      localThis.ui.enableSelectionMode();
      const element = document.createElement('div');

      localThis.ui.selectionOverlay.onSelect(element);

      expect(selectSpy).toHaveBeenCalledWith(element);
    });

    it('should route overlay onCancel to disableSelectionModeAllFrames', () => {
      localThis.ui.createShadowContainer();
      localThis.ui.enableSelectionMode();

      localThis.ui.selectionOverlay.onCancel();

      expect(localThis.ui.isSelectionMode).toBe(false);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'broadcastDisableSelectionMode' });
    });

    it('should invoke the sendMessage catch callback without throwing', () => {
      localThis.ui.createShadowContainer();
      chrome.runtime.sendMessage.mockReturnValue({
        catch: (callback) => callback(new Error('no receiver'))
      });

      expect(() => localThis.ui.disableSelectionModeAllFrames()).not.toThrow();
    });

    it('should disable selection mode without an overlay', () => {
      localThis.ui.isSelectionMode = true;
      localThis.ui.selectionOverlay = null;

      localThis.ui.disableSelectionMode();

      expect(localThis.ui.isSelectionMode).toBe(false);
    });
  });

  describe('banner and tooltip timers when container changed', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      localThis.ui.createShadowContainer();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not remove a banner that was already detached before the timeout', () => {
      const banner = document.createElement('div');
      localThis.ui.container.appendChild(banner);

      localThis.ui.dismissBanner(banner);
      localThis.ui.container.removeChild(banner);

      expect(() => jest.advanceTimersByTime(400)).not.toThrow();
    });

    it('should skip tooltip fade when it was already removed', () => {
      localThis.ui.startReanchorMode({ id: 'note-1' });
      const tooltip = localThis.ui.container.querySelector('.sn-instruction-tooltip');
      tooltip.remove();

      jest.advanceTimersByTime(3500);

      expect(tooltip.classList.contains('sn-instruction-tooltip-hiding')).toBe(false);
    });

    it('should skip tooltip removal when it was removed during the fade', () => {
      localThis.ui.startReanchorMode({ id: 'note-1' });
      const tooltip = localThis.ui.container.querySelector('.sn-instruction-tooltip');

      jest.advanceTimersByTime(3100);
      expect(tooltip.classList.contains('sn-instruction-tooltip-hiding')).toBe(true);
      tooltip.remove();

      expect(() => jest.advanceTimersByTime(600)).not.toThrow();
    });

    it('should handle banner content that is missing', () => {
      localThis.ui.showReanchorUI({ id: 'note-nc' });

      const banner = localThis.ui.container.querySelector('.sn-banner');
      expect(banner).toBeTruthy();
    });
  });

  describe('refresh notification hover effects', () => {
    it('should change button backgrounds on hover', () => {
      localThis.ui.showRefreshNotification();
      const refreshBtn = document.getElementById('sn-refresh-btn');
      const dismissBtn = document.getElementById('sn-dismiss-refresh-btn');

      refreshBtn.dispatchEvent(new Event('mouseenter'));
      expect(refreshBtn.style.background).toBe('rgb(37, 99, 235)');
      refreshBtn.dispatchEvent(new Event('mouseleave'));
      expect(refreshBtn.style.background).toBe('rgb(59, 130, 246)');

      dismissBtn.dispatchEvent(new Event('mouseenter'));
      expect(dismissBtn.style.background).toBe('rgb(229, 231, 235)');
      dismissBtn.dispatchEvent(new Event('mouseleave'));
      expect(dismissBtn.style.background).toBe('rgb(243, 244, 246)');
    });
  });

  describe('setupMutationObserver edge cases', () => {
    it('should work when noteManager argument is omitted', () => {
      const notes = new Map();

      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager);

      expect(() => localThis.observerCallback([])).not.toThrow();
    });

    it('should handle a note whose anchor is null', () => {
      const note = {
        id: 'note-null-anchor',
        selector: '.does-not-exist-anywhere',
        anchor: null,
        updateAnchor: jest.fn()
      };
      const notes = new Map([[note.id, note]]);

      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
      localThis.observerCallback([]);

      expect(note.updateAnchor).not.toHaveBeenCalled();
    });

    it('should handle an anchor without text content', () => {
      const match = document.createElement('div');
      match.className = 'sn-empty-text';
      document.body.appendChild(match);
      const note = {
        id: 'note-notext',
        selector: '.sn-empty-text',
        anchor: document.createElement('div'),
        updateAnchor: jest.fn()
      };
      const notes = new Map([[note.id, note]]);

      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
      localThis.observerCallback([]);

      expect(note.updateAnchor).toHaveBeenCalledWith(match);
    });

    it('should keep the first match when findBestMatch returns null', () => {
      const first = document.createElement('div');
      first.className = 'sn-multi';
      first.textContent = 'A';
      const second = document.createElement('div');
      second.className = 'sn-multi';
      second.textContent = 'B';
      document.body.appendChild(first);
      document.body.appendChild(second);
      const oldAnchor = document.createElement('div');
      oldAnchor.textContent = 'Z';
      localThis.noteManager.selectorEngine.findBestMatch.mockReturnValueOnce(null);
      const note = {
        id: 'note-nobest',
        selector: '.sn-multi',
        anchor: oldAnchor,
        updateAnchor: jest.fn()
      };
      const notes = new Map([[note.id, note]]);

      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
      localThis.observerCallback([]);

      expect(note.updateAnchor).toHaveBeenCalledWith(first);
    });

    it('should handle matching elements with empty text content', () => {
      const first = document.createElement('div');
      first.className = 'sn-multi3';
      const second = document.createElement('div');
      second.className = 'sn-multi3';
      second.textContent = 'Z';
      document.body.appendChild(first);
      document.body.appendChild(second);
      const oldAnchor = document.createElement('div');
      oldAnchor.textContent = 'Z';
      const note = {
        id: 'note-emptymatch',
        selector: '.sn-multi3',
        anchor: oldAnchor,
        updateAnchor: jest.fn()
      };
      const notes = new Map([[note.id, note]]);

      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, localThis.noteManager);
      localThis.observerCallback([]);

      expect(note.updateAnchor).toHaveBeenCalledWith(second);
    });

    it('should skip disambiguation when noteManager has no selectorEngine', () => {
      const first = document.createElement('div');
      first.className = 'sn-multi2';
      first.textContent = 'A';
      const second = document.createElement('div');
      second.className = 'sn-multi2';
      second.textContent = 'B';
      document.body.appendChild(first);
      document.body.appendChild(second);
      const oldAnchor = document.createElement('div');
      oldAnchor.textContent = 'Z';
      const note = {
        id: 'note-noengine',
        selector: '.sn-multi2',
        anchor: oldAnchor,
        updateAnchor: jest.fn()
      };
      const notes = new Map([[note.id, note]]);

      localThis.ui.setupMutationObserver(notes, localThis.visibilityManager, { checkPendingNotes: jest.fn() });
      localThis.observerCallback([]);

      expect(note.updateAnchor).toHaveBeenCalledWith(first);
    });
  });
});

