/**
 * Real-time Sync Manager
 * Handles subscription management for notes and comments
 */

import { contentLogger as log } from '../../shared/logger.js';

// Name the content script gives its port. The worker does not inspect it: it only has to accept
// the connection so that Chrome disconnects the port when the worker is stopped.
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
    // Bumped by unsubscribeFromNotes so an in-flight subscribe can tell it was cancelled
    this.generation = 0;
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
  
  /**
   * Schedule a resubscribe with exponential backoff (1s, 2s, 4s, 8s, 16s)
   */
  _scheduleResubscribe() {
    if (this.resubscribeTimer) return;
    const delay = RESUBSCRIBE_BASE_DELAY_MS * 2 ** this.resubscribeAttempts;
    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      this._resubscribe();
    }, delay);
  }
  
  /**
   * Restore the notes subscription, then the comment subscriptions of the notes that had one.
   * A failed comment subscription is not retried.
   */
  async _resubscribe() {
    const generation = this.generation;
    try {
      const restored = await this.subscribeToNotes(this.notesUrl);
      // Cancelled (even if a new subscription followed) or the extension context is gone
      if (generation !== this.generation || !this.notesUrl) return;
      if (!restored) {
        this.resubscribeAttempts += 1;
        if (this.resubscribeAttempts < MAX_RESUBSCRIBE_ATTEMPTS) {
          this._scheduleResubscribe();
        } else {
          log.error('Giving up on restoring real-time sync');
        }
        return;
      }
      for (const note of [...this.getNotes().values()]) {
        if (generation !== this.generation) return;
        if (note.commentSubscribed) {
          await this.subscribeToComments(note.id);
        }
      }
    } catch (error) {
      log.error('Failed to restore real-time sync:', error);
    }
  }
  
  /**
   * Subscribe to real-time note updates
   * @param {string} url - Current page URL
   * @returns {Promise<boolean>} True when the background worker holds the subscription
   */
  async subscribeToNotes(url) {
    const generation = this.generation;
    try {
      const response = await this.sendMessage({
        action: 'subscribeToNotes',
        url
      });
      
      if (response.cancelled) {
        log.debug('Note subscription was cancelled in the background worker');
        return false;
      }
      
      if (response.success) {
        log.debug('Subscribed to real-time note updates');
        // Do not track a subscription that was cancelled while the request was in flight
        if (generation === this.generation) {
          this.notesUrl = url;
          this.resubscribeAttempts = 0;
          this._openPort();
        }
        return true;
      }
      log.warn('Failed to subscribe to notes:', response.error);
    } catch (error) {
      if (this.isContextInvalidatedError(error)) {
        // The extension was reloaded: this script is orphaned, so stop restoring anything
        this.notesUrl = null;
        this._closePort();
      } else {
        log.error('Failed to subscribe to notes:', error);
      }
    }
    return false;
  }
  
  /**
   * Unsubscribe from real-time note updates
   */
  async unsubscribeFromNotes() {
    this.generation += 1;
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
      
      if (response.cancelled) {
        log.debug('Comment subscription was cancelled in the background worker:', noteId);
        return;
      }
      
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
