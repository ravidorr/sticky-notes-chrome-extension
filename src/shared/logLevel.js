/**
 * Log Level Sync
 * Applies the logLevel preference to the extension logger and the Firestore SDK,
 * and keeps it in sync when the preference changes on the options page.
 */

import { getPreferences } from './preferences.js';
import { setLogLevel } from './logger.js';

const PREFERENCES_KEY = 'preferences';

/**
 * Load the logLevel preference, apply it, and follow later changes
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<string>} The applied log level
 */
export async function initLogLevel(deps = {}) {
  const chromeStorage = deps.chromeStorage || chrome.storage;

  const prefs = await getPreferences(deps);
  setLogLevel(prefs.logLevel);

  if (chromeStorage.onChanged) {
    chromeStorage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[PREFERENCES_KEY]) {
        setLogLevel(changes[PREFERENCES_KEY].newValue?.logLevel);
      }
    });
  }

  return prefs.logLevel;
}
