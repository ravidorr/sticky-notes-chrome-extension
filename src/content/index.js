/**
 * Content Script Entry Point
 * Initializes the sticky notes overlay on web pages
 */

import { StickyNotesApp } from './app/StickyNotesApp.js';
import { contentLogger as log } from '../shared/logger.js';

/**
 * Initialize the app when the document is ready
 */
function initStickyNotes() {
  log.debug(' initStickyNotes called, readyState:', document.readyState);
  try {
    // Check if already initialized (for manual injection)
    if (window.__stickyNotesInitialized) {
      log.debug(' Already initialized, skipping');
      return;
    }
    window.__stickyNotesInitialized = true;
    log.debug(' Creating StickyNotesApp instance...');
    
    new StickyNotesApp();
  } catch (error) {
    log.error(' Failed to initialize:', error);
  }
}

log.debug(' Content script loaded, readyState:', document.readyState);

if (document.readyState === 'loading') {
  log.debug(' Document still loading, adding DOMContentLoaded listener');
  document.addEventListener('DOMContentLoaded', initStickyNotes);
} else {
  log.debug(' Document ready, initializing immediately');
  initStickyNotes();
}
