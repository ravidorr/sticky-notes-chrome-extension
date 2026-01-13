/**
 * Comments Routes
 * REST API endpoints for note comments
 */

import { Router } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { apiKeyAuth } from '../middleware/auth.js';

const router = Router();
const NOTES_COLLECTION = 'notes';
const COMMENTS_SUBCOLLECTION = 'comments';
const MAX_COMMENT_LENGTH = 2000;

/**
 * Check if user has access to a note
 */
async function checkNoteAccess(db, noteId, userId) {
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  const noteSnap = await noteRef.get();
  
  if (!noteSnap.exists) {
    return { hasAccess: false, error: 'Note not found', status: 404 };
  }
  
  const noteData = noteSnap.data();
  
  if (noteData.ownerId !== userId) {
    return { hasAccess: false, error: 'Permission denied', status: 403 };
  }
  
  return { hasAccess: true, noteData };
}

/**
 * GET /api/notes/:noteId/comments
 * List all comments for a note
 */
router.get('/:noteId/comments', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { noteId } = req.params;
    
    const db = getFirestore();
    
    // Check note access
    const access = await checkNoteAccess(db, noteId, userId);
    if (!access.hasAccess) {
      return res.status(access.status).json({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error
      });
    }
    
    // Get comments
    const commentsRef = db.collection(NOTES_COLLECTION).doc(noteId).collection(COMMENTS_SUBCOLLECTION);
    const snapshot = await commentsRef.orderBy('createdAt', 'asc').get();
    
    const comments = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      comments.push({
        id: doc.id,
        authorId: data.authorId,
        authorEmail: data.authorEmail,
        authorName: data.authorName,
        content: data.content,
        parentId: data.parentId,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      });
    });
    
    res.json({ comments });
  } catch (error) {
    console.error('Error listing comments:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list comments'
    });
  }
});

/**
 * POST /api/notes/:noteId/comments
 * Add a comment to a note
 */
router.post('/:noteId/comments', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { noteId } = req.params;
    const { content, parentId } = req.body;
    
    // Validate content
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Comment content is required'
      });
    }
    
    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Comment cannot be empty'
      });
    }
    
    if (trimmedContent.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`
      });
    }
    
    const db = getFirestore();
    
    // Check note access
    const access = await checkNoteAccess(db, noteId, userId);
    if (!access.hasAccess) {
      return res.status(access.status).json({
        error: access.status === 404 ? 'Not Found' : 'Forbidden',
        message: access.error
      });
    }
    
    // If parentId provided, validate it exists and check depth
    if (parentId) {
      const parentRef = db.collection(NOTES_COLLECTION).doc(noteId)
        .collection(COMMENTS_SUBCOLLECTION).doc(parentId);
      const parentSnap = await parentRef.get();
      
      if (!parentSnap.exists) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Parent comment not found'
        });
      }
      
      const parentData = parentSnap.data();
      if (parentData.parentId !== null) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Maximum reply depth reached (cannot reply to a reply)'
        });
      }
    }
    
    // Create comment
    const comment = {
      authorId: userId,
      authorEmail: req.apiKey.name || 'API User',
      authorName: req.apiKey.name || 'API User',
      authorPhotoURL: null,
      content: trimmedContent,
      parentId: parentId || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    
    const commentsRef = db.collection(NOTES_COLLECTION).doc(noteId).collection(COMMENTS_SUBCOLLECTION);
    const docRef = await commentsRef.add(comment);
    
    res.status(201).json({
      id: docRef.id,
      authorId: comment.authorId,
      authorName: comment.authorName,
      content: comment.content,
      parentId: comment.parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create comment'
    });
  }
});

/**
 * PUT /api/notes/:noteId/comments/:commentId
 * Update a comment
 */
router.put('/:noteId/comments/:commentId', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { noteId, commentId } = req.params;
    const { content } = req.body;
    
    // Validate content
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Comment content is required'
      });
    }
    
    const trimmedContent = content.trim();
    if (trimmedContent.length === 0 || trimmedContent.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Comment must be between 1 and ${MAX_COMMENT_LENGTH} characters`
      });
    }
    
    const db = getFirestore();
    
    // Get comment
    const commentRef = db.collection(NOTES_COLLECTION).doc(noteId)
      .collection(COMMENTS_SUBCOLLECTION).doc(commentId);
    const commentSnap = await commentRef.get();
    
    if (!commentSnap.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Comment not found'
      });
    }
    
    const commentData = commentSnap.data();
    
    // Only author can edit
    if (commentData.authorId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the author can edit this comment'
      });
    }
    
    await commentRef.update({
      content: trimmedContent,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    res.json({
      id: commentId,
      content: trimmedContent,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update comment'
    });
  }
});

/**
 * DELETE /api/notes/:noteId/comments/:commentId
 * Delete a comment
 */
router.delete('/:noteId/comments/:commentId', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { noteId, commentId } = req.params;
    
    const db = getFirestore();
    
    // Check note exists and get owner
    const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
    const noteSnap = await noteRef.get();
    
    if (!noteSnap.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Note not found'
      });
    }
    
    const noteData = noteSnap.data();
    
    // Get comment
    const commentRef = db.collection(NOTES_COLLECTION).doc(noteId)
      .collection(COMMENTS_SUBCOLLECTION).doc(commentId);
    const commentSnap = await commentRef.get();
    
    if (!commentSnap.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Comment not found'
      });
    }
    
    const commentData = commentSnap.data();
    
    // Only comment author or note owner can delete
    if (commentData.authorId !== userId && noteData.ownerId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Permission denied'
      });
    }
    
    // If top-level comment, delete replies too
    if (commentData.parentId === null) {
      const repliesQuery = db.collection(NOTES_COLLECTION).doc(noteId)
        .collection(COMMENTS_SUBCOLLECTION)
        .where('parentId', '==', commentId);
      
      const repliesSnap = await repliesQuery.get();
      
      const batch = db.batch();
      repliesSnap.forEach(doc => {
        batch.delete(doc.ref);
      });
      batch.delete(commentRef);
      await batch.commit();
    } else {
      await commentRef.delete();
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete comment'
    });
  }
});

export default router;
