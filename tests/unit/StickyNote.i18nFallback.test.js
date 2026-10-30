/**
 * StickyNote i18n fallback tests
 * Covers the hard-coded English fallbacks used when the translation helper returns nothing.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../src/shared/i18n.js', () => ({
  t: jest.fn(() => ''),
  getUILanguage: jest.fn(() => 'en')
}));

let StickyNote;

beforeEach(async () => {
  document.body.innerHTML = '<div id="anchor-element">Anchor</div>';
  const module = await import('../../src/content/components/StickyNote.js');
  StickyNote = module.StickyNote;
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('StickyNote translation fallbacks', () => {
  const create = (opts) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const created = new StickyNote({
      anchor: document.getElementById('anchor-element'),
      content: '',
      ...opts
    });
    container.appendChild(created.element);
    return created;
  };

  it('uses the default message when the note has not been saved yet', async () => {
    const note = create({ id: null });
    const spy = jest.spyOn(note.richEditor, 'updateEmailStatus');
    await note.handleAutoShare('a@example.com');
    expect(spy).toHaveBeenCalledWith('a@example.com', false, 'Save note first');
    note.destroy();
  });

  it('uses the default message when sharing succeeds', async () => {
    const note = create({ id: 'fallback-note' });
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
    const spy = jest.spyOn(note.richEditor, 'updateEmailStatus');
    await note.handleAutoShare('a@example.com');
    expect(spy).toHaveBeenCalledWith('a@example.com', true, 'Shared with a@example.com');
    note.destroy();
  });
});
