---
name: chrome-extension-best-practices
description: Chrome Extension development best practices for Manifest V3. Covers architecture patterns (service workers, content scripts, messaging), security (CSP, permissions, XSS prevention), performance (lazy loading, code splitting, memory management), testing (Jest mocks, Playwright E2E), UI/UX, accessibility, i18n, and Firebase integration. Use when building or reviewing Chrome extensions, implementing background/content scripts, setting up messaging, or optimizing extension performance.
---

# Chrome Extension Development Best Practices (Manifest V3)

You are an expert Chrome extension developer, proficient in JavaScript/TypeScript, browser extension APIs, and web development.

## Code Style and Structure

- Write clear, modular code with proper type definitions (JSDoc or TypeScript)
- Use descriptive variable names (e.g., `isLoading`, `hasPermission`)
- Structure files logically: popup, background, content scripts, utils
- Implement proper error handling and logging
- Document code with JSDoc comments

## Architecture Patterns

### Service Worker (Background Script)

Service workers in MV3 are event-driven and can be terminated at any time:

```javascript
// background/index.js - Entry point
chrome.runtime.onInstalled.addListener(() => {
  // One-time setup
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Required for async responses
});
```

**Key constraints:**

- No `window` object - use `self` instead
- No persistent state - use `chrome.storage` for persistence
- Cannot use DOM APIs
- Use `chrome.alarms` for scheduled tasks (not `setTimeout`/`setInterval`)

### Content Scripts

Build as IIFE (content scripts cannot use ES modules):

```javascript
(function() {
  // Use Shadow DOM for UI isolation
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
})();
```

**Key patterns:**

- Use Shadow DOM to prevent style conflicts
- Handle context invalidation when extension reloads

### Message Passing

```javascript
// Content script sends
chrome.runtime.sendMessage({ action: 'createNote', data: { text: 'content' } });

// Background handles with action-based routing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'createNote':
      return handleCreateNote(message.data, sender);
  }
});
```

## Security Best Practices

### Permissions (Principle of Least Privilege)

- Use `activeTab` instead of broad `tabs` permission
- Request optional permissions at runtime
- Document why each permission is needed

### Content Security Policy

MV3 constraints:

- No inline scripts in HTML pages
- No `eval()` or `new Function()`
- No remote code execution
- All scripts must be bundled

### Data Handling

- Sanitize all user input
- Use `chrome.storage.local` for sensitive data (not sync)
- Never expose API keys in content scripts
- Validate data from external sources
- Use `web_accessible_resources` with `use_dynamic_url: true`

## Performance Optimization

### Lazy Loading

```javascript
let firebasePromise = null;
export async function getFirebase() {
  if (!firebasePromise) {
    firebasePromise = import('./config.js');
  }
  return firebasePromise;
}
```

### Code Splitting

Use dynamic imports in service workers:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'syncNotes') {
    import('./sync.js').then(({ syncNotes }) => syncNotes()).then(sendResponse);
    return true;
  }
});
```

### Memory Management

- Clean up observers and listeners when not needed
- Monitor memory usage with `performance.memory`
- Cache expensive computations with size limits

## UI and User Experience

- Follow Material Design guidelines
- Implement responsive popup windows
- Provide clear user feedback for all actions
- Support keyboard navigation
- Ensure proper loading states with `aria-busy`

## Internationalization (i18n)

- Use `chrome.i18n.getMessage()` for translations
- Follow `_locales` directory structure
- Support RTL languages with `dir="auto"`
- Use `data-i18n` attributes for HTML translation

## Accessibility

- Implement ARIA labels for interactive elements
- Ensure color contrast (4.5:1 for text, 3:1 for UI)
- Support screen readers
- Add keyboard shortcuts with `chrome.commands`

## Testing

### Jest Setup

Mock Chrome APIs in `tests/setup.js`. Use the `localThis` pattern for unit tests.

### E2E with Playwright

Load extension with `--load-extension` flag in persistent context.

## Common Gotchas

| Issue | Solution |
|-------|----------|
| Service workers have no `window` | Use `self` instead |
| Content scripts can't use ES modules | Build as IIFE bundle |
| Context invalidation on reload | Wrap messaging in try-catch |
| Firebase blocks service worker startup | Lazy-load Firebase SDK |
| OAuth differs by browser | `getAuthToken` for Chrome, `launchWebAuthFlow` for Edge |
| `setTimeout` unreliable in SW | Use `chrome.alarms` for scheduled tasks |

## Output Expectations

When generating Chrome extension code:

- Provide clear, working code examples
- Include necessary error handling
- Follow security best practices
- Ensure cross-browser compatibility
- Write maintainable and scalable code

## Additional Resources

- For detailed patterns and examples, see [reference.md](reference.md)
- For detailed i18n guidelines, see [../../rules/i18n.mdc](../../rules/i18n.mdc)
- For project-specific patterns, see [../../../CLAUDE.md](../../../CLAUDE.md)
