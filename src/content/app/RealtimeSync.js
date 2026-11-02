/**
 * Real-time Sync Manager
 * Handles subscription management for notes and comments
 */

import { contentLogger as log } from '../../shared/logger.js';

// Port name the background worker accepts; it disconnects when the worker is stopped
export const REALTIME_PORT_NAME = 'realtimeSync';

// Delay before resubscribing after the worker stops, doubled on each failed attempt
const RESUBSCRIBE_BASE_DELAY_MS = 1000;
const MAX_RESUBSCRIBE_ATTEMPTS = 5;

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
   * @param {Function} [options.connect] - Opens a runtime port; when set, a stopped background
   *   worker (which drops its Firestore listeners) is detected and the subscriptions are restored
   */
  constructor(options) {
    this.sendMessage = options.sendMessage;
    this.isContextInvalidatedError = options.isContextInvalidatedError;
    this.onNotesUpdate = options.onNotesUpdate;
    this.onCommentsUpdate = options.onCommentsUpdate;
    this.getNotes = options.getNotes;
    this.connect = options.connect;
    this.port = null;
    this.notesUrl = null;
    this.resubscribeTimer = null;
    this.resubscribeAttempts = 0;
  }
  
  /**
   * Open a port to the background worker. Chrome disconnects it when the worker is stopped,
   * which is the signal that the worker's Firestore listeners are gone.
   */
  _openPort() {
    if (!this.connect || this.port) return;
    try {
      const port = this.connect({ name: REALTIME_PORT_NAME });
      this.port = port;
      port.onDisconnect.addListener(() => this._handlePortDisconnect(port));
    } catch (error) {
      this.port = null;
      if (!this.isContextInvalidatedError(error)) {
        log.warn('Failed to open realtime port:', error);
      }
    }
  }
  
  /**
   * Close the port without triggering a resubscribe
   */
  _closePort() {
    clearTimeout(this.resubscribeTimer);
    this.resubscribeTimer = null;
    this.resubscribeAttempts = 0;
    if (!this.port) return;
    const port = this.port;
    this.port = null;
    try {
      port.disconnect();
    } catch (_error) {
      // Already disconnected
    }
  }
  
  /**
   * The background worker stopped: restore the subscriptions it held for this frame
   * @param {Object} port - The port that disconnected
   */
  _handlePortDisconnect(port) {
    if (this.port !== port) return;
    this.port = null;
    if (this.notesUrl) {
      log.debug('Background worker stopped, resubscribing');
      this._scheduleResubscribe();
    }
  }
  
  _scheduleResubscribe() {
    if (this.resubscribeTimer) return;
    const delay = RESUBSCRIBE_BASE_DELAY_MS * 2 ** this.resubscribeAttempts;
    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      this._resubscribe();
    }, delay);
  }
  
  async _resubscribe() {
    const restored = await this.subscribeToNotes(this.notesUrl);
    if (!restored) {
      this.resubscribeAttempts += 1;
      if (this.resubscribeAttempts < MAX_RESUBSCRIBE_ATTEMPTS) {
        this._scheduleResubscribe();
      } else {
        log.warn('Giving up on restoring real-time sync');
      }
      return;
    }
    this.resubscribeAttempts = 0;
    for (const note of this.getNotes().values()) {
      if (note.commentSubscribed) {
        await this.subscribeToComments(note.id);
      }
    }
  }
  
  /**
   * Subscribe to real-time note updates
   * @param {string} url - Current page URL
   * @returns {Promise<boolean>} True when the background worker holds the subscription
   */
  async subscribeToNotes(url) {
    try {
      const response = await this.sendMessage({
        action: 'subscribeToNotes',
        url
      });
      
      if (response.success) {
        log.debug('Subscribed to real-time note updates');
        this.notesUrl = url;
        this._openPort();
        return true;
      }
      log.warn('Failed to subscribe to notes:', response.error);
    } catch (error) {
      if (!this.isContextInvalidatedError(error)) {
        log.error('Failed to subscribe to notes:', error);
      }
    }
    return false;
  }
  
  /**
   * Unsubscribe from real-time note updates
   */
  async unsubscribeFromNotes() {
    this.notesUrl = null;
    this._closePort();
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
