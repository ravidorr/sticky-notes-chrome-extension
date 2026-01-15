/**
 * Helper functions for StickyNotesApp
 * Pure logic extraction for better testability
 */

/**
 * Check if an error is an extension context invalidated error
 * @param {Error|any} error - Error object or value
 * @returns {boolean} True if context is invalidated
 */
export function isContextInvalidatedError(error) {
  const message = error?.message || String(error);
  return message.includes('Extension context invalidated') ||
         message.includes('Extension context was invalidated') ||
         message.includes('context invalidated');
}

/**
 * Determine if we should subscribe to notes based on user state change
 * @param {boolean} wasLoggedIn - Previous login state
 * @param {boolean} isLoggedIn - Current login state
 * @returns {boolean} True if we should subscribe
 */
export function shouldSubscribeToNotes(wasLoggedIn, isLoggedIn) {
  return !wasLoggedIn && isLoggedIn;
}

/**
 * Determine if we should unsubscribe from notes based on user state change
 * @param {boolean} wasLoggedIn - Previous login state
 * @param {boolean} isLoggedIn - Current login state
 * @returns {boolean} True if we should unsubscribe
 */
export function shouldUnsubscribeFromNotes(wasLoggedIn, isLoggedIn) {
  return wasLoggedIn && !isLoggedIn;
}

/**
 * Determine if we should reload notes based on URL change
 * @param {string} currentCompositeUrl - The current composite URL
 * @param {string} newCompositeUrl - The new composite URL
 * @returns {boolean} True if we should reload notes
 */
export function shouldReloadNotes(currentCompositeUrl, newCompositeUrl) {
  return currentCompositeUrl !== newCompositeUrl;
}
