/**
 * Lazy Loading Module for Firebase
 * 
 * Uses dynamic import() to load Firebase modules only when needed.
 * This significantly reduces the initial service worker startup time
 * by deferring the ~800KB Firebase SDK load until first use.
 */

// Cache for loaded modules
const firebaseModules = null;
let authModule = null;
let notesModule = null;
let commentsModule = null;
let configModule = null;

/**
 * Lazy load Firebase configuration module
 * @returns {Promise<Object>} Config module exports
 */
export async function getConfigModule() {
  if (!configModule) {
    configModule = await import('./config.js');
  }
  return configModule;
}

/**
 * Check if Firebase is configured (lightweight check without loading full SDK)
 * @returns {boolean}
 */
export function isFirebaseConfiguredSync() {
  // Check environment variables without loading Firebase
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return false;
  }
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  return apiKey && !apiKey.includes('your_') && apiKey !== 'YOUR_API_KEY';
}

/**
 * Lazy load and initialize Firebase
 * @returns {Promise<Object>} { app, auth, db }
 */
export async function initializeFirebaseLazy() {
  const config = await getConfigModule();
  return config.initializeFirebase();
}

/**
 * Lazy load Firebase auth module
 * @returns {Promise<Object>} Auth module exports
 */
export async function getAuthModule() {
  if (!authModule) {
    // Ensure Firebase is initialized first
    await initializeFirebaseLazy();
    authModule = await import('./auth.js');
  }
  return authModule;
}

/**
 * Lazy load Firebase notes module
 * @returns {Promise<Object>} Notes module exports
 */
export async function getNotesModule() {
  if (!notesModule) {
    // Ensure Firebase is initialized first
    await initializeFirebaseLazy();
    notesModule = await import('./notes.js');
  }
  return notesModule;
}

/**
 * Lazy load Firebase comments module
 * @returns {Promise<Object>} Comments module exports
 */
export async function getCommentsModule() {
  if (!commentsModule) {
    // Ensure Firebase is initialized first
    await initializeFirebaseLazy();
    commentsModule = await import('./comments.js');
  }
  return commentsModule;
}

// Lazy wrapper functions for common operations

/**
 * Lazy wrapper for signInWithGoogle
 */
export async function signInWithGoogleLazy(deps) {
  const auth = await getAuthModule();
  return auth.signInWithGoogle(deps);
}

/**
 * Lazy wrapper for signOut
 */
export async function signOutLazy(deps) {
  const auth = await getAuthModule();
  return auth.signOut(deps);
}

/**
 * Lazy wrapper for getCurrentUser
 */
export async function getCurrentUserLazy(deps) {
  const auth = await getAuthModule();
  return auth.getCurrentUser(deps);
}

/**
 * Lazy wrapper for isAuthConfigured
 */
export async function isAuthConfiguredLazy(deps) {
  const auth = await getAuthModule();
  return auth.isAuthConfigured(deps);
}

/**
 * Lazy wrapper for createNote
 */
export async function createNoteLazy(noteData, userId, userEmail, deps) {
  const notes = await getNotesModule();
  return notes.createNote(noteData, userId, userEmail, deps);
}

/**
 * Lazy wrapper for getNotesForUrl
 */
export async function getNotesForUrlLazy(url, userId, userEmail, deps) {
  const notes = await getNotesModule();
  return notes.getNotesForUrl(url, userId, userEmail, deps);
}

/**
 * Lazy wrapper for updateNote
 */
export async function updateNoteLazy(noteId, updates, userId, deps) {
  const notes = await getNotesModule();
  return notes.updateNote(noteId, updates, userId, deps);
}

/**
 * Lazy wrapper for deleteNote
 */
export async function deleteNoteLazy(noteId, userId, deps) {
  const notes = await getNotesModule();
  return notes.deleteNote(noteId, userId, deps);
}

/**
 * Lazy wrapper for shareNote
 */
export async function shareNoteLazy(noteId, shareWithUserId, ownerId, deps) {
  const notes = await getNotesModule();
  return notes.shareNote(noteId, shareWithUserId, ownerId, deps);
}

/**
 * Lazy wrapper for unshareNote
 */
export async function unshareNoteLazy(noteId, emailToRemove, ownerId, deps) {
  const notes = await getNotesModule();
  return notes.unshareNote(noteId, emailToRemove, ownerId, deps);
}

/**
 * Lazy wrapper for leaveSharedNote
 */
export async function leaveSharedNoteLazy(noteId, userEmail, deps) {
  const notes = await getNotesModule();
  return notes.leaveSharedNote(noteId, userEmail, deps);
}

/**
 * Lazy wrapper for subscribeToNotesForUrl
 */
export async function subscribeToNotesForUrlLazy(url, userId, userEmail, onUpdate, onError, deps) {
  const notes = await getNotesModule();
  return notes.subscribeToNotesForUrl(url, userId, userEmail, onUpdate, onError, deps);
}

/**
 * Lazy wrapper for subscribeToSharedNotes
 */
export async function subscribeToSharedNotesLazy(userEmail, onUpdate, onError, deps) {
  const notes = await getNotesModule();
  return notes.subscribeToSharedNotes(userEmail, onUpdate, onError, deps);
}

/**
 * Lazy wrapper for getSharedNotesForUser
 */
export async function getSharedNotesForUserLazy(userEmail, deps) {
  const notes = await getNotesModule();
  return notes.getSharedNotesForUser(userEmail, deps);
}

/**
 * Lazy wrapper for createComment
 */
export async function createCommentLazy(noteId, commentData, userId, deps) {
  const comments = await getCommentsModule();
  return comments.createComment(noteId, commentData, userId, deps);
}

/**
 * Lazy wrapper for getCommentsForNote
 */
export async function getCommentsForNoteLazy(noteId, deps) {
  const comments = await getCommentsModule();
  return comments.getCommentsForNote(noteId, deps);
}

/**
 * Lazy wrapper for updateComment
 */
export async function updateCommentLazy(noteId, commentId, updates, userId, deps) {
  const comments = await getCommentsModule();
  return comments.updateComment(noteId, commentId, updates, userId, deps);
}

/**
 * Lazy wrapper for deleteComment
 */
export async function deleteCommentLazy(noteId, commentId, userId, deps) {
  const comments = await getCommentsModule();
  return comments.deleteComment(noteId, commentId, userId, deps);
}

/**
 * Lazy wrapper for subscribeToComments
 */
export async function subscribeToCommentsLazy(noteId, onUpdate, onError, deps) {
  const comments = await getCommentsModule();
  return comments.subscribeToComments(noteId, onUpdate, onError, deps);
}
