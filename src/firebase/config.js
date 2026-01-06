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

// Firebase configuration - Replace with your project's config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if Firebase is configured
export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
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
