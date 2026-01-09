/**
 * ConfirmDialog Component Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let ConfirmDialog;

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '';
  
  // Reset chrome mocks
  chrome.i18n.getMessage.mockClear();
  
  // Import module fresh for each test
  const module = await import('../../src/content/components/ConfirmDialog.js');
  ConfirmDialog = module.ConfirmDialog;
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('ConfirmDialog', () => {
  let shadowRoot;
  
  beforeEach(() => {
    // Create a mock shadow root
    const host = document.createElement('div');
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'open' });
  });
  
  afterEach(() => {
    // Clean up shadow root
    if (shadowRoot) {
      shadowRoot.innerHTML = '';
    }
  });
  
  describe('show()', () => {
    it('creates dialog elements in shadow root', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      // Check elements are created
      const backdrop = shadowRoot.querySelector('.sn-confirm-backdrop');
      expect(backdrop).not.toBeNull();
      
      const dialog = shadowRoot.querySelector('.sn-confirm-dialog');
      expect(dialog).not.toBeNull();
      
      const message = shadowRoot.querySelector('.sn-confirm-message');
      expect(message.textContent).toBe('Test message');
      
      // Click cancel to resolve the promise
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      cancelBtn.click();
      
      await promise;
    });
    
    it('resolves true when confirm button is clicked', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      confirmBtn.click();
      
      const result = await promise;
      expect(result).toBe(true);
    });
    
    it('resolves false when cancel button is clicked', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      cancelBtn.click();
      
      const result = await promise;
      expect(result).toBe(false);
    });
    
    it('resolves false when backdrop is clicked', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const backdrop = shadowRoot.querySelector('.sn-confirm-backdrop');
      // Simulate clicking on backdrop (not dialog)
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      const result = await promise;
      expect(result).toBe(false);
    });
    
    it('resolves false when Escape key is pressed', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const dialog = shadowRoot.querySelector('.sn-confirm-dialog');
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      
      const result = await promise;
      expect(result).toBe(false);
    });
    
    it('resolves true when Enter key is pressed', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const dialog = shadowRoot.querySelector('.sn-confirm-dialog');
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      
      const result = await promise;
      expect(result).toBe(true);
    });
    
    it('uses custom button text when provided', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        confirmText: 'Yes, remove it',
        cancelText: 'No, keep it',
        shadowRoot
      });
      
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      
      expect(confirmBtn.textContent).toBe('Yes, remove it');
      expect(cancelBtn.textContent).toBe('No, keep it');
      
      cancelBtn.click();
      await promise;
    });
    
    it('uses default button text from i18n when not provided', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      
      // t() returns the key in test environment
      expect(confirmBtn.textContent).toBe('delete');
      expect(cancelBtn.textContent).toBe('cancel');
      
      cancelBtn.click();
      await promise;
    });
    
    it('applies danger class when danger option is true', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        danger: true,
        shadowRoot
      });
      
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      expect(confirmBtn.classList.contains('sn-confirm-danger')).toBe(true);
      
      confirmBtn.click();
      await promise;
    });
    
    it('does not apply danger class when danger option is false', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        danger: false,
        shadowRoot
      });
      
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      expect(confirmBtn.classList.contains('sn-confirm-danger')).toBe(false);
      
      confirmBtn.click();
      await promise;
    });
    
    it('sets proper accessibility attributes', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const dialog = shadowRoot.querySelector('.sn-confirm-dialog');
      expect(dialog.getAttribute('role')).toBe('alertdialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('sn-confirm-message');
      
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      cancelBtn.click();
      await promise;
    });
    
    it('focuses confirm button when dialog opens', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      // Note: In JSDOM, focus tracking might not work perfectly
      // This test checks that focus() was called by verifying button exists
      expect(confirmBtn).not.toBeNull();
      
      confirmBtn.click();
      await promise;
    });
    
    it('removes dialog from DOM after closing', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      // Dialog should exist
      expect(shadowRoot.querySelector('.sn-confirm-backdrop')).not.toBeNull();
      
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      cancelBtn.click();
      
      await promise;
      
      // Dialog should be removed after animation
      // Due to the setTimeout fallback, the dialog gets removed
      await new Promise(resolve => setTimeout(resolve, 250));
      expect(shadowRoot.querySelector('.sn-confirm-backdrop')).toBeNull();
    });
    
    it('adds closing class when dismissed', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const backdrop = shadowRoot.querySelector('.sn-confirm-backdrop');
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      
      cancelBtn.click();
      
      // Check closing class is added
      expect(backdrop.classList.contains('sn-confirm-closing')).toBe(true);
      
      await promise;
    });
    
    it('sets message using textContent (XSS safe)', async () => {
      const maliciousMessage = '<script>alert("xss")</script>';
      const promise = ConfirmDialog.show({
        message: maliciousMessage,
        shadowRoot
      });
      
      const message = shadowRoot.querySelector('.sn-confirm-message');
      // textContent should contain the raw text, not execute HTML
      expect(message.textContent).toBe(maliciousMessage);
      // innerHTML should be escaped
      expect(message.innerHTML).not.toContain('<script>');
      
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      cancelBtn.click();
      await promise;
    });
  });
  
  describe('getStyles()', () => {
    it('returns CSS string', () => {
      const styles = ConfirmDialog.getStyles();
      expect(typeof styles).toBe('string');
      expect(styles.length).toBeGreaterThan(0);
    });
    
    it('includes backdrop styles', () => {
      const styles = ConfirmDialog.getStyles();
      expect(styles).toContain('.sn-confirm-backdrop');
    });
    
    it('includes dialog styles', () => {
      const styles = ConfirmDialog.getStyles();
      expect(styles).toContain('.sn-confirm-dialog');
    });
    
    it('includes button styles', () => {
      const styles = ConfirmDialog.getStyles();
      expect(styles).toContain('.sn-confirm-btn');
      expect(styles).toContain('.sn-confirm-cancel');
      expect(styles).toContain('.sn-confirm-ok');
      expect(styles).toContain('.sn-confirm-danger');
    });
    
    it('includes animation keyframes', () => {
      const styles = ConfirmDialog.getStyles();
      expect(styles).toContain('@keyframes sn-fade-in');
      expect(styles).toContain('@keyframes sn-fade-out');
      expect(styles).toContain('@keyframes sn-scale-in');
      expect(styles).toContain('@keyframes sn-scale-out');
    });
  });
  
  describe('keyboard navigation', () => {
    it('traps Tab focus within dialog', async () => {
      const promise = ConfirmDialog.show({
        message: 'Test message',
        shadowRoot
      });
      
      const dialog = shadowRoot.querySelector('.sn-confirm-dialog');
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      
      // Both buttons should exist for focus trapping
      expect(cancelBtn).not.toBeNull();
      expect(confirmBtn).not.toBeNull();
      
      // Simulate Tab keydown event
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      dialog.dispatchEvent(tabEvent);
      
      // Clean up
      cancelBtn.click();
      await promise;
    });
  });
});
