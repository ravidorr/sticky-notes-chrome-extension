/**
 * Lazy Loading Module for Firebase
 *
 * Keeps Firebase SDK behind a lazy boundary to avoid eager parsing at startup.
 * All Firebase modules are consolidated into a single chunk to reduce HTTP overhead.
 */

import { isFirebaseConfigured as isFirebaseConfiguredEnv } from './config-env.js';

// Single consolidated module promise for all Firebase functionality
let firebaseModulePromise = null;

/**
 * Load the consolidated Firebase module
 * This loads config, auth, notes, and comments in a single chunk
 * @returns {Promise<Object>} Consolidated Firebase module exports
 */
function loadFirebaseModule() {
  if (!firebaseModulePromise) {
    firebaseModulePromise = import('./index.js');
  }
  return firebaseModulePromise;
}

/**
 * Lazy load Firebase configuration module
 * @returns {Promise<Object>} Config module exports
 */
export async function getConfigModule() {
  return loadFirebaseModule();
}

/**
 * Check if Firebase is configured (lightweight check without loading full SDK)
 * @returns {boolean}
 */
export function isFirebaseConfiguredSync() {
  return isFirebaseConfiguredEnv();
}

/**
 * Lazy load and initialize Firebase
 * @returns {Promise<Object>} { app, auth, db }
 */
export async function initializeFirebaseLazy() {
  const firebase = await loadFirebaseModule();
  return firebase.initializeFirebase();
}

/**
 * Lazy load Firebase auth module
 * @returns {Promise<Object>} Auth module exports
 */
export async function getAuthModule() {
  await initializeFirebaseLazy();
  return loadFirebaseModule();
}

/**
 * Lazy load Firebase notes module
 * @returns {Promise<Object>} Notes module exports
 */
export async function getNotesModule() {
  await initializeFirebaseLazy();
  return loadFirebaseModule();
}

/**
 * Lazy load Firebase comments module
 * @returns {Promise<Object>} Comments module exports
 */
export async function getCommentsModule() {
  await initializeFirebaseLazy();
  return loadFirebaseModule();
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
