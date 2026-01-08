/**
 * Content Script Entry Point
 * Manages the sticky notes overlay on web pages
 */

import { StickyNote } from './components/StickyNote.js';
import { SelectionOverlay } from './components/SelectionOverlay.js';
import { SelectorEngine } from './selectors/SelectorEngine.js';
import { VisibilityManager } from './observers/VisibilityManager.js';
import { RichEditor } from './components/RichEditor.js';
import { escapeHtml, getBrowserInfo } from '../shared/utils.js';
import { contentLogger as log } from '../shared/logger.js';

/**
 * Main application class for the content script
 */
class StickyNotesApp {
  constructor() {
    this.shadowRoot = null;
    this.container = null;
    this.notes = new Map();
    this.selectionOverlay = null;
    this.selectorEngine = new SelectorEngine();
    this.visibilityManager = new VisibilityManager();
    this.isSelectionMode = false;
    this.currentUrl = window.location.href;
    this.unsubscribeRealtime = null;
    this.contextInvalidated = false;
    
    this.init();
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
   * Shows a user-friendly notification to refresh the page
   */
  handleContextInvalidated() {
    if (this.contextInvalidated) return; // Only show once
    
    this.contextInvalidated = true;
    log.warn(' Extension context invalidated - extension was updated or reloaded');
    
    this.showRefreshNotification();
  }
  
  /**
   * Show notification to refresh the page
   */
  showRefreshNotification() {
    // Create notification in main document (shadow DOM might be broken too)
    const notificationId = 'sticky-notes-refresh-notification';
    
    // Don't show twice
    if (document.getElementById(notificationId)) return;
    
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border-radius: 12px;
      padding: 16px;
      width: 320px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      border-left: 4px solid #3b82f6;
      animation: sn-slide-in 0.3s ease;
    `;
    
    notification.innerHTML = `
      <style>
        @keyframes sn-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; width: 36px; height: 36px; background: #dbeafe; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 2v6h-6"/>
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
            <path d="M3 22v-6h6"/>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; font-size: 14px;">
            Extension Updated
          </div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px; line-height: 1.4;">
            The Sticky Notes extension was updated. Please refresh this page to continue using it.
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="sn-refresh-btn" style="flex: 1; padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s;">
              Refresh Page
            </button>
            <button id="sn-dismiss-refresh-btn" style="padding: 10px 12px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; transition: background 0.15s;">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Handle refresh button
    document.getElementById('sn-refresh-btn').addEventListener('click', () => {
      window.location.reload();
    });
    
    // Handle dismiss button
    document.getElementById('sn-dismiss-refresh-btn').addEventListener('click', () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      notification.style.transition = 'all 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    });
    
    // Add hover effects
    const refreshBtn = document.getElementById('sn-refresh-btn');
    refreshBtn.addEventListener('mouseenter', () => refreshBtn.style.background = '#2563eb');
    refreshBtn.addEventListener('mouseleave', () => refreshBtn.style.background = '#3b82f6');
    
    const dismissBtn = document.getElementById('sn-dismiss-refresh-btn');
    dismissBtn.addEventListener('mouseenter', () => dismissBtn.style.background = '#e5e7eb');
    dismissBtn.addEventListener('mouseleave', () => dismissBtn.style.background = '#f3f4f6');
  }
  
  /**
   * Initialize the application
   */
  async init() {
    log.debug(' init() started');
    try {
      // Setup message listeners FIRST so we can receive messages immediately
      log.debug(' Setting up message listeners...');
      this.setupMessageListeners();
      log.debug(' Message listeners ready');
      
      // Create shadow DOM container
      log.debug(' Creating shadow container...');
      this.createShadowContainer();
      log.debug(' Shadow container created');
      
      // Setup mutation observer for dynamic content
      log.debug(' Setting up mutation observer...');
      this.setupMutationObserver();
      log.debug(' Mutation observer ready');
      
      log.debug(' ✅ Content script fully initialized and ready to receive messages');
      
      // Load existing notes for this page (async, non-blocking)
      log.debug(' Loading notes for this page...');
      this.loadNotes().catch(err => {
        log.warn(' Failed to load notes:', err);
      });
    } catch (error) {
      log.error(' ❌ Failed to initialize:', error);
    }
  }
  
  /**
   * Create shadow DOM container for style isolation
   */
  createShadowContainer() {
    // Create host element
    const host = document.createElement('div');
    host.id = 'sticky-notes-extension-root';
    host.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 2147483647;
      pointer-events: none;
    `;
    
    // Create shadow root
    this.shadowRoot = host.attachShadow({ mode: 'closed' });
    
    // Inject styles into shadow DOM
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadowRoot.appendChild(style);
    
    // Inject selection styles into main document (these need to apply to page elements)
    this.injectMainDocumentStyles();
    
    // Create container for notes
    this.container = document.createElement('div');
    this.container.id = 'sticky-notes-container';
    this.container.style.cssText = 'pointer-events: auto;';
    this.shadowRoot.appendChild(this.container);
    
    // Append to document
    document.body.appendChild(host);
  }
  
  /**
   * Inject styles that need to apply to main document elements
   */
  injectMainDocumentStyles() {
    const styleId = 'sticky-notes-main-styles';
    
    // Don't inject twice
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Selection mode cursor */
      .sn-selection-mode,
      .sn-selection-mode * {
        cursor: crosshair !important;
      }

      /* Element highlight on hover during selection */
      .sn-element-highlight {
        outline: 2px solid #3b82f6 !important;
        outline-offset: 2px !important;
        background-color: rgba(59, 130, 246, 0.1) !important;
        transition: outline 0.1s ease, background-color 0.1s ease !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Get CSS styles for shadow DOM
   */
  getStyles() {
    return `
      /* Sticky note container */
      .sn-note {
        position: absolute;
        z-index: 2147483647;
        width: 280px;
        min-height: 120px;
        background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
        border-radius: 4px;
        box-shadow: 
          0 4px 6px -1px rgba(0, 0, 0, 0.1),
          0 2px 4px -1px rgba(0, 0, 0, 0.06),
          0 0 0 1px rgba(0, 0, 0, 0.05);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        font-size: 14px;
        transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
        pointer-events: auto;
      }

      .sn-note.sn-hidden {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.95);
      }

      .sn-note.sn-visible {
        opacity: 1;
        pointer-events: auto;
        transform: scale(1);
      }

      /* Note header */
      .sn-note-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: linear-gradient(135deg, #facc15 0%, #eab308 100%);
        border-radius: 4px 4px 0 0;
        cursor: move;
        user-select: none;
      }

      .sn-note-header-title {
        font-size: 12px;
        font-weight: 600;
        color: #713f12;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .sn-note-header-actions {
        display: flex;
        gap: 4px;
      }

      .sn-note-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.3);
        color: #713f12;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .sn-note-btn:hover {
        background: rgba(255, 255, 255, 0.5);
      }

      .sn-note-btn svg {
        width: 14px;
        height: 14px;
      }

      /* Note content */
      .sn-note-content {
        padding: 12px;
      }

      .sn-note-textarea {
        width: 100%;
        min-height: 80px;
        padding: 8px;
        border: none;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.5);
        color: #1f2937;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
        outline: none;
        transition: background 0.15s ease;
        box-sizing: border-box;
      }

      .sn-note-textarea:focus {
        background: rgba(255, 255, 255, 0.8);
      }

      .sn-note-textarea::placeholder {
        color: #9ca3af;
      }

      /* Selection overlay */
      .sn-selection-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2147483646;
        pointer-events: none;
      }

      .sn-selection-tooltip {
        position: fixed;
        padding: 8px 12px;
        background: #1f2937;
        color: white;
        font-size: 12px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        pointer-events: none;
        z-index: 2147483647;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      /* Color themes */
      .sn-note.sn-theme-yellow {
        background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
      }
      .sn-note.sn-theme-yellow .sn-note-header {
        background: linear-gradient(135deg, #facc15 0%, #eab308 100%);
      }

      .sn-note.sn-theme-blue {
        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      }
      .sn-note.sn-theme-blue .sn-note-header {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      }
      .sn-note.sn-theme-blue .sn-note-header-title,
      .sn-note.sn-theme-blue .sn-note-btn {
        color: white;
      }

      .sn-note.sn-theme-green {
        background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
      }
      .sn-note.sn-theme-green .sn-note-header {
        background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      }
      .sn-note.sn-theme-green .sn-note-header-title,
      .sn-note.sn-theme-green .sn-note-btn {
        color: white;
      }

      .sn-note.sn-theme-pink {
        background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%);
      }
      .sn-note.sn-theme-pink .sn-note-header {
        background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
      }
      .sn-note.sn-theme-pink .sn-note-header-title,
      .sn-note.sn-theme-pink .sn-note-btn {
        color: white;
      }
      
      /* Note footer / metadata */
      .sn-note-footer {
        border-top: 1px solid rgba(0, 0, 0, 0.1);
        padding: 0;
        font-size: 11px;
      }
      
      .sn-metadata-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        font-size: 11px;
        font-family: inherit;
        text-align: left;
        transition: background 0.15s ease;
      }
      
      .sn-metadata-toggle:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      
      .sn-metadata-chevron {
        width: 12px;
        height: 12px;
        transition: transform 0.2s ease;
        flex-shrink: 0;
      }
      
      .sn-metadata-time {
        flex: 1;
      }
      
      .sn-metadata-panel {
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.03);
        border-top: 1px solid rgba(0, 0, 0, 0.05);
      }
      
      .sn-metadata-panel.sn-hidden {
        display: none;
      }
      
      .sn-metadata-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 3px 0;
        gap: 8px;
      }
      
      .sn-metadata-label {
        color: #9ca3af;
        font-weight: 500;
        flex-shrink: 0;
      }
      
      .sn-metadata-value {
        color: #4b5563;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 180px;
      }
      
      .sn-metadata-url,
      .sn-metadata-selector {
        font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        font-size: 10px;
      }
      
      ${RichEditor.getStyles()}
    `;
  }
  
  /**
   * Load notes for the current page
   */
  async loadNotes() {
    try {
      const response = await this.sendMessage({
        action: 'getNotes',
        url: this.currentUrl
      });
      
      if (response.success && response.notes) {
        response.notes.forEach(noteData => {
          this.createNoteFromData(noteData);
        });
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
   */
  createNoteFromData(noteData) {
    // Find the anchor element
    let anchorElement = document.querySelector(noteData.selector);
    
    // If not found, try fuzzy matching
    if (!anchorElement) {
      log.warn(`Anchor element not found for selector: ${noteData.selector}`);
      
      // Try fuzzy matching
      anchorElement = this.selectorEngine.findBestMatch(noteData.selector, {
        textContent: noteData.anchorText || ''
      });
      
      if (anchorElement) {
        log.debug('Found element using fuzzy matching');
        // Update the selector
        this.handleReanchor(noteData.id, anchorElement);
      } else {
        // Show re-anchor UI
        this.showReanchorUI(noteData);
        return;
      }
    }
    
    // Create note instance
    const note = new StickyNote({
      id: noteData.id,
      anchor: anchorElement,
      selector: noteData.selector,
      content: noteData.content,
      theme: noteData.theme || 'yellow',
      position: noteData.position || { anchor: 'top-right' },
      metadata: noteData.metadata,
      createdAt: noteData.createdAt,
      onSave: (content) => this.handleNoteSave(noteData.id, content),
      onDelete: () => this.handleNoteDelete(noteData.id)
    });
    
    // Add to container and map
    this.container.appendChild(note.element);
    this.notes.set(noteData.id, note);
    
    // Setup visibility observer
    this.visibilityManager.observe(anchorElement, note);
  }
  
  /**
   * Setup message listeners for popup communication
   */
  setupMessageListeners() {
    log.debug(' Adding chrome.runtime.onMessage listener');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      log.debug(' 📨 Message received:', message);
      this.handleMessage(message)
        .then(response => {
          log.debug(' 📤 Sending response:', response);
          sendResponse(response);
        })
        .catch(error => {
          log.error(' ❌ Message handler error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    });
    log.debug(' Message listener registered');
  }
  
  /**
   * Handle incoming messages
   * @param {Object} message - Message object
   */
  async handleMessage(message) {
    log.debug(' Handling action:', message.action);
    
    switch (message.action) {
      case 'ping':
        log.debug(' Ping received, responding with ready');
        return { success: true, ready: true };
      
      case 'enableSelectionMode':
        log.debug(' Enabling selection mode...');
        this.enableSelectionMode();
        log.debug(' Selection mode enabled');
        return { success: true };
      
      case 'disableSelectionMode':
        log.debug(' Disabling selection mode...');
        this.disableSelectionMode();
        return { success: true };
      
      case 'highlightNote':
        log.debug(' Highlighting note:', message.noteId);
        this.highlightNote(message.noteId);
        return { success: true };
      
      case 'pageLoaded':
      case 'urlChanged':
        log.debug(' URL changed:', message.url);
        await this.handleUrlChange(message.url);
        return { success: true };
      
      default:
        log.warn(' Unknown action:', message.action);
        return { success: false, error: 'Unknown action' };
    }
  }
  
  /**
   * Enable element selection mode
   */
  enableSelectionMode() {
    log.debug(' enableSelectionMode() called, current state:', this.isSelectionMode);
    
    if (this.isSelectionMode) {
      log.debug(' Already in selection mode, skipping');
      return;
    }
    
    this.isSelectionMode = true;
    log.debug(' Set isSelectionMode to true');
    
    // Add selection mode class to document
    log.debug(' Adding sn-selection-mode class to body');
    document.body.classList.add('sn-selection-mode');
    
    // Create selection overlay
    log.debug(' Creating SelectionOverlay...');
    this.selectionOverlay = new SelectionOverlay({
      onSelect: (element) => this.handleElementSelect(element),
      onCancel: () => this.disableSelectionMode()
    });
    
    log.debug(' Appending overlay to container');
    this.container.appendChild(this.selectionOverlay.element);
    log.debug(' ✅ Selection mode fully enabled - click an element to add a note');
  }
  
  /**
   * Disable element selection mode
   */
  disableSelectionMode() {
    if (!this.isSelectionMode) return;
    
    this.isSelectionMode = false;
    
    // Remove selection mode class
    document.body.classList.remove('sn-selection-mode');
    
    // Remove selection overlay
    if (this.selectionOverlay) {
      this.selectionOverlay.destroy();
      this.selectionOverlay = null;
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
   * Highlight a specific note
   * @param {string} noteId - Note ID
   */
  highlightNote(noteId) {
    const note = this.notes.get(noteId);
    if (note && note.anchor) {
      // Scroll element into view
      note.anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Force show the note
      note.show();
      
      // Add highlight effect
      note.highlight();
    }
  }
  
  /**
   * Handle URL change (for SPA navigation)
   * @param {string} newUrl - New URL
   */
  async handleUrlChange(newUrl) {
    if (newUrl === this.currentUrl) return;
    
    // Unsubscribe from real-time updates for old URL
    if (this.unsubscribeRealtime) {
      this.unsubscribeRealtime();
      this.unsubscribeRealtime = null;
    }
    
    // Clear existing notes
    this.notes.forEach((note, _id) => {
      this.visibilityManager.unobserve(note.anchor);
      note.destroy();
    });
    this.notes.clear();
    
    // Update current URL
    this.currentUrl = newUrl;
    
    // Load notes for new URL
    await this.loadNotes();
  }
  
  /**
   * Handle real-time note updates
   * @param {Array} updatedNotes - Array of updated notes from Firestore
   */
  handleRealtimeUpdate(updatedNotes) {
    // Create a set of current note IDs
    const currentIds = new Set(this.notes.keys());
    const updatedIds = new Set(updatedNotes.map(note => note.id));
    
    // Remove notes that are no longer present
    currentIds.forEach(id => {
      if (!updatedIds.has(id)) {
        const note = this.notes.get(id);
        if (note) {
          this.visibilityManager.unobserve(note.anchor);
          note.destroy();
          this.notes.delete(id);
        }
      }
    });
    
    // Update or add notes
    updatedNotes.forEach(noteData => {
      const existingNote = this.notes.get(noteData.id);
      
      if (existingNote) {
        // Update existing note content if changed
        if (existingNote.content !== noteData.content) {
          existingNote.textarea.value = noteData.content;
          existingNote.content = noteData.content;
        }
      } else {
        // Create new note
        this.createNoteFromData(noteData);
      }
    });
  }
  
  /**
   * Setup mutation observer for dynamic content
   */
  setupMutationObserver() {
    const observer = new MutationObserver((_mutations) => {
      // Check if any anchor elements were removed
      this.notes.forEach((note, _id) => {
        if (!document.contains(note.anchor)) {
          // Anchor element was removed, try to find it again
          const newAnchor = document.querySelector(note.selector);
          if (newAnchor) {
            note.updateAnchor(newAnchor);
            this.visibilityManager.unobserve(note.anchor);
            this.visibilityManager.observe(newAnchor, note);
          }
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  /**
   * Show re-anchor UI when element is not found
   * @param {Object} noteData - Note data
   */
  showReanchorUI(noteData) {
    // Create floating notification
    const notification = document.createElement('div');
    notification.className = 'sn-reanchor-notification';
    notification.dataset.noteId = noteData.id;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border-radius: 12px;
      padding: 16px;
      width: 300px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      border-left: 4px solid #f59e0b;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; width: 32px; height: 32px; background: #fef3c7; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">Note Anchor Not Found</div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            "${escapeHtml((noteData.content || '').substring(0, 50))}${noteData.content?.length > 50 ? '...' : ''}"
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="sn-reanchor-btn" style="flex: 1; padding: 8px 12px; background: #facc15; color: #713f12; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
              Re-anchor
            </button>
            <button class="sn-dismiss-btn" style="padding: 8px 12px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    `;
    
    this.container.appendChild(notification);
    
    // Handle re-anchor button
    notification.querySelector('.sn-reanchor-btn').addEventListener('click', () => {
      this.container.removeChild(notification);
      this.startReanchorMode(noteData);
    });
    
    // Handle dismiss button
    notification.querySelector('.sn-dismiss-btn').addEventListener('click', () => {
      this.container.removeChild(notification);
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (notification.parentNode === this.container) {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode === this.container) {
            this.container.removeChild(notification);
          }
        }, 300);
      }
    }, 10000);
  }
  
  /**
   * Start re-anchor mode to select a new element
   * @param {Object} noteData - Note data to re-anchor
   */
  startReanchorMode(noteData) {
    this.pendingReanchor = noteData;
    this.enableSelectionMode();
    
    // Show instruction tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'sn-reanchor-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #1f2937;
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      text-align: center;
      box-shadow: 0 20px 25px rgba(0, 0, 0, 0.2);
    `;
    tooltip.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">Select New Anchor Element</div>
      <div style="opacity: 0.8;">Click on an element to re-anchor your note</div>
      <div style="margin-top: 12px; font-size: 12px; opacity: 0.6;">Press ESC to cancel</div>
    `;
    
    this.container.appendChild(tooltip);
    this.reanchorTooltip = tooltip;
    
    // Remove tooltip after a few seconds
    setTimeout(() => {
      if (tooltip.parentNode === this.container) {
        tooltip.style.opacity = '0';
        tooltip.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
          if (tooltip.parentNode === this.container) {
            this.container.removeChild(tooltip);
          }
        }, 500);
      }
    }, 3000);
  }
  
  /**
   * Handle element selection (for new notes and re-anchor mode)
   * @param {Element} element - Selected element
   */
  async handleElementSelect(element) {
    // Disable selection mode
    this.disableSelectionMode();
    
    // Remove reanchor tooltip if present
    if (this.reanchorTooltip && this.reanchorTooltip.parentNode === this.container) {
      this.container.removeChild(this.reanchorTooltip);
      this.reanchorTooltip = null;
    }
    
    // Check if this is a re-anchor operation
    if (this.pendingReanchor) {
      const noteData = this.pendingReanchor;
      this.pendingReanchor = null;
      
      await this.handleReanchor(noteData.id, element);
      
      // Recreate the note with new anchor
      this.createNoteFromData({
        ...noteData,
        selector: this.selectorEngine.generate(element)
      });
      
      return;
    }
    
    // Generate selector for the element
    const selector = this.selectorEngine.generate(element);
    
    if (!selector) {
      log.error('Could not generate selector for element');
      return;
    }
    
    // Create new note with metadata
    const browserInfo = getBrowserInfo();
    const noteData = {
      url: this.currentUrl,
      selector: selector,
      content: '',
      theme: 'yellow',
      position: { anchor: 'top-right' },
      anchorText: element.textContent?.trim().substring(0, 100) || '',
      metadata: {
        url: window.location.href,
        title: document.title,
        browser: `${browserInfo.browser}${browserInfo.version ? ' ' + browserInfo.version : ''}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString()
      }
    };
    
    try {
      // Save to storage
      const response = await this.sendMessage({
        action: 'saveNote',
        note: noteData
      });
      
      if (response.success) {
        // Create the note UI
        this.createNoteFromData(response.note);
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
  
  // escapeHtml is imported from shared/utils.js
}

// Initialize the app when the document is ready
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
