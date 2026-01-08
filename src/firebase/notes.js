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
  serverTimestamp 
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './config.js';
import { VALID_THEMES, normalizeUrl, validateSelectorPattern } from '../shared/utils.js';

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
  serverTimestamp
};

/**
 * Create a new note in Firestore
 * @param {Object} noteData - Note data
 * @param {string} userId - Owner's user ID
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<Object>} Created note with ID
 */
export async function createNote(noteData, userId, deps = {}) {
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
  
  const note = {
    url: normalizeUrl(noteData.url),
    selector: noteData.selector.trim(),
    content: noteData.content || '',
    theme: theme,
    position: noteData.position || { anchor: 'top-right' },
    metadata: noteData.metadata || null,
    ownerId: userId,
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
 * @param {string} url - Page URL
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
  
  // Normalize URL to origin + pathname
  const normalizedUrl = normalizeUrl(url);
  
  // Query for owned notes
  const ownedQuery = firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
    firebaseDeps.where('url', '==', normalizedUrl),
    firebaseDeps.where('ownerId', '==', userId),
    firebaseDeps.orderBy('createdAt', 'desc')
  );
  
  // Query for shared notes - use email address since sharedWith stores emails
  const normalizedEmail = userEmail?.toLowerCase();
  const sharedQuery = normalizedEmail ? firebaseDeps.query(
    firebaseDeps.collection(dbInstance, NOTES_COLLECTION),
    firebaseDeps.where('url', '==', normalizedUrl),
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
