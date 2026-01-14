/**
 * Notes Routes
 * REST API endpoints for notes CRUD operations
 */

import { Router } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { apiKeyAuth } from '../middleware/auth.js';
import { validateNoteData, normalizeUrl, normalizeDomain, VALID_THEMES } from '../lib/utils.js';

const router = Router();
const NOTES_COLLECTION = 'notes';

/**
 * GET /api/notes
 * List notes for the authenticated user (owned + shared with them)
 * Query params:
 *   - url: Filter by exact URL (optional)
 *   - domain: Filter by domain/origin prefix - matches all pages on that domain (optional)
 *   - filter: Filter by ownership - 'owned', 'shared', or 'all' (default: 'all')
 *   - limit: Max results (default 50, max 100)
 *   - offset: Pagination offset (default 0)
 */
router.get('/', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId, userEmail } = req.apiKey;
    const { url, domain, filter = 'all', limit = '50', offset = '0' } = req.query;
    
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    
    // Validate filter parameter
    const validFilters = ['owned', 'shared', 'all'];
    const filterValue = validFilters.includes(filter) ? filter : 'all';
    
    const db = getFirestore();
    const normalizedEmail = userEmail?.toLowerCase();
    
    // Determine which queries to build based on filter
    const includeOwned = filterValue === 'owned' || filterValue === 'all';
    const includeShared = (filterValue === 'shared' || filterValue === 'all') && normalizedEmail;
    
    // Build queries for owned and shared notes
    let ownedQuery = null;
    let sharedQuery = null;
    
    if (url) {
      // Exact URL matching
      const normalizedUrl = normalizeUrl(url);
      if (includeOwned) {
        ownedQuery = db.collection(NOTES_COLLECTION)
          .where('ownerId', '==', userId)
          .where('url', '==', normalizedUrl)
          .orderBy('createdAt', 'desc');
      }
      
      if (includeShared) {
        sharedQuery = db.collection(NOTES_COLLECTION)
          .where('sharedWith', 'array-contains', normalizedEmail)
          .where('url', '==', normalizedUrl)
          .orderBy('createdAt', 'desc');
      }
    } else if (domain) {
      // Domain prefix matching - find all notes for a domain
      const normalizedDomainPrefix = normalizeDomain(domain);
      
      if (!normalizedDomainPrefix) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid domain format'
        });
      }
      
      // Use Firestore range query for prefix matching
      // URLs starting with the domain origin (e.g., "https://example.com")
      const domainEnd = normalizedDomainPrefix + '\uffff';
      
      if (includeOwned) {
        ownedQuery = db.collection(NOTES_COLLECTION)
          .where('ownerId', '==', userId)
          .where('url', '>=', normalizedDomainPrefix)
          .where('url', '<', domainEnd)
          .orderBy('url')
          .orderBy('createdAt', 'desc');
      }
      
      if (includeShared) {
        sharedQuery = db.collection(NOTES_COLLECTION)
          .where('sharedWith', 'array-contains', normalizedEmail)
          .where('url', '>=', normalizedDomainPrefix)
          .where('url', '<', domainEnd)
          .orderBy('url')
          .orderBy('createdAt', 'desc');
      }
    } else {
      // No URL/domain filter - return notes based on ownership filter
      if (includeOwned) {
        ownedQuery = db.collection(NOTES_COLLECTION)
          .where('ownerId', '==', userId)
          .orderBy('createdAt', 'desc');
      }
      
      if (includeShared) {
        sharedQuery = db.collection(NOTES_COLLECTION)
          .where('sharedWith', 'array-contains', normalizedEmail)
          .orderBy('createdAt', 'desc');
      }
    }
    
    // Execute queries in parallel
    const queries = [];
    if (ownedQuery) {
      queries.push(ownedQuery.get());
    }
    if (sharedQuery) {
      queries.push(sharedQuery.get());
    }
    
    // Handle case where no queries to execute (e.g., filter=shared but no email)
    if (queries.length === 0) {
      return res.json({
        notes: [],
        filter: filterValue,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          hasMore: false
        }
      });
    }
    
    const snapshots = await Promise.all(queries);
    
    // Track which snapshot is which based on what queries were built
    let ownedSnap = null;
    let sharedSnap = null;
    let snapIndex = 0;
    
    if (ownedQuery) {
      ownedSnap = snapshots[snapIndex++];
    }
    if (sharedQuery) {
      sharedSnap = snapshots[snapIndex++];
    }
    
    // Merge and dedupe notes
    const notes = [];
    const seenIds = new Set();
    
    // Add owned notes first
    if (ownedSnap) {
      ownedSnap.forEach(doc => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
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
            isShared: false,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
          });
        }
      });
    }
    
    // Add shared notes
    if (sharedSnap) {
      sharedSnap.forEach(doc => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
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
            isShared: true,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
          });
        }
      });
    }
    
    // Sort all notes by createdAt desc
    notes.sort((noteA, noteB) => new Date(noteB.createdAt) - new Date(noteA.createdAt));
    
    // Apply pagination
    const paginatedNotes = notes.slice(offsetNum, offsetNum + limitNum);
    const hasMore = notes.length > offsetNum + limitNum;
    
    res.json({
      notes: paginatedNotes,
      filter: filterValue,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore
      }
    });
  } catch (error) {
    console.error('Error listing notes:', error.message, error.stack);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list notes',
      debug: error.message
    });
  }
});

/**
 * GET /api/notes/search
 * Search notes by content (owned + shared)
 * Query params:
 *   - q: Search query (required)
 *   - limit: Max results (default 50, max 100)
 */
router.get('/search', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId, userEmail } = req.apiKey;
    const { q, limit = '50' } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Search query (q) is required'
      });
    }
    
    const searchQuery = q.trim().toLowerCase();
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
    const normalizedEmail = userEmail?.toLowerCase();
    
    const db = getFirestore();
    
    // Build queries for owned and shared notes
    const ownedQuery = db.collection(NOTES_COLLECTION)
      .where('ownerId', '==', userId)
      .orderBy('createdAt', 'desc');
    
    const queries = [ownedQuery.get()];
    
    if (normalizedEmail) {
      const sharedQuery = db.collection(NOTES_COLLECTION)
        .where('sharedWith', 'array-contains', normalizedEmail)
        .orderBy('createdAt', 'desc');
      queries.push(sharedQuery.get());
    }
    
    const [ownedSnap, sharedSnap] = await Promise.all(queries);
    
    const results = [];
    const seenIds = new Set();
    
    // Helper to process search results
    const processDoc = (doc, isShared) => {
      if (seenIds.has(doc.id)) return;
      
      const data = doc.data();
      
      // Search in content, url, and selector
      const contentMatch = (data.content || '').toLowerCase().includes(searchQuery);
      const urlMatch = (data.url || '').toLowerCase().includes(searchQuery);
      const selectorMatch = (data.selector || '').toLowerCase().includes(searchQuery);
      
      if (contentMatch || urlMatch || selectorMatch) {
        seenIds.add(doc.id);
        results.push({
          id: doc.id,
          url: data.url,
          selector: data.selector,
          content: data.content,
          theme: data.theme,
          isShared,
          matchedIn: [
            contentMatch && 'content',
            urlMatch && 'url',
            selectorMatch && 'selector'
          ].filter(Boolean),
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
        });
      }
    };
    
    // Process owned notes
    ownedSnap.forEach(doc => processDoc(doc, false));
    
    // Process shared notes
    if (sharedSnap) {
      sharedSnap.forEach(doc => processDoc(doc, true));
    }
    
    // Sort by createdAt desc and limit results
    results.sort((resultA, resultB) => new Date(resultB.createdAt) - new Date(resultA.createdAt));
    const limitedResults = results.slice(0, limitNum);
    
    res.json({
      query: q,
      total: results.length,
      results: limitedResults
    });
  } catch (error) {
    console.error('Error searching notes:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to search notes',
      debug: error.message
    });
  }
});

/**
 * GET /api/notes/stats
 * Get statistics about the user's notes
 */
router.get('/stats', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId, userEmail } = req.apiKey;
    const normalizedEmail = userEmail?.toLowerCase();
    
    const db = getFirestore();
    
    // Build queries for owned and shared notes
    const ownedQuery = db.collection(NOTES_COLLECTION)
      .where('ownerId', '==', userId);
    
    const queries = [ownedQuery.get()];
    
    if (normalizedEmail) {
      const sharedQuery = db.collection(NOTES_COLLECTION)
        .where('sharedWith', 'array-contains', normalizedEmail);
      queries.push(sharedQuery.get());
    }
    
    const [ownedSnap, sharedSnap] = await Promise.all(queries);
    
    // Calculate statistics
    const stats = {
      total: 0,
      owned: ownedSnap.size,
      shared: 0,
      byTheme: {
        yellow: 0,
        blue: 0,
        green: 0,
        pink: 0
      },
      domains: new Set(),
      recentlyUpdated: 0
    };
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    // Process owned notes
    ownedSnap.forEach(doc => {
      const data = doc.data();
      const theme = data.theme || 'yellow';
      if (stats.byTheme[theme] !== undefined) {
        stats.byTheme[theme]++;
      }
      
      // Extract domain from URL
      try {
        const url = new URL(data.url);
        stats.domains.add(url.hostname);
      } catch {
        // Invalid URL, skip
      }
      
      // Check if recently updated
      const updatedAt = data.updatedAt?.toDate?.() || new Date(data.updatedAt);
      if (updatedAt > oneWeekAgo) {
        stats.recentlyUpdated++;
      }
    });
    
    // Process shared notes
    if (sharedSnap) {
      const seenIds = new Set(ownedSnap.docs.map(doc => doc.id));
      
      sharedSnap.forEach(doc => {
        if (!seenIds.has(doc.id)) {
          stats.shared++;
          const data = doc.data();
          const theme = data.theme || 'yellow';
          if (stats.byTheme[theme] !== undefined) {
            stats.byTheme[theme]++;
          }
          
          try {
            const url = new URL(data.url);
            stats.domains.add(url.hostname);
          } catch {
            // Invalid URL, skip
          }
          
          const updatedAt = data.updatedAt?.toDate?.() || new Date(data.updatedAt);
          if (updatedAt > oneWeekAgo) {
            stats.recentlyUpdated++;
          }
        }
      });
    }
    
    stats.total = stats.owned + stats.shared;
    
    res.json({
      user: {
        email: req.user.email,
        uid: req.user.uid
      },
      total: stats.total,
      owned: stats.owned,
      shared: stats.shared,
      byTheme: stats.byTheme,
      domainCount: stats.domains.size,
      domains: Array.from(stats.domains).slice(0, 20), // Return up to 20 domains
      recentlyUpdated: stats.recentlyUpdated
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get note statistics',
      debug: error.message
    });
  }
});

/**
 * GET /api/notes/commented
 * Get all notes where the user has written at least one comment
 * Uses collection group query on comments subcollection
 * Query params:
 *   - limit: Max results (default 50, max 100)
 *   - offset: Pagination offset (default 0)
 */
router.get('/commented', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId, userEmail } = req.apiKey;
    const { limit = '50', offset = '0' } = req.query;
    
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const normalizedEmail = userEmail?.toLowerCase();
    
    const db = getFirestore();
    
    // Collection group query to find all comments by this user
    const commentsQuery = db.collectionGroup('comments')
      .where('authorId', '==', userId)
      .orderBy('createdAt', 'desc');
    
    const commentsSnap = await commentsQuery.get();
    
    // Extract unique note IDs from comment document paths
    const noteIds = new Set();
    commentsSnap.forEach(doc => {
      // Path is: notes/{noteId}/comments/{commentId}
      const pathParts = doc.ref.path.split('/');
      if (pathParts.length >= 2) {
        noteIds.add(pathParts[1]); // noteId is at index 1
      }
    });
    
    if (noteIds.size === 0) {
      return res.json({
        notes: [],
        totalCommentedNotes: 0,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          hasMore: false
        }
      });
    }
    
    // Fetch the actual notes (only those user has access to)
    const noteIdsArray = Array.from(noteIds);
    const notes = [];
    
    // Batch fetch notes (Firestore getAll supports up to 100 refs)
    const batchSize = 100;
    for (let i = 0; i < noteIdsArray.length; i += batchSize) {
      const batch = noteIdsArray.slice(i, i + batchSize);
      const noteRefs = batch.map(id => db.collection(NOTES_COLLECTION).doc(id));
      const noteDocs = await db.getAll(...noteRefs);
      
      for (const doc of noteDocs) {
        if (!doc.exists) continue;
        
        const data = doc.data();
        
        // Check if user has access (owner or shared with)
        const isOwner = data.ownerId === userId;
        const isSharedWithUser = normalizedEmail && (data.sharedWith || []).includes(normalizedEmail);
        
        if (isOwner || isSharedWithUser) {
          notes.push({
            id: doc.id,
            url: data.url,
            selector: data.selector,
            content: data.content,
            theme: data.theme,
            position: data.position,
            metadata: data.metadata,
            sharedWith: data.sharedWith || [],
            isShared: !isOwner,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
          });
        }
      }
    }
    
    // Sort by updatedAt desc (most recently updated first)
    notes.sort((noteA, noteB) => new Date(noteB.updatedAt) - new Date(noteA.updatedAt));
    
    // Apply pagination
    const paginatedNotes = notes.slice(offsetNum, offsetNum + limitNum);
    const hasMore = notes.length > offsetNum + limitNum;
    
    res.json({
      notes: paginatedNotes,
      totalCommentedNotes: notes.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore
      }
    });
  } catch (error) {
    console.error('Error getting commented notes:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get commented notes',
      debug: error.message
    });
  }
});

/**
 * GET /api/notes/export
 * Export all notes as JSON (owned + shared)
 * Query params:
 *   - format: Export format (json only for now)
 *   - includeComments: Whether to include comments (default false)
 */
router.get('/export', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId, userEmail } = req.apiKey;
    const { includeComments = 'false' } = req.query;
    
    const db = getFirestore();
    const normalizedEmail = userEmail?.toLowerCase();
    
    // Build queries for owned and shared notes
    const ownedQuery = db.collection(NOTES_COLLECTION)
      .where('ownerId', '==', userId)
      .orderBy('createdAt', 'desc');
    
    const queries = [ownedQuery.get()];
    
    if (normalizedEmail) {
      const sharedQuery = db.collection(NOTES_COLLECTION)
        .where('sharedWith', 'array-contains', normalizedEmail)
        .orderBy('createdAt', 'desc');
      queries.push(sharedQuery.get());
    }
    
    const [ownedSnap, sharedSnap] = await Promise.all(queries);
    
    const notes = [];
    const seenIds = new Set();
    
    // Helper to process a note document
    const processDoc = async (doc, isShared) => {
      if (seenIds.has(doc.id)) return;
      seenIds.add(doc.id);
      
      const data = doc.data();
      const note = {
        id: doc.id,
        url: data.url,
        selector: data.selector,
        content: data.content,
        theme: data.theme,
        position: data.position,
        metadata: data.metadata,
        sharedWith: data.sharedWith || [],
        isShared,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      };
      
      // Optionally include comments
      if (includeComments === 'true') {
        const commentsSnap = await db.collection(NOTES_COLLECTION)
          .doc(doc.id)
          .collection('comments')
          .orderBy('createdAt', 'asc')
          .get();
        
        note.comments = [];
        commentsSnap.forEach(commentDoc => {
          const commentData = commentDoc.data();
          note.comments.push({
            id: commentDoc.id,
            authorName: commentData.authorName,
            content: commentData.content,
            parentId: commentData.parentId,
            createdAt: commentData.createdAt?.toDate?.()?.toISOString() || commentData.createdAt
          });
        });
      }
      
      notes.push(note);
    };
    
    // Process owned notes
    for (const doc of ownedSnap.docs) {
      await processDoc(doc, false);
    }
    
    // Process shared notes
    if (sharedSnap) {
      for (const doc of sharedSnap.docs) {
        await processDoc(doc, true);
      }
    }
    
    // Sort by createdAt desc
    notes.sort((noteA, noteB) => new Date(noteB.createdAt) - new Date(noteA.createdAt));
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      noteCount: notes.length,
      notes
    };
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sticky-notes-export-${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting notes:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to export notes',
      debug: error.message
    });
  }
});

/**
 * GET /api/notes/:id
 * Get a specific note by ID (owned or shared)
 */
router.get('/:id', apiKeyAuth({ requiredScope: 'notes:read' }), async (req, res) => {
  try {
    const { userId, userEmail } = req.apiKey;
    const { id } = req.params;
    const normalizedEmail = userEmail?.toLowerCase();
    
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
    
    // Check ownership or shared access
    const isOwner = data.ownerId === userId;
    const isSharedWithUser = normalizedEmail && (data.sharedWith || []).includes(normalizedEmail);
    
    if (!isOwner && !isSharedWithUser) {
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
      isShared: !isOwner,
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
 * DELETE /api/notes/bulk
 * Delete multiple notes at once
 * Body: { ids: string[] }
 */
router.delete('/bulk', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { ids } = req.body;
    
    if (!Array.isArray(ids)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'IDs must be an array'
      });
    }
    
    if (ids.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'At least one ID is required'
      });
    }
    
    if (ids.length > 50) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot delete more than 50 notes at once'
      });
    }
    
    const db = getFirestore();
    const batch = db.batch();
    const deleted = [];
    const errors = [];
    
    // Verify ownership for all notes first
    for (const id of ids) {
      const docRef = db.collection(NOTES_COLLECTION).doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        errors.push({ id, error: 'Note not found' });
        continue;
      }
      
      const data = doc.data();
      if (data.ownerId !== userId) {
        errors.push({ id, error: 'Permission denied' });
        continue;
      }
      
      batch.delete(docRef);
      deleted.push(id);
    }
    
    if (deleted.length > 0) {
      await batch.commit();
    }
    
    res.json({
      message: `Deleted ${deleted.length} notes`,
      deleted,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk deleting notes:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete notes'
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

/**
 * POST /api/notes/:id/share
 * Share a note with another user by email
 */
router.post('/:id/share', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { id } = req.params;
    const { email } = req.body;
    
    // Validate email
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email is required'
      });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid email format'
      });
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
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
    
    // Check ownership - only owner can share
    if (data.ownerId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the owner can share this note'
      });
    }
    
    // Add email to sharedWith array if not already there
    const sharedWith = data.sharedWith || [];
    
    if (sharedWith.includes(normalizedEmail)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Note is already shared with this email'
      });
    }
    
    // Limit shares
    const MAX_SHARES = 50;
    if (sharedWith.length >= MAX_SHARES) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Cannot share with more than ${MAX_SHARES} users`
      });
    }
    
    sharedWith.push(normalizedEmail);
    
    await docRef.update({
      sharedWith,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    res.json({
      message: 'Note shared successfully',
      sharedWith
    });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to share note'
    });
  }
});

/**
 * DELETE /api/notes/:id/share/:email
 * Unshare a note (remove user from sharedWith)
 */
router.delete('/:id/share/:email', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { id, email } = req.params;
    
    const normalizedEmail = decodeURIComponent(email).trim().toLowerCase();
    
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
    
    // Check ownership - only owner can unshare
    if (data.ownerId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the owner can modify sharing'
      });
    }
    
    const sharedWith = (data.sharedWith || []).filter(email => email !== normalizedEmail);
    
    await docRef.update({
      sharedWith,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    res.json({
      message: 'User removed from shared list',
      sharedWith
    });
  } catch (error) {
    console.error('Error unsharing note:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to unshare note'
    });
  }
});

/**
 * POST /api/notes/bulk
 * Create multiple notes at once
 * Body: { notes: Array<NoteData> }
 */
router.post('/bulk', apiKeyAuth({ requiredScope: 'notes:write' }), async (req, res) => {
  try {
    const { userId } = req.apiKey;
    const { notes } = req.body;
    
    if (!Array.isArray(notes)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Notes must be an array'
      });
    }
    
    if (notes.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'At least one note is required'
      });
    }
    
    if (notes.length > 50) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot create more than 50 notes at once'
      });
    }
    
    // Validate all notes first
    const errors = [];
    for (let i = 0; i < notes.length; i++) {
      const validation = validateNoteData(notes[i], false);
      if (!validation.valid) {
        errors.push({ index: i, errors: validation.errors });
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'One or more notes have validation errors',
        details: errors
      });
    }
    
    const db = getFirestore();
    const batch = db.batch();
    const createdNotes = [];
    
    for (const noteData of notes) {
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
      
      const docRef = db.collection(NOTES_COLLECTION).doc();
      batch.set(docRef, note);
      
      createdNotes.push({
        id: docRef.id,
        url: note.url,
        selector: note.selector,
        content: note.content,
        theme: note.theme
      });
    }
    
    await batch.commit();
    
    res.status(201).json({
      message: `Successfully created ${createdNotes.length} notes`,
      notes: createdNotes
    });
  } catch (error) {
    console.error('Error bulk creating notes:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create notes'
    });
  }
});

export default router;
