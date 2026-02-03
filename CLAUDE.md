# CLAUDE.md - AI Assistant Guidelines

This document provides guidance for AI assistants working with the Sticky Notes Chrome Extension codebase.

## Project Overview

**Sticky Notes** is a Chrome extension that allows users to attach persistent sticky notes to specific UI elements on any website. Notes are anchored to DOM elements using CSS selectors and support cloud sync via Firebase.

**Tech Stack:**
- Chrome Extension (Manifest V3)
- Vanilla JavaScript (ES modules)
- Firebase (Firestore, Authentication)
- Vite (build tool)
- Jest (unit tests) + Playwright (E2E tests)

## Quick Reference

```bash
# Development
npm install              # Install dependencies
npm run build:dev        # Development build (both Chrome and Edge)
npm run build            # Production build (Chrome + Edge)
npm run dev              # Build + watch mode

# Testing
npm test                 # Run unit tests
npm run test:watch       # Unit tests in watch mode
npm run test:coverage    # Unit tests with coverage
npm run test:e2e         # Playwright E2E tests

# Linting
npm run lint             # Run all linters
npm run lint:fix         # Auto-fix lint issues
npm run lint:js          # ESLint only
npm run lint:css         # Stylelint only
npm run lint:html        # HTMLHint only
npm run lint:md          # Markdownlint only
```

## Codebase Structure

```
src/
├── background/           # Service worker (ES module with code splitting)
│   ├── index.js          # Entry point, sets up listeners
│   ├── handlers.js       # Message handlers for all actions
│   └── navigation.js     # URL change detection for SPAs
├── content/              # Content script (IIFE bundle)
│   ├── index.js          # Entry point
│   ├── app/              # Core application modules
│   │   ├── StickyNotesApp.js    # Main orchestration class
│   │   ├── NoteManager.js       # Note CRUD operations
│   │   ├── RealtimeSync.js      # Firebase real-time subscriptions
│   │   ├── MessageHandler.js    # Chrome message routing
│   │   ├── UIManager.js         # Selection mode, shadow DOM
│   │   └── SyncLogic.js         # Sync helpers
│   ├── components/       # UI components
│   │   ├── StickyNote.js        # Note component (shadow DOM)
│   │   ├── RichEditor.js        # Rich text editor
│   │   ├── CommentSection.js    # Threaded comments
│   │   └── ConfirmDialog.js     # Modal dialogs
│   ├── selectors/        # CSS selector generation
│   │   └── SelectorEngine.js    # Robust selector builder
│   └── observers/        # DOM observation
│       ├── VisibilityManager.js # IntersectionObserver wrapper
│       └── ConsoleCapture.js    # Console error capture
├── popup/                # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/              # Settings page
│   ├── options.html
│   ├── options.css
│   └── options.js
├── firebase/             # Firebase integration (lazy-loaded)
│   ├── lazy.js           # Lazy loading boundary
│   ├── config.js         # Firebase initialization
│   ├── auth.js           # Authentication (Google Sign-In)
│   ├── notes.js          # Firestore CRUD for notes
│   └── comments.js       # Firestore CRUD for comments
└── shared/               # Shared utilities
    ├── i18n.js           # Internationalization helpers
    ├── logger.js         # Structured logging
    ├── utils.js          # Common utilities
    └── preferences.js    # User preferences

public/
├── manifest.json         # Chrome manifest
├── manifest.edge.json    # Edge manifest (different OAuth)
├── _locales/             # i18n translations
│   ├── en/messages.json  # English (default)
│   ├── fr/messages.json  # French
│   ├── de/messages.json  # German
│   └── he/messages.json  # Hebrew

tests/
├── setup.js              # Jest global mocks (Chrome APIs)
├── unit/                 # Unit tests (*.test.js)
└── e2e/                  # Playwright E2E tests (*.spec.js)

functions/                # Firebase Cloud Functions
scripts/                  # Build and utility scripts
site/                     # Marketing website
```

## Key Architectural Patterns

### 1. Shadow DOM Isolation
All sticky notes render inside Shadow DOM to prevent style conflicts with host pages:
```javascript
const shadow = element.attachShadow({ mode: 'open' });
```

### 2. Firebase Lazy Loading
Firebase SDK is lazy-loaded to improve cold start performance. Always use the lazy wrappers from `src/firebase/lazy.js`:
```javascript
// Good - uses lazy loading
import { createNoteLazy } from '../firebase/lazy.js';

// Avoid - eagerly loads Firebase
import { createNote } from '../firebase/notes.js';
```

### 3. Message Passing Architecture
Content scripts communicate with the background service worker via Chrome messaging:
```javascript
// Content script sends
chrome.runtime.sendMessage({ action: 'createNote', data: {...} });

// Background handles in handlers.js
case 'createNote':
  return handleCreateNote(message.data, sender);
```

### 4. Composite URLs for Iframes
Notes in iframes use composite URLs to associate with the parent page:
```javascript
// Format: "tabUrl|frameUrl" for iframes, just "tabUrl" for top frame
const compositeUrl = createCompositeUrl(tabUrl, frameUrl, isTopFrame);
```

## Code Style and Conventions

### ESLint Rules (Key Points)
- **No emojis in code** - `no-emoji/no-emoji: error`
- **No em dashes** - Use regular hyphens instead
- **Strict equality** - Always use `===` and `!==`
- **Prefer const** - Use `const` unless reassignment needed
- **Minimum identifier length** - 2+ chars (exceptions: `i`, `j`, `k`, `x`, `y`, `_`, `t`)
- **Single quotes** for strings
- **Semicolons required**
- **No trailing commas**

### Naming Conventions
- **Files**: `camelCase.js` for modules, `PascalCase.js` for classes
- **Classes**: `PascalCase`
- **Functions/variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE` for true constants only
- **Private methods**: Prefix with `_` (e.g., `_internalMethod`)

### Internationalization (i18n)
All user-facing strings must be translatable:

```javascript
// In JavaScript
import { t } from '../shared/i18n.js';
const message = t('deleteConfirmation');

// In HTML
<span data-i18n="deleteConfirmation">Delete?</span>
```

Add new strings to all locale files in `public/_locales/*/messages.json`.

## Testing Guidelines

### Unit Tests (Jest)
- Location: `tests/unit/*.test.js`
- Mock Chrome APIs are in `tests/setup.js`
- Coverage thresholds: 85% statements, 75% branches, 75% functions

```javascript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('MyModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', () => {
    // Test implementation
  });
});
```

### E2E Tests (Playwright)
- Location: `tests/e2e/*.spec.js`
- Test fixtures: `tests/fixtures/`
- Run with: `npm run test:e2e`

### Running Tests
```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- tests/unit/NoteManager.test.js

# Run with coverage
npm run test:coverage

# E2E tests (requires build first)
npm run build:dev && npm run test:e2e
```

## Build System

### Build Scripts
The custom build script (`scripts/build.js`) runs separate Vite builds:

1. **Content script** - IIFE bundle (no ES modules in content scripts)
2. **Background script** - ES module with code splitting for lazy Firebase
3. **Popup** - IIFE bundle for fastest loading
4. **Options page** - IIFE bundle

### Build Outputs
```
dist/
├── chrome/           # Chrome build
│   ├── manifest.json
│   ├── src/
│   │   ├── background/background.js
│   │   ├── content/content.js
│   │   ├── popup/
│   │   └── options/
│   └── icons/
├── edge/             # Edge build (different OAuth config)
├── chrome.zip        # Production zip for Chrome Web Store
└── edge.zip          # Production zip for Edge Add-ons
```

### Version Management
Version is managed in `package.json` and synced to manifests during build:
```json
{
  "version": "1.20.3.3"
}
```

## Pre-commit Hooks

Husky runs these checks before each commit:

1. **Changelog check** - Required for major/minor version bumps
2. **lint-staged** - ESLint, Stylelint, HTMLHint, Markdownlint
3. **Unit tests** - All tests must pass

To bypass (not recommended):
```bash
git commit --no-verify -m "message"
```

## Firebase Integration

### Setup
1. Copy `.env.example` to `.env`
2. Fill in Firebase config values
3. See `docs/FIREBASE_SETUP.md` for detailed instructions

### Security Rules
Firestore rules are in `firestore.rules`:
- Users can only read/write their own notes
- Shared notes use email-based access control
- Comments require note access

### Cloud Functions
Located in `functions/`:
- Email notifications for shared notes
- API key generation and validation

## Common Tasks

### Adding a New Message Handler
1. Add handler in `src/background/handlers.js`
2. Add case in switch statement
3. Send from content script: `chrome.runtime.sendMessage({ action: 'newAction', ... })`

### Adding a New Component
1. Create in `src/content/components/`
2. Use Shadow DOM for isolation
3. Add styles in component or `src/content/app/styles.js`
4. Write unit tests in `tests/unit/`

### Adding a New Locale
1. Create `public/_locales/{code}/messages.json`
2. Copy from `en/messages.json`
3. Translate all values (keep keys identical)
4. Rebuild: `npm run build`

### Adding User Preferences
1. Add to `src/shared/preferences.js`
2. Update options page UI
3. Use via `getPreferences()` / `savePreferences()`

## Debugging

### Development Build
```bash
npm run build:dev:chrome
```
Then load `dist/chrome` as unpacked extension.

### Logging
Use structured loggers:
```javascript
import { contentLogger as log } from '../shared/logger.js';
log.debug('Message', data);
log.warn('Warning', error);
log.error('Error', error);
```

### Service Worker
- Chrome DevTools > Extensions > Service Worker "Inspect"
- Check for lazy loading chunk issues

### Content Script
- Use page's DevTools console
- Look for `[StickyNotes]` prefixed logs

## Common Gotchas

1. **Service workers have no `window`** - Use `self` instead
2. **Content scripts can't use ES modules** - Built as IIFE
3. **Context invalidation** - Extension reload breaks content script messaging
4. **Iframe notes** - Use composite URLs for proper association
5. **Firebase in service worker** - Must lazy-load to avoid blocking startup
6. **OAuth differs by browser** - Chrome uses `getAuthToken`, Edge uses `launchWebAuthFlow`
7. **Pre-commit tests** - Commits will fail if tests fail; run `npm test` first

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):
- **Lint job** - All linters (JS, CSS, HTML, Markdown)
- **Test job** - Unit tests on Node 20 and 22
- **Build job** - Production build + site build

## Documentation

- `README.md` - User-facing documentation
- `docs/API.md` - MCP Server API documentation
- `docs/FIREBASE_SETUP.md` - Firebase configuration guide
- `docs/ROADMAP.md` - Development roadmap
- `.cursor/rules/i18n.mdc` - Detailed i18n guidelines
