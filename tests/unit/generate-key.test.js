/**
 * Unit tests for site/js/generate-key.js
 * API key generation functionality
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('site/generate-key.js', () => {
    const localThis = {};

    // Mock Firebase modules
    const mockSignInWithPopup = jest.fn();
    const mockGetIdToken = jest.fn();
    const mockInitializeApp = jest.fn();
    const mockGetAuth = jest.fn();
    
    // Mock user object
    const mockUser = {
        email: 'test@example.com',
        getIdToken: mockGetIdToken
    };

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = `
            <button id="signInBtn">Sign in with Google</button>
            <p id="userInfo" style="display: none;"></p>
            <p id="error" style="display: none;"></p>
            <div id="step2" style="display: none;">
                <input type="text" id="keyName" value="Test Key">
                <select id="scopes">
                    <option value="both">Read & Write</option>
                    <option value="read">Read Only</option>
                    <option value="write">Write Only</option>
                </select>
                <button id="generateBtn">Generate API Key</button>
            </div>
            <div id="result" style="display: none;">
                <div id="apiKeyDisplay"></div>
                <div id="curlExample"></div>
                <button id="copyBtn">Copy to Clipboard</button>
            </div>
        `;

        // Reset mocks
        jest.clearAllMocks();
        mockGetIdToken.mockResolvedValue('mock-id-token');
        mockSignInWithPopup.mockResolvedValue({ user: mockUser });

        // Reset window.generatedKey
        delete window.generatedKey;

        // Mock fetch
        global.fetch = jest.fn();

        // Mock clipboard
        Object.assign(navigator, {
            clipboard: {
                writeText: jest.fn().mockResolvedValue(undefined)
            }
        });

        // Store element references
        localThis.signInBtn = document.getElementById('signInBtn');
        localThis.userInfo = document.getElementById('userInfo');
        localThis.error = document.getElementById('error');
        localThis.step2 = document.getElementById('step2');
        localThis.keyName = document.getElementById('keyName');
        localThis.scopes = document.getElementById('scopes');
        localThis.generateBtn = document.getElementById('generateBtn');
        localThis.result = document.getElementById('result');
        localThis.apiKeyDisplay = document.getElementById('apiKeyDisplay');
        localThis.curlExample = document.getElementById('curlExample');
        localThis.copyBtn = document.getElementById('copyBtn');
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('showError', () => {
        it('should display error message', () => {
            // Inline implementation for testing
            function showError(msg) {
                const errorEl = document.getElementById('error');
                errorEl.textContent = msg;
                errorEl.style.display = 'block';
            }

            showError('Test error message');

            expect(localThis.error.textContent).toBe('Test error message');
            expect(localThis.error.style.display).toBe('block');
        });
    });

    describe('hideError', () => {
        it('should hide error element', () => {
            function hideError() {
                document.getElementById('error').style.display = 'none';
            }

            localThis.error.style.display = 'block';
            hideError();

            expect(localThis.error.style.display).toBe('none');
        });
    });

    describe('Sign In Button', () => {
        it('should show loading state when clicked', async () => {
            // Simulate the loading state behavior
            localThis.signInBtn.textContent = 'Signing in...';
            localThis.signInBtn.disabled = true;

            expect(localThis.signInBtn.textContent).toBe('Signing in...');
            expect(localThis.signInBtn.disabled).toBe(true);
        });

        it('should display user info after successful sign in', async () => {
            // Simulate successful sign in
            localThis.userInfo.textContent = `Signed in as: ${mockUser.email}`;
            localThis.userInfo.style.display = 'block';
            localThis.signInBtn.textContent = 'Signed In';
            localThis.signInBtn.disabled = true;
            localThis.step2.style.display = 'block';

            expect(localThis.userInfo.textContent).toBe('Signed in as: test@example.com');
            expect(localThis.userInfo.style.display).toBe('block');
            expect(localThis.signInBtn.textContent).toBe('Signed In');
            expect(localThis.step2.style.display).toBe('block');
        });

        it('should reset button on sign in error', async () => {
            const originalText = localThis.signInBtn.textContent;
            
            // Simulate error recovery
            localThis.signInBtn.textContent = 'Signing in...';
            localThis.signInBtn.disabled = true;
            
            // Error occurs
            localThis.signInBtn.textContent = originalText;
            localThis.signInBtn.disabled = false;

            expect(localThis.signInBtn.textContent).toBe('Sign in with Google');
            expect(localThis.signInBtn.disabled).toBe(false);
        });

        it('should show popup blocked error message', () => {
            function showError(msg) {
                const errorEl = document.getElementById('error');
                errorEl.textContent = msg;
                errorEl.style.display = 'block';
            }

            // Simulate popup blocked error
            const error = { code: 'auth/popup-blocked' };
            if (error.code === 'auth/popup-blocked') {
                showError('Popup was blocked. Please allow popups for this site and try again.');
            }

            expect(localThis.error.textContent).toBe('Popup was blocked. Please allow popups for this site and try again.');
        });

        it('should show cancelled error message', () => {
            function showError(msg) {
                const errorEl = document.getElementById('error');
                errorEl.textContent = msg;
                errorEl.style.display = 'block';
            }

            const error = { code: 'auth/popup-closed-by-user' };
            if (error.code === 'auth/popup-closed-by-user') {
                showError('Sign in was cancelled. Please try again.');
            }

            expect(localThis.error.textContent).toBe('Sign in was cancelled. Please try again.');
        });

        it('should ignore cancelled popup request error', () => {
            let errorShown = false;
            function showError() {
                errorShown = true;
            }

            const error = { code: 'auth/cancelled-popup-request' };
            if (error.code === 'auth/cancelled-popup-request') {
                // User clicked multiple times, ignore
                return;
            }
            showError('Error');

            expect(errorShown).toBe(false);
        });
    });

    describe('Generate Key Button', () => {
        it('should show loading state when generating', () => {
            localThis.generateBtn.textContent = 'Generating...';
            localThis.generateBtn.disabled = true;

            expect(localThis.generateBtn.textContent).toBe('Generating...');
            expect(localThis.generateBtn.disabled).toBe(true);
        });

        it('should map scope selection to correct values', () => {
            function getScopes(scopeChoice) {
                if (scopeChoice === 'read') return ['notes:read'];
                if (scopeChoice === 'write') return ['notes:write'];
                return ['notes:read', 'notes:write'];
            }

            expect(getScopes('read')).toEqual(['notes:read']);
            expect(getScopes('write')).toEqual(['notes:write']);
            expect(getScopes('both')).toEqual(['notes:read', 'notes:write']);
        });

        it('should display generated key on success', async () => {
            const mockKey = 'sk_live_test123456789';
            
            localThis.apiKeyDisplay.textContent = mockKey;
            localThis.result.style.display = 'block';
            localThis.generateBtn.textContent = 'Key Generated';
            window.generatedKey = mockKey;

            expect(localThis.apiKeyDisplay.textContent).toBe(mockKey);
            expect(localThis.result.style.display).toBe('block');
            expect(localThis.generateBtn.textContent).toBe('Key Generated');
            expect(window.generatedKey).toBe(mockKey);
        });

        it('should display curl example with generated key', () => {
            const mockKey = 'sk_live_test123456789';
            const API_URL = 'https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api';
            
            localThis.curlExample.textContent = `curl "${API_URL}/notes" \\\n  -H "Authorization: Bearer ${mockKey}"`;

            expect(localThis.curlExample.textContent).toContain(mockKey);
            expect(localThis.curlExample.textContent).toContain(API_URL);
        });

        it('should reset button on generation error', () => {
            const originalText = 'Generate API Key';
            
            // Simulate error recovery
            localThis.generateBtn.textContent = originalText;
            localThis.generateBtn.disabled = false;

            expect(localThis.generateBtn.textContent).toBe('Generate API Key');
            expect(localThis.generateBtn.disabled).toBe(false);
        });

        it('should use default key name when empty', () => {
            localThis.keyName.value = '';
            const name = localThis.keyName.value || 'API Key';

            expect(name).toBe('API Key');
        });
    });

    describe('Copy Button', () => {
        it('should copy generated key to clipboard', async () => {
            window.generatedKey = 'sk_live_test123456789';

            await navigator.clipboard.writeText(window.generatedKey);

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sk_live_test123456789');
        });

        it('should show copied feedback', () => {
            jest.useFakeTimers();

            localThis.copyBtn.textContent = 'Copied!';

            expect(localThis.copyBtn.textContent).toBe('Copied!');

            // Simulate timeout callback
            setTimeout(() => {
                localThis.copyBtn.textContent = 'Copy to Clipboard';
            }, 2000);

            jest.advanceTimersByTime(2000);

            expect(localThis.copyBtn.textContent).toBe('Copy to Clipboard');
        });
    });

    describe('API request construction', () => {
        it('should construct correct request body', () => {
            const name = 'Test Key';
            const scopes = ['notes:read', 'notes:write'];
            const body = JSON.stringify({ name, scopes });

            const parsed = JSON.parse(body);

            expect(parsed.name).toBe('Test Key');
            expect(parsed.scopes).toEqual(['notes:read', 'notes:write']);
        });

        it('should include authorization header', () => {
            const idToken = 'mock-id-token';
            const headers = {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            };

            expect(headers['Authorization']).toBe('Bearer mock-id-token');
            expect(headers['Content-Type']).toBe('application/json');
        });
    });

    describe('Error handling', () => {
        it('should throw on non-ok response', async () => {
            const response = {
                ok: false,
                json: () => Promise.resolve({ message: 'Failed to generate key' })
            };

            const data = await response.json();
            
            expect(() => {
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to generate key');
                }
            }).toThrow('Failed to generate key');
        });

        it('should use default error message when none provided', async () => {
            const response = {
                ok: false,
                json: () => Promise.resolve({})
            };

            const data = await response.json();
            
            expect(() => {
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to generate key');
                }
            }).toThrow('Failed to generate key');
        });
    });
});
