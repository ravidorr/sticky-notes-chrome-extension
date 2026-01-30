# Sticky Notes Chrome Extension - Manual Testing Plan

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Extension Installation & Basic Functionality](#2-extension-installation--basic-functionality)
3. [Popup UI Testing](#3-popup-ui-testing)
4. [Element Selection & Note Creation](#4-element-selection--note-creation)
5. [Note Editing & Rich Text Editor](#5-note-editing--rich-text-editor)
6. [Note Theming & Positioning](#6-note-theming--positioning)
7. [Note Persistence (Local Storage)](#7-note-persistence-local-storage)
8. [Authentication (Google Sign-In)](#8-authentication-google-sign-in)
9. [Cloud Sync (Firebase/Firestore)](#9-cloud-sync-firebasefirestore)
10. [Note Sharing & Collaboration](#10-note-sharing--collaboration)
11. [Comments & Threaded Discussions](#11-comments--threaded-discussions)
12. [Visibility Intelligence (IntersectionObserver)](#12-visibility-intelligence-intersectionobserver)
13. [Element Re-anchoring & Fuzzy Matching](#13-element-re-anchoring--fuzzy-matching)
14. [Advanced Features (Copy, Screenshot, Metadata)](#14-advanced-features-copy-screenshot-metadata)
15. [Internationalization (i18n)](#15-internationalization-i18n)
16. [Restricted URLs & Edge Cases](#16-restricted-urls--edge-cases)
17. [Performance Benchmarks](#17-performance-benchmarks)
18. [Basic Accessibility Testing](#18-basic-accessibility-testing)
19. [Marketing Site Verification](#19-marketing-site-verification)
20. [Settings/Preferences Page](#20-settingspreferences-page)
21. [Bug Tracking Workflow](#21-bug-tracking-workflow)
22. [Test Completion Checklist](#22-test-completion-checklist)

---

## 1. Test Environment Setup

### Prerequisites

| Item | Description |
|------|-------------|
| Chrome Browser | Version 120+ (Manifest V3 required) |
| Node.js | v18+ for building the extension |
| Firebase Project | With Authentication and Firestore enabled (for cloud features) |
| Test Accounts | 2-3 Google accounts for collaboration testing |

### Build & Install Steps

1. Clone the repository
2. Run `npm install`
3. Copy `.env.example` to `.env` and configure Firebase credentials (optional for local-only testing)
4. Run `npm run build` to generate `dist/` folder
5. Open Chrome, navigate to `chrome://extensions`
6. Enable "Developer mode" (toggle in top right)
7. Click "Load unpacked" and select the `dist/chrome` folder
8. Verify extension icon appears in toolbar

### Test Page Setup

- Use `tests/fixtures/index.html` served locally via `npx serve tests/fixtures -l 3000`
- Or any real website (GitHub, Wikipedia, etc.)

---

## 2. Extension Installation & Basic Functionality

### TEST-2.1: Extension Loads Successfully

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `chrome://extensions` | Extensions page opens |
| 2 | Verify extension is listed | "Sticky Notes" appears with icon |
| 3 | Check extension status | Shows "Enabled" (not "Error") |
| 4 | Click extension icon in toolbar | Popup opens |

### TEST-2.2: Content Script Injection

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `http://localhost:3000` | Test page loads |
| 2 | Open DevTools (F12) > Elements tab | DevTools opens |
| 3 | Search for `#sticky-notes-extension-root` | Shadow DOM host element exists |
| 4 | Expand the shadow-root | Contains styling and component structure |

### TEST-2.3: Context Menu Available

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to any webpage | Page loads |
| 2 | Right-click on any element | Context menu appears |
| 3 | Look for "Create Sticky Note Here" | Menu item is visible |

### TEST-2.4: Dashboard Context Menu Item

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to any webpage | Page loads |
| 2 | Right-click on the page | Context menu appears |
| 3 | Look for "Open Notes Dashboard" | Menu item is visible |
| 4 | Click "Open Notes Dashboard" | Dashboard opens in new tab |
| 5 | Verify dashboard URL | Shows `ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html` |

### TEST-2.5: Keyboard Shortcut - Open Dashboard

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to any webpage | Page loads |
| 2 | Press `Alt+Shift+D` | Dashboard opens in new tab |
| 3 | Verify dashboard URL | Shows `ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html` |

### TEST-2.6: Welcome Page on First Install

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Remove extension from Chrome | Extension uninstalled |
| 2 | Reinstall extension (Load unpacked) | Extension installed |
| 3 | Check for new tab | Welcome page opens automatically |
| 4 | Verify welcome page content | Shows welcome message, feature highlights, and "Open Dashboard" button |
| 5 | Click "Open Dashboard" button | Dashboard opens in new tab |

---

## 3. Popup UI Testing

### TEST-3.1: Popup Display (Logged Out State)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click extension icon | Popup opens |
| 2 | Verify header | Shows "Sticky Notes" title |
| 3 | Check auth section | "Sign in with Google" button visible |
| 4 | Check "Notes on this page" section | Section visible (may be empty) |
| 5 | Check footer | Shows version number (e.g., "v1.0.0") |

### TEST-3.1.1: Dashboard Link in Popup Header

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click extension icon | Popup opens |
| 2 | Look for "Dashboard" link in header | Blue button-style link visible next to title |
| 3 | Hover over Dashboard link | Link shows hover state (darker blue background) |
| 4 | Click Dashboard link | Dashboard opens in new tab |
| 5 | Verify dashboard URL | Shows `ravidorr.github.io/sticky-notes-chrome-extension/dashboard.html` |

### TEST-3.2: Add Note Button (Restricted Page)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `chrome://extensions` | Chrome internal page opens |
| 2 | Click extension icon | Popup opens |
| 3 | Check "Add Note" button | Button is disabled (grayed out) and hint text shows "Notes cannot be added to Chrome system pages" in red |

### TEST-3.3: Add Note Button (Regular Page)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `http://localhost:3000` | Test page opens |
| 2 | Click extension icon | Popup opens |
| 3 | Click "Add Note" button | Selection mode activates on page |
| 4 | Popup should close | Popup closes automatically |

### TEST-3.4: Notes List in Popup

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create 2-3 notes on a page | Notes exist |
| 2 | Click extension icon | Popup opens |
| 3 | View "Notes on this page" section | Shows list of notes with content preview |
| 4 | Each note shows colored indicator | Theme color dot visible |
| 5 | Each note shows truncated selector | Selector text truncated if long |
| 6 | Click on a note in the list | Note highlights on page, page scrolls to it |

---

## 4. Element Selection & Note Creation

### TEST-4.1: Selection Mode Activation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to test page | Page loads |
| 2 | Click "Add Note" from popup OR right-click > "Create Sticky Note Here" | Selection mode activates |
| 3 | Observe cursor | Cursor changes (crosshair or similar) |
| 4 | Observe tooltip | "Click on an element to attach a note (ESC to cancel)" appears |

### TEST-4.2: Element Hover Highlight

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter selection mode | Mode active |
| 2 | Hover over different elements | Blue highlight border appears around hovered element |
| 3 | Move mouse to different element | Highlight follows mouse |
| 4 | Hover over extension's own elements | Extension elements (tooltip, highlight) are NOT highlighted |

### TEST-4.3: Element Selection via Click

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter selection mode | Mode active |
| 2 | Click on `[data-testid="card-1"]` | Selection mode exits |
| 3 | Note appears | Sticky note created and anchored to card |
| 4 | Note is positioned near element | Note appears at element's top-right or nearby |

### TEST-4.4: Cancel Selection with ESC

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter selection mode | Mode active |
| 2 | Press ESC key | Selection mode exits |
| 3 | No note created | Page returns to normal state |

### TEST-4.5: Context Menu Note Creation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Right-click on `#action-btn-1` | Context menu appears |
| 2 | Click "Create Sticky Note Here" | Note created and anchored to button |
| 3 | Note appears near button | Positioned appropriately |

### TEST-4.6: Iframe Context Menu Note Creation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open a page with an embedded iframe (e.g. a design tool embed) | Page loads and iframe content is visible |
| 2 | Right-click an element inside the iframe | Context menu appears |
| 3 | Click "Create Sticky Note Here" | Note is created in the iframe and anchored to the clicked element |
| 4 | Wait 10-15 seconds | Note stays visible (does not disappear) |
| 5 | Reload the page | Note persists and re-anchors correctly inside the iframe |

### TEST-4.7: Page-Level Note via Popup Button

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `http://localhost:3000` | Test page loads |
| 2 | Click extension icon | Popup opens |
| 3 | Click "Page Note" button | Note created immediately (no selection mode) |
| 4 | Note appears at top-left of page | Default position (10, 10) from top-left |
| 5 | Note has no anchor element highlight | Metadata shows "Page-level (no anchor)" instead of CSS selector |
| 6 | Scroll page | Note scrolls with page content |

### TEST-4.8: Page-Level Note via Context Menu

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to test page | Page loads |
| 2 | Right-click on empty area of page (not on a specific element) | Context menu appears |
| 3 | Click "Create Page Note" | Note created at right-click position |
| 4 | Note appears at click location | Not at default position |
| 5 | Scroll page | Note scrolls with page content |

### TEST-4.9: Page-Level Note Dragging

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a page-level note | Note exists |
| 2 | Drag note header to new position | Note moves with mouse |
| 3 | Release mouse | Note stays at new position |
| 4 | Scroll page | Note maintains relative position to page |
| 5 | Refresh page | Note reappears at saved position |

### TEST-4.10: Page-Level Note Always Visible

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a page-level note at bottom of long page | Note created |
| 2 | Scroll to top of page | Note is still visible (follows scroll) |
| 3 | Scroll to any position | Note always visible regardless of scroll |

---

## 5. Note Editing & Rich Text Editor

### TEST-5.1: Basic Text Entry

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a new note | Note appears |
| 2 | Click in the editor area | Editor is focused, cursor visible |
| 3 | Type "This is my note" | Text appears in editor |
| 4 | Wait 1-2 seconds | Note auto-saves (debounced) |

### TEST-5.2: Rich Text Formatting - Bold

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type some text | Text visible |
| 2 | Select a word | Text highlighted |
| 3 | Click Bold button (B) in toolbar | Text becomes bold |
| 4 | Alternative: Press Ctrl+B / Cmd+B | Same result |

### TEST-5.3: Rich Text Formatting - Italic

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select text | Text highlighted |
| 2 | Click Italic button (I) in toolbar | Text becomes italic |
| 3 | Alternative: Press Ctrl+I / Cmd+I | Same result |

### TEST-5.4: Rich Text Formatting - Unordered List

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Bullet List button | Unordered list started |
| 2 | Type "Item 1" and press Enter | New bullet appears |
| 3 | Type "Item 2" | Two bullet items visible |

### TEST-5.5: Rich Text Formatting - Ordered List

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Numbered List button | Ordered list started |
| 2 | Type "First" and press Enter | New numbered item appears |
| 3 | Type "Second" | Two numbered items (1., 2.) visible |

### TEST-5.6: Rich Text Formatting - Link

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select text "click here" | Text highlighted |
| 2 | Click Link button | Prompt appears for URL |
| 3 | Enter `https://example.com` | Link created |
| 4 | Text becomes clickable link | Underlined, shows as anchor |

### TEST-5.7: Paste HTML Cleaning (XSS Prevention)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Copy HTML with `<script>alert('xss')</script>` from another source | HTML in clipboard |
| 2 | Paste into note editor | Script tags stripped, only safe content remains |
| 3 | Verify no alert appears | No JavaScript execution |

### TEST-5.8: Placeholder Text

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new note | Note appears |
| 2 | Look at empty editor | Placeholder text "Write a note..." visible |
| 3 | Start typing | Placeholder disappears |
| 4 | Delete all text | Placeholder reappears |

---

## 6. Note Theming & Positioning

### TEST-6.1: Theme Color Change

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note | Note appears (default yellow) |
| 2 | Click theme button in note header | Theme picker appears |
| 3 | Select Blue | Note background changes to blue (#3b82f6) |
| 4 | Select Green | Note background changes to green (#22c55e) |
| 5 | Select Pink | Note background changes to pink (#ec4899) |
| 6 | Select Yellow | Note background returns to yellow (#facc15) |

### TEST-6.2: Theme Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change note theme to Blue | Theme applied |
| 2 | Refresh the page | Page reloads |
| 3 | Verify note | Still blue themed |

### TEST-6.3: Position Picker - Snap to Corner

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note anchored to an element | Note appears |
| 2 | Click position button in note header | Position picker appears with corner options |
| 3 | Select "Top Left" | Note moves to element's top-left corner |
| 4 | Select "Top Right" | Note moves to element's top-right corner |
| 5 | Select "Bottom Left" | Note moves to element's bottom-left corner |
| 6 | Select "Bottom Right" | Note moves to element's bottom-right corner |

### TEST-6.4: Free Drag Positioning

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note | Note appears |
| 2 | Click and drag note header | Note moves with mouse |
| 3 | Release mouse | Note stays at new position |
| 4 | Verify custom position saved | After refresh, note at same position |

### TEST-6.5: Window Resize Handling

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note anchored to element | Note positioned |
| 2 | Resize browser window | Note updates position relative to anchor |
| 3 | Note stays visible | Does not go off-screen |

### TEST-6.6: Minimize/Maximize - Default State

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a new note | Note appears |
| 2 | Observe note state | Note is minimized by default (only header visible) |
| 3 | Content, comments, footer | Hidden when minimized |

### TEST-6.7: Minimize/Maximize - Expand Note

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find minimized note | Note shows only header with up arrow button |
| 2 | Click the up arrow button | Note expands to full size |
| 3 | Content area visible | Editor, comments section, and footer appear |
| 4 | Button icon changes | Now shows down arrow |
| 5 | Button tooltip | Shows "Minimize note" |

### TEST-6.8: Minimize/Maximize - Collapse Note

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find expanded note | Note shows full content with down arrow button |
| 2 | Click the down arrow button | Note collapses to header only |
| 3 | Content hidden | Editor, comments, footer disappear |
| 4 | Button icon changes | Now shows up arrow |
| 5 | Button tooltip | Shows "Expand note" |

### TEST-6.9: Minimize/Maximize - Multiple Notes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create 3 notes on page | All notes minimized by default |
| 2 | Expand one note | Only that note expands, others stay minimized |
| 3 | Expand another note | Both notes now expanded |
| 4 | Page remains readable | Minimized notes reduce clutter |

---

## 7. Note Persistence (Local Storage)

### TEST-7.1: Notes Saved Without Login

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure NOT logged in | Auth section shows login button |
| 2 | Create a note with content "Local note test" | Note created |
| 3 | Refresh page | Page reloads |
| 4 | Verify note | Note still exists with correct content |

### TEST-7.2: Notes Associated with URL

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note on `http://localhost:3000` | Note created |
| 2 | Navigate to `http://localhost:3000/?foo=bar` | Same page, different URL |
| 3 | Open popup, check notes | Same note appears (URL normalized - query params stripped) |

### TEST-7.3: Notes Per-Page Isolation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note on `http://localhost:3000/` | Note created |
| 2 | Navigate to different website (e.g., `https://example.com`) | Different page |
| 3 | Open popup | No notes shown (different URL) |
| 4 | Return to `http://localhost:3000/` | Original note visible |

### TEST-7.4: Delete Note

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note | Note exists |
| 2 | Click delete button (trash icon) on note | Confirmation dialog appears |
| 3 | Click "Cancel" | Dialog closes, note remains |
| 4 | Click delete again, then "Delete" | Note deleted |
| 5 | Refresh page | Note does not reappear |

---

## 8. Authentication (Google Sign-In)

### TEST-8.1: Sign In Flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click extension icon | Popup opens |
| 2 | Click "Sign in with Google" | Google OAuth flow starts |
| 3 | Select Google account | Account selection or direct auth |
| 4 | Grant permissions | Auth completes |
| 5 | Popup updates | Shows user email/name, logout button appears |

### TEST-8.1b: Local Notes Migration on First Login

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure NOT logged in | Logout if necessary |
| 2 | Create 2-3 notes on different pages | Notes stored in local storage |
| 3 | Verify notes exist | Notes visible on respective pages |
| 4 | Sign in with Google | Authentication completes |
| 5 | Check notes on original pages | Notes still visible (now in Firebase) |
| 6 | Open DevTools > Application > Local Storage | `notes` key should be empty or removed |
| 7 | Sign out | User logged out |
| 8 | Check notes on original pages | Notes NOT visible (stored in Firebase, not local) |
| 9 | Sign in again | Notes visible again (loaded from Firebase) |

### TEST-8.2: User Profile Display

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in | Authenticated |
| 2 | View popup | Shows user avatar (if available), display name, email |

### TEST-8.3: Sign Out Flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | While signed in, click extension icon | Popup shows logged-in state |
| 2 | Click "Sign out" button | Sign out process |
| 3 | Popup updates | Returns to logged-out state, login button visible |

### TEST-8.4: Auth State Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in | Authenticated |
| 2 | Close browser completely | Browser closed |
| 3 | Reopen browser, click extension icon | Still signed in (session persisted) |

### TEST-8.5: Mock User Fallback (Development)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Remove Firebase config from `.env` | Firebase unconfigured |
| 2 | Rebuild extension (`npm run build`) | Build completes |
| 3 | Click "Sign in with Google" | Mock user created ("Dev User", <test@example.com>) |

---

## 9. Cloud Sync (Firebase/Firestore)

### TEST-9.1: Notes Sync to Cloud

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in with Google account | Authenticated |
| 2 | Create a note "Cloud sync test" | Note created |
| 3 | Open Firebase Console > Firestore | Firestore dashboard |
| 4 | Navigate to `notes` collection | Note document visible with correct data |

### TEST-9.2: Cross-Device Sync

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in on Device A | Authenticated |
| 2 | Create note "Cross-device test" | Note created |
| 3 | Sign in on Device B (same account) | Authenticated |
| 4 | Navigate to same URL | Note appears (synced from cloud) |

### TEST-9.3: Real-time Updates

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open same page in two browser windows | Both windows showing page |
| 2 | Sign in with same account in both | Authenticated in both |
| 3 | Create note in Window A | Note appears |
| 4 | Observe Window B | Note appears in real-time (no refresh needed) |
| 5 | Edit note in Window B | Changes appear in Window A |

### TEST-9.4: Offline Support

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in and create a note | Note synced |
| 2 | Disable network (DevTools > Network > Offline) | Network disabled |
| 3 | Create another note | Note created (stored locally) |
| 4 | Re-enable network | Network restored |
| 5 | Check Firebase Console | Both notes present (offline note synced) |

---

## 10. Note Sharing & Collaboration

### TEST-10.1: Share Note Modal

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note (signed in) | Note exists |
| 2 | Click share button on note | Share modal appears |
| 3 | Modal shows email input field | Input visible |
| 4 | Modal shows list of currently shared users (if any) | List visible |

### TEST-10.2: Share Note by Email

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open share modal | Modal visible |
| 2 | Enter valid email `collaborator@example.com` | Email entered |
| 3 | Click "Share" button | Email added to shared list |
| 4 | Modal updates | Shows newly added email |
| 5 | Toast notification | "Note shared successfully" appears |

### TEST-10.3: Share Validation - Invalid Email

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open share modal | Modal visible |
| 2 | Enter invalid email "not-an-email" | Invalid email entered |
| 3 | Click "Share" | Error message "Invalid email address" |

### TEST-10.4: Share Validation - Self-Sharing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in as `user@example.com` | Authenticated |
| 2 | Create note, open share modal | Modal visible |
| 3 | Enter own email `user@example.com` | Own email entered |
| 4 | Click "Share" | Error "Cannot share with yourself" |

### TEST-10.5: Share Limit (Max 50)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Share note with 50 different emails | 50 shares added |
| 2 | Attempt to share with 51st email | Error "Maximum shares reached" |

### TEST-10.6: Shared Note Visibility

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User A creates note, shares with User B | Note shared |
| 2 | User B signs in | Authenticated |
| 3 | User B navigates to same URL | Shared note visible |
| 4 | User B can read/comment on note | Full access for collaboration |

### TEST-10.7: Share Requires Login

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note while NOT logged in | Local note created |
| 2 | Click share button | Error/prompt to sign in first |

### TEST-10.8: Auto-Share via Email Detection

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in and create a note | Note exists |
| 2 | Type `colleague@example.com` followed by a space | Email detected |
| 3 | Observe email in note | Email underlined with gray (pending) color |
| 4 | Wait for share to complete | Email underline changes to green (success) |
| 5 | Hover over email | Tooltip shows "Shared with <colleague@example.com>" |

### TEST-10.9: Auto-Share - Failed Share

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in and create a note | Note exists |
| 2 | Type your own email followed by a space | Own email detected |
| 3 | Observe email in note | Email underline changes to red (failed) |
| 4 | Hover over email | Tooltip shows "You cannot share a note with yourself" |

### TEST-10.10: Auto-Unshare on Email Removal

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note with shared email (from TEST-10.8) | Email shared, green underline |
| 2 | Delete the email from the note content | Email removed |
| 3 | Note is automatically unshared | Share revoked in Firestore |
| 4 | User B (if viewing) loses access | Real-time sync removes access |

### TEST-10.11: Auto-Share - Multiple Emails

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note and type `user1@example.com` | First email shared |
| 2 | Type `user2@example.com` | Second email shared |
| 3 | Both emails have green underlines | Both shares successful |
| 4 | Delete one email | Only that share revoked |

### TEST-10.12: Auto-Share - Paste with Emails

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a new note | Note exists |
| 2 | Paste text containing `test@example.com` | Email detected in pasted content |
| 3 | Email is auto-shared | Green underline appears |

### TEST-10.13: Unread Shared Notes Badge

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in as User A | Authenticated |
| 2 | User B shares a note with User A | Note shared |
| 3 | Observe extension icon in toolbar | Blue badge with "1" appears |
| 4 | User A views the shared note | Badge count decreases |
| 5 | All shared notes viewed | Badge disappears |

---

## 11. Comments & Threaded Discussions

### TEST-11.1: Comment Section Toggle

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note (signed in) | Note exists |
| 2 | Find comment toggle/button | Button visible showing comment count |
| 3 | Click to expand | Comments panel opens |
| 4 | Click again | Comments panel collapses |

### TEST-11.2: Add New Comment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Expand comment section | Panel open |
| 2 | Type "This is my comment" in input | Text entered |
| 3 | Click "Post" or press Enter | Comment added |
| 4 | Comment appears in list | Shows avatar, name, timestamp, content |

### TEST-11.3: Comment Count Update

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Note has 0 comments | Shows "0" or "No comments" |
| 2 | Add a comment | Comment added |
| 3 | Toggle shows updated count | Shows "1" |
| 4 | Add another comment | Shows "2" |

### TEST-11.4: Reply to Comment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Reply" on existing comment | Reply input appears |
| 2 | Type reply "I agree!" | Text entered |
| 3 | Submit reply | Reply appears indented under parent |
| 4 | Reply limit: cannot reply to a reply | Reply button not shown on replies (max depth 1) |

### TEST-11.5: Edit Own Comment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find your own comment | Comment visible |
| 2 | Click "Edit" button | Input pre-filled with content |
| 3 | Modify text | Text changed |
| 4 | Save | Comment updated, "Edited" indicator appears |

### TEST-11.6: Delete Own Comment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find your own comment | Comment visible |
| 2 | Click "Delete" button | Confirmation dialog appears |
| 3 | Confirm deletion | Comment removed |
| 4 | If top-level with replies | All replies also deleted |

### TEST-11.7: Note Owner Can Delete Any Comment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User A creates note, User B adds comment | Comment exists |
| 2 | User A views the note | Comment visible |
| 3 | User A clicks delete on User B's comment | Confirmation dialog |
| 4 | Confirm | Comment deleted (owner permission) |

### TEST-11.8: Comment XSS Prevention

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add comment containing `<script>alert('xss')</script>` | Comment submitted |
| 2 | View comment | Script tags rendered as text, not executed |
| 3 | No alert appears | XSS prevented |

### TEST-11.9: Real-time Comment Updates

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User A and User B view same shared note | Both viewing |
| 2 | User A adds comment | Comment submitted |
| 3 | User B's view updates | New comment appears without refresh |

### TEST-11.10: Anonymous User Display

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User with no display name comments | Comment added |
| 2 | View comment | Shows email or "Anonymous" as fallback |

### TEST-11.11: Relative Time Display

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add comment | Shows "just now" |
| 2 | Wait 2 minutes | Shows "2 minutes ago" |
| 3 | Comment from 2 hours ago | Shows "2 hours ago" |
| 4 | Comment from 3 days ago | Shows "3 days ago" |
| 5 | Comment older than 7 days | Shows formatted date |

### TEST-11.12: Login Prompt When Not Signed In

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign out (if signed in) | User logged out |
| 2 | Navigate to page with shared note | Note visible |
| 3 | Expand comments panel | Comments panel opens |
| 4 | Observe comment input area | Shows "Sign in to comment" message instead of input field |
| 5 | Sign in | User authenticated |
| 6 | Observe comment input area | Input field appears, login prompt disappears |

### TEST-11.13: Empty Comment Error Toast

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in and expand comments on a note | Comments panel open |
| 2 | Leave comment input empty or with only whitespace | Input empty |
| 3 | Click submit button or press Enter | Toast notification appears |
| 4 | Toast message | Shows "Comment cannot be empty" error |
| 5 | Input remains focused | User can type and retry |

### TEST-11.14: Comment Submission Error Toast

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in and expand comments on a note | Comments panel open |
| 2 | Disable network (DevTools > Network > Offline) | Network disabled |
| 3 | Type a comment and submit | Submission attempted |
| 4 | Toast notification appears | Shows "Failed to add comment" error |
| 5 | Submit button re-enabled | User can retry when network restored |
| 6 | Comment text preserved | User doesn't lose their typed content |

### TEST-11.15: Comment Delete Error Toast

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in and add a comment | Comment exists |
| 2 | Disable network (DevTools > Network > Offline) | Network disabled |
| 3 | Click delete on your comment | Confirmation dialog appears |
| 4 | Confirm deletion | Deletion attempted |
| 5 | Toast notification appears | Shows "Failed to delete comment" error |
| 6 | Comment remains in list | User can retry when network restored |

### TEST-11.16: Comment Edit Error Toast

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in and add a comment | Comment exists |
| 2 | Click edit on your comment | Edit mode activated |
| 3 | Disable network (DevTools > Network > Offline) | Network disabled |
| 4 | Modify text and submit | Edit attempted |
| 5 | Toast notification appears | Shows "Failed to update comment" error |
| 6 | Edit mode remains active | User can retry when network restored |

---

## 12. Visibility Intelligence (IntersectionObserver)

### TEST-12.1: Note Hidden When Anchor Not Visible

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to long page with scrollable content | Page with scroll |
| 2 | Create note anchored to element at bottom | Note created |
| 3 | Scroll to top of page | Anchor element out of view |
| 4 | Verify note | Note is hidden |
| 5 | Scroll back to anchor | Note becomes visible |

### TEST-12.2: Multiple Notes Visibility

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create notes on 3 elements spread across page | Notes created |
| 2 | Scroll through page | Only notes for visible anchors shown |
| 3 | Each note appears/disappears appropriately | Visibility matches anchor visibility |

### TEST-12.3: Position Updates on Scroll

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note anchored to element | Note positioned |
| 2 | Scroll page slowly | Note maintains position relative to anchor |
| 3 | No jittering or lag | Smooth position updates |

### TEST-12.4: Toggle All Notes Visibility (Hide)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create 2-3 notes on visible elements | Notes visible |
| 2 | Click extension icon | Popup opens |
| 3 | Click Actions dropdown | Menu expands |
| 4 | Click "Hide all notes" | All notes become hidden |
| 5 | Scroll page so anchors move in/out of view | Notes remain hidden (do not reappear) |
| 6 | Button text updates | Shows "Show all notes" |

### TEST-12.5: Toggle All Notes Visibility (Show)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After hiding all notes (TEST-12.4) | Notes hidden |
| 2 | Click Actions dropdown | Menu expands |
| 3 | Click "Show all notes" | Notes with visible anchors reappear |
| 4 | Scroll to other anchors | Notes appear when anchors become visible |
| 5 | Button text updates | Shows "Hide all notes" |

### TEST-12.6: Toggle Visibility with Page-Level Notes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a page-level note (via popup or context menu) | Page-level note visible |
| 2 | Create an element-anchored note | Both notes visible |
| 3 | Click Actions dropdown, then "Hide all notes" | Both notes become hidden |
| 4 | Scroll page | Both notes remain hidden |
| 5 | Click "Show all notes" | Both notes reappear |

### TEST-12.7: Toggle Visibility with Orphaned Notes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note anchored to a dynamic element | Note visible |
| 2 | Navigate or refresh so anchor element is removed | Note becomes orphaned (badge shows count) |
| 3 | Click orphaned note in popup to view it | Orphaned note appears centered on screen |
| 4 | Click "Hide all notes" | Orphaned note becomes hidden |
| 5 | Click "Show all notes" | Orphaned note reappears |

---

## 13. Element Re-anchoring & Fuzzy Matching

### TEST-13.1: Re-anchor UI on Missing Element

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note anchored to element with class `.dynamic-element` | Note created |
| 2 | Modify page DOM (remove or change element's selector attributes) | Element changed |
| 3 | Refresh page | Page reloads |
| 4 | If selector cannot find element | Re-anchor notification appears |
| 5 | Notification shows "Element not found. Would you like to re-attach?" | Clear message |

### TEST-13.2: Re-anchor to New Element

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | See re-anchor notification | Notification visible |
| 2 | Click "Re-attach" | Selection mode activates |
| 3 | Select new element | Note re-anchored |
| 4 | Note appears at new element | Position updated |

### TEST-13.3: Dismiss Re-anchor Notification

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | See re-anchor notification | Notification visible |
| 2 | Click "Dismiss" or close | Notification closes |
| 3 | Note remains orphaned | Can still view note content |

### TEST-13.4: Fuzzy Matching - Class Change

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note on element with classes `card item-1` | Note anchored |
| 2 | Change element's class to `card item-updated` | Minor class change |
| 3 | Refresh page | Page reloads |
| 4 | Fuzzy matching finds element | Note anchors correctly (high confidence) |

### TEST-13.5: Smart Selector Priority

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note on element with `data-testid="card-1"` | Note anchored |
| 2 | Check generated selector | Uses `[data-testid="card-1"]` (stable) |
| 3 | Create note on element with `id="ember123"` (dynamic) | Note anchored |
| 4 | Check generated selector | Avoids dynamic ID, uses class/path instead |

---

## 14. Advanced Features (Copy, Screenshot, Metadata)

### TEST-14.1: Copy as Markdown

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note with content "Bug: Button not working" | Note exists |
| 2 | Click "Copy as Markdown" button | Action triggered |
| 3 | Paste in text editor | Formatted markdown with: |
| | | - Title "## Bug Report" |
| | | - Description (note content) |
| | | - Environment (URL, browser, viewport) |
| | | - Element Reference (CSS selector) |
| | | - Steps to Reproduce template |
| 4 | Toast notification | "Copied to clipboard" appears |

### TEST-14.2: Copy Screenshot

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note on page | Note exists |
| 2 | Click "Copy Screenshot" button | Screenshot capture triggered |
| 3 | Toast notification | "Screenshot copied" appears |
| 4 | Paste in image app/editor | Screenshot of visible tab copied |

### TEST-14.3: Metadata Display

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note | Note exists |
| 2 | Expand metadata/info section (if collapsed) | Metadata visible |
| 3 | Verify URL | Shows current page URL |
| 4 | Verify browser | Shows "Chrome [version]" |
| 5 | Verify viewport | Shows dimensions (e.g., "1920x1080") |
| 6 | Verify element | Shows CSS selector for anchored element |
| 7 | Verify owner | Shows owner email (or "Anonymous" if not logged in) |
| 8 | Verify owner UID | Shows Firebase UID (or "N/A" if not available) |
| 9 | Verify note ID | Shows the note's unique identifier |
| 10 | Verify timestamp | Shows creation time (relative, e.g., "2 hours ago") |

### TEST-14.4: Metadata Copy Buttons

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note and expand metadata panel | Metadata visible |
| 2 | Hover over any metadata row | Copy icon appears on the right |
| 3 | Click copy icon next to URL | "Copied to clipboard" toast appears |
| 4 | Paste in text editor | Full URL copied (not truncated) |
| 5 | Repeat for Browser | Browser string copied |
| 6 | Repeat for Viewport | Viewport dimensions copied |
| 7 | Repeat for Element | Full CSS selector copied (not truncated) |
| 8 | Repeat for Owner | Owner email copied |
| 9 | Repeat for Owner UID | Firebase UID copied |
| 10 | Repeat for Note ID | Note ID copied |

### TEST-14.5: Metadata Copy - Edge Cases

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note without being logged in | Note exists |
| 2 | Expand metadata, click copy on Owner | Empty string copied (or graceful handling) |
| 3 | Click copy on Owner UID | Empty string copied (or graceful handling) |
| 4 | Create note with very long URL | URL truncated in display |
| 5 | Click copy on URL | Full URL copied (not truncated version) |
| 6 | Create note with complex CSS selector | Selector truncated in display |
| 7 | Click copy on Element | Full selector copied (not truncated version) |

### TEST-14.6: Copy Selector and Metadata in an Iframe

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a note anchored to an element inside an iframe | Note exists inside iframe |
| 2 | Click "Copy as Markdown" | Markdown is copied successfully |
| 3 | Expand metadata panel and copy "Element" selector | Selector is copied successfully |
| 4 | Observe DevTools console | No Permissions Policy clipboard violation noise is emitted from these actions |

---

## 15. Internationalization (i18n)

### TEST-15.1: Default Language (English)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Chrome language to English | Language set |
| 2 | Click extension icon | Popup opens |
| 3 | Verify text | All UI in English |
| | | - "Sticky Notes" |
| | | - "Sign in with Google" |
| | | - "Add Note" |
| | | - "Notes on this page" |

### TEST-15.2: French Translation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Chrome language to French | Language set |
| 2 | Restart Chrome | Changes applied |
| 3 | Click extension icon | UI in French |
| | | - "Notes Adhesives" |
| | | - "Se connecter avec Google" |
| | | - "Ajouter une note" |

### TEST-15.3: German Translation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Chrome language to German | Language set |
| 2 | Restart Chrome | Changes applied |
| 3 | Click extension icon | UI in German |
| | | - "Haftnotizen" |
| | | - "Mit Google anmelden" |
| | | - "Notiz hinzufugen" |

### TEST-15.4: Hebrew Translation (RTL)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Chrome language to Hebrew | Language set |
| 2 | Restart Chrome | Changes applied |
| 3 | Click extension icon | UI in Hebrew |
| 4 | Text direction | Right-to-left layout (if supported) |

### TEST-15.5: Fallback for Missing Translations

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Chrome to unsupported language | Language set |
| 2 | Click extension icon | Defaults to English |

---

## 16. Restricted URLs & Edge Cases

### TEST-16.1: Chrome Internal Pages

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `chrome://settings` | Settings page opens |
| 2 | Click extension icon | Popup shows disabled state |
| 3 | Right-click for context menu | Context menu item disabled or not present |
| 4 | Message | "Cannot create notes on this page" |

### TEST-16.2: Chrome Extension Pages

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `chrome-extension://[any-id]/popup.html` | Extension page |
| 2 | Try to create note | Disabled - restricted URL |

### TEST-16.3: About Pages

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `about:blank` | Blank page |
| 2 | Try to create note | Disabled - restricted URL |

### TEST-16.4: Data URLs

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `data:text/html,<h1>Test</h1>` | Data URL page |
| 2 | Try to create note | Disabled - restricted URL |

### TEST-16.5: Extension Context Invalidated

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to webpage with notes | Notes visible |
| 2 | Go to `chrome://extensions`, click "Reload" on extension | Extension reloaded |
| 3 | Return to webpage | Refresh notification appears |
| 4 | Message | "Extension Updated. Please refresh." |
| 5 | Click refresh | Page reloads, notes work again |

### TEST-16.6: SPA URL Changes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to SPA (e.g., React app) | App loads |
| 2 | Create note | Note anchored |
| 3 | Navigate within SPA (URL changes via history API) | URL changes without full reload |
| 4 | Extension detects URL change | Loads notes for new URL |
| 5 | Return to original route | Original note appears |

### TEST-16.7: Tab Lifecycle

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note on page with real-time sync | Subscription active |
| 2 | Close tab | Tab closed |
| 3 | Check background service worker | Subscription cleaned up (no memory leak) |

---

## 17. Performance Benchmarks

### Recommended Limits

| Metric | Recommended Limit | Rationale |
|--------|------------------|-----------|
| Notes per page | 50 | UI clutter, Firestore listener stress |
| Note content length | 10,000 chars | Reasonable for bug reports/annotations |
| Comments per note | 100 | Reasonable for threaded discussions |
| Shares per note | 50 | Already enforced (MAX_SHARES) |
| Selection mode timeout | 30 seconds | Auto-cancel if user doesn't select |

### TEST-17.1: Multiple Notes Performance

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create 20 notes on a single page | Notes created |
| 2 | Scroll through page | Smooth scrolling, no lag |
| 3 | All notes visible when anchors visible | Visibility works correctly |
| 4 | Create 50 notes on a single page | Notes created |
| 5 | Extension remains responsive | No freezing or significant slowdown |

### TEST-17.2: Large Note Content

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note | Note exists |
| 2 | Paste 5,000 characters of text | Text entered |
| 3 | Note saves successfully | No errors |
| 4 | Refresh page | Note loads with full content |

### TEST-17.3: Many Comments

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create note and add 50 comments | Comments created |
| 2 | Scroll through comment list | Smooth scrolling |
| 3 | Add/edit comments | Responsive interactions |

### TEST-17.4: Rapid Actions

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Quickly create and delete 10 notes | Actions performed |
| 2 | Verify no orphaned data | All notes properly created/deleted |
| 3 | No console errors | Clean execution |

---

## 18. Basic Accessibility Testing

### Current Implementation

The extension has partial accessibility support:

- `aria-modal`, `aria-labelledby` on confirmation dialogs
- `aria-label` on interactive buttons
- Focus trapping in modal dialogs
- Keyboard shortcuts (Escape to cancel/close)
- Focus management when dialogs open

### TEST-18.1: Keyboard Navigation - Note Creation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter selection mode via popup | Mode active |
| 2 | Press ESC | Selection mode cancelled |
| 3 | Create note via context menu | Note created |

### TEST-18.2: Keyboard Navigation - Note Interaction

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click into note editor | Editor focused |
| 2 | Use Ctrl+B / Cmd+B | Bold formatting applied |
| 3 | Use Ctrl+I / Cmd+I | Italic formatting applied |
| 4 | Press ESC when note focused | Focus released |

### TEST-18.3: Dialog Keyboard Navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click delete button on note | Confirmation dialog opens |
| 2 | Press Tab | Focus moves between Cancel and Delete buttons |
| 3 | Press Shift+Tab | Focus moves backwards |
| 4 | Press ESC | Dialog closes, action cancelled |
| 5 | Press Enter on focused button | Button action executes |

### TEST-18.4: Focus Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open confirmation dialog | Confirm button focused |
| 2 | Close dialog | Focus returns to triggering element |
| 3 | Open share modal | Email input focused |

### TEST-18.5: Focus Visibility

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab through popup elements | Focus indicator visible on each element |
| 2 | Tab through note controls | Focus indicator visible |
| 3 | Focus indicator meets contrast requirements | Clearly visible against background |

---

## 19. Marketing Site Verification

### TEST-19.1: Feature Claims vs. Implementation

| Claimed Feature | Location | Verification |
|-----------------|----------|--------------|
| Element Anchoring | index.html | Notes attach to DOM elements |
| Visibility Intelligence | index.html | IntersectionObserver implementation |
| Team Collaboration | index.html | Note sharing works |
| Responsive Aware | index.html | Window resize handling |
| Private by Default | index.html | Local storage without login |
| Instant Sync | index.html | Real-time Firestore sync |
| Works on SPAs | index.html | URL change detection |
| Re-anchoring | index.html | Fuzzy matching & re-anchor UI |
| Rich Text Editor | README | Bold, italic, lists, links |
| Color Themes | README | Yellow, blue, green, pink |
| Copy as Markdown | README | Bug report generation |
| Screenshot | README | Tab capture to clipboard |

### TEST-19.2: Marketing Site Functionality

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open marketing site (`site/`) | Site loads |
| 2 | Test theme toggle (light/dark) | Theme switches |
| 3 | Test mobile menu | Menu opens/closes |
| 4 | Test smooth scroll links | Scrolls to sections |
| 5 | Test interactive demo | Demo creates/deletes notes |
| 6 | Verify all links work | Privacy, Terms, Contact pages load |

---

## 20. Settings/Preferences Page

### 20.1 Access Settings

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click extension popup | Popup opens |
| 2 | Click three-dot menu (actions) | Actions dropdown appears |
| 3 | Click "Settings" | Settings page opens in new tab |

### 20.2 Theme Setting

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open settings page | Current default theme (yellow) is selected |
| 2 | Click a different theme (e.g., Blue) | Theme button becomes selected |
| 3 | Click "Save Settings" | Success message shown |
| 4 | Create a new note on any page | Note uses the new default theme |

### 20.3 Position Setting

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open settings page | Current default position (top-right) is selected |
| 2 | Click a different position (e.g., bottom-left) | Position button becomes selected |
| 3 | Click "Save Settings" | Success message shown |
| 4 | Create a new note on any page | Note appears at bottom-left of element |

### 20.4 Note Width Setting

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open settings page | 280px (Default) is selected in dropdown |
| 2 | Select a different width (e.g., 360px Extra Wide) | Selection changes |
| 3 | Click "Save Settings" | Success message shown |
| 4 | Create a new note | Note is wider (360px) |

### 20.5 Font Size Setting

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open settings page | Medium (14px) is selected in dropdown |
| 2 | Select a different size (e.g., Large 16px) | Selection changes |
| 3 | Click "Save Settings" | Success message shown |
| 4 | Create a new note and type text | Text appears larger |

### 20.6 Visibility Default Setting

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open settings page | Toggle is ON (checked) |
| 2 | Turn toggle OFF | Toggle visual state changes |
| 3 | Click "Save Settings" | Success message shown |

### 20.7 Reset to Defaults

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change several settings from defaults | Multiple settings modified |
| 2 | Click "Reset to Defaults" | Confirmation dialog appears |
| 3 | Confirm reset | All settings return to default values |
| 4 | Click "Save Settings" | Settings saved with defaults |

### 20.8 Settings Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change and save settings | Success message shown |
| 2 | Close settings tab | Tab closes |
| 3 | Reopen settings page | Previously saved settings are loaded |
| 4 | Settings persist across browser restart | Same settings loaded after restart |

---

## 21. Bug Tracking Workflow

### Process

1. **During Testing:** Document bugs in testing notes with steps to reproduce
2. **After Test Run:** Add confirmed bugs to `docs/ROADMAP.md` in the Known Bugs section
3. **Severity Classification:**
   - **Critical:** Blocks core functionality, data loss, security issues
   - **Major:** Significant feature broken, poor user experience
   - **Minor:** Cosmetic issues, edge cases, low-impact bugs
4. **Format:** `- [] [Severity] Description (steps to reproduce if complex)`
5. **When Fixed:** Change `[]` to `[x]` and optionally add fix date/PR

### Bug Report Template

```markdown
### [Severity]
- [] Brief description
  - Steps: Navigate to X, click Y, observe Z
  - Expected: A
  - Actual: B
  - Browser: Chrome [version]
```

### Example

```markdown
## Known Bugs

### Critical
- [] None currently

### Major
- [] Note position relative to element isn't always working correctly
  - Steps: Create note on element near page edge
  - Expected: Note visible within viewport
  - Actual: Note appears off-screen

### Minor
- [] Yellow button color doesn't contrast well with Chrome logo
```

---

## 22. Test Completion Checklist

### Pre-Testing

- [ ] Extension built successfully (`npm run build`)
- [ ] Extension loaded in Chrome (Developer mode)
- [ ] Test page accessible (`npx serve tests/fixtures -l 3000`)
- [ ] Firebase configured (for cloud features)
- [ ] Multiple Google accounts available (for collaboration testing)

### Test Suites

- [ ] 2. Extension Installation & Basic Functionality
- [ ] 3. Popup UI Testing
- [ ] 4. Element Selection & Note Creation
- [ ] 5. Note Editing & Rich Text Editor
- [ ] 6. Note Theming & Positioning
- [ ] 7. Note Persistence (Local Storage)
- [ ] 8. Authentication (Google Sign-In)
- [ ] 9. Cloud Sync (Firebase/Firestore)
- [ ] 10. Note Sharing & Collaboration
- [ ] 11. Comments & Threaded Discussions
- [ ] 12. Visibility Intelligence
- [ ] 13. Element Re-anchoring & Fuzzy Matching
- [ ] 14. Advanced Features
- [ ] 15. Internationalization (i18n)
- [ ] 16. Restricted URLs & Edge Cases
- [ ] 17. Performance Benchmarks
- [ ] 18. Basic Accessibility Testing
- [ ] 19. Marketing Site Verification
- [ ] 20. Settings/Preferences Page

### Post-Testing

- [ ] All critical paths verified
- [ ] Known issues documented in `docs/ROADMAP.md`
- [ ] New bugs added with severity classification
- [ ] Marketing claims verified against implementation
- [ ] Test results documented
