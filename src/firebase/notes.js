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

// validateSelectorPattern is imported from shared/utils.js

/**
 * Create a new note in Firestore
 * @param {Object} noteData - Note data
 * @param {string} userId - Owner's user ID
 * @returns {Promise<Object>} Created note with ID
 */
export async function createNote(noteData, userId) {
  if (!isFirebaseConfigured() || !db) {
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
    ownerId: userId,
    sharedWith: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const docRef = await addDoc(collection(db, NOTES_COLLECTION), note);
  
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
 * @returns {Promise<Array>} Array of notes
 */
export async function getNotesForUrl(url, userId) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }
  
  // Normalize URL to origin + pathname
  const normalizedUrl = normalizeUrl(url);
  console.log('[Firestore] getNotesForUrl called');
  console.log('[Firestore] Original URL:', url);
  console.log('[Firestore] Normalized URL:', normalizedUrl);
  console.log('[Firestore] User ID:', userId);
  
  // Query for owned notes
  const ownedQuery = query(
    collection(db, NOTES_COLLECTION),
    where('url', '==', normalizedUrl),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  // Query for shared notes
  const sharedQuery = query(
    collection(db, NOTES_COLLECTION),
    where('url', '==', normalizedUrl),
    where('sharedWith', 'array-contains', userId),
    orderBy('createdAt', 'desc')
  );
  
  const [ownedSnap, sharedSnap] = await Promise.all([
    getDocs(ownedQuery),
    getDocs(sharedQuery)
  ]);
  
  console.log('[Firestore] Owned query returned:', ownedSnap.size, 'docs');
  console.log('[Firestore] Shared query returned:', sharedSnap.size, 'docs');
  
  const notes = [];
  const seenIds = new Set();
  
  ownedSnap.forEach(doc => {
    const data = doc.data();
    console.log('[Firestore] Owned note:', doc.id, 'URL:', data.url);
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id);
      notes.push({ id: doc.id, ...data });
    }
  });
  
  sharedSnap.forEach(doc => {
    const data = doc.data();
    console.log('[Firestore] Shared note:', doc.id, 'URL:', data.url);
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id);
      notes.push({ id: doc.id, ...data, isShared: true });
    }
  });
  
  console.log('[Firestore] Total notes to return:', notes.length);
  return notes;
}

/**
 * Update a note
 * @param {string} noteId - Note ID
 * @param {Object} updates - Fields to update
 * @param {string} userId - Current user ID (for permission check)
 * @returns {Promise<void>}
 */
export async function updateNote(noteId, updates, userId) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }
  
  const docRef = doc(db, NOTES_COLLECTION, noteId);
  const docSnap = await getDoc(docRef);
  
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
  
  filteredUpdates.updatedAt = serverTimestamp();
  
  await updateDoc(docRef, filteredUpdates);
}

/**
 * Delete a note
 * @param {string} noteId - Note ID
 * @param {string} userId - Current user ID (must be owner)
 * @returns {Promise<void>}
 */
export async function deleteNote(noteId, userId) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }
  
  const docRef = doc(db, NOTES_COLLECTION, noteId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('Note not found');
  }
  
  const noteData = docSnap.data();
  
  // Only owner can delete
  if (noteData.ownerId !== userId) {
    throw new Error('Only the owner can delete this note');
  }
  
  await deleteDoc(docRef);
}

/**
 * Share a note with another user
 * 
 * SECURITY NOTE: This function currently accepts email addresses as the shareWithUserId.
 * For production use, implement a Cloud Function that:
 * 1. Validates the target user exists
 * 2. Converts email to Firebase UID
 * 3. Handles user lookup securely server-side
 * 
 * @param {string} noteId - Note ID
 * @param {string} shareWithUserId - User ID or email to share with
 * @param {string} ownerId - Current owner's user ID
 * @returns {Promise<void>}
 */
export async function shareNote(noteId, shareWithUserId, ownerId) {
  if (!isFirebaseConfigured() || !db) {
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
  
  const docRef = doc(db, NOTES_COLLECTION, noteId);
  const docSnap = await getDoc(docRef);
  
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
    await updateDoc(docRef, { 
      sharedWith,
      updatedAt: serverTimestamp()
    });
  }
}

// normalizeUrl is imported from shared/utils.js
