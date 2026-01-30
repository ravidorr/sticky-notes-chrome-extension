/**
 * Note Manager
 * Handles note CRUD operations, comments, and anchor management
 */

import { StickyNote } from '../components/StickyNote.js';
import { contentLogger as log } from '../../shared/logger.js';
import { t } from '../../shared/i18n.js';
import { getBrowserInfo, detectEnvironment, PAGE_LEVEL_SELECTOR, isPageLevelNote } from '../../shared/utils.js';
import { purgeExpiredSessionMarkers, calculateNoteDiff } from './SyncLogic.js';

/**
 * Manages note operations
 */
export class NoteManager {
  /**
   * Create a NoteManager instance
   * @param {Object} options - Configuration options
   * @param {Map} options.notes - Notes map
   * @param {Object} options.selectorEngine - Selector engine instance
   * @param {Object} options.visibilityManager - Visibility manager instance
   * @param {HTMLElement} options.container - Container element
   * @param {Function} options.sendMessage - Function to send messages
   * @param {Function} options.isContextInvalidatedError - Function to check context errors
   * @param {Function} options.getCurrentUser - Function to get current user
   * @param {Function} options.getCurrentUrl - Function to get current (composite) URL
   * @param {Function} options.getTabUrl - Function to get the tab URL
   * @param {Function} options.getFrameUrl - Function to get the frame URL
   * @param {Function} options.isTopFrame - Function to check if this is the top frame
   * @param {Function} options.subscribeToComments - Function to subscribe to comments
   * @param {Function} options.unsubscribeFromComments - Function to unsubscribe from comments
   * @param {Function} options.showReanchorUI - Function to show reanchor UI
   * @param {Function} options.getConsoleErrors - Function to get recent console errors
   */
  constructor(options) {
    this.notes = options.notes;
    this.selectorEngine = options.selectorEngine;
    this.visibilityManager = options.visibilityManager;
    this.container = options.container;
    this.sendMessage = options.sendMessage;
    this.isContextInvalidatedError = options.isContextInvalidatedError;
    this.getCurrentUser = options.getCurrentUser;
    this.getCurrentUrl = options.getCurrentUrl;
    this.getTabUrl = options.getTabUrl;
    this.getFrameUrl = options.getFrameUrl;
    this.isTopFrame = options.isTopFrame;
    this.subscribeToComments = options.subscribeToComments;
    this.unsubscribeFromComments = options.unsubscribeFromComments;
    this.showReanchorUI = options.showReanchorUI;
    this.getConsoleErrors = options.getConsoleErrors || (() => []);
    
    // Track notes waiting for their anchor elements to appear (for SPAs)
    this.pendingNotes = new Map();
    
    // Track orphaned notes (anchor element not found, user can view centered)
    this.orphanedNotes = new Map();
    
    // Track notes created in this session (should start maximized).
    // Used to handle race conditions between direct creation and real-time sync.
    // Map<noteId, createdAtMs>
    this.sessionCreatedNoteIds = new Map();
  }
  
  /**
   * Add a note to pending/orphaned queue (waiting for anchor element to appear)
   * Notes are kept indefinitely - no timeout, user controls via popup
   * @param {Object} noteData - Note data
   */
  addPendingNote(noteData) {
    log.debug(`Adding note to orphaned queue: ${noteData.id}`);
    
    const orphanedEntry = {
      noteData,
      addedAt: Date.now()
    };
    
    this.orphanedNotes.set(noteData.id, orphanedEntry);
    
    // Also keep in pendingNotes for MutationObserver to check
    this.pendingNotes.set(noteData.id, orphanedEntry);
    
    // Update badge on extension icon
    this.updateOrphanedBadge();
  }
  
  /**
   * Update the extension icon badge with orphaned notes count
   */
  async updateOrphanedBadge() {
    try {
      const count = this.orphanedNotes.size;
      await this.sendMessage({
        action: 'updateOrphanedCount',
        count
      });
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to update orphaned badge:', error);
      }
    }
  }
  
  /**
   * Get orphaned notes data for popup display
   * @returns {Array} Array of orphaned note data objects
   */
  getOrphanedNotes() {
    return Array.from(this.orphanedNotes.values()).map(entry => ({
      ...entry.noteData,
      isOrphaned: true
    }));
  }
  
  /**
   * Check pending notes for newly available anchor elements
   * Called by MutationObserver when DOM changes
   */
  checkPendingNotes() {
    if (this.pendingNotes.size === 0) return;
    
    const resolved = [];
    
    this.pendingNotes.forEach((pending, noteId) => {
      const { noteData } = pending;
      
      // Try to find the anchor element
      let anchorElement = document.querySelector(noteData.selector);
      
      // Try fuzzy matching if not found
      if (!anchorElement) {
        anchorElement = this.selectorEngine.findBestMatch(noteData.selector, {
          textContent: noteData.anchorText || ''
        });
        
        if (anchorElement) {
          log.debug(`Found pending note anchor via fuzzy matching: ${noteId}`);
          this.handleReanchor(noteId, anchorElement);
        }
      }
      
      if (anchorElement) {
        log.debug(`Pending note anchor found: ${noteId}`);
        resolved.push({ noteId, pending, anchorElement });
      }
    });
    
    // Create notes for resolved pending entries
    resolved.forEach(({ noteId, pending }) => {
      this.pendingNotes.delete(noteId);
      // Also remove from orphanedNotes since anchor was found
      this.orphanedNotes.delete(noteId);
      
      // Create the note (will find anchor on retry)
      this.createNoteFromData(pending.noteData);
    });
    
    // Update badge if any notes were resolved
    if (resolved.length > 0) {
      this.updateOrphanedBadge();
    }
  }
  
  /**
   * Clear all pending and orphaned notes (e.g., on URL change)
   */
  clearPendingNotes() {
    this.pendingNotes.clear();
    this.orphanedNotes.clear();
    // Update badge (will clear it since count is 0)
    this.updateOrphanedBadge();
  }
  
  /**
   * Load notes for the current page
   * @param {Function} subscribeToNotes - Function to subscribe after loading
   */
  async loadNotes(subscribeToNotes) {
    try {
      // First, do a one-time fetch to get initial notes
      const response = await this.sendMessage({
        action: 'getNotes',
        url: this.getCurrentUrl()
      });
      
      if (response.success && response.notes) {
        response.notes.forEach(noteData => {
          this.createNoteFromData(noteData);
        });
      }
      
      // Then subscribe to real-time updates if user is logged in
      const user = this.getCurrentUser();
      if (user) {
        await subscribeToNotes();
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error loading notes:', error);
      }
    }
  }
  
  /**
   * Create a note from saved data
   * @param {Object} noteData - Note data from storage
   * @param {Object} options - Additional options
   * @param {boolean} options.isNewNote - If true, note is newly created and shown maximized
   */
  createNoteFromData(noteData, options = {}) {
    // Check if note already exists to prevent duplicates
    if (this.notes.has(noteData.id)) {
      // If this is a newly created note (context menu / selection flow) but a race already created it
      // via real-time updates, ensure it is expanded.
      const existingNote = this.notes.get(noteData.id);
      if (options.isNewNote && existingNote?.isMinimized) {
        existingNote.toggleMinimize();
      }
      log.debug('Note already exists, skipping creation:', noteData.id);
      return;
    }
    
    // Check if already pending
    if (this.pendingNotes.has(noteData.id)) {
      log.debug('Note already pending, skipping:', noteData.id);
      return;
    }
    
    // Handle page-level notes (no anchor element)
    if (isPageLevelNote(noteData)) {
      this.createPageLevelNoteUI(noteData, options);
      return;
    }
    
    // Find the anchor element
    let anchorElement = null;
    let selectorMatches = [];
    try {
      selectorMatches = Array.from(document.querySelectorAll(noteData.selector));
      anchorElement = selectorMatches[0] || null;
    } catch {
      selectorMatches = [];
      anchorElement = null;
    }

    // If selector matches multiple elements, disambiguate using anchorText (when available).
    // This prevents anchoring to the "first" sibling when multiple identical elements exist.
    if (selectorMatches.length > 1) {
      const anchorText = (noteData.anchorText || '').trim();
      if (anchorText) {
        const byText = selectorMatches.find((el) => (el.textContent || '').trim() === anchorText);
        if (byText) {
          anchorElement = byText;
        } else {
          const best = this.selectorEngine.findBestMatch(noteData.selector, { textContent: anchorText });
          if (best) {
            anchorElement = best;
          }
        }
      }
    }
    
    // If not found, try fuzzy matching
    // Note: Using debug level since in SPAs elements may be injected later
    if (!anchorElement) {
      log.debug(`Anchor element not found for selector: ${noteData.selector}`);
      
      // Try fuzzy matching
      anchorElement = this.selectorEngine.findBestMatch(noteData.selector, {
        textContent: noteData.anchorText || ''
      });
      
      if (anchorElement) {
        log.debug('Found element using fuzzy matching');
        // Update the selector
        this.handleReanchor(noteData.id, anchorElement);
      } else {
        // Add to pending notes - element may appear later (SPA)
        this.addPendingNote(noteData);
        return;
      }
    }
    
    const user = this.getCurrentUser();
    
    // Create note instance with comment callbacks
    // New notes start maximized, existing notes start minimized
    const note = new StickyNote({
      id: noteData.id,
      anchor: anchorElement,
      selector: noteData.selector,
      content: noteData.content,
      theme: noteData.theme || 'yellow',
      position: noteData.position || { anchor: 'top-right' },
      metadata: noteData.metadata,
      createdAt: noteData.createdAt,
      ownerEmail: noteData.ownerEmail,
      ownerId: noteData.ownerId,
      isMinimized: !options.isNewNote, // New notes are maximized, existing notes are minimized
      onSave: (content) => this.handleNoteSave(noteData.id, content),
      onThemeChange: (theme) => this.handleThemeChange(noteData.id, theme),
      onPositionChange: (position) => this.handlePositionChange(noteData.id, position),
      onDelete: () => this.handleNoteDelete(noteData.id),
      // Comment-related options
      user: user,
      onAddComment: (noteId, commentData) => this.handleAddComment(noteId, commentData),
      onEditComment: (noteId, commentId, updates) => this.handleEditComment(noteId, commentId, updates),
      onDeleteComment: (noteId, commentId) => this.handleDeleteComment(noteId, commentId),
      onLoadComments: (noteId) => this.handleLoadComments(noteId),
      onCommentsOpened: (noteId) => this.subscribeToComments(noteId),
      onCommentsClosed: (noteId) => this.unsubscribeFromComments(noteId)
    });
    
    // Add to container and map
    this.container.appendChild(note.element);
    this.notes.set(noteData.id, note);
    
    // Ensure initial positioning happens after the element is connected to the DOM.
    // This avoids a visible "jump" caused by measuring 0x0 before attachment.
    note.updatePosition();

    // Setup visibility observer
    this.visibilityManager.observe(anchorElement, note);
    
    // Mark shared notes as read when viewed
    if (noteData.isShared) {
      this.markSharedNoteAsRead(noteData.id);
    }
  }
  
  /**
   * Create UI for a page-level note (no anchor element)
   * Page-level notes are always visible and don't use the visibility manager
   * @param {Object} noteData - Note data from storage
   * @param {Object} options - Additional options
   */
  createPageLevelNoteUI(noteData, options = {}) {
    const user = this.getCurrentUser();
    
    // Create note instance without anchor
    const note = new StickyNote({
      id: noteData.id,
      anchor: null, // Page-level notes have no anchor
      selector: noteData.selector,
      content: noteData.content,
      theme: noteData.theme || 'yellow',
      position: noteData.position || { pageX: 10, pageY: 10 },
      metadata: noteData.metadata,
      createdAt: noteData.createdAt,
      ownerEmail: noteData.ownerEmail,
      ownerId: noteData.ownerId,
      isMinimized: !options.isNewNote,
      onSave: (content) => this.handleNoteSave(noteData.id, content),
      onThemeChange: (theme) => this.handleThemeChange(noteData.id, theme),
      onPositionChange: (position) => this.handlePositionChange(noteData.id, position),
      onDelete: () => this.handleNoteDelete(noteData.id),
      user: user,
      onAddComment: (noteId, commentData) => this.handleAddComment(noteId, commentData),
      onEditComment: (noteId, commentId, updates) => this.handleEditComment(noteId, commentId, updates),
      onDeleteComment: (noteId, commentId) => this.handleDeleteComment(noteId, commentId),
      onLoadComments: (noteId) => this.handleLoadComments(noteId),
      onCommentsOpened: (noteId) => this.subscribeToComments(noteId),
      onCommentsClosed: (noteId) => this.unsubscribeFromComments(noteId)
    });
    
    // Add to container and map
    this.container.appendChild(note.element);
    this.notes.set(noteData.id, note);
    
    // Initial positioning
    note.updatePosition();
    
    // Page-level notes are not managed by visibility manager (no anchor),
    // but they should respect the global visibility state
    if (this.visibilityManager.getGlobalVisibility()) {
      note.show();
    }
    
    // Mark shared notes as read when viewed
    if (noteData.isShared) {
      this.markSharedNoteAsRead(noteData.id);
    }
    
    log.debug('Created page-level note:', noteData.id);
  }
  
  /**
   * Mark a shared note as read (removes from unread count badge)
   * @param {string} noteId - Note ID to mark as read
   */
  async markSharedNoteAsRead(noteId) {
    try {
      await this.sendMessage({
        action: 'markSharedNoteRead',
        noteId
      });
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.debug('Failed to mark shared note as read:', error);
      }
    }
  }
  
  /**
   * Handle note save
   * @param {string} noteId - Note ID
   * @param {string} content - Note content
   */
  async handleNoteSave(noteId, content) {
    try {
      await this.sendMessage({
        action: 'updateNote',
        note: { id: noteId, content }
      });
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error saving note:', error);
      }
    }
  }
  
  /**
   * Handle theme change
   * @param {string} noteId - Note ID
   * @param {string} theme - New theme
   */
  async handleThemeChange(noteId, theme) {
    try {
      await this.sendMessage({
        action: 'updateNote',
        note: { id: noteId, theme }
      });
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error saving theme:', error);
      }
    }
  }
  
  /**
   * Handle position change
   * @param {string} noteId - Note ID
   * @param {Object} position - New position { anchor: string } or { custom: { x, y } }
   */
  async handlePositionChange(noteId, position) {
    try {
      await this.sendMessage({
        action: 'updateNote',
        note: { id: noteId, position }
      });
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error saving position:', error);
      }
    }
  }
  
  /**
   * Handle note delete
   * @param {string} noteId - Note ID
   */
  async handleNoteDelete(noteId) {
    try {
      const response = await this.sendMessage({
        action: 'deleteNote',
        noteId
      });
      
      if (response.success) {
        const note = this.notes.get(noteId);
        if (note) {
          this.visibilityManager.unobserve(note.anchor);
          note.destroy();
          this.notes.delete(noteId);
        }
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error deleting note:', error);
      }
    }
  }
  
  /**
   * Handle adding a comment to a note
   * @param {string} noteId - Note ID
   * @param {Object} commentData - Comment data { content, parentId }
   * @returns {Promise<Object>} Created comment
   */
  async handleAddComment(noteId, commentData) {
    try {
      const response = await this.sendMessage({
        action: 'addComment',
        noteId,
        comment: commentData
      });
      
      if (response.success) {
        return response.comment;
      } else {
        throw new Error(response.error || t('failedToAddComment'));
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error adding comment:', error);
      }
      throw error;
    }
  }
  
  /**
   * Handle editing a comment
   * @param {string} noteId - Note ID
   * @param {string} commentId - Comment ID
   * @param {Object} updates - Updates { content }
   * @returns {Promise<boolean>} Success
   */
  async handleEditComment(noteId, commentId, updates) {
    try {
      const response = await this.sendMessage({
        action: 'editComment',
        noteId,
        commentId,
        updates
      });
      
      if (response.success) {
        return true;
      } else {
        throw new Error(response.error || t('failedToUpdateComment'));
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error editing comment:', error);
      }
      throw error;
    }
  }
  
  /**
   * Handle deleting a comment
   * @param {string} noteId - Note ID
   * @param {string} commentId - Comment ID
   * @returns {Promise<boolean>} Success
   */
  async handleDeleteComment(noteId, commentId) {
    try {
      const response = await this.sendMessage({
        action: 'deleteComment',
        noteId,
        commentId
      });
      
      if (response.success) {
        return true;
      } else {
        throw new Error(response.error || t('failedToDeleteComment'));
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error deleting comment:', error);
      }
      throw error;
    }
  }
  
  /**
   * Handle loading comments for a note
   * @param {string} noteId - Note ID
   * @returns {Promise<Array>} Comments array
   */
  async handleLoadComments(noteId) {
    try {
      const response = await this.sendMessage({
        action: 'getComments',
        noteId
      });
      
      if (response.success) {
        return response.comments || [];
      } else {
        throw new Error(response.error || t('failedToLoadComments'));
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error loading comments:', error);
      }
      throw error;
    }
  }
  
  /**
   * Handle re-anchoring a note to a new element
   * @param {string} noteId - Note ID
   * @param {Element} newAnchor - New anchor element
   */
  async handleReanchor(noteId, newAnchor) {
    const newSelector = this.selectorEngine.generate(newAnchor);
    
    if (!newSelector) {
      log.error('Could not generate selector for new anchor');
      return;
    }
    
    try {
      await this.sendMessage({
        action: 'updateNote',
        note: { 
          id: noteId, 
          selector: newSelector,
          anchorText: newAnchor.textContent?.trim().substring(0, 100) || ''
        }
      });
      
      log.debug('Note re-anchored successfully');
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to re-anchor note:', error);
      }
    }
  }
  
  /**
   * Handle element selection for new note creation
   * @param {Element} element - Selected element
   * @param {Object} pendingReanchor - Pending reanchor data if in reanchor mode
   */
  async handleElementSelect(element, pendingReanchor = null) {
    // Check if this is a re-anchor operation
    if (pendingReanchor) {
      await this.handleReanchor(pendingReanchor.id, element);
      
      // Recreate the note with new anchor
      this.createNoteFromData({
        ...pendingReanchor,
        selector: this.selectorEngine.generate(element)
      });
      
      return;
    }
    
    // Generate selector for the element
    const selector = this.selectorEngine.generate(element);
    
    // Verify the selector finds the right element
    const foundElement = document.querySelector(selector);
    if (foundElement !== element) {
      log.warn('Selector matches a different element - page may have duplicate structures');
    }
    
    if (!selector) {
      log.error('Could not generate selector for element');
      return;
    }
    
    // Create new note with metadata
    const browserInfo = getBrowserInfo();
    const isTopFrame = this.isTopFrame();
    const tabUrl = this.getTabUrl();
    const frameUrl = this.getFrameUrl();
    const currentUrl = frameUrl || window.location.href;
    const consoleErrors = this.getConsoleErrors();
    const noteData = {
      url: this.getCurrentUrl(),
      selector: selector,
      content: '',
      theme: 'yellow',
      position: { anchor: 'top-right' },
      anchorText: element.textContent?.trim().substring(0, 100) || '',
      metadata: {
        url: frameUrl,
        tabUrl: tabUrl,
        title: document.title,
        browser: `${browserInfo.browser}${browserInfo.version ? ' ' + browserInfo.version : ''}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
        isTopFrame: isTopFrame,
        frameUrl: isTopFrame ? null : frameUrl,
        environment: detectEnvironment(currentUrl),
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined
      }
    };
    
    try {
      // Save to storage
      const response = await this.sendMessage({
        action: 'saveNote',
        note: noteData
      });
      
      if (response.success) {
        // Track this note as created in current session (for real-time sync race condition)
        this.sessionCreatedNoteIds.set(response.note.id, Date.now());
        
        // Create the note UI - new notes start maximized
        this.createNoteFromData(response.note, { isNewNote: true });
      } else {
        log.error('Failed to save note:', response.error);
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to save note:', error);
      }
    }
  }
  
  /**
   * Create a note at a specific element (from context menu)
   * @param {Element} element - Element to attach note to
   * @param {string} selector - CSS selector for the element
   */
  async createNoteAtElement(element, selector) {
    if (!element || !selector) {
      log.warn('Cannot create note: missing element or selector');
      return;
    }
    
    // Create new note with metadata
    const browserInfo = getBrowserInfo();
    const isTopFrame = this.isTopFrame();
    const tabUrl = this.getTabUrl();
    const frameUrl = this.getFrameUrl();
    const currentUrl = frameUrl || window.location.href;
    const consoleErrors = this.getConsoleErrors();
    const noteData = {
      url: this.getCurrentUrl(),
      selector: selector,
      content: '',
      theme: 'yellow',
      position: { anchor: 'top-right' },
      anchorText: element.textContent?.trim().substring(0, 100) || '',
      metadata: {
        url: frameUrl,
        tabUrl: tabUrl,
        title: document.title,
        browser: `${browserInfo.browser}${browserInfo.version ? ' ' + browserInfo.version : ''}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
        isTopFrame: isTopFrame,
        frameUrl: isTopFrame ? null : frameUrl,
        environment: detectEnvironment(currentUrl),
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined
      }
    };

    try {
      // Save to storage
      const response = await this.sendMessage({
        action: 'saveNote',
        note: noteData
      });
      
      if (response.success) {
        // Track this note as created in current session (for real-time sync race condition)
        this.sessionCreatedNoteIds.set(response.note.id, Date.now());
        
        // Create the note UI - new notes start maximized
        this.createNoteFromData(response.note, { isNewNote: true });
        log.debug('Created note at element from context menu');
      } else {
        log.error('Failed to save note:', response.error);
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to create note at element:', error);
      }
    }
  }
  
  /**
   * Create a page-level note (not anchored to any element)
   * @param {Object} options - Options for page-level note
   * @param {number} options.pageX - X position in page coordinates (default: 10)
   * @param {number} options.pageY - Y position in page coordinates (default: 10)
   */
  async createPageLevelNote(options = {}) {
    const pageX = options.pageX ?? 10;
    const pageY = options.pageY ?? 10;
    
    // Create new note with metadata
    const browserInfo = getBrowserInfo();
    const isTopFrame = this.isTopFrame();
    const tabUrl = this.getTabUrl();
    const frameUrl = this.getFrameUrl();
    const currentUrl = frameUrl || window.location.href;
    const consoleErrors = this.getConsoleErrors();
    
    const noteData = {
      url: this.getCurrentUrl(),
      selector: PAGE_LEVEL_SELECTOR,
      content: '',
      theme: 'yellow',
      position: { pageX, pageY },
      metadata: {
        url: frameUrl,
        tabUrl: tabUrl,
        title: document.title,
        browser: `${browserInfo.browser}${browserInfo.version ? ' ' + browserInfo.version : ''}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
        isTopFrame: isTopFrame,
        frameUrl: isTopFrame ? null : frameUrl,
        environment: detectEnvironment(currentUrl),
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined
      }
    };
    
    try {
      // Save to storage
      const response = await this.sendMessage({
        action: 'saveNote',
        note: noteData
      });
      
      if (response.success) {
        // Track this note as created in current session
        this.sessionCreatedNoteIds.set(response.note.id, Date.now());
        
        // Create the note UI - new notes start maximized
        this.createNoteFromData(response.note, { isNewNote: true });
        log.debug('Created page-level note');
        return true;
      } else {
        log.error('Failed to save page-level note:', response.error);
        return false;
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to create page-level note:', error);
      }
      return false;
    }
  }
  
  /**
   * Update notes from real-time sync
   * @param {Array} updatedNotes - Updated notes array
   */
  handleRealtimeNotesUpdate(updatedNotes) {
    if (!updatedNotes) return;

    // Purge old "session created" markers
    purgeExpiredSessionMarkers(this.sessionCreatedNoteIds);
    
    // Calculate difference
    const { toRemove, toUpdate, toCreate } = calculateNoteDiff(
      this.notes, 
      updatedNotes, 
      this.sessionCreatedNoteIds
    );
    
    // Process removals
    toRemove.forEach(id => {
      const note = this.notes.get(id);
      if (note) {
        this.visibilityManager.unobserve(note.anchor);
        note.destroy();
        this.notes.delete(id);
        log.debug('Removed note:', id);
      }
    });
    
    // Process updates
    toUpdate.forEach(noteData => {
      const existingNote = this.notes.get(noteData.id);
      if (!existingNote) return;

      const newContent = noteData.content || '';
      if (existingNote.content !== newContent) {
        existingNote.richEditor.setContent(newContent);
        existingNote.content = newContent;
        log.debug('Updated note content:', noteData.id);
      }
      
      const newTheme = noteData.theme || 'yellow';
      if (existingNote.theme !== newTheme) {
        existingNote.setTheme(newTheme);
        log.debug('Updated note theme:', noteData.id);
      }
    });
    
    // Process creations
    toCreate.forEach(({ noteData, isNewNote }) => {
      this.createNoteFromData(noteData, { isNewNote });
      log.debug('Created new note from real-time update:', noteData.id, 'isNewNote:', isNewNote);
    });
  }
  
  /**
   * Update comments from real-time sync
   * @param {string} noteId - Note ID
   * @param {Array} comments - Updated comments array
   */
  handleRealtimeCommentsUpdate(noteId, comments) {
    const note = this.notes.get(noteId);
    if (note && note.commentSection) {
      note.commentSection.updateComments(comments || []);
      log.debug('Updated comments for note:', noteId, 'count:', comments?.length || 0);
    }
  }
  
  /**
   * Update user on all notes
   * @param {Object|null} user - User object or null
   */
  updateUser(user) {
    this.notes.forEach(note => {
      note.setUser(user);
    });
  }
  
  /**
   * Highlight a specific note
   * @param {string} noteId - Note ID
   * @param {boolean} maximize - Whether to also maximize the note (default: false)
   */
  highlightNote(noteId, maximize = false) {
    const note = this.notes.get(noteId);
    
    if (!note) {
      return;
    }
    
    // Page-level notes: scroll to their position on the page
    if (note.isPageLevel) {
      // Get the note's page coordinates
      const pageX = note.position?.pageX ?? 10;
      const pageY = note.position?.pageY ?? 10;
      
      // Scroll page to center the note in the viewport
      window.scrollTo({
        left: Math.max(0, pageX - window.innerWidth / 2),
        top: Math.max(0, pageY - window.innerHeight / 2),
        behavior: 'smooth'
      });
      
      // Wait for scroll animation to complete before showing/highlighting
      setTimeout(() => {
        note.show();
        note.bringToFront();
        note.highlight();
        if (maximize) {
          note.maximize();
        }
      }, 400); // 400ms matches typical smooth scroll duration
      return;
    }
    
    if (!note.anchor) {
      // Try to find the anchor element again
      const anchor = document.querySelector(note.selector);
      if (anchor) {
        note.anchor = anchor;
      } else {
        return;
      }
    }
    
    // Scroll element into view
    note.anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Reset custom position so note positions relative to anchor
    note.customPosition = null;
    // Persist the position change to storage (reset to default anchor position)
    // This ensures the cleared customPosition is saved, preventing
    // the old custom position from being restored on page reload
    note.position = { anchor: 'top-right' };
    note.onPositionChange(note.position);
    
    // Wait for scroll animation to complete before positioning
    // This ensures the note is positioned relative to anchor's final position
    setTimeout(() => {
      // Force show the note (this will call updatePosition)
      note.show();
      
      // Bring note to front (above other notes)
      note.bringToFront();
      
      // Add highlight effect to note
      note.highlight();
      
      // Also highlight the anchor element to show the association
      if (note.anchor) {
        note.anchor.classList.add('sn-element-highlight');
        setTimeout(() => {
          if (note.anchor) {
            note.anchor.classList.remove('sn-element-highlight');
          }
        }, 2000);
      }
      
      // Maximize note if requested
      if (maximize) {
        note.maximize();
      }
    }, 400); // 400ms matches typical smooth scroll duration
  }
  
  /**
   * Highlight a note and expand it to maximized mode
   * @param {string} noteId - Note ID
   */
  highlightAndMaximizeNote(noteId) {
    this.highlightNote(noteId, true);
  }
  
  /**
   * Show an orphaned note centered on screen
   * Used when user clicks on orphaned note in popup
   * @param {string} noteId - Note ID
   */
  showOrphanedNote(noteId) {
    const orphanedEntry = this.orphanedNotes.get(noteId);
    
    if (!orphanedEntry) {
      log.warn(`Orphaned note not found: ${noteId}`);
      return;
    }
    
    const { noteData } = orphanedEntry;
    
    // Check if note UI already exists
    let note = this.notes.get(noteId);
    
    if (!note) {
      // Create note without anchor (will be centered)
      const user = this.getCurrentUser();
      
      note = new StickyNote({
        id: noteData.id,
        anchor: null, // No anchor - will be positioned centered
        selector: noteData.selector,
        content: noteData.content,
        theme: noteData.theme || 'yellow',
        position: noteData.position || { anchor: 'top-right' },
        metadata: noteData.metadata,
        createdAt: noteData.createdAt,
        ownerEmail: noteData.ownerEmail,
        ownerId: noteData.ownerId,
        onSave: (content) => this.handleNoteSave(noteData.id, content),
        onThemeChange: (theme) => this.handleThemeChange(noteData.id, theme),
        onPositionChange: (position) => this.handlePositionChange(noteData.id, position),
        onDelete: () => this.handleOrphanedNoteDelete(noteData.id),
        // Comment-related options
        user: user,
        onAddComment: (id, commentData) => this.handleAddComment(id, commentData),
        onEditComment: (id, commentId, updates) => this.handleEditComment(id, commentId, updates),
        onDeleteComment: (id, commentId) => this.handleDeleteComment(id, commentId),
        onLoadComments: (id) => this.handleLoadComments(id),
        onCommentsOpened: (id) => this.subscribeToComments(id),
        onCommentsClosed: (id) => this.unsubscribeFromComments(id)
      });
      
      // Add to container
      this.container.appendChild(note.element);
      this.notes.set(noteId, note);
    }
    
    // Position centered on screen (fixed position)
    this.positionNoteCentered(note);
    
    // If global visibility is disabled, enable it since user explicitly wants to view a note
    if (!this.visibilityManager.getGlobalVisibility()) {
      this.visibilityManager.setGlobalVisibility(true);
    }
    
    // Show and highlight
    note.show();
    note.bringToFront();
    note.highlight();
  }
  
  /**
   * Position a note centered on the viewport
   * Note: The note container is position:fixed, so coordinates are viewport-relative
   * @param {Object} note - StickyNote instance
   */
  positionNoteCentered(note) {
    if (!note.element) return;
    
    const noteRect = note.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate center position (viewport coordinates - no scroll adjustment)
    const x = (viewportWidth - noteRect.width) / 2;
    const y = (viewportHeight - noteRect.height) / 2;
    
    // Set position directly (viewport coordinates)
    note.element.style.left = `${x}px`;
    note.element.style.top = `${y}px`;
    
    // Store as legacy document position for persistence
    // (will be converted to viewport coords in updatePosition)
    note.customPosition = { x: x + window.scrollX, y: y + window.scrollY };
  }
  
  /**
   * Handle delete for orphaned note
   * @param {string} noteId - Note ID
   */
  async handleOrphanedNoteDelete(noteId) {
    try {
      const response = await this.sendMessage({
        action: 'deleteNote',
        noteId
      });
      
      if (response.success) {
        // Remove from notes map
        const note = this.notes.get(noteId);
        if (note) {
          note.destroy();
          this.notes.delete(noteId);
        }
        
        // Remove from orphanedNotes and pendingNotes
        this.orphanedNotes.delete(noteId);
        this.pendingNotes.delete(noteId);
        
        // Update badge
        this.updateOrphanedBadge();
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Error deleting orphaned note:', error);
      }
    }
  }
  
  /**
   * Get all notes with orphan status for popup display
   * @returns {Array} Array of note objects with isOrphaned flag
   */
  getAllNotesWithOrphanStatus() {
    const allNotes = [];
    
    // Add active notes (not orphaned)
    this.notes.forEach((note, id) => {
      allNotes.push({
        id,
        content: note.content,
        theme: note.theme,
        selector: note.selector,
        isOrphaned: false
      });
    });
    
    // Add orphaned notes
    this.orphanedNotes.forEach((entry, id) => {
      // Don't add if already in notes (shouldn't happen but check)
      if (!this.notes.has(id)) {
        allNotes.push({
          ...entry.noteData,
          isOrphaned: true
        });
      }
    });
    
    return allNotes;
  }
  
  /**
   * Clear all notes
   */
  clearAll() {
    this.notes.forEach((note, _id) => {
      this.visibilityManager.unobserve(note.anchor);
      note.destroy();
    });
    this.notes.clear();
    
    // Also clear pending notes and session tracking
    this.clearPendingNotes();
    this.sessionCreatedNoteIds.clear();
  }
  
  /**
   * Toggle visibility of all notes on the page
   * Coordinates with VisibilityManager to prevent anchor-based visibility
   * from overriding the global hidden state.
   * Also handles orphaned notes and page-level notes that are not managed
   * by the visibility manager (they have no anchor element).
   * @returns {boolean} New visibility state (true = visible, false = hidden)
   */
  toggleAllVisibility() {
    const newVisibility = !this.visibilityManager.getGlobalVisibility();
    this.visibilityManager.setGlobalVisibility(newVisibility);
    
    // Handle notes without anchors (orphaned notes, page-level notes)
    // These are not tracked by the visibility manager
    this.notes.forEach((note) => {
      if (!note.anchor) {
        if (newVisibility) {
          note.show();
        } else {
          note.hide();
        }
      }
    });
    
    log.debug(`Toggled all notes visibility: ${newVisibility ? 'visible' : 'hidden'}`);
    return newVisibility;
  }
  
  /**
   * Get current visibility state of all notes
   * @returns {boolean} Current visibility state (true = visible, false = hidden)
   */
  getNotesVisibility() {
    return this.visibilityManager.getGlobalVisibility();
  }
}