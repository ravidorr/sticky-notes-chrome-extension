/**
 * Shared Utility Functions for API
 * Portable validation functions (no browser dependencies)
 */

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
 * Valid themes
 */
export const VALID_THEMES = ['yellow', 'blue', 'green', 'pink'];

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
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate note data for API requests
 * @param {Object} noteData - Note data to validate
 * @param {boolean} isUpdate - Whether this is an update (partial data allowed)
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateNoteData(noteData, isUpdate = false) {
  const errors = [];
  
  if (!noteData || typeof noteData !== 'object') {
    return { valid: false, errors: ['Note data must be an object'] };
  }
  
  // For creates, url and selector are required
  if (!isUpdate) {
    if (!noteData.url) {
      errors.push('URL is required');
    } else if (!isValidUrl(noteData.url)) {
      errors.push('Invalid URL format');
    }
    
    if (!noteData.selector) {
      errors.push('Selector is required');
    } else {
      const selectorValidation = validateSelectorPattern(noteData.selector);
      if (!selectorValidation.valid) {
        errors.push(selectorValidation.error);
      }
    }
  }
  
  // Validate optional fields if provided
  if (noteData.selector !== undefined && isUpdate) {
    const selectorValidation = validateSelectorPattern(noteData.selector);
    if (!selectorValidation.valid) {
      errors.push(selectorValidation.error);
    }
  }
  
  if (noteData.theme !== undefined && !VALID_THEMES.includes(noteData.theme)) {
    errors.push(`Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}`);
  }
  
  if (noteData.content !== undefined && typeof noteData.content !== 'string') {
    errors.push('Content must be a string');
  }
  
  if (noteData.content && noteData.content.length > 50000) {
    errors.push('Content exceeds maximum length of 50000 characters');
  }
  
  return { valid: errors.length === 0, errors };
}
