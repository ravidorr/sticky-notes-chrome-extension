/**
 * UIManager preference styling tests with a mocked preferences module
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetPreferences = jest.fn();

jest.unstable_mockModule('../src/shared/preferences.js', () => ({
  getPreferences: mockGetPreferences,
  getFontSizeValue: jest.fn((size) => (size === 'large' ? 16 : 14))
}));

const { UIManager } = await import('../../src/content/app/UIManager.js');

describe('UIManager applyPreferencesStyles (mocked preferences)', () => {
  const localThis = {};

  beforeEach(() => {
    document.body.innerHTML = '';
    mockGetPreferences.mockReset();
    localThis.ui = new UIManager({ onElementSelect: jest.fn() });
    mockGetPreferences.mockResolvedValue({});
    localThis.ui.createShadowContainer();
  });

  it('should not set CSS variables when preferences have no values', async () => {
    mockGetPreferences.mockResolvedValue({});

    await localThis.ui.applyPreferencesStyles();

    const host = localThis.ui.shadowRoot.host;
    expect(host.style.getPropertyValue('--sn-note-width')).toBe('');
    expect(host.style.getPropertyValue('--sn-font-size')).toBe('');
  });

  it('should set both CSS variables when preferences are present', async () => {
    mockGetPreferences.mockResolvedValue({ noteWidth: 320, fontSize: 'large' });

    await localThis.ui.applyPreferencesStyles();

    const host = localThis.ui.shadowRoot.host;
    expect(host.style.getPropertyValue('--sn-note-width')).toBe('320px');
    expect(host.style.getPropertyValue('--sn-font-size')).toBe('16px');
  });
});
