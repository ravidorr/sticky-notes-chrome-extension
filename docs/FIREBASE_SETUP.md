# Firebase Setup Guide for Sticky Notes Extension

This guide walks you through connecting the Sticky Notes Chrome Extension to Firebase for cloud storage and authentication.

---

## Prerequisites

- Google account
- Chrome browser
- The extension loaded in Chrome (unpacked from `dist/` folder)

---

## Overview

You'll need to configure **three services**:

| Service | Purpose | Console |
|---------|---------|---------|
| Firebase Project | Container for all services | Firebase Console |
| Firebase Auth | Google Sign-In | Firebase Console |
| Google Cloud OAuth | Chrome extension identity | Google Cloud Console |
| Cloud Firestore | Note storage | Firebase Console |

---

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** (or "Add project")
3. Enter project name: `sticky-notes-extension` (or your preferred name)
4. Disable Google Analytics (optional, not needed for this project)
5. Click **"Create project"**
6. Wait for project creation, then click **"Continue"**

---

## Step 2: Register a Web App

1. In your Firebase project dashboard, click the **Web icon** (`</>`) to add a web app
2. Enter app nickname: `Sticky Notes Extension`
3. **Do NOT** check "Firebase Hosting"
4. Click **"Register app"**
5. You'll see a code block with `firebaseConfig`. **Copy these values:**

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Click **"Continue to console"**

---

## Step 3: Update Firebase Config in Code

1. Open `src/firebase/config.js`
2. Replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",           // From step 2
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## Step 4: Enable Google Authentication

1. In Firebase Console, go to **Build → Authentication**
2. Click **"Get started"**
3. In the **Sign-in method** tab, click **"Google"**
4. Toggle **Enable** to ON
5. Select a **Support email** (your email)
6. Click **"Save"**

---

## Step 5: Create Cloud Firestore Database

1. In Firebase Console, go to **Build → Firestore Database**
2. Click **"Create database"**
3. Select **"Start in test mode"** (we'll secure it later)
4. Choose a location closest to your users (e.g., `us-central1`)
5. Click **"Enable"**

---

## Step 6: Create Firestore Security Rules

1. In Firestore, click the **"Rules"** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Notes collection
    match /notes/{noteId} {
      // Allow read if user owns the note or it's shared with them
      allow read: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        request.auth.uid in resource.data.sharedWith
      );
      
      // Allow create if user is authenticated
      allow create: if request.auth != null && 
        request.resource.data.ownerId == request.auth.uid;
      
      // Allow update if user owns or has access
      allow update: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        request.auth.uid in resource.data.sharedWith
      );
      
      // Allow delete only for owner
      allow delete: if request.auth != null && 
        resource.data.ownerId == request.auth.uid;
    }
  }
}
```

3. Click **"Publish"**

---

## Step 7: Create Firestore Indexes

The extension uses compound queries that require indexes.

1. In Firestore, click the **"Indexes"** tab
2. Click **"Create index"**
3. Create these indexes:

### Index 1: Owned Notes Query
| Field | Order |
|-------|-------|
| `url` | Ascending |
| `ownerId` | Ascending |
| `createdAt` | Descending |

### Index 2: Shared Notes Query
| Field | Order |
|-------|-------|
| `url` | Ascending |
| `sharedWith` | Arrays |
| `createdAt` | Descending |

> **Tip:** Alternatively, the first time you run the extension with Firebase enabled, you'll see errors in the console with links to auto-create the required indexes.

---

## Step 8: Set Up Google Cloud OAuth (for Chrome Identity)

Chrome extensions use `chrome.identity` API which requires OAuth 2.0 credentials.

### 8.1: Open Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project from the dropdown (same project name)

### 8.2: Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** user type
3. Click **"Create"**
4. Fill in the form:
   - **App name:** Sticky Notes Extension
   - **User support email:** Your email
   - **Developer contact email:** Your email
5. Click **"Save and Continue"**
6. **Scopes:** Click "Add or Remove Scopes"
   - Add: `email`, `profile`, `openid`
   - Click **"Update"** then **"Save and Continue"**
7. **Test users:** Add your email for testing
8. Click **"Save and Continue"**

### 8.3: Create OAuth Client ID

1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials" → "OAuth client ID"**
3. Select **Application type:** Chrome Extension
4. **Name:** Sticky Notes Extension
5. **Item ID:** Your extension ID (see step 8.4)
6. Click **"Create"**
7. **Copy the Client ID** (looks like: `123456789-abc123.apps.googleusercontent.com`)

### 8.4: Find Your Extension ID

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Find "Element-Anchored Sticky Notes"
4. Copy the **ID** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

---

## Step 9: Update OAuth Client ID in Code

### 9.1: Update manifest.json

Open `public/manifest.json` and update the `oauth2` section:

```json
{
  "oauth2": {
    "client_id": "123456789-abc123.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  }
}
```

### 9.2: Update auth.js

Open `src/firebase/auth.js` and update the OAuth client ID:

```javascript
const OAUTH_CLIENT_ID = '123456789-abc123.apps.googleusercontent.com';
```

---

## Step 10: Add Extension to Authorized Domains

1. Go back to Firebase Console → **Authentication → Settings**
2. Click the **"Authorized domains"** tab
3. Click **"Add domain"**
4. Add: `chrome-extension://YOUR_EXTENSION_ID`
   - Example: `chrome-extension://abcdefghijklmnopqrstuvwxyz123456`
5. Click **"Add"**

---

## Step 11: Rebuild and Test

1. Rebuild the extension:
   ```bash
   npm run build
   ```

2. Reload the extension in Chrome:
   - Go to `chrome://extensions/`
   - Click the refresh icon on your extension

3. Test the login:
   - Click the extension icon
   - Click **"Sign in with Google"**
   - Complete the Google sign-in flow

4. Test note creation:
   - Navigate to any website
   - Click the extension icon → "Add Note"
   - Click an element to attach a note
   - Add content and verify it persists after page refresh

---

## Troubleshooting

### "OAuth error: OAuth2 not granted or revoked"
- Ensure the extension ID in Google Cloud matches your actual extension ID
- Make sure you've added yourself as a test user in OAuth consent screen

### "Firebase is not configured" warning
- Check that all values in `src/firebase/config.js` are replaced
- Ensure `apiKey` is not the placeholder `"YOUR_API_KEY"`

### "Permission denied" in Firestore
- Verify Firestore security rules are published
- Check that the user is properly authenticated
- Verify the `ownerId` field matches `request.auth.uid`

### Notes not appearing after page refresh
- Check browser console for Firestore errors
- Verify indexes are created (check "Indexes" tab in Firestore)
- Click the error link in console to auto-create missing indexes

### "chrome.identity is not defined"
- You're testing in a non-extension context
- Make sure you're running the built extension, not the dev server

---

## Configuration Checklist

| Item | File | Status |
|------|------|--------|
| Firebase config | `src/firebase/config.js` | ⬜ |
| OAuth client ID | `src/firebase/auth.js` | ⬜ |
| OAuth client ID | `public/manifest.json` | ⬜ |
| Extension ID in Google Cloud | OAuth credentials | ⬜ |
| Extension domain in Firebase Auth | Authorized domains | ⬜ |
| Firestore security rules | Firebase Console | ⬜ |
| Firestore indexes | Firebase Console | ⬜ |

---

## Security Notes

- **Never commit real API keys** to public repositories
- Consider using environment variables for production
- The test mode Firestore rules expire after 30 days — make sure to set up proper security rules
- OAuth consent screen in "Testing" mode limits users — publish for wider access

---

## Next Steps

After completing this setup:

1. ✅ Users can sign in with Google
2. ✅ Notes are stored in Firestore
3. ✅ Notes sync across devices
4. ✅ Notes can be shared with other users

For sharing features, implement the UI to:
- Look up users by email
- Call `shareNote()` with the target user ID
