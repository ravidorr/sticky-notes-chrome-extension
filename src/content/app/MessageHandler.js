/**
 * Message Handler
 * Handles incoming messages from popup and background scripts
 */

import { contentLogger as log } from '../../shared/logger.js';

/**
 * Handles message routing for the content script
 */
export class MessageHandler {
  /**
   * Create a MessageHandler instance
   * @param {Object} options - Configuration options
   * @param {Object} options.app - Reference to main app for callbacks
   */
  constructor(options) {
    this.app = options.app;
  }
  
  /**
   * Setup message listeners for popup communication
   */
  setup() {
    log.debug(' Adding chrome.runtime.onMessage listener');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      log.debug('Message received:', message);
      this.handleMessage(message)
        .then(response => {
          log.debug('Sending response:', response);
          sendResponse(response);
        })
        .catch(error => {
          log.error('Message handler error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    });
    log.debug(' Message listener registered');
  }
  
  /**
   * Handle incoming messages
   * @param {Object} message - Message object
   * @returns {Promise<Object>} Response
   */
  async handleMessage(message) {
    log.debug(' Handling action:', message.action);
    
    switch (message.action) {
      case 'ping':
        log.debug(' Ping received, responding with ready');
        return { success: true, ready: true };
      
      case 'enableSelectionMode':
        log.debug(' Enabling selection mode...');
        this.app.enableSelectionMode();
        log.debug(' Selection mode enabled');
        return { success: true };
      
      case 'disableSelectionMode':
        log.debug(' Disabling selection mode...');
        this.app.disableSelectionMode();
        return { success: true };
      
      case 'highlightNote':
        log.debug(' Highlighting note:', message.noteId);
        this.app.highlightNote(message.noteId);
        return { success: true };
      
      case 'pageLoaded':
      case 'urlChanged':
        log.debug(' URL changed:', message.url);
        await this.app.handleUrlChange(message.url);
        return { success: true };
      
      case 'userChanged':
        log.debug(' User changed:', message.user?.email || 'logged out');
        await this.app.handleUserChange(message.user);
        return { success: true };
      
      // Real-time update messages from background
      case 'notesUpdated':
        log.debug(' Notes updated, count:', message.notes?.length);
        this.app.realtimeSync.handleNotesUpdate(message.notes);
        return { success: true };
      
      case 'commentsUpdated':
        log.debug(' Comments updated for note:', message.noteId);
        this.app.realtimeSync.handleCommentsUpdate(message.noteId, message.comments);
        return { success: true };
      
      case 'subscriptionError':
        log.error(' Subscription error:', message.type, message.error);
        return { success: true };
      
      default:
        log.warn(' Unknown action:', message.action);
        return { success: false, error: 'Unknown action' };
    }
  }
}
