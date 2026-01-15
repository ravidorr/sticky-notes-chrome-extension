/**
 * Shared configuration for Sticky Notes site
 * 
 * This file contains constants shared across dashboard.js and generate-key.js
 * to avoid duplication and ensure consistency.
 */

export const API_BASE_URL = 'https://us-central1-sticky-notes-chrome-extension.cloudfunctions.net/api';

/**
 * Firebase configuration
 * 
 * Note: Firebase API keys are designed to be public. Security is enforced via:
 * - Firebase Security Rules (see firestore.rules)
 * - Authentication requirements
 * - Domain restrictions in Firebase Console
 * 
 * These keys identify the project but do not grant access to data.
 */
export const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCqdVVAamQ9yrUkbCWRtPPtevdOK0_PrRM',
    authDomain: 'sticky-notes-chrome-extension.firebaseapp.com',
    projectId: 'sticky-notes-chrome-extension',
    storageBucket: 'sticky-notes-chrome-extension.firebasestorage.app',
    messagingSenderId: '413613230006',
    appId: '1:413613230006:web:1bb39d70bd4976e95ae317'
};
