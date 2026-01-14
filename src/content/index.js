/**
 * Content Script Entry Point
 * Initializes the sticky notes overlay on web pages
 * Runs in all frames (main page and iframes) via manifest all_frames: true
 */

import { StickyNotesApp } from './app/StickyNotesApp.js';
import { contentLogger as log } from '../shared/logger.js';

/**
 * Check if the content script should initialize in this frame
 * Skips non-persistent URLs and tiny iframes (likely ads/trackers)
 * @returns {boolean} True if should initialize
 */
function shouldInitialize() {
  const url = window.location.href;
  
  // Skip non-persistent URL schemes that can't store notes reliably
  if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) {
    log.debug(' Skipping initialization for non-persistent URL:', url.substring(0, 50));
    return false;
  }
  
  // For iframes, skip very small frames (likely tracking pixels or ads)
  if (window.self !== window.top) {
    const minSize = 50;
    if (window.innerWidth < minSize || window.innerHeight < minSize) {
      log.debug(' Skipping initialization for tiny iframe:', window.innerWidth, 'x', window.innerHeight);
      return false;
    }
  }
  
  return true;
}

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
    
    // Check if we should initialize in this frame
    if (!shouldInitialize()) {
      return;
    }
    
    window.__stickyNotesInitialized = true;
    
    const isTopFrame = window.self === window.top;
    log.debug(' Creating StickyNotesApp instance...', isTopFrame ? '(main frame)' : '(iframe)');
    
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

// Export for testing
export { shouldInitialize };
