/**
 * Sticky Notes API - Firebase Cloud Functions
 * 
 * REST API for creating and managing sticky notes
 */

import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import express from 'express';
import cors from 'cors';

// Import routes
import notesRouter from './routes/notes.js';
import keysRouter from './routes/keys.js';

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
app.use('/keys', keysRouter);

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Sticky Notes API',
    version: '1.0.0',
    endpoints: {
      notes: {
        'GET /notes': 'List notes (requires notes:read scope)',
        'GET /notes/:id': 'Get a specific note (requires notes:read scope)',
        'POST /notes': 'Create a new note (requires notes:write scope)',
        'PUT /notes/:id': 'Update a note (requires notes:write scope)',
        'DELETE /notes/:id': 'Delete a note (requires notes:write scope)'
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
app.use((err, req, res, next) => {
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
