/**
 * Internationalization (i18n) Helper Module
 * Provides a simple wrapper around Chrome's i18n API
 */

/**
 * Get a translated message by key
 * Falls back to the key itself if message not found
 * @param {string} messageName - Message key from _locales/messages.json
 * @param {string|string[]} [substitutions] - Optional substitution strings
 * @returns {string} Translated message or the key if not found
 */
export function t(messageName, substitutions) {
  try {
    const message = chrome.i18n.getMessage(messageName, substitutions);
    return message || messageName;
  } catch {
    // Fallback for testing or non-extension contexts
    return messageName;
  }
}

/**
 * Get the current UI language
 * @returns {string} Language code (e.g., 'en', 'es', 'fr')
 */
export function getUILanguage() {
  try {
    return chrome.i18n.getUILanguage();
  } catch {
    return 'en';
  }
}

/**
 * Initialize i18n for HTML elements with data-i18n attributes
 * Call this on DOM ready to translate static HTML content
 * 
 * Usage in HTML:
 *   <span data-i18n="messageName">Fallback text</span>
 *   <input data-i18n-placeholder="placeholderMessage" placeholder="Fallback">
 *   <button data-i18n-title="titleMessage" title="Fallback">Text</button>
 * 
 * @param {Document|Element} [root=document] - Root element to search within
 */
export function initializeI18n(root = document) {
  // Translate text content
  root.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (key) {
      const translated = t(key);
      if (translated !== key) {
        element.textContent = translated;
      }
    }
  });

  // Translate placeholders
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (key) {
      const translated = t(key);
      if (translated !== key) {
        element.placeholder = translated;
      }
    }
  });

  // Translate titles (tooltips)
  root.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    if (key) {
      const translated = t(key);
      if (translated !== key) {
        element.title = translated;
      }
    }
  });

  // Translate aria-labels
  root.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    const key = element.getAttribute('data-i18n-aria-label');
    if (key) {
      const translated = t(key);
      if (translated !== key) {
        element.setAttribute('aria-label', translated);
      }
    }
  });
}

/**
 * Create a translated element
 * @param {string} tagName - HTML tag name
 * @param {string} messageKey - i18n message key
 * @param {Object} [attributes={}] - Additional attributes to set
 * @returns {HTMLElement} Created element with translated content
 */
export function createTranslatedElement(tagName, messageKey, attributes = {}) {
  const element = document.createElement(tagName);
  element.textContent = t(messageKey);
  element.setAttribute('data-i18n', messageKey);
  
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  
  return element;
}

// Export default object for convenience
export default {
  t,
  getUILanguage,
  initializeI18n,
  createTranslatedElement
};
