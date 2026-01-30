/**
 * VisibilityManager
 * Manages IntersectionObserver for note visibility based on anchor elements
 */

export class VisibilityManager {
  /**
   * Create visibility manager
   * @param {Object} options - Options
   * @param {number} options.threshold - Visibility threshold (0-1)
   * @param {string} options.rootMargin - Root margin for observer
   */
  constructor(options = {}) {
    this.threshold = options.threshold || 0.5;
    this.rootMargin = options.rootMargin || '0px';
    
    // Map of anchor elements to notes
    this.anchorToNote = new Map();
    
    // Map of notes to their visibility callbacks
    this.noteCallbacks = new Map();
    
    // Store bound event handlers for cleanup
    this.boundScrollHandler = null;
    this.boundResizeHandler = null;
    
    // Global visibility state - when false, notes are hidden regardless of anchor visibility
    this.globallyVisible = true;
    
    // Create the IntersectionObserver
    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      {
        root: null, // viewport
        rootMargin: this.rootMargin,
        threshold: this.threshold
      }
    );
    
    // Also listen to scroll and resize for position updates
    this.setupScrollListener();
  }
  
  /**
   * Observe an anchor element for a note
   * @param {Element} anchor - Anchor element
   * @param {Object} note - Note instance with show/hide/updatePosition methods
   */
  observe(anchor, note) {
    if (!anchor || !note) return;
    
    // Store the mapping
    this.anchorToNote.set(anchor, note);
    
    // Start observing
    this.observer.observe(anchor);
  }
  
  /**
   * Stop observing an anchor element
   * @param {Element} anchor - Anchor element
   */
  unobserve(anchor) {
    if (!anchor) return;
    
    // Get the note and hide it
    const note = this.anchorToNote.get(anchor);
    if (note) {
      note.hide();
    }
    
    // Remove from map
    this.anchorToNote.delete(anchor);
    
    // Stop observing
    this.observer.unobserve(anchor);
  }
  
  /**
   * Handle intersection changes
   * @param {IntersectionObserverEntry[]} entries - Observer entries
   */
  handleIntersection(entries) {
    entries.forEach(entry => {
      const note = this.anchorToNote.get(entry.target);
      
      if (!note) return;
      
      if (entry.isIntersecting) {
        // Only show note if global visibility is enabled AND note is not individually hidden
        if (this.globallyVisible && !note.isHidden) {
          note.show();
        }
      } else {
        // Anchor is not visible, hide note
        note.hide();
      }
    });
  }
  
  /**
   * Setup scroll listener for position updates
   */
  setupScrollListener() {
    let ticking = false;
    
    const updatePositions = () => {
      this.anchorToNote.forEach((note, _anchor) => {
        if (note.isVisible) {
          note.updatePosition();
        }
      });
      ticking = false;
    };
    
    // Store bound scroll handler for cleanup
    this.boundScrollHandler = () => {
      if (!ticking) {
        requestAnimationFrame(updatePositions);
        ticking = true;
      }
    };
    
    // Store bound resize handler for cleanup
    this.boundResizeHandler = () => {
      this.anchorToNote.forEach((note, _anchor) => {
        if (note.isVisible) {
          note.updatePosition();
        }
      });
    };
    
    // Listen to scroll on window and document
    window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
    document.addEventListener('scroll', this.boundScrollHandler, { passive: true, capture: true });
    
    // Also listen to resize
    window.addEventListener('resize', this.boundResizeHandler);
  }
  
  /**
   * Force visibility check for all notes
   */
  refresh() {
    this.anchorToNote.forEach((note, anchor) => {
      // Check if anchor is in viewport
      const rect = anchor.getBoundingClientRect();
      const inViewport = (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
      
      // Only show note if globally visible AND anchor is in viewport AND note is not individually hidden
      if (inViewport && this.globallyVisible && !note.isHidden) {
        note.show();
      } else {
        note.hide();
      }
    });
  }
  
  /**
   * Set global visibility state for all notes
   * When false, notes will be hidden regardless of anchor visibility
   * When true, notes with isHidden=true will remain hidden (respects per-note preference)
   * @param {boolean} visible - Whether notes should be globally visible
   */
  setGlobalVisibility(visible) {
    this.globallyVisible = visible;
    
    if (visible) {
      // Re-check visibility for all notes based on anchor positions
      // Notes with isHidden=true will remain hidden (handled in refresh())
      this.refresh();
    } else {
      // Hide all notes
      this.anchorToNote.forEach((note) => {
        note.hide();
      });
    }
  }
  
  /**
   * Get current global visibility state
   * @returns {boolean} Whether notes are globally visible
   */
  getGlobalVisibility() {
    return this.globallyVisible;
  }
  
  /**
   * Get all observed anchors
   * @returns {Element[]} Array of anchor elements
   */
  getObservedAnchors() {
    return Array.from(this.anchorToNote.keys());
  }
  
  /**
   * Get all notes
   * @returns {Object[]} Array of note instances
   */
  getNotes() {
    return Array.from(this.anchorToNote.values());
  }
  
  /**
   * Check if an anchor is being observed
   * @param {Element} anchor - Anchor element
   * @returns {boolean} True if observed
   */
  isObserving(anchor) {
    return this.anchorToNote.has(anchor);
  }
  
  /**
   * Get note for an anchor
   * @param {Element} anchor - Anchor element
   * @returns {Object|null} Note instance or null
   */
  getNoteForAnchor(anchor) {
    return this.anchorToNote.get(anchor) || null;
  }
  
  /**
   * Disconnect observer and cleanup
   */
  disconnect() {
    // Hide all notes
    this.anchorToNote.forEach((note, _anchor) => {
      note.hide();
    });
    
    // Clear maps
    this.anchorToNote.clear();
    this.noteCallbacks.clear();
    
    // Disconnect observer
    this.observer.disconnect();
    
    // Remove scroll and resize listeners
    if (this.boundScrollHandler) {
      window.removeEventListener('scroll', this.boundScrollHandler, { passive: true });
      document.removeEventListener('scroll', this.boundScrollHandler, { passive: true, capture: true });
      this.boundScrollHandler = null;
    }
    
    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }
  }
}
