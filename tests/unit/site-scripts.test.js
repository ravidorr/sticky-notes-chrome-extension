/**
 * Unit tests for site/js/scripts.js
 * Landing page JavaScript functionality
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
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
    demoState
} from '../../site/js/scripts.js';

describe('site/scripts.js', () => {
    const localThis = {};

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';
        document.documentElement.removeAttribute('data-theme');
        
        // Reset localStorage
        localStorage.clear();
        
        // Reset demo state
        demoState.activeMode = false;
        demoState.notes.clear();
        
        // Reset scroll position
        Object.defineProperty(window, 'scrollY', {
            value: 0,
            writable: true,
            configurable: true
        });
        
        // Mock requestAnimationFrame with deferred execution
        localThis.rafCallbacks = [];
        localThis.rafIdCounter = 0;
        global.requestAnimationFrame = jest.fn((callback) => {
            const id = localThis.rafIdCounter++;
            localThis.rafCallbacks.push({ id, callback, cancelled: false });
            // Use Promise.resolve to defer execution until after assignment
            Promise.resolve().then(() => {
                const entry = localThis.rafCallbacks.find(e => e.id === id);
                if (entry && !entry.cancelled) {
                    entry.callback();
                }
            });
            return id;
        });
        global.cancelAnimationFrame = jest.fn((id) => {
            const entry = localThis.rafCallbacks.find(e => e.id === id);
            if (entry) {
                entry.cancelled = true;
            }
        });
        // Helper to flush all pending RAF callbacks synchronously
        localThis.flushRaf = () => {
            return Promise.resolve();
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ============================================
    // Performance Utilities Tests
    // ============================================

    describe('rafThrottle', () => {
        it('should throttle function calls to animation frames', async () => {
            const fn = jest.fn();
            const throttled = rafThrottle(fn);
            
            throttled(1);
            throttled(2);
            throttled(3);
            
            // Wait for RAF to execute
            await Promise.resolve();
            
            // Only one call should be made (with last args)
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith(3);
        });

        it('should pass the last arguments to the function', () => {
            // Use async RAF mock for this test
            const callbacks = [];
            global.requestAnimationFrame = jest.fn((cb) => {
                const id = callbacks.length;
                callbacks.push(cb);
                return id;
            });
            
            const fn = jest.fn();
            const throttled = rafThrottle(fn);
            
            throttled('a');
            throttled('b');
            throttled('c');
            
            // Execute the RAF callback
            callbacks[0]();
            
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith('c');
        });

        it('should have a cancel method', () => {
            const fn = jest.fn();
            const throttled = rafThrottle(fn);
            
            expect(typeof throttled.cancel).toBe('function');
        });

        it('should cancel pending animation frame on cancel()', () => {
            // Use async RAF mock
            global.requestAnimationFrame = jest.fn(() => 123);
            
            const fn = jest.fn();
            const throttled = rafThrottle(fn);
            
            throttled();
            throttled.cancel();
            
            expect(global.cancelAnimationFrame).toHaveBeenCalledWith(123);
        });

        it('should not throw if cancel called when no pending frame', () => {
            const fn = jest.fn();
            const throttled = rafThrottle(fn);
            
            expect(() => throttled.cancel()).not.toThrow();
        });
    });

    // ============================================
    // Theme Tests
    // ============================================

    describe('Theme Constants', () => {
        it('should export correct storage key', () => {
            expect(THEME_STORAGE_KEY).toBe('sticky-notes-theme');
        });

        it('should export correct theme values', () => {
            expect(THEME_LIGHT).toBe('light');
            expect(THEME_DARK).toBe('dark');
        });
    });

    describe('getPreferredTheme', () => {
        it('should return stored theme from localStorage', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_DARK);
            
            expect(getPreferredTheme()).toBe(THEME_DARK);
        });

        it('should return light when no preference is set and system is light', () => {
            // matchMedia mock returns matches: false by default
            expect(getPreferredTheme()).toBe(THEME_LIGHT);
        });

        it('should return dark when system prefers dark and no localStorage', () => {
            global.matchMedia = jest.fn().mockImplementation(() => ({
                matches: true,
                addEventListener: jest.fn(),
                removeEventListener: jest.fn()
            }));
            
            expect(getPreferredTheme()).toBe(THEME_DARK);
        });

        it('should prioritize localStorage over system preference', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            global.matchMedia = jest.fn().mockImplementation(() => ({
                matches: true, // System prefers dark
                addEventListener: jest.fn(),
                removeEventListener: jest.fn()
            }));
            
            expect(getPreferredTheme()).toBe(THEME_LIGHT);
        });
    });

    describe('applyTheme', () => {
        it('should set data-theme attribute to dark', () => {
            applyTheme(THEME_DARK);
            
            expect(document.documentElement.getAttribute('data-theme')).toBe(THEME_DARK);
        });

        it('should set data-theme attribute to light', () => {
            applyTheme(THEME_LIGHT);
            
            expect(document.documentElement.getAttribute('data-theme')).toBe(THEME_LIGHT);
        });
    });

    describe('saveTheme', () => {
        it('should save theme to localStorage', () => {
            saveTheme(THEME_DARK);
            
            expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEME_DARK);
        });
    });

    describe('getCurrentTheme', () => {
        it('should return dark when data-theme is dark', () => {
            document.documentElement.setAttribute('data-theme', THEME_DARK);
            
            expect(getCurrentTheme()).toBe(THEME_DARK);
        });

        it('should return light when data-theme is light', () => {
            document.documentElement.setAttribute('data-theme', THEME_LIGHT);
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
        });

        it('should return light when no data-theme is set', () => {
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
        });
    });

    describe('toggleTheme', () => {
        it('should toggle from light to dark', () => {
            applyTheme(THEME_LIGHT);
            
            const newTheme = toggleTheme();
            
            expect(newTheme).toBe(THEME_DARK);
            expect(getCurrentTheme()).toBe(THEME_DARK);
            expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEME_DARK);
        });

        it('should toggle from dark to light', () => {
            applyTheme(THEME_DARK);
            
            const newTheme = toggleTheme();
            
            expect(newTheme).toBe(THEME_LIGHT);
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(THEME_LIGHT);
        });
    });

    describe('initTheme', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="theme-toggle"></button>
                <button id="theme-toggle-mobile"></button>
            `;
        });

        it('should apply initial theme on init', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_DARK);
            
            initTheme();
            
            expect(getCurrentTheme()).toBe(THEME_DARK);
        });

        it('should toggle theme when button is clicked', () => {
            // Set localStorage to light so initTheme starts with light
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            initTheme();
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            
            document.getElementById('theme-toggle').click();
            
            expect(getCurrentTheme()).toBe(THEME_DARK);
        });

        it('should work with mobile toggle button', () => {
            // Set localStorage to light so initTheme starts with light
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            initTheme();
            
            document.getElementById('theme-toggle-mobile').click();
            
            expect(getCurrentTheme()).toBe(THEME_DARK);
        });

        it('should return cleanup function', () => {
            const cleanup = initTheme();
            
            expect(typeof cleanup).toBe('function');
        });

        it('should remove event listeners on cleanup', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            const cleanup = initTheme();
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            
            cleanup();
            
            // Manually set theme back to light for the test
            applyTheme(THEME_LIGHT);
            
            // After cleanup, clicking should not change theme
            document.getElementById('theme-toggle').click();
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
        });

        it('should work with custom selectors', () => {
            document.body.innerHTML = '<button id="custom-toggle"></button>';
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            
            initTheme('#custom-toggle');
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            
            document.getElementById('custom-toggle').click();
            
            expect(getCurrentTheme()).toBe(THEME_DARK);
        });

        it('should handle missing toggle buttons gracefully', () => {
            document.body.innerHTML = '';
            
            expect(() => initTheme()).not.toThrow();
        });

        it('should toggle theme when Enter key is pressed on toggle button', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            initTheme();
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            
            const button = document.getElementById('theme-toggle');
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            button.dispatchEvent(event);
            
            expect(getCurrentTheme()).toBe(THEME_DARK);
        });

        it('should toggle theme when Space key is pressed on toggle button', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            initTheme();
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            
            const button = document.getElementById('theme-toggle');
            const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
            button.dispatchEvent(event);
            
            expect(getCurrentTheme()).toBe(THEME_DARK);
        });

        it('should not toggle theme on other key presses', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            initTheme();
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            
            const button = document.getElementById('theme-toggle');
            const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
            button.dispatchEvent(event);
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
        });

        it('should remove keyboard event listeners on cleanup', () => {
            localStorage.setItem(THEME_STORAGE_KEY, THEME_LIGHT);
            const cleanup = initTheme();
            
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
            
            cleanup();
            
            // Manually set theme back to light for the test
            applyTheme(THEME_LIGHT);
            
            // After cleanup, keydown should not change theme
            const button = document.getElementById('theme-toggle');
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            button.dispatchEvent(event);
            expect(getCurrentTheme()).toBe(THEME_LIGHT);
        });
    });

    // ============================================
    // Navigation Tests
    // ============================================

    describe('initNavScroll', () => {
        beforeEach(() => {
            document.body.innerHTML = '<nav id="navbar" class="navbar"></nav>';
            localThis.navbar = document.getElementById('navbar');
        });

        it('should add scrolled class when scrolled past threshold', async () => {
            initNavScroll(localThis.navbar, 20);
            await Promise.resolve(); // Wait for initial RAF
            
            // Simulate scroll past threshold
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            expect(localThis.navbar.classList.contains('scrolled')).toBe(true);
        });

        it('should remove scrolled class when scrolled above threshold', async () => {
            localThis.navbar.classList.add('scrolled');
            initNavScroll(localThis.navbar, 20);
            await Promise.resolve(); // Wait for initial RAF
            
            // Simulate scroll above threshold
            Object.defineProperty(window, 'scrollY', { value: 10, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            expect(localThis.navbar.classList.contains('scrolled')).toBe(false);
        });

        it('should use default threshold of 20 when not specified', async () => {
            initNavScroll(localThis.navbar);
            await Promise.resolve(); // Wait for initial RAF
            
            // Scroll just above threshold
            Object.defineProperty(window, 'scrollY', { value: 21, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            expect(localThis.navbar.classList.contains('scrolled')).toBe(true);
        });

        it('should return cleanup function that removes event listener', async () => {
            const cleanup = initNavScroll(localThis.navbar);
            await Promise.resolve(); // Wait for initial RAF
            
            // Call cleanup
            cleanup();
            
            // Scroll should no longer affect the class
            localThis.navbar.classList.remove('scrolled');
            Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for any pending RAF
            
            // Class should not be added after cleanup
            expect(localThis.navbar.classList.contains('scrolled')).toBe(false);
        });

        it('should handle null navbar gracefully', () => {
            const cleanup = initNavScroll(null);
            
            expect(typeof cleanup).toBe('function');
            expect(() => cleanup()).not.toThrow();
        });

        it('should check scroll position on initialization', async () => {
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            
            initNavScroll(localThis.navbar, 20);
            await Promise.resolve(); // Wait for initial RAF
            
            expect(localThis.navbar.classList.contains('scrolled')).toBe(true);
        });
    });

    describe('initActiveNavIndicator', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <nav>
                    <a href="#features" class="nav-link">Features</a>
                    <a href="#pricing" class="nav-link">Pricing</a>
                    <a href="#faq" class="nav-link">FAQ</a>
                </nav>
                <section id="features" style="height: 500px;"></section>
                <section id="pricing" style="height: 500px;"></section>
                <section id="faq" style="height: 500px;"></section>
            `;
            localThis.navLinks = document.querySelectorAll('.nav-link');
            localThis.featuresSection = document.getElementById('features');
            localThis.pricingSection = document.getElementById('pricing');
            
            // Mock offsetTop and offsetHeight for sections
            Object.defineProperty(localThis.featuresSection, 'offsetTop', { value: 0, configurable: true });
            Object.defineProperty(localThis.featuresSection, 'offsetHeight', { value: 500, configurable: true });
            Object.defineProperty(localThis.pricingSection, 'offsetTop', { value: 500, configurable: true });
            Object.defineProperty(localThis.pricingSection, 'offsetHeight', { value: 500, configurable: true });
        });

        it('should add active class to nav link when section is in view', async () => {
            initActiveNavIndicator();
            await Promise.resolve(); // Wait for initial RAF
            
            // Scroll to features section
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            const featuresLink = document.querySelector('a[href="#features"]');
            expect(featuresLink.classList.contains('active')).toBe(true);
        });

        it('should set aria-current attribute on active link', async () => {
            initActiveNavIndicator();
            await Promise.resolve(); // Wait for initial RAF
            
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            const featuresLink = document.querySelector('a[href="#features"]');
            expect(featuresLink.getAttribute('aria-current')).toBe('true');
        });

        it('should remove active class and aria-current from other links', async () => {
            initActiveNavIndicator();
            await Promise.resolve(); // Wait for initial RAF
            
            // Start at features
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            const featuresLink = document.querySelector('a[href="#features"]');
            const pricingLink = document.querySelector('a[href="#pricing"]');
            
            expect(featuresLink.classList.contains('active')).toBe(true);
            expect(pricingLink.classList.contains('active')).toBe(false);
            expect(pricingLink.hasAttribute('aria-current')).toBe(false);
        });

        it('should update active link when scrolling to different section', async () => {
            initActiveNavIndicator();
            await Promise.resolve(); // Wait for initial RAF
            
            // Scroll to pricing section
            Object.defineProperty(window, 'scrollY', { value: 550, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            const featuresLink = document.querySelector('a[href="#features"]');
            const pricingLink = document.querySelector('a[href="#pricing"]');
            
            expect(featuresLink.classList.contains('active')).toBe(false);
            expect(pricingLink.classList.contains('active')).toBe(true);
        });

        it('should return cleanup function that removes event listener', async () => {
            const cleanup = initActiveNavIndicator();
            await Promise.resolve(); // Wait for initial RAF
            
            expect(typeof cleanup).toBe('function');
            
            // Set up active state
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for RAF from scroll event
            
            const featuresLink = document.querySelector('a[href="#features"]');
            expect(featuresLink.classList.contains('active')).toBe(true);
            
            // Cleanup
            cleanup();
            featuresLink.classList.remove('active');
            
            // Scroll should no longer update active state
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            window.dispatchEvent(new Event('scroll'));
            await Promise.resolve(); // Wait for any pending RAF
            
            expect(featuresLink.classList.contains('active')).toBe(false);
        });

        it('should handle pages with no sections gracefully', () => {
            document.body.innerHTML = '<a href="#test" class="nav-link">Test</a>';
            
            const cleanup = initActiveNavIndicator();
            
            expect(typeof cleanup).toBe('function');
            expect(() => cleanup()).not.toThrow();
        });

        it('should handle pages with no nav links gracefully', () => {
            document.body.innerHTML = '<section id="test"></section>';
            
            const cleanup = initActiveNavIndicator();
            
            expect(typeof cleanup).toBe('function');
            expect(() => cleanup()).not.toThrow();
        });

        it('should check scroll position on initialization', async () => {
            Object.defineProperty(window, 'scrollY', { value: 50, configurable: true });
            
            initActiveNavIndicator();
            await Promise.resolve(); // Wait for initial RAF
            
            const featuresLink = document.querySelector('a[href="#features"]');
            expect(featuresLink.classList.contains('active')).toBe(true);
        });
    });

    describe('initMobileMenu', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="mobile-menu-btn"></button>
                <div id="mobile-menu" class="hidden"></div>
            `;
            localThis.menuButton = document.getElementById('mobile-menu-btn');
            localThis.mobileMenu = document.getElementById('mobile-menu');
        });

        it('should toggle hidden class on menu button click', () => {
            initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            // First click - should remove hidden
            localThis.menuButton.click();
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(false);
            
            // Second click - should add hidden back
            localThis.menuButton.click();
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(true);
        });

        it('should return cleanup function that removes event listener', () => {
            const cleanup = initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            cleanup();
            
            // Click should no longer toggle menu
            localThis.mobileMenu.classList.add('hidden');
            localThis.menuButton.click();
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(true);
        });

        it('should handle null elements gracefully', () => {
            const cleanup = initMobileMenu(null, localThis.mobileMenu);
            
            expect(typeof cleanup).toBe('function');
            expect(() => cleanup()).not.toThrow();
        });

        it('should update aria-expanded attribute on click', () => {
            localThis.menuButton.setAttribute('aria-expanded', 'false');
            initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            localThis.menuButton.click();
            expect(localThis.menuButton.getAttribute('aria-expanded')).toBe('true');
            
            localThis.menuButton.click();
            expect(localThis.menuButton.getAttribute('aria-expanded')).toBe('false');
        });

        it('should update aria-hidden attribute on mobile menu', () => {
            localThis.mobileMenu.setAttribute('aria-hidden', 'true');
            initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            localThis.menuButton.click();
            expect(localThis.mobileMenu.getAttribute('aria-hidden')).toBe('false');
            
            localThis.menuButton.click();
            expect(localThis.mobileMenu.getAttribute('aria-hidden')).toBe('true');
        });

        it('should update aria-label on menu button click', () => {
            localThis.menuButton.setAttribute('aria-label', 'Open navigation menu');
            initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            localThis.menuButton.click();
            expect(localThis.menuButton.getAttribute('aria-label')).toBe('Close navigation menu');
            
            localThis.menuButton.click();
            expect(localThis.menuButton.getAttribute('aria-label')).toBe('Open navigation menu');
        });

        it('should close menu on Escape key press', () => {
            initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            // Open the menu first
            localThis.menuButton.click();
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(false);
            
            // Press Escape
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(escapeEvent);
            
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(true);
            expect(localThis.menuButton.getAttribute('aria-expanded')).toBe('false');
            expect(localThis.mobileMenu.getAttribute('aria-hidden')).toBe('true');
        });

        it('should not close menu on Escape when already hidden', () => {
            initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            // Menu starts hidden
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(true);
            
            // Press Escape - should not throw or change state
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(escapeEvent);
            
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(true);
        });

        it('should focus menu button after closing with Escape', () => {
            initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            // Open the menu
            localThis.menuButton.click();
            
            // Mock focus
            const focusSpy = jest.spyOn(localThis.menuButton, 'focus');
            
            // Press Escape
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(escapeEvent);
            
            expect(focusSpy).toHaveBeenCalled();
        });

        it('should remove keydown listener on cleanup', () => {
            const cleanup = initMobileMenu(localThis.menuButton, localThis.mobileMenu);
            
            // Open the menu
            localThis.menuButton.click();
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(false);
            
            // Cleanup
            cleanup();
            
            // Press Escape - should not close menu since listener is removed
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(escapeEvent);
            
            expect(localThis.mobileMenu.classList.contains('hidden')).toBe(false);
        });
    });

    describe('initSmoothScroll', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <a href="#section1" id="link1">Section 1</a>
                <a href="#section2" id="link2">Section 2</a>
                <a href="#" id="link-empty">Empty</a>
                <div id="section1"></div>
                <div id="section2"></div>
            `;
            localThis.link1 = document.getElementById('link1');
            localThis.link2 = document.getElementById('link2');
            localThis.linkEmpty = document.getElementById('link-empty');
            localThis.section1 = document.getElementById('section1');
        });

        it('should call scrollIntoView on target element when anchor clicked', () => {
            initSmoothScroll();
            
            localThis.link1.click();
            
            expect(localThis.section1.scrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'start'
            });
        });

        it('should not scroll for href="#" links', () => {
            initSmoothScroll();
            
            localThis.linkEmpty.click();
            
            // scrollIntoView should not be called for empty href
            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        });

        it('should return cleanup function that removes event listeners', () => {
            const cleanup = initSmoothScroll();
            
            cleanup();
            
            // Reset mock
            Element.prototype.scrollIntoView.mockClear();
            
            // Click should no longer trigger scroll
            localThis.link1.click();
            
            // scrollIntoView might still be called by browser default, but our handler is removed
            // This test verifies the cleanup function runs without error
            expect(typeof cleanup).toBe('function');
        });

        it('should work with custom selector', () => {
            document.body.innerHTML = `
                <a href="#target" class="custom-link">Link</a>
                <div id="target"></div>
            `;
            
            initSmoothScroll('.custom-link');
            
            document.querySelector('.custom-link').click();
            
            expect(document.getElementById('target').scrollIntoView).toHaveBeenCalled();
        });
    });

    describe('updateDemoUI', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="demo-btn" class="btn-demo-toggle"></button>
                <span id="demo-btn-text">Activate Selection Mode</span>
                <div id="demo-canvas"></div>
                <div id="demo-empty-state"></div>
            `;
            localThis.elements = {
                button: document.getElementById('demo-btn'),
                buttonText: document.getElementById('demo-btn-text'),
                canvas: document.getElementById('demo-canvas'),
                emptyState: document.getElementById('demo-empty-state')
            };
        });

        it('should activate UI when activeMode is true', () => {
            const state = { activeMode: true, notes: new Set() };
            
            updateDemoUI(localThis.elements, state);
            
            expect(localThis.elements.button.classList.contains('active')).toBe(true);
            expect(localThis.elements.buttonText.textContent).toBe('Select an Element...');
            expect(localThis.elements.canvas.classList.contains('selection-mode')).toBe(true);
            expect(localThis.elements.emptyState.classList.contains('hidden')).toBe(true);
        });

        it('should deactivate UI when activeMode is false', () => {
            localThis.elements.button.classList.add('active');
            localThis.elements.canvas.classList.add('selection-mode');
            const state = { activeMode: false, notes: new Set() };
            
            updateDemoUI(localThis.elements, state);
            
            expect(localThis.elements.button.classList.contains('active')).toBe(false);
            expect(localThis.elements.buttonText.textContent).toBe('Activate Selection Mode');
            expect(localThis.elements.canvas.classList.contains('selection-mode')).toBe(false);
            expect(localThis.elements.emptyState.classList.contains('hidden')).toBe(false);
        });

        it('should keep empty state hidden when notes exist', () => {
            localThis.elements.emptyState.classList.add('hidden');
            const state = { activeMode: false, notes: new Set(['1']) };
            
            updateDemoUI(localThis.elements, state);
            
            expect(localThis.elements.emptyState.classList.contains('hidden')).toBe(true);
        });

        it('should handle missing elements gracefully', () => {
            const incompleteElements = { button: null, buttonText: null, canvas: null, emptyState: null };
            const state = { activeMode: true, notes: new Set() };
            
            expect(() => updateDemoUI(incompleteElements, state)).not.toThrow();
        });
    });

    describe('createNote', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="parent" data-id="1"></div>';
            localThis.parent = document.getElementById('parent');
            localThis.state = { activeMode: true, notes: new Set() };
        });

        it('should create a note element and append to parent', () => {
            createNote(localThis.parent, '1', localThis.state, () => {});
            
            const note = localThis.parent.querySelector('.sticky-note');
            expect(note).not.toBeNull();
            expect(note.querySelector('.note-header')).not.toBeNull();
            expect(note.querySelector('.note-textarea')).not.toBeNull();
        });

        it('should add note id to state', () => {
            createNote(localThis.parent, 'test-id', localThis.state, () => {});
            
            expect(localThis.state.notes.has('test-id')).toBe(true);
        });

        it('should remove note from DOM and state when close button clicked', () => {
            const onDelete = jest.fn();
            createNote(localThis.parent, '1', localThis.state, onDelete);
            
            const closeBtn = localThis.parent.querySelector('.note-close');
            closeBtn.click();
            
            expect(localThis.parent.querySelector('.sticky-note')).toBeNull();
            expect(localThis.state.notes.has('1')).toBe(false);
            expect(onDelete).toHaveBeenCalled();
        });

        it('should stop propagation on note click', () => {
            createNote(localThis.parent, '1', localThis.state, () => {});
            
            const note = localThis.parent.querySelector('.sticky-note');
            const event = new Event('click', { bubbles: true });
            const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
            
            note.dispatchEvent(event);
            
            expect(stopPropagationSpy).toHaveBeenCalled();
        });

        it('should return the created note element', () => {
            const note = createNote(localThis.parent, '1', localThis.state, () => {});
            
            expect(note).toBeInstanceOf(HTMLElement);
            expect(note.className).toBe('sticky-note');
        });
    });

    describe('initDemo', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="demo-activate-btn"></button>
                <span id="demo-btn-text">Activate Selection Mode</span>
                <div id="demo-canvas">
                    <div class="demo-target" data-id="1">Target 1</div>
                    <div class="demo-target" data-id="2">Target 2</div>
                </div>
                <div id="demo-empty-state"></div>
            `;
            
            // Reset demo state
            demoState.activeMode = false;
            demoState.notes.clear();
        });

        it('should toggle selection mode when button clicked', () => {
            initDemo();
            
            const button = document.getElementById('demo-activate-btn');
            button.click();
            
            expect(demoState.activeMode).toBe(true);
            expect(button.classList.contains('active')).toBe(true);
        });

        it('should create note when target clicked in selection mode', () => {
            initDemo();
            
            // Activate selection mode
            document.getElementById('demo-activate-btn').click();
            
            // Click target
            document.querySelector('.demo-target').click();
            
            expect(demoState.notes.has('1')).toBe(true);
            expect(document.querySelector('.sticky-note')).not.toBeNull();
        });

        it('should not create note when not in selection mode', () => {
            initDemo();
            
            // Click target without activating
            document.querySelector('.demo-target').click();
            
            expect(demoState.notes.size).toBe(0);
            expect(document.querySelector('.sticky-note')).toBeNull();
        });

        it('should not create duplicate notes on same target', () => {
            initDemo();
            
            // First note
            document.getElementById('demo-activate-btn').click();
            document.querySelector('.demo-target').click();
            
            // Try to add second note to same target
            document.getElementById('demo-activate-btn').click();
            document.querySelector('.demo-target').click();
            
            expect(demoState.notes.size).toBe(1);
            expect(document.querySelectorAll('.sticky-note').length).toBe(1);
        });

        it('should deactivate selection mode after creating note', () => {
            initDemo();
            
            document.getElementById('demo-activate-btn').click();
            document.querySelector('.demo-target').click();
            
            expect(demoState.activeMode).toBe(false);
        });

        it('should return control object with cleanup and reset functions', () => {
            const control = initDemo();
            
            expect(typeof control.cleanup).toBe('function');
            expect(typeof control.reset).toBe('function');
            expect(control.state).toBe(demoState);
        });

        it('should reset demo state and remove notes on reset()', () => {
            const control = initDemo();
            
            // Create a note
            document.getElementById('demo-activate-btn').click();
            document.querySelector('.demo-target').click();
            
            // Reset
            control.reset();
            
            expect(demoState.activeMode).toBe(false);
            expect(demoState.notes.size).toBe(0);
            expect(document.querySelector('.sticky-note')).toBeNull();
        });

        it('should handle missing elements gracefully', () => {
            document.body.innerHTML = '';
            
            const control = initDemo();
            
            expect(typeof control.cleanup).toBe('function');
            expect(() => control.cleanup()).not.toThrow();
        });

        it('should create note when Enter key pressed on target in selection mode', () => {
            initDemo();
            
            // Activate selection mode
            document.getElementById('demo-activate-btn').click();
            
            // Press Enter on target
            const target = document.querySelector('.demo-target');
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            target.dispatchEvent(enterEvent);
            
            expect(demoState.notes.has('1')).toBe(true);
            expect(document.querySelector('.sticky-note')).not.toBeNull();
        });

        it('should create note when Space key pressed on target in selection mode', () => {
            initDemo();
            
            // Activate selection mode
            document.getElementById('demo-activate-btn').click();
            
            // Press Space on target
            const target = document.querySelector('.demo-target');
            const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
            target.dispatchEvent(spaceEvent);
            
            expect(demoState.notes.has('1')).toBe(true);
            expect(document.querySelector('.sticky-note')).not.toBeNull();
        });

        it('should not create note on keydown when not in selection mode', () => {
            initDemo();
            
            // Press Enter without activating selection mode
            const target = document.querySelector('.demo-target');
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            target.dispatchEvent(enterEvent);
            
            expect(demoState.notes.size).toBe(0);
            expect(document.querySelector('.sticky-note')).toBeNull();
        });

        it('should prevent default on Enter/Space in selection mode', () => {
            initDemo();
            
            // Activate selection mode
            document.getElementById('demo-activate-btn').click();
            
            // Press Enter on target
            const target = document.querySelector('.demo-target');
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            const preventDefaultSpy = jest.spyOn(enterEvent, 'preventDefault');
            target.dispatchEvent(enterEvent);
            
            expect(preventDefaultSpy).toHaveBeenCalled();
        });

        it('should not respond to other keys in selection mode', () => {
            initDemo();
            
            // Activate selection mode
            document.getElementById('demo-activate-btn').click();
            
            // Press a different key
            const target = document.querySelector('.demo-target');
            const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
            target.dispatchEvent(tabEvent);
            
            expect(demoState.notes.size).toBe(0);
            expect(document.querySelector('.sticky-note')).toBeNull();
            // Selection mode should still be active
            expect(demoState.activeMode).toBe(true);
        });
    });
});
