/**
 * Firebase Consolidated Module
 *
 * This module consolidates all Firebase-related exports into a single chunk
 * to reduce HTTP overhead when lazy-loading Firebase functionality.
 * Instead of creating separate chunks for auth, notes, and comments,
 * we bundle them together since they're typically used together.
 */

// Re-export config functions
export {
  initializeFirebase,
  resetFirebase,
  auth,
  db,
  getFirebaseConfig,
  isConfigValid,
  isFirebaseConfigured
} from './config.js';

// Re-export auth functions
export {
  isEdgeBrowser,
  getOAuthClientId,
  isAuthConfigured,
  getOAuthToken,
  signInWithGoogle,
  revokeOAuthToken,
  signOut,
  getCurrentUser
} from './auth.js';

// Re-export notes functions
export {
  createNote,
  getNotesForUrl,
  updateNote,
  deleteNote,
  shareNote,
  unshareNote,
  leaveSharedNote,
  subscribeToNotesForUrl,
  getSharedNotesForUser,
  subscribeToSharedNotes
} from './notes.js';

// Re-export comments functions
export {
  validateCommentContent,
  createComment,
  getCommentsForNote,
  updateComment,
  deleteComment,
  getCommentCount,
  subscribeToComments,
  MAX_REPLY_DEPTH,
  MAX_COMMENT_LENGTH
} from './comments.js';
