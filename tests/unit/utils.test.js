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
    expect(utils.escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
  
  it('should handle ampersands', () => {
    expect(utils.escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });
  
  it('should escape double quotes for attribute safety', () => {
    expect(utils.escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });
  
  it('should escape single quotes for attribute safety', () => {
    expect(utils.escapeHtml("'hello'")).toBe('&#39;hello&#39;');
  });
  
  it('should return empty string for null/undefined', () => {
    expect(utils.escapeHtml(null)).toBe('');
    expect(utils.escapeHtml(undefined)).toBe('');
    expect(utils.escapeHtml('')).toBe('');
  });
  
  it('should pass through backticks unchanged (not HTML-special)', () => {
    // Backticks are not special in HTML context - they're just regular characters
    expect(utils.escapeHtml('`hello`')).toBe('`hello`');
  });
  
  it('should safely handle template literal-like syntax', () => {
    // Even if user input looks like JS template syntax, it's just a string value
    // when returned from escapeHtml - won't be evaluated as template expressions
    const malicious = '`${alert(1)}`';
    expect(utils.escapeHtml(malicious)).toBe('`${alert(1)}`');
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

describe('createCompositeUrl', () => {
  it('should return normalized URL for top frame', () => {
    const result = utils.createCompositeUrl(
      'https://example.com/page?foo=bar',
      'https://example.com/page?foo=bar',
      true
    );
    expect(result).toBe('https://example.com/page');
  });

  it('should create composite URL for iframe', () => {
    const result = utils.createCompositeUrl(
      'https://example.com/page',
      'https://widget.com/embed?token=123',
      false
    );
    expect(result).toBe('https://example.com/page#iframe:https://widget.com/embed');
  });

  it('should normalize both URLs in composite', () => {
    const result = utils.createCompositeUrl(
      'https://example.com/page?query=1#hash',
      'https://widget.com/embed?token=abc#section',
      false
    );
    expect(result).toBe('https://example.com/page#iframe:https://widget.com/embed');
  });

  it('should handle same-origin iframes', () => {
    const result = utils.createCompositeUrl(
      'https://example.com/main',
      'https://example.com/iframe-content',
      false
    );
    expect(result).toBe('https://example.com/main#iframe:https://example.com/iframe-content');
  });
});

describe('parseCompositeUrl', () => {
  it('should parse top frame URL', () => {
    const result = utils.parseCompositeUrl('https://example.com/page');
    expect(result).toEqual({
      tabUrl: 'https://example.com/page',
      frameUrl: null,
      isTopFrame: true
    });
  });

  it('should parse composite iframe URL', () => {
    const result = utils.parseCompositeUrl('https://example.com/page#iframe:https://widget.com/embed');
    expect(result).toEqual({
      tabUrl: 'https://example.com/page',
      frameUrl: 'https://widget.com/embed',
      isTopFrame: false
    });
  });

  it('should handle URL with regular hash (not iframe marker)', () => {
    const result = utils.parseCompositeUrl('https://example.com/page#section');
    expect(result).toEqual({
      tabUrl: 'https://example.com/page#section',
      frameUrl: null,
      isTopFrame: true
    });
  });

  it('should roundtrip with createCompositeUrl for top frame', () => {
    const original = 'https://example.com/page';
    const composite = utils.createCompositeUrl(original, original, true);
    const parsed = utils.parseCompositeUrl(composite);
    expect(parsed.isTopFrame).toBe(true);
    expect(parsed.tabUrl).toBe(original);
  });

  it('should roundtrip with createCompositeUrl for iframe', () => {
    const tabUrl = 'https://example.com/page';
    const frameUrl = 'https://widget.com/embed';
    const composite = utils.createCompositeUrl(tabUrl, frameUrl, false);
    const parsed = utils.parseCompositeUrl(composite);
    expect(parsed.isTopFrame).toBe(false);
    expect(parsed.tabUrl).toBe(tabUrl);
    expect(parsed.frameUrl).toBe(frameUrl);
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

describe('getBrowserInfo', () => {
  const localThis = {};
  
  beforeEach(() => {
    // Store original navigator
    localThis.originalNavigator = global.navigator;
  });
  
  afterEach(() => {
    // Restore original navigator
    if (localThis.originalNavigator) {
      Object.defineProperty(global, 'navigator', {
        value: localThis.originalNavigator,
        writable: true
      });
    }
  });
  
  it('should detect Chrome browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      writable: true
    });
    
    const result = utils.getBrowserInfo();
    expect(result.browser).toBe('Chrome');
    expect(result.version).toBe('120');
  });
  
  it('should detect Edge browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
      writable: true
    });
    
    const result = utils.getBrowserInfo();
    expect(result.browser).toBe('Edge');
    expect(result.version).toBe('120');
  });
  
  it('should detect Firefox browser', () => {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121' },
      writable: true
    });
    
    const result = utils.getBrowserInfo();
    expect(result.browser).toBe('Firefox');
    expect(result.version).toBe('121');
  });
  
  it('should return userAgent string', () => {
    const result = utils.getBrowserInfo();
    expect(result.userAgent).toBeDefined();
    expect(typeof result.userAgent).toBe('string');
  });
});

describe('getViewportInfo', () => {
  const localThis = {};
  
  beforeEach(() => {
    localThis.originalInnerWidth = global.innerWidth;
    localThis.originalInnerHeight = global.innerHeight;
    localThis.originalDevicePixelRatio = global.devicePixelRatio;
  });
  
  afterEach(() => {
    global.innerWidth = localThis.originalInnerWidth;
    global.innerHeight = localThis.originalInnerHeight;
    global.devicePixelRatio = localThis.originalDevicePixelRatio;
  });
  
  it('should return viewport dimensions', () => {
    global.innerWidth = 1920;
    global.innerHeight = 1080;
    global.devicePixelRatio = 2;
    
    const result = utils.getViewportInfo();
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.devicePixelRatio).toBe(2);
  });
  
  it('should default devicePixelRatio to 1 if not available', () => {
    global.innerWidth = 1024;
    global.innerHeight = 768;
    delete global.devicePixelRatio;
    
    const result = utils.getViewportInfo();
    expect(result.devicePixelRatio).toBe(1);
  });
});

describe('getPageMetadata', () => {
  const localThis = {};
  
  beforeEach(() => {
    localThis.originalLocation = global.location;
    localThis.originalDocument = global.document;
    localThis.originalInnerWidth = global.innerWidth;
    localThis.originalInnerHeight = global.innerHeight;
    
    global.innerWidth = 1920;
    global.innerHeight = 1080;
    
    // Mock location
    delete global.location;
    global.location = { href: 'https://example.com/page' };
    
    // Mock document.title
    Object.defineProperty(global.document, 'title', {
      value: 'Test Page',
      configurable: true
    });
  });
  
  afterEach(() => {
    global.location = localThis.originalLocation;
    global.innerWidth = localThis.originalInnerWidth;
    global.innerHeight = localThis.originalInnerHeight;
  });
  
  it('should return page metadata object', () => {
    const result = utils.getPageMetadata();
    
    expect(result.url).toBe('https://example.com/page');
    expect(result.title).toBe('Test Page');
    expect(result.viewport).toBe('1920x1080');
    expect(result.timestamp).toBeDefined();
    expect(result.browser).toBeDefined();
    expect(result.userAgent).toBeDefined();
  });
  
  it('should include valid ISO timestamp', () => {
    const result = utils.getPageMetadata();
    const date = new Date(result.timestamp);
    expect(date.toString()).not.toBe('Invalid Date');
  });
});

describe('generateBugReportMarkdown', () => {
  it('should generate markdown with all sections', () => {
    const options = {
      content: '<b>Button is broken</b>',
      selector: '#submit-btn',
      metadata: {
        url: 'https://example.com/form',
        browser: 'Chrome 120',
        viewport: '1920x1080',
        timestamp: '2024-01-15T10:30:00.000Z'
      }
    };
    
    const markdown = utils.generateBugReportMarkdown(options);
    
    // Check for either translated text or i18n keys (in test environment)
    expect(markdown).toMatch(/## (Bug Report|bugReport)/);
    expect(markdown).toMatch(/### (Description|bugReportDescription)/);
    expect(markdown).toContain('Button is broken');
    expect(markdown).toMatch(/### (Environment|bugReportEnvironment)/);
    expect(markdown).toContain('**URL:** https://example.com/form');
    expect(markdown).toMatch(/\*\*(Browser|metadataBrowser):\*\* Chrome 120/);
    expect(markdown).toMatch(/\*\*(Viewport|metadataViewport):\*\* 1920x1080/);
    expect(markdown).toMatch(/### (Element Reference|bugReportElementRef)/);
    expect(markdown).toContain('#submit-btn');
    expect(markdown).toMatch(/### (Steps to Reproduce|bugReportSteps)/);
    expect(markdown).toMatch(/### (Expected Behavior|bugReportExpected)/);
    expect(markdown).toMatch(/### (Actual Behavior|bugReportActual)/);
  });
  
  it('should strip HTML from content', () => {
    const options = {
      content: '<p>This is <strong>bold</strong> text</p>',
      selector: '.element',
      metadata: {
        url: 'https://example.com',
        browser: 'Chrome',
        viewport: '1920x1080',
        timestamp: new Date().toISOString()
      }
    };
    
    const markdown = utils.generateBugReportMarkdown(options);
    expect(markdown).toContain('This is bold text');
    expect(markdown).not.toContain('<p>');
    expect(markdown).not.toContain('<strong>');
  });
  
  it('should handle empty content', () => {
    const options = {
      content: '',
      selector: '.element',
      metadata: {
        url: 'https://example.com',
        browser: 'Chrome',
        viewport: '1920x1080',
        timestamp: new Date().toISOString()
      }
    };
    
    const markdown = utils.generateBugReportMarkdown(options);
    // Check for either translated text or i18n key
    expect(markdown).toMatch(/_No description provided_|bugReportNoDescription/);
  });
});

describe('formatRelativeTime', () => {
  const localThis = {};
  
  beforeEach(() => {
    // Use fake timers for consistent testing
    jest.useFakeTimers();
    localThis.now = new Date('2024-01-15T12:00:00.000Z');
    jest.setSystemTime(localThis.now);
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  it('should return "just now" for very recent times', () => {
    const date = new Date(localThis.now.getTime() - 30 * 1000); // 30 seconds ago
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(date)).toMatch(/^(just now|justNow)$/);
  });
  
  it('should return minutes ago', () => {
    const date = new Date(localThis.now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(date)).toMatch(/^(5 minutes ago|minutesAgo)$/);
  });
  
  it('should return "1 minute ago" (singular)', () => {
    const date = new Date(localThis.now.getTime() - 1 * 60 * 1000); // 1 minute ago
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(date)).toMatch(/^(1 minute ago|minuteAgo)$/);
  });
  
  it('should return hours ago', () => {
    const date = new Date(localThis.now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(date)).toMatch(/^(3 hours ago|hoursAgo)$/);
  });
  
  it('should return "1 hour ago" (singular)', () => {
    const date = new Date(localThis.now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(date)).toMatch(/^(1 hour ago|hourAgo)$/);
  });
  
  it('should return days ago', () => {
    const date = new Date(localThis.now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(date)).toMatch(/^(2 days ago|daysAgo)$/);
  });
  
  it('should return locale date string for older dates', () => {
    const date = new Date(localThis.now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const result = utils.formatRelativeTime(date);
    // Should be a formatted date, not "X days ago" or i18n key
    expect(result).not.toMatch(/days ago|daysAgo/);
  });
  
  it('should accept string dates', () => {
    const dateStr = new Date(localThis.now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(dateStr)).toMatch(/^(2 hours ago|hoursAgo)$/);
  });

  it('should handle Firestore Timestamp objects', () => {
    // Mock Firestore Timestamp object with toDate() method
    const mockTimestamp = {
      toDate: () => new Date(localThis.now.getTime() - 4 * 60 * 60 * 1000) // 4 hours ago
    };
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(mockTimestamp)).toMatch(/^(4 hours ago|hoursAgo)$/);
  });

  it('should handle serialized Firestore Timestamps (from Chrome messaging)', () => {
    // When Firestore Timestamps are sent through Chrome messaging API,
    // they lose the toDate() method and become plain objects with seconds/nanoseconds
    const fourHoursAgoSeconds = Math.floor((localThis.now.getTime() - 4 * 60 * 60 * 1000) / 1000);
    const serializedTimestamp = {
      type: 'firestore/timestamp/1.0',
      seconds: fourHoursAgoSeconds,
      nanoseconds: 0
    };
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime(serializedTimestamp)).toMatch(/^(4 hours ago|hoursAgo)$/);
  });

  it('should return "just now" for invalid dates', () => {
    // Check for either translated text or i18n key
    expect(utils.formatRelativeTime('invalid-date')).toMatch(/^(just now|justNow)$/);
    expect(utils.formatRelativeTime(null)).toMatch(/^(just now|justNow)$/);
    expect(utils.formatRelativeTime(undefined)).toMatch(/^(just now|justNow)$/);
  });
});
