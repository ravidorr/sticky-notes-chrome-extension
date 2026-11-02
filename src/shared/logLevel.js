/**
 * Log Level Sync
 * Applies the logLevel preference to the extension logger and the Firestore SDK,
 * and keeps it in sync when the stored preference changes (options page or another device).
 */

import { getPreferences, normalizeLogLevel, DEFAULT_PREFERENCES } from './preferences.js';
import { setLogLevel } from './logger.js';

const PREFERENCES_KEY = 'preferences';

/**
 * Load the logLevel preference, apply it, and follow later changes.
 * Never rejects: if the change listener cannot be registered, the loaded level stays applied.
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<string>} The applied log level
 */
export async function initLogLevel(deps = {}) {
  // Apply the default right away so logging stays off while the preference loads
  setLogLevel(DEFAULT_PREFERENCES.logLevel);

  // Register before reading, so a change made while the read is pending is not lost
  let changedWhileLoading = false;
  try {
    const chromeStorage = deps.chromeStorage || chrome.storage;
    if (chromeStorage.onChanged) {
      chromeStorage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes[PREFERENCES_KEY]) {
          changedWhileLoading = true;
          // A change from an older build can lack logLevel, which means the default
          setLogLevel(normalizeLogLevel(changes[PREFERENCES_KEY].newValue?.logLevel));
        }
      });
    }
  } catch (_error) {
    // Without change events the loaded level still applies, it just will not follow later changes
  }

  // getPreferences falls back to the defaults when storage cannot be read
  const prefs = await getPreferences(deps);
  if (!changedWhileLoading) {
    setLogLevel(prefs.logLevel);
  }
  return prefs.logLevel;
}
