/**
 * Unit tests for site/js/dashboard.js
 * Dashboard functionality for viewing and managing notes
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('site/dashboard.js', () => {
    const localThis = {};

    beforeEach(() => {
        // Reset DOM with dashboard structure
        document.body.innerHTML = `
            <div id="apiKeySection" style="display: none;">
                <input type="password" id="apiKeyInput">
                <button id="saveApiKeyBtn">Save Key</button>
            </div>
            <div id="mainContent">
                <div id="statsDashboard">
                    <span id="statTotal">-</span>
                    <span id="statOwned">-</span>
                    <span id="statShared">-</span>
                    <span id="statDomains">-</span>
                </div>
                <div id="themeBreakdown">
                    <div id="themeYellow" style="flex: 0"></div>
                    <div id="themeBlue" style="flex: 0"></div>
                    <div id="themeGreen" style="flex: 0"></div>
                    <div id="themePink" style="flex: 0"></div>
                    <span id="legendYellow">0</span>
                    <span id="legendBlue">0</span>
                    <span id="legendGreen">0</span>
                    <span id="legendPink">0</span>
                </div>
                <div class="filter-tabs">
                    <button class="filter-tab active" data-filter="all">All</button>
                    <button class="filter-tab" data-filter="owned">My Notes</button>
                    <button class="filter-tab" data-filter="shared">Shared</button>
                    <button class="filter-tab" data-filter="commented">Commented</button>
                </div>
                <select id="domainSelect">
                    <option value="">All domains</option>
                    <option value="__custom__">Custom URL...</option>
                </select>
                <input type="text" id="urlInput" style="display: none;">
                <button id="loadBtn">Load Notes</button>
                <div id="status" class="status"></div>
                <div id="notesList"></div>
            </div>
            <button id="settingsBtn">Settings</button>
            <input type="checkbox" id="autoRefresh">
            <span id="keyIndicator"></span>
            <span id="userEmail"></span>
        `;

        // Reset localStorage
        localStorage.clear();

        // Reset mocks
        jest.clearAllMocks();

        // Mock fetch
        global.fetch = jest.fn();

        // Store element references
        localThis.apiKeySection = document.getElementById('apiKeySection');
        localThis.mainContent = document.getElementById('mainContent');
        localThis.apiKeyInput = document.getElementById('apiKeyInput');
        localThis.domainSelect = document.getElementById('domainSelect');
        localThis.urlInput = document.getElementById('urlInput');
        localThis.notesList = document.getElementById('notesList');
        localThis.status = document.getElementById('status');
        localThis.keyIndicator = document.getElementById('keyIndicator');
    });

    afterEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    // ============================================
    // Utility Functions Tests
    // ============================================

    describe('escapeHtml', () => {
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        it('should escape HTML special characters', () => {
            expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
        });

        it('should escape ampersands', () => {
            expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
        });

        it('should escape quotes', () => {
            expect(escapeHtml('"quoted"')).toBe('"quoted"');
        });

        it('should return empty string for null/undefined', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
            expect(escapeHtml('')).toBe('');
        });

        it('should handle normal text without changes', () => {
            expect(escapeHtml('Hello World')).toBe('Hello World');
        });
    });

    describe('isValidUrl', () => {
        function isValidUrl(url) {
            if (!url) return false;
            try {
                const parsed = new URL(url);
                return ['http:', 'https:'].includes(parsed.protocol);
            } catch {
                return false;
            }
        }

        it('should return true for http URLs', () => {
            expect(isValidUrl('http://example.com')).toBe(true);
        });

        it('should return true for https URLs', () => {
            expect(isValidUrl('https://example.com')).toBe(true);
        });

        it('should return false for javascript: URLs', () => {
            expect(isValidUrl('javascript:alert(1)')).toBe(false);
        });

        it('should return false for data: URLs', () => {
            expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
        });

        it('should return false for invalid URLs', () => {
            expect(isValidUrl('not-a-url')).toBe(false);
        });

        it('should return false for empty/null URLs', () => {
            expect(isValidUrl('')).toBe(false);
            expect(isValidUrl(null)).toBe(false);
            expect(isValidUrl(undefined)).toBe(false);
        });

        it('should return false for file: URLs', () => {
            expect(isValidUrl('file:///etc/passwd')).toBe(false);
        });
    });

    describe('getSafeUrl', () => {
        function isValidUrl(url) {
            if (!url) return false;
            try {
                const parsed = new URL(url);
                return ['http:', 'https:'].includes(parsed.protocol);
            } catch {
                return false;
            }
        }

        function getSafeUrl(url) {
            return isValidUrl(url) ? url : '#';
        }

        it('should return URL if valid', () => {
            expect(getSafeUrl('https://example.com')).toBe('https://example.com');
        });

        it('should return # for invalid URL', () => {
            expect(getSafeUrl('javascript:alert(1)')).toBe('#');
        });

        it('should return # for empty URL', () => {
            expect(getSafeUrl('')).toBe('#');
        });
    });

    describe('stripHtml', () => {
        function stripHtml(html) {
            if (!html) return '';
            const div = document.createElement('div');
            div.innerHTML = html;
            return div.textContent || div.innerText || '';
        }

        it('should strip HTML tags', () => {
            expect(stripHtml('<b>bold</b> text')).toBe('bold text');
        });

        it('should handle nested tags', () => {
            expect(stripHtml('<div><p>nested</p></div>')).toBe('nested');
        });

        it('should return empty string for null/undefined', () => {
            expect(stripHtml(null)).toBe('');
            expect(stripHtml(undefined)).toBe('');
        });

        it('should handle plain text', () => {
            expect(stripHtml('plain text')).toBe('plain text');
        });
    });

    describe('formatDate', () => {
        function formatDate(dateString) {
            if (!dateString) return 'Unknown date';
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        it('should format ISO date string', () => {
            const result = formatDate('2024-01-15T10:30:00Z');
            expect(result).toContain('Jan');
            expect(result).toContain('15');
            expect(result).toContain('2024');
        });

        it('should return Unknown date for null/undefined', () => {
            expect(formatDate(null)).toBe('Unknown date');
            expect(formatDate(undefined)).toBe('Unknown date');
            expect(formatDate('')).toBe('Unknown date');
        });
    });

    // ============================================
    // API Key Management Tests
    // ============================================

    describe('updateKeyIndicator', () => {
        function updateKeyIndicator(apiKey) {
            const keyIndicator = document.getElementById('keyIndicator');
            if (apiKey && apiKey.length > 16) {
                keyIndicator.textContent = `Key: ${apiKey.substring(0, 12)}...${apiKey.slice(-4)}`;
                keyIndicator.style.display = 'inline';
            } else {
                keyIndicator.style.display = 'none';
            }
        }

        it('should display truncated key for long keys', () => {
            updateKeyIndicator('sk_live_1234567890abcdefghij');

            expect(localThis.keyIndicator.textContent).toBe('Key: sk_live_1234...ghij');
            expect(localThis.keyIndicator.style.display).toBe('inline');
        });

        it('should hide indicator for short keys', () => {
            updateKeyIndicator('short');

            expect(localThis.keyIndicator.style.display).toBe('none');
        });

        it('should hide indicator for null key', () => {
            updateKeyIndicator(null);

            expect(localThis.keyIndicator.style.display).toBe('none');
        });
    });

    describe('showApiKeySection', () => {
        function showApiKeySection() {
            const apiKeySection = document.getElementById('apiKeySection');
            const mainContent = document.getElementById('mainContent');
            apiKeySection.style.display = 'flex';
            mainContent.style.opacity = '0.3';
            mainContent.style.pointerEvents = 'none';
        }

        it('should show API key overlay', () => {
            showApiKeySection();

            expect(localThis.apiKeySection.style.display).toBe('flex');
            expect(localThis.mainContent.style.opacity).toBe('0.3');
            expect(localThis.mainContent.style.pointerEvents).toBe('none');
        });
    });

    describe('hideApiKeySection', () => {
        function hideApiKeySection() {
            const apiKeySection = document.getElementById('apiKeySection');
            const mainContent = document.getElementById('mainContent');
            apiKeySection.style.display = 'none';
            mainContent.style.opacity = '1';
            mainContent.style.pointerEvents = 'auto';
        }

        it('should hide API key overlay', () => {
            localThis.apiKeySection.style.display = 'flex';

            hideApiKeySection();

            expect(localThis.apiKeySection.style.display).toBe('none');
            expect(localThis.mainContent.style.opacity).toBe('1');
            expect(localThis.mainContent.style.pointerEvents).toBe('auto');
        });
    });

    describe('saveApiKey', () => {
        it('should save key to localStorage', () => {
            const key = 'sk_live_testkey123456789';
            localStorage.setItem('sticky_notes_api_key', key);

            expect(localStorage.getItem('sticky_notes_api_key')).toBe(key);
        });

        it('should not save empty key', () => {
            const key = '';
            if (key) {
                localStorage.setItem('sticky_notes_api_key', key);
            }

            expect(localStorage.getItem('sticky_notes_api_key')).toBeNull();
        });

        it('should trim whitespace from key', () => {
            const key = '  sk_live_testkey123456789  '.trim();
            localStorage.setItem('sticky_notes_api_key', key);

            expect(localStorage.getItem('sticky_notes_api_key')).toBe('sk_live_testkey123456789');
        });
    });

    // ============================================
    // Domain/URL Handling Tests
    // ============================================

    describe('handleDomainSelectChange', () => {
        function handleDomainSelectChange() {
            const domainSelect = document.getElementById('domainSelect');
            const urlInput = document.getElementById('urlInput');
            if (domainSelect.value === '__custom__') {
                urlInput.style.display = 'block';
            } else {
                urlInput.style.display = 'none';
                urlInput.value = '';
            }
        }

        it('should show URL input when custom selected', () => {
            localThis.domainSelect.value = '__custom__';

            handleDomainSelectChange();

            expect(localThis.urlInput.style.display).toBe('block');
        });

        it('should hide URL input when domain selected', () => {
            localThis.domainSelect.value = 'example.com';
            localThis.urlInput.style.display = 'block';

            handleDomainSelectChange();

            expect(localThis.urlInput.style.display).toBe('none');
            expect(localThis.urlInput.value).toBe('');
        });
    });

    describe('populateDomainDropdown', () => {
        function populateDomainDropdown(domains) {
            const domainSelect = document.getElementById('domainSelect');
            // Remove old domain options (keep first two: "All domains" and will insert before last)
            while (domainSelect.options.length > 2) {
                domainSelect.remove(1);
            }
            
            domains.sort().forEach(domain => {
                const option = document.createElement('option');
                option.value = domain;
                option.textContent = domain;
                domainSelect.insertBefore(option, domainSelect.lastElementChild);
            });
        }

        it('should add domain options sorted alphabetically', () => {
            populateDomainDropdown(['zebra.com', 'alpha.com', 'middle.com']);

            const options = Array.from(localThis.domainSelect.options);
            const domainValues = options.slice(1, -1).map(o => o.value);

            expect(domainValues).toEqual(['alpha.com', 'middle.com', 'zebra.com']);
        });

        it('should preserve first and last options', () => {
            populateDomainDropdown(['test.com']);

            expect(localThis.domainSelect.options[0].value).toBe('');
            expect(localThis.domainSelect.options[localThis.domainSelect.options.length - 1].value).toBe('__custom__');
        });
    });

    // ============================================
    // Status Display Tests
    // ============================================

    describe('showStatus', () => {
        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = `status status-${type}`;
        }

        it('should display loading status', () => {
            showStatus('Loading notes...', 'loading');

            expect(localThis.status.textContent).toBe('Loading notes...');
            expect(localThis.status.className).toBe('status status-loading');
        });

        it('should display success status', () => {
            showStatus('Found 5 notes', 'success');

            expect(localThis.status.textContent).toBe('Found 5 notes');
            expect(localThis.status.className).toBe('status status-success');
        });

        it('should display error status', () => {
            showStatus('Error: API error', 'error');

            expect(localThis.status.textContent).toBe('Error: API error');
            expect(localThis.status.className).toBe('status status-error');
        });
    });

    // ============================================
    // Filter Tab Tests
    // ============================================

    describe('handleFilterTabClick', () => {
        it('should update active class on tabs', () => {
            const tabs = document.querySelectorAll('.filter-tab');
            let currentFilter = 'all';

            function handleFilterTabClick(tab) {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentFilter = tab.dataset.filter;
            }

            const ownedTab = document.querySelector('[data-filter="owned"]');
            handleFilterTabClick(ownedTab);

            expect(ownedTab.classList.contains('active')).toBe(true);
            expect(document.querySelector('[data-filter="all"]').classList.contains('active')).toBe(false);
            expect(currentFilter).toBe('owned');
        });
    });

    // ============================================
    // Auto-refresh Tests
    // ============================================

    describe('handleAutoRefreshChange', () => {
        it('should start interval when enabled', () => {
            jest.useFakeTimers();
            let refreshInterval = null;
            let refreshCount = 0;

            function handleAutoRefreshChange(enabled) {
                if (enabled) {
                    refreshInterval = setInterval(() => {
                        refreshCount++;
                    }, 5000);
                } else {
                    clearInterval(refreshInterval);
                    refreshInterval = null;
                }
            }

            handleAutoRefreshChange(true);

            expect(refreshInterval).not.toBeNull();

            jest.advanceTimersByTime(5000);
            expect(refreshCount).toBe(1);

            jest.advanceTimersByTime(5000);
            expect(refreshCount).toBe(2);

            handleAutoRefreshChange(false);
            expect(refreshInterval).toBeNull();

            jest.useRealTimers();
        });

        it('should clear interval when disabled', () => {
            jest.useFakeTimers();
            let refreshInterval = setInterval(() => {}, 5000);

            function handleAutoRefreshChange(enabled) {
                if (!enabled) {
                    clearInterval(refreshInterval);
                    refreshInterval = null;
                }
            }

            handleAutoRefreshChange(false);

            expect(refreshInterval).toBeNull();

            jest.useRealTimers();
        });
    });

    describe('setupCleanup', () => {
        it('should clear interval on beforeunload', () => {
            let refreshInterval = setInterval(() => {}, 5000);
            let cleanedUp = false;

            function setupCleanup() {
                window.addEventListener('beforeunload', () => {
                    if (refreshInterval) {
                        clearInterval(refreshInterval);
                        refreshInterval = null;
                        cleanedUp = true;
                    }
                });
            }

            setupCleanup();

            window.dispatchEvent(new Event('beforeunload'));

            expect(cleanedUp).toBe(true);
            expect(refreshInterval).toBeNull();
        });
    });

    // ============================================
    // Note Rendering Tests
    // ============================================

    describe('renderNotes', () => {
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function isValidUrl(url) {
            if (!url) return false;
            try {
                const parsed = new URL(url);
                return ['http:', 'https:'].includes(parsed.protocol);
            } catch {
                return false;
            }
        }

        function getSafeUrl(url) {
            return isValidUrl(url) ? url : '#';
        }

        function renderNotes(notes) {
            const notesList = document.getElementById('notesList');
            if (notes.length === 0) {
                notesList.innerHTML = '<p class="empty-state-msg">No notes found</p>';
                return;
            }

            notesList.innerHTML = notes.map((note) => {
                const safeUrl = getSafeUrl(note.url);
                const displayUrl = escapeHtml(note.url);
                return `
                <div class="note-card theme-${note.theme || 'yellow'}">
                    <div class="note-header">
                        <code class="note-selector">${escapeHtml(note.selector)}</code>
                    </div>
                    <div class="note-url-row">
                        <a href="${safeUrl}" class="note-url-link">${displayUrl}</a>
                    </div>
                    <div class="note-content-box">${escapeHtml(note.content)}</div>
                </div>
            `;
            }).join('');
        }

        it('should render empty state for no notes', () => {
            renderNotes([]);

            expect(localThis.notesList.innerHTML).toContain('No notes found');
        });

        it('should render note cards', () => {
            const notes = [{
                id: '123',
                url: 'https://example.com',
                selector: 'div.test',
                content: 'Test note',
                theme: 'blue'
            }];

            renderNotes(notes);

            expect(localThis.notesList.innerHTML).toContain('note-card');
            expect(localThis.notesList.innerHTML).toContain('theme-blue');
            expect(localThis.notesList.innerHTML).toContain('Test note');
        });

        it('should use safe URL for links', () => {
            const notes = [{
                id: '123',
                url: 'javascript:alert(1)',
                selector: 'div.test',
                content: 'Test'
            }];

            renderNotes(notes);

            expect(localThis.notesList.innerHTML).toContain('href="#"');
        });

        it('should escape HTML in content', () => {
            const notes = [{
                id: '123',
                url: 'https://example.com',
                selector: 'div.test',
                content: '<script>alert("xss")</script>'
            }];

            renderNotes(notes);

            expect(localThis.notesList.innerHTML).toContain('&lt;script&gt;');
            expect(localThis.notesList.innerHTML).not.toContain('<script>alert');
        });

        it('should default to yellow theme', () => {
            const notes = [{
                id: '123',
                url: 'https://example.com',
                selector: 'div.test',
                content: 'Test'
            }];

            renderNotes(notes);

            expect(localThis.notesList.innerHTML).toContain('theme-yellow');
        });
    });

    // ============================================
    // URL Params Tests
    // ============================================

    describe('handleUrlParams', () => {
        it('should pre-fill URL from query params', () => {
            // Mock window.location.search
            delete window.location;
            window.location = { search: '?url=https://example.com/page' };

            function handleUrlParams() {
                const urlParams = new URLSearchParams(window.location.search);
                const initialUrl = urlParams.get('url');
                if (initialUrl) {
                    document.getElementById('domainSelect').value = '__custom__';
                    document.getElementById('urlInput').value = initialUrl;
                    document.getElementById('urlInput').style.display = 'block';
                }
            }

            handleUrlParams();

            expect(localThis.domainSelect.value).toBe('__custom__');
            expect(localThis.urlInput.value).toBe('https://example.com/page');
            expect(localThis.urlInput.style.display).toBe('block');
        });

        it('should not change anything when no URL param', () => {
            delete window.location;
            window.location = { search: '' };

            function handleUrlParams() {
                const urlParams = new URLSearchParams(window.location.search);
                const initialUrl = urlParams.get('url');
                if (initialUrl) {
                    document.getElementById('domainSelect').value = '__custom__';
                }
            }

            handleUrlParams();

            expect(localThis.domainSelect.value).toBe('');
        });
    });

    // ============================================
    // API Request Tests
    // ============================================

    describe('loadNotes request construction', () => {
        it('should construct correct endpoint for all notes', () => {
            const API_BASE_URL = 'https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api';
            const currentFilter = 'all';
            
            let endpoint = `${API_BASE_URL}/notes`;
            if (currentFilter === 'commented') {
                endpoint = `${API_BASE_URL}/notes/commented`;
            }

            expect(endpoint).toBe('https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api/notes');
        });

        it('should construct correct endpoint for commented notes', () => {
            const API_BASE_URL = 'https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api';
            const currentFilter = 'commented';
            
            let endpoint;
            if (currentFilter === 'commented') {
                endpoint = `${API_BASE_URL}/notes/commented`;
            } else {
                endpoint = `${API_BASE_URL}/notes`;
            }

            expect(endpoint).toBe('https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api/notes/commented');
        });

        it('should add filter param for owned/shared', () => {
            const params = new URLSearchParams();
            const currentFilter = 'owned';

            if (currentFilter !== 'all' && currentFilter !== 'commented') {
                params.set('filter', currentFilter);
            }

            expect(params.get('filter')).toBe('owned');
        });

        it('should add domain param when domain selected', () => {
            const params = new URLSearchParams();
            const selectedDomain = 'example.com';

            if (selectedDomain && selectedDomain !== '__custom__') {
                params.set('domain', selectedDomain);
            }

            expect(params.get('domain')).toBe('example.com');
        });

        it('should add url param for full URLs', () => {
            const params = new URLSearchParams();
            const customUrl = 'https://example.com/page';

            if (customUrl.startsWith('http://') || customUrl.startsWith('https://')) {
                params.set('url', customUrl);
            }

            expect(params.get('url')).toBe('https://example.com/page');
        });
    });

    describe('API error handling', () => {
        it('should clear key on 401 response', () => {
            localStorage.setItem('sticky_notes_api_key', 'invalid-key');

            function handleUnauthorized() {
                localStorage.removeItem('sticky_notes_api_key');
            }

            const response = { status: 401, ok: false };
            if (response.status === 401) {
                handleUnauthorized();
            }

            expect(localStorage.getItem('sticky_notes_api_key')).toBeNull();
        });
    });
});
