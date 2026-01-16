/**
 * Unit tests for site/js/generate-key.js
 * API key generation page functionality
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    // State
    state,
    // Firebase
    initializeFirebase,
    // UI functions
    showError,
    hideError,
    updateButton,
    showUserInfo,
    showStep2,
    displayGeneratedKey,
    // Scope functions
    getScopes,
    // Auth functions
    handleSignIn,
    // API functions
    handleGenerateKey,
    handleCopyKey,
    // Setup
    setupEventListeners
} from '../../site/js/generate-key.js';

describe('site/js/generate-key.js', () => {
    const localThis = {};

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';
        
        // Reset state
        state.app = null;
        state.auth = null;
        state.currentUser = null;
        state.idToken = null;
        state.generatedKey = null;
        
        // Mock fetch
        global.fetch = jest.fn();
        
        // Mock clipboard
        Object.assign(navigator, {
            clipboard: {
                writeText: jest.fn().mockResolvedValue(undefined)
            }
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    // ============================================
    // Firebase Initialization Tests
    // ============================================

    describe('initializeFirebase', () => {
        it('should initialize Firebase successfully', () => {
            const mockApp = { name: 'test-app' };
            const mockAuth = { currentUser: null };
            const mockInitializeApp = jest.fn().mockReturnValue(mockApp);
            const mockGetAuth = jest.fn().mockReturnValue(mockAuth);
            
            const result = initializeFirebase(mockInitializeApp, mockGetAuth);
            
            expect(result.app).toBe(mockApp);
            expect(result.auth).toBe(mockAuth);
            expect(state.app).toBe(mockApp);
            expect(state.auth).toBe(mockAuth);
        });

        it('should handle initialization errors', () => {
            document.body.innerHTML = '<div id="error"></div>';
            
            const mockInitializeApp = jest.fn().mockImplementation(() => {
                throw new Error('Init failed');
            });
            const mockGetAuth = jest.fn();
            
            const result = initializeFirebase(mockInitializeApp, mockGetAuth);
            
            expect(result.app).toBeNull();
            expect(result.auth).toBeNull();
            expect(document.getElementById('error').textContent).toContain('Init failed');
        });
    });

    // ============================================
    // UI Function Tests
    // ============================================

    describe('showError', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="error" style="display: none;"></div>';
        });

        it('should display error message', () => {
            showError('Test error');
            
            const errorEl = document.getElementById('error');
            expect(errorEl.textContent).toBe('Test error');
            expect(errorEl.style.display).toBe('block');
        });

        it('should handle missing error element', () => {
            document.body.innerHTML = '';
            expect(() => showError('Test')).not.toThrow();
        });
    });

    describe('hideError', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="error" style="display: block;">Error</div>';
        });

        it('should hide error message', () => {
            hideError();
            
            expect(document.getElementById('error').style.display).toBe('none');
        });

        it('should handle missing error element', () => {
            document.body.innerHTML = '';
            expect(() => hideError()).not.toThrow();
        });
    });

    describe('updateButton', () => {
        beforeEach(() => {
            document.body.innerHTML = '<button id="testBtn">Original</button>';
            localThis.button = document.getElementById('testBtn');
        });

        it('should update button text and disabled state', () => {
            updateButton(localThis.button, 'New Text', true);
            
            expect(localThis.button.textContent).toBe('New Text');
            expect(localThis.button.disabled).toBe(true);
        });

        it('should enable button', () => {
            localThis.button.disabled = true;
            updateButton(localThis.button, 'Enabled', false);
            
            expect(localThis.button.disabled).toBe(false);
        });

        it('should handle null button', () => {
            expect(() => updateButton(null, 'Text', true)).not.toThrow();
        });
    });

    describe('showUserInfo', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="userInfo" style="display: none;"></div>';
        });

        it('should display user email', () => {
            showUserInfo('test@example.com');
            
            const userInfo = document.getElementById('userInfo');
            expect(userInfo.textContent).toContain('test@example.com');
            expect(userInfo.style.display).toBe('block');
        });

        it('should handle missing element', () => {
            document.body.innerHTML = '';
            expect(() => showUserInfo('test@example.com')).not.toThrow();
        });
    });

    describe('showStep2', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="step2" style="display: none;"></div>';
        });

        it('should show step 2 element', () => {
            showStep2();
            
            expect(document.getElementById('step2').style.display).toBe('block');
        });

        it('should handle missing element', () => {
            document.body.innerHTML = '';
            expect(() => showStep2()).not.toThrow();
        });
    });

    describe('displayGeneratedKey', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="apiKeyDisplay"></div>
                <div id="curlExample"></div>
                <div id="result" style="display: none;"></div>
            `;
        });

        it('should display the generated key', () => {
            displayGeneratedKey('test-api-key-123');
            
            expect(document.getElementById('apiKeyDisplay').textContent).toBe('test-api-key-123');
            expect(document.getElementById('result').style.display).toBe('block');
            expect(state.generatedKey).toBe('test-api-key-123');
        });

        it('should display curl example', () => {
            displayGeneratedKey('test-key');
            
            const curlExample = document.getElementById('curlExample').textContent;
            expect(curlExample).toContain('curl');
            expect(curlExample).toContain('test-key');
        });

        it('should handle missing elements', () => {
            document.body.innerHTML = '';
            expect(() => displayGeneratedKey('key')).not.toThrow();
        });
    });

    // ============================================
    // Scope Function Tests
    // ============================================

    describe('getScopes', () => {
        it('should return read scope for "read"', () => {
            expect(getScopes('read')).toEqual(['notes:read']);
        });

        it('should return write scope for "write"', () => {
            expect(getScopes('write')).toEqual(['notes:write']);
        });

        it('should return both scopes for "both"', () => {
            expect(getScopes('both')).toEqual(['notes:read', 'notes:write']);
        });

        it('should return both scopes for unknown value', () => {
            expect(getScopes('unknown')).toEqual(['notes:read', 'notes:write']);
        });
    });

    // ============================================
    // Auth Function Tests
    // ============================================

    describe('handleSignIn', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="signInBtn">Sign In</button>
                <div id="userInfo" style="display: none;"></div>
                <div id="step2" style="display: none;"></div>
                <div id="error" style="display: none;"></div>
            `;
            localThis.mockAuth = { name: 'mock-auth' };
            localThis.mockUser = {
                email: 'test@example.com',
                getIdToken: jest.fn().mockResolvedValue('mock-token')
            };
        });

        it('should sign in successfully', async () => {
            const mockSignInWithPopup = jest.fn().mockResolvedValue({
                user: localThis.mockUser
            });
            const MockGoogleAuthProvider = jest.fn();
            
            const result = await handleSignIn({
                auth: localThis.mockAuth,
                signInWithPopup: mockSignInWithPopup,
                GoogleAuthProvider: MockGoogleAuthProvider
            });
            
            expect(result.user).toBe(localThis.mockUser);
            expect(result.token).toBe('mock-token');
            expect(state.currentUser).toBe(localThis.mockUser);
            expect(state.idToken).toBe('mock-token');
            expect(document.getElementById('userInfo').style.display).toBe('block');
            expect(document.getElementById('step2').style.display).toBe('block');
        });

        it('should handle popup blocked error', async () => {
            const error = new Error('Popup blocked');
            error.code = 'auth/popup-blocked';
            
            const mockSignInWithPopup = jest.fn().mockRejectedValue(error);
            const MockGoogleAuthProvider = jest.fn();
            
            const result = await handleSignIn({
                auth: localThis.mockAuth,
                signInWithPopup: mockSignInWithPopup,
                GoogleAuthProvider: MockGoogleAuthProvider
            });
            
            expect(result).toBeNull();
            expect(document.getElementById('error').textContent).toContain('Popup was blocked');
        });

        it('should handle popup closed by user', async () => {
            const error = new Error('Popup closed');
            error.code = 'auth/popup-closed-by-user';
            
            const mockSignInWithPopup = jest.fn().mockRejectedValue(error);
            const MockGoogleAuthProvider = jest.fn();
            
            const result = await handleSignIn({
                auth: localThis.mockAuth,
                signInWithPopup: mockSignInWithPopup,
                GoogleAuthProvider: MockGoogleAuthProvider
            });
            
            expect(result).toBeNull();
            expect(document.getElementById('error').textContent).toContain('cancelled');
        });

        it('should ignore cancelled popup request', async () => {
            const error = new Error('Cancelled');
            error.code = 'auth/cancelled-popup-request';
            
            const mockSignInWithPopup = jest.fn().mockRejectedValue(error);
            const MockGoogleAuthProvider = jest.fn();
            
            const result = await handleSignIn({
                auth: localThis.mockAuth,
                signInWithPopup: mockSignInWithPopup,
                GoogleAuthProvider: MockGoogleAuthProvider
            });
            
            expect(result).toBeNull();
            expect(document.getElementById('error').style.display).toBe('none');
        });

        it('should handle generic auth errors', async () => {
            const error = new Error('Unknown error');
            error.code = 'auth/unknown';
            
            const mockSignInWithPopup = jest.fn().mockRejectedValue(error);
            const MockGoogleAuthProvider = jest.fn();
            
            const result = await handleSignIn({
                auth: localThis.mockAuth,
                signInWithPopup: mockSignInWithPopup,
                GoogleAuthProvider: MockGoogleAuthProvider
            });
            
            expect(result).toBeNull();
            expect(document.getElementById('error').textContent).toContain('Unknown error');
        });

        it('should show error when auth is not available', async () => {
            const result = await handleSignIn({});
            
            expect(result).toBeNull();
            expect(document.getElementById('error').textContent).toContain('not available');
        });

        it('should restore button state on error', async () => {
            const error = new Error('Failed');
            const mockSignInWithPopup = jest.fn().mockRejectedValue(error);
            const MockGoogleAuthProvider = jest.fn();
            
            await handleSignIn({
                auth: localThis.mockAuth,
                signInWithPopup: mockSignInWithPopup,
                GoogleAuthProvider: MockGoogleAuthProvider
            });
            
            const signInBtn = document.getElementById('signInBtn');
            expect(signInBtn.textContent).toBe('Sign In');
            expect(signInBtn.disabled).toBe(false);
        });
    });

    // ============================================
    // API Function Tests
    // ============================================

    describe('handleGenerateKey', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="generateBtn">Generate Key</button>
                <input id="keyName" value="My API Key" />
                <select id="scopes">
                    <option value="both">Both</option>
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                </select>
                <div id="apiKeyDisplay"></div>
                <div id="curlExample"></div>
                <div id="result" style="display: none;"></div>
                <div id="error" style="display: none;"></div>
            `;
        });

        it('should generate key successfully', async () => {
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ key: 'generated-key-123' })
            });
            
            const result = await handleGenerateKey({
                idToken: 'test-token',
                fetchFn: mockFetch
            });
            
            expect(result).toBe('generated-key-123');
            expect(state.generatedKey).toBe('generated-key-123');
            expect(document.getElementById('apiKeyDisplay').textContent).toBe('generated-key-123');
        });

        it('should send correct request', async () => {
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ key: 'key' })
            });
            
            await handleGenerateKey({
                idToken: 'test-token',
                fetchFn: mockFetch
            });
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/keys'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-token',
                        'Content-Type': 'application/json'
                    }),
                    body: expect.stringContaining('My API Key')
                })
            );
        });

        it('should show error when not signed in', async () => {
            const result = await handleGenerateKey({});
            
            expect(result).toBeNull();
            expect(document.getElementById('error').textContent).toContain('sign in');
        });

        it('should handle API error response', async () => {
            const mockFetch = jest.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ message: 'Rate limit exceeded' })
            });
            
            const result = await handleGenerateKey({
                idToken: 'test-token',
                fetchFn: mockFetch
            });
            
            expect(result).toBeNull();
            expect(document.getElementById('error').textContent).toContain('Rate limit exceeded');
        });

        it('should handle network error', async () => {
            const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
            
            const result = await handleGenerateKey({
                idToken: 'test-token',
                fetchFn: mockFetch
            });
            
            expect(result).toBeNull();
            expect(document.getElementById('error').textContent).toContain('Network error');
        });

        it('should restore button state on error', async () => {
            const mockFetch = jest.fn().mockRejectedValue(new Error('Failed'));
            
            await handleGenerateKey({
                idToken: 'test-token',
                fetchFn: mockFetch
            });
            
            const generateBtn = document.getElementById('generateBtn');
            expect(generateBtn.textContent).toBe('Generate Key');
            expect(generateBtn.disabled).toBe(false);
        });

        it('should use correct scopes for read', async () => {
            document.getElementById('scopes').value = 'read';
            
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ key: 'key' })
            });
            
            await handleGenerateKey({
                idToken: 'test-token',
                fetchFn: mockFetch
            });
            
            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(requestBody.scopes).toEqual(['notes:read']);
        });
    });

    describe('handleCopyKey', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="copyBtn">Copy to Clipboard</button>
                <div id="error" style="display: none;"></div>
            `;
            jest.useFakeTimers();
        });

        it('should copy key to clipboard', async () => {
            state.generatedKey = 'test-key-to-copy';
            
            const result = await handleCopyKey();
            
            expect(result).toBe(true);
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-key-to-copy');
        });

        it('should show "Copied!" feedback', async () => {
            state.generatedKey = 'test-key';
            
            await handleCopyKey();
            
            expect(document.getElementById('copyBtn').textContent).toBe('Copied!');
            
            jest.advanceTimersByTime(2000);
            
            expect(document.getElementById('copyBtn').textContent).toBe('Copy to Clipboard');
        });

        it('should return false when no key to copy', async () => {
            state.generatedKey = null;
            
            const result = await handleCopyKey();
            
            expect(result).toBe(false);
            expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
        });

        it('should handle clipboard error', async () => {
            state.generatedKey = 'test-key';
            navigator.clipboard.writeText = jest.fn().mockRejectedValue(new Error('Clipboard error'));
            
            const result = await handleCopyKey();
            
            expect(result).toBe(false);
            expect(document.getElementById('error').textContent).toContain('clipboard');
        });
    });

    // ============================================
    // Setup Tests
    // ============================================

    describe('setupEventListeners', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <button id="signInBtn">Sign In</button>
                <button id="generateBtn">Generate</button>
                <button id="copyBtn">Copy</button>
                <div id="error" style="display: none;"></div>
            `;
        });

        it('should set up sign in button click handler', () => {
            const mockSignInWithPopup = jest.fn().mockResolvedValue({
                user: { email: 'test@example.com', getIdToken: () => 'token' }
            });
            const MockGoogleAuthProvider = jest.fn();
            state.auth = { name: 'auth' };
            
            setupEventListeners({
                signInWithPopup: mockSignInWithPopup,
                GoogleAuthProvider: MockGoogleAuthProvider
            });
            
            document.getElementById('signInBtn').click();
            
            // Note: Can't easily verify async handler was called
            // but we can verify it doesn't throw
        });

        it('should set up generate button click handler', () => {
            setupEventListeners({});
            
            // Should not throw
            document.getElementById('generateBtn').click();
        });

        it('should set up copy button click handler', () => {
            state.generatedKey = 'test-key';
            setupEventListeners({});
            
            document.getElementById('copyBtn').click();
            
            expect(navigator.clipboard.writeText).toHaveBeenCalled();
        });

        it('should handle missing elements', () => {
            document.body.innerHTML = '';
            
            expect(() => setupEventListeners({})).not.toThrow();
        });
    });
});
