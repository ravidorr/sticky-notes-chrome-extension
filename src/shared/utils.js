/**
 * Shared Utility Functions
 * Common functions used across the extension
 */

import { t } from './i18n.js';

/**
 * Escape HTML to prevent XSS attacks
 * Escapes &, <, >, ", and ' for safe use in both HTML content and attributes
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
 * Uses RFC 5322 compliant regex, requires at least one dot in domain (e.g., test@example.com)
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // Require at least one dot in domain part (changed * to + at end)
  // This prevents partial emails like "test@g" from being considered valid
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email);
}

/**
 * Extract all valid email addresses from text
 * Returns unique emails found in the text
 * @param {string} text - Text to search for emails
 * @returns {Array<string>} Array of unique email addresses found
 */
export function extractEmails(text) {
  if (!text || typeof text !== 'string') return [];
  // Use the same pattern as isValidEmail but with global flag for matching
  // Requires at least one dot in domain (changed * to +)
  const emailRegex = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
  const matches = text.match(emailRegex) || [];
  // Filter with isValidEmail to ensure only valid emails are returned, and dedupe
  return [...new Set(matches.filter(email => isValidEmail(email)))];
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
 * Marker used to identify iframe URLs in composite URLs
 */
const IFRAME_URL_MARKER = '#iframe:';

/**
 * Create a composite URL for iframe support
 * Combines the main page URL with the iframe URL for notes created in iframes
 * @param {string} tabUrl - The main page (tab) URL
 * @param {string} frameUrl - The iframe URL (or same as tabUrl for top frame)
 * @param {boolean} isTopFrame - Whether this is the top-level frame
 * @returns {string} Composite URL for storage/lookup
 */
export function createCompositeUrl(tabUrl, frameUrl, isTopFrame) {
  if (isTopFrame) {
    return normalizeUrl(tabUrl);
  }
  return `${normalizeUrl(tabUrl)}${IFRAME_URL_MARKER}${normalizeUrl(frameUrl)}`;
}

/**
 * Parse a composite URL to extract tab and frame URLs
 * @param {string} compositeUrl - The composite URL to parse
 * @returns {Object} Object with tabUrl, frameUrl, and isTopFrame properties
 */
export function parseCompositeUrl(compositeUrl) {
  const idx = compositeUrl.indexOf(IFRAME_URL_MARKER);
  if (idx === -1) {
    return { tabUrl: compositeUrl, frameUrl: null, isTopFrame: true };
  }
  return {
    tabUrl: compositeUrl.substring(0, idx),
    frameUrl: compositeUrl.substring(idx + IFRAME_URL_MARKER.length),
    isTopFrame: false
  };
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
  
  // Allow page-level selector (notes not anchored to any element)
  if (trimmed === PAGE_LEVEL_SELECTOR) {
    return { valid: true };
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
 * Maximum allowed length for note content (in characters)
 * Matches backend validation in functions/lib/utils.js
 */
export const MAX_NOTE_LENGTH = 50000;

/**
 * Threshold for showing character limit warning (as a fraction of MAX_NOTE_LENGTH)
 * 0.9 = 90% = warning shown when content reaches 45,000 characters
 */
export const NOTE_LENGTH_WARNING_THRESHOLD = 0.9;

/**
 * Special selector value for page-level notes (not anchored to any element)
 */
export const PAGE_LEVEL_SELECTOR = '__PAGE__';

/**
 * Check if a note is a page-level note (not anchored to any element)
 * @param {Object} noteData - Note data object
 * @returns {boolean} True if this is a page-level note
 */
export function isPageLevelNote(noteData) {
  return noteData?.selector === PAGE_LEVEL_SELECTOR;
}

/**
 * Get browser information
 * Uses User-Agent Client Hints API as primary detection (more reliable),
 * with user agent string parsing as fallback
 * @returns {Object} Browser info object with browser, version, and userAgent
 */
export function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let version = '';
  
  // Primary: Use User-Agent Client Hints API (more reliable, harder to spoof)
  // This correctly identifies Edge even when enterprise policies modify the UA string
  if (navigator.userAgentData?.brands) {
    const brands = navigator.userAgentData.brands;
    
    // Check for Edge first (Edge includes both "Microsoft Edge" and "Chromium" brands)
    const edge = brands.find(brand => brand.brand === 'Microsoft Edge');
    if (edge) {
      return { browser: 'Edge', version: edge.version, userAgent: ua };
    }
    
    // Check for Chrome
    const chrome = brands.find(brand => brand.brand === 'Google Chrome');
    if (chrome) {
      return { browser: 'Chrome', version: chrome.version, userAgent: ua };
    }
  }
  
  // Fallback: Parse user agent string (for browsers without Client Hints support)
  if (ua.includes('Edg')) {
    browser = 'Edge';
    const match = ua.match(/Edg\/(\d+)/);
    version = match ? match[1] : '';
  } else if (ua.includes('Chrome')) {
    browser = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    version = match ? match[1] : '';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    version = match ? match[1] : '';
  } else if (ua.includes('Safari')) {
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
    `## ${t('bugReport')}`,
    '',
    `### ${t('bugReportDescription')}`,
    plainContent || t('bugReportNoDescription'),
    '',
    `### ${t('bugReportEnvironment')}`,
    `- **URL:** ${metadata.url}`,
    `- **${t('metadataBrowser')}:** ${metadata.browser}`,
    `- **${t('metadataViewport')}:** ${metadata.viewport}`,
    `- **Timestamp:** ${new Date(metadata.timestamp).toLocaleString()}`,
    '',
    `### ${t('bugReportElementRef')}`,
    '```css',
    selector,
    '```',
    '',
    `### ${t('bugReportSteps')}`,
    `1. ${t('bugReportStep1')}`,
    `2. ${t('bugReportStep2')}`,
    '3. ',
    '',
    `### ${t('bugReportExpected')}`,
    '',
    '',
    `### ${t('bugReportActual')}`,
    '',
    ''
  ];
  
  return lines.join('\n');
}

/**
 * Environment types for note metadata
 */
export const ENVIRONMENTS = {
  LOCAL: 'local',
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

/**
 * Environment colors for display
 */
export const ENVIRONMENT_COLORS = {
  local: '#6b7280',      // Gray
  development: '#3b82f6', // Blue
  staging: '#eab308',     // Yellow
  production: '#ef4444'   // Red
};

/**
 * Detect environment from URL
 * Uses common patterns to infer if a URL is local, development, staging, or production
 * @param {string} url - URL to analyze
 * @returns {string} Environment type (local, development, staging, production)
 */
export function detectEnvironment(url) {
  if (!url) return ENVIRONMENTS.PRODUCTION;
  
  let hostname, port;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    port = parsed.port;
  } catch {
    return ENVIRONMENTS.PRODUCTION;
  }
  
  // Local environment - localhost, 127.0.0.1, 0.0.0.0
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return ENVIRONMENTS.LOCAL;
  }
  
  // Development patterns
  const devPatterns = [
    /^dev\./,
    /-dev\./,
    /\.dev\./,
    /^development\./,
    /-development\./
  ];
  if (devPatterns.some(pattern => pattern.test(hostname))) {
    return ENVIRONMENTS.DEVELOPMENT;
  }
  
  // Staging/QA patterns
  const stagingPatterns = [
    /^staging\./,
    /^stage\./,
    /^qa\./,
    /^uat\./,
    /^test\./,
    /^preprod\./,
    /^pre-prod\./,
    /-staging\./,
    /-stage\./,
    /-qa\./,
    /-uat\./,
    /-test\./,
    /\.staging\./,
    /\.stage\./,
    /^preview-/,           // Vercel preview deployments
    /\.vercel\.app$/,      // Vercel previews
    /\.netlify\.app$/,     // Netlify previews
    /\.pages\.dev$/,       // Cloudflare Pages
    /\.herokuapp\.com$/,   // Heroku staging
    /\.ngrok\./,           // ngrok tunnels
    /\.localtunnel\./      // localtunnel
  ];
  if (stagingPatterns.some(pattern => pattern.test(hostname))) {
    return ENVIRONMENTS.STAGING;
  }
  
  // Check for common non-standard ports (often indicates dev/staging)
  if (port && !['80', '443', ''].includes(port)) {
    // Non-standard port on a real domain often indicates staging
    // But we already caught localhost above, so this is likely staging
    return ENVIRONMENTS.STAGING;
  }
  
  // Default to production
  return ENVIRONMENTS.PRODUCTION;
}

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {string|Date|Object} date - Date to format (can be string, Date, or Firestore Timestamp)
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
  const now = new Date();
  
  // Handle null/undefined
  if (date === null || date === undefined) {
    return t('justNow');
  }
  
  // Handle Firestore Timestamp objects (they have a toDate method)
  let then;
  if (typeof date.toDate === 'function') {
    then = date.toDate();
  } else if (typeof date === 'object' && date.seconds !== undefined) {
    // Handle serialized Firestore Timestamp (sent through Chrome messaging API)
    // These have {seconds, nanoseconds} but lose the toDate() method during serialization
    then = new Date(date.seconds * 1000);
  } else {
    then = new Date(date);
  }
  
  // Check for invalid date
  if (isNaN(then.getTime())) {
    return t('justNow');
  }
  
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return t('justNow');
  if (diffMin < 60) return diffMin === 1 ? t('minuteAgo', [diffMin]) : t('minutesAgo', [diffMin]);
  if (diffHour < 24) return diffHour === 1 ? t('hourAgo', [diffHour]) : t('hoursAgo', [diffHour]);
  if (diffDay < 7) return diffDay === 1 ? t('dayAgo', [diffDay]) : t('daysAgo', [diffDay]);
  
  return then.toLocaleDateString();
}
