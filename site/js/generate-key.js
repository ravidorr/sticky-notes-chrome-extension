/**
 * Generate API Key Page
 * Allows users to sign in with Google and generate API keys
 */

import { API_BASE_URL, FIREBASE_CONFIG } from './config.js';

// ============================================
// State
// ============================================

const state = {
    app: null,
    auth: null,
    currentUser: null,
    idToken: null,
    generatedKey: null
};

// ============================================
// Firebase Initialization
// ============================================

/**
 * Initialize Firebase with the provided modules
 * @param {Function} initializeApp - Firebase initializeApp function
 * @param {Function} getAuth - Firebase getAuth function
 * @returns {Object} Object containing app and auth instances
 */
function initializeFirebase(initializeApp, getAuth) {
    try {
        const app = initializeApp(FIREBASE_CONFIG);
        const auth = getAuth(app);
        state.app = app;
        state.auth = auth;
        return { app, auth };
    } catch (error) {
        showError('Firebase initialization failed: ' + error.message);
        return { app: null, auth: null };
    }
}

// ============================================
// UI Functions
// ============================================

/**
 * Show an error message
 * @param {string} msg - Error message to display
 */
function showError(msg) {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
}

/**
 * Hide the error message
 */
function hideError() {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

/**
 * Update button state
 * @param {HTMLButtonElement} button - The button element
 * @param {string} text - Button text
 * @param {boolean} disabled - Whether button is disabled
 */
function updateButton(button, text, disabled) {
    if (button) {
        button.textContent = text;
        button.disabled = disabled;
    }
}

/**
 * Show user info after sign in
 * @param {string} email - User's email
 */
function showUserInfo(email) {
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.textContent = `Signed in as: ${email}`;
        userInfo.style.display = 'block';
    }
}

/**
 * Show step 2 (key generation)
 */
function showStep2() {
    const step2 = document.getElementById('step2');
    if (step2) {
        step2.style.display = 'block';
    }
}

/**
 * Display the generated API key
 * @param {string} key - The generated API key
 */
function displayGeneratedKey(key) {
    const apiKeyDisplay = document.getElementById('apiKeyDisplay');
    const curlExample = document.getElementById('curlExample');
    const result = document.getElementById('result');
    
    if (apiKeyDisplay) {
        apiKeyDisplay.textContent = key;
    }
    
    if (curlExample) {
        curlExample.textContent = 
            `curl "${API_BASE_URL}/notes" \\\n  -H "Authorization: Bearer ${key}"`;
    }
    
    if (result) {
        result.style.display = 'block';
    }
    
    state.generatedKey = key;
}

// ============================================
// Scope Functions
// ============================================

/**
 * Get scopes array from scope choice
 * @param {string} scopeChoice - The selected scope choice
 * @returns {string[]} Array of scope strings
 */
function getScopes(scopeChoice) {
    if (scopeChoice === 'read') return ['notes:read'];
    if (scopeChoice === 'write') return ['notes:write'];
    return ['notes:read', 'notes:write'];
}

// ============================================
// Auth Functions
// ============================================

/**
 * Handle sign in with Google
 * @param {Object} options - Sign in options
 * @returns {Promise<Object|null>} User object or null on failure
 */
async function handleSignIn(options = {}) {
    const { 
        signInWithPopup, 
        GoogleAuthProvider, 
        auth = state.auth 
    } = options;
    
    if (!auth || !signInWithPopup || !GoogleAuthProvider) {
        showError('Sign in is not available');
        return null;
    }
    
    const signInBtn = document.getElementById('signInBtn');
    const originalText = signInBtn?.textContent || 'Sign In';
    
    hideError();
    updateButton(signInBtn, 'Signing in...', true);
    
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const token = await user.getIdToken();
        
        state.currentUser = user;
        state.idToken = token;
        
        showUserInfo(user.email);
        updateButton(signInBtn, 'Signed In', true);
        showStep2();
        
        return { user, token };
    } catch (error) {
        updateButton(signInBtn, originalText, false);
        
        // Handle specific error cases
        if (error.code === 'auth/popup-blocked') {
            showError('Popup was blocked. Please allow popups for this site and try again.');
        } else if (error.code === 'auth/popup-closed-by-user') {
            showError('Sign in was cancelled. Please try again.');
        } else if (error.code === 'auth/cancelled-popup-request') {
            // User clicked multiple times, ignore
            return null;
        } else {
            showError('Sign in failed: ' + error.message);
        }
        
        return null;
    }
}

// ============================================
// API Functions
// ============================================

/**
 * Generate an API key
 * @param {Object} options - Generation options
 * @returns {Promise<string|null>} Generated key or null on failure
 */
async function handleGenerateKey(options = {}) {
    const { 
        idToken = state.idToken,
        fetchFn = fetch 
    } = options;
    
    if (!idToken) {
        showError('Please sign in first');
        return null;
    }
    
    const generateBtn = document.getElementById('generateBtn');
    const keyNameInput = document.getElementById('keyName');
    const scopesSelect = document.getElementById('scopes');
    
    const originalText = generateBtn?.textContent || 'Generate Key';
    const name = keyNameInput?.value || 'API Key';
    const scopeChoice = scopesSelect?.value || 'both';
    const scopes = getScopes(scopeChoice);
    
    hideError();
    updateButton(generateBtn, 'Generating...', true);
    
    try {
        const response = await fetchFn(`${API_BASE_URL}/keys`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, scopes })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to generate key');
        }

        displayGeneratedKey(data.key);
        updateButton(generateBtn, 'Key Generated', true);
        
        return data.key;
    } catch (error) {
        updateButton(generateBtn, originalText, false);
        showError('Failed to generate key: ' + error.message);
        return null;
    }
}

/**
 * Copy the generated key to clipboard
 * @returns {Promise<boolean>} Whether copy was successful
 */
async function handleCopyKey() {
    if (!state.generatedKey) {
        return false;
    }
    
    try {
        await navigator.clipboard.writeText(state.generatedKey);
        
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
        
        return true;
    } catch (error) {
        showError('Failed to copy to clipboard');
        return false;
    }
}

// ============================================
// Event Setup
// ============================================

/**
 * Set up event listeners
 * @param {Object} firebaseModules - Firebase modules
 */
function setupEventListeners(firebaseModules = {}) {
    const { signInWithPopup, GoogleAuthProvider } = firebaseModules;
    
    const signInBtn = document.getElementById('signInBtn');
    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            handleSignIn({ signInWithPopup, GoogleAuthProvider });
        });
    }
    
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            handleGenerateKey({});
        });
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', handleCopyKey);
    }
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the page
 * @param {Object} firebaseModules - Firebase modules
 */
async function init(firebaseModules = {}) {
    const { initializeApp, getAuth, signInWithPopup, GoogleAuthProvider } = firebaseModules;
    
    if (initializeApp && getAuth) {
        initializeFirebase(initializeApp, getAuth);
    }
    
    setupEventListeners({ signInWithPopup, GoogleAuthProvider });
}

// ============================================
// Auto-initialize (for browser with dynamic import)
// ============================================

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    // Dynamic import Firebase modules
    Promise.all([
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
    ]).then(([appModule, authModule]) => {
        init({
            initializeApp: appModule.initializeApp,
            getAuth: authModule.getAuth,
            signInWithPopup: authModule.signInWithPopup,
            GoogleAuthProvider: authModule.GoogleAuthProvider
        });
    }).catch(error => {
        console.error('Failed to load Firebase:', error);
        showError('Failed to load authentication service');
    });
}

// ============================================
// Exports (for testing)
// ============================================

export {
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
    setupEventListeners,
    init
};
