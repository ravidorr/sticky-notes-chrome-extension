/**
 * Unit tests for src/popup/popup.js
 * Tests for popup UI functions
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Import the functions we want to test
// Note: handlers module will be imported but won't interfere with our tests
// since we're testing UI functions that work on DOM elements
import {
    showAuthSection,
    showUserSection,
    renderNotesList,
    initDOMElements,
    switchTab,
    updateSharedNotesCount,
    setupTabs
} from '../../src/popup/popup.js';

// Import createPopupHandlers to use for renderNotesList tests
import { createPopupHandlers } from '../../src/popup/handlers.js';

describe('src/popup/popup.js', () => {
    const localThis = {};

    beforeEach(() => {
        // Set up DOM structure
        document.body.innerHTML = `
            <div id="authSection" class="hidden"></div>
            <div id="userSection"></div>
            <button id="loginBtn">Login</button>
            <button id="logoutBtn">Logout</button>
            <button id="closeBtn">Close</button>
            <img id="userAvatar" src="" />
            <span id="userName"></span>
            <span id="userEmail"></span>
            <button id="addNoteBtn">Add Note</button>
            <div id="notesList"></div>
            <span id="notesCount">0</span>
            <div class="action-hint"></div>
            <!-- Tab elements -->
            <button id="thisPageTab" class="popup-tab active" data-tab="this-page">
                <span>This Page</span>
                <span id="thisPageCount" class="tab-count">0</span>
            </button>
            <button id="sharedTab" class="popup-tab" data-tab="shared">
                <span>Shared</span>
                <span id="sharedCount" class="tab-count tab-count-unread hidden">0</span>
            </button>
            <section id="thisPageContent" class="tab-content notes-section"></section>
            <section id="sharedContent" class="tab-content notes-section hidden"></section>
            <div id="sharedNotesList" class="notes-list"></div>
        `;

        // Initialize DOM elements by calling the function
        initDOMElements();
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    // ============================================
    // initDOMElements Tests
    // ============================================

    describe('initDOMElements', () => {
        it('should not throw when DOM elements exist', () => {
            expect(() => initDOMElements()).not.toThrow();
        });

        it('should handle missing elements gracefully', () => {
            document.body.innerHTML = '';
            expect(() => initDOMElements()).not.toThrow();
        });
    });

    // ============================================
    // showAuthSection Tests
    // ============================================

    describe('showAuthSection', () => {
        beforeEach(() => {
            localThis.authSection = document.getElementById('authSection');
            localThis.userSection = document.getElementById('userSection');
        });

        it('should show auth section', () => {
            localThis.authSection.classList.add('hidden');
            
            showAuthSection();
            
            expect(localThis.authSection.classList.contains('hidden')).toBe(false);
        });

        it('should hide user section', () => {
            localThis.userSection.classList.remove('hidden');
            
            showAuthSection();
            
            expect(localThis.userSection.classList.contains('hidden')).toBe(true);
        });
    });

    // ============================================
    // showUserSection Tests
    // ============================================

    describe('showUserSection', () => {
        beforeEach(() => {
            localThis.authSection = document.getElementById('authSection');
            localThis.userSection = document.getElementById('userSection');
            localThis.userAvatar = document.getElementById('userAvatar');
            localThis.userName = document.getElementById('userName');
            localThis.userEmail = document.getElementById('userEmail');
        });

        it('should hide auth section', () => {
            localThis.authSection.classList.remove('hidden');
            
            showUserSection({ displayName: 'Test', email: 'test@example.com' });
            
            expect(localThis.authSection.classList.contains('hidden')).toBe(true);
        });

        it('should show user section', () => {
            localThis.userSection.classList.add('hidden');
            
            showUserSection({ displayName: 'Test', email: 'test@example.com' });
            
            expect(localThis.userSection.classList.contains('hidden')).toBe(false);
        });

        it('should set user avatar', () => {
            showUserSection({ 
                displayName: 'Test', 
                email: 'test@example.com',
                photoURL: 'https://example.com/avatar.jpg'
            });
            
            expect(localThis.userAvatar.src).toBe('https://example.com/avatar.jpg');
        });

        it('should use default avatar when photoURL is missing', () => {
            showUserSection({ displayName: 'Test', email: 'test@example.com' });
            
            expect(localThis.userAvatar.src).toContain('default-avatar');
        });

        it('should set user name', () => {
            showUserSection({ displayName: 'John Doe', email: 'john@example.com' });
            
            expect(localThis.userName.textContent).toBe('John Doe');
        });

        it('should use default name when displayName is missing', () => {
            showUserSection({ email: 'test@example.com' });
            
            expect(localThis.userName.textContent).toBe('User');
        });

        it('should set user email', () => {
            showUserSection({ displayName: 'Test', email: 'test@example.com' });
            
            expect(localThis.userEmail.textContent).toBe('test@example.com');
        });

        it('should handle missing email', () => {
            showUserSection({ displayName: 'Test' });
            
            expect(localThis.userEmail.textContent).toBe('');
        });

        it('should handle empty user object', () => {
            showUserSection({});
            
            expect(localThis.userName.textContent).toBe('User');
            expect(localThis.userEmail.textContent).toBe('');
        });
    });

    // ============================================
    // renderNotesList Tests
    // ============================================

    describe('renderNotesList', () => {
        beforeEach(() => {
            localThis.notesList = document.getElementById('notesList');
        });

        it('should render empty state for no notes', () => {
            renderNotesList([]);
            
            // Check that something was rendered (handlers.renderEmptyNotes was called)
            expect(localThis.notesList.innerHTML).not.toBe('');
        });

        it('should render notes when array is not empty', () => {
            const notes = [
                { id: '1', content: 'Note 1', selector: '.test' },
                { id: '2', content: 'Note 2', selector: '.test2' }
            ];
            
            renderNotesList(notes);
            
            // Should render something for each note
            expect(localThis.notesList.innerHTML.length).toBeGreaterThan(0);
        });

        it('should handle single note', () => {
            const notes = [{ id: 'single', content: 'Single note', selector: '.single' }];
            
            renderNotesList(notes);
            
            expect(localThis.notesList.innerHTML).not.toBe('');
        });
    });

    // ============================================
    // createPopupHandlers Tests (re-exported)
    // ============================================

    describe('createPopupHandlers (re-export)', () => {
        it('should export createPopupHandlers function', () => {
            expect(typeof createPopupHandlers).toBe('function');
        });

        it('should create handlers with required methods', () => {
            const handlers = createPopupHandlers({});
            
            expect(handlers).toHaveProperty('handleLogin');
            expect(handlers).toHaveProperty('handleLogout');
            expect(handlers).toHaveProperty('checkAuthState');
            expect(handlers).toHaveProperty('loadNotesForCurrentTab');
        });

        it('should create handlers with shared notes methods', () => {
            const handlers = createPopupHandlers({});
            
            expect(handlers).toHaveProperty('getUnreadSharedNotes');
            expect(handlers).toHaveProperty('getUnreadSharedCount');
            expect(handlers).toHaveProperty('markSharedNoteAsRead');
            expect(handlers).toHaveProperty('renderSharedNoteItem');
            expect(handlers).toHaveProperty('renderEmptySharedNotes');
        });
    });

    // ============================================
    // Tab Navigation Tests
    // ============================================

    describe('switchTab', () => {
        beforeEach(() => {
            localThis.thisPageTab = document.getElementById('thisPageTab');
            localThis.sharedTab = document.getElementById('sharedTab');
            localThis.thisPageContent = document.getElementById('thisPageContent');
            localThis.sharedContent = document.getElementById('sharedContent');
        });

        it('should activate this-page tab', async () => {
            // First switch to shared, then back to this-page
            await switchTab('shared');
            await switchTab('this-page');
            
            expect(localThis.thisPageTab.classList.contains('active')).toBe(true);
            expect(localThis.sharedTab.classList.contains('active')).toBe(false);
            expect(localThis.thisPageContent.classList.contains('hidden')).toBe(false);
            expect(localThis.sharedContent.classList.contains('hidden')).toBe(true);
        });

        it('should activate shared tab', async () => {
            await switchTab('shared');
            
            expect(localThis.thisPageTab.classList.contains('active')).toBe(false);
            expect(localThis.sharedTab.classList.contains('active')).toBe(true);
            expect(localThis.thisPageContent.classList.contains('hidden')).toBe(true);
            expect(localThis.sharedContent.classList.contains('hidden')).toBe(false);
        });
    });

    describe('setupTabs', () => {
        it('should set up tab click handlers without throwing', () => {
            expect(() => setupTabs()).not.toThrow();
        });
    });

    describe('updateSharedNotesCount', () => {
        beforeEach(() => {
            localThis.sharedCount = document.getElementById('sharedCount');
        });

        it('should not throw when called', async () => {
            // This will make a chrome.runtime.sendMessage call that will fail in test,
            // but it should handle the error gracefully
            await expect(updateSharedNotesCount()).resolves.not.toThrow();
        });
    });
});
