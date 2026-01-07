/**
 * Debug Logger
 * Conditional logging that can be disabled in production
 */

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

/**
 * Detect if debug mode is enabled from environment
 * @returns {boolean} True if debug mode is enabled
 */
export function detectDebugMode() {
  // Check if debug mode is enabled
  // In production, set VITE_DEBUG_MODE=false in .env
  // Handle case where import.meta.env is undefined (e.g., in test environment)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_DEBUG_MODE !== 'false';
  }
  return true;
}

// Module-level debug mode (can be overridden for testing)
let _debugMode = detectDebugMode();

/**
 * Set debug mode (primarily for testing)
 * @param {boolean} enabled - Whether debug mode is enabled
 */
export function setDebugMode(enabled) {
  _debugMode = enabled;
}

/**
 * Get current log level based on debug mode
 * @param {boolean} debugMode - Debug mode flag
 * @returns {number} Current log level
 */
export function getLogLevel(debugMode = _debugMode) {
  return debugMode ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
}

/**
 * Create a namespaced logger
 * @param {string} namespace - Logger namespace (e.g., 'StickyNotes', 'Firestore')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.debugMode - Override debug mode for this logger
 * @returns {Object} Logger instance with log methods
 */
export function createLogger(namespace, options = {}) {
  const prefix = `[${namespace}]`;
  const useDebugMode = options.debugMode !== undefined ? options.debugMode : _debugMode;
  const currentLevel = getLogLevel(useDebugMode);
  
  return {
    /**
     * Debug log - only in debug mode
     * @param  {...any} args - Arguments to log
     */
    debug(...args) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.log(prefix, ...args);
      }
    },
    
    /**
     * Info log
     * @param  {...any} args - Arguments to log
     */
    info(...args) {
      if (currentLevel <= LOG_LEVELS.INFO) {
        console.info(prefix, ...args);
      }
    },
    
    /**
     * Warning log
     * @param  {...any} args - Arguments to log
     */
    warn(...args) {
      if (currentLevel <= LOG_LEVELS.WARN) {
        console.warn(prefix, ...args);
      }
    },
    
    /**
     * Error log - always shown
     * @param  {...any} args - Arguments to log
     */
    error(...args) {
      if (currentLevel <= LOG_LEVELS.ERROR) {
        console.error(prefix, ...args);
      }
    },
    
    /**
     * Log with custom level check
     * @param {string} level - Log level ('debug', 'info', 'warn', 'error')
     * @param  {...any} args - Arguments to log
     */
    log(level, ...args) {
      const levelValue = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.DEBUG;
      if (currentLevel <= levelValue) {
        const method = level.toLowerCase();
        if (console[method]) {
          console[method](prefix, ...args);
        } else {
          console.log(prefix, ...args);
        }
      }
    },
    
    /**
     * Group logs (only in debug mode)
     * @param {string} label - Group label
     */
    group(label) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.group(`${prefix} ${label}`);
      }
    },
    
    /**
     * End log group
     */
    groupEnd() {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.groupEnd();
      }
    },
    
    /**
     * Time a operation (only in debug mode)
     * @param {string} label - Timer label
     */
    time(label) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.time(`${prefix} ${label}`);
      }
    },
    
    /**
     * End timer
     * @param {string} label - Timer label
     */
    timeEnd(label) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.timeEnd(`${prefix} ${label}`);
      }
    }
  };
}

// Pre-configured loggers for common namespaces
export const backgroundLogger = createLogger('Background');
export const contentLogger = createLogger('StickyNotes');
export const firestoreLogger = createLogger('Firestore');
export const popupLogger = createLogger('Popup');

// Export debug mode flag for external checks
export const isDebugMode = () => _debugMode;

// Export log levels for external configuration
export { LOG_LEVELS };
