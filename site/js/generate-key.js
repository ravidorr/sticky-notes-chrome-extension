import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyCqdVVAamQ9yrUkbCWRtPPtevdOK0_PrRM',
    authDomain: 'sticky-notes-chrome-extension.firebaseapp.com',
    projectId: 'sticky-notes-chrome-extension',
    storageBucket: 'sticky-notes-chrome-extension.firebasestorage.app',
    messagingSenderId: '413613230006',
    appId: '1:413613230006:web:1bb39d70bd4976e95ae317'
};

const API_URL = 'https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api';

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
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        currentUser = result.user;
        idToken = await currentUser.getIdToken();
        
        document.getElementById('userInfo').textContent = `Signed in as: ${currentUser.email}`;
        document.getElementById('userInfo').style.display = 'block';
        document.getElementById('signInBtn').textContent = 'Signed In';
        document.getElementById('signInBtn').disabled = true;
        document.getElementById('step2').style.display = 'block';
    } catch (error) {
        showError('Sign in failed: ' + error.message);
    }
});

document.getElementById('generateBtn').addEventListener('click', async () => {
    hideError();
    const name = document.getElementById('keyName').value || 'API Key';
    const scopeChoice = document.getElementById('scopes').value;
    
    let scopes;
    if (scopeChoice === 'read') scopes = ['notes:read'];
    else if (scopeChoice === 'write') scopes = ['notes:write'];
    else scopes = ['notes:read', 'notes:write'];

    try {
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
        
        window.generatedKey = data.key;
    } catch (error) {
        showError('Failed to generate key: ' + error.message);
    }
});

document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.generatedKey);
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy to Clipboard', 2000);
});
