# Chrome Extension Best Practices - Detailed Reference

This reference contains detailed code examples and patterns for Chrome extension development.

## Code Style Examples

### JSDoc Documentation

```javascript
/**
 * Creates a new sticky note on the page.
 * @param {Object} options - Note configuration
 * @param {string} options.text - Note content
 * @param {string} options.selector - Target element selector
 * @returns {Promise<Note>} The created note
 */
async function createNote({ text, selector }) {
  // Implementation
}
```

## Architecture Patterns

### Scheduled Tasks with chrome.alarms

```javascript
// Service workers cannot use setTimeout/setInterval reliably
chrome.alarms.create('syncData', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncData') {
    performSync();
  }
});
```

### Iframe Communication

```javascript
// Create composite URLs for iframe association
function createCompositeUrl(tabUrl, frameUrl, isTopFrame) {
  return isTopFrame ? tabUrl : `${tabUrl}|${frameUrl}`;
}

// Listen for messages from all frames
chrome.runtime.onMessage.addListener((message, sender) => {
  const frameUrl = sender.frameId === 0 ? null : sender.url;
  // Handle frame-specific logic
});
```

### Offline Support

```javascript
// Check online status
if (navigator.onLine) {
  await syncToCloud();
} else {
  await saveLocally();
  chrome.storage.local.set({ pendingSync: true });
}

// Listen for online status changes
self.addEventListener('online', () => {
  processPendingSync();
});
```

## Security Patterns

### Manifest Permissions

```json
{
  "permissions": [
    "storage",
    "activeTab"
  ],
  "optional_permissions": [
    "tabs"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

### Content Security Policy

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### Input Sanitization

```javascript
// Sanitize user input before storage/display
function sanitizeInput(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Validate data from external sources
function validateNoteData(data) {
  if (typeof data.text !== 'string' || data.text.length > 10000) {
    throw new Error('Invalid note data');
  }
  return data;
}
```

### Secure External Messaging

```javascript
// Validate message origin
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const allowedExtensions = ['extension-id-1', 'extension-id-2'];
  if (!allowedExtensions.includes(sender.id)) {
    return false;
  }
  // Process message
});
```

### Web Accessible Resources

```json
{
  "web_accessible_resources": [{
    "resources": ["images/*.png"],
    "matches": ["<all_urls>"],
    "use_dynamic_url": true
  }]
}
```

## Performance Patterns

### Vite Build Configuration

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      input: {
        background: 'src/background/index.js',
        content: 'src/content/index.js',
        popup: 'src/popup/popup.js'
      },
      output: {
        // Content script as IIFE
        format: 'iife', // for content script
        // Background as ES module with chunks
        format: 'es', // for background
      }
    }
  }
};
```

### Memory Management

```javascript
// Clean up observers when not needed
class VisibilityManager {
  constructor() {
    this.observer = new IntersectionObserver(this._callback.bind(this));
  }
  
  destroy() {
    this.observer.disconnect();
    this.observer = null;
  }
}

// Avoid memory leaks in content scripts
window.addEventListener('unload', () => {
  cleanup();
});

// Monitor memory usage
if (performance.memory) {
  const memoryInfo = performance.memory;
  if (memoryInfo.usedJSHeapSize > 50 * 1024 * 1024) {
    console.warn('High memory usage detected');
  }
}
```

### Caching

```javascript
// Cache expensive computations
const selectorCache = new Map();

function getCachedSelector(element) {
  const cached = selectorCache.get(element);
  if (cached) return cached;
  
  const selector = generateSelector(element);
  selectorCache.set(element, selector);
  return selector;
}

// Clear cache periodically to prevent unbounded growth
setInterval(() => {
  if (selectorCache.size > 1000) {
    selectorCache.clear();
  }
}, 60000);
```

## UI/UX Patterns

### Loading States

```javascript
function showLoading(container) {
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '<div class="spinner" role="status">Loading...</div>';
}

function hideLoading(container) {
  container.removeAttribute('aria-busy');
}
```

### User Feedback

```javascript
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
```

## Internationalization

### Message Format

```json
// _locales/en/messages.json
{
  "welcomeMessage": {
    "message": "Welcome to Sticky Notes",
    "description": "Greeting shown on first install"
  },
  "greeting": {
    "message": "Hello, $USER$!",
    "placeholders": {
      "user": { "content": "$1" }
    }
  }
}
```

### Usage

```javascript
// Get translated string
const message = chrome.i18n.getMessage('welcomeMessage');

// With placeholders
const greeting = chrome.i18n.getMessage('greeting', [userName]);
```

## Accessibility

### ARIA and Keyboard Navigation

```javascript
// ARIA labels
button.setAttribute('aria-label', chrome.i18n.getMessage('deleteNote'));
button.setAttribute('aria-describedby', 'delete-help-text');

// Keyboard navigation
element.setAttribute('tabindex', '0');
element.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    handleActivation();
  }
});
```

### Keyboard Shortcuts

```json
// manifest.json
{
  "commands": {
    "create-note": {
      "suggested_key": { "default": "Ctrl+Shift+N" },
      "description": "Create a new note"
    }
  }
}
```

```javascript
// background.js
chrome.commands.onCommand.addListener((command) => {
  if (command === 'create-note') {
    createNewNote();
  }
});
```

## Testing

### Jest Chrome API Mocks

```javascript
// tests/setup.js
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn(path => `chrome-extension://abc123/${path}`)
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn()
  },
  i18n: {
    getMessage: jest.fn(key => key)
  }
};
```

### Unit Test Pattern (localThis)

```javascript
// tests/unit/NoteManager.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('NoteManager', () => {
  let localThis;
  
  beforeEach(() => {
    jest.clearAllMocks();
    localThis = {
      notes: new Map(),
      _saveNote: jest.fn(),
      _deleteNote: jest.fn()
    };
  });
  
  it('should create a note', async () => {
    const result = await NoteManager.prototype.create.call(localThis, {
      text: 'Test note'
    });
    
    expect(localThis._saveNote).toHaveBeenCalled();
    expect(result.text).toBe('Test note');
  });
});
```

### E2E Testing with Playwright

```javascript
// tests/e2e/extension.spec.js
import { test, expect, chromium } from '@playwright/test';

test.describe('Extension', () => {
  let context;
  let extensionId;
  
  test.beforeAll(async () => {
    const pathToExtension = './dist/chrome';
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });
    
    // Get extension ID
    const [background] = context.serviceWorkers();
    extensionId = background.url().split('/')[2];
  });
  
  test('popup opens correctly', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await expect(page.locator('h1')).toBeVisible();
  });
});
```

## Firebase Integration

### Lazy Loading

```javascript
// firebase/lazy.js
let firebaseApp = null;
let firestoreDb = null;

async function initFirebase() {
  if (firebaseApp) return { app: firebaseApp, db: firestoreDb };
  
  const { initializeApp } = await import('firebase/app');
  const { getFirestore } = await import('firebase/firestore');
  
  firebaseApp = initializeApp(config);
  firestoreDb = getFirestore(firebaseApp);
  
  return { app: firebaseApp, db: firestoreDb };
}

export async function createNoteLazy(data) {
  const { db } = await initFirebase();
  const { addDoc, collection } = await import('firebase/firestore');
  return addDoc(collection(db, 'notes'), data);
}
```

### Authentication

```javascript
// Chrome uses different auth flows
async function signInWithGoogle() {
  if (isChrome()) {
    // Chrome: Use chrome.identity
    const token = await chrome.identity.getAuthToken({ interactive: true });
    const credential = GoogleAuthProvider.credential(null, token);
    return signInWithCredential(auth, credential);
  } else {
    // Edge/Firefox: Use launchWebAuthFlow
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/...&redirect_uri=${redirectUrl}`;
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });
    // Parse token from response
  }
}
```

### Real-time Sync

```javascript
class RealtimeSync {
  constructor() {
    this.unsubscribers = new Map();
  }
  
  async subscribe(userId, onUpdate) {
    const { db } = await initFirebase();
    const { onSnapshot, collection, query, where } = await import('firebase/firestore');
    
    const q = query(
      collection(db, 'notes'),
      where('userId', '==', userId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const changes = snapshot.docChanges().map(change => ({
        type: change.type,
        data: { id: change.doc.id, ...change.doc.data() }
      }));
      onUpdate(changes);
    });
    
    this.unsubscribers.set(userId, unsubscribe);
  }
  
  unsubscribe(userId) {
    const unsub = this.unsubscribers.get(userId);
    if (unsub) {
      unsub();
      this.unsubscribers.delete(userId);
    }
  }
}
```

## Official Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Web Store Guidelines](https://developer.chrome.com/docs/webstore/program-policies/)
