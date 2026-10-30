/**
 * NoteManager tests with a failing preferences module
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetPreferences = jest.fn();

jest.unstable_mockModule('../src/shared/preferences.js', () => ({
  getPreferences: mockGetPreferences,
  getFontSizeValue: jest.fn(() => 14)
}));

const { NoteManager } = await import('../../src/content/app/NoteManager.js');

const createDeps = () => ({
  notes: new Map(),
  container: document.body,
  sendMessage: jest.fn(() => Promise.resolve({ success: false, error: 'not saved' })),
  isContextInvalidatedError: jest.fn(() => false),
  getCurrentUser: jest.fn(() => null),
  getCurrentUrl: jest.fn(() => 'https://example.com/page'),
  getTabUrl: jest.fn(() => 'https://example.com/page'),
  getFrameUrl: jest.fn(() => 'https://example.com/page'),
  isTopFrame: jest.fn(() => true),
  subscribeToComments: jest.fn(),
  unsubscribeFromComments: jest.fn(),
  showReanchorUI: jest.fn(),
  selectorEngine: {
    generate: jest.fn((el) => `#${el.id}`),
    findBestMatch: jest.fn(() => null)
  },
  visibilityManager: {
    observe: jest.fn(),
    unobserve: jest.fn(),
    getGlobalVisibility: jest.fn(() => true)
  }
});

describe('NoteManager when preferences fail to load', () => {
  const localThis = {};

  beforeEach(() => {
    document.body.innerHTML = '<div id="anchor-element">Anchor</div>';
    mockGetPreferences.mockReset();
    mockGetPreferences.mockRejectedValue(new Error('storage unavailable'));
    localThis.deps = createDeps();
    localThis.manager = new NoteManager(localThis.deps);
  });

  const savedNote = () => localThis.deps.sendMessage.mock.calls[0][0].note;

  it('handleElementSelect falls back to default theme and position', async () => {
    await localThis.manager.handleElementSelect(document.getElementById('anchor-element'));

    expect(savedNote().theme).toBe('yellow');
    expect(savedNote().position).toEqual({ anchor: 'top-right' });
  });

  it('createNoteAtElement falls back to default theme and position', async () => {
    await localThis.manager.createNoteAtElement(document.getElementById('anchor-element'), '#anchor-element');

    expect(savedNote().theme).toBe('yellow');
    expect(savedNote().position).toEqual({ anchor: 'top-right' });
  });

  it('createPageLevelNote falls back to the default theme', async () => {
    const result = await localThis.manager.createPageLevelNote({ pageX: 20, pageY: 30 });

    expect(result).toBe(false);
    expect(savedNote().theme).toBe('yellow');
    expect(savedNote().position).toEqual({ pageX: 20, pageY: 30 });
  });
});
