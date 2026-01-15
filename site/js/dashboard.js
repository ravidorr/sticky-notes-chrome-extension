/**
 * Sticky Notes Dashboard
 * View and manage your sticky notes from any browser
 */

import { API_BASE_URL } from './config.js';

(function() {
    'use strict';
    
    // Get API key from localStorage
    let API_KEY = localStorage.getItem('sticky_notes_api_key');
    let currentFilter = 'all';
    let refreshInterval = null;
    
    // DOM elements
    const apiKeySection = document.getElementById('apiKeySection');
    const mainContent = document.getElementById('mainContent');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const urlInput = document.getElementById('urlInput');
    const loadBtn = document.getElementById('loadBtn');
    const notesList = document.getElementById('notesList');
    const status = document.getElementById('status');
    const autoRefreshCheckbox = document.getElementById('autoRefresh');
    const filterTabs = document.querySelectorAll('.filter-tab');
    const keyIndicator = document.getElementById('keyIndicator');
    const domainSelect = document.getElementById('domainSelect');
    const userEmailSpan = document.getElementById('userEmail');
    
    /**
     * Update the key indicator display in the footer
     */
    function updateKeyIndicator() {
        if (API_KEY && API_KEY.length > 16) {
            keyIndicator.textContent = `Key: ${API_KEY.substring(0, 12)}...${API_KEY.slice(-4)}`;
            keyIndicator.style.display = 'inline';
        } else {
            keyIndicator.style.display = 'none';
        }
    }

    /**
     * Check for URL in query params and pre-fill if present
     */
    function handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const initialUrl = urlParams.get('url');
        if (initialUrl) {
            domainSelect.value = '__custom__';
            urlInput.value = initialUrl;
            urlInput.style.display = 'block';
        }
    }

    /**
     * Check if API key is set and show appropriate UI
     */
    function checkApiKey() {
        updateKeyIndicator();
        if (!API_KEY) {
            showApiKeySection();
        } else {
            hideApiKeySection();
            loadStats();
            loadNotes();
        }
    }

    /**
     * Show the API key input overlay
     */
    function showApiKeySection() {
        apiKeySection.style.display = 'flex';
        mainContent.style.opacity = '0.3';
        mainContent.style.pointerEvents = 'none';
        apiKeyInput.focus();
    }

    /**
     * Hide the API key input overlay
     */
    function hideApiKeySection() {
        apiKeySection.style.display = 'none';
        mainContent.style.opacity = '1';
        mainContent.style.pointerEvents = 'auto';
    }

    /**
     * Save the API key to localStorage
     */
    function saveApiKey() {
        const key = apiKeyInput.value.trim();
        if (key) {
            API_KEY = key;
            localStorage.setItem('sticky_notes_api_key', key);
            updateKeyIndicator();
            hideApiKeySection();
            showStatus('API key saved!', 'success');
            loadStats();
            loadNotes();
        } else {
            showStatus('Please enter a valid API key', 'error');
        }
    }

    /**
     * Load statistics from the API
     */
    async function loadStats() {
        if (!API_KEY) return;
        
        try {
            const response = await fetch(`${API_BASE_URL}/notes/stats`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            
            if (!response.ok) return;
            
            const stats = await response.json();
            
            // Update stat cards
            document.getElementById('statTotal').textContent = stats.total;
            document.getElementById('statOwned').textContent = stats.owned;
            document.getElementById('statShared').textContent = stats.shared;
            document.getElementById('statDomains').textContent = stats.domainCount;
            
            // Update theme breakdown
            const themes = stats.byTheme || {};
            
            document.getElementById('themeYellow').style.flex = themes.yellow || 0;
            document.getElementById('themeBlue').style.flex = themes.blue || 0;
            document.getElementById('themeGreen').style.flex = themes.green || 0;
            document.getElementById('themePink').style.flex = themes.pink || 0;
            
            document.getElementById('legendYellow').textContent = themes.yellow || 0;
            document.getElementById('legendBlue').textContent = themes.blue || 0;
            document.getElementById('legendGreen').textContent = themes.green || 0;
            document.getElementById('legendPink').textContent = themes.pink || 0;
            
            // Update user email in header
            if (stats.user?.email) {
                userEmailSpan.textContent = stats.user.email + ' ';
                userEmailSpan.title = `Signed in as ${stats.user.email}`;
                keyIndicator.textContent = stats.user.email;
                keyIndicator.title = `Connected as ${stats.user.email}`;
                keyIndicator.style.display = 'inline';
            }
            
            // Populate domain dropdown
            populateDomainDropdown(stats.domains || []);
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    /**
     * Populate the domain dropdown with available domains
     * @param {string[]} domains - Array of domain names
     */
    function populateDomainDropdown(domains) {
        // Remember current selection
        const currentValue = domainSelect.value;
        
        // Remove old domain options (keep "All domains" and "Custom URL...")
        while (domainSelect.options.length > 2) {
            domainSelect.remove(1);
        }
        
        // Add domain options (sorted alphabetically)
        domains.sort().forEach(domain => {
            const option = document.createElement('option');
            option.value = domain;
            option.textContent = domain;
            // Insert before "Custom URL..." option
            domainSelect.insertBefore(option, domainSelect.lastElementChild);
        });
        
        // Restore selection if it still exists
        if (currentValue && Array.from(domainSelect.options).some((option) => option.value === currentValue)) {
            domainSelect.value = currentValue;
        }
    }
    
    /**
     * Handle domain select change
     */
    function handleDomainSelectChange() {
        if (domainSelect.value === '__custom__') {
            urlInput.style.display = 'block';
            urlInput.focus();
        } else {
            urlInput.style.display = 'none';
            urlInput.value = '';
            loadNotes();
        }
    }

    /**
     * Load notes from the API
     */
    async function loadNotes() {
        if (!API_KEY) {
            showApiKeySection();
            return;
        }

        showStatus('Loading notes...', 'loading');

        try {
            let endpoint;
            const params = new URLSearchParams();
            
            // Get domain/URL filter
            const selectedDomain = domainSelect.value;
            const customUrl = urlInput.value.trim();
            
            if (currentFilter === 'commented') {
                endpoint = `${API_BASE_URL}/notes/commented`;
            } else {
                endpoint = `${API_BASE_URL}/notes`;
                if (currentFilter !== 'all') {
                    params.set('filter', currentFilter);
                }
            }
            
            // Apply domain or URL filter
            if (selectedDomain === '__custom__' && customUrl) {
                // Custom URL entered
                if (customUrl.startsWith('http://') || customUrl.startsWith('https://')) {
                    params.set('url', customUrl);
                } else {
                    params.set('domain', customUrl);
                }
            } else if (selectedDomain && selectedDomain !== '__custom__') {
                // Domain selected from dropdown
                params.set('domain', selectedDomain);
            }
            
            const queryString = params.toString();
            const fullUrl = queryString ? `${endpoint}?${queryString}` : endpoint;
            
            const response = await fetch(fullUrl, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('sticky_notes_api_key');
                    API_KEY = null;
                    showStatus('Invalid API key. Please enter a valid key.', 'error');
                    showApiKeySection();
                    return;
                }
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            let notes = data.notes || [];
            
            // If viewing commented notes, fetch comments for each note
            if (currentFilter === 'commented' && notes.length > 0) {
                const notesWithComments = await Promise.all(
                    notes.map(async (note) => {
                        try {
                            const commentsRes = await fetch(`${API_BASE_URL}/notes/${note.id}/comments`, {
                                headers: { 'Authorization': `Bearer ${API_KEY}` }
                            });
                            if (commentsRes.ok) {
                                const commentsData = await commentsRes.json();
                                return { ...note, comments: commentsData.comments || [] };
                            }
                        } catch (error) {
                            console.error('Error fetching comments for note:', note.id, error);
                        }
                        return { ...note, comments: [] };
                    })
                );
                notes = notesWithComments;
            }
            
            renderNotes(notes);
            
            const filterLabel = {
                'all': 'all',
                'owned': 'your',
                'shared': 'shared',
                'commented': 'commented'
            }[currentFilter];
            
            showStatus(`Found ${notes.length} ${filterLabel} note${notes.length !== 1 ? 's' : ''}`, 'success');
        } catch (error) {
            console.error('Error loading notes:', error);
            showStatus(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Render notes to the DOM
     * @param {Object[]} notes - Array of note objects
     */
    function renderNotes(notes) {
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
                    ${note.isShared ? `<span class="note-badge" title="Shared by ${escapeHtml(note.ownerEmail || 'unknown')}">Shared by ${escapeHtml(note.ownerEmail || 'unknown')}</span>` : ''}
                    <code class="note-selector">${escapeHtml(note.selector)}</code>
                </div>
                <div class="note-url-row">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="note-url-link" title="Open in new tab">
                        ${displayUrl}
                    </a>
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="btn-open" title="Open page"${safeUrl === '#' ? ' style="pointer-events: none; opacity: 0.5;"' : ''}>
                        Open
                    </a>
                </div>
                <div class="note-content-box">
                    ${escapeHtml(stripHtml(note.content)) || '<em class="no-content">No content</em>'}
                </div>
                ${note.comments && note.comments.length > 0 ? `
                <div class="note-comments">
                    <div class="comments-header">Comments (${note.comments.length})</div>
                    ${note.comments.map(comment => `
                        <div class="comment ${comment.parentId ? 'comment-reply' : ''}">
                            <span class="comment-author">${escapeHtml(comment.authorName || 'Unknown')}</span>
                            <span class="comment-date">${formatDate(comment.createdAt)}</span>
                            <div class="comment-content">${escapeHtml(comment.content)}</div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                <div class="note-footer">
                    <span class="note-date" title="${note.createdAt}">
                        ${formatDate(note.createdAt)}
                    </span>
                    <span class="note-id" title="Note ID: ${note.id}">
                        ${note.id.substring(0, 8)}...
                    </span>
                </div>
            </div>
        `;
        }).join('');
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML string
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Validate that a URL is safe (http or https protocol)
     * @param {string} url - URL to validate
     * @returns {boolean} True if URL is safe
     */
    function isValidUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    /**
     * Get a safe URL for rendering, returns '#' if invalid
     * @param {string} url - URL to sanitize
     * @returns {string} Safe URL or '#'
     */
    function getSafeUrl(url) {
        return isValidUrl(url) ? url : '#';
    }

    /**
     * Strip HTML tags from a string
     * @param {string} html - HTML string to strip
     * @returns {string} Plain text string
     */
    function stripHtml(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    /**
     * Format a date string for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date string
     */
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

    /**
     * Show a status message
     * @param {string} message - Message to display
     * @param {string} type - Type of message (loading, success, error)
     */
    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status status-${type}`;
    }

    /**
     * Handle filter tab click
     * @param {HTMLElement} tab - The clicked tab element
     */
    function handleFilterTabClick(tab) {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        loadNotes();
    }

    /**
     * Handle auto-refresh toggle
     * @param {boolean} enabled - Whether auto-refresh is enabled
     */
    function handleAutoRefreshChange(enabled) {
        if (enabled) {
            refreshInterval = setInterval(() => {
                loadStats();
                loadNotes();
            }, 5000);
        } else {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    /**
     * Clear refresh interval on page unload to prevent memory leaks
     */
    function setupCleanup() {
        window.addEventListener('beforeunload', () => {
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        });
    }

    /**
     * Open the settings (API key) dialog
     */
    function openSettings() {
        apiKeyInput.value = API_KEY || '';
        showApiKeySection();
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // API key events
        saveApiKeyBtn.addEventListener('click', saveApiKey);
        apiKeyInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') saveApiKey();
        });

        // Load and filter events
        loadBtn.addEventListener('click', loadNotes);
        urlInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') loadNotes();
        });
        domainSelect.addEventListener('change', handleDomainSelectChange);

        // Filter tabs
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => handleFilterTabClick(tab));
        });

        // Auto-refresh
        autoRefreshCheckbox.addEventListener('change', (event) => {
            handleAutoRefreshChange(event.target.checked);
        });

        // Settings button
        settingsBtn.addEventListener('click', openSettings);
    }

    /**
     * Initialize the dashboard
     */
    function init() {
        handleUrlParams();
        setupEventListeners();
        setupCleanup();
        checkApiKey();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
