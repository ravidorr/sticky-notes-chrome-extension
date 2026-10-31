/**
 * Popup Script - DOM integration tests
 * Loads the real popup markup and drives popup.js with mocked handlers and i18n.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const mockTranslate = jest.fn((key) => key);

const mockHandlers = {
  renderEmptyNotes: jest.fn(() => '<div class="empty-notes">empty</div>'),
  renderNoteItemExpanded: jest.fn((note) => {
    if (note.minimal) {
      return `<div class="note-item" data-id="${note.id}"><div class="note-item-header"><span class="inner">x</span></div></div>`;
    }
    const svg = note.noSvg ? '' : '<svg><path d=""/></svg>';
    return `<div class="note-item" data-id="${note.id}"${note.isOrphaned ? ' data-orphaned="true"' : ''}>
      <div class="note-item-header">
        <span class="inner">x</span>
        <button class="note-item-btn" data-action="other"></button>
        <button class="note-item-btn" data-action="visibility">${svg}</button>
        <button class="note-item-btn" data-action="expand"></button>
        <button class="note-item-btn" data-action="share"></button>
        <button class="note-item-btn" data-action="delete"></button>
        <button class="note-item-btn" data-action="leave"></button>
      </div>
    </div>`;
  }),
  renderEmptySharedNotes: jest.fn(() => '<div class="empty-shared">none</div>'),
  renderSharedNoteItem: jest.fn((note) => `<div class="shared-note-item" data-id="${note.id || ''}" data-url="${note.url || ''}"></div>`),
  showShareModal: jest.fn(),
  showConfirmDialog: jest.fn(),
  handleDeleteNote: jest.fn(),
  handleLeaveNote: jest.fn(),
  loadNotesForCurrentTab: jest.fn(),
  getAllNotes: jest.fn(),
  getUnreadSharedNotes: jest.fn(),
  markSharedNoteAsRead: jest.fn(),
  getUnreadSharedCount: jest.fn(),
  checkAuthState: jest.fn(),
  handleLogin: jest.fn(),
  handleLogout: jest.fn(),
  handleAddNote: jest.fn(),
  handleAddPageNote: jest.fn(),
  handleExportCSV: jest.fn(),
  handleDeleteAllFromPage: jest.fn(),
  handleDeleteAllNotes: jest.fn(),
  handleGenerateReport: jest.fn(),
  filterNotesByAge: jest.fn(),
  handleDeleteOldNotes: jest.fn(),
  getThemeColor: jest.fn(() => '#fff')
};

let handlerDeps = null;

jest.unstable_mockModule('../src/popup/handlers.js', () => ({
  createPopupHandlers: jest.fn((deps) => {
    handlerDeps = deps;
    return mockHandlers;
  })
}));

jest.unstable_mockModule('../src/shared/i18n.js', () => ({
  t: mockTranslate,
  initializeI18n: jest.fn()
}));

// Import with __JEST__ unset so the DOMContentLoaded registration at module level runs
const savedJestFlag = globalThis.__JEST__;
delete globalThis.__JEST__;
const addListenerSpy = jest.spyOn(document, 'addEventListener');
const popup = await import('../../src/popup/popup.js');
const registeredEvents = addListenerSpy.mock.calls.map(call => call[0]);
globalThis.__JEST__ = savedJestFlag;
addListenerSpy.mockRestore();

const html = readFileSync(resolve(process.cwd(), 'src/popup/popup.html'), 'utf8');
const parsedPopup = new DOMParser().parseFromString(html, 'text/html');
parsedPopup.querySelectorAll('script').forEach(script => script.remove());
const bodyHtml = parsedPopup.body.innerHTML;

const flush = () => new Promise(done => setTimeout(done, 0));
const qs = (selector) => document.querySelector(selector);
const byId = (id) => document.getElementById(id);
const click = (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const key = (element, name) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
};
const toastText = () => {
  const toast = qs('.popup-toast');
  return toast ? toast.textContent : null;
};
const emptyTranslations = () => mockTranslate.mockImplementation(() => '');

const setup = (mutate) => {
  document.body.innerHTML = bodyHtml;
  if (mutate) mutate();
  popup.initDOMElements();
};

describe('popup.js DOM integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTranslate.mockImplementation((name) => name);
    chrome.tabs.query = jest.fn().mockResolvedValue([{ id: 5, url: 'https://example.com/page' }]);
    chrome.tabs.sendMessage = jest.fn().mockResolvedValue({ success: true });
    chrome.tabs.create = jest.fn().mockResolvedValue({ id: 9 });
    chrome.runtime.openOptionsPage = jest.fn();
    chrome.runtime.getManifest = jest.fn(() => ({ version: '9.9.9' }));
    jest.spyOn(window, 'close').mockImplementation(() => {});

    mockHandlers.loadNotesForCurrentTab.mockResolvedValue({ success: true, notes: [] });
    mockHandlers.getAllNotes.mockResolvedValue({ success: true, notes: [] });
    mockHandlers.getUnreadSharedNotes.mockResolvedValue({ success: true, notes: [] });
    mockHandlers.getUnreadSharedCount.mockResolvedValue({ success: true, count: 0 });
    mockHandlers.checkAuthState.mockResolvedValue(null);
    mockHandlers.showConfirmDialog.mockResolvedValue(true);
    mockHandlers.handleDeleteNote.mockResolvedValue({ success: true });
    mockHandlers.handleLeaveNote.mockResolvedValue({ success: true });
    mockHandlers.handleExportCSV.mockResolvedValue({ success: true });
    mockHandlers.filterNotesByAge.mockReturnValue([]);
    mockHandlers.handleDeleteOldNotes.mockResolvedValue({ success: true });
    mockHandlers.handleGenerateReport.mockResolvedValue({ success: true });
    mockHandlers.markSharedNoteAsRead.mockResolvedValue({ success: true });
    setup();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('registers init on DOMContentLoaded when the Jest flag is unset', () => {
    expect(registeredEvents).toContain('DOMContentLoaded');
    expect(typeof popup.createPopupHandlers).toBe('function');
  });

  describe('toast', () => {
    it('provides error and success toasts to the handlers', () => {
      handlerDeps.showErrorToast('bad news');
      expect(qs('.popup-toast').className).toContain('error');
      expect(toastText()).toBe('bad news');
      handlerDeps.showSuccessToast('good news');
      expect(qs('.popup-toast').className).toContain('success');
      expect(toastText()).toBe('good news');
    });

    it('shows a toast, replaces an existing one and removes it after a delay', async () => {
      jest.useFakeTimers();
      await popup.handleNoteNavigate('n', false).catch(() => {});
      chrome.tabs.query.mockRejectedValueOnce(new Error('x'));
      await popup.handleNoteNavigate('n', false);
      expect(toastText()).toBe('couldNotEnableSelection');
      chrome.tabs.query.mockRejectedValueOnce(new Error('x'));
      await popup.handleNoteNavigate('n', false);
      expect(document.querySelectorAll('.popup-toast')).toHaveLength(1);

      jest.advanceTimersByTime(3000);
      expect(qs('.popup-toast').classList.contains('hiding')).toBe(true);
      jest.advanceTimersByTime(300);
      expect(qs('.popup-toast')).toBeNull();
    });
  });

  describe('displayVersion', () => {
    it('shows the manifest version, an empty string on failure, and tolerates a missing element', () => {
      popup.displayVersion();
      expect(byId('versionDisplay').textContent).toBe('v9.9.9');
      chrome.runtime.getManifest.mockImplementation(() => {
        throw new Error('no manifest');
      });
      popup.displayVersion();
      expect(byId('versionDisplay').textContent).toBe('');
      setup(() => byId('versionDisplay').remove());
      expect(() => popup.displayVersion()).not.toThrow();
    });
  });

  describe('sections', () => {
    it('shows auth and user sections', () => {
      popup.showUserSection({ photoURL: 'a.png', displayName: 'Ann', email: 'a@b.co' });
      expect(byId('userName').textContent).toBe('Ann');
      expect(byId('userAvatar').getAttribute('src')).toBe('a.png');
      expect(byId('userSection').classList.contains('hidden')).toBe(false);
      popup.showUserSection({});
      expect(byId('userName').textContent).toBe('User');
      expect(byId('userEmail').textContent).toBe('');
      popup.showAuthSection();
      expect(byId('authSection').classList.contains('hidden')).toBe(false);
    });
  });

  describe('init', () => {
    it('shows the auth section and wires buttons for a signed out user', async () => {
      await popup.init();
      expect(byId('authSection').classList.contains('hidden')).toBe(false);
      expect(byId('notesCount').textContent).toBe('0');

      click(byId('addNoteBtn'));
      click(byId('addPageNoteBtn'));
      click(byId('closeBtn'));
      expect(mockHandlers.handleAddNote).toHaveBeenCalled();
      expect(mockHandlers.handleAddPageNote).toHaveBeenCalled();
      expect(window.close).toHaveBeenCalled();
    });

    it('shows the user section and disables buttons on restricted pages', async () => {
      mockHandlers.checkAuthState.mockResolvedValue({ displayName: 'Ann' });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://extensions' }]);
      await popup.init();
      expect(byId('userSection').classList.contains('hidden')).toBe(false);
      expect(byId('addNoteBtn').disabled).toBe(true);
      expect(byId('addPageNoteBtn').disabled).toBe(true);
      expect(qs('.action-hint').classList.contains('restricted')).toBe(true);
    });

    it('handles a missing tab or url', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      await popup.init();
      expect(byId('addNoteBtn').disabled).toBe(false);
    });

    it('tolerates missing page note button and action hint on restricted pages', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://extensions' }]);
      setup(() => {
        byId('addPageNoteBtn').remove();
        qs('.action-hint').remove();
      });
      await expect(popup.init()).rejects.toThrow();
      expect(byId('addNoteBtn').disabled).toBe(true);
    });

    it('ignores failures when updating counts in the background', async () => {
      mockHandlers.getAllNotes.mockRejectedValue(new Error('counts failed'));
      await popup.init();
      await flush();
      expect(mockHandlers.getAllNotes).toHaveBeenCalled();
    });

    it('login success, failure and exceptions', async () => {
      await popup.init();
      const loginBtn = byId('loginBtn');

      mockHandlers.handleLogin.mockResolvedValueOnce({ success: true, user: { displayName: 'Ann' } });
      click(loginBtn);
      await flush();
      expect(byId('userName').textContent).toBe('Ann');
      expect(loginBtn.disabled).toBe(false);

      mockHandlers.handleLogin.mockResolvedValueOnce({ success: false, error: 'nope' });
      click(loginBtn);
      await flush();
      expect(toastText()).toBe('nope');

      mockHandlers.handleLogin.mockResolvedValueOnce({ success: false });
      click(loginBtn);
      await flush();
      expect(toastText()).toBe('loginFailed');

      mockHandlers.handleLogin.mockRejectedValueOnce(new Error('boom'));
      click(loginBtn);
      await flush();
      expect(toastText()).toBe('boom');

      mockHandlers.handleLogin.mockRejectedValueOnce(new Error(''));
      click(loginBtn);
      await flush();
      expect(toastText()).toBe('loginFailed');
    });

    it('logout success and failure', async () => {
      await popup.init();
      popup.showUserSection({ displayName: 'Ann' });
      mockHandlers.handleLogout.mockResolvedValueOnce({ success: false });
      click(byId('logoutBtn'));
      await flush();
      expect(byId('authSection').classList.contains('hidden')).toBe(true);
      mockHandlers.handleLogout.mockResolvedValueOnce({ success: true });
      click(byId('logoutBtn'));
      await flush();
      expect(byId('authSection').classList.contains('hidden')).toBe(false);
    });
  });

  describe('renderNotesList', () => {
    const notes = [{ id: 'a' }, { id: 'b', isOrphaned: true }];

    it('renders the empty state', () => {
      popup.renderNotesList([]);
      expect(byId('notesList').innerHTML).toContain('empty-notes');
    });

    it('navigates when the header is clicked but not for action buttons', async () => {
      popup.renderNotesList(notes);
      click(qs('.note-item[data-id="a"] .note-item-btn[data-action="other"]'));
      await flush();
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();

      click(qs('.note-item[data-id="a"] .inner'));
      await flush();
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, { action: 'highlightAndMaximizeNote', noteId: 'a' });

      click(qs('.note-item[data-id="b"] .inner'));
      await flush();
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, { action: 'showOrphanedNote', noteId: 'b' });
      expect(window.close).toHaveBeenCalled();
    });

    it('works for notes without action buttons', () => {
      expect(() => popup.renderNotesList([{ id: 'm', minimal: true }])).not.toThrow();
    });

    it('toggles metadata expansion', () => {
      popup.renderNotesList(notes);
      const expand = qs('.note-item[data-id="a"] [data-action="expand"]');
      click(expand);
      expect(expand.title).toBe('hideMetadata');
      click(expand);
      expect(expand.title).toBe('viewMetadata');
    });

    it('opens the share modal', async () => {
      popup.renderNotesList(notes);
      click(qs('.note-item[data-id="a"] [data-action="share"]'));
      await flush();
      expect(mockHandlers.showShareModal).toHaveBeenCalledWith('a');
    });

    it.each([
      ['delete', 'handleDeleteNote'],
      ['leave', 'handleLeaveNote']
    ])('%s covers confirm, cancel and failure', async (action, handlerName) => {
      popup.renderNotesList(notes);
      const button = () => qs(`.note-item[data-id="a"] [data-action="${action}"]`);

      mockHandlers.showConfirmDialog.mockResolvedValueOnce(false);
      click(button());
      await flush();
      expect(mockHandlers[handlerName]).not.toHaveBeenCalled();

      mockHandlers[handlerName].mockResolvedValueOnce({ success: false });
      click(button());
      await flush();
      expect(mockHandlers[handlerName]).toHaveBeenCalledWith('a');
      expect(mockHandlers.loadNotesForCurrentTab).not.toHaveBeenCalled();

      click(button());
      await flush();
      expect(mockHandlers.loadNotesForCurrentTab).toHaveBeenCalled();
    });

    describe('visibility button', () => {
      const button = () => qs('.note-item[data-id="a"] [data-action="visibility"]');

      it('updates the ui when hidden and when shown', async () => {
        popup.renderNotesList(notes);
        chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true, isHidden: true });
        click(button());
        await flush();
        expect(qs('.note-item[data-id="a"]').classList.contains('note-item-hidden')).toBe(true);
        expect(qs('.note-item[data-id="a"]').dataset.hidden).toBe('true');
        expect(button().title).toBe('showNote');
        expect(toastText()).toBe('noteHidden');

        chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true, isHidden: false });
        click(button());
        await flush();
        expect(qs('.note-item[data-id="a"]').dataset.hidden).toBe('');
        expect(button().title).toBe('hideNote');
        expect(toastText()).toBe('noteShown');
      });

      it('works without an svg', async () => {
        popup.renderNotesList([{ id: 'a', noSvg: true }]);
        chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true, isHidden: true });
        click(button());
        await flush();
        expect(toastText()).toBe('noteHidden');
      });

      it('ignores unsuccessful responses and tabs without id', async () => {
        popup.renderNotesList(notes);
        chrome.tabs.sendMessage.mockResolvedValueOnce({ success: false });
        click(button());
        await flush();
        expect(toastText()).toBeNull();

        chrome.tabs.query.mockResolvedValueOnce([{}]);
        click(button());
        await flush();
        expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
      });

      it('shows an error when messaging fails', async () => {
        popup.renderNotesList(notes);
        chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('x'));
        click(button());
        await flush();
        expect(toastText()).toBe('couldNotEnableSelection');
      });
    });
  });

  describe('handleNoteNavigate', () => {
    it('returns when there is no tab and reports errors', async () => {
      chrome.tabs.query.mockResolvedValueOnce([]);
      await popup.handleNoteNavigate('n', false);
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
      chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('x'));
      await popup.handleNoteNavigate('n', true);
      expect(toastText()).toBe('couldNotEnableSelection');
    });
  });

  describe('counts', () => {
    it('refreshNotes updates counters', async () => {
      mockHandlers.loadNotesForCurrentTab.mockResolvedValue({ success: true, notes: [{ id: 'a' }] });
      mockHandlers.getAllNotes.mockResolvedValue({ success: true, notes: [{ id: 'a' }, { id: 'b' }] });
      await popup.refreshNotes();
      expect(byId('notesCount').textContent).toBe('1');
      expect(byId('thisPageCount').textContent).toBe('1');
      expect(byId('totalNotesCount').textContent).toBe('totalNotes');
    });

    it('updateTotalNotesCount clears the text when empty or failing', async () => {
      byId('totalNotesCount').textContent = 'old';
      await popup.updateTotalNotesCount();
      expect(byId('totalNotesCount').textContent).toBe('');
      byId('totalNotesCount').textContent = 'old';
      mockHandlers.getAllNotes.mockResolvedValue({ success: false, notes: [] });
      await popup.updateTotalNotesCount();
      expect(byId('totalNotesCount').textContent).toBe('');
    });

    it('updateSharedNotesCount handles zero, positive and missing counts', async () => {
      mockHandlers.getUnreadSharedCount.mockResolvedValue({ count: 3 });
      await popup.updateSharedNotesCount();
      expect(byId('sharedCount').textContent).toBe('3');
      expect(byId('sharedCount').classList.contains('hidden')).toBe(false);
      mockHandlers.getUnreadSharedCount.mockResolvedValue({});
      await popup.updateSharedNotesCount();
      expect(byId('sharedCount').textContent).toBe('0');
      expect(byId('sharedCount').classList.contains('hidden')).toBe(true);
    });
  });

  describe('tabs', () => {
    it('switchTab toggles state and loads shared notes', async () => {
      await popup.switchTab('shared');
      expect(byId('sharedTab').getAttribute('aria-selected')).toBe('true');
      expect(byId('thisPageTab').getAttribute('aria-selected')).toBe('false');
      expect(byId('sharedContent').classList.contains('hidden')).toBe(false);
      expect(mockHandlers.getUnreadSharedNotes).toHaveBeenCalled();
      await popup.switchTab('this-page');
      expect(byId('thisPageTab').getAttribute('aria-selected')).toBe('true');
      expect(mockHandlers.getUnreadSharedNotes).toHaveBeenCalledTimes(1);
    });

    it('loadAndRenderSharedNotes renders empty and populated lists', async () => {
      await popup.loadAndRenderSharedNotes();
      expect(byId('sharedNotesList').innerHTML).toContain('empty-shared');

      mockHandlers.getUnreadSharedNotes.mockResolvedValue({ success: true, notes: [{ id: 's1', url: 'https://a.com' }] });
      await popup.loadAndRenderSharedNotes();
      click(qs('.shared-note-item'));
      await flush();
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://a.com' });
    });

    describe('handleSharedNoteClick', () => {
      const makeItem = (id, url) => {
        const item = document.createElement('div');
        if (id) item.dataset.id = id;
        if (url) item.dataset.url = url;
        return item;
      };

      it('requires an id and a url', async () => {
        await popup.handleSharedNoteClick(makeItem('', 'https://a.com'));
        await popup.handleSharedNoteClick(makeItem('s1', ''));
        expect(mockHandlers.markSharedNoteAsRead).not.toHaveBeenCalled();
      });

      it('marks as read, opens the url and closes', async () => {
        await popup.handleSharedNoteClick(makeItem('s1', 'https://a.com'));
        expect(mockHandlers.markSharedNoteAsRead).toHaveBeenCalledWith('s1');
        expect(window.close).toHaveBeenCalled();
      });

      it('shows an error toast, using the fallback text when needed', async () => {
        chrome.tabs.create.mockRejectedValue(new Error('x'));
        await popup.handleSharedNoteClick(makeItem('s1', 'https://a.com'));
        expect(toastText()).toBe('failedToOpenNote');
        emptyTranslations();
        await popup.handleSharedNoteClick(makeItem('s1', 'https://a.com'));
        expect(toastText()).toBe('Failed to open note');
      });
    });

    describe('setupTabs keyboard navigation', () => {
      beforeEach(() => {
        popup.setupTabs();
      });

      it('navigates with arrow, home and end keys', () => {
        const first = byId('thisPageTab');
        const second = byId('sharedTab');
        const clickSpyFirst = jest.fn();
        const clickSpySecond = jest.fn();
        first.addEventListener('click', clickSpyFirst);
        second.addEventListener('click', clickSpySecond);

        expect(key(first, 'ArrowLeft').defaultPrevented).toBe(true);
        expect(clickSpySecond).toHaveBeenCalledTimes(1);
        key(first, 'ArrowUp');
        expect(clickSpySecond).toHaveBeenCalledTimes(2);
        key(first, 'ArrowRight');
        expect(clickSpySecond).toHaveBeenCalledTimes(3);
        key(first, 'End');
        expect(clickSpySecond).toHaveBeenCalledTimes(4);

        key(second, 'ArrowLeft');
        expect(clickSpyFirst).toHaveBeenCalledTimes(1);
        key(second, 'ArrowRight');
        expect(clickSpyFirst).toHaveBeenCalledTimes(2);
        key(second, 'ArrowDown');
        expect(clickSpyFirst).toHaveBeenCalledTimes(3);
        key(second, 'Home');
        expect(clickSpyFirst).toHaveBeenCalledTimes(4);
      });

      it('ignores other keys and navigation to the same tab', () => {
        const first = byId('thisPageTab');
        const clickSpy = jest.fn();
        first.addEventListener('click', clickSpy);
        key(first, 'a');
        key(first, 'Home');
        expect(clickSpy).not.toHaveBeenCalled();
      });

      it('switches tabs on click', async () => {
        click(byId('sharedTab'));
        await flush();
        expect(byId('sharedTab').classList.contains('active')).toBe(true);
        click(byId('thisPageTab'));
        expect(byId('thisPageTab').classList.contains('active')).toBe(true);
      });
    });
  });

  describe('updateToggleVisibilityButton', () => {
    it('renders visible and hidden states', () => {
      popup.updateToggleVisibilityButton(true);
      expect(byId('toggleVisibilityBtn').querySelector('span').textContent).toBe('hideAllNotes');
      popup.updateToggleVisibilityButton(false);
      expect(byId('toggleVisibilityBtn').querySelector('span').textContent).toBe('showAllNotes');
    });

    it('does nothing without the button', () => {
      setup(() => byId('toggleVisibilityBtn').remove());
      expect(() => popup.updateToggleVisibilityButton(true)).not.toThrow();
    });
  });

  describe('actions dropdown', () => {
    beforeEach(() => {
      popup.setupActionsDropdown();
    });

    const menuHidden = () => byId('actionsMenu').classList.contains('hidden');

    describe('open and close', () => {
      it('syncs visibility on open and closes on second click', async () => {
        chrome.tabs.sendMessage.mockResolvedValue({ success: true, notesVisible: false });
        click(byId('actionsBtn'));
        await flush();
        expect(menuHidden()).toBe(false);
        expect(byId('actionsBtn').getAttribute('aria-expanded')).toBe('true');
        expect(byId('toggleVisibilityBtn').querySelector('span').textContent).toBe('showAllNotes');

        click(byId('actionsBtn'));
        await flush();
        expect(menuHidden()).toBe(true);
        expect(byId('actionsBtn').getAttribute('aria-expanded')).toBe('false');
      });

      it('ignores unsuccessful responses and tabs without id', async () => {
        chrome.tabs.sendMessage.mockResolvedValue({ success: false });
        click(byId('actionsBtn'));
        await flush();
        click(byId('actionsBtn'));
        chrome.tabs.query.mockResolvedValueOnce([{}]);
        click(byId('actionsBtn'));
        await flush();
        expect(menuHidden()).toBe(false);
      });

      it('defaults to visible when the content script is unavailable', async () => {
        chrome.tabs.sendMessage.mockRejectedValue(new Error('none'));
        click(byId('actionsBtn'));
        await flush();
        expect(byId('toggleVisibilityBtn').querySelector('span').textContent).toBe('hideAllNotes');
      });

      it('closes on outside click', async () => {
        click(byId('actionsBtn'));
        await flush();
        click(document.body);
        expect(menuHidden()).toBe(true);
      });
    });

    describe('toggle visibility', () => {
      it('updates button on success', async () => {
        chrome.tabs.sendMessage.mockResolvedValue({ success: true, notesVisible: false });
        click(byId('toggleVisibilityBtn'));
        await flush();
        expect(byId('toggleVisibilityBtn').querySelector('span').textContent).toBe('showAllNotes');
      });

      it('ignores failures and missing tab id', async () => {
        chrome.tabs.sendMessage.mockResolvedValue({ success: false });
        click(byId('toggleVisibilityBtn'));
        await flush();
        chrome.tabs.query.mockResolvedValueOnce([{}]);
        click(byId('toggleVisibilityBtn'));
        await flush();
        expect(toastText()).toBeNull();
      });

      it('shows an error when messaging throws', async () => {
        chrome.tabs.sendMessage.mockRejectedValue(new Error('x'));
        click(byId('toggleVisibilityBtn'));
        await flush();
        expect(toastText()).toBe('couldNotEnableSelection');
      });
    });

    describe('exports', () => {
      it('exports page notes using the hostname', async () => {
        popup.renderNotesList([{ id: 'a' }]);
        click(byId('exportPageBtn'));
        await flush();
        expect(mockHandlers.handleExportCSV).toHaveBeenCalledWith([{ id: 'a' }], expect.stringContaining('sticky-notes-example.com-'));
      });

      it('falls back to a generic hostname', async () => {
        popup.renderNotesList([{ id: 'a' }]);
        chrome.tabs.query.mockResolvedValueOnce([{ id: 1 }]);
        click(byId('exportPageBtn'));
        await flush();
        expect(mockHandlers.handleExportCSV).toHaveBeenCalledWith([{ id: 'a' }], expect.stringContaining('sticky-notes-page-'));
        chrome.tabs.query.mockResolvedValueOnce([]);
        click(byId('exportPageBtn'));
        await flush();
        expect(mockHandlers.handleExportCSV).toHaveBeenCalledTimes(2);
      });

      it('shows an error when there is nothing to export from the page', async () => {
        popup.renderNotesList([]);
        click(byId('exportPageBtn'));
        await flush();
        expect(toastText()).toBe('noNotesToExport');
      });

      it('exports all notes or reports failures', async () => {
        mockHandlers.getAllNotes.mockResolvedValueOnce({ success: true, notes: [{ id: 'a' }] });
        click(byId('exportAllBtn'));
        await flush();
        expect(mockHandlers.handleExportCSV).toHaveBeenCalledWith([{ id: 'a' }], expect.stringContaining('sticky-notes-all-'));

        mockHandlers.getAllNotes.mockResolvedValueOnce({ success: true, notes: [] });
        click(byId('exportAllBtn'));
        await flush();
        expect(toastText()).toBe('noNotesToExport');
        document.querySelector('.popup-toast').remove();

        mockHandlers.getAllNotes.mockResolvedValueOnce({ success: false, notes: [] });
        click(byId('exportAllBtn'));
        await flush();
        expect(toastText()).toBe('noNotesToExport');
      });
    });

    describe('deletions', () => {
      it('delete page notes covers empty, cancel and confirm', async () => {
        popup.renderNotesList([]);
        click(byId('deletePageNotesBtn'));
        await flush();
        expect(toastText()).toBe('noNotesYet');

        popup.renderNotesList([{ id: 'a' }]);
        mockHandlers.showConfirmDialog.mockResolvedValueOnce(false);
        click(byId('deletePageNotesBtn'));
        await flush();
        expect(mockHandlers.handleDeleteAllFromPage).not.toHaveBeenCalled();

        click(byId('deletePageNotesBtn'));
        await flush();
        expect(mockHandlers.handleDeleteAllFromPage).toHaveBeenCalledWith([{ id: 'a' }]);
      });

      it('delete all notes covers failure, empty, cancel and confirm', async () => {
        mockHandlers.getAllNotes.mockResolvedValueOnce({ success: false, notes: [] });
        click(byId('deleteAllNotesBtn'));
        await flush();
        expect(toastText()).toBe('noNotesToExport');

        mockHandlers.getAllNotes.mockResolvedValueOnce({ success: true, notes: [] });
        click(byId('deleteAllNotesBtn'));
        await flush();

        mockHandlers.getAllNotes.mockResolvedValue({ success: true, notes: [{ id: 'a' }] });
        mockHandlers.showConfirmDialog.mockResolvedValueOnce(false);
        click(byId('deleteAllNotesBtn'));
        await flush();
        expect(mockHandlers.handleDeleteAllNotes).not.toHaveBeenCalled();

        click(byId('deleteAllNotesBtn'));
        await flush();
        expect(mockHandlers.handleDeleteAllNotes).toHaveBeenCalled();
      });
    });

    it('opens settings and the delete old notes modal', () => {
      click(byId('settingsBtn'));
      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
      click(byId('deleteOldNotesBtn'));
      expect(byId('deleteOldNotesModal').classList.contains('hidden')).toBe(false);
    });

    it('opens the report modal', () => {
      click(byId('generateReportBtn'));
      expect(byId('reportModal').classList.contains('hidden')).toBe(false);
    });

    it('works without a generate report button', () => {
      setup(() => byId('generateReportBtn').remove());
      expect(() => popup.setupActionsDropdown()).not.toThrow();
    });
  });

  describe('delete old notes modal', () => {
    const modalHidden = () => byId('deleteOldNotesModal').classList.contains('hidden');
    const presets = () => Array.from(document.querySelectorAll('.age-preset-btn'));

    it('opens with a reset state and closes', () => {
      byId('customDaysInput').value = '5';
      popup.openDeleteOldNotesModal();
      expect(modalHidden()).toBe(false);
      expect(byId('customDaysInput').value).toBe('');
      expect(byId('confirmDeleteOldNotes').disabled).toBe(true);
      popup.closeDeleteOldNotesModalFn();
      expect(modalHidden()).toBe(true);
    });

    describe('previewOldNotes', () => {
      it('reports load failures', async () => {
        mockHandlers.getAllNotes.mockResolvedValue({ success: false });
        await popup.previewOldNotes(7);
        expect(toastText()).toBe('failedToDelete');
      });

      it('shows an empty result', async () => {
        await popup.previewOldNotes(7);
        expect(byId('oldNotesCount').classList.contains('empty')).toBe(true);
        expect(byId('confirmDeleteOldNotes').disabled).toBe(true);
      });

      it('lists up to five notes and the remainder', async () => {
        const many = Array.from({ length: 7 }, (_v, index) => ({ id: `n${index}`, content: '<b>text</b>', url: 'https://a.com/x' }));
        mockHandlers.filterNotesByAge.mockReturnValue(many);
        await popup.previewOldNotes(30);
        expect(document.querySelectorAll('.old-note-item')).toHaveLength(5);
        expect(byId('oldNotesList').innerHTML).toContain('old-notes-more');
        expect(byId('confirmDeleteOldNotes').disabled).toBe(false);
        expect(byId('oldNotesCount').classList.contains('empty')).toBe(false);
      });

      it('lists notes without a remainder', async () => {
        mockHandlers.filterNotesByAge.mockReturnValue([{ id: 'n1' }]);
        await popup.previewOldNotes(30);
        expect(byId('oldNotesList').innerHTML).not.toContain('old-notes-more');
      });
    });

    describe('renderOldNotePreviewItem', () => {
      it('covers content and url variants', () => {
        const full = popup.renderOldNotePreviewItem({ content: '<i>' + 'a'.repeat(80) + '</i>', url: 'https://example.com/p' });
        expect(full).toContain('example.com');
        expect(full).not.toContain('<i>');
        const bare = popup.renderOldNotePreviewItem({ url: 'not a url' });
        expect(bare).toContain('emptyNote');
        expect(bare).toContain('not a url');
        expect(popup.renderOldNotePreviewItem({})).toContain('old-note-item');
      });
    });

    describe('setupDeleteOldNotesModal', () => {
      beforeEach(() => {
        popup.setupDeleteOldNotesModal();
        popup.openDeleteOldNotesModal();
      });

      it('closes via buttons and backdrop', () => {
        click(byId('closeDeleteOldNotesModal'));
        expect(modalHidden()).toBe(true);
        popup.openDeleteOldNotesModal();
        click(byId('cancelDeleteOldNotes'));
        expect(modalHidden()).toBe(true);
        popup.openDeleteOldNotesModal();
        click(byId('deleteOldNotesModal').querySelector('.modal-backdrop'));
        expect(modalHidden()).toBe(true);
      });

      it('selects a preset and previews', async () => {
        byId('customDaysInput').value = '4';
        click(presets()[1]);
        await flush();
        expect(presets()[1].classList.contains('active')).toBe(true);
        expect(presets()[1].getAttribute('aria-checked')).toBe('true');
        expect(presets()[0].getAttribute('aria-checked')).toBe('false');
        expect(byId('customDaysInput').value).toBe('');
        expect(mockHandlers.filterNotesByAge).toHaveBeenCalledWith([], 30);
      });

      it('navigates presets with arrow keys', () => {
        const buttons = presets();
        const spies = buttons.map(button => {
          const spy = jest.fn();
          button.addEventListener('click', spy);
          return spy;
        });

        key(buttons[0], 'ArrowLeft');
        expect(spies[buttons.length - 1]).toHaveBeenCalledTimes(1);
        key(buttons[0], 'ArrowUp');
        expect(spies[buttons.length - 1]).toHaveBeenCalledTimes(2);
        key(buttons[1], 'ArrowLeft');
        expect(spies[0]).toHaveBeenCalledTimes(1);
        key(buttons[1], 'ArrowRight');
        expect(spies[2]).toHaveBeenCalledTimes(1);
        key(buttons[buttons.length - 1], 'ArrowRight');
        expect(spies[0]).toHaveBeenCalledTimes(2);
        key(buttons[0], 'ArrowDown');
        expect(spies[1]).toHaveBeenCalledTimes(1);
        key(buttons[0], 'Home');
        expect(spies[0]).toHaveBeenCalledTimes(2);
      });

      it('applies custom days via Enter and the button', async () => {
        byId('customDaysInput').value = '15';
        key(byId('customDaysInput'), 'a');
        expect(mockHandlers.filterNotesByAge).not.toHaveBeenCalled();
        key(byId('customDaysInput'), 'Enter');
        await flush();
        expect(mockHandlers.filterNotesByAge).toHaveBeenCalledWith([], 15);
        click(byId('applyCustomDaysBtn'));
        await flush();
        expect(mockHandlers.filterNotesByAge).toHaveBeenCalledTimes(2);
      });

      describe('confirm delete', () => {
        const selectOldNotes = async () => {
          mockHandlers.filterNotesByAge.mockReturnValue([{ id: 'n1' }]);
          await popup.previewOldNotes(30);
        };

        it('does nothing without filtered notes', async () => {
          click(byId('confirmDeleteOldNotes'));
          await flush();
          expect(mockHandlers.showConfirmDialog).not.toHaveBeenCalled();
        });

        it('does nothing when cancelled', async () => {
          await selectOldNotes();
          mockHandlers.showConfirmDialog.mockResolvedValueOnce(false);
          click(byId('confirmDeleteOldNotes'));
          await flush();
          expect(mockHandlers.handleDeleteOldNotes).not.toHaveBeenCalled();
        });

        it('keeps the modal open when deletion fails', async () => {
          await selectOldNotes();
          mockHandlers.handleDeleteOldNotes.mockResolvedValueOnce({ success: false });
          byId('confirmDeleteOldNotes').disabled = false;
          click(byId('confirmDeleteOldNotes'));
          await flush();
          expect(modalHidden()).toBe(false);
        });

        it('closes and refreshes after deletion', async () => {
          await selectOldNotes();
          byId('confirmDeleteOldNotes').disabled = false;
          click(byId('confirmDeleteOldNotes'));
          await flush();
          expect(modalHidden()).toBe(true);
          expect(mockHandlers.loadNotesForCurrentTab).toHaveBeenCalled();
        });
      });

      it('closes on Escape only when visible', () => {
        key(document, 'a');
        expect(modalHidden()).toBe(false);
        key(document, 'Escape');
        expect(modalHidden()).toBe(true);
        key(document, 'Escape');
        expect(modalHidden()).toBe(true);
      });
    });

    describe('applyCustomDays', () => {
      it.each(['', 'abc', '0', '-3', '10000'])('rejects %j', (value) => {
        byId('customDaysInput').value = value;
        popup.applyCustomDays();
        expect(toastText()).toBe('invalidEmail');
        expect(mockHandlers.filterNotesByAge).not.toHaveBeenCalled();
      });

      it('accepts a valid value and clears presets', async () => {
        document.querySelector('.age-preset-btn').classList.add('active');
        byId('customDaysInput').value = '20';
        popup.applyCustomDays();
        await flush();
        expect(document.querySelector('.age-preset-btn').classList.contains('active')).toBe(false);
        expect(mockHandlers.filterNotesByAge).toHaveBeenCalledWith([], 20);
      });
    });
  });

  describe('report modal', () => {
    const reportHidden = () => byId('reportModal').classList.contains('hidden');
    const setScope = (value) => {
      document.querySelectorAll('input[name="reportScope"]').forEach(radio => {
        radio.checked = radio.value === value;
      });
    };

    describe('openReportModal and closeReportModal', () => {
      it('resets the form and shows the modal', () => {
        byId('reportIncludeMetadata').checked = false;
        byId('reportIncludeComments').checked = false;
        byId('reportIncludeScreenshots').checked = true;
        popup.openReportModal();
        expect(reportHidden()).toBe(false);
        expect(byId('reportIncludeMetadata').checked).toBe(true);
        expect(byId('reportIncludeComments').checked).toBe(true);
        expect(byId('reportIncludeScreenshots').checked).toBe(false);
        expect(byId('selectedNotesCount').textContent).toBe('(0)');
        popup.closeReportModal();
        expect(reportHidden()).toBe(true);
      });

      it('tolerates missing optional elements', () => {
        setup(() => {
          byId('dateRangeInputs').remove();
          byId('reportIncludeMetadata').remove();
          byId('reportIncludeComments').remove();
          byId('reportIncludeScreenshots').remove();
          byId('selectedNotesCount').remove();
          byId('reportModal').querySelectorAll('input, button').forEach(element => element.remove());
        });
        expect(() => popup.openReportModal()).not.toThrow();
        expect(reportHidden()).toBe(false);
      });

      it('does nothing without the modal', () => {
        setup(() => byId('reportModal').remove());
        expect(() => popup.openReportModal()).not.toThrow();
        expect(() => popup.closeReportModal()).not.toThrow();
        expect(() => popup.setupReportModal()).not.toThrow();
      });
    });

    describe('getReportOptions', () => {
      it('returns the checked options', () => {
        document.querySelector('input[name="reportFormat"][value="pdf"]').checked = true;
        setScope('allNotes');
        const options = popup.getReportOptions();
        expect(options.format).toBe('pdf');
        expect(options.scope).toBe('allNotes');
      });

      it('falls back to defaults when nothing is checked or present', () => {
        setup(() => {
          document.querySelectorAll('input[name="reportFormat"], input[name="reportScope"]').forEach(radio => {
            radio.checked = false;
          });
          byId('reportIncludeMetadata').remove();
          byId('reportIncludeComments').remove();
          byId('reportIncludeScreenshots').remove();
        });
        expect(popup.getReportOptions()).toEqual({
          format: 'html',
          scope: 'currentPage',
          includeMetadata: true,
          includeComments: true,
          includeScreenshots: false
        });
      });

      it('adds the date range only when both dates exist', () => {
        setScope('dateRange');
        byId('reportDateStart').value = '2024-01-01';
        byId('reportDateEnd').value = '';
        expect(popup.getReportOptions().dateRange).toBeUndefined();
        byId('reportDateEnd').value = '2024-01-31';
        expect(popup.getReportOptions().dateRange.start).toBeInstanceOf(Date);
      });

      it('skips the date range when the inputs do not exist', () => {
        setup(() => {
          byId('reportDateStart').remove();
          byId('reportDateEnd').remove();
        });
        setScope('dateRange');
        expect(popup.getReportOptions().dateRange).toBeUndefined();
      });
    });

    describe('handleGenerateReport', () => {
      it('requires dates for the date range scope', async () => {
        setScope('dateRange');
        await popup.handleGenerateReport();
        expect(toastText()).toBe('reportDateRangeRequired');
        byId('reportDateStart').value = '2024-01-01';
        await popup.handleGenerateReport();
        expect(toastText()).toBe('reportDateRangeRequired');
        emptyTranslations();
        await popup.handleGenerateReport();
        expect(toastText()).toBe('Please select both start and end dates');
        expect(mockHandlers.handleGenerateReport).not.toHaveBeenCalled();
      });

      it('passes the date range when both dates are present', async () => {
        setScope('dateRange');
        byId('reportDateStart').value = '2024-01-01';
        byId('reportDateEnd').value = '2024-01-31';
        await popup.handleGenerateReport();
        expect(mockHandlers.handleGenerateReport).toHaveBeenCalledWith(
          expect.objectContaining({ scope: 'dateRange', dateRange: expect.any(Object) }),
          expect.any(Array)
        );
      });

      it('reports missing date inputs', async () => {
        setup(() => {
          byId('reportDateStart').remove();
          byId('reportDateEnd').remove();
        });
        setScope('dateRange');
        await popup.handleGenerateReport();
        expect(toastText()).toBe('reportDateRangeRequired');
      });

      it('rejects the selected scope', async () => {
        setScope('selected');
        await popup.handleGenerateReport();
        expect(toastText()).toBe('reportNoNotesSelected');
        emptyTranslations();
        await popup.handleGenerateReport();
        expect(toastText()).toBe('Please select at least one note');
      });

      it('generates a report successfully', async () => {
        await popup.handleGenerateReport();
        expect(mockHandlers.handleGenerateReport).toHaveBeenCalled();
        expect(toastText()).toBe('reportGenerated');
        expect(reportHidden()).toBe(true);
      });

      it('uses fallback texts on success', async () => {
        emptyTranslations();
        await popup.handleGenerateReport();
        expect(toastText()).toBe('Report generated');
      });

      it('shows the failure reason or fallbacks', async () => {
        mockHandlers.handleGenerateReport.mockResolvedValueOnce({ success: false, error: 'bad' });
        await popup.handleGenerateReport();
        expect(toastText()).toBe('bad');
        mockHandlers.handleGenerateReport.mockResolvedValueOnce({ success: false });
        await popup.handleGenerateReport();
        expect(toastText()).toBe('reportFailed');
        emptyTranslations();
        mockHandlers.handleGenerateReport.mockResolvedValueOnce({ success: false });
        await popup.handleGenerateReport();
        expect(toastText()).toBe('Failed to generate report');
      });

      it('shows exception messages or fallbacks', async () => {
        mockHandlers.handleGenerateReport.mockRejectedValueOnce(new Error('thrown'));
        await popup.handleGenerateReport();
        expect(toastText()).toBe('thrown');
        mockHandlers.handleGenerateReport.mockRejectedValueOnce(new Error(''));
        await popup.handleGenerateReport();
        expect(toastText()).toBe('reportFailed');
        emptyTranslations();
        mockHandlers.handleGenerateReport.mockRejectedValueOnce(new Error(''));
        await popup.handleGenerateReport();
        expect(toastText()).toBe('Failed to generate report');
      });
    });

    describe('setupReportModal', () => {
      it('wires close buttons, backdrop and generate', async () => {
        popup.setupReportModal();
        popup.openReportModal();
        click(byId('reportModalClose'));
        expect(reportHidden()).toBe(true);
        popup.openReportModal();
        click(byId('reportModalCancel'));
        expect(reportHidden()).toBe(true);
        popup.openReportModal();
        click(byId('reportModal').querySelector('.modal-backdrop'));
        expect(reportHidden()).toBe(true);
        popup.openReportModal();
        click(byId('report-modal-generate'));
        await flush();
        expect(mockHandlers.handleGenerateReport).toHaveBeenCalled();
      });

      it('works when optional controls are missing', () => {
        setup(() => {
          byId('reportModalClose').remove();
          byId('reportModalCancel').remove();
          byId('report-modal-generate').remove();
          byId('reportModal').querySelector('.modal-backdrop').remove();
        });
        expect(() => popup.setupReportModal()).not.toThrow();
      });

      it('shows date inputs with default dates for the date range scope', () => {
        popup.setupReportModal();
        const radio = document.querySelector('input[name="reportScope"][value="dateRange"]');
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        expect(byId('dateRangeInputs').classList.contains('hidden')).toBe(false);
        expect(byId('reportDateStart').value).not.toBe('');
        expect(byId('reportDateEnd').value).not.toBe('');

        const other = document.querySelector('input[name="reportScope"][value="allNotes"]');
        other.checked = true;
        other.dispatchEvent(new Event('change', { bubbles: true }));
        expect(byId('dateRangeInputs').classList.contains('hidden')).toBe(true);
      });

      it('keeps existing dates and tolerates missing inputs', () => {
        popup.setupReportModal();
        byId('reportDateStart').value = '2020-01-01';
        byId('reportDateEnd').value = '2020-02-01';
        const radio = document.querySelector('input[name="reportScope"][value="dateRange"]');
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        expect(byId('reportDateStart').value).toBe('2020-01-01');
        expect(byId('reportDateEnd').value).toBe('2020-02-01');

        setup(() => {
          byId('dateRangeInputs').remove();
          byId('reportDateStart')?.remove();
          byId('reportDateEnd')?.remove();
        });
        popup.setupReportModal();
        const radio2 = document.querySelector('input[name="reportScope"][value="dateRange"]');
        const other = document.querySelector('input[name="reportScope"][value="allNotes"]');
        expect(() => radio2.dispatchEvent(new Event('change', { bubbles: true }))).not.toThrow();
        expect(() => other.dispatchEvent(new Event('change', { bubbles: true }))).not.toThrow();
      });

      it('closes on Escape only when visible', () => {
        popup.setupReportModal();
        popup.openReportModal();
        key(document, 'a');
        expect(reportHidden()).toBe(false);
        key(document, 'Escape');
        expect(reportHidden()).toBe(true);
      });
    });
  });
});
