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

const NOTES_COLLECTION = 'notes';

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
  
  const note = {
    url: noteData.url,
    selector: noteData.selector,
    content: noteData.content || '',
    theme: noteData.theme || 'yellow',
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
  
  const notes = [];
  const seenIds = new Set();
  
  ownedSnap.forEach(doc => {
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id);
      notes.push({ id: doc.id, ...doc.data() });
    }
  });
  
  sharedSnap.forEach(doc => {
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id);
      notes.push({ id: doc.id, ...doc.data(), isShared: true });
    }
  });
  
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
 * @param {string} noteId - Note ID
 * @param {string} shareWithUserId - User ID to share with
 * @param {string} ownerId - Current owner's user ID
 * @returns {Promise<void>}
 */
export async function shareNote(noteId, shareWithUserId, ownerId) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
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
  if (!sharedWith.includes(shareWithUserId)) {
    sharedWith.push(shareWithUserId);
    await updateDoc(docRef, { 
      sharedWith,
      updatedAt: serverTimestamp()
    });
  }
}

/**
 * Normalize URL to origin + pathname
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return url;
  }
}
