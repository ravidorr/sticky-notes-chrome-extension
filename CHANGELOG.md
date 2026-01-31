# Changelog

All notable changes to the Element-Anchored Sticky Notes Chrome Extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.18.0] - 2026-01-31

### Added

- **RichEditor Enhancements**: New text formatting options in the note editor
  - Strikethrough formatting (toolbar button + `Ctrl+Shift+S`)
  - Code/monospace formatting (toolbar button + `Ctrl+\``)
  - Blockquote formatting (toolbar button + `Ctrl+Shift+Q`)
  - Interactive checkboxes for task lists (toolbar button)
  - All new formats preserved during paste operations

## [1.17.0] - 2026-01-31

### Added

- **Auto Position**: Smart positioning that automatically chooses the best location based on available viewport space around the anchor element
  - Analyzes space in all directions (top, bottom, left, right) to find optimal placement
  - Recalculates position on window resize
  - Available in both Settings page and per-note position picker
  - Visually distinct option with blue gradient styling in Settings

## [1.16.0] - 2026-01-31

### Added

- Extended note position options from 4 to 8 positions:
  - Corner positions: top-left, top-right, bottom-left, bottom-right
  - Edge positions: top-center, bottom-center, center-left, center-right
  - Updated Settings page with 3x3 position picker grid
  - Position picker in note header now shows all 8 options

## [1.15.0] - 2026-01-31

### Added

- WCAG 2.1 AA accessibility compliance for extension UI:
  - Skip link for keyboard navigation in popup (bypasses header to main content)
  - Comprehensive ARIA roles and labels (tablist, radiogroup, dialog, status, toolbar)
  - Keyboard arrow navigation for tab panels and radio groups
  - Visible focus indicators on all interactive elements
  - Color contrast improvements (4.6:1 ratio for secondary text)
  - `prefers-reduced-motion` support across all CSS (popup, options, content scripts)
  - `aria-hidden="true"` on decorative SVGs and icons
  - `role="status"` for live status messages
  - Semantic HTML structure with header, main, footer landmarks
- Automated accessibility testing with jest-axe (unit) and @axe-core/playwright (E2E)
- Delete Old Notes feature - bulk delete notes older than a specified age threshold
  - Access via popup menu > Actions dropdown > "Delete old notes"
  - Preset age options: 7 days, 30 days, 90 days, 1 year
  - Custom days input for flexible filtering
  - Preview list showing affected notes before deletion
  - Confirmation dialog to prevent accidental deletion
- Keyboard shortcuts for visibility controls:
  - `Ctrl+Shift+H` (or `MacCtrl+Shift+H` on Mac) - Toggle all notes visibility on the current page
  - `Ctrl+H` / `Cmd+H` - Toggle focused note visibility (when a note has focus)
- New manifest command `toggle-all-notes` registered as browser-level keyboard shortcut
- i18n support for the new command description (`commandToggleAllNotes`) in all supported languages

### Improved

- Settings page title changed from "Settings" to "Sticky Settings" for better branding consistency
- Theme picker in Settings now shows color-matched border and background when a theme is selected (yellow shows yellow highlight, blue shows blue highlight, etc.)

### Fixed

- `Ctrl+H`/`Cmd+H` keyboard shortcut now works when the note editor has focus. Previously, the RichEditor component blocked all keyboard events from bubbling up, which prevented the visibility toggle shortcut from reaching the StickyNote handler when users were typing in the editor.

## [1.12.0] - 2026-01-31

### Added

- Settings/Preferences page - configure default settings for new notes
  - Access via popup menu > Settings (gear icon in actions dropdown)
  - Default theme selection (yellow, blue, green, pink)
  - Default position preference (top-left, top-right, bottom-left, bottom-right)
  - Note width setting (240px, 280px, 320px, 360px)
  - Font size setting (small 12px, medium 14px, large 16px)
  - Notes visible by default toggle
  - Reset to defaults option
  - Settings sync across devices via chrome.storage.sync
- New shared module `src/shared/preferences.js` for centralized preferences management
- CSS custom properties for configurable note dimensions (`--sn-note-width`, `--sn-font-size`)

### Fixed

- "Notes visible by default" preference now actually controls initial visibility when visiting pages with existing notes. Previously, the setting was stored but never applied during page load.
- Note width dropdown options in Settings page now properly use i18n for translations. Previously, labels like "Compact", "Default", "Wide", "Extra Wide" were hardcoded in English.

### Improved

- Comment error feedback - users now see toast notifications when comment operations fail
  - Toast shown when submitting empty comment
  - Toast shown when submitting comment without being logged in
  - Toast shown when comment submission fails (network error)
  - Toast shown when comment edit fails
  - Toast shown when comment deletion fails
- Login prompt in comment section - "Sign in to comment" message shown instead of hiding the input field when user is not logged in
- Added `signInToComment` i18n message to all supported languages (en, de, fr, he)

## [1.11.0] - 2026-01-30

### Added

- Per-note visibility controls - hide or show individual notes independently of the global visibility toggle
- Hide/show button in each note's header (eye icon)
- Visibility toggle in popup note list for each note
- Hidden notes persist their visibility state across page refreshes
- Hidden notes remain hidden even when "Show All Notes" is triggered
- Visual indicator in popup for hidden notes (dimmed appearance with strikethrough)
- Dashboard discoverability improvements:
  - More prominent dashboard link in popup header (blue button style)
  - "Open Notes Dashboard" option in right-click context menu
  - Keyboard shortcut Alt+Shift+D to open dashboard
  - Welcome page shown on first install with feature highlights and dashboard link

### Changed

- Updated Notes data model to include `isHidden` property
- VisibilityManager now respects per-note `isHidden` state when showing notes
- Global "Show All Notes" no longer overrides individually hidden notes

## [1.9.0] - 2026-01-30

### Added

- Email notifications when sharing notes - recipients receive an email with note preview, page link, and extension install link
- Firestore trigger (`onNoteShared`) that detects when notes are shared and queues notification emails
- Email module (`functions/lib/email.js`) with HTML and plain text email templates
- Firebase Trigger Email extension integration for email delivery

### Changed

- Added `mail` collection rules to Firestore security rules
- Added ESLint configuration for Firebase Functions directory
- Updated Firebase setup documentation with email extension installation guide

### Fixed

- Comments API now correctly allows users with shared access to read and create comments (previously only note owners could comment via API)

## [1.8.0] - 2026-01-30

### Added

- Page-level notes - create notes attached to the page itself (not a specific element) via "Page Note" button in popup or "Create Page Note" context menu option
- Page-level notes use absolute page positioning and scroll with page content
- Page-level notes are always visible (not tied to anchor element visibility)
- Page-level notes start minimized by default when loaded

### Changed

- Updated documentation (README, API docs, Manual Testing Plan, Roadmap) for page-level notes feature

### Fixed

- "Hide all notes" now correctly hides page-level notes and orphaned notes (notes without anchors were previously not affected by the visibility toggle)

## [1.7.0] - 2026-01-30

### Added

- Toggle visibility for all notes from popup menu - quickly show or hide all sticky notes on the current page via the actions dropdown

### Fixed

- Hidden notes no longer reappear when scrolling - the VisibilityManager now respects the global visibility state set by the toggle feature

## [1.6.5] - 2026-01-30

### Added

- Anchor element highlighting on note hover - hovering over a sticky note now highlights its anchored DOM element with a blue outline

## [1.6.4] - 2026-01-30

### Added

- Dashboard link in popup header for quick access to notes management

### Changed

- Centralized version management to package.json (single source of truth)
- Improved test coverage with thresholds raised to 85%/75%
- Added markdown linter with em dash and emoji rules

## [1.6.0] - 2026-01-18

### Added

- Shared notes feature with tabbed interface in popup ("This Page" and "Shared" tabs)
- Unread shared notes badge on extension icon showing count of new shared notes
- Auto-share via email detection in note content (type email + space to share)
- Visual feedback for share status (green underline for success, red for failed)
- Auto-unshare when email is removed from note content
- FAQ accordion on landing page
- Broadcast functionality for disabling selection mode across all frames

### Changed

- Enhanced RichEditor email handling and validation
- Refactored note item layout in popup CSS

## [1.5.0] - 2026-01-18

### Added

- Microsoft Edge browser support
- Edge-specific build process and manifest
- Edge OAuth authentication flow

### Changed

- Enhanced dashboard functionality and UI
- Improved build scripts for cross-browser compatibility

## [1.4.0] - 2026-01-17

### Added

- Environment detection and metadata display (local/development/staging/production)
- Console error capture and display in notes
- Page context script for capturing console errors
- Export and delete functionality for notes (bulk operations)
- Firefox extension port plan documentation
- Detailed Notes Data Model in ROADMAP

### Changed

- Enhanced note management features
- Improved error buffering and handling in page context script
- Refactored keydown event handling in popup dialog

## [1.3.0] - 2026-01-16

### Added

- Lighthouse CI setup for performance monitoring
- Critical CSS loading and async stylesheet handling
- Self-hosted fonts for improved performance

### Changed

- Major CSS refactoring and restructuring
- Enhanced site build process and performance
- Improved accessibility in dashboard
- Refactored dashboard and generate-key scripts
- Enhanced accessibility and styling for theme toggle and demo buttons

### Fixed

- Font path handling in bundled CSS for GitHub Pages compatibility
- Lighthouse accessibility and performance issues

## [1.2.0] - 2026-01-15

### Added

- Sticky Notes Dashboard for managing all notes
- Interactive demo styles on landing page
- Filtering and statistics features for notes API
- Comments functionality in notes panel
- Domain filtering options in notes panel

### Changed

- Enhanced iframe support with composite URL keys
- Refactored NoteManager and StickyNotesApp for improved note handling
- Enhanced note subscription handling for multiple frames
- Updated ROADMAP to reflect completion of MVP and phases

### Fixed

- Flaky test for top frame detection in CI
- Reverted CSS to single-file structure to fix styling issues

## [1.1.1] - 2026-01-12

### Changed

- Updated build process to include archiving and adjust output directory
- Conditionally create zip file based on environment
- Added extension key to manifest for consistent extension ID

## [1.1.0] - 2026-01-12

### Added

- Note minimizing feature (collapse notes to header only)
- Enhanced note metadata display (URL, browser, viewport, element selector)
- Copy buttons for each metadata field
- Note ID display in metadata panel
- Owner email and UID display in metadata
- Session tracking for newly created notes
- Automatic migration of local notes to Firebase on user login

### Changed

- Enhanced StickyNote component with improved minimized state styling
- Refined positioning logic to follow anchor element directly
- Enhanced formatRelativeTime to support serialized Firestore Timestamps

### Fixed

- Context validation for chrome.runtime in StickyNotesApp and StickyNote components

## [1.0.0] - 2026-01-09

### Added

- Comments feature for sticky notes with threaded discussions
- ConfirmDialog component for user confirmation actions
- Right-click context menu for quick note creation ("Create Sticky Note Here")
- Note sharing by email
- Toast notifications for error handling in popup
- Z-index management with bringToFront method
- Position picker with visual icons (top-left, top-right, bottom-left, bottom-right)

### Changed

- Enhanced Add Note button behavior and UI for restricted pages
- Improved SVG icon representation and position calculations
- Updated Firestore security rules for note sharing

## [0.9.0] - 2026-01-08

### Added

- Internationalization (i18n) support for English, French, German, and Hebrew
- SVG icons for position selection
- HTMLHint and Stylelint configurations for code quality

### Changed

- Enhanced Firebase configuration to support service worker context
- Revised pricing model in ROADMAP
- Updated site structure and build process

## [0.8.0] - 2026-01-08

### Added

- Landing page with marketing content
- Close button to popup
- GitHub Actions workflow for site deployment
- Test coverage reporting

### Changed

- Refactored build process
- Enhanced ESLint configuration
- Improved code quality across components

## [0.7.0] - 2026-01-07

### Added

- ESLint configuration with pre-commit hooks (Husky)
- Roadmap documentation outlining target audience, pain points, and development phases
- Firebase setup guide with step-by-step instructions
- Tests for VisibilityManager refresh and event handling

### Changed

- Refactored Firebase configuration to use environment variables
- Enhanced logging and error handling in background and Firestore operations
- Improved popup to retrieve notes from background script instead of local storage
- Refactored background and popup scripts for improved modularity and testability

### Security

- Environment variables for Firebase credentials

## [0.6.0] - 2026-01-07

### Added

- Context invalidation handling with user-friendly notifications
- RichEditor keyboard event isolation (prevents page shortcuts from interfering)

### Changed

- Simplified tooltip display in SelectionOverlay
- Enhanced popup functionality with HTML stripping for note content

## [0.5.0] - 2026-01-06

### Added

- Initial implementation of the Sticky Notes Chrome extension
- Element selection mode for anchoring notes to DOM elements
- Smart CSS selector generation with semantic attributes
- Visibility intelligence using IntersectionObserver
- Rich text editor with bold, italic, lists, and links
- Color themes (yellow, blue, green, pink)
- Draggable notes with position memory
- Local storage persistence
- Shadow DOM isolation for style conflicts
- Firebase integration for cloud storage
- Google Authentication
- Jest and Playwright testing setup

### Changed

- Updated icons and popup styles for visual consistency

[1.7.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.6.5...v1.7.0
[1.6.5]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.6.4...v1.6.5
[1.6.4]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.6.0...v1.6.4
[1.6.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ravidorr/sticky-notes-chrome-extension/releases/tag/v0.5.0
