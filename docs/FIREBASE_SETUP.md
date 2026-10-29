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

The extension uses environment variables for sensitive config (recommended for public repos).

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Firebase config values:

   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
   ```

   The OAuth client ID is not read from `.env`. The build sets it from
   `scripts/build.js` (see Step 9).

> **Note:** The `.env` file is gitignored. Only `.env.example` (with placeholder values) should be committed.

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
      // Allow read if user owns the note OR is in sharedWith array (by email)
      allow read: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        request.auth.token.email in resource.data.sharedWith
      );
      
      // Allow create if user is authenticated and sets themselves as owner
      allow create: if request.auth != null && 
        request.resource.data.ownerId == request.auth.uid;
      
      // Allow update if user owns the note OR is in sharedWith array
      allow update: if request.auth != null && (
        resource.data.ownerId == request.auth.uid ||
        request.auth.token.email in resource.data.sharedWith
      );
      
      // Allow delete only for owner
      allow delete: if request.auth != null && 
        resource.data.ownerId == request.auth.uid;
      
      // Comments subcollection
      match /comments/{commentId} {
        // Helper function to check note access
        function hasNoteAccess() {
          let note = get(/databases/$(database)/documents/notes/$(noteId)).data;
          return note.ownerId == request.auth.uid || 
                 request.auth.token.email in note.sharedWith;
        }
        
        // Read: anyone with note access
        allow read: if request.auth != null && hasNoteAccess();
        
        // Create: anyone with note access who sets themselves as author
        allow create: if request.auth != null && 
          hasNoteAccess() &&
          request.resource.data.authorId == request.auth.uid;
        
        // Update: only comment author
        allow update: if request.auth != null && 
          resource.data.authorId == request.auth.uid;
        
        // Delete: comment author OR note owner
        allow delete: if request.auth != null && (
          resource.data.authorId == request.auth.uid ||
          get(/databases/$(database)/documents/notes/$(noteId)).data.ownerId == request.auth.uid
        );
      }
    }
    
    // Mail collection - delivered by the sendMail Cloud Function
    // Only Cloud Functions (Admin SDK) can write to this collection
    // Regular users should not have direct access
    match /mail/{mailId} {
      allow read, write: if false;
    }
  }
}
```

> **Important:** The `sharedWith` array stores **email addresses** (not user IDs), so we use `request.auth.token.email` for the sharing check.
>
> **Note:** The `mail` collection is used by the sendMail Cloud Function for sending share notifications. It is only accessible by Cloud Functions using the Admin SDK.

3. Click **"Publish"**

---

## Step 7: Create Firestore Indexes (IMPORTANT!)

The extension uses compound queries that **require composite indexes**. Without these, notes will save but won't load!

### Option A: Auto-Create via Error Links (Easiest)

1. Complete the setup and try to use the extension
2. Open the service worker console: `chrome://extensions/` → click "service worker"
3. Look for errors like:

   ```text
   FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/...
   ```

4. **Click the link** in the error message
5. Click **"Create"** in Firebase Console
6. Wait 1-2 minutes for status to change from "Building..." to "Enabled"

### Option B: Manual Creation

1. Go to [Firestore → Indexes](https://console.firebase.google.com/project/YOUR_PROJECT/firestore/indexes)
2. Click **"Create index"**
3. Create these indexes:

**Index 1: Owned Notes Query**
| Field | Order |
|-------|-------|
| `ownerId` | Ascending |
| `url` | Ascending |
| `createdAt` | Descending |

**Index 2: Shared Notes Query**
| Field | Order |
|-------|-------|
| `url` | Ascending |
| `sharedWith` | Arrays |
| `createdAt` | Descending |

**Index 3: Comments Query** (for threaded comments)
| Collection | Field | Order |
|------------|-------|-------|
| `notes/{noteId}/comments` | `parentId` | Ascending |
| `notes/{noteId}/comments` | `createdAt` | Ascending |

> **Warning: Field order matters!** The fields must be in the exact order shown above.

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

The ID of an unpacked extension comes from the folder it is loaded from, so load
the extension first:

1. Build it: `npm run build:dev:chrome`
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the `dist/chrome` folder
5. Find "Element-Anchored Sticky Notes"
6. Copy the **ID** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

Keep loading the extension from the same folder. Moving or renaming it, or
loading it on another machine, changes the ID, and the OAuth client has to be
updated to match.

---

## Step 9: Set the OAuth Client ID in the Build

The build sets the OAuth client ID itself, from `OAUTH_CLIENTS` in
`scripts/build.js`. It overwrites `oauth2.client_id` in `public/manifest.json`
and the `VITE_OAUTH_CLIENT_ID` value from `.env` on every build, so editing
those two has no effect.

Open `scripts/build.js` and set the `development` entry for Chrome:

```js
const OAUTH_CLIENTS = {
  chrome: {
    development: '123456789-abc123.apps.googleusercontent.com',
    // production: the Chrome Web Store client, do not change
  },
  // ...
};
```

> **Note:** The OAuth client ID is safe to commit - it's tied to your specific extension ID.

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
   npm run build:dev:chrome
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

### "Permission denied" or "Missing or insufficient permissions" in Firestore

- Verify Firestore security rules are published (Step 6)
- Check that the user is properly authenticated
- Verify the `ownerId` field matches `request.auth.uid`
- For shared notes: ensure rules use `request.auth.token.email` (not `request.auth.uid`) since `sharedWith` stores emails

### Notes not appearing in popup (but visible on page)

This usually means **Firestore indexes are missing**:

1. Notes save to Firestore successfully
2. But the query to load them fails, falling back to local storage
3. Open service worker console: `chrome://extensions/` → "service worker"
4. Look for: `FirebaseError: The query requires an index`
5. **Click the link** in the error to auto-create the index
6. Wait for index status to show "Enabled" (1-2 minutes)

### Notes not appearing after page refresh

- Check browser console for Firestore errors
- Verify indexes are created (check "Indexes" tab in Firestore)
- Click the error link in console to auto-create missing indexes

### "chrome.identity is not defined"

- You're testing in a non-extension context
- Make sure you're running the built extension, not the dev server

---

## Configuration Checklist

| Item | Location | Status |
|------|----------|--------|
| Firebase config | `.env` file | [] |
| OAuth client ID | `scripts/build.js` (`OAUTH_CLIENTS`) | [] |
| Extension ID in Google Cloud | OAuth credentials | [] |
| Extension domain in Firebase Auth | Authorized domains | [] |
| Firestore security rules (notes + comments) | Firebase Console | [] |
| Firestore indexes (3 required) | Firebase Console | [] |

---

## Security Notes

- **Never commit real API keys** to public repositories
- Consider using environment variables for production
- The test mode Firestore rules expire after 30 days - make sure to set up proper security rules
- OAuth consent screen in "Testing" mode limits users - publish for wider access

---

## Next Steps

After completing this setup:

1. [x] Users can sign in with Google
2. [x] Notes are stored in Firestore
3. [x] Notes sync across devices
4. [x] Notes can be shared with other users by email
5. [x] Users can add comments and replies to notes
6. [x] Real-time sync keeps notes and comments updated

To share a note:

1. Click the share button on any note you own
2. Enter the recipient's email address
3. The note will appear for them when they sign in with that email

To add a comment:

1. Click the comments toggle at the bottom of any note
2. Type your comment and press Enter or click Send
3. Click "Reply" to respond to an existing comment

---

## Email Notifications for Shared Notes (Optional)

When you share a note with someone, an email notification is sent automatically. The `onNoteShared` function queues a document in the `mail` collection and the `sendMail` Cloud Function (`functions/lib/mailSender.js`) delivers it over SMTP. This replaces the Firebase Trigger Email extension.

Only documents created after `sendMail` is deployed are processed. If you are migrating from the extension, uninstall it right after deploying, or each share sends two emails.

### Configure the Mail Function

1. Set the SMTP password as a secret (for Gmail, use an [app password](https://myaccount.google.com/apppasswords)):

   ```bash
   firebase functions:secrets:set SMTP_PASSWORD
   ```

   This needs the Secret Manager API and the Blaze plan. The secret is bound to the function at deploy time, which is what lets it read the value.

2. Create `functions/.env.<your-project-id>` (or `functions/.env.<alias>` if you use a `.firebaserc` alias). It is not committed. For this project the ID is `sticky-notes-chrome-extension`:

   ```text
   SMTP_USER=your-email@gmail.com
   MAIL_FROM=your-email@gmail.com
   ```

   With Gmail, `MAIL_FROM` must be the authenticated account or a configured "Send mail as" alias, otherwise Gmail rewrites the From address. If the file is missing, `firebase deploy` prompts for these values, and a non-interactive deploy such as CI fails.

3. Deploy:

   ```bash
   firebase deploy --only functions
   ```

   Merges to `main` that change `functions/` or `firebase.json` also deploy
   automatically. A local deploy can drift from `main`, because the next such
   merge overwrites it. See
   [Firebase Functions Deployment](FUNCTIONS_DEPLOYMENT.md).

The function uses `smtp.gmail.com:465` with implicit TLS. To use another provider, edit `SMTP_HOST`, `SMTP_PORT` and the `secure` flag in `functions/lib/mailSender.js`. Only implicit-TLS endpoints (port 465) work as written.

### How Delivery Works

The function records its progress in the `delivery` field of each `mail` document:

| `delivery.state` | Meaning |
|------------------|---------|
| `PROCESSING` | An invocation is sending the email. A claim older than 3 minutes is treated as abandoned and reclaimed. |
| `RETRY` | A temporary failure (network error or a 4xx SMTP reply). The function retries, up to 5 attempts. |
| `SUCCESS` | The email was accepted by the SMTP server (see `delivery.info`). |
| `ERROR` | A permanent failure or the attempts ran out. See `delivery.error` and `delivery.code`. |

Duplicate trigger deliveries never send twice. If the function dies, or a send times out, after the SMTP server accepted the message but before `SUCCESS` is recorded, the retry can send the same email again.

### Configuration Checklist for Email Notifications

| Item | Location | Status |
|------|----------|--------|
| `SMTP_PASSWORD` secret set | `firebase functions:secrets:set` | [] |
| `SMTP_USER` and `MAIL_FROM` set | `functions/.env.<your-project-id>` | [] |
| `sendMail` function deployed | `firebase deploy --only functions` | [] |
| `mail` collection rules deployed | `firestore.rules` | [] |

### Testing Email Notifications

1. Share a note with a valid email address
2. Check the Firebase Console > Firestore > `mail` collection for queued emails
3. The `sendMail` function processes emails automatically and records the result in the document's `delivery` field
4. Check the recipient's inbox (and spam folder)

### Troubleshooting Email Notifications

**Emails not sending:**

- Check `delivery.state` and `delivery.error` on the document in the `mail` collection
- `SMTP is not configured` means `SMTP_USER`, `SMTP_PASSWORD` or `MAIL_FROM` is unset
- `EAUTH` or `Invalid login` means the app password or `SMTP_USER` is wrong
- Check the `sendMail` logs with `firebase functions:log --only sendMail`

**`sendMail` not running:**

- Confirm the function is deployed in Firebase Console > Functions
- Confirm the `SMTP_PASSWORD` secret has a version (`firebase functions:secrets:get SMTP_PASSWORD`)
- Documents created before the function was deployed are never processed

**Emails going to spam:**

- Use a custom domain instead of gmail.com for sending
- Set up SPF, DKIM, and DMARC records for your domain
- Avoid spam trigger words in email content
