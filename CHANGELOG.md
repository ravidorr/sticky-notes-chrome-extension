# Changelog

All notable changes to the Element-Anchored Sticky Notes Chrome Extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
