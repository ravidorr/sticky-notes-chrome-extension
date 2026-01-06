# Element-Anchored Sticky Notes Chrome Extension

A Chrome extension that allows users to annotate the web by attaching persistent sticky notes to specific UI elements on any website.

## Features

### Core Features (Phase 1 - MVP)
- **Element Selection Mode**: Click the "Add Note" button, then click any element on the page to anchor a note
- **Smart CSS Selector Generation**: Automatically generates robust selectors using semantic attributes
- **Visibility Intelligence**: Notes only appear when their anchor element is in view (IntersectionObserver)
- **Local Persistence**: Notes are saved to Chrome's local storage with auto-save
- **Shadow DOM Isolation**: Notes render in isolation to avoid style conflicts

### Cloud Features (Phase 2)
- **Firebase Integration**: Sync notes to the cloud
- **Google Authentication**: Sign in with Google to access your notes anywhere
- **Offline Support**: Works offline with Firestore persistence

### Collaboration Features (Phase 3)
- **Note Sharing**: Share notes with other users by email
- **Real-time Updates**: See changes immediately when collaborators edit shared notes

### Advanced Features (Phase 4)
- **Fuzzy Matching**: Finds elements even when selectors change
- **Re-anchoring UI**: Easily re-attach notes when elements move
- **Rich Text Editor**: Format notes with bold, italic, lists, and links
- **Color Themes**: Choose from yellow, blue, green, or pink themes
- **Position Controls**: Snap notes to top-left, top-right, bottom-left, or bottom-right

## Project Structure

```
sticky-notes-chrome-extension/
├── src/
│   ├── popup/              # Extension popup UI
│   ├── content/            # Content script (DOM injection)
│   │   ├── components/     # UI components (StickyNote, RichEditor, SelectionOverlay)
│   │   ├── selectors/      # CSS selector generation (SelectorEngine)
│   │   └── observers/      # Visibility management (VisibilityManager)
│   ├── background/         # Service worker
│   ├── shared/             # Shared utilities
│   └── firebase/           # Firebase services (auth, notes)
├── public/
│   └── manifest.json       # Chrome Extension Manifest V3
├── tests/
│   ├── unit/               # Jest unit tests
│   └── e2e/                # Playwright E2E tests
└── dist/                   # Built extension (generated)
```

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Generate icon files
npm run generate:icons

# Build the extension
npm run build
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder

### Development Commands

```bash
# Build with watch mode
npm run dev

# Run unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e
```

## Firebase Setup (Optional)

To enable cloud sync and sharing features:

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Authentication > Google Sign-In provider
3. Enable Cloud Firestore
4. Copy your Firebase config to `src/firebase/config.js`
5. Add your extension ID to authorized domains in Firebase Console

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      // Allow read if user owns the note or is in sharedWith
      allow read: if request.auth != null && 
        (resource.data.ownerId == request.auth.uid || 
         request.auth.uid in resource.data.sharedWith);
      
      // Allow create if authenticated
      allow create: if request.auth != null && 
        request.resource.data.ownerId == request.auth.uid;
      
      // Allow update if owner or shared with
      allow update: if request.auth != null && 
        (resource.data.ownerId == request.auth.uid || 
         request.auth.uid in resource.data.sharedWith);
      
      // Allow delete only for owner
      allow delete: if request.auth != null && 
        resource.data.ownerId == request.auth.uid;
    }
  }
}
```

## Usage

1. **Adding a Note**: Click the extension icon, then click "Add Note". Your cursor will change to a crosshair. Click on any element to attach a note.

2. **Editing Notes**: Click on a note to edit. The note auto-saves after you stop typing.

3. **Formatting**: Use the toolbar to add bold, italic, lists, or links.

4. **Changing Theme**: Click the color button to change the note's color theme.

5. **Repositioning**: Click the position button to snap the note to a different corner, or drag the header to position freely.

6. **Sharing**: Click the share button and enter a collaborator's email address.

7. **Deleting**: Click the trash icon to delete a note.

## Tech Stack

- **Build Tool**: Vite
- **Styling**: Vanilla CSS (Shadow DOM isolated)
- **Backend**: Firebase (Firestore, Authentication)
- **Testing**: Jest (unit), Playwright (E2E)
- **Extension**: Chrome Manifest V3

## Browser Compatibility

- Chrome 88+ (Manifest V3 support)
- Edge 88+ (Chromium-based)

## License

MIT License - see [LICENSE](LICENSE) for details.
