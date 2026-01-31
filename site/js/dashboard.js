/**
 * Sticky Notes Dashboard
 * View and manage your sticky notes from any browser
 */

import { API_BASE_URL } from './config.js';

// ============================================
// State
// ============================================

const state = {
    apiKey: null,
    currentFilter: 'all',
    refreshInterval: null,
    searchQuery: '',
    allNotes: [],
    displayedNotes: []
};

// ============================================
// Utility Functions
// ============================================

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
 * Get a human-readable label for console error type
 * @param {string} type - Error type (console.error, console.warn, exception, unhandledrejection)
 * @returns {string} Human-readable label
 */
function getErrorTypeLabel(type) {
    const labels = {
        'console.error': 'Error',
        'console.warn': 'Warning',
        'exception': 'Exception',
        'unhandledrejection': 'Promise'
    };
    return labels[type] || type;
}

/**
 * Render console errors section for a note
 * @param {Array} errors - Array of console error objects
 * @returns {string} HTML string for console errors section
 */
function renderConsoleErrors(errors) {
    if (!errors || errors.length === 0) return '';
    
    const errorItems = errors.map(err => {
        const typeLabel = getErrorTypeLabel(err.type);
        const typeClass = err.type.replace('.', '-');
        const message = escapeHtml(err.message || '').substring(0, 150);
        const fullMessage = escapeHtml(err.message || '');
        const timestamp = err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : '';
        
        return `
            <div class="console-error-item console-error-${typeClass}">
                <span class="console-error-type">${typeLabel}</span>
                <span class="console-error-message" title="${fullMessage}">${message}${err.message?.length > 150 ? '...' : ''}</span>
                ${timestamp ? `<span class="console-error-time">${timestamp}</span>` : ''}
            </div>
        `;
    }).join('');
    
    return `
        <div class="console-errors">
            <button class="console-errors-header" type="button" aria-expanded="false">
                <span class="console-errors-icon" aria-hidden="true"></span>
                <span class="console-errors-label">Console Errors</span>
                <span class="console-errors-count">${errors.length}</span>
                <span class="console-errors-chevron" aria-hidden="true"></span>
            </button>
            <div class="console-errors-list" hidden>
                ${errorItems}
            </div>
        </div>
    `;
}

/**
 * Filter notes by search query
 * @param {Object[]} notes - Array of note objects
 * @param {string} query - Search query string
 * @returns {Object[]} Filtered notes array
 */
function filterNotesBySearch(notes, query) {
    if (!query || !query.trim()) return notes;
    
    const lowerQuery = query.toLowerCase().trim();
    return notes.filter(note => {
        const content = stripHtml(note.content || '').toLowerCase();
        const url = (note.url || '').toLowerCase();
        const selector = (note.selector || '').toLowerCase();
        
        return content.includes(lowerQuery) || 
               url.includes(lowerQuery) || 
               selector.includes(lowerQuery);
    });
}

/**
 * Create a debounced version of a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Update the last updated timestamp display
 */
function updateLastUpdated() {
    const lastUpdated = document.getElementById('lastUpdated');
    if (lastUpdated) {
        const now = new Date();
        lastUpdated.textContent = `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
}

// ============================================
// DOM Helpers
// ============================================

/**
 * Get DOM elements used by the dashboard
 * @returns {Object} Object containing DOM element references
 */
function getDOMElements() {
    return {
        apiKeySection: document.getElementById('apiKeySection'),
        mainContent: document.getElementById('mainContent'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        urlInput: document.getElementById('urlInput'),
        loadBtn: document.getElementById('loadBtn'),
        notesList: document.getElementById('notesList'),
        status: document.getElementById('status'),
        autoRefreshCheckbox: document.getElementById('autoRefresh'),
        filterTabs: document.querySelectorAll('.filter-tab'),
        keyIndicator: document.getElementById('keyIndicator'),
        domainSelect: document.getElementById('domainSelect'),
        userEmailSpan: document.getElementById('userEmail'),
        searchInput: document.getElementById('searchInput'),
        lastUpdated: document.getElementById('lastUpdated'),
        tabCountAll: document.getElementById('tabCountAll'),
        tabCountOwned: document.getElementById('tabCountOwned'),
        tabCountShared: document.getElementById('tabCountShared')
    };
}

/**
 * Show a status message
 * @param {HTMLElement} statusElement - The status element
 * @param {string} message - Message to display
 * @param {string} type - Type of message (loading, success, error)
 */
function showStatus(statusElement, message, type) {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.className = `status status-${type}`;
}

// ============================================
// UI Functions
// ============================================

/**
 * Update the key indicator display in the footer
 * @param {HTMLElement} keyIndicator - The key indicator element
 * @param {string} apiKey - The API key
 */
function updateKeyIndicator(keyIndicator, apiKey) {
    if (!keyIndicator) return;
    if (apiKey && apiKey.length > 16) {
        keyIndicator.textContent = `Key: ${apiKey.substring(0, 12)}...${apiKey.slice(-4)}`;
        keyIndicator.style.display = 'inline';
    } else {
        keyIndicator.style.display = 'none';
    }
}

/**
 * Show the API key input overlay
 * @param {Object} elements - DOM elements
 */
function showApiKeySection(elements) {
    const { apiKeySection, mainContent, apiKeyInput } = elements;
    if (apiKeySection) apiKeySection.style.display = 'flex';
    if (mainContent) {
        mainContent.style.display = 'none';
    }
    if (apiKeyInput) apiKeyInput.focus();
}

/**
 * Hide the API key input overlay
 * @param {Object} elements - DOM elements
 */
function hideApiKeySection(elements) {
    const { apiKeySection, mainContent } = elements;
    if (apiKeySection) apiKeySection.style.display = 'none';
    if (mainContent) {
        mainContent.style.display = 'block';
    }
}

/**
 * Check for URL in query params and pre-fill if present
 * @param {Object} elements - DOM elements
 */
function handleUrlParams(elements) {
    const { domainSelect, urlInput } = elements;
    const urlParams = new URLSearchParams(window.location.search);
    const initialUrl = urlParams.get('url');
    if (initialUrl && domainSelect && urlInput) {
        domainSelect.value = '__custom__';
        urlInput.value = initialUrl;
        urlInput.style.display = 'block';
    }
}

/**
 * Handle domain select change
 * @param {Object} elements - DOM elements
 * @param {Function} loadNotesFn - Function to call to load notes
 */
function handleDomainSelectChange(elements, loadNotesFn) {
    const { domainSelect, urlInput } = elements;
    if (!domainSelect) return;
    
    if (domainSelect.value === '__custom__') {
        if (urlInput) {
            urlInput.style.display = 'block';
            urlInput.focus();
        }
    } else {
        if (urlInput) {
            urlInput.style.display = 'none';
            urlInput.value = '';
        }
        if (loadNotesFn) loadNotesFn();
    }
}

/**
 * Populate the domain dropdown with available domains
 * @param {HTMLSelectElement} domainSelect - The domain select element
 * @param {string[]} domains - Array of domain names
 */
function populateDomainDropdown(domainSelect, domains) {
    if (!domainSelect) return;
    
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

// ============================================
// Rendering Functions
// ============================================

/**
 * Render notes to the DOM
 * @param {HTMLElement} notesList - The notes list container
 * @param {Object[]} notes - Array of note objects
 * @param {Object} context - Optional context for empty state messages
 */
function renderNotes(notesList, notes, context = {}) {
    if (!notesList) return;
    
    if (notes.length === 0) {
        let emptyMessage = 'No notes found';
        let emptyAction = '';
        
        if (context.isSearch) {
            emptyMessage = 'No notes match your search';
            emptyAction = '<p class="empty-state-hint">Try a different search term or clear the search.</p>';
        } else if (context.filter === 'shared') {
            emptyMessage = 'No notes have been shared with you yet';
            emptyAction = '<p class="empty-state-hint">Ask a teammate to share a note with your email address.</p>';
        } else if (context.filter === 'commented') {
            emptyMessage = 'No commented notes';
            emptyAction = '<p class="empty-state-hint">Comments you add or receive will appear here.</p>';
        } else if (context.filter === 'owned') {
            emptyMessage = 'You haven\'t created any notes yet';
            emptyAction = '<p class="empty-state-hint">Use the Sticky Notes extension to pin notes on any webpage.</p>';
        } else if (context.domain) {
            emptyMessage = `No notes on ${escapeHtml(context.domain)}`;
            emptyAction = '<p class="empty-state-hint">Try selecting "All domains" to see all your notes.</p>';
        }
        
        notesList.innerHTML = `
            <div class="empty-state">
                <p class="empty-state-msg">${emptyMessage}</p>
                ${emptyAction}
            </div>
        `;
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
            ${renderConsoleErrors(note.metadata?.consoleErrors)}
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

// ============================================
// API Functions
// ============================================

/**
 * Save the API key to localStorage and state
 * @param {Object} elements - DOM elements
 * @param {Object} appState - Application state
 * @param {Function} callbacks - Callback functions
 */
function saveApiKey(elements, appState, callbacks = {}) {
    const { apiKeyInput } = elements;
    const key = apiKeyInput?.value?.trim();
    
    if (key) {
        appState.apiKey = key;
        localStorage.setItem('sticky_notes_api_key', key);
        updateKeyIndicator(elements.keyIndicator, key);
        hideApiKeySection(elements);
        showStatus(elements.status, 'API key saved!', 'success');
        if (callbacks.onSuccess) callbacks.onSuccess();
    } else {
        showStatus(elements.status, 'Please enter a valid API key', 'error');
    }
}

/**
 * Load statistics from the API
 * @param {string} apiKey - The API key
 * @param {Object} elements - DOM elements
 * @returns {Promise<Object|null>} Stats object or null
 */
async function loadStats(apiKey, elements) {
    if (!apiKey) return null;
    
    try {
        const response = await fetch(`${API_BASE_URL}/notes/stats`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (!response.ok) return null;
        
        const stats = await response.json();
        
        // Update stat cards
        const statTotal = document.getElementById('statTotal');
        const statOwned = document.getElementById('statOwned');
        const statShared = document.getElementById('statShared');
        const statDomains = document.getElementById('statDomains');
        
        if (statTotal) statTotal.textContent = stats.total;
        if (statOwned) statOwned.textContent = stats.owned;
        if (statShared) statShared.textContent = stats.shared;
        if (statDomains) statDomains.textContent = stats.domainCount;
        
        // Update tab counts
        if (elements.tabCountAll) elements.tabCountAll.textContent = stats.total || '';
        if (elements.tabCountOwned) elements.tabCountOwned.textContent = stats.owned || '';
        if (elements.tabCountShared) elements.tabCountShared.textContent = stats.shared || '';
        
        // Update theme breakdown with percentages for proper visualization
        const themes = stats.byTheme || {};
        const themeTotal = (themes.yellow || 0) + (themes.blue || 0) + (themes.green || 0) + (themes.pink || 0);
        
        const themeYellow = document.getElementById('themeYellow');
        const themeBlue = document.getElementById('themeBlue');
        const themeGreen = document.getElementById('themeGreen');
        const themePink = document.getElementById('themePink');
        
        if (themeTotal > 0) {
            if (themeYellow) themeYellow.style.flex = ((themes.yellow || 0) / themeTotal * 100).toFixed(2);
            if (themeBlue) themeBlue.style.flex = ((themes.blue || 0) / themeTotal * 100).toFixed(2);
            if (themeGreen) themeGreen.style.flex = ((themes.green || 0) / themeTotal * 100).toFixed(2);
            if (themePink) themePink.style.flex = ((themes.pink || 0) / themeTotal * 100).toFixed(2);
        } else {
            if (themeYellow) themeYellow.style.flex = 0;
            if (themeBlue) themeBlue.style.flex = 0;
            if (themeGreen) themeGreen.style.flex = 0;
            if (themePink) themePink.style.flex = 0;
        }
        
        const legendYellow = document.getElementById('legendYellow');
        const legendBlue = document.getElementById('legendBlue');
        const legendGreen = document.getElementById('legendGreen');
        const legendPink = document.getElementById('legendPink');
        
        if (legendYellow) legendYellow.textContent = themes.yellow || 0;
        if (legendBlue) legendBlue.textContent = themes.blue || 0;
        if (legendGreen) legendGreen.textContent = themes.green || 0;
        if (legendPink) legendPink.textContent = themes.pink || 0;
        
        // Update accessible description for theme breakdown
        const themeBreakdown = document.getElementById('themeBreakdown');
        if (themeBreakdown && themeTotal > 0) {
            themeBreakdown.setAttribute('aria-label', 
                `Notes by color: ${themes.yellow || 0} yellow, ${themes.blue || 0} blue, ${themes.green || 0} green, ${themes.pink || 0} pink`
            );
        }
        
        // Update user email in header
        if (stats.user?.email && elements.userEmailSpan) {
            elements.userEmailSpan.textContent = `Signed in as ${stats.user.email}`;
            elements.userEmailSpan.title = `Signed in as ${stats.user.email}`;
        }
        
        if (stats.user?.email && elements.keyIndicator) {
            elements.keyIndicator.textContent = stats.user.email;
            elements.keyIndicator.title = `Connected as ${stats.user.email}`;
            elements.keyIndicator.style.display = 'inline';
        }
        
        // Populate domain dropdown
        if (elements.domainSelect) {
            populateDomainDropdown(elements.domainSelect, stats.domains || []);
        }
        
        // Update last updated timestamp
        updateLastUpdated();
        
        return stats;
    } catch (error) {
        console.error('Error loading stats:', error);
        return null;
    }
}

/**
 * Load notes from the API
 * @param {Object} options - Load options
 * @returns {Promise<Object[]>} Array of notes
 */
async function loadNotes(options = {}) {
    const { 
        apiKey, 
        elements, 
        currentFilter = 'all',
        onUnauthorized
    } = options;
    
    if (!apiKey) {
        if (elements) showApiKeySection(elements);
        return [];
    }

    if (elements?.status) {
        showStatus(elements.status, 'Loading notes...', 'loading');
    }

    try {
        let endpoint;
        const params = new URLSearchParams();
        
        // Get domain/URL filter
        const selectedDomain = elements?.domainSelect?.value;
        const customUrl = elements?.urlInput?.value?.trim();
        
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
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('sticky_notes_api_key');
                if (elements?.status) {
                    showStatus(elements.status, 'Invalid API key. Please enter a valid key.', 'error');
                }
                if (onUnauthorized) onUnauthorized();
                return [];
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
                            headers: { 'Authorization': `Bearer ${apiKey}` }
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
        
        // Cache notes for search filtering
        state.allNotes = notes;
        
        // Apply search filter if active
        const searchQuery = elements?.searchInput?.value?.trim() || state.searchQuery;
        const displayNotes = filterNotesBySearch(notes, searchQuery);
        
        // Track currently displayed notes for filtered reports
        state.displayedNotes = displayNotes;
        
        // Build context for empty states
        const context = {
            filter: currentFilter,
            domain: selectedDomain && selectedDomain !== '__custom__' ? selectedDomain : null,
            isSearch: !!searchQuery
        };
        
        if (elements?.notesList) {
            renderNotes(elements.notesList, displayNotes, context);
        }
        
        const filterLabel = {
            'all': 'all',
            'owned': 'your',
            'shared': 'shared',
            'commented': 'commented'
        }[currentFilter];
        
        if (elements?.status) {
            const countLabel = searchQuery ? `${displayNotes.length} of ${notes.length}` : displayNotes.length;
            showStatus(elements.status, `Found ${countLabel} ${filterLabel} note${displayNotes.length !== 1 ? 's' : ''}`, 'success');
        }
        
        // Update last updated timestamp
        updateLastUpdated();
        
        return notes;
    } catch (error) {
        console.error('Error loading notes:', error);
        if (elements?.status) {
            showStatus(elements.status, `Error: ${error.message}`, 'error');
        }
        return [];
    }
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle filter tab click
 * @param {HTMLElement} tab - The clicked tab element
 * @param {NodeList} allTabs - All filter tab elements
 * @param {Object} appState - Application state
 * @param {Function} loadNotesFn - Function to reload notes
 */
function handleFilterTabClick(tab, allTabs, appState, loadNotesFn) {
    allTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    appState.currentFilter = tab.dataset.filter;
    if (loadNotesFn) loadNotesFn();
}

/**
 * Handle auto-refresh toggle
 * @param {boolean} enabled - Whether auto-refresh is enabled
 * @param {Object} appState - Application state
 * @param {Function} refreshFn - Function to call on refresh
 */
function handleAutoRefreshChange(enabled, appState, refreshFn) {
    if (enabled) {
        appState.refreshInterval = setInterval(() => {
            if (refreshFn) refreshFn();
        }, 5000);
    } else {
        if (appState.refreshInterval) {
            clearInterval(appState.refreshInterval);
            appState.refreshInterval = null;
        }
    }
}

/**
 * Clear refresh interval
 * @param {Object} appState - Application state
 */
function clearRefreshInterval(appState) {
    if (appState.refreshInterval) {
        clearInterval(appState.refreshInterval);
        appState.refreshInterval = null;
    }
}

/**
 * Open the settings (API key) dialog
 * @param {Object} elements - DOM elements
 * @param {string} apiKey - Current API key
 */
function openSettings(elements, apiKey) {
    if (elements.apiKeyInput) {
        elements.apiKeyInput.value = apiKey || '';
    }
    showApiKeySection(elements);
}

// ============================================
// Initialization
// ============================================

/**
 * Check if API key is set and show appropriate UI
 * @param {Object} elements - DOM elements
 * @param {Object} appState - Application state
 * @param {Object} callbacks - Callback functions
 */
function checkApiKey(elements, appState, callbacks = {}) {
    updateKeyIndicator(elements.keyIndicator, appState.apiKey);
    if (!appState.apiKey) {
        showApiKeySection(elements);
    } else {
        hideApiKeySection(elements);
        if (callbacks.onApiKeyValid) callbacks.onApiKeyValid();
    }
}

/**
 * Set up event listeners
 * @param {Object} elements - DOM elements
 * @param {Object} appState - Application state
 * @param {Object} handlers - Handler functions
 */
function setupEventListeners(elements, appState, handlers = {}) {
    const { 
        saveApiKeyBtn, 
        apiKeyInput, 
        loadBtn, 
        urlInput, 
        domainSelect, 
        filterTabs, 
        autoRefreshCheckbox, 
        settingsBtn,
        searchInput,
        notesList
    } = elements;
    
    // API key events
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => handlers.onSaveApiKey?.());
    }
    if (apiKeyInput) {
        apiKeyInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') handlers.onSaveApiKey?.();
        });
    }

    // Load and filter events
    if (loadBtn) {
        loadBtn.addEventListener('click', () => handlers.onLoadNotes?.());
    }
    if (urlInput) {
        urlInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') handlers.onLoadNotes?.();
        });
    }
    if (domainSelect) {
        domainSelect.addEventListener('change', () => handlers.onDomainChange?.());
    }

    // Filter tabs
    if (filterTabs) {
        filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                handleFilterTabClick(tab, filterTabs, appState, handlers.onLoadNotes);
            });
        });
    }

    // Auto-refresh
    if (autoRefreshCheckbox) {
        autoRefreshCheckbox.addEventListener('change', (event) => {
            handleAutoRefreshChange(event.target.checked, appState, handlers.onRefresh);
        });
    }

    // Settings button
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => handlers.onOpenSettings?.());
    }
    
    // Search input with debouncing
    if (searchInput && notesList) {
        const handleSearch = debounce((query) => {
            appState.searchQuery = query;
            const filtered = filterNotesBySearch(appState.allNotes, query);
            // Track currently displayed notes for filtered reports
            appState.displayedNotes = filtered;
            const context = {
                filter: appState.currentFilter,
                isSearch: !!query
            };
            renderNotes(notesList, filtered, context);
            
            const statusEl = document.getElementById('status');
            if (statusEl) {
                if (query) {
                    showStatus(statusEl, `Found ${filtered.length} of ${appState.allNotes.length} notes matching "${query}"`, 'success');
                } else {
                    showStatus(statusEl, `Found ${appState.allNotes.length} note${appState.allNotes.length !== 1 ? 's' : ''}`, 'success');
                }
            }
        }, 300);
        
        searchInput.addEventListener('input', (event) => handleSearch(event.target.value));
    }
    
    // Console errors toggle (event delegation for dynamically loaded notes)
    if (notesList) {
        notesList.addEventListener('click', (event) => {
            const toggle = event.target.closest('.console-errors-header');
            if (toggle) {
                const consoleErrors = toggle.closest('.console-errors');
                const list = consoleErrors?.querySelector('.console-errors-list');
                if (list) {
                    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
                    toggle.setAttribute('aria-expanded', !isExpanded);
                    list.hidden = isExpanded;
                }
            }
        });
    }
}

/**
 * Set up cleanup on page hide (supports BFCache)
 * Using 'pagehide' instead of 'beforeunload' to allow back/forward cache
 * @param {Object} appState - Application state
 */
function setupCleanup(appState) {
    window.addEventListener('pagehide', () => {
        clearRefreshInterval(appState);
    });
    
    // Restore state when page is shown from BFCache
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            // Page was restored from BFCache
            // Immediately refresh data to avoid showing stale content
            const elements = getDOMElements();
            if (appState.apiKey) {
                loadStats(appState.apiKey, elements);
                loadNotes({
                    apiKey: appState.apiKey,
                    elements,
                    currentFilter: appState.currentFilter
                });
            }
            
            // Re-enable auto-refresh interval if it was enabled
            const autoRefreshCheckbox = document.getElementById('autoRefresh');
            if (autoRefreshCheckbox?.checked && !appState.refreshInterval) {
                appState.refreshInterval = setInterval(() => {
                    const elements = getDOMElements();
                    loadStats(appState.apiKey, elements);
                    loadNotes({
                        apiKey: appState.apiKey,
                        elements,
                        currentFilter: appState.currentFilter
                    });
                }, 5000);
            }
        }
    });
}

// ============================================
// Report Generation
// ============================================

/**
 * Theme colors for report styling
 */
const THEME_COLORS = {
    yellow: '#facc15',
    blue: '#3b82f6',
    green: '#22c55e',
    pink: '#ec4899'
};

/**
 * Environment colors for report styling
 */
const ENVIRONMENT_COLORS = {
    local: '#6b7280',
    development: '#3b82f6',
    staging: '#eab308',
    production: '#ef4444'
};

/**
 * Open the report modal
 */
function openReportModal() {
    const modal = document.getElementById('reportModal');
    if (!modal) return;
    
    // Reset form to defaults
    const formatRadios = document.querySelectorAll('input[name="reportFormat"]');
    formatRadios.forEach(radio => {
        radio.checked = radio.value === 'html';
    });
    
    const scopeRadios = document.querySelectorAll('input[name="reportScope"]');
    scopeRadios.forEach(radio => {
        radio.checked = radio.value === 'allNotes';
    });
    
    const dateRangeInputs = document.getElementById('dateRangeInputs');
    if (dateRangeInputs) {
        dateRangeInputs.classList.add('hidden');
    }
    
    const metadataCheckbox = document.getElementById('reportIncludeMetadata');
    const commentsCheckbox = document.getElementById('reportIncludeComments');
    
    if (metadataCheckbox) metadataCheckbox.checked = true;
    if (commentsCheckbox) commentsCheckbox.checked = true;
    
    modal.classList.remove('hidden');
}

/**
 * Close the report modal
 */
function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Get report options from modal form
 * @returns {Object} Report options
 */
function getReportOptions() {
    const formatEl = document.querySelector('input[name="reportFormat"]:checked');
    const scopeEl = document.querySelector('input[name="reportScope"]:checked');
    const metadataEl = document.getElementById('reportIncludeMetadata');
    const commentsEl = document.getElementById('reportIncludeComments');
    const dateStartEl = document.getElementById('reportDateStart');
    const dateEndEl = document.getElementById('reportDateEnd');

    const options = {
        format: formatEl?.value || 'html',
        scope: scopeEl?.value || 'allNotes',
        includeMetadata: metadataEl?.checked ?? true,
        includeComments: commentsEl?.checked ?? true
    };

    if (options.scope === 'dateRange' && dateStartEl && dateEndEl) {
        if (dateStartEl.value && dateEndEl.value) {
            options.dateRange = {
                start: new Date(dateStartEl.value),
                end: new Date(dateEndEl.value + 'T23:59:59')
            };
        }
    }

    return options;
}

/**
 * Get notes to include in report based on scope
 * @param {Object} options - Report options
 * @param {Array} allNotes - All notes from state
 * @param {Array} filteredNotes - Currently filtered/displayed notes
 * @returns {Array} Notes to include in report
 */
function getNotesForReport(options, allNotes, filteredNotes) {
    let notes = [];
    
    switch (options.scope) {
        case 'filtered':
            notes = filteredNotes;
            break;
        case 'dateRange':
            if (options.dateRange) {
                const { start, end } = options.dateRange;
                notes = allNotes.filter(note => {
                    const noteDate = new Date(note.createdAt);
                    return noteDate >= start && noteDate <= end;
                });
            } else {
                notes = allNotes;
            }
            break;
        case 'allNotes':
        default:
            notes = allNotes;
            break;
    }
    
    return notes;
}

/**
 * Generate report HTML content
 * @param {Array} notes - Notes to include
 * @param {Object} options - Report options
 * @returns {string} HTML content
 */
function generateReportHTML(notes, options) {
    const generatedAt = new Date().toLocaleString();
    const userEmail = document.getElementById('userEmail')?.textContent || '';
    
    // Calculate stats
    const stats = {
        total: notes.length,
        byTheme: { yellow: 0, blue: 0, green: 0, pink: 0 },
        byDomain: {}
    };
    
    for (const note of notes) {
        const theme = note.theme || 'yellow';
        if (stats.byTheme[theme] !== undefined) {
            stats.byTheme[theme]++;
        }
        
        try {
            const url = note.url || note.metadata?.url;
            if (url) {
                const domain = new URL(url).hostname;
                stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
            }
        } catch {
            // Invalid URL
        }
    }
    
    // Build stats HTML
    let themeStatsHTML = '<div class="stats-themes">';
    for (const [theme, count] of Object.entries(stats.byTheme)) {
        if (count > 0) {
            const color = THEME_COLORS[theme] || THEME_COLORS.yellow;
            themeStatsHTML += `<span class="theme-stat" style="background-color: ${color};">${theme}: ${count}</span>`;
        }
    }
    themeStatsHTML += '</div>';
    
    const sortedDomains = Object.entries(stats.byDomain).sort((a, b) => b[1] - a[1]).slice(0, 5);
    let domainStatsHTML = '<div class="stats-domains"><strong>Top Domains:</strong>';
    if (sortedDomains.length > 0) {
        domainStatsHTML += '<ul>';
        for (const [domain, count] of sortedDomains) {
            domainStatsHTML += `<li>${escapeHtml(domain)}: ${count} notes</li>`;
        }
        domainStatsHTML += '</ul>';
    }
    domainStatsHTML += '</div>';
    
    // Build notes HTML
    let notesHTML = '';
    for (const note of notes) {
        const theme = note.theme || 'yellow';
        const themeColor = THEME_COLORS[theme] || THEME_COLORS.yellow;
        const content = note.content || '';
        const createdAt = formatDate(note.createdAt);
        const url = note.url || '';
        
        notesHTML += `
            <div class="note-card" style="border-left-color: ${themeColor};">
                <div class="note-header">
                    <span class="note-theme" style="background-color: ${themeColor};">${theme}</span>
                    <span class="note-date">${escapeHtml(createdAt)}</span>
                </div>
                <div class="note-content">${content}</div>`;
        
        if (url) {
            notesHTML += `
                <div class="note-url">
                    <strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>
                </div>`;
        }
        
        // Add metadata if enabled
        if (options.includeMetadata && note.metadata) {
            const metadata = note.metadata;
            const env = metadata.environment || 'production';
            const envColor = ENVIRONMENT_COLORS[env] || ENVIRONMENT_COLORS.production;
            
            notesHTML += `
                <div class="note-metadata">
                    <div class="metadata-header">Metadata</div>
                    <div class="metadata-grid">`;
            
            if (metadata.browser) {
                notesHTML += `<div class="metadata-item"><strong>Browser:</strong> ${escapeHtml(metadata.browser)}</div>`;
            }
            if (metadata.viewport) {
                notesHTML += `<div class="metadata-item"><strong>Viewport:</strong> ${escapeHtml(metadata.viewport)}</div>`;
            }
            if (env) {
                notesHTML += `<div class="metadata-item"><strong>Environment:</strong> <span style="color: ${envColor};">${escapeHtml(env)}</span></div>`;
            }
            if (note.selector && note.selector !== '__PAGE__') {
                notesHTML += `<div class="metadata-item metadata-selector"><strong>Selector:</strong> <code>${escapeHtml(note.selector)}</code></div>`;
            }
            
            notesHTML += `
                    </div>
                </div>`;
        }
        
        notesHTML += `
            </div>`;
    }
    
    // Full HTML document with embedded styles
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sticky Notes Report</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; background: #f9fafb; margin: 0; padding: 20px; }
        .report-container { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .report-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px 32px; }
        .report-title { margin: 0 0 8px 0; font-size: 24px; font-weight: 600; }
        .report-meta { font-size: 14px; opacity: 0.9; }
        .report-meta span { margin-right: 16px; }
        .report-body { padding: 24px 32px; }
        .report-stats { background: #f3f4f6; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
        .stats-themes { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .theme-stat { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; color: #1f2937; }
        .stats-domains { font-size: 14px; }
        .stats-domains ul { margin: 8px 0 0 0; padding-left: 20px; }
        .notes-section { margin-top: 24px; }
        .notes-section-title { font-size: 18px; font-weight: 600; margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
        .note-card { background: white; border: 1px solid #e5e7eb; border-left: 4px solid #facc15; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
        .note-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .note-theme { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #1f2937; }
        .note-date { font-size: 12px; color: #6b7280; }
        .note-content { font-size: 14px; line-height: 1.7; margin-bottom: 12px; }
        .note-url { font-size: 13px; color: #6b7280; margin-bottom: 12px; word-break: break-all; }
        .note-url a { color: #3b82f6; text-decoration: none; }
        .note-metadata { background: #f9fafb; border-radius: 6px; padding: 12px 16px; margin-top: 12px; font-size: 13px; }
        .metadata-header { font-weight: 600; margin-bottom: 8px; color: #4b5563; }
        .metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
        .metadata-item { color: #6b7280; }
        .metadata-item strong { color: #4b5563; }
        .metadata-selector { grid-column: 1 / -1; }
        .metadata-selector code { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-size: 12px; word-break: break-all; }
        .report-footer { text-align: center; padding: 16px 32px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
        @media print { body { background: white; padding: 0; } .report-container { box-shadow: none; } .note-card { break-inside: avoid; } }
    </style>
</head>
<body>
    <div class="report-container">
        <header class="report-header">
            <h1 class="report-title">Sticky Notes Report</h1>
            <div class="report-meta">
                <span>Generated: ${escapeHtml(generatedAt)}</span>
                ${userEmail ? `<span>By: ${escapeHtml(userEmail)}</span>` : ''}
                <span>${notes.length} notes</span>
            </div>
        </header>
        <main class="report-body">
            <div class="report-stats">
                <div class="stats-summary">
                    <strong>Total Notes:</strong> ${stats.total}
                </div>
                ${themeStatsHTML}
                ${domainStatsHTML}
            </div>
            <section class="notes-section">
                <h2 class="notes-section-title">Notes</h2>
                ${notesHTML}
            </section>
        </main>
        <footer class="report-footer">
            Generated by Sticky Notes Chrome Extension
        </footer>
    </div>
</body>
</html>`;
}

/**
 * Generate report Markdown content
 * @param {Array} notes - Notes to include
 * @param {Object} options - Report options
 * @returns {string} Markdown content
 */
function generateReportMarkdown(notes, options) {
    const generatedAt = new Date().toLocaleString();
    const userEmail = document.getElementById('userEmail')?.textContent || '';
    
    let md = '# Sticky Notes Report\n\n';
    md += `**Generated:** ${generatedAt}`;
    if (userEmail) {
        md += ` | **By:** ${userEmail}`;
    }
    md += ` | **Total Notes:** ${notes.length}\n\n`;
    
    md += '## Notes\n\n';
    
    for (const note of notes) {
        const theme = note.theme || 'yellow';
        const content = stripHtml(note.content || '').trim();
        const createdAt = formatDate(note.createdAt);
        const url = note.url || '';
        
        md += `### Note (${theme})\n\n`;
        md += `**Created:** ${createdAt}\n\n`;
        
        if (content) {
            md += `${content}\n\n`;
        }
        
        if (url) {
            md += `**URL:** ${url}\n\n`;
        }
        
        if (options.includeMetadata && note.metadata) {
            md += '**Metadata:**\n\n';
            if (note.metadata.browser) {
                md += `- Browser: ${note.metadata.browser}\n`;
            }
            if (note.metadata.viewport) {
                md += `- Viewport: ${note.metadata.viewport}\n`;
            }
            if (note.metadata.environment) {
                md += `- Environment: ${note.metadata.environment}\n`;
            }
            if (note.selector && note.selector !== '__PAGE__') {
                md += `- Selector: \`${note.selector}\`\n`;
            }
            md += '\n';
        }
        
        md += '---\n\n';
    }
    
    md += '*Generated by Sticky Notes Chrome Extension*\n';
    
    return md;
}

/**
 * Download report file
 * @param {string} content - Report content
 * @param {string} format - Report format (html, markdown)
 */
function downloadReportFile(content, format) {
    const dateStr = new Date().toISOString().split('T')[0];
    let filename, mimeType;
    
    switch (format) {
        case 'markdown':
            filename = `sticky-notes-report-${dateStr}.md`;
            mimeType = 'text/markdown;charset=utf-8';
            break;
        case 'html':
        default:
            filename = `sticky-notes-report-${dateStr}.html`;
            mimeType = 'text/html;charset=utf-8';
            break;
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Handle report generation
 */
function handleGenerateReport() {
    const options = getReportOptions();
    
    // Validate date range if selected
    if (options.scope === 'dateRange') {
        const dateStartEl = document.getElementById('reportDateStart');
        const dateEndEl = document.getElementById('reportDateEnd');
        
        if (!dateStartEl?.value || !dateEndEl?.value) {
            showStatus(document.getElementById('status'), 'Please select both start and end dates', 'error');
            return;
        }
    }
    
    closeReportModal();
    
    // For 'filtered' scope, use the currently displayed notes from state
    // For 'allNotes' and 'dateRange', we use state.allNotes
    const notes = getNotesForReport(options, state.allNotes, state.displayedNotes);
    
    if (notes.length === 0) {
        showStatus(document.getElementById('status'), 'No notes to include in report', 'error');
        return;
    }
    
    // Generate report based on format
    let content;
    
    switch (options.format) {
        case 'pdf': {
            // For PDF, generate HTML and open in new window for print
            content = generateReportHTML(notes, options);
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(content);
                printWindow.document.close();
                printWindow.print();
            }
            showStatus(document.getElementById('status'), `Report generated with ${notes.length} notes (use browser print to save as PDF)`, 'success');
            return;
        }
        case 'markdown':
            content = generateReportMarkdown(notes, options);
            break;
        case 'html':
        default:
            content = generateReportHTML(notes, options);
            break;
    }
    
    downloadReportFile(content, options.format);
    showStatus(document.getElementById('status'), `Report generated with ${notes.length} notes`, 'success');
}

/**
 * Set up report modal event listeners
 */
function setupReportModal() {
    const modal = document.getElementById('reportModal');
    if (!modal) return;
    
    const generateBtn = document.getElementById('generateReportBtn');
    const closeBtn = document.getElementById('reportModalClose');
    const cancelBtn = document.getElementById('reportModalCancel');
    const generateReportBtn = document.getElementById('report-modal-generate');
    const backdrop = modal.querySelector('.modal-backdrop');
    const scopeRadios = document.querySelectorAll('input[name="reportScope"]');
    
    // Open modal
    if (generateBtn) {
        generateBtn.addEventListener('click', openReportModal);
    }
    
    // Close buttons
    if (closeBtn) {
        closeBtn.addEventListener('click', closeReportModal);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeReportModal);
    }
    if (backdrop) {
        backdrop.addEventListener('click', closeReportModal);
    }
    
    // Generate button
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', handleGenerateReport);
    }
    
    // Scope change - show/hide date range inputs
    scopeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const dateRangeInputs = document.getElementById('dateRangeInputs');
            if (e.target.value === 'dateRange') {
                dateRangeInputs?.classList.remove('hidden');
                // Set default dates (last 30 days)
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
                
                const dateStartEl = document.getElementById('reportDateStart');
                const dateEndEl = document.getElementById('reportDateEnd');
                
                if (dateStartEl && !dateStartEl.value) {
                    dateStartEl.value = startDate.toISOString().split('T')[0];
                }
                if (dateEndEl && !dateEndEl.value) {
                    dateEndEl.value = endDate.toISOString().split('T')[0];
                }
            } else {
                dateRangeInputs?.classList.add('hidden');
            }
        });
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeReportModal();
        }
    });
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the dashboard
 */
function init() {
    // Initialize state from localStorage
    state.apiKey = localStorage.getItem('sticky_notes_api_key');
    
    const elements = getDOMElements();
    
    // Create bound handler functions
    const loadNotesHandler = () => loadNotes({
        apiKey: state.apiKey,
        elements,
        currentFilter: state.currentFilter,
        onUnauthorized: () => {
            state.apiKey = null;
            showApiKeySection(elements);
        }
    });
    
    const loadStatsHandler = () => loadStats(state.apiKey, elements);
    
    const handlers = {
        onSaveApiKey: () => saveApiKey(elements, state, {
            onSuccess: () => {
                loadStatsHandler();
                loadNotesHandler();
            }
        }),
        onLoadNotes: loadNotesHandler,
        onDomainChange: () => handleDomainSelectChange(elements, loadNotesHandler),
        onRefresh: () => {
            loadStatsHandler();
            loadNotesHandler();
        },
        onOpenSettings: () => openSettings(elements, state.apiKey)
    };
    
    handleUrlParams(elements);
    setupEventListeners(elements, state, handlers);
    setupReportModal();
    setupCleanup(state);
    checkApiKey(elements, state, {
        onApiKeyValid: () => {
            loadStatsHandler();
            loadNotesHandler();
        }
    });
}

// ============================================
// Auto-initialize (for browser)
// ============================================

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}

// ============================================
// Exports (for testing)
// ============================================

export {
    // State
    state,
    // Utilities
    escapeHtml,
    isValidUrl,
    getSafeUrl,
    stripHtml,
    formatDate,
    getErrorTypeLabel,
    renderConsoleErrors,
    filterNotesBySearch,
    debounce,
    updateLastUpdated,
    // DOM helpers
    getDOMElements,
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
    setupCleanup,
    init,
    // Report functions
    openReportModal,
    closeReportModal,
    getReportOptions,
    getNotesForReport,
    generateReportHTML,
    generateReportMarkdown,
    downloadReportFile,
    handleGenerateReport,
    setupReportModal
};