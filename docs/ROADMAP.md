# Sticky Notes Chrome Extension - Roadmap

## Target Audience

**Primary:** Dev teams and QA testers

### Pain Points We Solve

- Bug reports lack context ("The button is broken" with no URL, screenshot, or element reference)
- Screenshot + Jira ping-pong (back and forth asking "which button? which page?")
- Staging environments change - hard to reproduce issues
- Designer - Dev handoff friction ("This margin looks off" - where exactly?)

### Value Proposition
>
> "Sticky notes for your staging environment. Click, annotate, share. Bug reports that actually make sense."

---

## Current Status (MVP) - DONE

- [x] Note creation anchored to DOM elements
- [x] Robust CSS selector generation with fuzzy matching
- [x] Visibility management (show/hide based on anchor visibility)
- [x] Toggle all notes visibility from popup menu
- [x] Rich text editor (bold, italic, lists, links)
- [x] Color themes
- [x] Draggable notes with position memory
- [x] Local storage persistence
- [x] Shadow DOM for style isolation
- [x] Keyboard event isolation (no conflict with page shortcuts)
- [x] Re-anchor UI when elements not found
- [x] Extension context invalidation handling
- [x] Iframe support with composite URL keys (notes in iframes are associated with main page)

### Code Quality - DONE

- [x] ESLint configuration with pre-commit hooks
- [x] Unit test coverage (739 tests, ~65% coverage)
- [x] Shared utility functions for testability
- [x] Conditional debug logging (configurable via env)
- [x] XSS prevention with HTML escaping
- [x] CSS selector validation for security
- [x] Modular content script architecture

---

## Phase 1: Authentication & Cloud Sync - DONE

- [x] Firebase Authentication (Google Sign-In)
- [x] Cloud sync with Firestore
- [x] Note sharing between users (by email)
- [x] Email notifications when notes are shared (via Firebase Trigger Email extension)
- [x] Offline persistence (Firestore cache)
- [x] Automatic migration of local notes to cloud on first login

### Notes Data Model

```javascript
// Firestore: notes/{noteId}
{
  id: "note123",
  url: "https://example.com/page",           // Normalized URL (or composite URL for iframes)
  selector: "div.container > button#submit", // CSS selector for anchor element, or "__PAGE__" for page-level notes
  content: "<p>Note content here</p>",       // Rich text HTML content
  theme: "yellow",                           // yellow | blue | green | pink
  position: { anchor: "top-right" },         // Note position relative to anchor (or { pageX, pageY } for page-level notes)
  isHidden: false,                           // Per-note visibility (hidden notes stay hidden even with global "show all")
  metadata: {
    url: "https://example.com/page",
    tabUrl: "https://example.com/page",      // Top-level page URL
    title: "Page Title",
    browser: "Chrome 120",
    viewport: "1920x1080",
    timestamp: "2026-01-17T10:00:00.000Z",
    isTopFrame: true,
    frameUrl: null,                          // Iframe URL if not top frame
    environment: "staging",                  // local | development | staging | production
    consoleErrors: [{ type: "console.error", message: "...", timestamp: 1234567890 }]
  },
  ownerId: "user1",
  ownerEmail: "user1@email.com",
  sharedWith: ["user2@email.com"],           // Array of email addresses
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## Phase 2: Threaded Discussions & Real-time Sync - DONE

Add comment threads to notes for Q&A and discussions.

### Real-time Features

- [x] Real-time collaborative updates (live sync for notes)
- [x] Real-time sync for comments
- [x] Unread shared notes badge (extension icon shows count of new shared notes)
- [x] View unread shared notes in popup (tabbed interface with "This Page" and "Shared" tabs)

### Data Model

```javascript
// Firestore: notes/{noteId}/comments/{commentId}
{
  id: "comment456",
  authorId: "user2",
  authorEmail: "user2@email.com",
  authorName: "Jane Doe",
  authorPhotoURL: "https://...",  // User's profile photo
  content: "What does this mean?",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  parentId: null  // null = top-level, commentId for replies
}
```

### Features

- [x] Comment list in note (collapsible)
- [x] Reply button per comment (1-level nesting)
- [x] User avatars/names display
- [x] Relative timestamps ("2 hours ago")
- [x] Real-time sync for comments

### Implementation Notes

- Depth limit: 1 level (direct replies only)
- Permissions: Anyone with note access can comment
- Comment authors can edit/delete their own comments
- Note owners can delete any comment
- **Firestore Index**: Composite index on `parentId` + `createdAt` (see FIREBASE_SETUP.md)

---

## Phase 3: Dev/QA Power Features

Features that differentiate for developer and QA workflows:

### Metadata Capture (High Priority)

- [x] Auto-capture URL, viewport size, browser, timestamp
- [x] Capture element selector in bug report format
- [x] Display metadata in collapsible panel on note
- [x] Relative timestamp display ("1 minute ago")
- [x] Environment tagging (auto-detect local/dev/staging/production with override)
- [x] Console errors capture

### Screenshot & Export

- [] Screenshot on note creation
- [x] "Copy as Markdown" - generates bug report template
- [x] "Copy screenshot" - one-click annotated screenshot
- [] Shareable link that highlights the element
- [x] Export all notes as JSON
- [x] Export all notes as CSV (from popup)

### Issue Tracking Integration

- [] Jira integration (one-click ticket creation)
- [] Linear integration
- [] GitHub Issues integration
- [] Status tracking (open/resolved/reopened)

### Advanced

- [] Session replay link support (LogRocket/FullStory)
- [] Batch export notes as report

---

## Phase 4: Team & Billing

- [] Team workspaces
- [] Role-based permissions
- [] Usage analytics dashboard
- [] Priority support (Team and Pro tiers)
- [] Custom branding (Pro tier - custom logo, colors for shared notes)

### Pricing Model

**Note:** The extension can be used without any account (local storage only). The tiers below describe features available with a Google account.

| Tier | Price | Features |
|------|-------|----------|
| **Starter** | $0 (Forever free) | Up to 10 cloud notes, all note features, rich text editor, color themes, cloud sync, team sharing |
| **Team** | $1/user/mo or $10/user/year | Unlimited cloud notes, share notes by email, threaded comments, offline support, priority support, all note features |
| **Pro** | $2/user/mo or $20/user/year | Everything in Team, Jira integration, GitHub Issues integration, screenshot capture, metadata capture, custom branding |

---

## Phase 5: Backoffice & Admin

Internal tools for managing users, subscriptions, and analytics.

### User Management

- [] User list with search/filter
- [] View user details (notes count, usage, tier)
- [] Manually upgrade/downgrade user tier
- [] Suspend/unsuspend users
- [] Delete user and associated data (GDPR)

### Subscription Management

- [] View all subscriptions
- [] Stripe integration for billing
- [] Trial management (start, extend, end)
- [] Invoice history per user
- [] Refund processing

### Analytics Dashboard

- [] Active users (DAU/MAU)
- [] Notes created per day/week/month
- [] Conversion rates (free -> basic -> pro)
- [] Churn rate tracking
- [] Revenue metrics (MRR, ARR)
- [] Usage by feature

### Support Tools

- [] View user's notes (with permission/audit log)
- [] Impersonate user for debugging
- [] Audit log for admin actions
- [] Support ticket integration

### System Health

- [] Firebase usage metrics
- [] Error tracking dashboard
- [] API latency monitoring
- [] Storage usage per user

---

## Competitive Landscape

### Existing Products

| Product | Focus | Notes |
|---------|-------|-------|
| Hypothesis | Academic annotation | Niche, not dev-focused |
| Liner | Highlighting + AI | Consumer-focused |
| Marker.io | Bug reporting | Expensive ($39+/mo), heavy |
| BugHerd | Visual feedback | Expensive, complex |
| Userback | User feedback | Enterprise-focused |

### Our Positioning

- **Simpler** than Marker.io/BugHerd
- **More affordable** for small teams
- **Developer-first** with selector capture
- **Lightweight** - just what you need, nothing more

---

## Quick Wins to Validate - DONE

Low-effort features to test market fit:

1. ~~**"Copy as Markdown" button**~~ - Bug report template with URL + selector - DONE
2. ~~**"Copy screenshot" button**~~ - One-click annotated screenshot (highlights element) - DONE
3. ~~**Metadata display**~~ - Collapsible footer showing URL, browser, viewport, timestamp - DONE

---

## Ideas Bucket

Unplanned feature ideas for future consideration:

- [x] Minimize note (collapse to small indicator)
- [x] Delete/bulk delete notes from popup.html
- [] Delete old notes from popup UI (filter by age, cleanup stale notes)
- [x] Add note through right-click context menu
- [x] Page-level notes (notes without element anchor, attached to page itself)
- [x] Per-note visibility controls (hide/show individual notes, persisted across refreshes)
- [x] Keyboard shortcuts for visibility:
  - Ctrl+Shift+H to toggle all notes visibility
  - Ctrl+H / Cmd+H to toggle focused note visibility
- [x] Dashboard discoverability improvements:
  - More prominent dashboard link in popup header (blue button style)
  - "Open Notes Dashboard" context menu item
  - Keyboard shortcut Alt+Shift+D to open dashboard
  - Welcome page on first install with feature highlights
- [] Read-only user permissions (viewers who can see notes but not edit/comment) - pricing implications?
- [] Freemium model with ads - all features free forever but with ads in notes (research: can Google Ads be injected into extension UI?)
- [] Edge browser support (Chromium-based, should be straightforward)
- [] Firefox browser support (requires WebExtensions API adaptation)
- [] Test data cleanup feature (delete all notes for testing purposes)
- [x] WCAG 2.1 AA accessibility compliance (landing page) - skip links, focus states, heading hierarchy, aria labels, prefers-reduced-motion, touch targets
- [] WCAG 2.1 AA accessibility compliance (extension UI)
- [] Additional note positions: Center Left, Center Right, Top Center, Bottom Center
- [] Auto position: smart positioning based on available viewport space
- [] Note content length validation (e.g., 10,000-50,000 chars) for UX, performance, and cost control
- [] Image support in notes (Pro feature - requires Firebase Storage, upload flow, cost considerations)
- [] RichEditor enhancements: code/monospace, strikethrough, checkboxes, blockquotes
- [] Slack Integration: Share notes directly to Slack channels/users (High effort - requires Slack app setup, OAuth, webhooks)
- [x] Inline sharing via email detection in note content:
  - Implemented: Auto-share when email + space is typed
  - Visual feedback: green underline (success), red underline (failed)
  - Hover tooltip shows share status
  - Auto-unshare when email is removed from note
- [x] Manage sticky notes from popup:
  - [x] View note metadata in popup (expand/preview mode)
  - [x] Delete notes on current page from popup
  - [x] Bulk delete all notes from current page
  - [x] Bulk delete all notes
  - [x] Share notes from popup
  - [x] Jump to note and maximize it
  - [] View and delete notes from other pages (cross-page note management)
  - [] Potential UI: list view with page grouping, search/filter capabilities
- [x] Preferences/Settings page:
  - [x] Default theme for new notes
  - [x] Default position preference
  - [x] Note width settings (240px, 280px, 320px, 360px)
  - [x] Font size settings (small, medium, large)
  - [x] Global visibility defaults
  - [x] Settings sync across devices via chrome.storage.sync

---

## Tech Debt

- [] Remove CHANGELOG.md from markdownlint ignores and fix any linting issues

---

## Known Bugs

### Major

- [x] ~~Note position relative to element (top/bottom + right/left) isn't always working correctly~~ (Fixed: notes now use viewport coordinates and follow anchor elements when scrolling)
- [] On some pages, notes fail to attach to elements at all
- [] On pages with repeated content structures (e.g., live news feeds), notes may attach to the wrong instance of an element due to non-unique CSS selectors

### Minor

- [] The yellow color of the "Add to Chrome" button doesn't work well with the colors in the Chrome SVG logo

---

## Notes

- Robust selector engine with fuzzy matching is a key differentiator
- Most competitors break on modern SPAs; our re-anchoring solves this
- Start with dev team dogfooding before public launch
