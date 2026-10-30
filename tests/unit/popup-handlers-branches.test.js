/**
 * Popup Handlers - branch coverage tests
 * Mocks i18n and the report generator so translation fallbacks and lazy loading are reachable.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockTranslate = jest.fn((key) => key);
const mockGenerate = jest.fn();
const mockDownloadReport = jest.fn();

jest.unstable_mockModule('../src/shared/i18n.js', () => ({
  t: mockTranslate
}));

jest.unstable_mockModule('../src/shared/reportGenerator.js', () => ({
  ReportGenerator: class {
    constructor(options) {
      this.options = options;
    }

    generate(notes, context) {
      return mockGenerate(notes, context);
    }
  },
  downloadReport: mockDownloadReport,
  REPORT_FORMATS: { HTML: 'html', PDF: 'pdf', MARKDOWN: 'markdown' },
  REPORT_SCOPES: { CURRENT_PAGE: 'currentPage', ALL_NOTES: 'allNotes', SELECTED: 'selected', DATE_RANGE: 'dateRange' }
}));

const { createPopupHandlers } = await import('../../src/popup/handlers.js');

const TAB = { id: 7, url: 'https://example.com/page' };
const NO_RECEIVER = new Error('Receiving end does not exist');
const NO_CONNECTION = new Error('Could not establish connection');

const emptyTranslations = () => mockTranslate.mockImplementation(() => '');

describe('Popup handlers branches', () => {
  let log;
  let runtime;
  let tabs;
  let scripting;
  let storage;
  let windowClose;
  let errorToast;
  let successToast;

  const build = ({ toasts = true, extra = {} } = {}) => createPopupHandlers({
    log,
    chromeRuntime: runtime,
    chromeTabs: tabs,
    chromeScripting: scripting,
    chromeStorage: storage,
    windowClose,
    showErrorToast: toasts ? errorToast : null,
    showSuccessToast: toasts ? successToast : null,
    ...extra
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranslate.mockImplementation((key) => key);
    log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    runtime = { sendMessage: jest.fn() };
    tabs = { query: jest.fn().mockResolvedValue([TAB]), sendMessage: jest.fn().mockResolvedValue({ success: true }) };
    scripting = { executeScript: jest.fn().mockResolvedValue([]) };
    storage = { local: { get: jest.fn().mockResolvedValue({}) } };
    windowClose = jest.fn();
    errorToast = jest.fn();
    successToast = jest.fn();
    globalThis.chrome.webNavigation = { getAllFrames: jest.fn().mockResolvedValue([{ frameId: 0 }, { frameId: 1 }]) };
    globalThis.chrome.permissions = {
      contains: jest.fn().mockResolvedValue(true),
      request: jest.fn().mockResolvedValue(true),
      remove: jest.fn().mockResolvedValue(true)
    };
    jest.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('defaults', () => {
    it('uses window.close as the default windowClose', async () => {
      const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
      const handlers = createPopupHandlers({ chromeTabs: tabs, log });
      await handlers.handleNoteClick('n1');
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('auth', () => {
    it('checkAuthState returns the user, null or null on error', async () => {
      const handlers = build();
      storage.local.get.mockResolvedValueOnce({ user: { email: 'a@b.co' } });
      expect(await handlers.checkAuthState()).toEqual({ email: 'a@b.co' });
      storage.local.get.mockResolvedValueOnce({});
      expect(await handlers.checkAuthState()).toBeNull();
      storage.local.get.mockRejectedValueOnce(new Error('x'));
      expect(await handlers.checkAuthState()).toBeNull();
    });

    it('handleLogin covers success, failure and exception', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValueOnce({ success: true, user: { uid: 'u' } });
      expect(await handlers.handleLogin()).toEqual({ success: true, user: { uid: 'u' } });
      runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'bad' });
      expect(await handlers.handleLogin()).toEqual({ success: false, error: 'bad' });
      runtime.sendMessage.mockRejectedValueOnce(new Error('boom'));
      expect(await handlers.handleLogin()).toEqual({ success: false, error: 'boom' });
    });

    it('handleLogout covers success and exception', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValueOnce({ success: true });
      expect(await handlers.handleLogout()).toEqual({ success: true });
      runtime.sendMessage.mockRejectedValueOnce(new Error('boom'));
      expect(await handlers.handleLogout()).toEqual({ success: false, error: 'boom' });
    });
  });

  describe('injectContentScript', () => {
    it('resolves on success and wraps errors', async () => {
      const handlers = build();
      await expect(handlers.injectContentScript(1)).resolves.toBeUndefined();
      scripting.executeScript.mockRejectedValueOnce(new Error('nope'));
      await expect(handlers.injectContentScript(1)).rejects.toThrow('Could not inject content script: nope');
    });
  });

  describe('ensureContentScriptInCurrentTab', () => {
    it('fails without an active tab id or url', async () => {
      const handlers = build();
      tabs.query.mockResolvedValueOnce([]);
      expect((await handlers.ensureContentScriptInCurrentTab()).error).toBe('No active tab');
      tabs.query.mockResolvedValueOnce([{ id: 1 }]);
      expect((await handlers.ensureContentScriptInCurrentTab()).error).toBe('No active tab');
      tabs.query.mockResolvedValueOnce([{ url: 'https://a.com' }]);
      expect((await handlers.ensureContentScriptInCurrentTab()).error).toBe('No active tab');
    });

    it.each(['chrome://x', 'chrome-extension://x', 'edge://x', 'about:blank'])('rejects restricted url %s', async (url) => {
      const handlers = build();
      tabs.query.mockResolvedValueOnce([{ id: 1, url }]);
      expect((await handlers.ensureContentScriptInCurrentTab()).error).toBe('Restricted URL');
    });

    it('reports already injected when ping succeeds', async () => {
      const handlers = build();
      expect(await handlers.ensureContentScriptInCurrentTab()).toEqual({ success: true, alreadyInjected: true });
    });

    it('injects through the background when permission is already held', async () => {
      const handlers = build();
      tabs.sendMessage.mockRejectedValue(new Error('no script'));
      runtime.sendMessage.mockResolvedValue({ success: true });
      expect(await handlers.ensureContentScriptInCurrentTab()).toEqual({ success: true });
      expect(chrome.permissions.request).not.toHaveBeenCalled();
    });

    it('requests permission and injects when granted', async () => {
      const handlers = build();
      tabs.sendMessage.mockRejectedValue(new Error('no script'));
      chrome.permissions.contains.mockResolvedValue(false);
      runtime.sendMessage.mockResolvedValue({ success: true });
      expect(await handlers.ensureContentScriptInCurrentTab()).toEqual({ success: true });
      expect(chrome.permissions.request).toHaveBeenCalled();
    });

    it('returns needsPermission when the user denies', async () => {
      const handlers = build();
      tabs.sendMessage.mockRejectedValue(new Error('no script'));
      chrome.permissions.contains.mockResolvedValue(false);
      chrome.permissions.request.mockResolvedValue(false);
      expect(await handlers.ensureContentScriptInCurrentTab()).toEqual({
        success: false,
        error: 'Permission denied',
        needsPermission: true
      });
    });

    it('returns an error when something throws', async () => {
      const handlers = build();
      tabs.query.mockRejectedValueOnce(new Error('query failed'));
      expect(await handlers.ensureContentScriptInCurrentTab()).toEqual({ success: false, error: 'query failed' });
    });
  });

  describe('handleAddNote', () => {
    it('fails when there is no tab', async () => {
      const handlers = build();
      tabs.query.mockResolvedValueOnce([]);
      expect(await handlers.handleAddNote()).toEqual({ success: false, error: 'No active tab found' });
    });

    it('fails on a restricted url', async () => {
      const handlers = build();
      tabs.query.mockResolvedValueOnce([{ id: 1, url: 'chrome://settings' }]);
      expect(await handlers.handleAddNote()).toEqual({ success: false, error: 'Restricted URL' });
    });

    it.each([
      ['with toast', true, ''],
      ['with toast and translation', true, 'translated'],
      ['without toast', false, '']
    ])('fails when permission is denied (%s)', async (_label, toasts, translation) => {
      mockTranslate.mockImplementation(() => translation);
      const handlers = build({ toasts });
      tabs.sendMessage.mockRejectedValue(new Error('no script'));
      chrome.permissions.contains.mockResolvedValue(false);
      chrome.permissions.request.mockResolvedValue(false);

      expect(await handlers.handleAddNote()).toEqual({ success: false, error: 'Permission denied' });
      if (toasts) {
        expect(errorToast).toHaveBeenCalledWith(translation || 'Permission required to create notes on this page');
      } else {
        expect(errorToast).not.toHaveBeenCalled();
      }
    });

    it('enables selection mode in all frames and tolerates frame errors', async () => {
      const handlers = build();
      tabs.sendMessage.mockImplementation(async (_id, msg, opts) => {
        if (msg.action === 'ping') return { ok: true };
        if (opts && opts.frameId === 1) throw new Error('frame fail');
        if (!opts) throw new Error('fallback fail');
        return { success: true };
      });

      expect(await handlers.handleAddNote()).toEqual({ success: true });
      expect(windowClose).toHaveBeenCalled();
    });

    it('handles a missing frame list', async () => {
      const handlers = build();
      chrome.webNavigation.getAllFrames.mockResolvedValue(undefined);
      expect(await handlers.handleAddNote()).toEqual({ success: true });
    });

    it.each([NO_RECEIVER, NO_CONNECTION])('injects and retries when the content script is missing (%s)', async (err) => {
      const handlers = build();
      chrome.webNavigation.getAllFrames.mockRejectedValue(err);

      expect(await handlers.handleAddNote()).toEqual({ success: true });
      expect(scripting.executeScript).toHaveBeenCalled();
      expect(windowClose).toHaveBeenCalled();
    });

    it('retries after failures and then succeeds', async () => {
      const handlers = build();
      chrome.webNavigation.getAllFrames.mockRejectedValue(NO_RECEIVER);
      let enableCalls = 0;
      tabs.sendMessage.mockImplementation(async (_id, msg) => {
        if (msg.action === 'ping') return { ok: true };
        enableCalls++;
        if (enableCalls < 3) throw new Error('not ready');
        return { success: true };
      });

      expect(await handlers.handleAddNote()).toEqual({ success: true });
      expect(enableCalls).toBe(3);
    });

    it('fails with the last error after all retries and toasts', async () => {
      const handlers = build();
      chrome.webNavigation.getAllFrames.mockRejectedValue(NO_RECEIVER);
      tabs.sendMessage.mockImplementation(async (_id, msg) => {
        if (msg.action === 'ping') return { ok: true };
        throw new Error('still not ready');
      });

      expect(await handlers.handleAddNote()).toEqual({ success: false, error: 'still not ready' });
      expect(errorToast).toHaveBeenCalled();
    });

    it('uses a generic error when every retry rejects without a reason', async () => {
      const handlers = build();
      chrome.webNavigation.getAllFrames.mockRejectedValue(NO_RECEIVER);
      tabs.sendMessage.mockImplementation(async (_id, msg) => {
        if (msg.action === 'ping') return { ok: true };
        return Promise.reject(undefined);
      });

      expect(await handlers.handleAddNote()).toEqual({
        success: false,
        error: 'Content script failed to respond after injection'
      });
    });

    it('fails without a toast function', async () => {
      const handlers = build({ toasts: false });
      chrome.webNavigation.getAllFrames.mockRejectedValue(NO_RECEIVER);
      scripting.executeScript.mockRejectedValue(new Error('inject failed'));

      const result = await handlers.handleAddNote();
      expect(result.success).toBe(false);
      expect(result.error).toContain('inject failed');
    });

    it('rethrows unrelated errors', async () => {
      const handlers = build();
      chrome.webNavigation.getAllFrames.mockRejectedValue(new Error('weird'));
      expect(await handlers.handleAddNote()).toEqual({ success: false, error: 'weird' });
      expect(errorToast).toHaveBeenCalled();
    });
  });

  describe('handleAddPageNote', () => {
    const pageNoteTabs = (handler) => {
      tabs.sendMessage.mockImplementation(async (_id, msg) => {
        if (msg.action === 'ping') return { ok: true };
        return handler(msg);
      });
    };

    it('fails when there is no tab', async () => {
      const handlers = build();
      tabs.query.mockResolvedValueOnce([]);
      expect(await handlers.handleAddPageNote()).toEqual({ success: false, error: 'No active tab found' });
    });

    it('fails on a restricted url', async () => {
      const handlers = build();
      tabs.query.mockResolvedValueOnce([{ id: 1, url: 'about:blank' }]);
      expect(await handlers.handleAddPageNote()).toEqual({ success: false, error: 'Restricted URL' });
    });

    it.each([
      [true, ''],
      [true, 'translated'],
      [false, '']
    ])('fails when permission is denied (toast %s, translation %j)', async (toasts, translation) => {
      mockTranslate.mockImplementation(() => translation);
      const handlers = build({ toasts });
      tabs.sendMessage.mockRejectedValue(new Error('no script'));
      chrome.permissions.contains.mockResolvedValue(false);
      chrome.permissions.request.mockResolvedValue(false);

      expect(await handlers.handleAddPageNote()).toEqual({ success: false, error: 'Permission denied' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([true, false])('creates the note (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      pageNoteTabs(() => ({ success: true }));
      expect(await handlers.handleAddPageNote()).toEqual({ success: true });
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
      expect(windowClose).toHaveBeenCalled();
    });

    it.each([
      [true, { success: false, error: 'bad' }, 'bad'],
      [true, undefined, 'Unknown error'],
      [false, { success: false }, 'Unknown error']
    ])('reports a failed response (toasts %s)', async (toasts, response, expected) => {
      const handlers = build({ toasts });
      pageNoteTabs(() => response);
      expect(await handlers.handleAddPageNote()).toEqual({ success: false, error: expected });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    describe('after injection', () => {
      const failThenRespond = (responder) => {
        let calls = 0;
        tabs.sendMessage.mockImplementation(async (_id, msg) => {
          if (msg.action === 'ping') return { ok: true };
          calls++;
          if (calls === 1) throw NO_RECEIVER;
          return responder(calls);
        });
      };

      it.each([true, false])('succeeds on retry (toasts %s)', async (toasts) => {
        const handlers = build({ toasts });
        failThenRespond(() => ({ success: true }));
        expect(await handlers.handleAddPageNote()).toEqual({ success: true });
        expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
        expect(scripting.executeScript).toHaveBeenCalled();
      });

      it('also handles the could not establish connection error', async () => {
        const handlers = build();
        let calls = 0;
        tabs.sendMessage.mockImplementation(async (_id, msg) => {
          if (msg.action === 'ping') return { ok: true };
          calls++;
          if (calls === 1) throw NO_CONNECTION;
          return { success: true };
        });
        expect(await handlers.handleAddPageNote()).toEqual({ success: true });
      });

      it.each([
        [true, { success: false, error: 'late' }, 'late'],
        [false, { success: false }, 'Unknown error'],
        [true, undefined, 'Unknown error']
      ])('stops retrying when the script answers with failure (toasts %s)', async (toasts, response, expected) => {
        const handlers = build({ toasts });
        failThenRespond(() => response);
        expect(await handlers.handleAddPageNote()).toEqual({ success: false, error: expected });
        expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
      });

      it('uses a generic error when every retry rejects without a reason', async () => {
        const handlers = build();
        let calls = 0;
        tabs.sendMessage.mockImplementation(async (_id, msg) => {
          if (msg.action === 'ping') return { ok: true };
          calls++;
          if (calls === 1) throw NO_RECEIVER;
          return Promise.reject(undefined);
        });
        expect(await handlers.handleAddPageNote()).toEqual({
          success: false,
          error: 'Content script failed to respond after injection'
        });
      });

      it('retries and then fails with the last error', async () => {
        const handlers = build();
        let calls = 0;
        tabs.sendMessage.mockImplementation(async (_id, msg) => {
          if (msg.action === 'ping') return { ok: true };
          calls++;
          if (calls === 1) throw NO_RECEIVER;
          throw new Error('never ready');
        });
        expect(await handlers.handleAddPageNote()).toEqual({ success: false, error: 'never ready' });
        expect(calls).toBe(6);
      });
    });

    it('rethrows unrelated errors with and without toast', async () => {
      pageNoteTabs(() => {
        throw new Error('other');
      });
      expect(await build().handleAddPageNote()).toEqual({ success: false, error: 'other' });
      expect(errorToast).toHaveBeenCalled();
      errorToast.mockClear();
      expect(await build({ toasts: false }).handleAddPageNote()).toEqual({ success: false, error: 'other' });
      expect(errorToast).not.toHaveBeenCalled();
    });
  });

  describe('notes loading and clicks', () => {
    it('loadNotesForCurrentTab covers all outcomes', async () => {
      const handlers = build();
      tabs.query.mockResolvedValueOnce([]);
      expect((await handlers.loadNotesForCurrentTab()).error).toBe('No active tab');

      runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'denied' });
      expect(await handlers.loadNotesForCurrentTab()).toEqual({ success: false, notes: [], error: 'denied' });

      runtime.sendMessage.mockResolvedValueOnce({ success: true });
      expect(await handlers.loadNotesForCurrentTab()).toEqual({ success: true, notes: [] });

      runtime.sendMessage.mockResolvedValueOnce({ success: true, notes: [{ id: 'a' }] });
      expect(await handlers.loadNotesForCurrentTab()).toEqual({ success: true, notes: [{ id: 'a' }] });

      runtime.sendMessage.mockRejectedValueOnce(new Error('down'));
      expect(await handlers.loadNotesForCurrentTab()).toEqual({ success: false, notes: [], error: 'down' });
    });

    it('handleNoteClick covers normal, orphaned, no tab and failure', async () => {
      const handlers = build();
      expect(await handlers.handleNoteClick('n1')).toEqual({ success: true });
      expect(tabs.sendMessage).toHaveBeenLastCalledWith(7, { action: 'highlightNote', noteId: 'n1' });
      await handlers.handleNoteClick('n1', true);
      expect(tabs.sendMessage).toHaveBeenLastCalledWith(7, { action: 'showOrphanedNote', noteId: 'n1' });

      tabs.query.mockResolvedValueOnce([]);
      expect(await handlers.handleNoteClick('n1')).toEqual({ success: false, error: 'No active tab' });

      tabs.sendMessage.mockRejectedValueOnce(new Error('gone'));
      expect(await handlers.handleNoteClick('n1')).toEqual({ success: false, error: 'gone' });
    });
  });

  describe('rendering', () => {
    it('getThemeColor falls back to yellow and truncateSelector truncates', () => {
      const handlers = build();
      expect(handlers.getThemeColor('unknown')).toBe(handlers.getThemeColor('yellow'));
      expect(handlers.truncateSelector('a'.repeat(50)).length).toBeLessThan(50);
    });

    it('renderNoteItem covers orphaned and empty-content variants', () => {
      const handlers = build();
      const plain = handlers.renderNoteItem({ id: '1', theme: 'blue', content: '<b>Hi</b>', selector: '#a' });
      expect(plain).toContain('Hi');
      expect(plain).not.toContain('data-orphaned');
      const orphan = handlers.renderNoteItem({ id: '2', isOrphaned: true, content: '', selector: '#b' });
      expect(orphan).toContain('data-orphaned="true"');
      expect(orphan).toContain('emptyNote');
    });

    it('renderEmptyNotes and renderEmptySharedNotes return markup', () => {
      const handlers = build();
      expect(handlers.renderEmptyNotes()).toContain('noNotesYet');
      expect(handlers.renderEmptySharedNotes()).toContain('noUnreadSharedNotes');
    });

    it('renderNoteItemExpanded covers owned, hidden, orphaned and shared variants', () => {
      const handlers = build();
      const owned = handlers.renderNoteItemExpanded({ id: '1', content: 'x', selector: '#a', theme: 'pink', sharedWith: ['a@b.co', 'c@d.co'], ownerEmail: 'o@x.co' });
      expect(owned).toContain('a@b.co, c@d.co');
      expect(owned).toContain('data-action="share"');
      expect(owned).toContain('data-action="delete"');
      expect(owned).toContain('hideNote');

      const bare = handlers.renderNoteItemExpanded({ id: '2', content: '', selector: '#a', sharedWith: [] });
      expect(bare).toContain('notShared');
      expect(bare).toContain('anonymous');
      expect(bare).toContain('emptyNote');
      expect(bare).toContain('yellow');

      const special = handlers.renderNoteItemExpanded({ id: '3', content: 'x', selector: '#a', isHidden: true, isOrphaned: true, isShared: true });
      expect(special).toContain('data-hidden="true"');
      expect(special).toContain('data-orphaned="true"');
      expect(special).toContain('note-item-shared-badge');
      expect(special).toContain('data-action="leave"');
      expect(special).toContain('showNote');
    });

    it('renderSharedNoteItem covers url variants', () => {
      const handlers = build();
      const root = handlers.renderSharedNoteItem({ id: '1', url: 'https://example.com/', content: 'x', ownerEmail: 'o@x.co' });
      expect(root).toContain('example.com');
      const withPath = handlers.renderSharedNoteItem({ id: '2', url: 'https://example.com/a/path', content: '' });
      expect(withPath).toContain('example.com/a/path');
      expect(withPath).toContain('anonymous');
      expect(withPath).toContain('emptyNote');
      const long = handlers.renderSharedNoteItem({ id: '3', url: `https://example.com/${'p'.repeat(60)}` });
      expect(long).toContain('...');
      const invalid = handlers.renderSharedNoteItem({ id: '4', url: 'not a url' });
      expect(invalid).toContain('not a url');
      const missing = handlers.renderSharedNoteItem({ id: '5' });
      expect(missing).toContain('data-id="5"');
    });
  });

  describe('delete handlers', () => {
    it.each([true, false])('handleDeleteNote success (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: true });
      expect(await handlers.handleDeleteNote('n')).toEqual({ success: true });
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([
      [true, 'nope', 'nope'],
      [true, undefined, 'failedToDelete'],
      [false, 'nope', 'nope']
    ])('handleDeleteNote failure (toasts %s)', async (toasts, error, shown) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: false, error });
      expect(await handlers.handleDeleteNote('n')).toEqual({ success: false, error });
      if (toasts) expect(errorToast).toHaveBeenCalledWith(shown);
      else expect(errorToast).not.toHaveBeenCalled();
    });

    it.each([true, false])('handleDeleteNote exception (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockRejectedValue(new Error('x'));
      expect(await handlers.handleDeleteNote('n')).toEqual({ success: false, error: 'x' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([true, false])('handleDeleteAllFromPage counts successes (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false });
      expect(await handlers.handleDeleteAllFromPage([{ id: 'a' }, { id: 'b' }])).toEqual({ success: true, count: 1 });
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([true, false])('handleDeleteAllFromPage exception (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockRejectedValue(new Error('x'));
      expect(await handlers.handleDeleteAllFromPage([{ id: 'a' }])).toEqual({ success: false, error: 'x' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it('getAllNotes covers all outcomes', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValueOnce({ success: true });
      expect(await handlers.getAllNotes()).toEqual({ success: true, notes: [] });
      runtime.sendMessage.mockResolvedValueOnce({ success: true, notes: [{ id: 'a' }] });
      expect(await handlers.getAllNotes()).toEqual({ success: true, notes: [{ id: 'a' }] });
      runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'e' });
      expect(await handlers.getAllNotes()).toEqual({ success: false, notes: [], error: 'e' });
      runtime.sendMessage.mockRejectedValueOnce(new Error('x'));
      expect(await handlers.getAllNotes()).toEqual({ success: false, notes: [], error: 'x' });
    });

    it.each([true, false])('handleDeleteAllNotes success (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValueOnce({ success: true, count: 3 });
      expect(await handlers.handleDeleteAllNotes()).toEqual({ success: true, count: 3 });
      runtime.sendMessage.mockResolvedValueOnce({ success: true });
      expect(await handlers.handleDeleteAllNotes()).toEqual({ success: true, count: undefined });
      expect(successToast).toHaveBeenCalledTimes(toasts ? 2 : 0);
    });

    it.each([
      [true, 'nope', 'nope'],
      [true, undefined, 'failedToDelete'],
      [false, 'nope', 'nope']
    ])('handleDeleteAllNotes failure (toasts %s)', async (toasts, error, shown) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: false, error });
      expect(await handlers.handleDeleteAllNotes()).toEqual({ success: false, error });
      if (toasts) expect(errorToast).toHaveBeenCalledWith(shown);
      else expect(errorToast).not.toHaveBeenCalled();
    });

    it.each([true, false])('handleDeleteAllNotes exception (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockRejectedValue(new Error('x'));
      expect(await handlers.handleDeleteAllNotes()).toEqual({ success: false, error: 'x' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });
  });

  describe('share and leave', () => {
    it.each([true, false])('handleShareNote rejects invalid email (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      expect(await handlers.handleShareNote('n', 'bad')).toEqual({ success: false, error: 'invalidEmail' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([true, false])('handleShareNote success (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: true });
      expect(await handlers.handleShareNote('n', 'a@b.co')).toEqual({ success: true });
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([
      [true, 'nope', 'nope'],
      [true, undefined, 'failedToShare'],
      [false, 'nope', 'nope']
    ])('handleShareNote failure (toasts %s)', async (toasts, error, shown) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: false, error });
      expect(await handlers.handleShareNote('n', 'a@b.co')).toEqual({ success: false, error });
      if (toasts) expect(errorToast).toHaveBeenCalledWith(shown);
      else expect(errorToast).not.toHaveBeenCalled();
    });

    it.each([true, false])('handleShareNote exception (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockRejectedValue(new Error('x'));
      expect(await handlers.handleShareNote('n', 'a@b.co')).toEqual({ success: false, error: 'x' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([true, false])('handleLeaveNote success (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: true });
      expect(await handlers.handleLeaveNote('n')).toEqual({ success: true });
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it.each([
      [true, 'nope', 'nope'],
      [true, undefined, 'failedToLeave'],
      [false, 'nope', 'nope']
    ])('handleLeaveNote failure (toasts %s)', async (toasts, error, shown) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: false, error });
      expect(await handlers.handleLeaveNote('n')).toEqual({ success: false, error });
      if (toasts) expect(errorToast).toHaveBeenCalledWith(shown);
      else expect(errorToast).not.toHaveBeenCalled();
    });

    it.each([true, false])('handleLeaveNote exception (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockRejectedValue(new Error('x'));
      expect(await handlers.handleLeaveNote('n')).toEqual({ success: false, error: 'x' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });
  });

  describe('handleExportCSV', () => {
    beforeEach(() => {
      URL.createObjectURL = jest.fn(() => 'blob:x');
      URL.revokeObjectURL = jest.fn();
      jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    it.each([true, false])('rejects empty input (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      expect(await handlers.handleExportCSV([])).toEqual({ success: false, error: 'noNotesToExport' });
      expect(await handlers.handleExportCSV(null)).toEqual({ success: false, error: 'noNotesToExport' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 2 : 0);
    });

    it.each([true, false])('exports notes with escaping (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      const notes = [
        { id: '1', url: 'u', selector: 'a,b', content: 'line\nbreak', theme: 'blue', createdAt: '2024-01-01T00:00:00Z', updatedAt: { seconds: 1700000000 }, ownerEmail: 'o@x.co', sharedWith: ['a@b.co', 'c@d.co'] },
        { id: '2', url: null, selector: 'say "hi"', content: '', theme: undefined, createdAt: 'garbage', updatedAt: null, sharedWith: 'nope' }
      ];
      expect(await handlers.handleExportCSV(notes, 'out.csv')).toEqual({ success: true, count: 2 });
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it('uses the default filename', async () => {
      const handlers = build();
      expect(await handlers.handleExportCSV([{ id: '1' }])).toEqual({ success: true, count: 1 });
    });

    it.each([true, false])('reports exceptions (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      URL.createObjectURL = jest.fn(() => {
        throw new Error('blob fail');
      });
      expect(await handlers.handleExportCSV([{ id: '1' }])).toEqual({ success: false, error: 'blob fail' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });
  });

  describe('formatTimestamp', () => {
    it('handles empty, firestore, string and invalid values', () => {
      const handlers = build();
      expect(handlers.formatTimestamp(null)).toBe('');
      expect(handlers.formatTimestamp({ seconds: 1 })).toBe(new Date(1000).toISOString());
      expect(handlers.formatTimestamp('2024-01-01T00:00:00.000Z')).toBe('2024-01-01T00:00:00.000Z');
      expect(handlers.formatTimestamp('nope')).toBe('');
    });
  });

  describe('handleGenerateReport', () => {
    const notes = [{ id: 'a' }, { id: 'b' }];

    beforeEach(() => {
      mockGenerate.mockResolvedValue({ filename: 'report.html' });
    });

    it.each([true, false])('generates for the current page (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      expect(await handlers.handleGenerateReport({ scope: 'currentPage' }, notes)).toEqual({ success: true, filename: 'report.html' });
      expect(mockDownloadReport).toHaveBeenCalled();
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it('falls back to the default report text when translations are empty', async () => {
      emptyTranslations();
      const handlers = build();
      await handlers.handleGenerateReport({ scope: 'currentPage' }, notes);
      expect(successToast).toHaveBeenCalledWith('Report generated');
    });

    it('uses an empty default for current page notes', async () => {
      const handlers = build();
      expect((await handlers.handleGenerateReport({ scope: 'currentPage' })).success).toBe(false);
    });

    it.each(['allNotes', 'dateRange'])('loads all notes for scope %s', async (scope) => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValue({ success: true, notes });
      expect((await handlers.handleGenerateReport({ scope })).success).toBe(true);
    });

    it('returns the error when all notes cannot be loaded', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValue({ success: false, error: 'load failed' });
      expect(await handlers.handleGenerateReport({ scope: 'allNotes' })).toEqual({ success: false, error: 'load failed' });
    });

    it('requires selected note ids', async () => {
      const handlers = build();
      expect(await handlers.handleGenerateReport({ scope: 'selected' })).toEqual({ success: false, error: 'reportNoNotesSelected' });
      expect(await handlers.handleGenerateReport({ scope: 'selected', selectedNoteIds: [] })).toEqual({ success: false, error: 'reportNoNotesSelected' });
      emptyTranslations();
      expect(await handlers.handleGenerateReport({ scope: 'selected', selectedNoteIds: [] })).toEqual({ success: false, error: 'No notes selected' });
    });

    it('filters selected notes', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValue({ success: true, notes });
      await handlers.handleGenerateReport({ scope: 'selected', selectedNoteIds: ['b'] });
      expect(mockGenerate.mock.calls[0][0]).toEqual([{ id: 'b' }]);
    });

    it('returns the error when selected notes cannot be loaded', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValue({ success: false, error: 'load failed' });
      expect(await handlers.handleGenerateReport({ scope: 'selected', selectedNoteIds: ['a'] })).toEqual({ success: false, error: 'load failed' });
    });

    it.each([true, false])('reports when there are no notes (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      expect(await handlers.handleGenerateReport({ scope: 'unknown' })).toEqual({ success: false, error: 'noNotesForReport' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
      emptyTranslations();
      expect((await handlers.handleGenerateReport({ scope: 'unknown' })).error).toBe('No notes to include in report');
    });

    it('fetches comments and tolerates failures', async () => {
      const handlers = build();
      const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      runtime.sendMessage.mockImplementation(async (msg) => {
        if (msg.noteId === 'a') return { success: true, comments: [{ id: 'c1' }] };
        if (msg.noteId === 'b') return { success: false };
        throw new Error('fail');
      });
      await handlers.handleGenerateReport({ scope: 'currentPage', includeComments: true }, list);
      expect(list[0].comments).toEqual([{ id: 'c1' }]);
      expect(list[1].comments).toBeUndefined();
      expect(list[2].comments).toEqual([]);
    });

    it('treats a successful response without comments as no comments', async () => {
      const handlers = build();
      const list = [{ id: 'a' }];
      runtime.sendMessage.mockResolvedValue({ success: true });
      await handlers.handleGenerateReport({ scope: 'currentPage', includeComments: true }, list);
      expect(list[0].comments).toBeUndefined();
    });

    it('passes the user email as context', async () => {
      const handlers = build();
      storage.local.get.mockResolvedValue({ user: { email: 'me@x.co' } });
      await handlers.handleGenerateReport({ scope: 'currentPage' }, notes);
      expect(mockGenerate.mock.calls[0][1]).toEqual({ userEmail: 'me@x.co' });
      storage.local.get.mockResolvedValue({ user: {} });
      await handlers.handleGenerateReport({ scope: 'currentPage' }, notes);
      expect(mockGenerate.mock.calls[1][1]).toEqual({ userEmail: '' });
    });

    it.each([true, false])('reports generator failures (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      mockGenerate.mockRejectedValue(new Error('gen fail'));
      expect(await handlers.handleGenerateReport({ scope: 'currentPage' }, notes)).toEqual({ success: false, error: 'gen fail' });
      expect(errorToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
    });

    it('uses the fallback failure message', async () => {
      emptyTranslations();
      const handlers = build();
      mockGenerate.mockRejectedValue(new Error('gen fail'));
      await handlers.handleGenerateReport({ scope: 'currentPage' }, notes);
      expect(errorToast).toHaveBeenCalledWith('Failed to generate report');
    });
  });

  describe('showShareModal', () => {
    const open = () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValue({ success: true });
      const promise = handlers.showShareModal('note-1');
      const overlay = document.querySelector('.confirm-backdrop');
      return {
        promise,
        overlay,
        input: overlay.querySelector('.share-email-input'),
        cancel: overlay.querySelector('.confirm-btn-cancel'),
        share: overlay.querySelector('.confirm-btn:not(.confirm-btn-cancel)')
      };
    };

    it('cancels', async () => {
      const modal = open();
      modal.cancel.click();
      await modal.promise;
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });

    it('shares with a typed email via the button', async () => {
      const modal = open();
      modal.input.value = ' a@b.co ';
      modal.share.click();
      await modal.promise;
      expect(runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'shareNote', email: 'a@b.co' }));
    });

    it('closes without sharing when the email is empty', async () => {
      const modal = open();
      modal.share.click();
      await modal.promise;
      expect(runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('shares on Enter', async () => {
      const modal = open();
      modal.input.value = 'a@b.co';
      modal.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await modal.promise;
      expect(runtime.sendMessage).toHaveBeenCalled();
    });

    it('closes on Enter with an empty email', async () => {
      const modal = open();
      modal.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await modal.promise;
      expect(runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('closes on Escape and ignores other keys', async () => {
      const modal = open();
      modal.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(document.querySelector('.confirm-backdrop')).not.toBeNull();
      modal.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await modal.promise;
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });

    it('closes on backdrop click but not on inner click', async () => {
      const modal = open();
      modal.input.click();
      expect(document.querySelector('.confirm-backdrop')).not.toBeNull();
      modal.overlay.click();
      await modal.promise;
      expect(document.querySelector('.confirm-backdrop')).toBeNull();
    });
  });

  describe('showConfirmDialog', () => {
    const open = () => {
      const handlers = build();
      const promise = handlers.showConfirmDialog('Sure?');
      const overlay = document.querySelector('.confirm-backdrop');
      return {
        promise,
        overlay,
        cancel: overlay.querySelector('.confirm-btn-cancel'),
        confirm: overlay.querySelector('.confirm-btn-confirm')
      };
    };

    it('resolves false on cancel', async () => {
      const dialog = open();
      dialog.cancel.click();
      expect(await dialog.promise).toBe(false);
    });

    it('resolves true on confirm', async () => {
      const dialog = open();
      dialog.confirm.click();
      expect(await dialog.promise).toBe(true);
    });

    it('resolves false on Escape', async () => {
      const dialog = open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(await dialog.promise).toBe(false);
    });

    it('resolves true on Enter', async () => {
      const dialog = open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(await dialog.promise).toBe(true);
    });

    it('ignores other keys and inner clicks, resolves false on backdrop click', async () => {
      const dialog = open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      dialog.overlay.querySelector('.confirm-message').click();
      expect(document.querySelector('.confirm-backdrop')).not.toBeNull();
      dialog.overlay.click();
      expect(await dialog.promise).toBe(false);
    });
  });

  describe('shared notes', () => {
    it('getUnreadSharedNotes covers all outcomes', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValueOnce({ success: true });
      expect(await handlers.getUnreadSharedNotes()).toEqual({ success: true, notes: [] });
      runtime.sendMessage.mockResolvedValueOnce({ success: true, notes: [{ id: 'a' }] });
      expect(await handlers.getUnreadSharedNotes()).toEqual({ success: true, notes: [{ id: 'a' }] });
      runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'e' });
      expect(await handlers.getUnreadSharedNotes()).toEqual({ success: false, notes: [], error: 'e' });
      runtime.sendMessage.mockRejectedValueOnce(new Error('x'));
      expect(await handlers.getUnreadSharedNotes()).toEqual({ success: false, notes: [], error: 'x' });
    });

    it('getUnreadSharedCount covers all outcomes', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValueOnce({ success: true });
      expect(await handlers.getUnreadSharedCount()).toEqual({ success: true, count: 0 });
      runtime.sendMessage.mockResolvedValueOnce({ success: true, count: 4 });
      expect(await handlers.getUnreadSharedCount()).toEqual({ success: true, count: 4 });
      runtime.sendMessage.mockResolvedValueOnce({ success: false, error: 'e' });
      expect(await handlers.getUnreadSharedCount()).toEqual({ success: false, count: 0, error: 'e' });
      runtime.sendMessage.mockRejectedValueOnce(new Error('x'));
      expect(await handlers.getUnreadSharedCount()).toEqual({ success: false, count: 0, error: 'x' });
    });

    it('markSharedNoteAsRead covers success and exception', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValueOnce({ success: true });
      expect(await handlers.markSharedNoteAsRead('n')).toEqual({ success: true });
      runtime.sendMessage.mockRejectedValueOnce(new Error('x'));
      expect(await handlers.markSharedNoteAsRead('n')).toEqual({ success: false, error: 'x' });
    });
  });

  describe('old notes', () => {
    it('filterNotesByAge validates input', () => {
      const handlers = build();
      expect(handlers.filterNotesByAge(null, 5)).toEqual([]);
      expect(handlers.filterNotesByAge([], 5)).toEqual([]);
      expect(handlers.filterNotesByAge([{ id: 'a' }], 'x')).toEqual([]);
      expect(handlers.filterNotesByAge([{ id: 'a' }], 0)).toEqual([]);
      expect(handlers.filterNotesByAge([{ id: 'a' }], Infinity)).toEqual([]);
    });

    it('filterNotesByAge filters by creation date', () => {
      const handlers = build();
      const old = new Date(Date.now() - 40 * 86400000).toISOString();
      const fresh = new Date().toISOString();
      const result = handlers.filterNotesByAge([
        { id: 'none' },
        { id: 'old', createdAt: old },
        { id: 'fresh', createdAt: fresh },
        { id: 'fs', createdAt: { seconds: Math.floor((Date.now() - 60 * 86400000) / 1000) } },
        { id: 'bad', createdAt: 'garbage' }
      ], 30);
      expect(result.map(note => note.id)).toEqual(['old', 'fs']);
    });

    it('handleDeleteOldNotes handles empty input', async () => {
      const handlers = build();
      expect(await handlers.handleDeleteOldNotes([])).toEqual({ success: true, count: 0 });
      expect(await handlers.handleDeleteOldNotes(null)).toEqual({ success: true, count: 0 });
    });

    it.each([true, false])('handleDeleteOldNotes tracks successes and errors (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'denied' })
        .mockRejectedValueOnce(new Error('thrown'));
      const result = await handlers.handleDeleteOldNotes([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
      expect(result.count).toBe(1);
      expect(result.errors).toEqual([
        { noteId: 'b', error: 'denied' },
        { noteId: 'c', error: 'thrown' }
      ]);
      expect(successToast).toHaveBeenCalledTimes(toasts ? 1 : 0);
      expect(log.error).toHaveBeenCalled();
    });

    it('handleDeleteOldNotes skips the toast when nothing was deleted', async () => {
      const handlers = build();
      runtime.sendMessage.mockResolvedValue({ success: false });
      const result = await handlers.handleDeleteOldNotes([{ id: 'a' }]);
      expect(result.count).toBe(0);
      expect(successToast).not.toHaveBeenCalled();
    });

    it.each([true, false])('handleDeleteOldNotes outer failure (toasts %s)', async (toasts) => {
      const handlers = build({ toasts });
      runtime.sendMessage.mockResolvedValue({ success: true });
      successToast.mockImplementation(() => {
        throw new Error('toast broke');
      });
      const result = await handlers.handleDeleteOldNotes([{ id: 'a' }]);
      if (toasts) {
        expect(result).toEqual({ success: false, error: 'toast broke' });
        expect(errorToast).toHaveBeenCalled();
      } else {
        expect(result.success).toBe(true);
      }
    });

    it('handleDeleteOldNotes outer failure without error toast', async () => {
      const handlers = createPopupHandlers({
        log,
        chromeRuntime: runtime,
        showSuccessToast: () => {
          throw new Error('toast broke');
        }
      });
      runtime.sendMessage.mockResolvedValue({ success: true });
      expect(await handlers.handleDeleteOldNotes([{ id: 'a' }])).toEqual({ success: false, error: 'toast broke' });
    });
  });
});
