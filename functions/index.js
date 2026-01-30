/**
 * Sticky Notes API - Firebase Cloud Functions
 * 
 * REST API for creating and managing sticky notes
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import express from 'express';
import cors from 'cors';
import { writeShareNotificationEmail } from './lib/email.js';

// Import routes
import notesRouter from './routes/notes.js';
import keysRouter from './routes/keys.js';
import commentsRouter from './routes/comments.js';

// Initialize Firebase Admin SDK (only once)
if (getApps().length === 0) {
  initializeApp();
}

// Create Express app
const app = express();

// CORS configuration - allow requests from any origin for API access
const corsOptions = {
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Request logging (in development)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/notes', notesRouter);
app.use('/notes', commentsRouter);  // Comments are nested under /notes/:noteId/comments
app.use('/keys', keysRouter);

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Sticky Notes API',
    version: '1.1.0',
    endpoints: {
      notes: {
        'GET /notes': 'List notes (requires notes:read scope)',
        'GET /notes/search?q=query': 'Search notes by content (requires notes:read scope)',
        'GET /notes/export': 'Export all notes as JSON (requires notes:read scope)',
        'GET /notes/:id': 'Get a specific note (requires notes:read scope)',
        'POST /notes': 'Create a new note (requires notes:write scope)',
        'POST /notes/bulk': 'Create multiple notes (requires notes:write scope)',
        'PUT /notes/:id': 'Update a note (requires notes:write scope)',
        'DELETE /notes/:id': 'Delete a note (requires notes:write scope)',
        'DELETE /notes/bulk': 'Delete multiple notes (requires notes:write scope)',
        'POST /notes/:id/share': 'Share a note with email (requires notes:write scope)',
        'DELETE /notes/:id/share/:email': 'Unshare a note (requires notes:write scope)'
      },
      comments: {
        'GET /notes/:noteId/comments': 'List comments on a note (requires notes:read scope)',
        'POST /notes/:noteId/comments': 'Add a comment (requires notes:write scope)',
        'PUT /notes/:noteId/comments/:commentId': 'Update a comment (requires notes:write scope)',
        'DELETE /notes/:noteId/comments/:commentId': 'Delete a comment (requires notes:write scope)'
      },
      keys: {
        'GET /keys': 'List API keys (requires Firebase auth)',
        'POST /keys': 'Generate new API key (requires Firebase auth)',
        'PATCH /keys/:id': 'Update API key (requires Firebase auth)',
        'DELETE /keys/:id': 'Revoke API key (requires Firebase auth)'
      }
    },
    authentication: {
      notes: 'API Key via Authorization header (Bearer sk_live_...)',
      keys: 'Firebase ID Token via Authorization header (Bearer <token>)'
    },
    documentation: 'https://github.com/ravidorr/sticky-notes-chrome-extension/blob/main/docs/API.md'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

// Export the Express app as a Firebase Cloud Function
export const api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
    minInstances: 0,
    maxInstances: 100
  },
  app
);

/**
 * Firestore trigger that detects when notes are shared
 * and sends email notifications to newly added recipients.
 */
export const onNoteShared = onDocumentUpdated(
  {
    document: 'notes/{noteId}',
    region: 'us-central1'
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    
    // Get the sharedWith arrays (default to empty if not present)
    const oldSharedWith = before.sharedWith || [];
    const newSharedWith = after.sharedWith || [];
    
    // Find newly added email addresses
    const newlyShared = newSharedWith.filter(email => !oldSharedWith.includes(email));
    
    // If no new shares, nothing to do
    if (newlyShared.length === 0) {
      return null;
    }
    
    const noteId = event.params.noteId;
    
    // Send notification email for each newly shared user
    const emailPromises = newlyShared.map(email => 
      writeShareNotificationEmail(email, after, noteId)
        .catch(error => {
          console.error(`Failed to send share notification to ${email}:`, error);
          // Don't throw - we don't want one failed email to block others
        })
    );
    
    await Promise.all(emailPromises);
    
    console.log(`Sent share notifications to ${newlyShared.length} user(s) for note ${noteId}`);
    return null;
  }
);
