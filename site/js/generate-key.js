import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { API_BASE_URL, FIREBASE_CONFIG } from './config.js';

const firebaseConfig = FIREBASE_CONFIG;
const API_URL = API_BASE_URL;

let app, auth, currentUser, idToken;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
} catch (error) {
    showError('Firebase initialization failed: ' + error.message);
}

function showError(msg) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}

document.getElementById('signInBtn').addEventListener('click', async () => {
    hideError();
    const signInBtn = document.getElementById('signInBtn');
    const originalText = signInBtn.textContent;
    
    try {
        signInBtn.textContent = 'Signing in...';
        signInBtn.disabled = true;
        
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        currentUser = result.user;
        idToken = await currentUser.getIdToken();
        
        document.getElementById('userInfo').textContent = `Signed in as: ${currentUser.email}`;
        document.getElementById('userInfo').style.display = 'block';
        signInBtn.textContent = 'Signed In';
        document.getElementById('step2').style.display = 'block';
    } catch (error) {
        signInBtn.textContent = originalText;
        signInBtn.disabled = false;
        
        // Handle specific error cases
        if (error.code === 'auth/popup-blocked') {
            showError('Popup was blocked. Please allow popups for this site and try again.');
        } else if (error.code === 'auth/popup-closed-by-user') {
            showError('Sign in was cancelled. Please try again.');
        } else if (error.code === 'auth/cancelled-popup-request') {
            // User clicked multiple times, ignore
            return;
        } else {
            showError('Sign in failed: ' + error.message);
        }
    }
});

document.getElementById('generateBtn').addEventListener('click', async () => {
    hideError();
    const generateBtn = document.getElementById('generateBtn');
    const originalText = generateBtn.textContent;
    const name = document.getElementById('keyName').value || 'API Key';
    const scopeChoice = document.getElementById('scopes').value;
    
    let scopes;
    if (scopeChoice === 'read') scopes = ['notes:read'];
    else if (scopeChoice === 'write') scopes = ['notes:write'];
    else scopes = ['notes:read', 'notes:write'];

    try {
        generateBtn.textContent = 'Generating...';
        generateBtn.disabled = true;
        
        const response = await fetch(`${API_URL}/keys`, {
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

        document.getElementById('apiKeyDisplay').textContent = data.key;
        document.getElementById('curlExample').textContent = 
            `curl "${API_URL}/notes" \\\n  -H "Authorization: Bearer ${data.key}"`;
        document.getElementById('result').style.display = 'block';
        
        generateBtn.textContent = 'Key Generated';
        // Keep button disabled after successful generation
        
        window.generatedKey = data.key;
    } catch (error) {
        generateBtn.textContent = originalText;
        generateBtn.disabled = false;
        showError('Failed to generate key: ' + error.message);
    }
});

document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.generatedKey);
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy to Clipboard', 2000);
});
