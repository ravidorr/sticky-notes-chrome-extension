# Element-Anchored Sticky Notes Chrome Extension

[![CI](https://github.com/ravidorr/sticky-notes-chrome-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidorr/sticky-notes-chrome-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ravidorr/sticky-notes-chrome-extension/pulls)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/ravidorr/sticky-notes-chrome-extension/graphs/commit-activity)

A Chrome extension that allows users to annotate the web by attaching persistent sticky notes to specific UI elements on any website.

## Features

### Core Features (Phase 1 - MVP)

- **Element Selection Mode**: Click the "Add Note" button, then click any element on the page to anchor a note
- **Page-Level Notes**: Create notes attached to the page itself (not a specific element) via "Page Note" button or context menu
- **Right-Click Context Menu**: Right-click any element and select "Create Sticky Note Here" for quick note creation, or "Create Page Note" for page-level notes
- **Iframe Support**: Attach notes to elements inside iframes (including cross-origin iframes like Figma, embedded apps)
- **Smart CSS Selector Generation**: Automatically generates robust selectors using semantic attributes
- **Visibility Intelligence**: Notes only appear when their anchor element is in view (IntersectionObserver); page-level notes are always visible
- **Show/Hide All Notes**: Toggle visibility of all notes on a page from the popup menu
- **Local Persistence**: Notes are saved to Chrome's local storage with auto-save
- **Shadow DOM Isolation**: Notes render in isolation to avoid style conflicts

### Cloud Features (Phase 2)

- **Firebase Integration**: Sync notes to the cloud
- **Google Authentication**: Sign in with Google to access your notes anywhere
- **Offline Support**: Works offline with Firestore persistence
- **Automatic Migration**: Notes created before login are automatically migrated to your account

### Collaboration Features (Phase 3)

- **Note Sharing**: Share notes with other users by email
- **Email Notifications**: Recipients receive an email when a note is shared with them
- **Real-time Updates**: See changes immediately when collaborators edit shared notes
- **Unread Badge**: Extension icon shows count of new shared notes you haven't viewed yet
- **Shared Notes View**: View all unread shared notes in the popup's "Shared" tab, click to open in new tab

### Advanced Features (Phase 4)

- **Fuzzy Matching**: Finds elements even when selectors change
- **Re-anchoring UI**: Easily re-attach notes when elements move
- **Rich Text Editor**: Format notes with bold, italic, lists, and links
- **Color Themes**: Choose from yellow, blue, green, or pink themes
- **Position Controls**: Snap notes to top-left, top-right, bottom-left, or bottom-right
- **Settings Page**: Configure default theme, position, note width, and font size for new notes
- **Internationalization**: Supports English, French, German, and Hebrew (auto-detects browser language)
- **Dashboard**: View and manage all your notes in one place (access via popup, context menu, or `Alt+Shift+D`)
- **Keyboard Shortcuts**:
  - `Alt+Shift+D` - Open the dashboard
  - `Ctrl+Shift+H` - Toggle all notes visibility (hide/show all notes on page)
  - `Ctrl+H` / `Cmd+H` - Toggle focused note visibility (when a note has focus)

## Project Structure

```text
sticky-notes-chrome-extension/
├── src/
│   ├── popup/              # Extension popup UI
│   ├── options/            # Settings/preferences page
│   ├── content/            # Content script (DOM injection)
│   │   ├── app/            # Application modules
│   │   │   ├── StickyNotesApp.js   # Main orchestration class
│   │   │   ├── NoteManager.js      # Note CRUD and comments
│   │   │   ├── RealtimeSync.js     # Real-time subscriptions
│   │   │   ├── MessageHandler.js   # Message routing
│   │   │   ├── UIManager.js        # UI state and selection mode
│   │   │   └── styles.js           # Shadow DOM styles
│   │   ├── components/     # UI components (StickyNote, RichEditor, etc.)
│   │   ├── selectors/      # CSS selector generation (SelectorEngine)
│   │   └── observers/      # Visibility management (VisibilityManager)
│   ├── background/         # Service worker
│   ├── firebase/           # Firebase services (auth, notes, comments)
│   └── shared/             # Shared utilities (i18n, logger, utils)
├── public/
│   ├── manifest.json       # Chrome Extension Manifest V3
│   └── _locales/           # Internationalization
│       ├── en/             # English (default)
│       ├── fr/             # French
│       ├── de/             # German
│       └── he/             # Hebrew
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

# Build the extension
npm run build
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/chrome` folder

### Development Commands

```bash
# Build with watch mode
npm run dev

# Run linting
npm run lint

# Run linting with auto-fix
npm run lint:fix

# Run unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with coverage
npm test -- --coverage

# Run E2E tests
npm run test:e2e
```

#### Code Coverage Thresholds

The project enforces minimum coverage thresholds (configured in `jest.config.js`):

| Metric | Minimum |
|--------|---------|
| Statements | 85% |
| Branches | 75% |
| Functions | 75% |
| Lines | 85% |

### Pre-commit Hooks

This project uses Husky and lint-staged to ensure code quality before commits:

- **Lint**: ESLint runs on staged files and auto-fixes issues
- **Tests**: All unit tests must pass

To skip hooks (not recommended):

```bash
git commit --no-verify -m "your message"
```

## Firebase Setup (Optional)

To enable cloud sync and sharing features, see [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) for detailed instructions.

Quick overview:

1. Create a Firebase project at <https://console.firebase.google.com/>
2. Enable Authentication > Google Sign-In provider
3. Enable Cloud Firestore
4. Copy your Firebase config to `.env` file (see `.env.example`)
5. Add your extension ID to authorized domains in Firebase Console
6. Create required Firestore indexes (see setup guide)

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      // Allow read if user owns the note OR is in sharedWith array (by email)
      allow read: if request.auth != null && 
        (resource.data.ownerId == request.auth.uid || 
         request.auth.token.email in resource.data.sharedWith);
      
      // Allow create if authenticated and sets themselves as owner
      allow create: if request.auth != null && 
        request.resource.data.ownerId == request.auth.uid;
      
      // Allow update if owner or shared with (by email)
      allow update: if request.auth != null && 
        (resource.data.ownerId == request.auth.uid || 
         request.auth.token.email in resource.data.sharedWith);
      
      // Allow delete only for owner
      allow delete: if request.auth != null && 
        resource.data.ownerId == request.auth.uid;
    }
  }
}
```

> **Note:** The `sharedWith` array stores email addresses, so we use `request.auth.token.email` for sharing checks.

## Internationalization (i18n)

The extension automatically detects and uses your browser's language. Currently supported languages:

| Language | Code | Status |
|----------|------|--------|
| English | en | Default |
| French | fr | Complete |
| German | de | Complete |
| Hebrew | he | Complete |

### Testing Different Languages

1. **Chrome**: Settings > Languages > Add your preferred language and move it to the top
2. **Reload the extension** after changing language settings

### Adding New Languages

1. Create a new folder: `public/_locales/{lang_code}/`
2. Copy `messages.json` from the `en` folder
3. Translate all message values (keep keys the same)
4. Rebuild: `npm run build`

See `.cursor/rules/i18n.mdc` for detailed i18n guidelines.

## Usage

1. **Adding a Note**: Click the extension icon, then click "Add Note". Your cursor will change to a crosshair. Click on any element to attach a note. Alternatively, click "Page Note" to create a note attached to the page itself (not a specific element).

2. **Editing Notes**: Click on a note to edit. The note auto-saves after you stop typing.

3. **Formatting**: Use the toolbar to add bold, italic, lists, or links.

4. **Changing Theme**: Click the color button to change the note's color theme.

5. **Repositioning**: Click the position button to snap the note to a different corner, or drag the header to position freely.

6. **Minimizing Notes**: Notes start minimized by default to reduce visual clutter. Click the up arrow to expand a note, or the down arrow to minimize it again.

7. **Show/Hide All Notes**: Open the popup, click the actions menu (three dots), and select "Hide all notes" to temporarily hide all notes on the page. Click "Show all notes" to bring them back.

8. **Sharing**: Click the share button and enter a collaborator's email address.

9. **Deleting**: Click the trash icon to delete a note.

## Tech Stack

- **Build Tool**: Vite
- **Styling**: Vanilla CSS (Shadow DOM isolated)
- **Backend**: Firebase (Firestore, Authentication)
- **Testing**: Jest (unit), Playwright (E2E)
- **Linting**: ESLint with pre-commit hooks (Husky + lint-staged)
- **Extension**: Chrome Manifest V3

## Browser Compatibility

- Chrome 88+ (Manifest V3 support)
- Edge 88+ (Chromium-based)

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the development roadmap including:

- Threaded discussions
- Dev/QA power features (metadata capture, Jira integration)
- Team & billing features

## License

MIT License - see [LICENSE](LICENSE) for details.
