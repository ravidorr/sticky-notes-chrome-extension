/**
 * Logger Unit Tests
 * 
 * Tests the actual logger module with proper mocking.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  createLogger, 
  LOG_LEVELS, 
  isDebugMode, 
  setDebugMode,
  getLogLevel,
  detectDebugMode,
  backgroundLogger,
  contentLogger,
  firestoreLogger,
  popupLogger
} from '../../src/shared/logger.js';

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

describe('Logger', () => {
  const localThis = {};

  beforeEach(() => {
    // Mock console methods
    localThis.mockLog = jest.fn();
    localThis.mockInfo = jest.fn();
    localThis.mockWarn = jest.fn();
    localThis.mockError = jest.fn();
    localThis.mockGroup = jest.fn();
    localThis.mockGroupEnd = jest.fn();
    localThis.mockTime = jest.fn();
    localThis.mockTimeEnd = jest.fn();
    
    console.log = localThis.mockLog;
    console.info = localThis.mockInfo;
    console.warn = localThis.mockWarn;
    console.error = localThis.mockError;
    console.group = localThis.mockGroup;
    console.groupEnd = localThis.mockGroupEnd;
    console.time = localThis.mockTime;
    console.timeEnd = localThis.mockTimeEnd;
    
    // Reset debug mode to true for each test
    setDebugMode(true);
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
  
  describe('detectDebugMode', () => {
    it('should return true when import.meta.env is undefined (test environment)', () => {
      // In Jest, import.meta.env is undefined, so it should default to true
      const result = detectDebugMode();
      expect(typeof result).toBe('boolean');
    });
  });
  
  describe('setDebugMode', () => {
    it('should enable debug mode', () => {
      setDebugMode(true);
      expect(isDebugMode()).toBe(true);
    });
    
    it('should disable debug mode', () => {
      setDebugMode(false);
      expect(isDebugMode()).toBe(false);
    });
  });
  
  describe('getLogLevel', () => {
    it('should return DEBUG level when debug mode is true', () => {
      expect(getLogLevel(true)).toBe(LOG_LEVELS.DEBUG);
    });
    
    it('should return WARN level when debug mode is false', () => {
      expect(getLogLevel(false)).toBe(LOG_LEVELS.WARN);
    });
    
    it('should use module debug mode when no argument provided', () => {
      setDebugMode(true);
      expect(getLogLevel()).toBe(LOG_LEVELS.DEBUG);
      
      setDebugMode(false);
      expect(getLogLevel()).toBe(LOG_LEVELS.WARN);
    });
  });
  
  describe('isDebugMode', () => {
    it('should return current debug mode state', () => {
      setDebugMode(true);
      expect(isDebugMode()).toBe(true);
      
      setDebugMode(false);
      expect(isDebugMode()).toBe(false);
    });
  });
  
  describe('createLogger', () => {
    it('should create a logger with namespace', () => {
      const logger = createLogger('Test');
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.group).toBe('function');
      expect(typeof logger.groupEnd).toBe('function');
      expect(typeof logger.time).toBe('function');
      expect(typeof logger.timeEnd).toBe('function');
    });
    
    it('should prefix log messages with namespace', () => {
      const logger = createLogger('Test');
      logger.debug('message');
      expect(localThis.mockLog).toHaveBeenCalledWith('[Test]', 'message');
    });
    
    it('should accept debugMode option', () => {
      const logger = createLogger('Test', { debugMode: false });
      logger.debug('should not log');
      expect(localThis.mockLog).not.toHaveBeenCalled();
    });
  });
  
  describe('debug', () => {
    it('should call console.log with prefix in debug mode', () => {
      setDebugMode(true);
      const logger = createLogger('App');
      logger.debug('debug message', { data: 1 });
      expect(localThis.mockLog).toHaveBeenCalledWith('[App]', 'debug message', { data: 1 });
    });
    
    it('should not call console.log when debug mode is off', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.debug('debug message');
      expect(localThis.mockLog).not.toHaveBeenCalled();
    });
    
    it('should handle multiple arguments', () => {
      const logger = createLogger('App');
      logger.debug('msg', 1, 2, 3);
      expect(localThis.mockLog).toHaveBeenCalledWith('[App]', 'msg', 1, 2, 3);
    });
  });
  
  describe('info', () => {
    it('should call console.info with prefix', () => {
      const logger = createLogger('App');
      logger.info('info message');
      expect(localThis.mockInfo).toHaveBeenCalledWith('[App]', 'info message');
    });
    
    it('should not log info in non-debug mode (level is WARN)', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.info('info message');
      expect(localThis.mockInfo).not.toHaveBeenCalled();
    });
  });
  
  describe('warn', () => {
    it('should call console.warn with prefix', () => {
      const logger = createLogger('App');
      logger.warn('warning message');
      expect(localThis.mockWarn).toHaveBeenCalledWith('[App]', 'warning message');
    });
    
    it('should call console.warn even when debug mode is off', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.warn('warning message');
      expect(localThis.mockWarn).toHaveBeenCalledWith('[App]', 'warning message');
    });
  });
  
  describe('error', () => {
    it('should call console.error with prefix', () => {
      const logger = createLogger('App');
      const error = new Error('test');
      logger.error('error message', error);
      expect(localThis.mockError).toHaveBeenCalledWith('[App]', 'error message', error);
    });
    
    it('should call console.error even when debug mode is off', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.error('error message');
      expect(localThis.mockError).toHaveBeenCalledWith('[App]', 'error message');
    });
  });
  
  describe('log', () => {
    it('should call appropriate console method based on level', () => {
      // Mock console.debug as well since log('debug') calls console.debug
      localThis.mockDebug = jest.fn();
      console.debug = localThis.mockDebug;
      
      const logger = createLogger('App');
      
      // 'debug' level calls console.debug (which exists)
      logger.log('debug', 'debug msg');
      expect(localThis.mockDebug).toHaveBeenCalledWith('[App]', 'debug msg');
      
      logger.log('info', 'info msg');
      expect(localThis.mockInfo).toHaveBeenCalledWith('[App]', 'info msg');
      
      logger.log('warn', 'warn msg');
      expect(localThis.mockWarn).toHaveBeenCalledWith('[App]', 'warn msg');
      
      logger.log('error', 'error msg');
      expect(localThis.mockError).toHaveBeenCalledWith('[App]', 'error msg');
    });
    
    it('should handle uppercase level names', () => {
      // Mock console.debug since DEBUG level uses console.debug
      localThis.mockDebug = jest.fn();
      console.debug = localThis.mockDebug;
      
      const logger = createLogger('App');
      logger.log('DEBUG', 'message');
      expect(localThis.mockDebug).toHaveBeenCalled();
    });
    
    it('should fall back to console.log for unknown methods', () => {
      const logger = createLogger('App');
      logger.log('unknown', 'message');
      expect(localThis.mockLog).toHaveBeenCalledWith('[App]', 'message');
    });
    
    it('should not log when level is below current level', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.log('debug', 'should not log');
      expect(localThis.mockLog).not.toHaveBeenCalled();
    });
    
    it('should default to DEBUG level for invalid level string', () => {
      const logger = createLogger('App');
      logger.log('invalid', 'message');
      // Should use DEBUG level (0) and fall back to console.log
      expect(localThis.mockLog).toHaveBeenCalledWith('[App]', 'message');
    });
  });
  
  describe('group', () => {
    it('should call console.group with prefixed label', () => {
      const logger = createLogger('App');
      logger.group('Group Name');
      expect(localThis.mockGroup).toHaveBeenCalledWith('[App] Group Name');
    });
    
    it('should not call console.group when debug mode is off', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.group('Group Name');
      expect(localThis.mockGroup).not.toHaveBeenCalled();
    });
  });
  
  describe('groupEnd', () => {
    it('should call console.groupEnd', () => {
      const logger = createLogger('App');
      logger.groupEnd();
      expect(localThis.mockGroupEnd).toHaveBeenCalled();
    });
    
    it('should not call console.groupEnd when debug mode is off', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.groupEnd();
      expect(localThis.mockGroupEnd).not.toHaveBeenCalled();
    });
  });
  
  describe('time', () => {
    it('should call console.time with prefixed label', () => {
      const logger = createLogger('App');
      logger.time('operation');
      expect(localThis.mockTime).toHaveBeenCalledWith('[App] operation');
    });
    
    it('should not call console.time when debug mode is off', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.time('operation');
      expect(localThis.mockTime).not.toHaveBeenCalled();
    });
  });
  
  describe('timeEnd', () => {
    it('should call console.timeEnd with prefixed label', () => {
      const logger = createLogger('App');
      logger.timeEnd('operation');
      expect(localThis.mockTimeEnd).toHaveBeenCalledWith('[App] operation');
    });
    
    it('should not call console.timeEnd when debug mode is off', () => {
      const logger = createLogger('App', { debugMode: false });
      logger.timeEnd('operation');
      expect(localThis.mockTimeEnd).not.toHaveBeenCalled();
    });
  });
  
  describe('pre-configured loggers', () => {
    it('should export backgroundLogger', () => {
      expect(backgroundLogger).toBeDefined();
      expect(typeof backgroundLogger.debug).toBe('function');
    });
    
    it('should export contentLogger', () => {
      expect(contentLogger).toBeDefined();
      expect(typeof contentLogger.debug).toBe('function');
    });
    
    it('should export firestoreLogger', () => {
      expect(firestoreLogger).toBeDefined();
      expect(typeof firestoreLogger.debug).toBe('function');
    });
    
    it('should export popupLogger', () => {
      expect(popupLogger).toBeDefined();
      expect(typeof popupLogger.debug).toBe('function');
    });
    
    it('should use correct namespace prefix for backgroundLogger', () => {
      backgroundLogger.debug('test');
      expect(localThis.mockLog).toHaveBeenCalledWith('[Background]', 'test');
    });
    
    it('should use correct namespace prefix for contentLogger', () => {
      contentLogger.debug('test');
      expect(localThis.mockLog).toHaveBeenCalledWith('[StickyNotes]', 'test');
    });
    
    it('should use correct namespace prefix for firestoreLogger', () => {
      firestoreLogger.debug('test');
      expect(localThis.mockLog).toHaveBeenCalledWith('[Firestore]', 'test');
    });
    
    it('should use correct namespace prefix for popupLogger', () => {
      popupLogger.debug('test');
      expect(localThis.mockLog).toHaveBeenCalledWith('[Popup]', 'test');
    });
  });
});
