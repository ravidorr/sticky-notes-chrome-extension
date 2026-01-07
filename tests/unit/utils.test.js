/**
 * Shared Utils Unit Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

let utils;

beforeEach(async () => {
  // Import module fresh for each test
  utils = await import('../../src/shared/utils.js');
});

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(utils.escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });
  
  it('should handle ampersands', () => {
    expect(utils.escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });
  
  it('should handle quotes', () => {
    expect(utils.escapeHtml('"hello"')).toBe('"hello"');
  });
  
  it('should return empty string for null/undefined', () => {
    expect(utils.escapeHtml(null)).toBe('');
    expect(utils.escapeHtml(undefined)).toBe('');
    expect(utils.escapeHtml('')).toBe('');
  });
});

describe('stripHtml', () => {
  it('should strip HTML tags', () => {
    expect(utils.stripHtml('<b>bold</b> text')).toBe('bold text');
  });
  
  it('should handle nested tags', () => {
    expect(utils.stripHtml('<div><p>Hello <b>World</b></p></div>')).toBe('Hello World');
  });
  
  it('should return empty string for null/undefined', () => {
    expect(utils.stripHtml(null)).toBe('');
    expect(utils.stripHtml(undefined)).toBe('');
    expect(utils.stripHtml('')).toBe('');
  });
});

describe('isValidEmail', () => {
  it('should accept valid emails', () => {
    expect(utils.isValidEmail('test@example.com')).toBe(true);
    expect(utils.isValidEmail('user.name@domain.co.uk')).toBe(true);
    expect(utils.isValidEmail('user+tag@example.com')).toBe(true);
  });
  
  it('should reject invalid emails', () => {
    expect(utils.isValidEmail('not-an-email')).toBe(false);
    expect(utils.isValidEmail('@missing-local.com')).toBe(false);
    expect(utils.isValidEmail('missing-domain@')).toBe(false);
    expect(utils.isValidEmail('')).toBe(false);
    expect(utils.isValidEmail(null)).toBe(false);
  });
});

describe('truncate', () => {
  it('should truncate long strings', () => {
    expect(utils.truncate('This is a very long string that needs truncation', 20)).toBe('This is a very long ...');
  });
  
  it('should not truncate short strings', () => {
    expect(utils.truncate('Short', 20)).toBe('Short');
  });
  
  it('should use default max length of 30', () => {
    const str = 'This is exactly thirty characters';
    expect(utils.truncate(str).length).toBeLessThanOrEqual(33); // 30 + '...'
  });
  
  it('should handle null/empty', () => {
    expect(utils.truncate(null)).toBe('');
    expect(utils.truncate('')).toBe('');
  });
});

describe('normalizeUrl', () => {
  it('should strip query parameters', () => {
    expect(utils.normalizeUrl('https://example.com/page?foo=bar')).toBe('https://example.com/page');
  });
  
  it('should strip hash fragments', () => {
    expect(utils.normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });
  
  it('should preserve origin and path', () => {
    expect(utils.normalizeUrl('https://example.com/path/to/page')).toBe('https://example.com/path/to/page');
  });
  
  it('should handle invalid URLs gracefully', () => {
    expect(utils.normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = utils.generateId();
    const id2 = utils.generateId();
    expect(id1).not.toBe(id2);
  });
  
  it('should use provided prefix', () => {
    const id = utils.generateId('note');
    expect(id.startsWith('note_')).toBe(true);
  });
  
  it('should use default prefix', () => {
    const id = utils.generateId();
    expect(id.startsWith('id_')).toBe(true);
  });
});

describe('isRestrictedUrl', () => {
  it('should identify chrome:// URLs as restricted', () => {
    expect(utils.isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(utils.isRestrictedUrl('chrome://settings')).toBe(true);
  });
  
  it('should identify chrome-extension:// URLs as restricted', () => {
    expect(utils.isRestrictedUrl('chrome-extension://abc123/popup.html')).toBe(true);
  });
  
  it('should identify about: URLs as restricted', () => {
    expect(utils.isRestrictedUrl('about:blank')).toBe(true);
  });
  
  it('should identify data: URLs as restricted', () => {
    expect(utils.isRestrictedUrl('data:text/html,<h1>Hi</h1>')).toBe(true);
  });
  
  it('should allow regular URLs', () => {
    expect(utils.isRestrictedUrl('https://example.com')).toBe(false);
    expect(utils.isRestrictedUrl('http://localhost:3000')).toBe(false);
  });
  
  it('should handle null/empty URLs', () => {
    expect(utils.isRestrictedUrl(null)).toBe(true);
    expect(utils.isRestrictedUrl('')).toBe(true);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should debounce function calls', () => {
    const fn = jest.fn();
    const debounced = utils.debounce(fn, 100);
    
    debounced();
    debounced();
    debounced();
    
    expect(fn).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(100);
    
    expect(fn).toHaveBeenCalledTimes(1);
  });
  
  it('should pass arguments to debounced function', () => {
    const fn = jest.fn();
    const debounced = utils.debounce(fn, 100);
    
    debounced('arg1', 'arg2');
    jest.advanceTimersByTime(100);
    
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('THEME_COLORS', () => {
  it('should have all theme colors defined', () => {
    expect(utils.THEME_COLORS.yellow).toBe('#facc15');
    expect(utils.THEME_COLORS.blue).toBe('#3b82f6');
    expect(utils.THEME_COLORS.green).toBe('#22c55e');
    expect(utils.THEME_COLORS.pink).toBe('#ec4899');
  });
});

describe('VALID_THEMES', () => {
  it('should contain all valid themes', () => {
    expect(utils.VALID_THEMES).toContain('yellow');
    expect(utils.VALID_THEMES).toContain('blue');
    expect(utils.VALID_THEMES).toContain('green');
    expect(utils.VALID_THEMES).toContain('pink');
  });
});

describe('TIMEOUTS', () => {
  it('should have timeout constants defined', () => {
    expect(utils.TIMEOUTS.DEBOUNCE_SAVE).toBe(1000);
    expect(utils.TIMEOUTS.RETRY_DELAY).toBe(200);
    expect(utils.TIMEOUTS.AUTO_DISMISS).toBe(10000);
    expect(utils.TIMEOUTS.TOAST_DISPLAY).toBe(3000);
    expect(utils.TIMEOUTS.TOOLTIP_FADE).toBe(500);
  });
});
