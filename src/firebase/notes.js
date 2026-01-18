/**
 * Firebase Notes Service
 * Handles Firestore CRUD operations for notes
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
  onSnapshot
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './config.js';
import { VALID_THEMES, normalizeUrl, parseCompositeUrl, validateSelectorPattern } from '../shared/utils.js';

const NOTES_COLLECTION = 'notes';

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
  onSnapshot
};

/**
 * Create a new note in Firestore
 * @param {Object} noteData - Note data
 * @param {string} userId - Owner's user ID
 * @param {string} userEmail - Owner's email address
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Object>} Created note with ID
 */
export async function createNote(noteData, userId, userEmail, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Validate required fields
  if (!noteData.url || typeof noteData.url !== 'string') {
    throw new Error('Invalid URL');
  }
  
  if (!noteData.selector) {
    throw new Error('Selector is required');
  }
  
  // Validate selector for security
  const selectorValidation = validateSelectorPattern(noteData.selector);
  if (!selectorValidation.valid) {
    throw new Error(`Invalid selector: ${selectorValidation.error}`);
  }
  
  // Validate theme
  const theme = VALID_THEMES.includes(noteData.theme) ? noteData.theme : 'yellow';
  
  // Parse the URL to check if it's a composite URL (for iframe support)
  // Composite URLs are already normalized by createCompositeUrl, so we preserve them
  const { isTopFrame } = parseCompositeUrl(noteData.url);
  // For non-composite URLs, normalize them; for composite URLs, preserve as-is
  const normalizedStorageUrl = isTopFrame ? normalizeUrl(noteData.url) : noteData.url;
  
  const note = {
    url: normalizedStorageUrl,
    selector: noteData.selector.trim(),
    content: noteData.content || '',
    theme: theme,
    position: noteData.position || { anchor: 'top-right' },
    metadata: noteData.metadata || null,
    ownerId: userId,
    ownerEmail: userEmail || null,
    sharedWith: [],
    createdAt: firebaseDeps.serverTimestamp(),
    updatedAt: firebaseDeps.serverTimestamp()
  };
  
  const docRef = await firebaseDeps.addDoc(firebaseDeps.collection(dbInstance, NOTES_COLLECTION), note);
  
  return {
    id: docRef.id,
    ...note,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Get notes for a URL (owned or shared with user)
 * Supports both regular URLs and composite URLs (for iframe support)
 * @param {string} url - Page URL (may be a composite URL for iframes)
 * @param {string} userId - Current user ID
 * @param {string} userEmail - Current user's email (for shared notes lookup)
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Array>} Array of notes
 */
export async function getNotesForUrl(url, userId, userEmail, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Parse the URL to check if it's a composite URL (for iframe support)
  const { isTopFrame } = parseCompositeUrl(url);
  
  // For top-frame requests, normalize the URL
  // For iframe requests, use the composite URL as-is (already normalized)
  const queryUrl = isTopFrame ? normalizeUrl(url) : url;
  
  // Query for owned notes
  const ownedQuery = firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
    firebaseDeps.where('url', '==', queryUrl),
    firebaseDeps.where('ownerId', '==', userId),
    firebaseDeps.orderBy('createdAt', 'desc')
  );
  
  // Query for shared notes - use email address since sharedWith stores emails
  const normalizedEmail = userEmail?.toLowerCase();
  const sharedQuery = normalizedEmail ? firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
    firebaseDeps.where('url', '==', queryUrl),
    firebaseDeps.where('sharedWith', 'array-contains', normalizedEmail),
    firebaseDeps.orderBy('createdAt', 'desc')
  ) : null;
  
  // Execute queries - sharedQuery may be null if no email provided
  const queries = [firebaseDeps.getDocs(ownedQuery)];
  if (sharedQuery) {
    queries.push(firebaseDeps.getDocs(sharedQuery));
  }
  
  const [ownedSnap, sharedSnap] = await Promise.all(queries);
  
  const notes = [];
  const seenIds = new Set();
  
  ownedSnap.forEach(doc => {
    const data = doc.data();
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id);
      notes.push({ id: doc.id, ...data });
    }
  });
  
  if (sharedSnap) {
    sharedSnap.forEach(doc => {
      const data = doc.data();
      if (!seenIds.has(doc.id)) {
        seenIds.add(doc.id);
        notes.push({ id: doc.id, ...data, isShared: true });
      }
    });
  }
  
  return notes;
}

/**
 * Update a note
 * @param {string} noteId - Note ID
 * @param {Object} updates - Fields to update
 * @param {string} userId - Current user ID (for permission check)
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function updateNote(noteId, updates, userId, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  const docRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  const docSnap = await firebaseDeps.getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = docSnap.data();
  
  // Check permission
  if (noteData.ownerId !== userId && !noteData.sharedWith?.includes(userId)) {
    throw new Error('Permission denied');
  }
  
  // Only allow certain fields to be updated
  const allowedFields = ['content', 'theme', 'position', 'selector'];
  const filteredUpdates = {};
  
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }
  
  filteredUpdates.updatedAt = firebaseDeps.serverTimestamp();
  
  await firebaseDeps.updateDoc(docRef, filteredUpdates);
}

/**
 * Delete a note
 * @param {string} noteId - Note ID
 * @param {string} userId - Current user ID (must be owner)
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function deleteNote(noteId, userId, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  const docRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  const docSnap = await firebaseDeps.getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = docSnap.data();
  
  // Only owner can delete
  if (noteData.ownerId !== userId) {
    throw new Error('Only the owner can delete this note');
  }
  
  await firebaseDeps.deleteDoc(docRef);
}

/**
 * Share a note with another user
 * 
 * @param {string} noteId - Note ID
 * @param {string} shareWithUserId - User ID or email to share with
 * @param {string} ownerId - Current owner's user ID
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function shareNote(noteId, shareWithUserId, ownerId, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Validate inputs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('Invalid note ID');
  }
  
  if (!shareWithUserId || typeof shareWithUserId !== 'string') {
    throw new Error('Invalid user identifier');
  }
  
  if (!ownerId || typeof ownerId !== 'string') {
    throw new Error('Invalid owner ID');
  }
  
  // Sanitize the shareWithUserId (trim and lowercase for email comparison)
  const sanitizedShareWith = shareWithUserId.trim().toLowerCase();
  
  // Prevent empty values after sanitization
  if (sanitizedShareWith.length === 0) {
    throw new Error('User identifier cannot be empty');
  }
  
  const docRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  const docSnap = await firebaseDeps.getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = docSnap.data();
  
  // Only owner can share
  if (noteData.ownerId !== ownerId) {
    throw new Error('Only the owner can share this note');
  }
  
  // Add user to sharedWith array if not already there
  const sharedWith = noteData.sharedWith || [];
  if (!sharedWith.includes(sanitizedShareWith)) {
    // Limit the number of users a note can be shared with
    const MAX_SHARES = 50;
    if (sharedWith.length >= MAX_SHARES) {
      throw new Error(`Cannot share with more than ${MAX_SHARES} users`);
    }
    
    sharedWith.push(sanitizedShareWith);
    await firebaseDeps.updateDoc(docRef, { 
      sharedWith,
      updatedAt: firebaseDeps.serverTimestamp()
    });
  }
}

/**
 * Remove a user from a note's shared list (unshare)
 * 
 * @param {string} noteId - Note ID
 * @param {string} emailToRemove - Email address to remove from shared list
 * @param {string} ownerId - Current owner's user ID
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function unshareNote(noteId, emailToRemove, ownerId, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  // Validate inputs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('Invalid note ID');
  }
  
  if (!emailToRemove || typeof emailToRemove !== 'string') {
    throw new Error('Invalid email address');
  }
  
  if (!ownerId || typeof ownerId !== 'string') {
    throw new Error('Invalid owner ID');
  }
  
  // Sanitize the email (trim and lowercase for comparison)
  const sanitizedEmail = emailToRemove.trim().toLowerCase();
  
  // Prevent empty values after sanitization
  if (sanitizedEmail.length === 0) {
    throw new Error('Email address cannot be empty');
  }
  
  const docRef = firebaseDeps.doc(dbInstance, NOTES_COLLECTION, noteId);
  const docSnap = await firebaseDeps.getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = docSnap.data();
  
  // Only owner can unshare
  if (noteData.ownerId !== ownerId) {
    throw new Error('Only the owner can modify sharing');
  }
  
  // Remove email from sharedWith array
  const sharedWith = (noteData.sharedWith || []).filter(email => email !== sanitizedEmail);
  
  await firebaseDeps.updateDoc(docRef, { 
    sharedWith,
    updatedAt: firebaseDeps.serverTimestamp()
  });
}

/**
 * Subscribe to real-time updates for notes on a URL
 * @param {string} url - Page URL
 * @param {string} userId - Current user ID
 * @param {string} userEmail - Current user's email (for shared notes lookup)
 * @param {Function} onUpdate - Callback when notes change (receives array of notes)
 * @param {Function} onError - Callback on error
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Function} Unsubscribe function
 */
export function subscribeToNotesForUrl(url, userId, userEmail, onUpdate, onError, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    onError(new Error('Firebase is not configured'));
    return () => {};
  }
  
  // Validate required parameters
  if (!url || typeof url !== 'string') {
    onError(new Error('Invalid URL'));
    return () => {};
  }
  
  if (!userId || typeof userId !== 'string') {
    onError(new Error('User ID required'));
    return () => {};
  }
  
  if (typeof onUpdate !== 'function') {
    onError(new Error('onUpdate callback required'));
    return () => {};
  }
  
  if (typeof onError !== 'function') {
    // Can't call onError if it's not a function, so just return
    return () => {};
  }
  
  // Parse the URL to check if it's a composite URL (for iframe support)
  const { isTopFrame } = parseCompositeUrl(url);
  
  // For top-frame requests, normalize the URL
  // For iframe requests, use the composite URL as-is (already normalized)
  const queryUrl = isTopFrame ? normalizeUrl(url) : url;
  const normalizedEmail = userEmail?.toLowerCase();
  
  // Track notes from both queries
  let ownedNotes = [];
  let sharedNotes = [];
  
  // Helper to merge and dedupe notes
  const mergeAndNotify = () => {
    const allNotes = [];
    const seenIds = new Set(); // Local variable for deduplication
    
    ownedNotes.forEach(note => {
      if (!seenIds.has(note.id)) {
        seenIds.add(note.id);
        allNotes.push(note);
      }
    });
    
    sharedNotes.forEach(note => {
      if (!seenIds.has(note.id)) {
        seenIds.add(note.id);
        allNotes.push({ ...note, isShared: true });
      }
    });
    
    onUpdate(allNotes);
  };
  
  // Query for owned notes
  const ownedQuery = firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
    firebaseDeps.where('url', '==', queryUrl),
    firebaseDeps.where('ownerId', '==', userId),
    firebaseDeps.orderBy('createdAt', 'desc')
  );
  
  // Subscribe to owned notes
  const unsubOwned = firebaseDeps.onSnapshot(
    ownedQuery,
    (snapshot) => {
      ownedNotes = [];
      snapshot.forEach(doc => {
        ownedNotes.push({ id: doc.id, ...doc.data() });
      });
      mergeAndNotify();
    },
    (error) => {
      onError(error);
    }
  );
  
  // Subscribe to shared notes if email is available
  let unsubShared = () => {};
  if (normalizedEmail) {
    const sharedQuery = firebaseDeps.query(
      firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
      firebaseDeps.where('url', '==', queryUrl),
      firebaseDeps.where('sharedWith', 'array-contains', normalizedEmail),
      firebaseDeps.orderBy('createdAt', 'desc')
    );
    
    unsubShared = firebaseDeps.onSnapshot(
      sharedQuery,
      (snapshot) => {
        sharedNotes = [];
        snapshot.forEach(doc => {
          sharedNotes.push({ id: doc.id, ...doc.data() });
        });
        mergeAndNotify();
      },
      (error) => {
        onError(error);
      }
    );
  }
  
  // Return unsubscribe function that cleans up both listeners
  return () => {
    unsubOwned();
    unsubShared();
  };
}

/**
 * Get all notes shared with a user (across all URLs)
 * @param {string} userEmail - User's email address
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Array>} Array of shared notes
 */
export async function getSharedNotesForUser(userEmail, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    throw new Error('Firebase is not configured');
  }
  
  if (!userEmail) {
    return [];
  }
  
  const normalizedEmail = userEmail.toLowerCase();
  
  const sharedQuery = firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
    firebaseDeps.where('sharedWith', 'array-contains', normalizedEmail),
    firebaseDeps.orderBy('createdAt', 'desc')
  );
  
  const snapshot = await firebaseDeps.getDocs(sharedQuery);
  
  const notes = [];
  snapshot.forEach(doc => {
    notes.push({ id: doc.id, ...doc.data(), isShared: true });
  });
  
  return notes;
}

/**
 * Subscribe to real-time updates for all notes shared with a user (across all URLs)
 * @param {string} userEmail - User's email address
 * @param {Function} onUpdate - Callback when shared notes change (receives array of notes)
 * @param {Function} onError - Callback on error
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSharedNotes(userEmail, onUpdate, onError, deps = {}) {
  const firebaseDeps = { ...defaultFirestoreDeps, ...deps };
  const dbInstance = deps.db !== undefined ? deps.db : db;
  const isConfigured = deps.isFirebaseConfigured !== undefined ? deps.isFirebaseConfigured() : isFirebaseConfigured();
  
  if (!isConfigured || !dbInstance) {
    onError(new Error('Firebase is not configured'));
    return () => {};
  }
  
  if (!userEmail) {
    onError(new Error('User email required'));
    return () => {};
  }
  
  if (typeof onUpdate !== 'function') {
    onError(new Error('onUpdate callback required'));
    return () => {};
  }
  
  if (typeof onError !== 'function') {
    return () => {};
  }
  
  const normalizedEmail = userEmail.toLowerCase();
  
  const sharedQuery = firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
    firebaseDeps.where('sharedWith', 'array-contains', normalizedEmail),
    firebaseDeps.orderBy('createdAt', 'desc')
  );
  
  const unsubscribe = firebaseDeps.onSnapshot(
    sharedQuery,
    (snapshot) => {
      const notes = [];
      snapshot.forEach(doc => {
        notes.push({ id: doc.id, ...doc.data(), isShared: true });
      });
      onUpdate(notes);
    },
    (error) => {
      onError(error);
    }
  );
  
  return unsubscribe;
}
