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
   * Initialize console capture by injecting script into page context
   */
  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    // Listen for errors sent from page context
    window.addEventListener('__stickyNotesError', this.handleCapturedError.bind(this));
    
    // Inject the capture script into page context
    this.injectCaptureScript();
    
    log.debug('ConsoleCapture initialized');
  }
  
  /**
   * Inject script into page context to capture console errors
   * This is necessary because console methods exist in the page context,
   * not the content script's isolated world
   */
  injectCaptureScript() {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        // Avoid double initialization
        if (window.__stickyNotesConsoleCapture) return;
        window.__stickyNotesConsoleCapture = true;
        
        const MAX_ERRORS = ${MAX_ERRORS};
        const errors = [];
        
        function sendError(errorData) {
          // Send to content script via custom event
          window.dispatchEvent(new CustomEvent('__stickyNotesError', {
            detail: errorData
          }));
        }
        
        // Capture console.error
        const originalError = console.error;
        console.error = function(...args) {
          const errorData = {
            type: 'console.error',
            message: args.map(function(arg) {
              try {
                if (arg instanceof Error) {
                  return arg.message + (arg.stack ? '\\n' + arg.stack : '');
                }
                return String(arg);
              } catch (ex) {
                return '[Unable to stringify]';
              }
            }).join(' '),
            timestamp: Date.now()
          };
          sendError(errorData);
          return originalError.apply(console, args);
        };
        
        // Capture console.warn (optional, useful for warnings)
        const originalWarn = console.warn;
        console.warn = function(...args) {
          const errorData = {
            type: 'console.warn',
            message: args.map(function(arg) {
              try {
                return String(arg);
              } catch (ex) {
                return '[Unable to stringify]';
              }
            }).join(' '),
            timestamp: Date.now()
          };
          sendError(errorData);
          return originalWarn.apply(console, args);
        };
        
        // Capture uncaught exceptions
        window.addEventListener('error', function(event) {
          const errorData = {
            type: 'exception',
            message: event.message || 'Unknown error',
            filename: event.filename || '',
            line: event.lineno || 0,
            col: event.colno || 0,
            timestamp: Date.now()
          };
          sendError(errorData);
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', function(event) {
          var message = 'Unhandled Promise Rejection';
          try {
            if (event.reason instanceof Error) {
              message = event.reason.message + (event.reason.stack ? '\\n' + event.reason.stack : '');
            } else if (event.reason) {
              message = String(event.reason);
            }
          } catch (ex) {
            message = 'Unhandled Promise Rejection (unable to get details)';
          }
          
          const errorData = {
            type: 'unhandledrejection',
            message: message,
            timestamp: Date.now()
          };
          sendError(errorData);
        });
      })();
    `;
    
    // Inject at document start to capture early errors
    const target = document.head || document.documentElement;
    target.insertBefore(script, target.firstChild);
    
    // Remove script element after injection (it's already executed)
    script.remove();
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
