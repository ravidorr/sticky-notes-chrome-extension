/**
 * API Keys Routes
 * REST API endpoints for API key management
 */

import { Router } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { firebaseAuth } from '../middleware/auth.js';
import { 
  generateApiKey, 
  createApiKeyDocument, 
  validateScopes,
  VALID_SCOPES 
} from '../lib/apiKeys.js';

const router = Router();
const API_KEYS_COLLECTION = 'apiKeys';

/**
 * GET /api/keys
 * List all API keys for the authenticated user
 * Returns key metadata (not the actual keys)
 */
router.get('/', firebaseAuth(), async (req, res) => {
  try {
    const { uid } = req.user;
    
    const db = getFirestore();
    const snapshot = await db.collection(API_KEYS_COLLECTION)
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    const keys = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      keys.push({
        id: doc.id,
        name: data.name,
        keyPrefix: data.keyPrefix,
        scopes: data.scopes,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        lastUsedAt: data.lastUsedAt?.toDate?.()?.toISOString() || data.lastUsedAt
      });
    });
    
    res.json({ keys });
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list API keys'
    });
  }
});

/**
 * POST /api/keys
 * Generate a new API key
 * Body: { name: string, scopes: string[] }
 */
router.post('/', firebaseAuth(), async (req, res) => {
  try {
    const { uid } = req.user;
    const { name, scopes } = req.body;
    
    // Validate scopes
    const scopesArray = scopes || ['notes:read', 'notes:write'];
    const scopeValidation = validateScopes(scopesArray);
    if (!scopeValidation.valid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid scopes',
        details: scopeValidation.errors,
        validScopes: VALID_SCOPES
      });
    }
    
    // Validate name
    const keyName = (name || 'API Key').trim().substring(0, 100);
    if (!keyName) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Key name cannot be empty'
      });
    }
    
    // Check existing key count (limit to 10 per user)
    const db = getFirestore();
    const existingKeys = await db.collection(API_KEYS_COLLECTION)
      .where('userId', '==', uid)
      .where('isActive', '==', true)
      .count()
      .get();
    
    if (existingKeys.data().count >= 10) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Maximum of 10 active API keys per user. Revoke an existing key first.'
      });
    }
    
    // Generate new API key
    const { key, hash, prefix } = generateApiKey();
    
    // Create document
    const keyDoc = createApiKeyDocument({
      userId: uid,
      name: keyName,
      scopes: scopesArray,
      hash,
      prefix
    });
    
    const docRef = await db.collection(API_KEYS_COLLECTION).add(keyDoc);
    
    // Return the key - this is the ONLY time the full key is shown
    res.status(201).json({
      id: docRef.id,
      key: key,  // Full key - only shown once!
      name: keyDoc.name,
      keyPrefix: prefix,
      scopes: keyDoc.scopes,
      isActive: true,
      createdAt: new Date().toISOString(),
      warning: 'Store this key securely. It will not be shown again.'
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create API key'
    });
  }
});

/**
 * DELETE /api/keys/:keyId
 * Revoke (deactivate) an API key
 */
router.delete('/:keyId', firebaseAuth(), async (req, res) => {
  try {
    const { uid } = req.user;
    const { keyId } = req.params;
    
    const db = getFirestore();
    const docRef = db.collection(API_KEYS_COLLECTION).doc(keyId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'API key not found'
      });
    }
    
    const data = doc.data();
    
    // Check ownership
    if (data.userId !== uid) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to revoke this key'
      });
    }
    
    // Soft delete - mark as inactive
    await docRef.update({
      isActive: false,
      revokedAt: FieldValue.serverTimestamp()
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to revoke API key'
    });
  }
});

/**
 * PATCH /api/keys/:keyId
 * Update an API key (name or scopes)
 */
router.patch('/:keyId', firebaseAuth(), async (req, res) => {
  try {
    const { uid } = req.user;
    const { keyId } = req.params;
    const { name, scopes } = req.body;
    
    const db = getFirestore();
    const docRef = db.collection(API_KEYS_COLLECTION).doc(keyId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'API key not found'
      });
    }
    
    const data = doc.data();
    
    // Check ownership
    if (data.userId !== uid) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this key'
      });
    }
    
    // Check if key is active
    if (!data.isActive) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot update a revoked key'
      });
    }
    
    const updates = {};
    
    // Update name if provided
    if (name !== undefined) {
      const keyName = name.trim().substring(0, 100);
      if (!keyName) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Key name cannot be empty'
        });
      }
      updates.name = keyName;
    }
    
    // Update scopes if provided
    if (scopes !== undefined) {
      const scopeValidation = validateScopes(scopes);
      if (!scopeValidation.valid) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid scopes',
          details: scopeValidation.errors,
          validScopes: VALID_SCOPES
        });
      }
      updates.scopes = scopes;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid fields to update'
      });
    }
    
    await docRef.update(updates);
    
    // Fetch updated document
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data();
    
    res.json({
      id: updatedDoc.id,
      name: updatedData.name,
      keyPrefix: updatedData.keyPrefix,
      scopes: updatedData.scopes,
      isActive: updatedData.isActive,
      createdAt: updatedData.createdAt?.toDate?.()?.toISOString() || updatedData.createdAt,
      lastUsedAt: updatedData.lastUsedAt?.toDate?.()?.toISOString() || updatedData.lastUsedAt
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update API key'
    });
  }
});

export default router;
