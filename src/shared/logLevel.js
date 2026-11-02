/**
 * Log Level Sync
 * Applies the logLevel preference to the extension logger and the Firestore SDK,
 * and keeps it in sync when the preference changes on the options page.
 */

import { getPreferences, normalizeLogLevel, DEFAULT_PREFERENCES } from './preferences.js';
import { setLogLevel } from './logger.js';

const PREFERENCES_KEY = 'preferences';

/**
 * Load the logLevel preference, apply it, and follow later changes.
 * Never rejects: if the preference cannot be read, the default level stays applied.
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<string>} The applied log level
 */
export async function initLogLevel(deps = {}) {
  // Apply the default right away so nothing is logged while the preference loads
  setLogLevel(DEFAULT_PREFERENCES.logLevel);

  try {
    const chromeStorage = deps.chromeStorage || chrome.storage;

    const prefs = await getPreferences(deps);
    setLogLevel(prefs.logLevel);

    if (chromeStorage.onChanged) {
      chromeStorage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes[PREFERENCES_KEY]) {
          // A change from an older build can lack logLevel, which means the default
          setLogLevel(normalizeLogLevel(changes[PREFERENCES_KEY].newValue?.logLevel));
        }
      });
    }

    return prefs.logLevel;
  } catch (_error) {
    return DEFAULT_PREFERENCES.logLevel;
  }
}
