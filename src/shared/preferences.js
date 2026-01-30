/**
 * Preferences Module
 * Centralized API for managing user preferences
 * Uses chrome.storage.sync for cross-device synchronization
 */

import { VALID_THEMES } from './utils.js';

/**
 * Valid position options for notes
 */
export const VALID_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * Valid note width options (in pixels)
 */
export const VALID_NOTE_WIDTHS = [240, 280, 320, 360];

/**
 * Valid font size options
 */
export const VALID_FONT_SIZES = ['small', 'medium', 'large'];

/**
 * Font size values in pixels
 */
export const FONT_SIZE_VALUES = {
  small: 12,
  medium: 14,
  large: 16
};

/**
 * Default preferences for new installations
 */
export const DEFAULT_PREFERENCES = {
  defaultTheme: 'yellow',
  defaultPosition: 'top-right',
  noteWidth: 280,
  fontSize: 'medium',
  notesVisibleByDefault: true
};

/**
 * Storage key for preferences
 */
const PREFERENCES_KEY = 'preferences';

/**
 * Get all preferences with defaults for missing values
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<Object>} Preferences object
 */
export async function getPreferences(deps = {}) {
  const chromeStorage = deps.chromeStorage || chrome.storage;
  
  try {
    const result = await chromeStorage.sync.get([PREFERENCES_KEY]);
    const stored = result[PREFERENCES_KEY] || {};
    
    // Merge with defaults, validating each value
    return {
      defaultTheme: VALID_THEMES.includes(stored.defaultTheme) 
        ? stored.defaultTheme 
        : DEFAULT_PREFERENCES.defaultTheme,
      defaultPosition: VALID_POSITIONS.includes(stored.defaultPosition)
        ? stored.defaultPosition
        : DEFAULT_PREFERENCES.defaultPosition,
      noteWidth: VALID_NOTE_WIDTHS.includes(stored.noteWidth)
        ? stored.noteWidth
        : DEFAULT_PREFERENCES.noteWidth,
      fontSize: VALID_FONT_SIZES.includes(stored.fontSize)
        ? stored.fontSize
        : DEFAULT_PREFERENCES.fontSize,
      notesVisibleByDefault: typeof stored.notesVisibleByDefault === 'boolean'
        ? stored.notesVisibleByDefault
        : DEFAULT_PREFERENCES.notesVisibleByDefault
    };
  } catch (error) {
    // Return defaults if storage access fails
    console.error('Failed to load preferences:', error);
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Save preferences to storage
 * @param {Object} prefs - Preferences to save (partial or full)
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<Object>} Result with success flag
 */
export async function setPreferences(prefs, deps = {}) {
  const chromeStorage = deps.chromeStorage || chrome.storage;
  
  try {
    // Get current preferences first
    const current = await getPreferences(deps);
    
    // Validate and merge new values
    const updated = { ...current };
    
    if (prefs.defaultTheme !== undefined) {
      if (VALID_THEMES.includes(prefs.defaultTheme)) {
        updated.defaultTheme = prefs.defaultTheme;
      }
    }
    
    if (prefs.defaultPosition !== undefined) {
      if (VALID_POSITIONS.includes(prefs.defaultPosition)) {
        updated.defaultPosition = prefs.defaultPosition;
      }
    }
    
    if (prefs.noteWidth !== undefined) {
      if (VALID_NOTE_WIDTHS.includes(prefs.noteWidth)) {
        updated.noteWidth = prefs.noteWidth;
      }
    }
    
    if (prefs.fontSize !== undefined) {
      if (VALID_FONT_SIZES.includes(prefs.fontSize)) {
        updated.fontSize = prefs.fontSize;
      }
    }
    
    if (prefs.notesVisibleByDefault !== undefined) {
      if (typeof prefs.notesVisibleByDefault === 'boolean') {
        updated.notesVisibleByDefault = prefs.notesVisibleByDefault;
      }
    }
    
    // Save to storage
    await chromeStorage.sync.set({ [PREFERENCES_KEY]: updated });
    
    return { success: true, preferences: updated };
  } catch (error) {
    console.error('Failed to save preferences:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reset preferences to defaults
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<Object>} Result with success flag
 */
export async function resetPreferences(deps = {}) {
  const chromeStorage = deps.chromeStorage || chrome.storage;
  
  try {
    await chromeStorage.sync.set({ [PREFERENCES_KEY]: { ...DEFAULT_PREFERENCES } });
    return { success: true, preferences: { ...DEFAULT_PREFERENCES } };
  } catch (error) {
    console.error('Failed to reset preferences:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get font size in pixels for a given size name
 * @param {string} sizeName - Size name (small, medium, large)
 * @returns {number} Font size in pixels
 */
export function getFontSizeValue(sizeName) {
  return FONT_SIZE_VALUES[sizeName] || FONT_SIZE_VALUES.medium;
}
