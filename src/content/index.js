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
      setupDeferredIframeInit({ initFn: initStickyNotes });
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

// Only auto-initialize in non-test environment
if (typeof globalThis.__JEST__ === 'undefined') {
  if (document.readyState === 'loading') {
    log.debug(' Document still loading, adding DOMContentLoaded listener');
    document.addEventListener('DOMContentLoaded', initStickyNotes);
  } else {
    log.debug(' Document ready, initializing immediately');
    initStickyNotes();
  }
}

// Export for testing
export { shouldInitialize };
export { setupDeferredIframeInit };

/**
 * If this iframe is temporarily 0x0 at load time, defer init until it has a real size.
 * This fixes cases where the "real" iframe content is created/resized after initial load.
 * Exported for unit testing.
 * @param {Object} options
 * @param {number} [options.minSize=50]
 * @param {Function} options.initFn
 * @returns {{deferred: boolean}}
 */
function setupDeferredIframeInit({ minSize = 50, initFn } = {}) {
  try {
    const url = window.location.href;
    const isTopFrame = window.self === window.top;
    const isPersistentUrl = !(url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:'));
    const isTemporarilyTinyIframe =
      !isTopFrame && isPersistentUrl && (window.innerWidth < minSize || window.innerHeight < minSize);

    if (!isTemporarilyTinyIframe) return { deferred: false };
    if (window.__stickyNotesDeferredInit) return { deferred: true };

    window.__stickyNotesDeferredInit = true;

    let resizeObserver = null;
    const tryInit = () => {
      if (window.__stickyNotesInitialized) return true;
      if (window.innerWidth >= minSize && window.innerHeight >= minSize) {
        if (typeof initFn === 'function') initFn();
        return true;
      }
      return false;
    };

    const cleanup = () => {
      window.removeEventListener('resize', onResize);
      if (resizeObserver) resizeObserver.disconnect();
      window.__stickyNotesDeferredInit = false;
    };

    const onResize = () => {
      if (tryInit()) cleanup();
    };

    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(document.documentElement);
    }

    // Attempt once in case size is already updated.
    onResize();

    return { deferred: true };
  } catch {
    return { deferred: false };
  }
}
