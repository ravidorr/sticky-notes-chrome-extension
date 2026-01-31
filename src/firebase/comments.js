/**
 * Firebase Comments Service
 * Handles Firestore CRUD operations for note comments
 * 
 * Data Model (Firestore: notes/{noteId}/comments/{commentId}):
 * {
 *   id: string,
 *   authorId: string,
 *   authorEmail: string,
 *   authorName: string,
 *   authorPhotoURL: string | null,
 *   content: string,
 *   createdAt: Timestamp,
 *   updatedAt: Timestamp,
 *   parentId: string | null  // null = top-level, commentId for replies
 * }
 */

import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './config.js';
import { MAX_COMMENT_LENGTH } from '../shared/utils.js';

const NOTES_COLLECTION = 'notes';
const COMMENTS_SUBCOLLECTION = 'comments';

// Maximum nesting depth for replies (1 = only direct replies to top-level comments)
const MAX_REPLY_DEPTH = 1;

/**
 * Default Firestore dependencies - can be overridden for testing
 */
const defaultFirestoreDeps = {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  onSnapshot
};

/**
 * Validate comment content
 * @param {string} content - Comment content
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
export function validateCommentContent(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Comment content is required' };
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Comment cannot be empty' };
  }
  
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return { valid: false, error: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters` };
  }
  
  return { valid: true };
}

/**
 * Check if user has permission to access a note (owner or shared with)
 * @param {Object} noteData - Note document data
 * @param {string} userId - User ID to check
 * @param {string} userEmail - User email to check
 * @returns {boolean} True if user has access
 */
function hasNoteAccess(noteData, userId, userEmail) {
  if (noteData.ownerId === userId) {
    return true;
  }
  
  const normalizedEmail = userEmail?.toLowerCase();
  if (normalizedEmail && noteData.sharedWith?.includes(normalizedEmail)) {
    return true;
  }
  
  return false;
}

/**
 * Create a new comment on a note
 * @param {string} noteId - Note ID to comment on
 * @param {Object} commentData - Comment data
 * @param {string} commentData.content - Comment text content
 * @param {string|null} commentData.parentId - Parent comment ID for replies (null for top-level)
 * @param {Object} user - Current user { uid, email, displayName }
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Object>} Created comment with ID
 */
export async function createComment(noteId, commentData, user, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Validate note ID
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('Invalid note ID');
  }
  
  // Validate user
  if (!user || !user.uid) {
    throw new Error('User authentication required');
  }
  
  // Validate content
  const contentValidation = validateCommentContent(commentData.content);
  if (!contentValidation.valid) {
    throw new Error(contentValidation.error);
  }
  
  // Check if note exists and user has access
  const noteRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  const noteSnap = await firebaseDeps.getDoc(noteRef);
  
  if (!noteSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = noteSnap.data();
  
  if (!hasNoteAccess(noteData, user.uid, user.email)) {
    throw new Error('Permission denied');
  }
  
  // If this is a reply, validate the parent comment
  if (commentData.parentId) {
    const parentRef = firebaseDeps.doc(
      dbInstance, 
      NOTES_COLLECTION, 
      noteId, 
      COMMENTS_SUBCOLLECTION, 
      commentData.parentId
    );
    const parentSnap = await firebaseDeps.getDoc(parentRef);
    
    if (!parentSnap.exists()) {
      throw new Error('Parent comment not found');
    }
    
    const parentData = parentSnap.data();
    
    // Enforce max reply depth - if parent already has a parentId, we're at max depth
    if (parentData.parentId !== null) {
      throw new Error('Maximum reply depth reached');
    }
  }
  
  const comment = {
    authorId: user.uid,
    authorEmail: user.email || '',
    authorName: user.displayName || user.email || 'Anonymous',
    authorPhotoURL: user.photoURL || null,
    content: commentData.content.trim(), // Store raw content; escape at render time
    parentId: commentData.parentId || null,
    createdAt: firebaseDeps.serverTimestamp(),
    updatedAt: firebaseDeps.serverTimestamp()
  };
  
  const commentsRef = firebaseDeps.collection(dbInstance, NOTES_COLLECTION, noteId, COMMENTS_SUBCOLLECTION);
  const docRef = await firebaseDeps.addDoc(commentsRef, comment);
  
  return {
    id: docRef.id,
    ...comment,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Get all comments for a note
 * @param {string} noteId - Note ID
 * @param {Object} user - Current user { uid, email }
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Array>} Array of comments sorted by creation date
 */
export async function getCommentsForNote(noteId, user, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Validate note ID
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('Invalid note ID');
  }
  
  // Validate user
  if (!user || !user.uid) {
    throw new Error('User authentication required');
  }
  
  // Check if note exists and user has access
  const noteRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  const noteSnap = await firebaseDeps.getDoc(noteRef);
  
  if (!noteSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = noteSnap.data();
  
  if (!hasNoteAccess(noteData, user.uid, user.email)) {
    throw new Error('Permission denied');
  }
  
  // Query comments ordered by creation date
  const commentsQuery = firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION, noteId, COMMENTS_SUBCOLLECTION),
    firebaseDeps.orderBy('createdAt', 'asc')
  );
  
  const snapshot = await firebaseDeps.getDocs(commentsQuery);
  
  const comments = [];
  snapshot.forEach(doc => {
    comments.push({ id: doc.id, ...doc.data() });
  });
  
  return comments;
}

/**
 * Update a comment
 * @param {string} noteId - Note ID
 * @param {string} commentId - Comment ID
 * @param {Object} updates - Fields to update (only content allowed)
 * @param {string} userId - Current user ID
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function updateComment(noteId, commentId, updates, userId, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Validate IDs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('Invalid note ID');
  }
  
  if (!commentId || typeof commentId !== 'string') {
    throw new Error('Invalid comment ID');
  }
  
  // Validate content if provided
  if (updates.content !== undefined) {
    const contentValidation = validateCommentContent(updates.content);
    if (!contentValidation.valid) {
      throw new Error(contentValidation.error);
    }
  }
  
  const commentRef = firebaseDeps.doc(
    dbInstance, 
    NOTES_COLLECTION, 
    noteId, 
    COMMENTS_SUBCOLLECTION, 
    commentId
  );
  const commentSnap = await firebaseDeps.getDoc(commentRef);
  
  if (!commentSnap.exists()) {
    throw new Error('Comment not found');
  }
  
  const commentData = commentSnap.data();
  
  // Only the author can edit their comment
  if (commentData.authorId !== userId) {
    throw new Error('Only the author can edit this comment');
  }
  
  // Only allow content to be updated
  const filteredUpdates = {};
  if (updates.content !== undefined) {
    filteredUpdates.content = updates.content.trim(); // Store raw content; escape at render time
  }
  
  if (Object.keys(filteredUpdates).length === 0) {
    return; // Nothing to update
  }
  
  filteredUpdates.updatedAt = firebaseDeps.serverTimestamp();
  
  await firebaseDeps.updateDoc(commentRef, filteredUpdates);
}

/**
 * Delete a comment
 * @param {string} noteId - Note ID
 * @param {string} commentId - Comment ID
 * @param {string} userId - Current user ID
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function deleteComment(noteId, commentId, userId, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Validate IDs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('Invalid note ID');
  }
  
  if (!commentId || typeof commentId !== 'string') {
    throw new Error('Invalid comment ID');
  }
  
  // Check note exists to get owner info
  const noteRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  const noteSnap = await firebaseDeps.getDoc(noteRef);
  
  if (!noteSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = noteSnap.data();
  
  const commentRef = firebaseDeps.doc(
    dbInstance, 
    NOTES_COLLECTION, 
    noteId, 
    COMMENTS_SUBCOLLECTION, 
    commentId
  );
  const commentSnap = await firebaseDeps.getDoc(commentRef);
  
  if (!commentSnap.exists()) {
    throw new Error('Comment not found');
  }
  
  const commentData = commentSnap.data();
  
  // Only comment author or note owner can delete
  if (commentData.authorId !== userId && noteData.ownerId !== userId) {
    throw new Error('Permission denied');
  }
  
  // If this is a top-level comment, also delete all replies
  if (commentData.parentId === null) {
    // Find all replies to this comment
    const repliesQuery = firebaseDeps.query(
      firebaseDeps.collection(dbInstance, NOTES_COLLECTION, noteId, COMMENTS_SUBCOLLECTION),
      firebaseDeps.where('parentId', '==', commentId)
    );
    
    const repliesSnap = await firebaseDeps.getDocs(repliesQuery);
    
    // Use batch delete if there are replies
    if (repliesSnap.size > 0) {
      const batch = firebaseDeps.writeBatch(dbInstance);
      
      repliesSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      batch.delete(commentRef);
      await batch.commit();
    } else {
      await firebaseDeps.deleteDoc(commentRef);
    }
  } else {
    await firebaseDeps.deleteDoc(commentRef);
  }
}

/**
 * Get comment count for a note
 * @param {string} noteId - Note ID
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<number>} Number of comments
 */
export async function getCommentCount(noteId, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('Invalid note ID');
  }
  
  const commentsRef = firebaseDeps.collection(dbInstance, NOTES_COLLECTION, noteId, COMMENTS_SUBCOLLECTION);
  const snapshot = await firebaseDeps.getDocs(commentsRef);
  
  return snapshot.size;
}

/**
 * Subscribe to real-time updates for comments on a note
 * @param {string} noteId - Note ID
 * @param {Object} user - Current user { uid, email }
 * @param {Function} onUpdate - Callback when comments change (receives array of comments)
 * @param {Function} onError - Callback on error
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Function} Unsubscribe function
 */
export function subscribeToComments(noteId, user, onUpdate, onError, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    onError(new Error('Firebase is not configured'));
    return () => {};
  }
  
  // Validate note ID
  if (!noteId || typeof noteId !== 'string') {
    onError(new Error('Invalid note ID'));
    return () => {};
  }
  
  // Validate user
  if (!user || !user.uid) {
    onError(new Error('User authentication required'));
    return () => {};
  }
  
  // Use a ref to store the unsubscribe function since it's set asynchronously
  const unsubscribeRef = { current: () => {} };
  
  // Track if unsubscribe was called before listener was set up (race condition prevention)
  let isUnsubscribed = false;
  
  // Debounce timer to prevent rapid updates
  let debounceTimer = null;
  const DEBOUNCE_MS = 100;
  
  // First verify user has access to the note
  const noteRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  
  // We need to check access once, then set up the listener
  firebaseDeps.getDoc(noteRef).then(noteSnap => {
    // Check if unsubscribe was called while waiting for getDoc
    if (isUnsubscribed) {
      return; // Don't set up listener if already unsubscribed
    }
    
    if (!noteSnap.exists()) {
      onError(new Error('Note not found'));
      return;
    }
    
    const noteData = noteSnap.data();
    
    if (!hasNoteAccess(noteData, user.uid, user.email)) {
      onError(new Error('Permission denied'));
      return;
    }
    
    // User has access, set up the real-time listener
    const commentsQuery = firebaseDeps.query(
      firebaseDeps.collection(dbInstance, NOTES_COLLECTION, noteId, COMMENTS_SUBCOLLECTION),
      firebaseDeps.orderBy('createdAt', 'asc')
    );
    
    // Double-check unsubscribed flag before setting up listener
    if (isUnsubscribed) {
      return;
    }
    
    unsubscribeRef.current = firebaseDeps.onSnapshot(
      commentsQuery,
      (snapshot) => {
        // Don't process updates if already unsubscribed
        if (isUnsubscribed) {
          return;
        }
        // Debounce rapid updates
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          // Check again in case unsubscribe was called during debounce
          if (isUnsubscribed) {
            return;
          }
          const comments = [];
          snapshot.forEach(doc => {
            comments.push({ id: doc.id, ...doc.data() });
          });
          onUpdate(comments);
        }, DEBOUNCE_MS);
      },
      (error) => {
        if (!isUnsubscribed) {
          onError(error);
        }
      }
    );
  }).catch(error => {
    if (!isUnsubscribed) {
      onError(error);
    }
  });
  
  // Return unsubscribe function that cleans up timer as well
  return () => {
    isUnsubscribed = true; // Set flag to prevent listener setup
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    unsubscribeRef.current();
  };
}

export { MAX_REPLY_DEPTH, MAX_COMMENT_LENGTH };
