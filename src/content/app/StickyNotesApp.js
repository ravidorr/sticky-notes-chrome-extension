/**
 * Sticky Notes Application
 * Main orchestration class for the content script
 */

import { SelectorEngine } from '../selectors/SelectorEngine.js';
import { VisibilityManager } from '../observers/VisibilityManager.js';
import { contentLogger as log } from '../../shared/logger.js';
import { RealtimeSync } from './RealtimeSync.js';
import { MessageHandler } from './MessageHandler.js';
import { NoteManager } from './NoteManager.js';
import { UIManager } from './UIManager.js';

/**
 * Main application class for the content script
 */
export class StickyNotesApp {
  constructor() {
    // Core state
    this.notes = new Map();
    this.currentUrl = window.location.href;
    this.contextInvalidated = false;
    this.currentUser = null;
    this.lastRightClickedElement = null;
    
    // Services
    this.selectorEngine = new SelectorEngine();
    this.visibilityManager = new VisibilityManager();
    
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
   * Track the element that was right-clicked for context menu
   */
  setupContextMenuTracking() {
    document.addEventListener('contextmenu', (e) => {
      this.lastRightClickedElement = e.target;
    }, true);
  }
  
  /**
   * Initialize the application
   */
  async init() {
    log.debug(' init() started');
    try {
      // Initialize UI Manager first
      this.uiManager = new UIManager({
        onElementSelect: (element, pendingReanchor) => 
          this.noteManager.handleElementSelect(element, pendingReanchor)
      });
      
      // Create shadow DOM container
      log.debug(' Creating shadow container...');
      const { container } = this.uiManager.createShadowContainer();
      log.debug(' Shadow container created');
      
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
        subscribeToComments: (noteId) => this.realtimeSync.subscribeToComments(noteId),
        unsubscribeFromComments: (noteId) => this.realtimeSync.unsubscribeFromComments(noteId),
        showReanchorUI: (noteData) => this.uiManager.showReanchorUI(noteData)
      });
      
      // Initialize Message Handler
      this.messageHandler = new MessageHandler({ app: this });
      
      // Setup message listeners FIRST so we can receive messages immediately
      log.debug(' Setting up message listeners...');
      this.messageHandler.setup();
      log.debug(' Message listeners ready');
      
      // Setup mutation observer for dynamic content
      log.debug(' Setting up mutation observer...');
      this.uiManager.setupMutationObserver(this.notes, this.visibilityManager);
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
    const message = error?.message || String(error);
    return message.includes('Extension context invalidated') ||
           message.includes('Extension context was invalidated') ||
           message.includes('context invalidated');
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
    log.warn(' Extension context invalidated - extension was updated or reloaded');
    
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
        log.debug('Failed to fetch user:', error);
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
    if (!wasLoggedIn && isLoggedIn) {
      // User logged in - subscribe to real-time updates
      await this.realtimeSync.subscribeToNotes(this.currentUrl);
      log.debug('User logged in, subscribed to real-time updates');
    } else if (wasLoggedIn && !isLoggedIn) {
      // User logged out - unsubscribe from all real-time updates
      await this.realtimeSync.unsubscribeFromNotes();
      await this.realtimeSync.unsubscribeFromAllComments();
      log.debug('User logged out, unsubscribed from real-time updates');
    }
    
    log.debug('User state updated for', this.notes.size, 'notes');
  }
  
  /**
   * Handle URL change (for SPA navigation)
   * @param {string} newUrl - New URL
   */
  async handleUrlChange(newUrl) {
    if (newUrl === this.currentUrl) return;
    
    // Unsubscribe from real-time updates for old URL
    await this.realtimeSync.unsubscribeFromNotes();
    await this.realtimeSync.unsubscribeFromAllComments();
    
    // Clear existing notes
    this.noteManager.clearAll();
    
    // Update current URL
    this.currentUrl = newUrl;
    
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
   * Create a note at the last right-clicked element
   * Called from context menu
   */
  async createNoteAtClick() {
    if (!this.lastRightClickedElement) {
      log.warn('No right-clicked element to attach note to');
      return;
    }
    
    try {
      // Generate selector for the clicked element
      const selector = this.selectorEngine.generate(this.lastRightClickedElement);
      
      if (!selector) {
        log.warn('Could not generate selector for element');
        return;
      }
      
      // Create note via NoteManager
      await this.noteManager.createNoteAtElement(this.lastRightClickedElement, selector);
      
      log.debug('Created note at right-clicked element');
    } catch (error) {
      log.error('Failed to create note at click:', error);
    }
  }
}
