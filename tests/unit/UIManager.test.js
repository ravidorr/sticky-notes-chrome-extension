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
});

