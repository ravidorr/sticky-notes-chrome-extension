/**
 * Unit tests for site/js/dashboard.js
 * Dashboard functionality for viewing and managing sticky notes
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    // State
    state,
    // Utilities
    escapeHtml,
    isValidUrl,
    getSafeUrl,
    stripHtml,
    formatDate,
    // DOM helpers
    showStatus,
    // UI functions
    updateKeyIndicator,
    showApiKeySection,
    hideApiKeySection,
    handleUrlParams,
    handleDomainSelectChange,
    populateDomainDropdown,
    // Rendering
    renderNotes,
    // API functions
    saveApiKey,
    loadStats,
    loadNotes,
    // Event handlers
    handleFilterTabClick,
    handleAutoRefreshChange,
    clearRefreshInterval,
    openSettings,
    // Initialization
    checkApiKey,
    setupEventListeners,
    setupCleanup
} from '../../site/js/dashboard.js';

describe('site/js/dashboard.js', () => {
    const localThis = {};

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';
        
        // Reset localStorage
        localStorage.clear();
        
        // Reset state
        state.apiKey = null;
        state.currentFilter = 'all';
        state.refreshInterval = null;
        
        // Mock fetch
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    // ============================================
    // Utility Function Tests
    // ============================================

    describe('escapeHtml', () => {
        it('should escape HTML special characters', () => {
            expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
        });

        it('should escape ampersands', () => {
            expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
        });

        it('should escape quotes', () => {
            expect(escapeHtml('"quoted"')).toBe('"quoted"');
        });

        it('should return empty string for null/undefined', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
            expect(escapeHtml('')).toBe('');
        });

        it('should handle plain text without changes', () => {
            expect(escapeHtml('Hello World')).toBe('Hello World');
        });
    });

    describe('isValidUrl', () => {
        it('should return true for valid http URLs', () => {
            expect(isValidUrl('http://example.com')).toBe(true);
            expect(isValidUrl('http://example.com/path?query=1')).toBe(true);
        });

        it('should return true for valid https URLs', () => {
            expect(isValidUrl('https://example.com')).toBe(true);
            expect(isValidUrl('https://sub.example.com:8080/path')).toBe(true);
        });

        it('should return false for javascript: URLs', () => {
            expect(isValidUrl('javascript:alert(1)')).toBe(false);
        });

        it('should return false for data: URLs', () => {
            expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
        });

        it('should return false for invalid URLs', () => {
            expect(isValidUrl('not a url')).toBe(false);
            expect(isValidUrl('')).toBe(false);
            expect(isValidUrl(null)).toBe(false);
            expect(isValidUrl(undefined)).toBe(false);
        });

        it('should return false for file: URLs', () => {
            expect(isValidUrl('file:///etc/passwd')).toBe(false);
        });
    });

    describe('getSafeUrl', () => {
        it('should return the URL for valid URLs', () => {
            expect(getSafeUrl('https://example.com')).toBe('https://example.com');
        });

        it('should return # for invalid URLs', () => {
            expect(getSafeUrl('javascript:alert(1)')).toBe('#');
            expect(getSafeUrl('')).toBe('#');
            expect(getSafeUrl(null)).toBe('#');
        });
    });

    describe('stripHtml', () => {
        it('should strip HTML tags from string', () => {
            expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
        });

        it('should handle nested tags', () => {
            expect(stripHtml('<div><span><b>Text</b></span></div>')).toBe('Text');
        });

        it('should return empty string for null/undefined', () => {
            expect(stripHtml(null)).toBe('');
            expect(stripHtml(undefined)).toBe('');
            expect(stripHtml('')).toBe('');
        });

        it('should handle plain text', () => {
            expect(stripHtml('Plain text')).toBe('Plain text');
        });
    });

    describe('formatDate', () => {
        it('should format a valid date string', () => {
            const result = formatDate('2024-01-15T10:30:00Z');
            expect(result).toContain('Jan');
            expect(result).toContain('15');
            expect(result).toContain('2024');
        });

        it('should return "Unknown date" for null/undefined', () => {
            expect(formatDate(null)).toBe('Unknown date');
            expect(formatDate(undefined)).toBe('Unknown date');
            expect(formatDate('')).toBe('Unknown date');
        });
    });

    // ============================================
    // DOM Helper Tests
    // ============================================

    describe('showStatus', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="status"></div>';
            localThis.statusElement = document.getElementById('status');
        });

        it('should set message and class for success status', () => {
            showStatus(localThis.statusElement, 'Success!', 'success');
            
            expect(localThis.statusElement.textContent).toBe('Success!');
            expect(localThis.statusElement.className).toBe('status status-success');
        });

        it('should set message and class for error status', () => {
            showStatus(localThis.statusElement, 'Error occurred', 'error');
            
            expect(localThis.statusElement.textContent).toBe('Error occurred');
            expect(localThis.statusElement.className).toBe('status status-error');
        });

        it('should set message and class for loading status', () => {
            showStatus(localThis.statusElement, 'Loading...', 'loading');
            
            expect(localThis.statusElement.textContent).toBe('Loading...');
            expect(localThis.statusElement.className).toBe('status status-loading');
        });

        it('should handle null element gracefully', () => {
            expect(() => showStatus(null, 'Message', 'success')).not.toThrow();
        });
    });

    // ============================================
    // UI Function Tests
    // ============================================

    describe('updateKeyIndicator', () => {
        beforeEach(() => {
            document.body.innerHTML = '<span id="keyIndicator"></span>';
            localThis.keyIndicator = document.getElementById('keyIndicator');
        });

        it('should show truncated key when key is long enough', () => {
            const longKey = 'abcdefghijklmnopqrstuvwxyz';
            updateKeyIndicator(localThis.keyIndicator, longKey);
            
            expect(localThis.keyIndicator.textContent).toBe('Key: abcdefghijkl...wxyz');
            expect(localThis.keyIndicator.style.display).toBe('inline');
        });

        it('should hide indicator when key is too short', () => {
            updateKeyIndicator(localThis.keyIndicator, 'short');
            
            expect(localThis.keyIndicator.style.display).toBe('none');
        });

        it('should hide indicator when key is null', () => {
            updateKeyIndicator(localThis.keyIndicator, null);
            
            expect(localThis.keyIndicator.style.display).toBe('none');
        });

        it('should handle null element gracefully', () => {
            expect(() => updateKeyIndicator(null, 'key')).not.toThrow();
        });
    });

    describe('showApiKeySection', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="apiKeySection" style="display: none;"></div>
                <div id="mainContent"></div>
                <input id="apiKeyInput" />
            `;
            localThis.elements = {
                apiKeySection: document.getElementById('apiKeySection'),
                mainContent: document.getElementById('mainContent'),
                apiKeyInput: document.getElementById('apiKeyInput')
            };
        });

        it('should show the API key section', () => {
            showApiKeySection(localThis.elements);
            
            expect(localThis.elements.apiKeySection.style.display).toBe('flex');
        });

        it('should dim the main content', () => {
            showApiKeySection(localThis.elements);
            
            expect(localThis.elements.mainContent.style.opacity).toBe('0.3');
            expect(localThis.elements.mainContent.style.pointerEvents).toBe('none');
        });

        it('should focus the API key input', () => {
            const focusSpy = jest.spyOn(localThis.elements.apiKeyInput, 'focus');
            showApiKeySection(localThis.elements);
            
            expect(focusSpy).toHaveBeenCalled();
        });
    });

    describe('hideApiKeySection', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="apiKeySection" style="display: flex;"></div>
                <div id="mainContent" style="opacity: 0.3; pointer-events: none;"></div>
            `;
            localThis.elements = {
                apiKeySection: document.getElementById('apiKeySection'),
                mainContent: document.getElementById('mainContent')
            };
        });

        it('should hide the API key section', () => {
            hideApiKeySection(localThis.elements);
            
            expect(localThis.elements.apiKeySection.style.display).toBe('none');
        });

        it('should restore main content visibility', () => {
            hideApiKeySection(localThis.elements);
            
            expect(localThis.elements.mainContent.style.opacity).toBe('1');
            expect(localThis.elements.mainContent.style.pointerEvents).toBe('auto');
        });
    });

    describe('handleUrlParams', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <select id="domainSelect">
                    <option value="">All domains</option>
                    <option value="__custom__">Custom URL...</option>
                </select>
                <input id="urlInput" style="display: none;" />
            `;
            localThis.elements = {
                domainSelect: document.getElementById('domainSelect'),
                urlInput: document.getElementById('urlInput')
            };
        });

        it('should pre-fill URL from query params', () => {
            // Mock window.location.search
            Object.defineProperty(window, 'location', {
                value: { search: '?url=https://example.com' },
                writable: true
            });
            
            handleUrlParams(localThis.elements);
            
            expect(localThis.elements.domainSelect.value).toBe('__custom__');
            expect(localThis.elements.urlInput.value).toBe('https://example.com');
            expect(localThis.elements.urlInput.style.display).toBe('block');
        });

        it('should do nothing when no URL param', () => {
            Object.defineProperty(window, 'location', {
                value: { search: '' },
                writable: true
            });
            
            handleUrlParams(localThis.elements);
            
            expect(localThis.elements.urlInput.style.display).toBe('none');
        });
    });

    describe('handleDomainSelectChange', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <select id="domainSelect">
                    <option value="">All domains</option>
                    <option value="example.com">example.com</option>
                    <option value="__custom__">Custom URL...</option>
                </select>
                <input id="urlInput" style="display: none;" />
            `;
            localThis.elements = {
                domainSelect: document.getElementById('domainSelect'),
                urlInput: document.getElementById('urlInput')
            };
            localThis.loadNotesFn = jest.fn();
        });

        it('should show URL input when custom is selected', () => {
            localThis.elements.domainSelect.value = '__custom__';
            handleDomainSelectChange(localThis.elements, localThis.loadNotesFn);
            
            expect(localThis.elements.urlInput.style.display).toBe('block');
            expect(localThis.loadNotesFn).not.toHaveBeenCalled();
        });

        it('should hide URL input and load notes when domain is selected', () => {
            localThis.elements.domainSelect.value = 'example.com';
            handleDomainSelectChange(localThis.elements, localThis.loadNotesFn);
            
            expect(localThis.elements.urlInput.style.display).toBe('none');
            expect(localThis.loadNotesFn).toHaveBeenCalled();
        });
    });

    describe('populateDomainDropdown', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <select id="domainSelect">
                    <option value="">All domains</option>
                    <option value="__custom__">Custom URL...</option>
                </select>
            `;
            localThis.domainSelect = document.getElementById('domainSelect');
        });

        it('should add domains to dropdown', () => {
            populateDomainDropdown(localThis.domainSelect, ['example.com', 'test.com']);
            
            expect(localThis.domainSelect.options.length).toBe(4);
            expect(localThis.domainSelect.options[1].value).toBe('example.com');
            expect(localThis.domainSelect.options[2].value).toBe('test.com');
        });

        it('should sort domains alphabetically', () => {
            populateDomainDropdown(localThis.domainSelect, ['zebra.com', 'alpha.com']);
            
            expect(localThis.domainSelect.options[1].value).toBe('alpha.com');
            expect(localThis.domainSelect.options[2].value).toBe('zebra.com');
        });

        it('should preserve current selection if still valid', () => {
            populateDomainDropdown(localThis.domainSelect, ['example.com']);
            localThis.domainSelect.value = 'example.com';
            
            populateDomainDropdown(localThis.domainSelect, ['example.com', 'new.com']);
            
            expect(localThis.domainSelect.value).toBe('example.com');
        });

        it('should handle null element gracefully', () => {
            expect(() => populateDomainDropdown(null, ['example.com'])).not.toThrow();
        });
    });

    // ============================================
    // Rendering Tests
    // ============================================

    describe('renderNotes', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="notesList"></div>';
            localThis.notesList = document.getElementById('notesList');
        });

        it('should show empty state when no notes', () => {
            renderNotes(localThis.notesList, []);
            
            expect(localThis.notesList.innerHTML).toContain('No notes found');
        });

        it('should render note cards', () => {
            const notes = [{
                id: 'note-123456789',
                url: 'https://example.com',
                selector: '.test-selector',
                content: 'Test content',
                theme: 'blue',
                createdAt: '2024-01-15T10:00:00Z'
            }];
            
            renderNotes(localThis.notesList, notes);
            
            expect(localThis.notesList.innerHTML).toContain('note-card');
            expect(localThis.notesList.innerHTML).toContain('theme-blue');
            expect(localThis.notesList.innerHTML).toContain('Test content');
            expect(localThis.notesList.innerHTML).toContain('.test-selector');
        });

        it('should show shared badge for shared notes', () => {
            const notes = [{
                id: 'note-123456789',
                url: 'https://example.com',
                selector: '.test',
                content: 'Content',
                isShared: true,
                ownerEmail: 'owner@example.com',
                createdAt: '2024-01-15T10:00:00Z'
            }];
            
            renderNotes(localThis.notesList, notes);
            
            expect(localThis.notesList.innerHTML).toContain('Shared by');
            expect(localThis.notesList.innerHTML).toContain('owner@example.com');
        });

        it('should render comments if present', () => {
            const notes = [{
                id: 'note-123456789',
                url: 'https://example.com',
                selector: '.test',
                content: 'Content',
                createdAt: '2024-01-15T10:00:00Z',
                comments: [{
                    id: 'comment-1',
                    content: 'Test comment',
                    authorName: 'Author',
                    createdAt: '2024-01-15T11:00:00Z'
                }]
            }];
            
            renderNotes(localThis.notesList, notes);
            
            expect(localThis.notesList.innerHTML).toContain('Comments (1)');
            expect(localThis.notesList.innerHTML).toContain('Test comment');
        });

        it('should handle null notesList gracefully', () => {
            expect(() => renderNotes(null, [])).not.toThrow();
        });

        it('should sanitize URLs to prevent XSS', () => {
            const notes = [{
                id: 'note-123456789',
                url: 'javascript:alert(1)',
                selector: '.test',
                content: 'Content',
                createdAt: '2024-01-15T10:00:00Z'
            }];
            
            renderNotes(localThis.notesList, notes);
            
            // Should use # for invalid URLs
            expect(localThis.notesList.innerHTML).toContain('href="#"');
        });
    });

    // ============================================
    // API Function Tests
    // ============================================

    describe('saveApiKey', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="apiKeySection"></div>
                <div id="mainContent"></div>
                <input id="apiKeyInput" value="test-api-key-12345678" />
                <span id="keyIndicator"></span>
                <div id="status"></div>
            `;
            localThis.elements = {
                apiKeySection: document.getElementById('apiKeySection'),
                mainContent: document.getElementById('mainContent'),
                apiKeyInput: document.getElementById('apiKeyInput'),
                keyIndicator: document.getElementById('keyIndicator'),
                status: document.getElementById('status')
            };
            localThis.appState = { apiKey: null };
        });

        it('should save valid API key', () => {
            const onSuccess = jest.fn();
            saveApiKey(localThis.elements, localThis.appState, { onSuccess });
            
            expect(localThis.appState.apiKey).toBe('test-api-key-12345678');
            expect(localStorage.getItem('sticky_notes_api_key')).toBe('test-api-key-12345678');
            expect(onSuccess).toHaveBeenCalled();
        });

        it('should show error for empty API key', () => {
            localThis.elements.apiKeyInput.value = '  ';
            saveApiKey(localThis.elements, localThis.appState);
            
            expect(localThis.appState.apiKey).toBeNull();
            expect(localThis.elements.status.textContent).toContain('valid API key');
        });
    });

    describe('loadStats', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <span id="statTotal"></span>
                <span id="statOwned"></span>
                <span id="statShared"></span>
                <span id="statDomains"></span>
                <div id="themeYellow"></div>
                <div id="themeBlue"></div>
                <div id="themeGreen"></div>
                <div id="themePink"></div>
                <span id="legendYellow"></span>
                <span id="legendBlue"></span>
                <span id="legendGreen"></span>
                <span id="legendPink"></span>
                <span id="userEmail"></span>
                <span id="keyIndicator"></span>
                <select id="domainSelect">
                    <option value="">All</option>
                    <option value="__custom__">Custom</option>
                </select>
            `;
            localThis.elements = {
                userEmailSpan: document.getElementById('userEmail'),
                keyIndicator: document.getElementById('keyIndicator'),
                domainSelect: document.getElementById('domainSelect')
            };
        });

        it('should return null when no API key', async () => {
            const result = await loadStats(null, localThis.elements);
            expect(result).toBeNull();
        });

        it('should fetch and display stats', async () => {
            const mockStats = {
                total: 10,
                owned: 5,
                shared: 5,
                domainCount: 3,
                byTheme: { yellow: 4, blue: 3, green: 2, pink: 1 },
                domains: ['example.com', 'test.com'],
                user: { email: 'user@example.com' }
            };
            
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockStats)
            });
            
            const result = await loadStats('test-api-key', localThis.elements);
            
            expect(result).toEqual(mockStats);
            expect(document.getElementById('statTotal').textContent).toBe('10');
            expect(document.getElementById('statOwned').textContent).toBe('5');
        });

        it('should handle API errors gracefully', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            });
            
            const result = await loadStats('test-api-key', localThis.elements);
            expect(result).toBeNull();
        });

        it('should handle network errors gracefully', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            
            const result = await loadStats('test-api-key', localThis.elements);
            expect(result).toBeNull();
        });
    });

    describe('loadNotes', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="status"></div>
                <div id="notesList"></div>
                <select id="domainSelect">
                    <option value="">All</option>
                </select>
                <input id="urlInput" value="" />
            `;
            localThis.elements = {
                status: document.getElementById('status'),
                notesList: document.getElementById('notesList'),
                domainSelect: document.getElementById('domainSelect'),
                urlInput: document.getElementById('urlInput')
            };
        });

        it('should return empty array when no API key', async () => {
            const result = await loadNotes({ apiKey: null, elements: localThis.elements });
            expect(result).toEqual([]);
        });

        it('should fetch and render notes', async () => {
            const mockNotes = {
                notes: [{
                    id: 'note-123456789',
                    url: 'https://example.com',
                    selector: '.test',
                    content: 'Test',
                    createdAt: '2024-01-15T10:00:00Z'
                }]
            };
            
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockNotes)
            });
            
            const result = await loadNotes({
                apiKey: 'test-key',
                elements: localThis.elements,
                currentFilter: 'all'
            });
            
            expect(result.length).toBe(1);
            expect(localThis.elements.notesList.innerHTML).toContain('note-card');
        });

        it('should handle 401 unauthorized', async () => {
            const onUnauthorized = jest.fn();
            
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401
            });
            
            const result = await loadNotes({
                apiKey: 'invalid-key',
                elements: localThis.elements,
                onUnauthorized
            });
            
            expect(result).toEqual([]);
            expect(onUnauthorized).toHaveBeenCalled();
            expect(localStorage.getItem('sticky_notes_api_key')).toBeNull();
        });

        it('should filter by domain', async () => {
            // Add a domain option and select it
            const option = document.createElement('option');
            option.value = 'example.com';
            option.textContent = 'example.com';
            localThis.elements.domainSelect.appendChild(option);
            localThis.elements.domainSelect.value = 'example.com';
            
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ notes: [] })
            });
            
            await loadNotes({
                apiKey: 'test-key',
                elements: localThis.elements
            });
            
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('domain=example.com'),
                expect.any(Object)
            );
        });

        it('should filter by custom URL', async () => {
            // Add custom option and select it
            const option = document.createElement('option');
            option.value = '__custom__';
            option.textContent = 'Custom URL...';
            localThis.elements.domainSelect.appendChild(option);
            localThis.elements.domainSelect.value = '__custom__';
            localThis.elements.urlInput.value = 'https://custom.com/page';
            
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ notes: [] })
            });
            
            await loadNotes({
                apiKey: 'test-key',
                elements: localThis.elements
            });
            
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('url=https'),
                expect.any(Object)
            );
        });
    });

    // ============================================
    // Event Handler Tests
    // ============================================

    describe('handleFilterTabClick', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button class="filter-tab active" data-filter="all">All</button>
                <button class="filter-tab" data-filter="owned">Owned</button>
                <button class="filter-tab" data-filter="shared">Shared</button>
            `;
            localThis.tabs = document.querySelectorAll('.filter-tab');
            localThis.appState = { currentFilter: 'all' };
            localThis.loadNotesFn = jest.fn();
        });

        it('should update active tab and filter', () => {
            const ownedTab = document.querySelector('[data-filter="owned"]');
            handleFilterTabClick(ownedTab, localThis.tabs, localThis.appState, localThis.loadNotesFn);
            
            expect(ownedTab.classList.contains('active')).toBe(true);
            expect(document.querySelector('[data-filter="all"]').classList.contains('active')).toBe(false);
            expect(localThis.appState.currentFilter).toBe('owned');
            expect(localThis.loadNotesFn).toHaveBeenCalled();
        });
    });

    describe('handleAutoRefreshChange', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            localThis.appState = { refreshInterval: null };
            localThis.refreshFn = jest.fn();
        });

        it('should start interval when enabled', () => {
            handleAutoRefreshChange(true, localThis.appState, localThis.refreshFn);
            
            expect(localThis.appState.refreshInterval).not.toBeNull();
            
            jest.advanceTimersByTime(5000);
            expect(localThis.refreshFn).toHaveBeenCalledTimes(1);
            
            jest.advanceTimersByTime(5000);
            expect(localThis.refreshFn).toHaveBeenCalledTimes(2);
        });

        it('should stop interval when disabled', () => {
            handleAutoRefreshChange(true, localThis.appState, localThis.refreshFn);
            handleAutoRefreshChange(false, localThis.appState, localThis.refreshFn);
            
            expect(localThis.appState.refreshInterval).toBeNull();
            
            jest.advanceTimersByTime(10000);
            expect(localThis.refreshFn).toHaveBeenCalledTimes(0);
        });
    });

    describe('clearRefreshInterval', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            localThis.appState = { refreshInterval: null };
        });

        it('should clear existing interval', () => {
            localThis.appState.refreshInterval = setInterval(() => {}, 1000);
            const intervalId = localThis.appState.refreshInterval;
            
            clearRefreshInterval(localThis.appState);
            
            expect(localThis.appState.refreshInterval).toBeNull();
        });

        it('should handle null interval gracefully', () => {
            expect(() => clearRefreshInterval(localThis.appState)).not.toThrow();
        });
    });

    describe('openSettings', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="apiKeySection" style="display: none;"></div>
                <div id="mainContent"></div>
                <input id="apiKeyInput" />
            `;
            localThis.elements = {
                apiKeySection: document.getElementById('apiKeySection'),
                mainContent: document.getElementById('mainContent'),
                apiKeyInput: document.getElementById('apiKeyInput')
            };
        });

        it('should pre-fill API key input and show section', () => {
            openSettings(localThis.elements, 'existing-key');
            
            expect(localThis.elements.apiKeyInput.value).toBe('existing-key');
            expect(localThis.elements.apiKeySection.style.display).toBe('flex');
        });
    });

    // ============================================
    // Initialization Tests
    // ============================================

    describe('checkApiKey', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="apiKeySection" style="display: none;"></div>
                <div id="mainContent"></div>
                <span id="keyIndicator"></span>
            `;
            localThis.elements = {
                apiKeySection: document.getElementById('apiKeySection'),
                mainContent: document.getElementById('mainContent'),
                keyIndicator: document.getElementById('keyIndicator')
            };
        });

        it('should show API key section when no key', () => {
            const appState = { apiKey: null };
            checkApiKey(localThis.elements, appState, {});
            
            expect(localThis.elements.apiKeySection.style.display).toBe('flex');
        });

        it('should hide section and call callback when key exists', () => {
            const appState = { apiKey: 'valid-key-12345678901234567890' };
            const onApiKeyValid = jest.fn();
            
            checkApiKey(localThis.elements, appState, { onApiKeyValid });
            
            expect(localThis.elements.apiKeySection.style.display).toBe('none');
            expect(onApiKeyValid).toHaveBeenCalled();
        });
    });

    describe('setupEventListeners', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="saveApiKeyBtn"></button>
                <input id="apiKeyInput" />
                <button id="loadBtn"></button>
                <input id="urlInput" />
                <select id="domainSelect"></select>
                <button class="filter-tab" data-filter="all"></button>
                <input type="checkbox" id="autoRefresh" />
                <button id="settingsBtn"></button>
            `;
            localThis.elements = {
                saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
                apiKeyInput: document.getElementById('apiKeyInput'),
                loadBtn: document.getElementById('loadBtn'),
                urlInput: document.getElementById('urlInput'),
                domainSelect: document.getElementById('domainSelect'),
                filterTabs: document.querySelectorAll('.filter-tab'),
                autoRefreshCheckbox: document.getElementById('autoRefresh'),
                settingsBtn: document.getElementById('settingsBtn')
            };
            localThis.appState = { currentFilter: 'all' };
            localThis.handlers = {
                onSaveApiKey: jest.fn(),
                onLoadNotes: jest.fn(),
                onDomainChange: jest.fn(),
                onRefresh: jest.fn(),
                onOpenSettings: jest.fn()
            };
        });

        it('should set up save API key button click handler', () => {
            setupEventListeners(localThis.elements, localThis.appState, localThis.handlers);
            
            localThis.elements.saveApiKeyBtn.click();
            
            expect(localThis.handlers.onSaveApiKey).toHaveBeenCalled();
        });

        it('should set up load button click handler', () => {
            setupEventListeners(localThis.elements, localThis.appState, localThis.handlers);
            
            localThis.elements.loadBtn.click();
            
            expect(localThis.handlers.onLoadNotes).toHaveBeenCalled();
        });

        it('should set up settings button click handler', () => {
            setupEventListeners(localThis.elements, localThis.appState, localThis.handlers);
            
            localThis.elements.settingsBtn.click();
            
            expect(localThis.handlers.onOpenSettings).toHaveBeenCalled();
        });

        it('should set up Enter key handler for API key input', () => {
            setupEventListeners(localThis.elements, localThis.appState, localThis.handlers);
            
            const event = new KeyboardEvent('keypress', { key: 'Enter' });
            localThis.elements.apiKeyInput.dispatchEvent(event);
            
            expect(localThis.handlers.onSaveApiKey).toHaveBeenCalled();
        });
    });

    describe('setupCleanup', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            localThis.appState = { refreshInterval: setInterval(() => {}, 1000) };
            // Store original addEventListener to track listeners
            localThis.originalAddEventListener = window.addEventListener;
            localThis.eventListeners = [];
            window.addEventListener = (type, listener, options) => {
                localThis.eventListeners.push({ type, listener, options });
                localThis.originalAddEventListener.call(window, type, listener, options);
            };
        });

        afterEach(() => {
            // Remove all event listeners added during the test
            localThis.eventListeners.forEach(({ type, listener, options }) => {
                window.removeEventListener(type, listener, options);
            });
            localThis.eventListeners = [];
            // Restore original addEventListener
            window.addEventListener = localThis.originalAddEventListener;
        });

        it('should clear interval on pagehide', () => {
            setupCleanup(localThis.appState);
            
            const event = new Event('pagehide');
            window.dispatchEvent(event);
            
            expect(localThis.appState.refreshInterval).toBeNull();
        });

        it('should restore auto-refresh interval on pageshow from BFCache', () => {
            // Setup: no interval initially, but checkbox is checked
            localThis.appState = { 
                refreshInterval: null, 
                apiKey: 'test-key',
                currentFilter: 'all'
            };
            
            // Create auto-refresh checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'autoRefresh';
            checkbox.checked = true;
            document.body.appendChild(checkbox);
            
            // Mock fetch to handle the immediate data refresh calls
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ notes: [], stats: {} })
            });
            
            setupCleanup(localThis.appState);
            
            // Simulate pageshow event from BFCache (persisted = true)
            const event = new PageTransitionEvent('pageshow', { persisted: true });
            window.dispatchEvent(event);
            
            // Should have restored the interval
            expect(localThis.appState.refreshInterval).not.toBeNull();
            
            // Cleanup
            document.body.removeChild(checkbox);
            clearInterval(localThis.appState.refreshInterval);
        });

        it('should immediately refresh data on pageshow from BFCache', async () => {
            // Setup: appState with API key
            localThis.appState = { 
                refreshInterval: null, 
                apiKey: 'test-key',
                currentFilter: 'all'
            };
            
            // Create required DOM elements
            const statsContainer = document.createElement('div');
            statsContainer.id = 'stats';
            document.body.appendChild(statsContainer);
            
            const notesContainer = document.createElement('div');
            notesContainer.id = 'notesContainer';
            document.body.appendChild(notesContainer);
            
            // Mock fetch to track calls
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ notes: [], totalNotes: 0, uniqueUrls: 0 })
            });
            
            setupCleanup(localThis.appState);
            
            // Clear any previous fetch calls
            global.fetch.mockClear();
            
            // Simulate pageshow event from BFCache (persisted = true)
            const event = new PageTransitionEvent('pageshow', { persisted: true });
            window.dispatchEvent(event);
            
            // Should have made fetch calls immediately for stats and notes
            expect(global.fetch).toHaveBeenCalled();
            
            // Cleanup
            document.body.removeChild(statsContainer);
            document.body.removeChild(notesContainer);
        });

        it('should not refresh data on pageshow from BFCache when no API key', () => {
            // Setup: appState without API key
            localThis.appState = { 
                refreshInterval: null, 
                apiKey: null,
                currentFilter: 'all'
            };
            
            // Mock fetch to track calls
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ notes: [] })
            });
            
            setupCleanup(localThis.appState);
            
            // Clear any previous fetch calls
            global.fetch.mockClear();
            
            // Simulate pageshow event from BFCache (persisted = true)
            const event = new PageTransitionEvent('pageshow', { persisted: true });
            window.dispatchEvent(event);
            
            // Should NOT have made fetch calls since there's no API key
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should not restore interval on pageshow if not from BFCache', () => {
            localThis.appState = { 
                refreshInterval: null, 
                apiKey: 'test-key',
                currentFilter: 'all'
            };
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'autoRefresh';
            checkbox.checked = true;
            document.body.appendChild(checkbox);
            
            setupCleanup(localThis.appState);
            
            // Simulate pageshow event NOT from BFCache (persisted = false)
            const event = new PageTransitionEvent('pageshow', { persisted: false });
            window.dispatchEvent(event);
            
            // Should NOT have created an interval
            expect(localThis.appState.refreshInterval).toBeNull();
            
            document.body.removeChild(checkbox);
        });
    });
});
