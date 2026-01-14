/**
 * CommentSection Component Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let CommentSection;

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '';
  
  // Reset chrome mocks
  chrome.i18n.getMessage.mockClear();
  
  // Import module fresh for each test
  const module = await import('../../src/content/components/CommentSection.js');
  CommentSection = module.CommentSection;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CommentSection', () => {
  let commentSection;
  let mockCallbacks;
  
  beforeEach(() => {
    // Setup mock callbacks
    mockCallbacks = {
      onAddComment: jest.fn().mockResolvedValue({ id: 'comment-1' }),
      onEditComment: jest.fn().mockResolvedValue(true),
      onDeleteComment: jest.fn().mockResolvedValue(true),
      onLoadComments: jest.fn().mockResolvedValue([]),
      onPanelOpened: jest.fn(),
      onPanelClosed: jest.fn()
    };
    
    commentSection = new CommentSection({
      noteId: 'note-123',
      user: { uid: 'user-1', email: 'test@example.com', displayName: 'Test User' },
      ...mockCallbacks
    });
  });
  
  afterEach(() => {
    if (commentSection) {
      commentSection.destroy();
      commentSection = null;
    }
    jest.clearAllMocks();
  });
  
  describe('initialization', () => {
    it('creates element with correct structure', () => {
      expect(commentSection.element).toBeTruthy();
      expect(commentSection.element.className).toBe('sn-comment-section');
      expect(commentSection.element.querySelector('.sn-comments-toggle')).toBeTruthy();
      expect(commentSection.element.querySelector('.sn-comments-panel')).toBeTruthy();
      expect(commentSection.element.querySelector('.sn-comment-input')).toBeTruthy();
    });
    
    it('initializes with collapsed panel', () => {
      const panel = commentSection.element.querySelector('.sn-comments-panel');
      expect(panel.classList.contains('sn-hidden')).toBe(true);
      expect(commentSection.isExpanded).toBe(false);
    });
    
    it('stores provided options', () => {
      expect(commentSection.noteId).toBe('note-123');
      expect(commentSection.user.uid).toBe('user-1');
    });
    
    it('works without user (guest mode)', () => {
      const guestSection = new CommentSection({
        noteId: 'note-456',
        user: null
      });
      
      expect(guestSection.user).toBeNull();
      guestSection.destroy();
    });
  });
  
  describe('togglePanel', () => {
    it('expands panel on first click', async () => {
      await commentSection.togglePanel();
      
      const panel = commentSection.element.querySelector('.sn-comments-panel');
      expect(panel.classList.contains('sn-hidden')).toBe(false);
      expect(commentSection.isExpanded).toBe(true);
    });
    
    it('collapses panel on second click', async () => {
      await commentSection.togglePanel();
      await commentSection.togglePanel();
      
      const panel = commentSection.element.querySelector('.sn-comments-panel');
      expect(panel.classList.contains('sn-hidden')).toBe(true);
      expect(commentSection.isExpanded).toBe(false);
    });
    
    it('calls onPanelOpened when panel is expanded', async () => {
      await commentSection.togglePanel();
      
      expect(mockCallbacks.onPanelOpened).toHaveBeenCalledWith('note-123');
      expect(mockCallbacks.onPanelClosed).not.toHaveBeenCalled();
    });
    
    it('calls onPanelOpened after loadComments completes', async () => {
      const callOrder = [];
      
      // Track call order
      mockCallbacks.onLoadComments.mockImplementation(async () => {
        callOrder.push('loadComments');
        return [];
      });
      mockCallbacks.onPanelOpened.mockImplementation(() => {
        callOrder.push('panelOpened');
      });
      
      await commentSection.togglePanel();
      
      // Verify loadComments was called before onPanelOpened
      expect(callOrder).toEqual(['loadComments', 'panelOpened']);
    });
    
    it('calls onPanelClosed when panel is collapsed', async () => {
      await commentSection.togglePanel(); // Open
      await commentSection.togglePanel(); // Close
      
      expect(mockCallbacks.onPanelClosed).toHaveBeenCalledWith('note-123');
    });
    
    it('works without panel callbacks', async () => {
      const sectionNoCallbacks = new CommentSection({
        noteId: 'note-456',
        user: { uid: 'user-1', email: 'test@example.com', displayName: 'Test User' },
        onLoadComments: jest.fn().mockResolvedValue([])
      });
      
      // Should not throw
      await sectionNoCallbacks.togglePanel();
      await sectionNoCallbacks.togglePanel();
      
      expect(sectionNoCallbacks.isExpanded).toBe(false);
      sectionNoCallbacks.destroy();
    });
    
    it('loads comments when expanded for first time', async () => {
      await commentSection.togglePanel();
      
      expect(mockCallbacks.onLoadComments).toHaveBeenCalledWith('note-123');
    });
    
    it('does not reload comments on subsequent expansions', async () => {
      await commentSection.togglePanel();
      await commentSection.togglePanel();
      await commentSection.togglePanel();
      
      expect(mockCallbacks.onLoadComments).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('renderComments', () => {
    it('shows empty state when no comments', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([]);
      await commentSection.togglePanel();
      
      const emptyState = commentSection.element.querySelector('.sn-comments-empty');
      expect(emptyState).toBeTruthy();
    });
    
    it('renders single comment', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        {
          id: 'c1',
          authorId: 'user-2',
          authorName: 'Jane Doe',
          content: 'This is a comment',
          createdAt: new Date().toISOString()
        }
      ]);
      
      await commentSection.togglePanel();
      
      const comments = commentSection.element.querySelectorAll('.sn-comment');
      expect(comments.length).toBe(1);
      
      const author = commentSection.element.querySelector('.sn-comment-author');
      expect(author.textContent).toBe('Jane Doe');
      
      const content = commentSection.element.querySelector('.sn-comment-content');
      expect(content.textContent).toBe('This is a comment');
    });
    
    it('renders multiple comments', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: 'First', createdAt: new Date().toISOString() },
        { id: 'c2', authorId: 'user-3', authorName: 'Bob', content: 'Second', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const comments = commentSection.element.querySelectorAll('.sn-comment:not(.sn-comment-reply)');
      expect(comments.length).toBe(2);
    });
    
    it('renders replies nested under parent', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: 'Parent', createdAt: new Date().toISOString() },
        { id: 'c2', authorId: 'user-3', authorName: 'Bob', content: 'Reply', parentId: 'c1', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const replies = commentSection.element.querySelectorAll('.sn-comment-reply');
      expect(replies.length).toBe(1);
      
      const repliesContainer = commentSection.element.querySelector('.sn-comment-replies');
      expect(repliesContainer).toBeTruthy();
      expect(repliesContainer.dataset.parentId).toBe('c1');
    });
    
    it('shows edit/delete buttons for own comments', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-1', authorName: 'Test User', content: 'My comment', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const editBtn = commentSection.element.querySelector('.sn-edit-btn');
      const deleteBtn = commentSection.element.querySelector('.sn-delete-btn');
      
      expect(editBtn).toBeTruthy();
      expect(deleteBtn).toBeTruthy();
    });
    
    it('hides edit/delete buttons for others comments', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Other User', content: 'Their comment', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const comment = commentSection.element.querySelector('.sn-comment');
      const editBtn = comment.querySelector('.sn-edit-btn');
      const deleteBtn = comment.querySelector('.sn-delete-btn');
      
      expect(editBtn).toBeNull();
      expect(deleteBtn).toBeNull();
    });
    
    it('shows reply button on top-level comments', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: 'Comment', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const replyBtn = commentSection.element.querySelector('.sn-reply-btn');
      expect(replyBtn).toBeTruthy();
    });
    
    it('escapes HTML in comment content', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: '<script>alert("xss")</script>', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const content = commentSection.element.querySelector('.sn-comment-content');
      expect(content.textContent).toBe('<script>alert("xss")</script>');
      expect(content.innerHTML).not.toContain('<script>');
    });
    
    it('escapes HTML in reply content', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: 'Parent comment', createdAt: new Date().toISOString(), parentId: null },
        { id: 'c2', authorId: 'user-3', authorName: 'Bob', content: '<img src=x onerror="alert(1)">', createdAt: new Date().toISOString(), parentId: 'c1' }
      ]);
      
      await commentSection.togglePanel();
      
      const replyContent = commentSection.element.querySelector('.sn-comment-reply .sn-comment-content');
      expect(replyContent.textContent).toBe('<img src=x onerror="alert(1)">');
      expect(replyContent.innerHTML).not.toContain('<img');
    });
    
    it('handles anonymous users', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: null, content: 'Anonymous comment', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const author = commentSection.element.querySelector('.sn-comment-author');
      // Will show 'anonymous' as that's the i18n key returned by mock
      expect(author.textContent).toBe('anonymous');
    });
    
    it('renders avatar with photo URL', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { 
          id: 'c1', 
          authorId: 'user-2', 
          authorName: 'Jane Doe', 
          authorPhotoURL: 'https://example.com/photo.jpg',
          content: 'Comment with avatar', 
          createdAt: new Date().toISOString() 
        }
      ]);
      
      await commentSection.togglePanel();
      
      const avatar = commentSection.element.querySelector('.sn-avatar');
      expect(avatar).toBeTruthy();
      
      const avatarImg = avatar.querySelector('.sn-avatar-img');
      expect(avatarImg).toBeTruthy();
      expect(avatarImg.getAttribute('src')).toBe('https://example.com/photo.jpg');
    });
    
    it('renders avatar fallback when no photo URL', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { 
          id: 'c1', 
          authorId: 'user-2', 
          authorName: 'Jane Doe', 
          authorPhotoURL: null,
          content: 'Comment without photo', 
          createdAt: new Date().toISOString() 
        }
      ]);
      
      await commentSection.togglePanel();
      
      const avatar = commentSection.element.querySelector('.sn-avatar');
      expect(avatar).toBeTruthy();
      
      const fallback = avatar.querySelector('.sn-avatar-fallback');
      expect(fallback).toBeTruthy();
      expect(fallback.textContent).toBe('J'); // First letter of Jane
    });
    
    it('renders smaller avatar for replies', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: 'Parent', createdAt: new Date().toISOString() },
        { id: 'c2', authorId: 'user-3', authorName: 'Bob', authorPhotoURL: null, content: 'Reply', parentId: 'c1', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      const replyAvatar = commentSection.element.querySelector('.sn-comment-reply .sn-avatar');
      expect(replyAvatar).toBeTruthy();
      expect(replyAvatar.classList.contains('sn-avatar-small')).toBe(true);
    });
    
    it('escapes HTML in photo URL', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { 
          id: 'c1', 
          authorId: 'user-2', 
          authorName: 'Jane', 
          authorPhotoURL: 'javascript:alert("xss")',
          content: 'Comment', 
          createdAt: new Date().toISOString() 
        }
      ]);
      
      await commentSection.togglePanel();
      
      const avatarImg = commentSection.element.querySelector('.sn-avatar-img');
      expect(avatarImg).toBeTruthy();
      // The src attribute should be escaped (not executable)
      expect(avatarImg.getAttribute('src')).not.toContain('<');
    });
  });
  
  describe('renderAvatar', () => {
    it('renders image avatar with photo URL', () => {
      const html = commentSection.renderAvatar('https://example.com/photo.jpg', 'John');
      
      expect(html).toContain('sn-avatar');
      expect(html).toContain('sn-avatar-img');
      expect(html).toContain('src="https://example.com/photo.jpg"');
    });
    
    it('renders fallback avatar without photo URL', () => {
      const html = commentSection.renderAvatar(null, 'John');
      
      expect(html).toContain('sn-avatar');
      expect(html).toContain('sn-avatar-fallback');
      expect(html).toContain('>J<');
    });
    
    it('renders small avatar when isSmall is true', () => {
      const html = commentSection.renderAvatar(null, 'John', true);
      
      expect(html).toContain('sn-avatar-small');
    });
    
    it('uses ? as fallback for empty name', () => {
      const html = commentSection.renderAvatar(null, '');
      
      expect(html).toContain('>?<');
    });
    
    it('uses ? as fallback for null name', () => {
      const html = commentSection.renderAvatar(null, null);
      
      expect(html).toContain('>?<');
    });
    
    it('escapes HTML special characters in initial (XSS prevention)', () => {
      // Test author name starting with < character
      const html = commentSection.renderAvatar(null, '<script>');
      
      // The initial should be escaped (&lt;) not raw (<)
      expect(html).not.toContain('><<');
      expect(html).toContain('>&lt;<');
    });
    
    it('escapes photo URL to prevent XSS', () => {
      const maliciousUrl = 'javascript:alert("xss")';
      const html = commentSection.renderAvatar(maliciousUrl, 'Test');
      
      // The URL should be in a src attribute and escaped
      expect(html).toContain('src="javascript:alert');
      // URL should be escaped so quotes are &quot;
      expect(html).toContain('&quot;');
    });
  });
  
  describe('submit comment', () => {
    it('submits new comment', async () => {
      await commentSection.togglePanel();
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      input.value = 'New comment text';
      input.dispatchEvent(new Event('input'));
      
      await commentSection.submitComment();
      
      expect(mockCallbacks.onAddComment).toHaveBeenCalledWith('note-123', {
        content: 'New comment text',
        parentId: null
      });
    });
    
    it('submits reply with parentId', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: 'Parent', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      // Start reply mode
      commentSection.startReply('c1', 'Jane');
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      input.value = 'Reply text';
      
      await commentSection.submitComment();
      
      expect(mockCallbacks.onAddComment).toHaveBeenCalledWith('note-123', {
        content: 'Reply text',
        parentId: 'c1'
      });
    });
    
    it('does not submit empty comment', async () => {
      await commentSection.togglePanel();
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      input.value = '   ';
      
      await commentSection.submitComment();
      
      expect(mockCallbacks.onAddComment).not.toHaveBeenCalled();
    });
    
    it('does not submit without user', async () => {
      const guestSection = new CommentSection({
        noteId: 'note-456',
        user: null,
        ...mockCallbacks
      });
      
      const input = guestSection.element.querySelector('.sn-comment-input');
      input.value = 'Test comment';
      
      await guestSection.submitComment();
      
      expect(mockCallbacks.onAddComment).not.toHaveBeenCalled();
      guestSection.destroy();
    });
    
    it('reloads comments after successful submit', async () => {
      await commentSection.togglePanel();
      mockCallbacks.onLoadComments.mockClear();
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      input.value = 'New comment';
      
      await commentSection.submitComment();
      
      expect(mockCallbacks.onLoadComments).toHaveBeenCalled();
    });
  });
  
  describe('edit comment', () => {
    it('enters edit mode with existing content', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-1', authorName: 'Test User', content: 'Original content', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      commentSection.startEdit('c1');
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      expect(input.value).toBe('Original content');
      expect(commentSection.editingComment).toBe('c1');
    });
    
    it('submits edit with updated content', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-1', authorName: 'Test User', content: 'Original', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      commentSection.startEdit('c1');
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      input.value = 'Updated content';
      
      await commentSection.submitComment();
      
      expect(mockCallbacks.onEditComment).toHaveBeenCalledWith('note-123', 'c1', { content: 'Updated content' });
    });
    
    it('cancels edit mode', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-1', authorName: 'Test User', content: 'Original', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      commentSection.startEdit('c1');
      commentSection.cancelEdit();
      
      expect(commentSection.editingComment).toBeNull();
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      expect(input.value).toBe('');
    });
  });
  
  describe('delete comment', () => {
    it('shows confirmation dialog when deleting', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-1', authorName: 'Test User', content: 'To delete', createdAt: new Date().toISOString() }
      ]);
      
      // Create a host element in the document so we can attach shadow root
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.appendChild(commentSection.element);
      
      await commentSection.togglePanel();
      
      // Start the delete operation (it will show the dialog)
      const deletePromise = commentSection.deleteComment('c1');
      
      // Find and click the confirm button in the dialog
      await new Promise(resolve => setTimeout(resolve, 10));
      const confirmBtn = shadowRoot.querySelector('.sn-confirm-ok');
      expect(confirmBtn).not.toBeNull();
      confirmBtn.click();
      
      await deletePromise;
      
      expect(mockCallbacks.onDeleteComment).toHaveBeenCalledWith('note-123', 'c1');
    });
    
    it('does not delete when confirmation cancelled', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-1', authorName: 'Test User', content: 'To delete', createdAt: new Date().toISOString() }
      ]);
      
      // Create a host element in the document so we can attach shadow root
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.appendChild(commentSection.element);
      
      await commentSection.togglePanel();
      
      // Start the delete operation (it will show the dialog)
      const deletePromise = commentSection.deleteComment('c1');
      
      // Find and click the cancel button in the dialog
      await new Promise(resolve => setTimeout(resolve, 10));
      const cancelBtn = shadowRoot.querySelector('.sn-confirm-cancel');
      expect(cancelBtn).not.toBeNull();
      cancelBtn.click();
      
      await deletePromise;
      
      expect(mockCallbacks.onDeleteComment).not.toHaveBeenCalled();
    });
  });
  
  describe('reply mode', () => {
    it('startReply sets up reply state', async () => {
      await commentSection.togglePanel();
      
      commentSection.startReply('c1', 'Jane Doe');
      
      expect(commentSection.replyingTo).toBe('c1');
      
      const indicator = commentSection.element.querySelector('.sn-reply-indicator');
      expect(indicator).toBeTruthy();
    });
    
    it('cancelReply clears reply state', async () => {
      await commentSection.togglePanel();
      
      commentSection.startReply('c1', 'Jane');
      commentSection.cancelReply();
      
      expect(commentSection.replyingTo).toBeNull();
      
      const indicator = commentSection.element.querySelector('.sn-reply-indicator');
      expect(indicator).toBeNull();
    });
    
    it('starting reply cancels edit mode', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-1', authorName: 'Test', content: 'Test', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      commentSection.startEdit('c1');
      commentSection.startReply('c1', 'Test');
      
      expect(commentSection.editingComment).toBeNull();
      expect(commentSection.replyingTo).toBe('c1');
    });
    
    it('uses DOM methods to prevent XSS in reply indicator', async () => {
      await commentSection.togglePanel();
      
      // Simulate a malicious author name (as it would appear after browser decodes attribute)
      const maliciousName = '<img src=x onerror="alert(1)">';
      commentSection.startReply('c1', maliciousName);
      
      const indicator = commentSection.element.querySelector('.sn-reply-indicator');
      expect(indicator).toBeTruthy();
      
      // Verify DOM structure was built safely (using createElement, not innerHTML)
      const span = indicator.querySelector('span');
      const cancelBtn = indicator.querySelector('.sn-cancel-reply');
      
      expect(span).toBeTruthy();
      expect(cancelBtn).toBeTruthy();
      expect(cancelBtn.tagName).toBe('BUTTON');
      
      // The indicator should NOT contain any unexpected elements
      // (if innerHTML was used unsafely, the img tag would be created)
      const imgElements = indicator.querySelectorAll('img');
      expect(imgElements.length).toBe(0);
    });
  });
  
  describe('setUser', () => {
    it('updates user and re-renders if loaded', async () => {
      mockCallbacks.onLoadComments.mockResolvedValue([
        { id: 'c1', authorId: 'user-2', authorName: 'Jane', content: 'Test', createdAt: new Date().toISOString() }
      ]);
      
      await commentSection.togglePanel();
      
      // Initially, user-1 cannot edit user-2's comment
      let editBtn = commentSection.element.querySelector('.sn-edit-btn');
      expect(editBtn).toBeNull();
      
      // Change to user-2
      commentSection.setUser({ uid: 'user-2', email: 'jane@example.com', displayName: 'Jane' });
      
      // Now should see edit button
      editBtn = commentSection.element.querySelector('.sn-edit-btn');
      expect(editBtn).toBeTruthy();
    });
  });
  
  describe('refresh', () => {
    it('reloads comments when expanded', async () => {
      await commentSection.togglePanel();
      mockCallbacks.onLoadComments.mockClear();
      
      await commentSection.refresh();
      
      expect(mockCallbacks.onLoadComments).toHaveBeenCalled();
    });
    
    it('marks as not loaded when collapsed', async () => {
      await commentSection.togglePanel();
      commentSection.hasLoaded = true;
      await commentSection.togglePanel(); // collapse
      
      await commentSection.refresh();
      
      expect(commentSection.hasLoaded).toBe(false);
    });
  });
  
  describe('updateComments', () => {
    it('updates comments array and re-renders', async () => {
      await commentSection.togglePanel();
      
      const newComments = [
        { id: 'c1', authorId: 'user-1', authorName: 'John', content: 'First', createdAt: new Date().toISOString() },
        { id: 'c2', authorId: 'user-2', authorName: 'Jane', content: 'Second', createdAt: new Date().toISOString() }
      ];
      
      commentSection.updateComments(newComments);
      
      expect(commentSection.comments).toEqual(newComments);
      expect(commentSection.hasLoaded).toBe(true);
      
      const comments = commentSection.element.querySelectorAll('.sn-comment');
      expect(comments.length).toBe(2);
    });
    
    it('updates comment count', async () => {
      await commentSection.togglePanel();
      
      commentSection.updateComments([
        { id: 'c1', authorId: 'user-1', authorName: 'John', content: 'Test', createdAt: new Date().toISOString() }
      ]);
      
      const countEl = commentSection.element.querySelector('.sn-comments-count');
      // Mock i18n returns the key with substitutions replaced
      expect(countEl.textContent).toBe('commentCount');
    });
    
    it('handles empty comments array', async () => {
      await commentSection.togglePanel();
      
      commentSection.updateComments([]);
      
      expect(commentSection.comments).toEqual([]);
      const emptyEl = commentSection.element.querySelector('.sn-comments-empty');
      expect(emptyEl).toBeTruthy();
    });
    
    it('handles null/undefined input', async () => {
      await commentSection.togglePanel();
      
      commentSection.updateComments(null);
      
      expect(commentSection.comments).toEqual([]);
    });
  });
  
  describe('updateCount', () => {
    it('shows i18n key for 0 comments', () => {
      commentSection.updateCount(0);
      
      const countEl = commentSection.element.querySelector('.sn-comments-count');
      expect(countEl.textContent).toBe('comments');
    });
    
    it('shows singular for 1 comment', () => {
      commentSection.updateCount(1);
      
      const countEl = commentSection.element.querySelector('.sn-comments-count');
      expect(countEl.textContent).toBe('commentCount');
    });
    
    it('shows plural for multiple comments', () => {
      commentSection.updateCount(5);
      
      const countEl = commentSection.element.querySelector('.sn-comments-count');
      expect(countEl.textContent).toBe('commentsCount');
    });
  });
  
  describe('formatTime', () => {
    it('handles ISO string timestamps', () => {
      const timestamp = new Date().toISOString();
      const result = commentSection.formatTime(timestamp);
      
      expect(typeof result).toBe('string');
    });
    
    it('handles Firestore timestamp objects', () => {
      const mockTimestamp = {
        toDate: () => new Date()
      };
      
      const result = commentSection.formatTime(mockTimestamp);
      expect(typeof result).toBe('string');
    });
    
    it('handles null timestamp', () => {
      const result = commentSection.formatTime(null);
      expect(result).toBe('');
    });
  });
  
  describe('timestampToMs', () => {
    it('handles Firestore timestamp with toMillis', () => {
      const mockTimestamp = {
        toMillis: () => 1704067200000 // 2024-01-01 00:00:00 UTC
      };
      
      const result = commentSection.timestampToMs(mockTimestamp);
      expect(result).toBe(1704067200000);
    });
    
    it('handles Firestore timestamp with seconds/nanoseconds', () => {
      const mockTimestamp = {
        seconds: 1704067200,
        nanoseconds: 500000000
      };
      
      const result = commentSection.timestampToMs(mockTimestamp);
      expect(result).toBe(1704067200500);
    });
    
    it('handles Date object', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      
      const result = commentSection.timestampToMs(date);
      expect(result).toBe(date.getTime());
    });
    
    it('handles ISO string', () => {
      const isoString = '2024-01-01T00:00:00.000Z';
      
      const result = commentSection.timestampToMs(isoString);
      expect(result).toBe(1704067200000);
    });
    
    it('returns null for null input', () => {
      expect(commentSection.timestampToMs(null)).toBeNull();
    });
    
    it('returns null for invalid string', () => {
      expect(commentSection.timestampToMs('not a date')).toBeNull();
    });
  });
  
  describe('isCommentEdited', () => {
    it('returns false when updatedAt is missing', () => {
      const comment = {
        createdAt: new Date().toISOString()
      };
      
      expect(commentSection.isCommentEdited(comment)).toBe(false);
    });
    
    it('returns false when timestamps are equal (same Firestore serverTimestamp)', () => {
      const timestamp = 1704067200000;
      const comment = {
        createdAt: { toMillis: () => timestamp },
        updatedAt: { toMillis: () => timestamp }
      };
      
      expect(commentSection.isCommentEdited(comment)).toBe(false);
    });
    
    it('returns false when timestamps differ by less than 1 second', () => {
      const comment = {
        createdAt: { toMillis: () => 1704067200000 },
        updatedAt: { toMillis: () => 1704067200500 } // 500ms later
      };
      
      expect(commentSection.isCommentEdited(comment)).toBe(false);
    });
    
    it('returns true when timestamps differ by more than 1 second', () => {
      const comment = {
        createdAt: { toMillis: () => 1704067200000 },
        updatedAt: { toMillis: () => 1704067202000 } // 2 seconds later
      };
      
      expect(commentSection.isCommentEdited(comment)).toBe(true);
    });
    
    it('handles ISO string timestamps', () => {
      const comment = {
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:05.000Z' // 5 seconds later
      };
      
      expect(commentSection.isCommentEdited(comment)).toBe(true);
    });
    
    it('handles mixed timestamp formats', () => {
      const comment = {
        createdAt: { toMillis: () => 1704067200000 },
        updatedAt: '2024-01-01T00:00:10.000Z' // 10 seconds later
      };
      
      expect(commentSection.isCommentEdited(comment)).toBe(true);
    });
  });
  
  describe('getStyles', () => {
    it('returns CSS string', () => {
      const styles = CommentSection.getStyles();
      
      expect(typeof styles).toBe('string');
      expect(styles).toContain('.sn-comment-section');
      expect(styles).toContain('.sn-comments-toggle');
      expect(styles).toContain('.sn-comment');
    });
  });
  
  describe('destroy', () => {
    it('removes element from DOM', () => {
      document.body.appendChild(commentSection.element);
      expect(document.body.contains(commentSection.element)).toBe(true);
      
      commentSection.destroy();
      
      expect(document.body.contains(commentSection.element)).toBe(false);
    });
    
    it('handles already removed element', () => {
      // Element not in DOM
      expect(() => commentSection.destroy()).not.toThrow();
    });
  });
  
  describe('keyboard interaction', () => {
    it('submit button is disabled when input is empty', () => {
      const submitBtn = commentSection.element.querySelector('.sn-comment-submit');
      expect(submitBtn.disabled).toBe(true);
    });
    
    it('submit button enables when input has content', () => {
      const input = commentSection.element.querySelector('.sn-comment-input');
      const submitBtn = commentSection.element.querySelector('.sn-comment-submit');
      
      input.value = 'Test';
      input.dispatchEvent(new Event('input'));
      
      expect(submitBtn.disabled).toBe(false);
    });
    
    it('Enter key submits comment', async () => {
      await commentSection.togglePanel();
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      input.value = 'Test comment';
      
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      input.dispatchEvent(enterEvent);
      
      // Wait for async submit
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockCallbacks.onAddComment).toHaveBeenCalled();
    });
    
    it('Escape key cancels reply mode', async () => {
      await commentSection.togglePanel();
      
      commentSection.startReply('c1', 'Jane');
      expect(commentSection.replyingTo).toBe('c1');
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      input.dispatchEvent(escEvent);
      
      expect(commentSection.replyingTo).toBeNull();
    });
  });
  
  describe('error handling', () => {
    it('shows error when load fails', async () => {
      mockCallbacks.onLoadComments.mockRejectedValue(new Error('Network error'));
      
      await commentSection.togglePanel();
      
      const errorEl = commentSection.element.querySelector('.sn-comments-error');
      expect(errorEl).toBeTruthy();
    });
    
    it('re-enables submit button when submission fails', async () => {
      mockCallbacks.onAddComment.mockRejectedValue(new Error('Network error'));
      
      await commentSection.togglePanel();
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      const submitBtn = commentSection.element.querySelector('.sn-comment-submit');
      
      // Type a comment
      input.value = 'Test comment that will fail';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(submitBtn.disabled).toBe(false);
      
      // Try to submit - should fail
      await commentSection.submitComment();
      
      // Button should be re-enabled so user can retry
      expect(submitBtn.disabled).toBe(false);
      // Input should still have the user's text
      expect(input.value).toBe('Test comment that will fail');
    });
    
    it('disables button on successful submission', async () => {
      mockCallbacks.onAddComment.mockResolvedValue({ id: 'new-comment' });
      mockCallbacks.onLoadComments.mockResolvedValue([]);
      
      await commentSection.togglePanel();
      
      const input = commentSection.element.querySelector('.sn-comment-input');
      const submitBtn = commentSection.element.querySelector('.sn-comment-submit');
      
      // Type a comment
      input.value = 'Test comment';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(submitBtn.disabled).toBe(false);
      
      // Submit successfully
      await commentSection.submitComment();
      
      // Button should be disabled after successful submission (input cleared by cancelReply)
      expect(submitBtn.disabled).toBe(true);
      expect(input.value).toBe('');
    });
  });
});
