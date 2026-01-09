# Sticky Notes Chrome Extension - Roadmap

## Target Audience

**Primary:** Dev teams and QA testers

### Pain Points We Solve
- Bug reports lack context ("The button is broken" with no URL, screenshot, or element reference)
- Screenshot + Jira ping-pong (back and forth asking "which button? which page?")
- Staging environments change - hard to reproduce issues
- Designer ↔ Dev handoff friction ("This margin looks off" - where exactly?)

### Value Proposition
> "Sticky notes for your staging environment. Click, annotate, share. Bug reports that actually make sense."

---

## Current Status (MVP) [x]

- [x] Note creation anchored to DOM elements
- [x] Robust CSS selector generation with fuzzy matching
- [x] Visibility management (show/hide based on anchor visibility)
- [x] Rich text editor (bold, italic, lists, links)
- [x] Color themes
- [x] Draggable notes with position memory
- [x] Local storage persistence
- [x] Shadow DOM for style isolation
- [x] Keyboard event isolation (no conflict with page shortcuts)
- [x] Re-anchor UI when elements not found
- [x] Extension context invalidation handling

### Code Quality [x]
- [x] ESLint configuration with pre-commit hooks
- [x] Unit test coverage (739 tests, ~65% coverage)
- [x] Shared utility functions for testability
- [x] Conditional debug logging (configurable via env)
- [x] XSS prevention with HTML escaping
- [x] CSS selector validation for security
- [x] Modular content script architecture

---

## Phase 1: Authentication & Cloud Sync [x]

- [x] Firebase Authentication (Google Sign-In)
- [x] Cloud sync with Firestore
- [x] Note sharing between users (by email)
- [x] Offline persistence (Firestore cache)

---

## Phase 2: Threaded Discussions & Real-time Sync [x]

Add comment threads to notes for Q&A and discussions.

### Real-time Features
- [x] Real-time collaborative updates (live sync for notes)
- [x] Real-time sync for comments

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
- [] Auto-capture URL, viewport size, browser, timestamp
- [] Capture element selector in bug report format
- [] Console errors capture (optional)
- [] Environment tagging (staging vs production)

### Screenshot & Export
- [] Screenshot on note creation
- [] "Copy as Markdown" - generates bug report template
- [] "Copy screenshot" - one-click annotated screenshot
- [] Shareable link that highlights the element

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

### Pricing Model
| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Up to 10 cloud notes, all features, no sharing |
| **Basic** | $1/user/mo or $10/user/year | Unlimited notes, sharing, threads, offline |
| **Pro** | $2/user/mo or $20/user/year | Integrations, screenshots, metadata, branding |

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

## Quick Wins to Validate [x]

Low-effort features to test market fit:

1. ~~**"Copy as Markdown" button**~~ [x] - Bug report template with URL + selector
2. ~~**"Copy screenshot" button**~~ [x] - One-click annotated screenshot (highlights element)
3. ~~**Metadata display**~~ [x] - Collapsible footer showing URL, browser, viewport, timestamp

---

## Ideas Bucket

Unplanned feature ideas for future consideration:

- [] Minimize note (collapse to small indicator)
- [] Delete/bulk delete notes from popup.html
- [x] Add note through right-click context menu
- [] Read-only user permissions (viewers who can see notes but not edit/comment) - pricing implications?
- [] Freemium model with ads - all features free forever but with ads in notes (research: can Google Ads be injected into extension UI?)
- [] Edge browser support (Chromium-based, should be straightforward)
- [] Firefox browser support (requires WebExtensions API adaptation)

---

## Known Bugs

- [] The yellow color of the "Add to Chrome" button doesn't work well with the colors in the Chrome SVG logo
- [] Note position relative to element (top/bottom + right/left) isn't always working correctly
- [] On some pages, notes fail to attach to elements at all

---

## Notes

- Robust selector engine with fuzzy matching is a key differentiator
- Most competitors break on modern SPAs; our re-anchoring solves this
- Start with dev team dogfooding before public launch
