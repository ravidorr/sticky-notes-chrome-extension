/**
 * Options Page Script - fallback and error branch tests
 * Mocks shared modules so that translation fallbacks and failure paths are reachable.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockTranslate = jest.fn(() => '');
const mockGetPreferences = jest.fn();
const mockSetPreferences = jest.fn();
const mockResetPreferences = jest.fn();

jest.unstable_mockModule('../src/shared/i18n.js', () => ({
  t: mockTranslate,
  initializeI18n: jest.fn()
}));

jest.unstable_mockModule('../src/shared/preferences.js', () => ({
  getPreferences: mockGetPreferences,
  setPreferences: mockSetPreferences,
  resetPreferences: mockResetPreferences,
  DEFAULT_PREFERENCES: {
    defaultTheme: 'yellow',
    defaultPosition: 'top-right',
    noteWidth: 280,
    fontSize: 'medium',
    notesVisibleByDefault: false
  }
}));

// Import with __JEST__ unset so the DOMContentLoaded registration at module level runs
const savedJestFlag = globalThis.__JEST__;
delete globalThis.__JEST__;
const addListenerSpy = jest.spyOn(document, 'addEventListener');
const options = await import('../../src/options/options.js');
const registeredEvents = addListenerSpy.mock.calls.map(call => call[0]);
globalThis.__JEST__ = savedJestFlag;
addListenerSpy.mockRestore();

const DOM = `
  <form id="settingsForm">
    <div id="themePicker"><button type="button" class="theme-option" data-theme="yellow"></button></div>
    <input type="hidden" id="defaultTheme" value="yellow">
    <div id="positionPicker"><button type="button" class="position-option" data-position="top-right"></button></div>
    <input type="hidden" id="defaultPosition" value="top-right">
    <select id="noteWidth"><option value="280" selected>280</option></select>
    <select id="fontSize"><option value="medium" selected>Medium</option></select>
    <input type="checkbox" id="notesVisibleByDefault">
    <button type="button" id="resetBtn">Reset</button>
    <button type="submit" id="saveBtn">Save</button>
  </form>
  <div id="statusMessage" class="hidden"></div>
  <span id="versionDisplay"></span>
  <span id="permissionGranted"></span>
  <span id="permissionNotGranted"></span>
  <button type="button" id="grantPermissionBtn"></button>
  <button type="button" id="revokePermissionBtn"></button>
`;

const status = () => document.getElementById('statusMessage');

describe('Options fallbacks', () => {
  it('registers init on DOMContentLoaded when not running under Jest flag', () => {
    expect(registeredEvents).toContain('DOMContentLoaded');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranslate.mockReturnValue('');
    document.body.innerHTML = DOM;
    options.initDOMElements();
    window.confirm = jest.fn(() => true);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('loadPreferences', () => {
    it('shows fallback error when loading fails', async () => {
      mockGetPreferences.mockRejectedValue(new Error('boom'));
      await options.loadPreferences();
      expect(status().textContent).toBe('Failed to load settings');
      expect(status().className).toContain('error');
    });

    it('sets aria-checked false when notes are hidden by default', async () => {
      mockGetPreferences.mockResolvedValue({
        defaultTheme: 'yellow',
        defaultPosition: 'top-right',
        noteWidth: 280,
        fontSize: 'medium',
        notesVisibleByDefault: false
      });
      await options.loadPreferences();
      expect(document.getElementById('notesVisibleByDefault').getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('handleGrantPermission', () => {
    it('shows fallback success message when granted', async () => {
      chrome.permissions.request.mockResolvedValue(true);
      chrome.permissions.contains.mockResolvedValue(true);
      await options.handleGrantPermission();
      expect(status().textContent).toContain('Permission granted');
    });

    it('shows no message when not granted', async () => {
      chrome.permissions.request.mockResolvedValue(false);
      chrome.permissions.contains.mockResolvedValue(false);
      await options.handleGrantPermission();
      expect(status().textContent).toBe('');
    });

    it('shows fallback error when request throws', async () => {
      chrome.permissions.request.mockRejectedValue(new Error('x'));
      await options.handleGrantPermission();
      expect(status().textContent).toBe('Failed to grant permission');
    });
  });

  describe('handleRevokePermission', () => {
    it('shows fallback success message when revoked', async () => {
      chrome.permissions.remove.mockResolvedValue(true);
      chrome.permissions.contains.mockResolvedValue(false);
      await options.handleRevokePermission();
      expect(status().textContent).toContain('Permission revoked');
    });

    it('shows no message when not revoked', async () => {
      chrome.permissions.remove.mockResolvedValue(false);
      chrome.permissions.contains.mockResolvedValue(true);
      await options.handleRevokePermission();
      expect(status().textContent).toBe('');
    });

    it('shows fallback error when remove throws', async () => {
      chrome.permissions.remove.mockRejectedValue(new Error('x'));
      await options.handleRevokePermission();
      expect(status().textContent).toBe('Failed to revoke permission');
    });

    it('does nothing when the user cancels', async () => {
      window.confirm = jest.fn(() => false);
      chrome.permissions.remove.mockClear();
      await options.handleRevokePermission();
      expect(chrome.permissions.remove).not.toHaveBeenCalled();
    });
  });

  describe('handleSave', () => {
    const evt = () => ({ preventDefault: jest.fn() });

    it('shows fallback success message', async () => {
      mockSetPreferences.mockResolvedValue({ success: true });
      await options.handleSave(evt());
      expect(status().textContent).toBe('Settings saved successfully');
      expect(document.getElementById('saveBtn').textContent).toBe('Save');
    });

    it('shows the error from the result', async () => {
      mockSetPreferences.mockResolvedValue({ success: false, error: 'Bad value' });
      await options.handleSave(evt());
      expect(status().textContent).toBe('Bad value');
    });

    it('shows fallback error when result has no error', async () => {
      mockSetPreferences.mockResolvedValue({ success: false });
      await options.handleSave(evt());
      expect(status().textContent).toBe('Failed to save settings');
    });

    it('shows fallback error when save throws', async () => {
      mockSetPreferences.mockRejectedValue(new Error('x'));
      await options.handleSave(evt());
      expect(status().textContent).toBe('Failed to save settings');
    });
  });

  describe('handleReset', () => {
    it('does nothing when cancelled', async () => {
      window.confirm = jest.fn(() => false);
      await options.handleReset();
      expect(mockResetPreferences).not.toHaveBeenCalled();
    });

    it('resets the form with fallback success message', async () => {
      mockResetPreferences.mockResolvedValue({ success: true });
      await options.handleReset();
      expect(status().textContent).toBe('Settings reset to defaults');
      expect(document.getElementById('notesVisibleByDefault').getAttribute('aria-checked')).toBe('false');
    });

    it('shows the error from the result', async () => {
      mockResetPreferences.mockResolvedValue({ success: false, error: 'Nope' });
      await options.handleReset();
      expect(status().textContent).toBe('Nope');
    });

    it('shows fallback error when result has no error', async () => {
      mockResetPreferences.mockResolvedValue({ success: false });
      await options.handleReset();
      expect(status().textContent).toBe('Failed to reset settings');
    });

    it('shows fallback error when reset throws', async () => {
      mockResetPreferences.mockRejectedValue(new Error('x'));
      await options.handleReset();
      expect(status().textContent).toBe('Failed to reset settings');
    });
  });
});
