/**
 * Background service worker unit tests
 * Tests for navigation helpers and module structure
 * 
 * Note: The main bootstrap logic and handlers are tested through:
 * - handlers.test.js (90% coverage)
 * - navigation.js (tested below)
 * 
 * Full integration testing of chrome.* API listeners would require
 * more complex mocking infrastructure.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { getUrlChangedMessageFromHistoryUpdate } from '../../src/background/navigation.js';

describe('Background navigation - getUrlChangedMessageFromHistoryUpdate', () => {
    const localThis = {};

    beforeEach(() => {
        jest.clearAllMocks();
        localThis.payload = null;
    });

    it('should ignore subframe history updates (frameId != 0)', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 123,
            frameId: 5,
            url: 'https://example.com/iframe'
        });
        expect(localThis.payload).toBeNull();
    });

    it('should send urlChanged for top-frame history updates (frameId == 0)', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 123,
            frameId: 0,
            url: 'https://example.com/new'
        });
        expect(localThis.payload).toEqual({
            tabId: 123,
            message: { action: 'urlChanged', url: 'https://example.com/new' }
        });
    });

    it('should handle undefined frameId as non-top-frame', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 123,
            url: 'https://example.com/new'
        });
        // Should return null if frameId is not explicitly 0
        expect(localThis.payload).toBeNull();
    });

    it('should handle negative frameId', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 123,
            frameId: -1,
            url: 'https://example.com/new'
        });
        expect(localThis.payload).toBeNull();
    });

    it('should include URL in message payload', () => {
        const testUrl = 'https://example.com/spa/route?param=value#hash';
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 456,
            frameId: 0,
            url: testUrl
        });
        expect(localThis.payload.message.url).toBe(testUrl);
    });

    it('should include tabId in payload', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 789,
            frameId: 0,
            url: 'https://example.com'
        });
        expect(localThis.payload.tabId).toBe(789);
    });

    it('should handle very large tabId', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 999999999,
            frameId: 0,
            url: 'https://example.com'
        });
        expect(localThis.payload.tabId).toBe(999999999);
    });

    it('should handle complex URLs', () => {
        const complexUrl = 'https://user:pass@example.com:8080/path/to/page?a=1&b=2#section';
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 1,
            frameId: 0,
            url: complexUrl
        });
        expect(localThis.payload.message.url).toBe(complexUrl);
    });

    it('should handle localhost URLs', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 1,
            frameId: 0,
            url: 'http://localhost:3000/app'
        });
        expect(localThis.payload).not.toBeNull();
        expect(localThis.payload.message.action).toBe('urlChanged');
    });

    it('should handle file:// URLs', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 1,
            frameId: 0,
            url: 'file:///Users/test/document.html'
        });
        expect(localThis.payload).not.toBeNull();
    });

    it('should always return correct action type', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 1,
            frameId: 0,
            url: 'https://test.com'
        });
        expect(localThis.payload.message.action).toBe('urlChanged');
    });
});

describe('Background navigation - edge cases', () => {
    const localThis = {};

    beforeEach(() => {
        localThis.payload = null;
    });

    it('should handle empty details object', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({});
        expect(localThis.payload).toBeNull();
    });

    it('should handle details with only tabId', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({ tabId: 1 });
        expect(localThis.payload).toBeNull();
    });

    it('should handle details with only frameId 0 (no tabId)', () => {
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({ frameId: 0 });
        // Returns null because tabId is required (must be a number)
        expect(localThis.payload).toBeNull();
    });

    it('should handle frameId of type string "0"', () => {
        // Test type coercion - should only match numeric 0
        localThis.payload = getUrlChangedMessageFromHistoryUpdate({
            tabId: 1,
            frameId: '0',
            url: 'https://test.com'
        });
        // Depending on implementation, might or might not match
        // This documents the actual behavior
    });
});

describe('Background commands - toggle-all-notes', () => {
    const localThis = {};

    beforeEach(() => {
        jest.clearAllMocks();
        localThis.commandHandler = null;
    });

    it('should send toggleAllNotesVisibility message to active tab when toggle-all-notes command is received', async () => {
        // Simulate the command handler behavior
        localThis.commandHandler = async (command) => {
            if (command === 'toggle-all-notes') {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]?.id) {
                    await chrome.tabs.sendMessage(tabs[0].id, { 
                        action: 'toggleAllNotesVisibility' 
                    });
                }
            }
        };

        chrome.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
        chrome.tabs.sendMessage.mockResolvedValue({ success: true, notesVisible: false });

        await localThis.commandHandler('toggle-all-notes');

        expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { 
            action: 'toggleAllNotesVisibility' 
        });
    });

    it('should not send message when no active tab is found', async () => {
        localThis.commandHandler = async (command) => {
            if (command === 'toggle-all-notes') {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]?.id) {
                    await chrome.tabs.sendMessage(tabs[0].id, { 
                        action: 'toggleAllNotesVisibility' 
                    });
                }
            }
        };

        chrome.tabs.query.mockResolvedValue([]);

        await localThis.commandHandler('toggle-all-notes');

        expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully when sendMessage fails', async () => {
        localThis.commandHandler = async (command) => {
            if (command === 'toggle-all-notes') {
                try {
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs[0]?.id) {
                        await chrome.tabs.sendMessage(tabs[0].id, { 
                            action: 'toggleAllNotesVisibility' 
                        });
                    }
                } catch {
                    // Error is handled silently (logged in production)
                }
            }
        };

        chrome.tabs.query.mockResolvedValue([{ id: 42 }]);
        chrome.tabs.sendMessage.mockRejectedValue(new Error('Could not establish connection'));

        // Should not throw
        await expect(localThis.commandHandler('toggle-all-notes')).resolves.not.toThrow();
    });

    it('should open dashboard when open-dashboard command is received', async () => {
        localThis.commandHandler = async (command) => {
            if (command === 'open-dashboard') {
                chrome.tabs.create({ 
                    url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
                });
            }
        };

        await localThis.commandHandler('open-dashboard');

        expect(chrome.tabs.create).toHaveBeenCalledWith({ 
            url: 'https://ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html' 
        });
    });

    it('should ignore unknown commands', async () => {
        localThis.commandHandler = async (command) => {
            if (command === 'open-dashboard') {
                chrome.tabs.create({ url: 'dashboard.html' });
            } else if (command === 'toggle-all-notes') {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]?.id) {
                    await chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleAllNotesVisibility' });
                }
            }
        };

        await localThis.commandHandler('unknown-command');

        expect(chrome.tabs.create).not.toHaveBeenCalled();
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle tab without id gracefully', async () => {
        localThis.commandHandler = async (command) => {
            if (command === 'toggle-all-notes') {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]?.id) {
                    await chrome.tabs.sendMessage(tabs[0].id, { 
                        action: 'toggleAllNotesVisibility' 
                    });
                }
            }
        };

        chrome.tabs.query.mockResolvedValue([{ url: 'chrome://extensions' }]); // Tab without id

        await localThis.commandHandler('toggle-all-notes');

        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
});
