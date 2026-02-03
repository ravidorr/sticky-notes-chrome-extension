/**
 * Firebase Comments Unit Tests
 * 
 * Tests Firestore CRUD operations for comments with mocked dependencies.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock Firebase modules before import
jest.unstable_mockModule('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
  writeBatch: jest.fn(),
  onSnapshot: jest.fn(),
  getFirestore: jest.fn(() => ({ name: 'mock-db' })),
  initializeFirestore: jest.fn(() => ({ name: 'mock-db' })),
  persistentLocalCache: jest.fn(),
  persistentSingleTabManager: jest.fn(),
  memoryLocalCache: jest.fn()
}));

jest.unstable_mockModule('firebase/app', () => ({
  initializeApp: jest.fn()
}));

jest.unstable_mockModule('firebase/auth', () => ({
  getAuth: jest.fn(),
  initializeAuth: jest.fn(() => ({ name: 'mock-auth' })),
  browserLocalPersistence: { type: 'LOCAL' },
  indexedDBLocalPersistence: { type: 'LOCAL' }
}));

// Import after mocking
const {
  createComment,
  getCommentsForNote,
  updateComment,
  deleteComment,
  getCommentCount,
  validateCommentContent,
  subscribeToComments,
  MAX_REPLY_DEPTH,
  MAX_COMMENT_LENGTH
} = await import('../../src/firebase/comments.js');

describe('Firebase Comments', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Firestore deps
    localThis.mockDb = { name: 'mock-db' };
    localThis.mockDocRef = { id: 'doc-123' };
    localThis.mockCollectionRef = { id: 'collection' };
    
    localThis.mockUser = {
      uid: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User'
    };
    
    localThis.mockNoteData = {
      ownerId: 'user-123',
      sharedWith: []
    };
    
    localThis.mockBatch = {
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue()
    };
    
    localThis.deps = {
      db: localThis.mockDb,
      isFirebaseConfigured: jest.fn(() => true),
      collection: jest.fn(() => localThis.mockCollectionRef),
      doc: jest.fn(() => localThis.mockDocRef),
      addDoc: jest.fn(),
      getDoc: jest.fn(),
      getDocs: jest.fn(),
      updateDoc: jest.fn(),
      deleteDoc: jest.fn(),
      query: jest.fn((col) => col),
      where: jest.fn(() => ({})),
      orderBy: jest.fn(() => ({})),
      serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
      writeBatch: jest.fn(() => localThis.mockBatch),
      onSnapshot: jest.fn()
    };
  });

  describe('validateCommentContent', () => {
    it('should return valid for proper content', () => {
      const result = validateCommentContent('This is a valid comment');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for empty content', () => {
      const result = validateCommentContent('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Comment content is required');
    });

    it('should return invalid for whitespace-only content', () => {
      const result = validateCommentContent('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Comment cannot be empty');
    });

    it('should return invalid for null content', () => {
      const result = validateCommentContent(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Comment content is required');
    });

    it('should return invalid for content exceeding max length', () => {
      const longContent = 'a'.repeat(MAX_COMMENT_LENGTH + 1);
      const result = validateCommentContent(longContent);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed');
    });

    it('should return valid for content at max length', () => {
      const maxContent = 'a'.repeat(MAX_COMMENT_LENGTH);
      const result = validateCommentContent(maxContent);
      expect(result.valid).toBe(true);
    });
  });

  describe('createComment', () => {
    beforeEach(() => {
      // Default: note exists and user has access
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => localThis.mockNoteData
      });
      localThis.deps.addDoc.mockResolvedValue({ id: 'comment-123' });
    });

    it('should create a top-level comment successfully', async () => {
      const commentData = { content: 'Test comment' };
      
      const result = await createComment('note-123', commentData, localThis.mockUser, localThis.deps);
      
      expect(result.id).toBe('comment-123');
      expect(result.content).toBe('Test comment');
      expect(result.authorId).toBe('user-123');
      expect(result.authorEmail).toBe('user@example.com');
      expect(result.authorName).toBe('Test User');
      expect(result.parentId).toBeNull();
    });

    it('should create a reply comment successfully', async () => {
      // Mock parent comment exists and has no parent (top-level)
      localThis.deps.getDoc
        .mockResolvedValueOnce({ exists: () => true, data: () => localThis.mockNoteData })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ parentId: null }) });
      
      const commentData = { content: 'Reply comment', parentId: 'parent-comment-123' };
      
      const result = await createComment('note-123', commentData, localThis.mockUser, localThis.deps);
      
      expect(result.parentId).toBe('parent-comment-123');
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(createComment('note-123', { content: 'Test' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error when db is null', async () => {
      localThis.deps.db = null;
      
      await expect(createComment('note-123', { content: 'Test' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(createComment('', { content: 'Test' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Invalid note ID');
      
      await expect(createComment(null, { content: 'Test' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });

    it('should throw error when user is not authenticated', async () => {
      await expect(createComment('note-123', { content: 'Test' }, null, localThis.deps))
        .rejects.toThrow('User authentication required');
      
      await expect(createComment('note-123', { content: 'Test' }, { email: 'test@test.com' }, localThis.deps))
        .rejects.toThrow('User authentication required');
    });

    it('should throw error for empty comment content', async () => {
      await expect(createComment('note-123', { content: '' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Comment content is required');
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({ exists: () => false });
      
      await expect(createComment('note-123', { content: 'Test' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when user does not have access to note', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: [] })
      });
      
      await expect(createComment('note-123', { content: 'Test' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Permission denied');
    });

    it('should allow comment when user is in sharedWith list', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: ['user@example.com'] })
      });
      
      const result = await createComment('note-123', { content: 'Test' }, localThis.mockUser, localThis.deps);
      
      expect(result.id).toBe('comment-123');
    });

    it('should throw error when parent comment not found', async () => {
      localThis.deps.getDoc
        .mockResolvedValueOnce({ exists: () => true, data: () => localThis.mockNoteData })
        .mockResolvedValueOnce({ exists: () => false });
      
      await expect(createComment('note-123', { content: 'Reply', parentId: 'nonexistent' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Parent comment not found');
    });

    it('should throw error when max reply depth reached', async () => {
      // Parent already has a parentId, meaning it's already a reply
      localThis.deps.getDoc
        .mockResolvedValueOnce({ exists: () => true, data: () => localThis.mockNoteData })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ parentId: 'some-parent' }) });
      
      await expect(createComment('note-123', { content: 'Nested reply', parentId: 'reply-123' }, localThis.mockUser, localThis.deps))
        .rejects.toThrow('Maximum reply depth reached');
    });

    it('should store raw content without escaping (escape at render time)', async () => {
      const commentData = { content: '<script>alert("xss")</script>' };
      
      const result = await createComment('note-123', commentData, localThis.mockUser, localThis.deps);
      
      // Content should be stored raw - escaping happens at render time in CommentSection
      expect(result.content).toBe('<script>alert("xss")</script>');
    });

    it('should use email as displayName fallback', async () => {
      const userWithoutName = { uid: 'user-123', email: 'user@example.com' };
      
      const result = await createComment('note-123', { content: 'Test' }, userWithoutName, localThis.deps);
      
      expect(result.authorName).toBe('user@example.com');
    });

    it('should use Anonymous as final fallback for displayName', async () => {
      const minimalUser = { uid: 'user-123' };
      
      const result = await createComment('note-123', { content: 'Test' }, minimalUser, localThis.deps);
      
      expect(result.authorName).toBe('Anonymous');
    });

    it('should include authorPhotoURL when user has photo', async () => {
      const userWithPhoto = { 
        uid: 'user-123', 
        email: 'user@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg'
      };
      
      const result = await createComment('note-123', { content: 'Test' }, userWithPhoto, localThis.deps);
      
      expect(result.authorPhotoURL).toBe('https://example.com/photo.jpg');
    });

    it('should set authorPhotoURL to null when user has no photo', async () => {
      const userWithoutPhoto = { 
        uid: 'user-123', 
        email: 'user@example.com',
        displayName: 'Test User'
      };
      
      const result = await createComment('note-123', { content: 'Test' }, userWithoutPhoto, localThis.deps);
      
      expect(result.authorPhotoURL).toBeNull();
    });
  });

  describe('getCommentsForNote', () => {
    beforeEach(() => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => localThis.mockNoteData
      });
    });

    it('should get all comments for a note', async () => {
      const mockComments = [
        { id: 'comment-1', data: () => ({ content: 'Comment 1', authorId: 'user-1' }) },
        { id: 'comment-2', data: () => ({ content: 'Comment 2', authorId: 'user-2' }) }
      ];
      
      localThis.deps.getDocs.mockResolvedValue({
        forEach: (cb) => mockComments.forEach(cb),
        size: 2
      });
      
      const comments = await getCommentsForNote('note-123', localThis.mockUser, localThis.deps);
      
      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBe('comment-1');
      expect(comments[1].id).toBe('comment-2');
    });

    it('should return empty array when no comments exist', async () => {
      localThis.deps.getDocs.mockResolvedValue({
        forEach: jest.fn(),
        size: 0
      });
      
      const comments = await getCommentsForNote('note-123', localThis.mockUser, localThis.deps);
      
      expect(comments).toHaveLength(0);
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(getCommentsForNote('note-123', localThis.mockUser, localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(getCommentsForNote('', localThis.mockUser, localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });

    it('should throw error when user not authenticated', async () => {
      await expect(getCommentsForNote('note-123', null, localThis.deps))
        .rejects.toThrow('User authentication required');
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({ exists: () => false });
      
      await expect(getCommentsForNote('note-123', localThis.mockUser, localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when user does not have access', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: [] })
      });
      
      await expect(getCommentsForNote('note-123', localThis.mockUser, localThis.deps))
        .rejects.toThrow('Permission denied');
    });
  });

  describe('updateComment', () => {
    beforeEach(() => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ authorId: 'user-123', content: 'Original' })
      });
      localThis.deps.updateDoc.mockResolvedValue();
    });

    it('should update comment content successfully', async () => {
      await updateComment('note-123', 'comment-123', { content: 'Updated content' }, 'user-123', localThis.deps);
      
      expect(localThis.deps.updateDoc).toHaveBeenCalled();
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      expect(updateCall.content).toBe('Updated content');
      expect(updateCall.updatedAt).toBeDefined();
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(updateComment('note-123', 'comment-123', { content: 'Updated' }, 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(updateComment('', 'comment-123', { content: 'Updated' }, 'user-123', localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });

    it('should throw error for invalid comment ID', async () => {
      await expect(updateComment('note-123', '', { content: 'Updated' }, 'user-123', localThis.deps))
        .rejects.toThrow('Invalid comment ID');
    });

    it('should throw error for empty content', async () => {
      await expect(updateComment('note-123', 'comment-123', { content: '' }, 'user-123', localThis.deps))
        .rejects.toThrow('Comment content is required');
    });

    it('should throw error when comment not found', async () => {
      localThis.deps.getDoc.mockResolvedValue({ exists: () => false });
      
      await expect(updateComment('note-123', 'comment-123', { content: 'Updated' }, 'user-123', localThis.deps))
        .rejects.toThrow('Comment not found');
    });

    it('should throw error when not the author', async () => {
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ authorId: 'other-user', content: 'Original' })
      });
      
      await expect(updateComment('note-123', 'comment-123', { content: 'Updated' }, 'user-123', localThis.deps))
        .rejects.toThrow('Only the author can edit this comment');
    });

    it('should not call updateDoc when no content provided', async () => {
      await updateComment('note-123', 'comment-123', {}, 'user-123', localThis.deps);
      
      expect(localThis.deps.updateDoc).not.toHaveBeenCalled();
    });

    it('should store raw content without escaping (escape at render time)', async () => {
      await updateComment('note-123', 'comment-123', { content: '<script>xss</script>' }, 'user-123', localThis.deps);
      
      const updateCall = localThis.deps.updateDoc.mock.calls[0][1];
      // Content should be stored raw - escaping happens at render time in CommentSection
      expect(updateCall.content).toBe('<script>xss</script>');
    });
  });

  describe('deleteComment', () => {
    beforeEach(() => {
      // Default: note and comment exist, user is author
      localThis.deps.getDoc
        .mockResolvedValueOnce({ exists: () => true, data: () => localThis.mockNoteData })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ authorId: 'user-123', parentId: 'parent-123' }) });
      localThis.deps.deleteDoc.mockResolvedValue();
    });

    it('should delete a reply comment successfully', async () => {
      await deleteComment('note-123', 'comment-123', 'user-123', localThis.deps);
      
      expect(localThis.deps.deleteDoc).toHaveBeenCalled();
    });

    it('should delete top-level comment and all replies', async () => {
      // Top-level comment (parentId is null)
      localThis.deps.getDoc
        .mockReset()
        .mockResolvedValueOnce({ exists: () => true, data: () => localThis.mockNoteData })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ authorId: 'user-123', parentId: null }) });
      
      const mockReplies = [
        { id: 'reply-1', ref: { path: 'reply-1' } },
        { id: 'reply-2', ref: { path: 'reply-2' } }
      ];
      
      localThis.deps.getDocs.mockResolvedValue({
        forEach: (cb) => mockReplies.forEach(cb),
        size: 2
      });
      
      await deleteComment('note-123', 'comment-123', 'user-123', localThis.deps);
      
      expect(localThis.mockBatch.delete).toHaveBeenCalledTimes(3); // 2 replies + 1 parent
      expect(localThis.mockBatch.commit).toHaveBeenCalled();
    });

    it('should delete top-level comment without replies using deleteDoc', async () => {
      localThis.deps.getDoc
        .mockReset()
        .mockResolvedValueOnce({ exists: () => true, data: () => localThis.mockNoteData })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ authorId: 'user-123', parentId: null }) });
      
      localThis.deps.getDocs.mockResolvedValue({
        forEach: jest.fn(),
        size: 0
      });
      
      await deleteComment('note-123', 'comment-123', 'user-123', localThis.deps);
      
      expect(localThis.deps.deleteDoc).toHaveBeenCalled();
      expect(localThis.mockBatch.commit).not.toHaveBeenCalled();
    });

    it('should allow note owner to delete any comment', async () => {
      localThis.deps.getDoc
        .mockReset()
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ ownerId: 'user-123', sharedWith: [] }) })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ authorId: 'other-user', parentId: 'parent' }) });
      
      await deleteComment('note-123', 'comment-123', 'user-123', localThis.deps);
      
      expect(localThis.deps.deleteDoc).toHaveBeenCalled();
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(deleteComment('note-123', 'comment-123', 'user-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(deleteComment('', 'comment-123', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });

    it('should throw error for invalid comment ID', async () => {
      await expect(deleteComment('note-123', '', 'user-123', localThis.deps))
        .rejects.toThrow('Invalid comment ID');
    });

    it('should throw error when note not found', async () => {
      localThis.deps.getDoc.mockReset().mockResolvedValue({ exists: () => false });
      
      await expect(deleteComment('note-123', 'comment-123', 'user-123', localThis.deps))
        .rejects.toThrow('Note not found');
    });

    it('should throw error when comment not found', async () => {
      localThis.deps.getDoc
        .mockReset()
        .mockResolvedValueOnce({ exists: () => true, data: () => localThis.mockNoteData })
        .mockResolvedValueOnce({ exists: () => false });
      
      await expect(deleteComment('note-123', 'comment-123', 'user-123', localThis.deps))
        .rejects.toThrow('Comment not found');
    });

    it('should throw error when user is not author or note owner', async () => {
      localThis.deps.getDoc
        .mockReset()
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ ownerId: 'owner-user', sharedWith: [] }) })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({ authorId: 'author-user', parentId: null }) });
      
      await expect(deleteComment('note-123', 'comment-123', 'user-123', localThis.deps))
        .rejects.toThrow('Permission denied');
    });
  });

  describe('getCommentCount', () => {
    it('should return correct comment count', async () => {
      localThis.deps.getDocs.mockResolvedValue({ size: 5 });
      
      const count = await getCommentCount('note-123', localThis.deps);
      
      expect(count).toBe(5);
    });

    it('should return 0 for notes with no comments', async () => {
      localThis.deps.getDocs.mockResolvedValue({ size: 0 });
      
      const count = await getCommentCount('note-123', localThis.deps);
      
      expect(count).toBe(0);
    });

    it('should throw error when Firebase is not configured', async () => {
      localThis.deps.isFirebaseConfigured = jest.fn(() => false);
      
      await expect(getCommentCount('note-123', localThis.deps))
        .rejects.toThrow('Firebase is not configured');
    });

    it('should throw error for invalid note ID', async () => {
      await expect(getCommentCount('', localThis.deps))
        .rejects.toThrow('Invalid note ID');
    });
  });

  describe('subscribeToComments', () => {
    it('should call onError when Firebase is not configured', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      const unsubscribe = subscribeToComments(
        'note-123',
        localThis.mockUser,
        onUpdate,
        onError,
        { ...localThis.deps, db: null, isFirebaseConfigured: () => false }
      );
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Firebase is not configured');
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call onError for invalid note ID', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      subscribeToComments('', localThis.mockUser, onUpdate, onError, localThis.deps);
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Invalid note ID');
    });

    it('should call onError when user not authenticated', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      subscribeToComments('note-123', null, onUpdate, onError, localThis.deps);
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('User authentication required');
    });

    it('should call onError when note not found', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      localThis.deps.getDoc.mockResolvedValue({ exists: () => false });
      
      subscribeToComments('note-123', localThis.mockUser, onUpdate, onError, localThis.deps);
      
      // Wait for async permission check
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Note not found');
    });

    it('should call onError when user does not have access', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerId: 'other-user', sharedWith: [] })
      });
      
      subscribeToComments('note-123', localThis.mockUser, onUpdate, onError, localThis.deps);
      
      // Wait for async permission check
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Permission denied');
    });

    it('should set up onSnapshot listener after permission check passes', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const mockUnsubscribe = jest.fn();
      
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => localThis.mockNoteData
      });
      localThis.deps.onSnapshot.mockReturnValue(mockUnsubscribe);
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });
      
      subscribeToComments('note-123', localThis.mockUser, onUpdate, onError, localThis.deps);
      
      // Wait for async permission check
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(localThis.deps.onSnapshot).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      // Mock getDoc to prevent async operations
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => localThis.mockNoteData
      });
      
      const unsubscribe = subscribeToComments(
        'note-123',
        localThis.mockUser,
        onUpdate,
        onError,
        localThis.deps
      );
      
      expect(typeof unsubscribe).toBe('function');
    });

    it('should debounce rapid snapshot updates', async () => {
      jest.useFakeTimers();
      const onUpdate = jest.fn();
      const onError = jest.fn();
      let snapshotCallback;
      
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => localThis.mockNoteData
      });
      localThis.deps.onSnapshot.mockImplementation((query, successCb) => {
        snapshotCallback = successCb;
        return jest.fn();
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });
      
      subscribeToComments('note-123', localThis.mockUser, onUpdate, onError, localThis.deps);
      
      // Wait for async permission check
      await Promise.resolve();
      await Promise.resolve();
      
      // Simulate rapid snapshot updates
      const mockSnapshot = {
        forEach: (cb) => {
          cb({ id: 'comment-1', data: () => ({ content: 'Test' }) });
        }
      };
      
      // Fire multiple updates rapidly
      snapshotCallback(mockSnapshot);
      snapshotCallback(mockSnapshot);
      snapshotCallback(mockSnapshot);
      
      // Should not have called onUpdate yet due to debounce
      expect(onUpdate).not.toHaveBeenCalled();
      
      // Advance timers past debounce
      jest.advanceTimersByTime(150);
      
      // Now should have been called once
      expect(onUpdate).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });

    it('should clear debounce timer on unsubscribe', async () => {
      jest.useFakeTimers();
      const onUpdate = jest.fn();
      const onError = jest.fn();
      let snapshotCallback;
      const mockUnsubscribe = jest.fn();
      
      localThis.deps.getDoc.mockResolvedValue({
        exists: () => true,
        data: () => localThis.mockNoteData
      });
      localThis.deps.onSnapshot.mockImplementation((query, successCb) => {
        snapshotCallback = successCb;
        return mockUnsubscribe;
      });
      localThis.deps.query.mockReturnValue({ _query: 'mock' });
      localThis.deps.collection.mockReturnValue({ _collection: 'mock' });
      
      const unsubscribe = subscribeToComments('note-123', localThis.mockUser, onUpdate, onError, localThis.deps);
      
      // Wait for async permission check
      await Promise.resolve();
      await Promise.resolve();
      
      // Fire an update
      const mockSnapshot = {
        forEach: (cb) => {
          cb({ id: 'comment-1', data: () => ({ content: 'Test' }) });
        }
      };
      snapshotCallback(mockSnapshot);
      
      // Unsubscribe before debounce completes
      unsubscribe();
      
      // Advance timers
      jest.advanceTimersByTime(150);
      
      // Should not have called onUpdate because we unsubscribed
      expect(onUpdate).not.toHaveBeenCalled();
      
      jest.useRealTimers();
    });
    
    it('should not set up listener if unsubscribed before getDoc resolves (race condition)', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      
      // Create a promise that we can resolve manually to control timing
      let resolveGetDoc;
      const getDocPromise = new Promise(resolve => {
        resolveGetDoc = resolve;
      });
      
      localThis.deps.getDoc.mockReturnValue(getDocPromise);
      
      const unsubscribe = subscribeToComments(
        'note-123',
        localThis.mockUser,
        onUpdate,
        onError,
        localThis.deps
      );
      
      // Unsubscribe BEFORE getDoc resolves
      unsubscribe();
      
      // Now resolve getDoc
      resolveGetDoc({ exists: () => true, data: () => localThis.mockNoteData });
      
      // Wait for any pending promises
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // onSnapshot should NOT have been called because we unsubscribed first
      expect(localThis.deps.onSnapshot).not.toHaveBeenCalled();
    });
    
    it('should not call onError if unsubscribed before getDoc rejects', async () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();

      // Create a promise that we can reject manually
      let rejectGetDoc;
      const getDocPromise = new Promise((resolve, reject) => {
        rejectGetDoc = reject;
      });

      localThis.deps.getDoc.mockReturnValue(getDocPromise);

      const unsubscribe = subscribeToComments(
        'note-123',
        localThis.mockUser,
        onUpdate,
        onError,
        localThis.deps
      );

      // Wait for getFirestoreDeps microtask to complete so getDoc is actually awaited
      await new Promise(resolve => setTimeout(resolve, 0));

      // Unsubscribe WHILE getDoc is pending (but after it's been called)
      unsubscribe();

      // Now reject getDoc
      rejectGetDoc(new Error('Network error'));

      // Wait for any pending promises
      await new Promise(resolve => setTimeout(resolve, 0));

      // onError should NOT have been called because we unsubscribed first
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Constants', () => {
    it('should export MAX_REPLY_DEPTH', () => {
      expect(MAX_REPLY_DEPTH).toBe(1);
    });

    it('should export MAX_COMMENT_LENGTH', () => {
      expect(MAX_COMMENT_LENGTH).toBe(2000);
    });
  });
});
