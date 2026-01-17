/**
 * Page Context Script
 * Runs in the MAIN world (page context) to capture console errors
 * This script has access to the page's console object
 */

(function() {
  // Avoid double initialization
  if (window.__stickyNotesConsoleCapture) return;
  window.__stickyNotesConsoleCapture = true;
  
  const MAX_ERRORS = 20;
  
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
      message: args.map((arg) => {
        try {
          if (arg instanceof Error) {
            return arg.message + (arg.stack ? '\n' + arg.stack : '');
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
  
  // Capture console.warn (useful for warnings)
  const originalWarn = console.warn;
  console.warn = function(...args) {
    const errorData = {
      type: 'console.warn',
      message: args.map((arg) => {
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
