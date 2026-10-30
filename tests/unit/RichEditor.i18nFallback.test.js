/**
 * RichEditor i18n fallback tests
 * Covers the 'Sharing...' fallback used when the translation helper returns nothing.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../src/shared/i18n.js', () => ({
  t: jest.fn(() => ''),
  getUILanguage: jest.fn(() => 'en')
}));

let RichEditor;

beforeEach(async () => {
  document.body.innerHTML = '';
  const module = await import('../../src/content/components/RichEditor.js');
  RichEditor = module.RichEditor;
});

describe('RichEditor sharing tooltip fallback', () => {
  it('uses the default tooltip when wrapping a new email', () => {
    const ed = new RichEditor({ onChange: jest.fn() });
    document.body.appendChild(ed.element);
    ed.editor.innerHTML = 'a@example.com tail';
    ed.wrapEmailInSpan('a@example.com');
    expect(ed.editor.querySelector('.sn-email-share').dataset.tooltip).toBe('Sharing...');
  });

  it('uses the default tooltip when correcting an outdated data-email attribute', () => {
    const ed = new RichEditor({ onChange: jest.fn() });
    document.body.appendChild(ed.element);
    ed.editor.innerHTML = '<span class="sn-email-share sn-email-share-success" data-email="wrong@example.com">a@example.com</span>';
    ed.wrapEmailInSpan('a@example.com');
    const span = ed.editor.querySelector('.sn-email-share');
    expect(span.dataset.email).toBe('a@example.com');
    expect(span.dataset.tooltip).toBe('Sharing...');
  });
});
