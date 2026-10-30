/**
 * Firebase index module tests
 *
 * Verifies the consolidated entry point re-exports the config, auth, notes and
 * comments APIs.
 */

import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('firebase/app', () => ({
  initializeApp: jest.fn()
}));
jest.unstable_mockModule('firebase/auth', () => ({
  getAuth: jest.fn(),
  initializeAuth: jest.fn(),
  browserLocalPersistence: {},
  indexedDBLocalPersistence: {}
}));
jest.unstable_mockModule('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  initializeFirestore: jest.fn(),
  persistentLocalCache: jest.fn(),
  persistentSingleTabManager: jest.fn(),
  memoryLocalCache: jest.fn()
}));

const firebaseIndex = await import('../../src/firebase/index.js');

describe('firebase index', () => {
  it.each([
    'initializeFirebase', 'resetFirebase', 'getFirebaseConfig', 'isConfigValid', 'isFirebaseConfigured',
    'isEdgeBrowser', 'getOAuthClientId', 'isAuthConfigured', 'getOAuthToken', 'signInWithGoogle',
    'revokeOAuthToken', 'signOut', 'getCurrentUser',
    'createNote', 'getNotesForUrl', 'updateNote', 'deleteNote', 'shareNote', 'unshareNote',
    'leaveSharedNote', 'subscribeToNotesForUrl', 'getSharedNotesForUser', 'subscribeToSharedNotes',
    'validateCommentContent', 'createComment', 'getCommentsForNote', 'updateComment', 'deleteComment',
    'getCommentCount', 'subscribeToComments'
  ])('should re-export %s as a function', (name) => {
    expect(typeof firebaseIndex[name]).toBe('function');
  });

  it('should re-export the config instances and comment limits', () => {
    expect('auth' in firebaseIndex).toBe(true);
    expect('db' in firebaseIndex).toBe(true);
    expect(typeof firebaseIndex.MAX_REPLY_DEPTH).toBe('number');
    expect(typeof firebaseIndex.MAX_COMMENT_LENGTH).toBe('number');
  });
});
