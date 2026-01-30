/**
 * Sticky Notes Application
 * Main orchestration class for the content script
 */

import { SelectorEngine } from '../selectors/SelectorEngine.js';
import { VisibilityManager } from '../observers/VisibilityManager.js';
import { getConsoleCapture } from '../observers/ConsoleCapture.js';
import { contentLogger as log } from '../../shared/logger.js';
import { createCompositeUrl } from '../../shared/utils.js';
import { RealtimeSync } from './RealtimeSync.js';
import { MessageHandler } from './MessageHandler.js';
import { NoteManager } from './NoteManager.js';
import { UIManager } from './UIManager.js';
import { 
  isContextInvalidatedError, 
  shouldSubscribeToNotes, 
  shouldUnsubscribeFromNotes, 
  shouldReloadNotes 
} from './StickyNotesApp.helpers.js';

/**
 * Main application class for the content script
 */
export class StickyNotesApp {
  constructor() {
    // Core state
    this.notes = new Map();
    this.contextInvalidated = false;
    this.currentUser = null;
    this.lastRightClickedElement = null;
    this.lastRightClickPosition = null; // Track position for page-level notes from context menu
    
    // Frame and URL state for iframe support
    this.isTopFrame = window.self === window.top;
    this.frameUrl = window.location.href;
    this.tabUrl = null; // Will be fetched from background script
    this.currentUrl = null; // Composite URL, set after fetching tab URL
    
    // Services
    this.selectorEngine = new SelectorEngine();
    this.visibilityManager = new VisibilityManager();
    this.consoleCapture = getConsoleCapture();
    
    // Initialize modules (will be set up in init())
    this.uiManager = null;
    this.noteManager = null;
    this.realtimeSync = null;
    this.messageHandler = null;
    
    // Track right-clicked element for context menu
    this.setupContextMenuTracking();
    
    this.init();
  }
  
  /**
   * Track the element and position that was right-clicked for context menu
   */
  setupContextMenuTracking() {
    document.addEventListener('contextmenu', (event) => {
      this.lastRightClickedElement = event.target;
      // Store position in page coordinates for page-level notes
      this.lastRightClickPosition = {
        pageX: event.pageX,
        pageY: event.pageY
      };
      log.debug('Context menu event captured, target:', event.target?.tagName, 'id:', event.target?.id);
    }, true);
  }
  
  /**
   * Initialize the application
   */
  async init() {
    log.debug(' init() started');
    log.debug(' Frame type:', this.isTopFrame ? 'top frame' : 'iframe');
    try {
      // Initialize console capture early to catch errors during page load
      this.consoleCapture.init();
      log.debug(' Console capture initialized');
      
      // Initialize UI Manager first
      this.uiManager = new UIManager({
        onElementSelect: (element, pendingReanchor) => 
          this.noteManager.handleElementSelect(element, pendingReanchor)
      });
      
      // Create shadow DOM container
      log.debug(' Creating shadow container...');
      const { container } = this.uiManager.createShadowContainer();
      log.debug(' Shadow container created');
      
      // Fetch tab URL from background script for iframe support
      // This ensures notes in iframes are associated with the main page
      log.debug(' Fetching tab URL...');
      try {
        const tabUrlResponse = await this.sendMessage({ action: 'getTabUrl' });
        if (tabUrlResponse.success) {
          this.tabUrl = tabUrlResponse.url;
          log.debug(' Tab URL:', this.tabUrl);
        } else {
          // Fallback to frame URL if tab URL not available
          this.tabUrl = this.frameUrl;
          log.debug(' Tab URL not available, using frame URL');
        }
      } catch (error) {
        // Fallback to frame URL on error
        this.tabUrl = this.frameUrl;
        log.debug(' Error fetching tab URL, using frame URL:', error.message);
      }
      
      // Create composite URL for note storage/lookup
      this.currentUrl = createCompositeUrl(this.tabUrl, this.frameUrl, this.isTopFrame);
      log.debug(' Composite URL:', this.currentUrl);
      
      // Initialize Real-time Sync
      this.realtimeSync = new RealtimeSync({
        sendMessage: (msg) => this.sendMessage(msg),
        isContextInvalidatedError: (err) => this.isContextInvalidatedError(err),
        onNotesUpdate: (notes) => this.noteManager.handleRealtimeNotesUpdate(notes),
        onCommentsUpdate: (noteId, comments) => this.noteManager.handleRealtimeCommentsUpdate(noteId, comments),
        getNotes: () => this.notes
      });
      
      // Initialize Note Manager
      this.noteManager = new NoteManager({
        notes: this.notes,
        selectorEngine: this.selectorEngine,
        visibilityManager: this.visibilityManager,
        container: container,
        sendMessage: (msg) => this.sendMessage(msg),
        isContextInvalidatedError: (err) => this.isContextInvalidatedError(err),
        getCurrentUser: () => this.currentUser,
        getCurrentUrl: () => this.currentUrl,
        getTabUrl: () => this.tabUrl,
        getFrameUrl: () => this.frameUrl,
        isTopFrame: () => this.isTopFrame,
        subscribeToComments: (noteId) => this.realtimeSync.subscribeToComments(noteId),
        unsubscribeFromComments: (noteId) => this.realtimeSync.unsubscribeFromComments(noteId),
        showReanchorUI: (noteData) => this.uiManager.showReanchorUI(noteData),
        getConsoleErrors: () => this.consoleCapture.getRecentErrors(5)
      });
      
      // Initialize Message Handler
      this.messageHandler = new MessageHandler({ app: this });
      
      // Setup message listeners FIRST so we can receive messages immediately
      log.debug(' Setting up message listeners...');
      this.messageHandler.setup();
      log.debug(' Message listeners ready');
      
      // Setup mutation observer for dynamic content
      log.debug(' Setting up mutation observer...');
      this.uiManager.setupMutationObserver(this.notes, this.visibilityManager, this.noteManager);
      log.debug(' Mutation observer ready');
      
      log.debug('Content script fully initialized and ready to receive messages');
      
      // Fetch current user for comments (async, non-blocking)
      log.debug(' Fetching current user...');
      this.fetchCurrentUser().catch(err => {
        log.debug(' Failed to fetch user (may not be logged in):', err);
      });
      
      // Load existing notes for this page (async, non-blocking)
      log.debug(' Loading notes for this page...');
      this.noteManager.loadNotes(() => this.realtimeSync.subscribeToNotes(this.currentUrl)).catch(err => {
        log.warn(' Failed to load notes:', err);
      });
    } catch (error) {
      log.error('Failed to initialize:', error);
    }
  }
  
  /**
   * Check if an error is an extension context invalidated error
   * @param {Error} error - Error object
   * @returns {boolean} True if context is invalidated
   */
  isContextInvalidatedError(error) {
    return isContextInvalidatedError(error);
  }
  
  /**
   * Send a message to the background script with context invalidation handling
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response from background script
   */
  async sendMessage(message) {
    if (this.contextInvalidated) {
      throw new Error('Extension context invalidated');
    }
    
    // Check if chrome.runtime is available (becomes undefined when context is invalidated)
    if (!chrome?.runtime?.sendMessage) {
      this.handleContextInvalidated();
      throw new Error('Extension context invalidated');
    }
    
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (this.isContextInvalidatedError(error)) {
        this.handleContextInvalidated();
        throw error;
      }
      throw error;
    }
  }
  
  /**
   * Handle extension context invalidation
   */
  handleContextInvalidated() {
    if (this.contextInvalidated) return; // Only show once
    
    this.contextInvalidated = true;
    // Use debug level - this can happen during extension reload/update in dev and is not actionable
    // beyond refreshing the page (we already show a UI notification for that).
    log.debug(' Extension context invalidated - extension was updated or reloaded');
    
    this.uiManager.showRefreshNotification();
  }
  
  /**
   * Fetch the current user from background script
   */
  async fetchCurrentUser() {
    try {
      const response = await this.sendMessage({ action: 'getUser' });
      if (response.success && response.user) {
        const wasLoggedOut = !this.currentUser;
        this.currentUser = response.user;
        log.debug('Current user:', this.currentUser.email);
        
        // Update user on existing notes
        this.noteManager.updateUser(this.currentUser);
        
        // Subscribe to real-time updates if user just logged in
        if (wasLoggedOut) {
          await this.realtimeSync.subscribeToNotes(this.currentUrl);
        }
      } else {
        this.currentUser = null;
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to fetch user:', error);
      }
      this.currentUser = null;
    }
  }
  
  /**
   * Handle user login/logout state change
   * @param {Object|null} user - New user object or null if logged out
   */
  async handleUserChange(user) {
    const wasLoggedIn = !!this.currentUser;
    const isLoggedIn = !!user;
    this.currentUser = user;
    
    // Update all existing notes with the new user
    this.noteManager.updateUser(user);
    
    // Handle subscription changes
    if (shouldSubscribeToNotes(wasLoggedIn, isLoggedIn)) {
      // User logged in - subscribe to real-time updates
      await this.realtimeSync.subscribeToNotes(this.currentUrl);
      log.debug('User logged in, subscribed to real-time updates');
    } else if (shouldUnsubscribeFromNotes(wasLoggedIn, isLoggedIn)) {
      // User logged out - unsubscribe from all real-time updates
      await this.realtimeSync.unsubscribeFromNotes();
      await this.realtimeSync.unsubscribeFromAllComments();
      log.debug('User logged out, unsubscribed from real-time updates');
    }
    
    log.debug('User state updated for', this.notes.size, 'notes');
  }
  
  /**
   * Handle URL change (for SPA navigation)
   * @param {string} newUrl - New URL (this is the tab URL from the background script)
   */
  async handleUrlChange(newUrl) {
    // Update frame URL
    this.frameUrl = window.location.href;
    
    // For SPA navigation, the tab URL changes but we might be in an iframe
    // Use the provided newUrl as the tab URL
    this.tabUrl = newUrl;
    
    // Create new composite URL
    const newCompositeUrl = createCompositeUrl(this.tabUrl, this.frameUrl, this.isTopFrame);
    
    if (!shouldReloadNotes(this.currentUrl, newCompositeUrl)) return;
    
    // Unsubscribe from real-time updates for old URL
    await this.realtimeSync.unsubscribeFromNotes();
    await this.realtimeSync.unsubscribeFromAllComments();
    
    // Clear existing notes
    this.noteManager.clearAll();
    
    // Update current URL
    this.currentUrl = newCompositeUrl;
    
    // Load notes for new URL
    await this.noteManager.loadNotes(() => this.realtimeSync.subscribeToNotes(this.currentUrl));
  }
  
  /**
   * Enable element selection mode
   */
  enableSelectionMode() {
    this.uiManager.enableSelectionMode();
  }
  
  /**
   * Disable element selection mode
   */
  disableSelectionMode() {
    this.uiManager.disableSelectionMode();
  }
  
  /**
   * Highlight a specific note
   * @param {string} noteId - Note ID
   */
  highlightNote(noteId) {
    this.noteManager.highlightNote(noteId);
  }
  
  /**
   * Highlight a note and expand it to maximized mode
   * @param {string} noteId - Note ID
   */
  highlightAndMaximizeNote(noteId) {
    this.noteManager.highlightAndMaximizeNote(noteId);
  }
  
  /**
   * Show an orphaned note centered on screen
   * @param {string} noteId - Note ID
   */
  showOrphanedNote(noteId) {
    this.noteManager.showOrphanedNote(noteId);
  }
  
  /**
   * Create a note at the last right-clicked element
   * Called from context menu
   * @returns {boolean} True if note was created, false if no element to attach to
   */
  async createNoteAtClick() {
    log.debug('createNoteAtClick called, lastRightClickedElement:', 
      this.lastRightClickedElement?.tagName || 'null',
      'isTopFrame:', this.isTopFrame,
      'frameUrl:', this.frameUrl?.substring(0, 50));
    
    if (!this.lastRightClickedElement) {
      // Don't log warning - this is expected when message is broadcast to all frames
      // Only one frame will have the element
      return false;
    }
    
    try {
      // Generate selector for the clicked element
      const selector = this.selectorEngine.generate(this.lastRightClickedElement);
      
      if (!selector) {
        log.warn('Could not generate selector for element');
        return false;
      }
      
      // Create note via NoteManager
      await this.noteManager.createNoteAtElement(this.lastRightClickedElement, selector);
      
      // Clear the element after creating note to prevent duplicate creates
      this.lastRightClickedElement = null;
      
      log.debug('Created note at right-clicked element');
      return true;
    } catch (error) {
      log.error('Failed to create note at click:', error);
      return false;
    }
  }
  
  /**
   * Create a page-level note (not anchored to any element)
   * @param {Object} position - Optional position { pageX, pageY }
   *   If not provided and called from context menu, uses last right-click position
   *   Otherwise defaults to (10, 10)
   * @returns {boolean} True if note was created
   */
  async createPageLevelNote(position = null) {
    log.debug('createPageLevelNote called, position:', position);
    
    try {
      // Determine position: use provided, or last right-click position, or default
      let notePosition = position;
      
      if (!notePosition && this.lastRightClickPosition) {
        // Use the position where user right-clicked (for context menu creation)
        notePosition = this.lastRightClickPosition;
        // Clear after use
        this.lastRightClickPosition = null;
      }
      
      // Create note via NoteManager
      const created = await this.noteManager.createPageLevelNote(notePosition || {});
      
      if (created) {
        log.debug('Created page-level note');
      }
      
      return created;
    } catch (error) {
      log.error('Failed to create page-level note:', error);
      return false;
    }
  }
}
