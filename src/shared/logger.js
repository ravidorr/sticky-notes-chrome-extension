/**
 * Debug Logger
 * Conditional logging that can be disabled in production.
 *
 * The effective level of a logger is, in order: its explicit debugMode option, the runtime level
 * set from the logLevel preference (setLogLevel), then the build-time debug mode.
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
 * Check whether debug mode is enabled for a Vite env object
 * @param {Object} [env] - import.meta.env, undefined outside a Vite build
 * @returns {boolean} True unless VITE_DEBUG_MODE is 'false'
 */
export function isDebugEnabled(env) {
  return !env || env.VITE_DEBUG_MODE !== 'false';
}

/**
 * Detect if debug mode is enabled from environment
 * @returns {boolean} True if debug mode is enabled
 */
export function detectDebugMode() {
  // Check if debug mode is enabled
  // In production, set VITE_DEBUG_MODE=false in .env
  // import.meta.env is undefined in the test environment
  return isDebugEnabled(import.meta.env);
}

// Module-level debug mode (can be overridden for testing)
let _debugMode = detectDebugMode();

/**
 * Runtime log level names (as stored in the logLevel preference) mapped to LOG_LEVELS values.
 * The names match the ones accepted by the Firestore SDK's setLogLevel().
 */
const RUNTIME_LEVEL_VALUES = {
  silent: LOG_LEVELS.NONE,
  error: LOG_LEVELS.ERROR,
  warn: LOG_LEVELS.WARN,
  info: LOG_LEVELS.INFO,
  debug: LOG_LEVELS.DEBUG
};

/**
 * Valid log level names
 */
export const LOG_LEVEL_NAMES = Object.keys(RUNTIME_LEVEL_VALUES);

// Runtime override set from the logLevel preference (null = use debug mode)
let _runtimeLevel = null;
const _levelListeners = new Set();

/**
 * Set the runtime log level for every logger (except ones created with an explicit debugMode)
 * @param {string} name - One of LOG_LEVEL_NAMES; anything else clears the override
 */
export function setLogLevel(name) {
  _runtimeLevel = LOG_LEVEL_NAMES.includes(name) ? name : null;
  _levelListeners.forEach(listener => {
    try {
      listener(_runtimeLevel);
    } catch (error) {
      // One failing listener must not stop the others from seeing the new level
      console.error('[Logger] Log level listener failed:', error);
    }
  });
}

/**
 * Get the runtime log level name
 * @returns {string|null} Level name, or null when no override is set
 */
export function getLogLevelName() {
  return _runtimeLevel;
}

/**
 * Subscribe to runtime log level changes
 * @param {Function} listener - Called with the new level name (or null)
 * @returns {Function} Unsubscribe function
 */
export function onLogLevelChange(listener) {
  _levelListeners.add(listener);
  return () => _levelListeners.delete(listener);
}

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
  const explicitLevel = options.debugMode !== undefined ? getLogLevel(options.debugMode) : null;
  // Read the level on every call so a runtime change applies to existing loggers
  const activeLevel = () => {
    if (explicitLevel !== null) return explicitLevel;
    return _runtimeLevel !== null ? RUNTIME_LEVEL_VALUES[_runtimeLevel] : getLogLevel(_debugMode);
  };
  
  return {
    /**
     * Debug log - only when the effective level is debug
     * @param  {...any} args - Arguments to log
     */
    debug(...args) {
      if (activeLevel() <= LOG_LEVELS.DEBUG) {
        console.log(prefix, ...args);
      }
    },
    
    /**
     * Info log
     * @param  {...any} args - Arguments to log
     */
    info(...args) {
      if (activeLevel() <= LOG_LEVELS.INFO) {
        console.info(prefix, ...args);
      }
    },
    
    /**
     * Warning log
     * @param  {...any} args - Arguments to log
     */
    warn(...args) {
      if (activeLevel() <= LOG_LEVELS.WARN) {
        console.warn(prefix, ...args);
      }
    },
    
    /**
     * Error log - shown unless the level is silent
     * @param  {...any} args - Arguments to log
     */
    error(...args) {
      if (activeLevel() <= LOG_LEVELS.ERROR) {
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
      if (activeLevel() <= levelValue) {
        const method = level.toLowerCase();
        if (console[method]) {
          console[method](prefix, ...args);
        } else {
          console.log(prefix, ...args);
        }
      }
    },
    
    /**
     * Group logs (only when the effective level is debug)
     * @param {string} label - Group label
     */
    group(label) {
      if (activeLevel() <= LOG_LEVELS.DEBUG) {
        console.group(`${prefix} ${label}`);
      }
    },
    
    /**
     * End log group
     */
    groupEnd() {
      if (activeLevel() <= LOG_LEVELS.DEBUG) {
        console.groupEnd();
      }
    },
    
    /**
     * Time an operation (only when the effective level is debug)
     * @param {string} label - Timer label
     */
    time(label) {
      if (activeLevel() <= LOG_LEVELS.DEBUG) {
        console.time(`${prefix} ${label}`);
      }
    },
    
    /**
     * End timer
     * @param {string} label - Timer label
     */
    timeEnd(label) {
      if (activeLevel() <= LOG_LEVELS.DEBUG) {
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
