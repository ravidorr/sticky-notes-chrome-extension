/**
 * Real-time Sync Manager
 * Handles subscription management for notes and comments
 */

import { contentLogger as log } from '../../shared/logger.js';

/**
 * Manages real-time subscriptions for notes and comments
 */
export class RealtimeSync {
  /**
   * Create a RealtimeSync instance
   * @param {Object} options - Configuration options
   * @param {Function} options.sendMessage - Function to send messages to background
   * @param {Function} options.isContextInvalidatedError - Function to check context errors
   * @param {Function} options.onNotesUpdate - Callback when notes are updated
   * @param {Function} options.onCommentsUpdate - Callback when comments are updated
   * @param {Function} options.getNotes - Function to get notes map
   */
  constructor(options) {
    this.sendMessage = options.sendMessage;
    this.isContextInvalidatedError = options.isContextInvalidatedError;
    this.onNotesUpdate = options.onNotesUpdate;
    this.onCommentsUpdate = options.onCommentsUpdate;
    this.getNotes = options.getNotes;
  }
  
  /**
   * Subscribe to real-time note updates
   * @param {string} url - Current page URL
   */
  async subscribeToNotes(url) {
    try {
      const response = await this.sendMessage({
        action: 'subscribeToNotes',
        url
      });
      
      if (response.success) {
        log.debug('Subscribed to real-time note updates');
      } else {
        log.warn('Failed to subscribe to notes:', response.error);
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to subscribe to notes:', error);
      }
    }
  }
  
  /**
   * Unsubscribe from real-time note updates
   */
  async unsubscribeFromNotes() {
    try {
      await this.sendMessage({ action: 'unsubscribeFromNotes' });
      log.debug('Unsubscribed from real-time note updates');
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to unsubscribe from notes:', error);
      }
    }
  }
  
  /**
   * Subscribe to real-time comment updates for a note
   * @param {string} noteId - Note ID
   */
  async subscribeToComments(noteId) {
    try {
      const response = await this.sendMessage({
        action: 'subscribeToComments',
        noteId
      });
      
      if (response.success) {
        const notes = this.getNotes();
        const note = notes.get(noteId);
        if (note) {
          note.commentSubscribed = true;
        }
        log.debug('Subscribed to real-time comment updates for note:', noteId);
      } else {
        log.warn('Failed to subscribe to comments:', response.error);
      }
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to subscribe to comments:', error);
      }
    }
  }
  
  /**
   * Unsubscribe from real-time comment updates for a note
   * @param {string} noteId - Note ID
   */
  async unsubscribeFromComments(noteId) {
    try {
      await this.sendMessage({
        action: 'unsubscribeFromComments',
        noteId
      });
      
      const notes = this.getNotes();
      const note = notes.get(noteId);
      if (note) {
        note.commentSubscribed = false;
      }
      log.debug('Unsubscribed from real-time comment updates for note:', noteId);
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to unsubscribe from comments:', error);
      }
    }
  }
  
  /**
   * Unsubscribe from all comment subscriptions
   */
  async unsubscribeFromAllComments() {
    const notes = this.getNotes();
    for (const note of notes.values()) {
      if (note.commentSubscribed) {
        await this.unsubscribeFromComments(note.id);
      }
    }
  }
  
  /**
   * Handle real-time notes update from background
   * @param {Array} notes - Updated notes array
   */
  handleNotesUpdate(notes) {
    if (!notes) return;
    this.onNotesUpdate(notes);
  }
  
  /**
   * Handle real-time comments update from background
   * @param {string} noteId - Note ID
   * @param {Array} comments - Updated comments array
   */
  handleCommentsUpdate(noteId, comments) {
    this.onCommentsUpdate(noteId, comments);
  }
}
