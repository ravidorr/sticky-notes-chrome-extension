/**
 * Notes Routes
 * REST API endpoints for notes CRUD operations
 */

import { Router } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { apiKeyAuth } from '../middleware/auth.js';
import { validateNoteData, normalizeUrl, VALID_THEMES } from '../lib/utils.js';

const router = Router();
const NOTES_COLLECTION = 'notes';

/**
 * GET /api/notes
 * List notes for the authenticated user
 * Query params:
 *   - url: Filter by URL (optional)
 *   - limit: Max results (default 50, max 100)
 *   - offset: Pagination offset (default 0)
 */
router.get('/', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { url, limit = '50', offset = '0' } = req.query;
    
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    
    const db = getFirestore();
    let query = db.collection(NOTES_COLLECTION)
      .where('ownerId', '==', userId)
      .orderBy('createdAt', 'desc');
    
    // Filter by URL if provided
    if (url) {
      const normalizedUrl = normalizeUrl(url);
      query = db.collection(NOTES_COLLECTION)
        .where('ownerId', '==', userId)
        .where('url', '==', normalizedUrl)
        .orderBy('createdAt', 'desc');
    }
    
    // Apply pagination
    query = query.limit(limitNum + 1).offset(offsetNum);
    
    const snapshot = await query.get();
    const notes = [];
    let hasMore = false;
    
    snapshot.forEach((doc, index) => {
      if (notes.length < limitNum) {
        const data = doc.data();
        notes.push({
          id: doc.id,
          url: data.url,
          selector: data.selector,
          content: data.content,
          theme: data.theme,
          position: data.position,
          metadata: data.metadata,
          sharedWith: data.sharedWith || [],
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
        });
      } else {
        hasMore = true;
      }
    });
    
    res.json({
      notes,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore
      }
    });
  } catch (error) {
    console.error('Error listing notes:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list notes'
    });
  }
});

/**
 * GET /api/notes/:id
 * Get a specific note by ID
 */
router.get('/:id', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { id } = req.params;
    
    const db = getFirestore();
    const docRef = db.collection(NOTES_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Note not found'
      });
    }
    
    const data = doc.data();
    
    // Check ownership
    if (data.ownerId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this note'
      });
    }
    
    res.json({
      id: doc.id,
      url: data.url,
      selector: data.selector,
      content: data.content,
      theme: data.theme,
      position: data.position,
      metadata: data.metadata,
      sharedWith: data.sharedWith || [],
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
    });
  } catch (error) {
    console.error('Error getting note:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get note'
    });
  }
});

/**
 * POST /api/notes
 * Create a new note
 */
router.post('/', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const noteData = req.body;
    
    // Validate note data
    const validation = validateNoteData(noteData, false);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid note data',
        details: validation.errors
      });
    }
    
    // Build note document
    const note = {
      url: normalizeUrl(noteData.url),
      selector: noteData.selector.trim(),
      content: noteData.content || '',
      theme: VALID_THEMES.includes(noteData.theme) ? noteData.theme : 'yellow',
      position: noteData.position || { anchor: 'top-right' },
      metadata: noteData.metadata || null,
      ownerId: userId,
      sharedWith: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    const db = getFirestore();
    const docRef = await db.collection(NOTES_COLLECTION).add(note);
    
    // Return created note
    res.status(201).json({
      id: docRef.id,
      url: note.url,
      selector: note.selector,
      content: note.content,
      theme: note.theme,
      position: note.position,
      metadata: note.metadata,
      sharedWith: note.sharedWith,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create note'
    });
  }
});

/**
 * PUT /api/notes/:id
 * Update a note
 */
router.put('/:id', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { id } = req.params;
    const updates = req.body;
    
    // Validate update data
    const validation = validateNoteData(updates, true);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid update data',
        details: validation.errors
      });
    }
    
    const db = getFirestore();
    const docRef = db.collection(NOTES_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Note not found'
      });
    }
    
    const data = doc.data();
    
    // Check ownership
    if (data.ownerId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this note'
      });
    }
    
    // Build update object - only allow certain fields
    const allowedFields = ['content', 'theme', 'position', 'selector'];
    const filteredUpdates = {};
    
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }
    
    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update'
      });
    }
    
    filteredUpdates.updatedAt = FieldValue.serverTimestamp();
    
    await docRef.update(filteredUpdates);
    
    // Fetch updated document
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data();
    
    res.json({
      id: updatedDoc.id,
      url: updatedData.url,
      selector: updatedData.selector,
      content: updatedData.content,
      theme: updatedData.theme,
      position: updatedData.position,
      metadata: updatedData.metadata,
      sharedWith: updatedData.sharedWith || [],
      createdAt: updatedData.createdAt?.toDate?.()?.toISOString() || updatedData.createdAt,
      updatedAt: updatedData.updatedAt?.toDate?.()?.toISOString() || updatedData.updatedAt
    });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update note'
    });
  }
});

/**
 * DELETE /api/notes/:id
 * Delete a note
 */
router.delete('/:id', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { id } = req.params;
    
    const db = getFirestore();
    const docRef = db.collection(NOTES_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Note not found'
      });
    }
    
    const data = doc.data();
    
    // Check ownership - only owner can delete
    if (data.ownerId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the owner can delete this note'
      });
    }
    
    await docRef.delete();
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete note'
    });
  }
});

export default router;
