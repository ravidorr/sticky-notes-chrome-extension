/**
 * Shared Utility Functions
 * Common functions used across the extension
 */

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Strip HTML tags and get plain text
 * @param {string} html - HTML string
 * @returns {string} Plain text content
 */
export function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * Validate email format
 * Uses RFC 5322 compliant regex
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

/**
 * Truncate string to specified length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length (default 30)
 * @returns {string} Truncated string
 */
export function truncate(str, maxLength = 30) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Normalize URL to origin + pathname (strips query and hash)
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate a unique ID
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} Unique ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Check if URL is restricted (can't inject content scripts)
 * @param {string} url - URL to check
 * @returns {boolean} True if restricted
 */
export function isRestrictedUrl(url) {
  if (!url) return true;
  
  const restrictedPatterns = [
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^about:/,
    /^edge:\/\//,
    /^brave:\/\//,
    /^opera:\/\//,
    /^vivaldi:\/\//,
    /^file:\/\//,
    /^view-source:/,
    /^devtools:\/\//,
    /^data:/,
    /^blob:/,
    /^javascript:/
  ];
  
  return restrictedPatterns.some(pattern => pattern.test(url));
}

/**
 * Dangerous patterns that should not be in CSS selectors
 * Used for XSS prevention
 */
export const DANGEROUS_SELECTOR_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /expression\s*\(/i,
  /behavior\s*:/i,
  /@import/i
];

/**
 * Maximum allowed length for CSS selectors
 */
export const MAX_SELECTOR_LENGTH = 1000;

/**
 * Validate a CSS selector string for safety (without DOM check)
 * @param {string} selector - CSS selector to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateSelectorPattern(selector) {
  if (!selector || typeof selector !== 'string') {
    return { valid: false, error: 'Selector must be a non-empty string' };
  }
  
  const trimmed = selector.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Selector cannot be empty' };
  }
  
  if (trimmed.length > MAX_SELECTOR_LENGTH) {
    return { valid: false, error: `Selector exceeds maximum length of ${MAX_SELECTOR_LENGTH} characters` };
  }
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_SELECTOR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Selector contains potentially unsafe patterns' };
    }
  }
  
  return { valid: true };
}

// Constants for timeout values
export const TIMEOUTS = {
  DEBOUNCE_SAVE: 1000,     // Debounce time for auto-save
  RETRY_DELAY: 200,        // Delay between retry attempts
  AUTO_DISMISS: 10000,     // Auto-dismiss notifications
  TOAST_DISPLAY: 3000,     // Toast message display time
  TOOLTIP_FADE: 500        // Tooltip fade out time
};

// Theme colors
export const THEME_COLORS = {
  yellow: '#facc15',
  blue: '#3b82f6',
  green: '#22c55e',
  pink: '#ec4899'
};

// Valid themes
export const VALID_THEMES = ['yellow', 'blue', 'green', 'pink'];

/**
 * Get browser information
 * @returns {Object} Browser info object
 */
export function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let version = '';
  
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    browser = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    version = match ? match[1] : '';
  } else if (ua.includes('Edg')) {
    browser = 'Edge';
    const match = ua.match(/Edg\/(\d+)/);
    version = match ? match[1] : '';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    version = match ? match[1] : '';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    browser = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    version = match ? match[1] : '';
  }
  
  return { browser, version, userAgent: ua };
}

/**
 * Get viewport dimensions
 * @returns {Object} Viewport info
 */
export function getViewportInfo() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

/**
 * Get current page metadata
 * @returns {Object} Page metadata
 */
export function getPageMetadata() {
  const browserInfo = getBrowserInfo();
  const viewport = getViewportInfo();
  
  return {
    url: window.location.href,
    title: document.title,
    browser: `${browserInfo.browser}${browserInfo.version ? ' ' + browserInfo.version : ''}`,
    viewport: `${viewport.width}x${viewport.height}`,
    devicePixelRatio: viewport.devicePixelRatio,
    timestamp: new Date().toISOString(),
    userAgent: browserInfo.userAgent
  };
}

/**
 * Generate markdown bug report template
 * @param {Object} options - Report options
 * @param {string} options.content - Note content (HTML)
 * @param {string} options.selector - CSS selector
 * @param {Object} options.metadata - Page metadata
 * @returns {string} Markdown formatted bug report
 */
export function generateBugReportMarkdown(options) {
  const { content, selector, metadata } = options;
  const plainContent = stripHtml(content).trim();
  
  const lines = [
    '## Bug Report',
    '',
    '### Description',
    plainContent || '_No description provided_',
    '',
    '### Environment',
    `- **URL:** ${metadata.url}`,
    `- **Browser:** ${metadata.browser}`,
    `- **Viewport:** ${metadata.viewport}`,
    `- **Timestamp:** ${new Date(metadata.timestamp).toLocaleString()}`,
    '',
    '### Element Reference',
    '```css',
    selector,
    '```',
    '',
    '### Steps to Reproduce',
    '1. Navigate to the URL above',
    '2. Locate the element using the selector',
    '3. ',
    '',
    '### Expected Behavior',
    '',
    '',
    '### Actual Behavior',
    '',
    ''
  ];
  
  return lines.join('\n');
}

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  
  return then.toLocaleDateString();
}
