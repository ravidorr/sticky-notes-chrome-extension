/**
 * NotificationManager Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let NotificationManager;

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '';
  
  // Reset chrome mocks
  chrome.i18n.getMessage.mockClear();
  
  // Use fake timers
  jest.useFakeTimers();
  
  // Import module fresh for each test
  const module = await import('../../src/content/components/NotificationManager.js');
  NotificationManager = module.NotificationManager;
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('NotificationManager', () => {
  let container;
  let notificationManager;

  beforeEach(() => {
    // Create a container element
    container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
    
    notificationManager = new NotificationManager(container);
  });

  describe('constructor', () => {
    it('should create instance with container', () => {
      expect(notificationManager).toBeDefined();
      expect(notificationManager.container).toBe(container);
    });
  });

  describe('showToast', () => {
    it('should create a toast element', () => {
      notificationManager.showToast('Test message', 'success');
      
      const toast = container.querySelector('.sn-toast');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toBe('Test message');
    });

    it('should apply success class for success type', () => {
      notificationManager.showToast('Success!', 'success');
      
      const toast = container.querySelector('.sn-toast');
      expect(toast.classList.contains('sn-toast-success')).toBe(true);
    });

    it('should apply error class for error type', () => {
      notificationManager.showToast('Error!', 'error');
      
      const toast = container.querySelector('.sn-toast');
      expect(toast.classList.contains('sn-toast-error')).toBe(true);
    });

    it('should apply warning class for warning type', () => {
      notificationManager.showToast('Warning!', 'warning');
      
      const toast = container.querySelector('.sn-toast');
      expect(toast.classList.contains('sn-toast-warning')).toBe(true);
    });

    it('should remove existing toast before creating new one', () => {
      notificationManager.showToast('First');
      notificationManager.showToast('Second');
      
      const toasts = container.querySelectorAll('.sn-toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toBe('Second');
    });

    it('should auto-dismiss after duration', () => {
      notificationManager.showToast('Test', 'success', 3000);
      
      expect(container.querySelector('.sn-toast')).not.toBeNull();
      
      // Fast forward past duration
      jest.advanceTimersByTime(3000);
      
      // Toast should have hiding class
      const toast = container.querySelector('.sn-toast');
      expect(toast.classList.contains('sn-toast-hiding')).toBe(true);
      
      // Fast forward for fade animation
      jest.advanceTimersByTime(300);
      
      expect(container.querySelector('.sn-toast')).toBeNull();
    });

    it('should have accessibility attributes', () => {
      notificationManager.showToast('Accessible message');
      
      const toast = container.querySelector('.sn-toast');
      expect(toast.getAttribute('role')).toBe('alert');
      expect(toast.getAttribute('aria-live')).toBe('polite');
    });

    it('should return the toast element', () => {
      const toast = notificationManager.showToast('Test');
      expect(toast).toBeInstanceOf(HTMLElement);
      expect(toast.classList.contains('sn-toast')).toBe(true);
    });
  });

  describe('showModal', () => {
    it('should create a modal overlay', async () => {
      const promise = notificationManager.showModal({
        title: 'Test Title',
        message: 'Test message',
        confirmText: 'OK',
        cancelText: 'Cancel'
      });
      
      const overlay = container.querySelector('.sn-modal-overlay');
      expect(overlay).not.toBeNull();
      
      const modal = container.querySelector('.sn-modal');
      expect(modal).not.toBeNull();
      
      // Click cancel to resolve
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      
      await promise;
    });

    it('should display title when provided', async () => {
      const promise = notificationManager.showModal({
        title: 'My Title',
        message: 'Message'
      });
      
      const title = container.querySelector('.sn-modal-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toBe('My Title');
      
      // Cancel to resolve
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('should display message', async () => {
      const promise = notificationManager.showModal({
        message: 'Test message content'
      });
      
      const message = container.querySelector('.sn-modal-message');
      expect(message).not.toBeNull();
      expect(message.textContent).toBe('Test message content');
      
      // Cancel to resolve
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('should show input field when inputPlaceholder provided', async () => {
      const promise = notificationManager.showModal({
        message: 'Enter value',
        inputPlaceholder: 'Type here...',
        inputValue: 'default'
      });
      
      const input = container.querySelector('.sn-modal-input');
      expect(input).not.toBeNull();
      expect(input.placeholder).toBe('Type here...');
      expect(input.value).toBe('default');
      
      // Cancel to resolve
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('should resolve with confirmed: true when confirm clicked', async () => {
      const promise = notificationManager.showModal({
        message: 'Confirm?'
      });
      
      container.querySelector('.sn-btn-primary').click();
      jest.advanceTimersByTime(200);
      
      const result = await promise;
      expect(result.confirmed).toBe(true);
    });

    it('should resolve with confirmed: false when cancel clicked', async () => {
      const promise = notificationManager.showModal({
        message: 'Confirm?'
      });
      
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      
      const result = await promise;
      expect(result.confirmed).toBe(false);
    });

    it('should resolve with input value when confirmed', async () => {
      const promise = notificationManager.showModal({
        message: 'Enter value',
        inputPlaceholder: 'Type...',
        inputValue: ''
      });
      
      const input = container.querySelector('.sn-modal-input');
      input.value = 'user input';
      
      container.querySelector('.sn-btn-primary').click();
      jest.advanceTimersByTime(200);
      
      const result = await promise;
      expect(result.confirmed).toBe(true);
      expect(result.value).toBe('user input');
    });

    it('should apply danger class when danger option is true', async () => {
      const promise = notificationManager.showModal({
        message: 'Delete?',
        danger: true
      });
      
      const confirmBtn = container.querySelector('.sn-btn-primary, .sn-btn-danger');
      expect(confirmBtn.classList.contains('sn-btn-danger')).toBe(true);
      
      confirmBtn.click();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('should apply yellow theme when yellowTheme option is true', async () => {
      const promise = notificationManager.showModal({
        message: 'Yellow modal',
        yellowTheme: true
      });
      
      const modal = container.querySelector('.sn-modal');
      expect(modal.classList.contains('sn-modal-yellow')).toBe(true);
      
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('should close on backdrop click', async () => {
      const promise = notificationManager.showModal({
        message: 'Click outside'
      });
      
      const overlay = container.querySelector('.sn-modal-overlay');
      overlay.click(); // Click on overlay (backdrop)
      jest.advanceTimersByTime(200);
      
      const result = await promise;
      expect(result.confirmed).toBe(false);
    });

    it('should have accessibility attributes', async () => {
      const promise = notificationManager.showModal({
        message: 'Accessible modal'
      });
      
      const modal = container.querySelector('.sn-modal');
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('should apply custom zIndex when provided', async () => {
      const promise = notificationManager.showModal({
        message: 'Custom z-index',
        zIndex: 999999
      });
      
      const overlay = container.querySelector('.sn-modal-overlay');
      expect(overlay.style.zIndex).toBe('999999');
      
      container.querySelector('.sn-btn-secondary').click();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('should close on Escape key press', async () => {
      const promise = notificationManager.showModal({
        message: 'Press Escape'
      });
      
      const overlay = container.querySelector('.sn-modal-overlay');
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      event.preventDefault = jest.fn();
      overlay.dispatchEvent(event);
      
      jest.advanceTimersByTime(200);
      
      const result = await promise;
      expect(result.confirmed).toBe(false);
    });

    it('should submit on Enter key in input field', async () => {
      const promise = notificationManager.showModal({
        message: 'Enter value',
        inputPlaceholder: 'Type here'
      });
      
      const input = container.querySelector('.sn-modal-input');
      input.value = 'submitted value';
      
      const overlay = container.querySelector('.sn-modal-overlay');
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      Object.defineProperty(event, 'target', { value: input });
      event.preventDefault = jest.fn();
      overlay.dispatchEvent(event);
      
      jest.advanceTimersByTime(200);
      
      const result = await promise;
      expect(result.confirmed).toBe(true);
      expect(result.value).toBe('submitted value');
    });
  });

  describe('showBanner', () => {
    it('should create a banner element', () => {
      notificationManager.showBanner({
        title: 'Banner Title',
        message: 'Banner message'
      });
      
      const banner = container.querySelector('.sn-banner');
      expect(banner).not.toBeNull();
    });

    it('should display title and message', () => {
      notificationManager.showBanner({
        title: 'Test Title',
        message: 'Test Message'
      });
      
      const title = container.querySelector('.sn-banner-title');
      const message = container.querySelector('.sn-banner-message');
      
      expect(title.textContent).toBe('Test Title');
      expect(message.textContent).toBe('Test Message');
    });

    it('should apply warning class for warning type', () => {
      notificationManager.showBanner({
        title: 'Warning',
        message: 'Warning message',
        type: 'warning'
      });
      
      const banner = container.querySelector('.sn-banner');
      expect(banner.classList.contains('sn-banner-warning')).toBe(true);
    });

    it('should render action buttons', () => {
      const onClick = jest.fn();
      
      notificationManager.showBanner({
        title: 'Actions',
        message: 'With buttons',
        actions: [
          { text: 'Primary', primary: true, onClick },
          { text: 'Secondary', onClick }
        ]
      });
      
      const buttons = container.querySelectorAll('.sn-banner-actions button');
      expect(buttons.length).toBe(2);
      expect(buttons[0].textContent).toBe('Primary');
      expect(buttons[0].classList.contains('sn-btn-primary')).toBe(true);
      expect(buttons[1].textContent).toBe('Secondary');
    });

    it('should call action onClick and dismiss banner', () => {
      const onClick = jest.fn();
      
      notificationManager.showBanner({
        title: 'Test',
        message: 'Test',
        actions: [{ text: 'Click Me', onClick }]
      });
      
      const button = container.querySelector('.sn-banner-actions button');
      button.click();
      
      expect(onClick).toHaveBeenCalled();
      
      // Banner should be dismissing
      const banner = container.querySelector('.sn-banner');
      expect(banner.classList.contains('sn-banner-hiding')).toBe(true);
    });

    it('should auto-dismiss after duration', () => {
      notificationManager.showBanner({
        title: 'Auto dismiss',
        message: 'Will disappear',
        duration: 5000
      });
      
      expect(container.querySelector('.sn-banner')).not.toBeNull();
      
      jest.advanceTimersByTime(5000);
      
      const banner = container.querySelector('.sn-banner');
      expect(banner.classList.contains('sn-banner-hiding')).toBe(true);
      
      jest.advanceTimersByTime(300);
      expect(container.querySelector('.sn-banner')).toBeNull();
    });

    it('should remove existing banner before creating new one', () => {
      notificationManager.showBanner({ title: 'First', message: 'First' });
      notificationManager.showBanner({ title: 'Second', message: 'Second' });
      
      const banners = container.querySelectorAll('.sn-banner');
      expect(banners.length).toBe(1);
      expect(container.querySelector('.sn-banner-title').textContent).toBe('Second');
    });

    it('should return the banner element', () => {
      const banner = notificationManager.showBanner({
        title: 'Test',
        message: 'Test'
      });
      
      expect(banner).toBeInstanceOf(HTMLElement);
      expect(banner.classList.contains('sn-banner')).toBe(true);
    });
  });

  describe('showInstructionTooltip', () => {
    it('should create an instruction tooltip', () => {
      notificationManager.showInstructionTooltip({
        title: 'Instruction Title',
        hint: 'Some hint',
        escape: 'Press ESC'
      });
      
      const tooltip = container.querySelector('.sn-instruction-tooltip');
      expect(tooltip).not.toBeNull();
    });

    it('should display title, hint, and escape text', () => {
      notificationManager.showInstructionTooltip({
        title: 'Title',
        hint: 'Hint',
        escape: 'ESC to cancel'
      });
      
      const title = container.querySelector('.sn-instruction-tooltip-title');
      const hint = container.querySelector('.sn-instruction-tooltip-hint');
      const escape = container.querySelector('.sn-instruction-tooltip-escape');
      
      expect(title.textContent).toBe('Title');
      expect(hint.textContent).toBe('Hint');
      expect(escape.textContent).toBe('ESC to cancel');
    });

    it('should auto-hide after duration', () => {
      notificationManager.showInstructionTooltip({
        title: 'Test',
        duration: 3000
      });
      
      expect(container.querySelector('.sn-instruction-tooltip')).not.toBeNull();
      
      jest.advanceTimersByTime(3000);
      
      const tooltip = container.querySelector('.sn-instruction-tooltip');
      expect(tooltip.classList.contains('sn-instruction-tooltip-hiding')).toBe(true);
      
      jest.advanceTimersByTime(500);
      expect(container.querySelector('.sn-instruction-tooltip')).toBeNull();
    });

    it('should remove existing tooltip before creating new one', () => {
      notificationManager.showInstructionTooltip({ title: 'First' });
      notificationManager.showInstructionTooltip({ title: 'Second' });
      
      const tooltips = container.querySelectorAll('.sn-instruction-tooltip');
      expect(tooltips.length).toBe(1);
    });
  });

  describe('hideInstructionTooltip', () => {
    it('should hide the instruction tooltip', () => {
      notificationManager.showInstructionTooltip({
        title: 'Test',
        duration: 0 // No auto-hide
      });
      
      expect(container.querySelector('.sn-instruction-tooltip')).not.toBeNull();
      
      notificationManager.hideInstructionTooltip();
      
      const tooltip = container.querySelector('.sn-instruction-tooltip');
      expect(tooltip.classList.contains('sn-instruction-tooltip-hiding')).toBe(true);
      
      jest.advanceTimersByTime(500);
      expect(container.querySelector('.sn-instruction-tooltip')).toBeNull();
    });
  });

  describe('showInlinePopup', () => {
    let anchor;

    beforeEach(() => {
      anchor = document.createElement('div');
      anchor.id = 'anchor';
      container.appendChild(anchor);
    });

    it('should create an inline popup', () => {
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Enter value'
      });
      
      const popup = anchor.querySelector('.sn-inline-popup');
      expect(popup).not.toBeNull();
    });

    it('should have input with placeholder', () => {
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Type here',
        inputValue: 'initial'
      });
      
      const input = anchor.querySelector('.sn-inline-popup-input');
      expect(input.placeholder).toBe('Type here');
      expect(input.value).toBe('initial');
    });

    it('should call onConfirm with input value', () => {
      const onConfirm = jest.fn();
      
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Enter',
        onConfirm
      });
      
      const input = anchor.querySelector('.sn-inline-popup-input');
      input.value = 'test value';
      
      const confirmBtn = anchor.querySelector('.sn-btn-primary');
      confirmBtn.click();
      
      expect(onConfirm).toHaveBeenCalledWith('test value');
    });

    it('should call onCancel when cancel clicked', () => {
      const onCancel = jest.fn();
      
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Enter',
        onCancel
      });
      
      const cancelBtn = anchor.querySelector('.sn-btn-secondary');
      cancelBtn.click();
      
      expect(onCancel).toHaveBeenCalled();
    });

    it('should remove popup after confirm', () => {
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Enter',
        onConfirm: jest.fn()
      });
      
      const confirmBtn = anchor.querySelector('.sn-btn-primary');
      confirmBtn.click();
      
      expect(anchor.querySelector('.sn-inline-popup')).toBeNull();
    });

    it('should remove existing popup before creating new one', () => {
      notificationManager.showInlinePopup({ anchor, inputPlaceholder: 'First' });
      notificationManager.showInlinePopup({ anchor, inputPlaceholder: 'Second' });
      
      const popups = anchor.querySelectorAll('.sn-inline-popup');
      expect(popups.length).toBe(1);
    });

    it('should use i18n for button text', () => {
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Enter'
      });
      
      const buttons = anchor.querySelectorAll('.sn-btn');
      // Check that buttons have text (from i18n mock)
      expect(buttons[0].textContent).toBeTruthy();
      expect(buttons[1].textContent).toBeTruthy();
    });

    it('should submit on Enter key in input field', () => {
      const onConfirm = jest.fn();
      
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Enter value',
        onConfirm
      });
      
      const input = anchor.querySelector('.sn-inline-popup-input');
      input.value = 'enter pressed';
      
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      event.preventDefault = jest.fn();
      input.dispatchEvent(event);
      
      expect(onConfirm).toHaveBeenCalledWith('enter pressed');
      expect(anchor.querySelector('.sn-inline-popup')).toBeNull();
    });

    it('should cancel on Escape key in input field', () => {
      const onCancel = jest.fn();
      
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Press Escape',
        onCancel
      });
      
      const input = anchor.querySelector('.sn-inline-popup-input');
      
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      event.preventDefault = jest.fn();
      input.dispatchEvent(event);
      
      expect(onCancel).toHaveBeenCalled();
      expect(anchor.querySelector('.sn-inline-popup')).toBeNull();
    });

    it('should cleanup on Escape even without onCancel callback', () => {
      notificationManager.showInlinePopup({
        anchor,
        inputPlaceholder: 'Press Escape'
        // No onCancel provided
      });
      
      const input = anchor.querySelector('.sn-inline-popup-input');
      
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      event.preventDefault = jest.fn();
      input.dispatchEvent(event);
      
      expect(anchor.querySelector('.sn-inline-popup')).toBeNull();
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML characters', () => {
      const escaped = notificationManager.escapeHtml('<script>alert("xss")</script>');
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
    });

    it('should handle empty string', () => {
      expect(notificationManager.escapeHtml('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(notificationManager.escapeHtml(null)).toBe('');
      expect(notificationManager.escapeHtml(undefined)).toBe('');
    });
  });

  describe('dismissBanner', () => {
    it('should dismiss a banner', () => {
      const banner = notificationManager.showBanner({
        title: 'Test',
        message: 'Test',
        duration: 0 // No auto-dismiss
      });
      
      notificationManager.dismissBanner(banner);
      
      expect(banner.classList.contains('sn-banner-hiding')).toBe(true);
      
      jest.advanceTimersByTime(300);
      expect(container.querySelector('.sn-banner')).toBeNull();
    });

    it('should handle null banner gracefully', () => {
      expect(() => notificationManager.dismissBanner(null)).not.toThrow();
    });

    it('should handle banner not in container', () => {
      const fakeBanner = document.createElement('div');
      expect(() => notificationManager.dismissBanner(fakeBanner)).not.toThrow();
    });
  });
});
