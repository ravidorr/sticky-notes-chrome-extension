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
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
