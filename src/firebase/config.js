/**
 * Firebase Configuration
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project (or use existing)
 * 3. Enable Authentication > Google Sign-In provider
 * 4. Enable Cloud Firestore database
 * 5. Copy your project's Firebase config and replace the values below
 * 6. Add your extension ID to the authorized domains in Firebase Console:
 *    - Go to Authentication > Settings > Authorized domains
 *    - Add: chrome-extension://<YOUR_EXTENSION_ID>
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Firebase configuration - loaded from environment variables
// See .env.example for setup instructions
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if Firebase is configured
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('your_');
}

// Initialize Firebase
let app = null;
let auth = null;
let db = null;

export function initializeFirebase() {
  if (!isFirebaseConfigured()) {
    console.warn('Firebase is not configured. Please update src/firebase/config.js with your Firebase project credentials.');
    return { app: null, auth: null, db: null };
  }
  
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Enable offline persistence
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: Multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not available in this browser');
      }
    });
  }
  
  return { app, auth, db };
}

export { auth, db };
