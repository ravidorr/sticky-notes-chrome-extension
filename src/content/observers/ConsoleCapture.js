/**
 * Console Error Capture
 * Captures console errors and uncaught exceptions from the page
 * for inclusion in bug report metadata
 */

import { contentLogger as log } from '../../shared/logger.js';

/**
 * Maximum number of errors to store
 */
const MAX_ERRORS = 20;

/**
 * Manages console error capture
 */
export class ConsoleCapture {
  constructor() {
    this.errors = [];
    this.isInitialized = false;
  }
  
  /**
   * Initialize console capture
   * Listens for errors sent from the page context script (pageContext.js)
   * which runs in the MAIN world and captures console errors
   */
  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    // Listen for errors sent from page context via custom events
    // The pageContext.js script (running in MAIN world) dispatches these
    window.addEventListener('__stickyNotesError', this.handleCapturedError.bind(this));
    
    log.debug('ConsoleCapture initialized - listening for page context errors');
  }
  
  /**
   * Handle error captured from page context
   * @param {CustomEvent} event - Custom event with error data
   */
  handleCapturedError(event) {
    const errorData = event.detail;
    if (!errorData) return;
    
    this.errors.push(errorData);
    
    // Keep only the most recent errors
    if (this.errors.length > MAX_ERRORS) {
      this.errors.shift();
    }
    
    log.debug('Captured error:', errorData.type, errorData.message.substring(0, 100));
  }
  
  /**
   * Get all captured errors
   * @returns {Array} Array of error objects
   */
  getErrors() {
    return [...this.errors];
  }
  
  /**
   * Get recent errors (last N)
   * @param {number} count - Number of errors to return
   * @returns {Array} Array of error objects
   */
  getRecentErrors(count = 5) {
    return this.errors.slice(-count);
  }
  
  /**
   * Clear all captured errors
   */
  clear() {
    this.errors = [];
  }
  
  /**
   * Get error count
   * @returns {number} Number of captured errors
   */
  getCount() {
    return this.errors.length;
  }
  
  /**
   * Format errors for display in metadata
   * @param {number} maxErrors - Maximum errors to include
   * @returns {string} Formatted error string
   */
  formatForDisplay(maxErrors = 3) {
    const recent = this.getRecentErrors(maxErrors);
    if (recent.length === 0) return '';
    
    return recent.map(err => {
      const type = err.type === 'console.error' ? 'Error' : 
                   err.type === 'console.warn' ? 'Warn' :
                   err.type === 'exception' ? 'Exception' :
                   err.type === 'unhandledrejection' ? 'Promise' : err.type;
      const msg = err.message.length > 80 ? err.message.substring(0, 77) + '...' : err.message;
      return `[${type}] ${msg}`;
    }).join('\n');
  }
  
  /**
   * Get errors formatted for bug report
   * @returns {Array} Array of formatted error objects
   */
  getForBugReport() {
    return this.errors.map(err => ({
      type: err.type,
      message: err.message,
      timestamp: new Date(err.timestamp).toISOString(),
      ...(err.filename && { filename: err.filename }),
      ...(err.line && { line: err.line }),
      ...(err.col && { col: err.col })
    }));
  }
}

// Singleton instance
let instance = null;

/**
 * Get the ConsoleCapture singleton instance
 * @returns {ConsoleCapture} The singleton instance
 */
export function getConsoleCapture() {
  if (!instance) {
    instance = new ConsoleCapture();
  }
  return instance;
}
