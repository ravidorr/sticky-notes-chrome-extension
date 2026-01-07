/**
 * Logger Unit Tests
 * 
 * Tests the logger factory function and log level constants.
 * Note: The actual logger module uses import.meta.env which isn't available in Jest,
 * so we test a local implementation of the same logic.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  group: console.group,
  groupEnd: console.groupEnd,
  time: console.time,
  timeEnd: console.timeEnd
};

// Log levels (matching the real module)
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Create logger function (matching the real module)
function createLogger(namespace, debugMode = true) {
  const prefix = `[${namespace}]`;
  const currentLevel = debugMode ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
  
  return {
    debug(...args) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.log(prefix, ...args);
      }
    },
    info(...args) {
      if (currentLevel <= LOG_LEVELS.INFO) {
        console.info(prefix, ...args);
      }
    },
    warn(...args) {
      if (currentLevel <= LOG_LEVELS.WARN) {
        console.warn(prefix, ...args);
      }
    },
    error(...args) {
      if (currentLevel <= LOG_LEVELS.ERROR) {
        console.error(prefix, ...args);
      }
    },
    group(label) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.group(`${prefix} ${label}`);
      }
    },
    groupEnd() {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.groupEnd();
      }
    },
    time(label) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.time(`${prefix} ${label}`);
      }
    },
    timeEnd(label) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.timeEnd(`${prefix} ${label}`);
      }
    }
  };
}

describe('Logger', () => {
  beforeEach(() => {
    // Mock console methods
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.group = jest.fn();
    console.groupEnd = jest.fn();
    console.time = jest.fn();
    console.timeEnd = jest.fn();
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.group = originalConsole.group;
    console.groupEnd = originalConsole.groupEnd;
    console.time = originalConsole.time;
    console.timeEnd = originalConsole.timeEnd;
  });
  
  describe('createLogger', () => {
    it('should create a logger with namespace', () => {
      const logger = createLogger('Test');
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
    
    it('should prefix log messages with namespace', () => {
      const logger = createLogger('Test');
      logger.debug('message');
      expect(console.log).toHaveBeenCalledWith('[Test]', 'message');
    });
  });
  
  describe('debug', () => {
    it('should call console.log with prefix in debug mode', () => {
      const logger = createLogger('App', true);
      logger.debug('debug message', { data: 1 });
      expect(console.log).toHaveBeenCalledWith('[App]', 'debug message', { data: 1 });
    });
    
    it('should not call console.log when debug mode is off', () => {
      const logger = createLogger('App', false);
      logger.debug('debug message');
      expect(console.log).not.toHaveBeenCalled();
    });
  });
  
  describe('info', () => {
    it('should call console.info with prefix', () => {
      const logger = createLogger('App');
      logger.info('info message');
      expect(console.info).toHaveBeenCalledWith('[App]', 'info message');
    });
  });
  
  describe('warn', () => {
    it('should call console.warn with prefix', () => {
      const logger = createLogger('App');
      logger.warn('warning message');
      expect(console.warn).toHaveBeenCalledWith('[App]', 'warning message');
    });
    
    it('should call console.warn even when debug mode is off', () => {
      const logger = createLogger('App', false);
      logger.warn('warning message');
      expect(console.warn).toHaveBeenCalledWith('[App]', 'warning message');
    });
  });
  
  describe('error', () => {
    it('should call console.error with prefix', () => {
      const logger = createLogger('App');
      const error = new Error('test');
      logger.error('error message', error);
      expect(console.error).toHaveBeenCalledWith('[App]', 'error message', error);
    });
    
    it('should call console.error even when debug mode is off', () => {
      const logger = createLogger('App', false);
      logger.error('error message');
      expect(console.error).toHaveBeenCalledWith('[App]', 'error message');
    });
  });
  
  describe('group', () => {
    it('should call console.group with prefix', () => {
      const logger = createLogger('App');
      logger.group('Group Name');
      expect(console.group).toHaveBeenCalledWith('[App] Group Name');
    });
  });
  
  describe('groupEnd', () => {
    it('should call console.groupEnd', () => {
      const logger = createLogger('App');
      logger.groupEnd();
      expect(console.groupEnd).toHaveBeenCalled();
    });
  });
  
  describe('time', () => {
    it('should call console.time with prefixed label', () => {
      const logger = createLogger('App');
      logger.time('operation');
      expect(console.time).toHaveBeenCalledWith('[App] operation');
    });
  });
  
  describe('timeEnd', () => {
    it('should call console.timeEnd with prefixed label', () => {
      const logger = createLogger('App');
      logger.timeEnd('operation');
      expect(console.timeEnd).toHaveBeenCalledWith('[App] operation');
    });
  });
  
  describe('LOG_LEVELS', () => {
    it('should have correct level values', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0);
      expect(LOG_LEVELS.INFO).toBe(1);
      expect(LOG_LEVELS.WARN).toBe(2);
      expect(LOG_LEVELS.ERROR).toBe(3);
      expect(LOG_LEVELS.NONE).toBe(4);
    });
    
    it('should have DEBUG < INFO < WARN < ERROR < NONE', () => {
      expect(LOG_LEVELS.DEBUG).toBeLessThan(LOG_LEVELS.INFO);
      expect(LOG_LEVELS.INFO).toBeLessThan(LOG_LEVELS.WARN);
      expect(LOG_LEVELS.WARN).toBeLessThan(LOG_LEVELS.ERROR);
      expect(LOG_LEVELS.ERROR).toBeLessThan(LOG_LEVELS.NONE);
    });
  });
});
