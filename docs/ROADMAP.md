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
- [x] Unit test coverage (325 tests, ~32% coverage)
- [x] Shared utility functions for testability
- [x] Conditional debug logging (configurable via env)
- [x] XSS prevention with HTML escaping
- [x] CSS selector validation for security

---

## Phase 1: Authentication & Cloud Sync [x]

- [x] Firebase Authentication (Google Sign-In)
- [x] Cloud sync with Firestore
- [x] Note sharing between users (by email)
- [x] Offline persistence (Firestore cache)

---

## Phase 2: Threaded Discussions & Real-time Sync []

Add comment threads to notes for Q&A and discussions.

### Real-time Features
- [] Real-time collaborative updates (live sync for notes)
- [] Real-time sync for comments

### Data Model
```javascript
// Firestore: notes/{noteId}/comments/{commentId}
{
  id: "comment456",
  authorId: "user2",
  authorEmail: "user2@email.com",
  authorName: "Jane Doe",
  content: "What does this mean?",
  createdAt: Timestamp,
  parentId: null  // null = top-level, commentId for replies
}
```

### Features
- [] Comment list in note (collapsible)
- [] Reply button per comment
- [] User avatars/names display
- [] Relative timestamps ("2 hours ago")
- [] Real-time sync for comments

### Considerations
- Depth limit for nested replies (recommend: 1 level)
- Permissions: who can comment?
- UI expansion for thread display
- **Firestore Index**: Composite index on `parentId` + `createdAt` for efficient threaded queries

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

## Notes

- Robust selector engine with fuzzy matching is a key differentiator
- Most competitors break on modern SPAs; our re-anchoring solves this
- Start with dev team dogfooding before public launch
