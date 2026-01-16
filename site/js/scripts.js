/**
 * Sticky Notes Landing Page Scripts
 * 
 * Functions for the landing page interactivity:
 * - Theme toggle (dark/light mode)
 * - Navigation scroll effect
 * - Active nav link indicator
 * - Mobile menu toggle
 * - Interactive demo
 * - Smooth scrolling
 */

// ============================================
// Constants
// ============================================

const THEME_STORAGE_KEY = 'sticky-notes-theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';

// ============================================
// Performance Utilities
// ============================================

/**
 * Throttle a function to run at most once per animation frame
 * @param {Function} fn - Function to throttle
 * @returns {Function} Throttled function
 */
function rafThrottle(fn) {
    let rafId = null;
    let lastArgs = null;

    const throttled = (...args) => {
        lastArgs = args;
        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                fn(...lastArgs);
                rafId = null;
            });
        }
    };

    throttled.cancel = () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    };

    return throttled;
}

// ============================================
// State
// ============================================

/**
 * Demo state management
 */
const demoState = {
    activeMode: false,
    notes: new Set()
};

// ============================================
// Theme Management
// ============================================

/**
 * Get the user's preferred theme
 * Priority: localStorage > system preference > light
 * @returns {string} 'light' or 'dark'
 */
function getPreferredTheme() {
    // Check localStorage first
    if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === THEME_LIGHT || stored === THEME_DARK) {
            return stored;
        }
    }
    
    // Check system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEME_DARK;
        }
    }
    
    // Default to light
    return THEME_LIGHT;
}

/**
 * Apply theme to the document
 * @param {string} theme - 'light' or 'dark'
 */
function applyTheme(theme) {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    
    if (theme === THEME_DARK) {
        root.setAttribute('data-theme', THEME_DARK);
    } else {
        root.setAttribute('data-theme', THEME_LIGHT);
    }
}

/**
 * Save theme preference to localStorage
 * @param {string} theme - 'light' or 'dark'
 */
function saveTheme(theme) {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
}

/**
 * Get current theme from document
 * @returns {string} 'light' or 'dark'
 */
function getCurrentTheme() {
    if (typeof document === 'undefined') return THEME_LIGHT;
    
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
}

/**
 * Toggle between light and dark themes
 * @returns {string} The new theme
 */
function toggleTheme() {
    const current = getCurrentTheme();
    const newTheme = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    
    applyTheme(newTheme);
    saveTheme(newTheme);
    
    return newTheme;
}

/**
 * Initialize theme toggle functionality
 * @param {string|string[]} toggleSelectors - CSS selector(s) for toggle buttons
 * @returns {Function} Cleanup function
 */
function initTheme(toggleSelectors = ['#theme-toggle', '#theme-toggle-mobile']) {
    // Apply initial theme immediately (before DOM ready to prevent flash)
    const initialTheme = getPreferredTheme();
    applyTheme(initialTheme);
    
    // Convert single selector to array
    const selectors = Array.isArray(toggleSelectors) ? toggleSelectors : [toggleSelectors];
    
    const handlers = [];
    
    // Set up click and keyboard handlers for toggle buttons
    selectors.forEach(selector => {
        const button = document.querySelector(selector);
        if (button) {
            const handleClick = () => toggleTheme();
            const handleKeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleTheme();
                }
            };
            button.addEventListener('click', handleClick);
            button.addEventListener('keydown', handleKeydown);
            handlers.push({ element: button, handler: handleClick, event: 'click' });
            handlers.push({ element: button, handler: handleKeydown, event: 'keydown' });
        }
    });
    
    // Listen for system theme changes
    let mediaQueryHandler = null;
    if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQueryHandler = (event) => {
            // Only auto-switch if user hasn't set a manual preference
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            if (!stored) {
                applyTheme(event.matches ? THEME_DARK : THEME_LIGHT);
            }
        };
        mediaQuery.addEventListener('change', mediaQueryHandler);
    }
    
    // Return cleanup function
    return () => {
        handlers.forEach(({ element, handler, event }) => {
            element.removeEventListener(event, handler);
        });
        if (mediaQueryHandler && window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaQueryHandler);
        }
    };
}

// ============================================
// Navigation
// ============================================

/**
 * Initialize navbar scroll effect
 * Adds 'scrolled' class to navbar when page is scrolled past threshold
 * @param {HTMLElement} navbar - The navbar element
 * @param {number} threshold - Scroll threshold in pixels (default: 20)
 * @returns {Function} Cleanup function to remove event listener
 */
function initNavScroll(navbar, threshold = 20) {
    if (!navbar) {
        console.warn('initNavScroll: navbar element not found');
        return () => {};
    }

    const handleScroll = rafThrottle(() => {
        if (window.scrollY > threshold) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();

    // Return cleanup function
    return () => {
        handleScroll.cancel();
        window.removeEventListener('scroll', handleScroll);
    };
}

/**
 * Initialize active nav link indicator based on scroll position
 * Updates 'active' class on nav links when their corresponding section is in view
 * @returns {Function} Cleanup function to remove event listener
 */
function initActiveNavIndicator() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link[href^="#"], .nav-link[href*="#"]');
    
    if (sections.length === 0 || navLinks.length === 0) {
        return () => {};
    }

    // Cache section positions to avoid forced reflows on scroll
    let sectionPositions = [];
    
    const cacheSectionPositions = () => {
        sectionPositions = Array.from(sections).map(section => ({
            id: section.getAttribute('id'),
            top: section.offsetTop,
            height: section.offsetHeight
        }));
    };

    // Initial cache
    cacheSectionPositions();

    // Recache on resize (debounced)
    let resizeTimeout = null;
    const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(cacheSectionPositions, 150);
    };

    const handleScroll = rafThrottle(() => {
        const scrollPos = window.scrollY + 100; // Offset for navbar height
        
        let currentSection = '';
        
        for (const { id, top, height } of sectionPositions) {
            if (scrollPos >= top && scrollPos < top + height) {
                currentSection = id;
                break;
            }
        }

        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            const sectionId = href.includes('#') ? href.split('#')[1] : '';
            
            if (sectionId === currentSection) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'true');
            } else {
                link.classList.remove('active');
                link.removeAttribute('aria-current');
            }
        });
    });

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    
    // Initial check
    handleScroll();

    return () => {
        handleScroll.cancel();
        clearTimeout(resizeTimeout);
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
    };
}

/**
 * Initialize mobile menu toggle
 * @param {HTMLElement} menuButton - The menu toggle button
 * @param {HTMLElement} mobileMenu - The mobile menu dropdown element
 * @returns {Function} Cleanup function to remove event listener
 */
function initMobileMenu(menuButton, mobileMenu) {
    if (!menuButton || !mobileMenu) {
        console.warn('initMobileMenu: menu button or mobile menu element not found');
        return () => {};
    }

    const handleClick = () => {
        const isHidden = mobileMenu.classList.contains('hidden');
        mobileMenu.classList.toggle('hidden');
        menuButton.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        mobileMenu.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
        menuButton.setAttribute('aria-label', isHidden ? 'Close navigation menu' : 'Open navigation menu');
    };

    // Close menu on Escape key
    const handleKeydown = (event) => {
        if (event.key === 'Escape' && !mobileMenu.classList.contains('hidden')) {
            mobileMenu.classList.add('hidden');
            menuButton.setAttribute('aria-expanded', 'false');
            mobileMenu.setAttribute('aria-hidden', 'true');
            menuButton.setAttribute('aria-label', 'Open navigation menu');
            menuButton.focus();
        }
    };

    menuButton.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);

    // Return cleanup function
    return () => {
        menuButton.removeEventListener('click', handleClick);
        document.removeEventListener('keydown', handleKeydown);
    };
}

// ============================================
// Smooth Scroll
// ============================================

/**
 * Initialize smooth scrolling for anchor links
 * @param {string} selector - CSS selector for anchor links (default: 'a[href^="#"]')
 * @returns {Function} Cleanup function to remove event listeners
 */
function initSmoothScroll(selector = 'a[href^="#"]') {
    const links = document.querySelectorAll(selector);
    const handlers = [];

    links.forEach(link => {
        const handleClick = (event) => {
            const href = link.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                event.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        link.addEventListener('click', handleClick);
        handlers.push({ element: link, handler: handleClick });
    });

    // Return cleanup function
    return () => {
        handlers.forEach(({ element, handler }) => {
            element.removeEventListener('click', handler);
        });
    };
}

// ============================================
// Interactive Demo
// ============================================

/**
 * Update demo UI based on current state
 * @param {Object} elements - DOM elements for the demo
 * @param {HTMLElement} elements.button - The activate button
 * @param {HTMLElement} elements.buttonText - The button text span
 * @param {HTMLElement} elements.canvas - The demo canvas
 * @param {HTMLElement} elements.emptyState - The empty state message
 * @param {Object} state - Current demo state
 */
function updateDemoUI(elements, state) {
    const { button, buttonText, canvas, emptyState } = elements;
    
    if (!button || !buttonText || !canvas || !emptyState) {
        return;
    }

    if (state.activeMode) {
        button.classList.add('active');
        buttonText.textContent = 'Select an Element...';
        canvas.classList.add('selection-mode');
        emptyState.classList.add('hidden');
    } else {
        button.classList.remove('active');
        buttonText.textContent = 'Activate Selection Mode';
        canvas.classList.remove('selection-mode');
        if (state.notes.size === 0) {
            emptyState.classList.remove('hidden');
        }
    }
}

/**
 * Create a sticky note on a target element
 * @param {HTMLElement} parent - The parent element to attach the note to
 * @param {string} id - Unique identifier for the note
 * @param {Object} state - Demo state object
 * @param {Function} onDelete - Callback when note is deleted
 * @returns {HTMLElement} The created note element
 */
function createNote(parent, id, state, onDelete) {
    state.notes.add(id);

    const noteDiv = document.createElement('div');
    noteDiv.className = 'sticky-note';
    noteDiv.innerHTML = `
        <div class="note-header">
            <div class="note-user">You</div>
            <button class="note-close" aria-label="Close note">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <textarea 
            autofocus
            placeholder="Type a note..."
            class="note-textarea"
            aria-label="Note content"
        ></textarea>
    `;

    // Stop propagation to prevent re-triggering selection
    noteDiv.addEventListener('click', (event) => event.stopPropagation());

    // Handle close button
    const closeBtn = noteDiv.querySelector('.note-close');
    closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        noteDiv.remove();
        state.notes.delete(id);
        if (onDelete) onDelete();
    });

    parent.appendChild(noteDiv);

    // Focus textarea
    const textarea = noteDiv.querySelector('textarea');
    if (textarea) {
        textarea.focus();
    }

    return noteDiv;
}

/**
 * Initialize the interactive demo
 * @param {Object} selectors - CSS selectors for demo elements
 * @returns {Object} Demo control object with cleanup function
 */
function initDemo(selectors = {}) {
    const {
        buttonSelector = '#demo-activate-btn',
        buttonTextSelector = '#demo-btn-text',
        canvasSelector = '#demo-canvas',
        emptyStateSelector = '#demo-empty-state',
        targetSelector = '.demo-target'
    } = selectors;

    const button = document.querySelector(buttonSelector);
    const buttonText = document.querySelector(buttonTextSelector);
    const canvas = document.querySelector(canvasSelector);
    const emptyState = document.querySelector(emptyStateSelector);
    const targets = document.querySelectorAll(targetSelector);

    if (!button || !canvas) {
        console.warn('initDemo: required demo elements not found');
        return { cleanup: () => {}, state: demoState };
    }

    const elements = { button, buttonText, canvas, emptyState };
    const handlers = [];

    // Toggle selection mode
    const handleButtonClick = () => {
        demoState.activeMode = !demoState.activeMode;
        updateDemoUI(elements, demoState);
    };

    button.addEventListener('click', handleButtonClick);
    handlers.push({ element: button, event: 'click', handler: handleButtonClick });

    // Handle target clicks
    targets.forEach(target => {
        const handleTargetClick = () => {
            if (!demoState.activeMode) return;

            const id = target.dataset.id;
            if (!id || demoState.notes.has(id)) return;

            createNote(target, id, demoState, () => {
                if (demoState.notes.size === 0 && !demoState.activeMode && emptyState) {
                    emptyState.classList.remove('hidden');
                }
            });

            demoState.activeMode = false;
            updateDemoUI(elements, demoState);
        };

        // Keyboard handler for accessibility
        const handleKeydown = (event) => {
            if ((event.key === 'Enter' || event.key === ' ') && demoState.activeMode) {
                event.preventDefault();
                handleTargetClick(event);
            }
        };

        target.addEventListener('click', handleTargetClick);
        target.addEventListener('keydown', handleKeydown);
        handlers.push({ element: target, event: 'click', handler: handleTargetClick });
        handlers.push({ element: target, event: 'keydown', handler: handleKeydown });
    });

    // Return control object
    return {
        cleanup: () => {
            handlers.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
        },
        state: demoState,
        reset: () => {
            demoState.activeMode = false;
            demoState.notes.clear();
            // Remove all notes from DOM
            document.querySelectorAll('.sticky-note').forEach(note => note.remove());
            updateDemoUI(elements, demoState);
        }
    };
}

// ============================================
// Main Initialization
// ============================================

/**
 * Initialize all landing page functionality
 * @returns {Object} Object with cleanup functions for all features
 */
function init() {
    const cleanups = {};

    // Swap Google Fonts from print to all media (non-render-blocking font loading)
    const googleFonts = document.getElementById('google-fonts');
    if (googleFonts) {
        googleFonts.media = 'all';
    }

    // Initialize theme (do this first to prevent flash)
    cleanups.theme = initTheme();

    // Initialize navbar scroll effect
    const navbar = document.getElementById('navbar');
    cleanups.navScroll = initNavScroll(navbar);

    // Initialize active nav indicator
    cleanups.activeNav = initActiveNavIndicator();

    // Initialize mobile menu
    const menuButton = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    cleanups.mobileMenu = initMobileMenu(menuButton, mobileMenu);

    // Initialize smooth scroll
    cleanups.smoothScroll = initSmoothScroll();

    // Initialize demo
    const demoControl = initDemo();
    cleanups.demo = demoControl.cleanup;

    // Return master cleanup function
    return {
        cleanup: () => {
            Object.values(cleanups).forEach(cleanup => {
                if (typeof cleanup === 'function') cleanup();
            });
        },
        demoControl
    };
}

// ============================================
// Auto-initialize on DOM ready (for browser)
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
    // Performance
    rafThrottle,
    // Theme
    THEME_STORAGE_KEY,
    THEME_LIGHT,
    THEME_DARK,
    getPreferredTheme,
    applyTheme,
    saveTheme,
    getCurrentTheme,
    toggleTheme,
    initTheme,
    // Navigation
    initNavScroll,
    initActiveNavIndicator,
    initMobileMenu,
    initSmoothScroll,
    // Demo
    initDemo,
    updateDemoUI,
    createNote,
    demoState,
    // Main
    init
};
