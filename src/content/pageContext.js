/**
 * Page Context Script
 * Runs in the MAIN world (page context) to capture console errors
 * This script has access to the page's console object
 * 
 * IMPORTANT: This script runs at document_start, before the content script's
 * ConsoleCapture listener is ready (which runs at document_idle). We buffer
 * errors until the listener signals readiness via window.__stickyNotesListenerReady.
 */

(function() {
  // Avoid double initialization
  if (window.__stickyNotesConsoleCapture) return;
  window.__stickyNotesConsoleCapture = true;
  
  // Maximum number of errors to buffer before listener is ready
  // This prevents memory issues if many errors occur before initialization
  const MAX_BUFFER_SIZE = 50;
  
  // Initialize the error buffer for errors that occur before listener is ready
  // ConsoleCapture.js will read from this buffer when it initializes
  window.__stickyNotesErrorBuffer = [];
  
  /**
   * Send error to content script, buffering if listener is not ready.
   * The content script's ConsoleCapture sets window.__stickyNotesListenerReady = true
   * when it's ready to receive events directly.
   */
  function sendError(errorData) {
    if (window.__stickyNotesListenerReady) {
      // Listener is ready, dispatch event directly
      window.dispatchEvent(new CustomEvent('__stickyNotesError', {
        detail: errorData
      }));
    } else {
      // Listener not ready yet, buffer the error
      // ConsoleCapture.processBufferedErrors() will process these when ready
      if (window.__stickyNotesErrorBuffer.length < MAX_BUFFER_SIZE) {
        window.__stickyNotesErrorBuffer.push(errorData);
      }
      // If buffer is full, silently drop oldest errors to make room
      else {
        window.__stickyNotesErrorBuffer.shift();
        window.__stickyNotesErrorBuffer.push(errorData);
      }
    }
  }
  
  // Convert any value to a useful string representation
  function stringify(arg) {
    try {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (arg instanceof Error) {
        return arg.message + (arg.stack ? '\n' + arg.stack : '');
      }
      if (arg instanceof Element) {
        const id = arg.id ? '#' + arg.id : '';
        const cls = arg.className && typeof arg.className === 'string' 
          ? '.' + arg.className.trim().split(/\s+/).join('.') 
          : '';
        return arg.tagName.toLowerCase() + id + cls;
      }
      if (arg instanceof ShadowRoot) {
        const host = arg.host;
        return 'ShadowRoot(' + (host ? host.tagName.toLowerCase() : 'unknown') + ')';
      }
      if (typeof arg === 'object') {
        try {
          const str = JSON.stringify(arg, null, 0);
          return str.length > 200 ? str.substring(0, 197) + '...' : str;
        } catch {
          // Circular reference or other JSON error
          return Object.prototype.toString.call(arg);
        }
      }
      return String(arg);
    } catch {
      return '[Unable to stringify]';
    }
  }
  
  // Capture console.error
  const originalError = console.error;
  console.error = function() {
    const args = Array.prototype.slice.call(arguments);
    const errorData = {
      type: 'console.error',
      message: args.map(stringify).join(' '),
      timestamp: Date.now()
    };
    sendError(errorData);
    return originalError.apply(console, args);
  };
  
  // Capture console.warn
  const originalWarn = console.warn;
  console.warn = function() {
    const args = Array.prototype.slice.call(arguments);
    const errorData = {
      type: 'console.warn',
      message: args.map(stringify).join(' '),
      timestamp: Date.now()
    };
    sendError(errorData);
    return originalWarn.apply(console, args);
  };
  
  // Capture uncaught exceptions
  window.addEventListener('error', (event) => {
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
  window.addEventListener('unhandledrejection', (event) => {
    let message = 'Unhandled Promise Rejection';
    try {
      if (event.reason instanceof Error) {
        message = event.reason.message + (event.reason.stack ? '\n' + event.reason.stack : '');
      } else if (event.reason) {
        message = stringify(event.reason);
      }
    } catch {
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
