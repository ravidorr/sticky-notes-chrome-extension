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
        // Anchor is visible, show note
        note.show();
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
      this.anchorToNote.forEach((note, anchor) => {
        if (note.isVisible) {
          note.updatePosition();
        }
      });
      ticking = false;
    };
    
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updatePositions);
        ticking = true;
      }
    };
    
    // Listen to scroll on window and document
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    
    // Also listen to resize
    window.addEventListener('resize', () => {
      this.anchorToNote.forEach((note, anchor) => {
        if (note.isVisible) {
          note.updatePosition();
        }
      });
    });
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
      
      if (inViewport) {
        note.show();
      } else {
        note.hide();
      }
    });
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
    this.anchorToNote.forEach((note, anchor) => {
      note.hide();
    });
    
    // Clear maps
    this.anchorToNote.clear();
    this.noteCallbacks.clear();
    
    // Disconnect observer
    this.observer.disconnect();
  }
}
