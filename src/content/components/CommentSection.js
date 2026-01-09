/**
 * CommentSection Component
 * Displays a collapsible comment thread for sticky notes
 */

import { t } from '../../shared/i18n.js';
import { formatRelativeTime, escapeHtml } from '../../shared/utils.js';
import { contentLogger as log } from '../../shared/logger.js';
import { ConfirmDialog } from './ConfirmDialog.js';

export class CommentSection {
  /**
   * Create a comment section
   * @param {Object} options - Component options
   * @param {string} options.noteId - Note ID
   * @param {Object} options.user - Current user { uid, email, displayName }
   * @param {Function} options.onAddComment - Callback to add comment
   * @param {Function} options.onEditComment - Callback to edit comment
   * @param {Function} options.onDeleteComment - Callback to delete comment
   * @param {Function} options.onLoadComments - Callback to load comments
   * @param {Function} options.onPanelOpened - Called when comments panel is opened
   * @param {Function} options.onPanelClosed - Called when comments panel is closed
   */
  constructor(options) {
    this.noteId = options.noteId;
    this.user = options.user;
    this.onAddComment = options.onAddComment || (() => Promise.resolve());
    this.onEditComment = options.onEditComment || (() => Promise.resolve());
    this.onDeleteComment = options.onDeleteComment || (() => Promise.resolve());
    this.onLoadComments = options.onLoadComments || (() => Promise.resolve([]));
    this.onPanelOpened = options.onPanelOpened || (() => {});
    this.onPanelClosed = options.onPanelClosed || (() => {});
    
    this.comments = [];
    this.isExpanded = false;
    this.isLoading = false;
    this.hasLoaded = false;
    this.replyingTo = null;
    this.editingComment = null;
    
    this.element = null;
    this.render();
    this.setupEventListeners();
  }
  
  /**
   * Render the component
   */
  render() {
    this.element = document.createElement('div');
    this.element.className = 'sn-comment-section';
    
    this.element.innerHTML = `
      <button class="sn-comments-toggle">
        <svg class="sn-comments-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="sn-comments-count">${t('comments')}</span>
        <svg class="sn-comments-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div class="sn-comments-panel sn-hidden">
        <div class="sn-comments-list"></div>
        <div class="sn-comment-input-container">
          <div class="sn-comment-input-wrapper">
            <input type="text" class="sn-comment-input" placeholder="${t('addComment')}" />
            <button class="sn-comment-submit" title="${t('addComment')}" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Toggle panel
    const toggle = this.element.querySelector('.sn-comments-toggle');
    toggle.addEventListener('click', () => this.togglePanel());
    
    // Comment input
    const input = this.element.querySelector('.sn-comment-input');
    const submitBtn = this.element.querySelector('.sn-comment-submit');
    
    input.addEventListener('input', () => {
      submitBtn.disabled = !input.value.trim();
    });
    
    input.addEventListener('keydown', (event) => {
      event.stopPropagation(); // Prevent page shortcuts
      if (event.key === 'Enter' && !event.shiftKey && input.value.trim()) {
        event.preventDefault();
        this.submitComment();
      }
      if (event.key === 'Escape') {
        this.cancelReply();
      }
    });
    
    // Stop other keyboard events from propagating
    input.addEventListener('keyup', (event) => event.stopPropagation());
    input.addEventListener('keypress', (event) => event.stopPropagation());
    
    submitBtn.addEventListener('click', () => this.submitComment());
  }
  
  /**
   * Toggle comments panel visibility
   */
  async togglePanel() {
    this.isExpanded = !this.isExpanded;
    
    const panel = this.element.querySelector('.sn-comments-panel');
    const chevron = this.element.querySelector('.sn-comments-chevron');
    
    if (this.isExpanded) {
      panel.classList.remove('sn-hidden');
      chevron.style.transform = 'rotate(180deg)';
      
      // Load comments first if not already loaded
      if (!this.hasLoaded && !this.isLoading) {
        await this.loadComments();
      }
      
      // Notify that panel is opened (for real-time subscription)
      // Called after initial load to avoid duplicate updates during initial fetch
      this.onPanelOpened(this.noteId);
    } else {
      panel.classList.add('sn-hidden');
      chevron.style.transform = '';
      
      // Notify that panel is closed (to unsubscribe from real-time)
      this.onPanelClosed(this.noteId);
    }
  }
  
  /**
   * Load comments from backend
   */
  async loadComments() {
    if (!this.user) return;
    
    this.isLoading = true;
    this.showLoading();
    
    try {
      this.comments = await this.onLoadComments(this.noteId);
      this.hasLoaded = true;
      this.renderComments();
    } catch (error) {
      log.error('Failed to load comments:', error);
      this.showError(t('failedToLoadComments'));
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Show loading state
   */
  showLoading() {
    const list = this.element.querySelector('.sn-comments-list');
    list.innerHTML = `
      <div class="sn-comments-loading">
        <div class="sn-spinner"></div>
      </div>
    `;
  }
  
  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    const list = this.element.querySelector('.sn-comments-list');
    list.innerHTML = `
      <div class="sn-comments-error">${escapeHtml(message)}</div>
    `;
  }
  
  /**
   * Render the comments list
   */
  renderComments() {
    const list = this.element.querySelector('.sn-comments-list');
    
    if (this.comments.length === 0) {
      list.innerHTML = `
        <div class="sn-comments-empty">${t('noComments')}</div>
      `;
      this.updateCount(0);
      return;
    }
    
    // Organize comments into threads
    const topLevel = this.comments.filter(comment => !comment.parentId);
    const replies = this.comments.filter(comment => comment.parentId);
    const replyMap = new Map();
    
    replies.forEach(reply => {
      if (!replyMap.has(reply.parentId)) {
        replyMap.set(reply.parentId, []);
      }
      replyMap.get(reply.parentId).push(reply);
    });
    
    list.innerHTML = topLevel.map(comment => this.renderComment(comment, replyMap.get(comment.id) || [])).join('');
    
    // Setup comment action listeners
    this.setupCommentListeners();
    this.updateCount(this.comments.length);
  }
  
  /**
   * Render a single comment with its replies
   * @param {Object} comment - Comment data
   * @param {Array} replies - Reply comments
   * @returns {string} HTML string
   */
  renderComment(comment, replies = []) {
    const isAuthor = this.user && comment.authorId === this.user.uid;
    const timeAgo = this.formatTime(comment.createdAt);
    const isEdited = this.isCommentEdited(comment);
    
    const repliesHtml = replies.length > 0 ? `
      <div class="sn-comment-replies" data-parent-id="${comment.id}">
        ${replies.map(reply => this.renderReplyComment(reply)).join('')}
      </div>
    ` : '';
    
    const avatarHtml = this.renderAvatar(comment.authorPhotoURL, comment.authorName);
    
    return `
      <div class="sn-comment" data-comment-id="${comment.id}">
        <div class="sn-comment-header">
          ${avatarHtml}
          <div class="sn-comment-meta">
            <span class="sn-comment-author">${escapeHtml(comment.authorName || t('anonymous'))}</span>
            <span class="sn-comment-time">${timeAgo}${isEdited ? ' (edited)' : ''}</span>
          </div>
        </div>
        <div class="sn-comment-content">${escapeHtml(comment.content)}</div>
        <div class="sn-comment-actions">
          <button class="sn-comment-action sn-reply-btn" data-comment-id="${comment.id}" data-author-name="${escapeHtml(comment.authorName || t('anonymous'))}">
            ${t('reply')}
          </button>
          ${isAuthor ? `
            <button class="sn-comment-action sn-edit-btn" data-comment-id="${comment.id}">
              ${t('editComment')}
            </button>
            <button class="sn-comment-action sn-delete-btn" data-comment-id="${comment.id}">
              ${t('deleteComment')}
            </button>
          ` : ''}
        </div>
        ${repliesHtml}
      </div>
    `;
  }
  
  /**
   * Render a reply comment (no further nesting)
   * @param {Object} reply - Reply comment data
   * @returns {string} HTML string
   */
  renderReplyComment(reply) {
    const isAuthor = this.user && reply.authorId === this.user.uid;
    const timeAgo = this.formatTime(reply.createdAt);
    const isEdited = this.isCommentEdited(reply);
    
    const avatarHtml = this.renderAvatar(reply.authorPhotoURL, reply.authorName, true);
    
    return `
      <div class="sn-comment sn-comment-reply" data-comment-id="${reply.id}">
        <div class="sn-comment-header">
          ${avatarHtml}
          <div class="sn-comment-meta">
            <span class="sn-comment-author">${escapeHtml(reply.authorName || t('anonymous'))}</span>
            <span class="sn-comment-time">${timeAgo}${isEdited ? ' (edited)' : ''}</span>
          </div>
        </div>
        <div class="sn-comment-content">${escapeHtml(reply.content)}</div>
        ${isAuthor ? `
          <div class="sn-comment-actions">
            <button class="sn-comment-action sn-edit-btn" data-comment-id="${reply.id}">
              ${t('editComment')}
            </button>
            <button class="sn-comment-action sn-delete-btn" data-comment-id="${reply.id}">
              ${t('deleteComment')}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  /**
   * Render user avatar (image or initials fallback)
   * @param {string|null} photoURL - User's photo URL
   * @param {string} authorName - Author's display name
   * @param {boolean} isSmall - Use smaller avatar for replies
   * @returns {string} HTML string
   */
  renderAvatar(photoURL, authorName, isSmall = false) {
    const sizeClass = isSmall ? 'sn-avatar-small' : '';
    const initial = escapeHtml((authorName || '?').charAt(0).toUpperCase());
    
    if (photoURL) {
      return `
        <div class="sn-avatar ${sizeClass}">
          <img src="${escapeHtml(photoURL)}" alt="" class="sn-avatar-img" 
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="sn-avatar-fallback" style="display:none;">${initial}</span>
        </div>
      `;
    }
    
    return `
      <div class="sn-avatar ${sizeClass}">
        <span class="sn-avatar-fallback">${initial}</span>
      </div>
    `;
  }
  
  /**
   * Setup listeners for comment action buttons
   */
  setupCommentListeners() {
    // Reply buttons
    this.element.querySelectorAll('.sn-reply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = btn.dataset.commentId;
        const authorName = btn.dataset.authorName;
        this.startReply(commentId, authorName);
      });
    });
    
    // Edit buttons
    this.element.querySelectorAll('.sn-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = btn.dataset.commentId;
        this.startEdit(commentId);
      });
    });
    
    // Delete buttons
    this.element.querySelectorAll('.sn-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = btn.dataset.commentId;
        this.deleteComment(commentId);
      });
    });
  }
  
  /**
   * Start reply mode
   * @param {string} parentId - Parent comment ID
   * @param {string} authorName - Parent comment author name
   */
  startReply(parentId, authorName) {
    this.replyingTo = parentId;
    this.editingComment = null;
    
    const input = this.element.querySelector('.sn-comment-input');
    const inputWrapper = this.element.querySelector('.sn-comment-input-wrapper');
    
    // Show reply indicator
    let indicator = inputWrapper.querySelector('.sn-reply-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'sn-reply-indicator';
      inputWrapper.insertBefore(indicator, inputWrapper.firstChild);
    }
    // Build indicator content safely using DOM methods to prevent XSS
    // (authorName from dataset is decoded by browser, so we must re-escape or use textContent)
    indicator.innerHTML = '';
    const replySpan = document.createElement('span');
    replySpan.textContent = t('replyTo', [authorName]);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sn-cancel-reply';
    cancelBtn.title = t('cancel');
    cancelBtn.textContent = '\u00D7'; // multiplication sign (×)
    cancelBtn.addEventListener('click', () => this.cancelReply());
    indicator.appendChild(replySpan);
    indicator.appendChild(cancelBtn);
    
    input.placeholder = t('replyTo', [authorName]);
    input.focus();
  }
  
  /**
   * Cancel reply mode
   */
  cancelReply() {
    this.replyingTo = null;
    
    const input = this.element.querySelector('.sn-comment-input');
    const indicator = this.element.querySelector('.sn-reply-indicator');
    
    if (indicator) {
      indicator.remove();
    }
    
    input.placeholder = t('addComment');
    input.value = '';
    this.element.querySelector('.sn-comment-submit').disabled = true;
  }
  
  /**
   * Start edit mode
   * @param {string} commentId - Comment ID to edit
   */
  startEdit(commentId) {
    const comment = this.comments.find(comment => comment.id === commentId);
    if (!comment) return;
    
    this.editingComment = commentId;
    this.replyingTo = null;
    
    const input = this.element.querySelector('.sn-comment-input');
    const inputWrapper = this.element.querySelector('.sn-comment-input-wrapper');
    
    // Remove reply indicator if present
    const replyIndicator = inputWrapper.querySelector('.sn-reply-indicator');
    if (replyIndicator) replyIndicator.remove();
    
    // Show edit indicator
    let indicator = inputWrapper.querySelector('.sn-edit-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'sn-edit-indicator';
      inputWrapper.insertBefore(indicator, inputWrapper.firstChild);
    }
    indicator.innerHTML = `
      <span>${t('editComment')}</span>
      <button class="sn-cancel-edit" title="${t('cancel')}">&times;</button>
    `;
    
    indicator.querySelector('.sn-cancel-edit').addEventListener('click', () => this.cancelEdit());
    
    input.value = comment.content;
    input.focus();
    this.element.querySelector('.sn-comment-submit').disabled = false;
  }
  
  /**
   * Cancel edit mode
   */
  cancelEdit() {
    this.editingComment = null;
    
    const input = this.element.querySelector('.sn-comment-input');
    const indicator = this.element.querySelector('.sn-edit-indicator');
    
    if (indicator) {
      indicator.remove();
    }
    
    input.value = '';
    this.element.querySelector('.sn-comment-submit').disabled = true;
  }
  
  /**
   * Submit comment (new, reply, or edit)
   */
  async submitComment() {
    const input = this.element.querySelector('.sn-comment-input');
    const content = input.value.trim();
    
    if (!content || !this.user) return;
    
    const submitBtn = this.element.querySelector('.sn-comment-submit');
    submitBtn.disabled = true;
    
    try {
      if (this.editingComment) {
        // Edit existing comment
        await this.onEditComment(this.noteId, this.editingComment, { content });
        this.cancelEdit();
      } else {
        // New comment or reply
        await this.onAddComment(this.noteId, {
          content,
          parentId: this.replyingTo
        });
        this.cancelReply();
      }
      
      // Reload comments
      await this.loadComments();
    } catch (error) {
      log.error('Failed to submit comment:', error);
      // Re-enable submit button so user can retry (input still has their text)
      const input = this.element.querySelector('.sn-comment-input');
      if (input && input.value.trim()) {
        submitBtn.disabled = false;
      }
    }
    // Note: No finally block needed - on success, cancelEdit/cancelReply already disable the button
  }
  
  /**
   * Delete a comment
   * @param {string} commentId - Comment ID
   */
  async deleteComment(commentId) {
    const confirmed = await ConfirmDialog.show({
      message: t('deleteCommentConfirm'),
      shadowRoot: this.element.getRootNode()
    });
    if (!confirmed) return;
    
    try {
      await this.onDeleteComment(this.noteId, commentId);
      await this.loadComments();
    } catch (error) {
      log.error('Failed to delete comment:', error);
    }
  }
  
  /**
   * Update the comment count display
   * @param {number} count - Number of comments
   */
  updateCount(count) {
    const countEl = this.element.querySelector('.sn-comments-count');
    if (count === 0) {
      countEl.textContent = t('comments');
    } else if (count === 1) {
      countEl.textContent = t('commentCount', ['1']);
    } else {
      countEl.textContent = t('commentsCount', [count.toString()]);
    }
  }
  
  /**
   * Format timestamp to relative time
   * @param {any} timestamp - Timestamp (Date, string, or Firestore timestamp)
   * @returns {string} Relative time string
   */
  formatTime(timestamp) {
    if (!timestamp) return '';
    
    // Handle Firestore timestamp
    if (timestamp.toDate) {
      return formatRelativeTime(timestamp.toDate().toISOString());
    }
    
    // Handle string or Date
    return formatRelativeTime(timestamp);
  }
  
  /**
   * Convert timestamp to milliseconds for comparison
   * @param {any} timestamp - Timestamp (Date, string, or Firestore timestamp)
   * @returns {number|null} Milliseconds since epoch, or null if invalid
   */
  timestampToMs(timestamp) {
    if (!timestamp) return null;
    
    // Handle Firestore timestamp (has toMillis or seconds/nanoseconds)
    if (typeof timestamp.toMillis === 'function') {
      return timestamp.toMillis();
    }
    if (timestamp.seconds !== undefined) {
      return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000);
    }
    
    // Handle Date object
    if (timestamp instanceof Date) {
      return timestamp.getTime();
    }
    
    // Handle ISO string
    if (typeof timestamp === 'string') {
      const ms = new Date(timestamp).getTime();
      return isNaN(ms) ? null : ms;
    }
    
    return null;
  }
  
  /**
   * Check if a comment has been edited (updatedAt differs from createdAt)
   * @param {Object} comment - Comment with createdAt and updatedAt fields
   * @returns {boolean} True if edited
   */
  isCommentEdited(comment) {
    if (!comment.updatedAt) return false;
    
    const createdMs = this.timestampToMs(comment.createdAt);
    const updatedMs = this.timestampToMs(comment.updatedAt);
    
    if (createdMs === null || updatedMs === null) return false;
    
    // Allow 1 second tolerance for server timestamp differences
    return Math.abs(updatedMs - createdMs) > 1000;
  }
  
  /**
   * Set the current user
   * @param {Object} user - User object
   */
  setUser(user) {
    this.user = user;
    
    // Show/hide input based on auth
    const inputContainer = this.element.querySelector('.sn-comment-input-container');
    if (inputContainer) {
      inputContainer.style.display = user ? 'block' : 'none';
    }
    
    // Re-render if already loaded
    if (this.hasLoaded) {
      this.renderComments();
    }
  }
  
  /**
   * Refresh comments (public method for external calls)
   */
  async refresh() {
    if (this.isExpanded) {
      await this.loadComments();
    } else {
      this.hasLoaded = false;
    }
  }
  
  /**
   * Update comments from real-time sync
   * @param {Array} comments - New comments array
   */
  updateComments(comments) {
    this.comments = comments || [];
    this.hasLoaded = true;
    this.renderComments();
    this.updateCount(this.comments.length);
  }
  
  /**
   * Get CSS styles for the component
   * @returns {string} CSS styles
   */
  static getStyles() {
    return `
      /* Comment Section Container */
      .sn-comment-section {
        border-top: 1px solid rgba(0, 0, 0, 0.1);
      }
      
      /* Toggle Button */
      .sn-comments-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
        text-align: left;
        transition: background 0.15s ease;
      }
      
      .sn-comments-toggle:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      
      .sn-comments-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
      
      .sn-comments-count {
        flex: 1;
      }
      
      .sn-comments-chevron {
        width: 12px;
        height: 12px;
        transition: transform 0.2s ease;
        flex-shrink: 0;
      }
      
      /* Comments Panel */
      .sn-comments-panel {
        max-height: 300px;
        overflow-y: auto;
        background: rgba(0, 0, 0, 0.02);
      }
      
      .sn-comments-panel.sn-hidden {
        display: none;
      }
      
      /* Comments List */
      .sn-comments-list {
        padding: 8px 12px;
      }
      
      .sn-comments-empty,
      .sn-comments-error {
        text-align: center;
        padding: 16px 8px;
        color: #9ca3af;
        font-size: 12px;
      }
      
      .sn-comments-error {
        color: #ef4444;
      }
      
      .sn-comments-loading {
        display: flex;
        justify-content: center;
        padding: 16px;
      }
      
      .sn-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(0, 0, 0, 0.1);
        border-top-color: #6b7280;
        border-radius: 50%;
        animation: sn-spin 0.6s linear infinite;
      }
      
      @keyframes sn-spin {
        to { transform: rotate(360deg); }
      }
      
      /* Individual Comment */
      .sn-comment {
        padding: 8px 0;
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      }
      
      .sn-comment:last-child {
        border-bottom: none;
      }
      
      .sn-comment-reply {
        margin-left: 16px;
        padding-left: 12px;
        border-left: 2px solid rgba(0, 0, 0, 0.1);
      }
      
      .sn-comment-replies {
        margin-top: 8px;
      }
      
      .sn-comment-header {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 4px;
      }
      
      .sn-comment-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      
      .sn-comment-author {
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .sn-comment-time {
        font-size: 10px;
        color: #9ca3af;
      }
      
      /* Avatar styles */
      .sn-avatar {
        flex-shrink: 0;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        overflow: hidden;
        background: #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .sn-avatar-small {
        width: 22px;
        height: 22px;
      }
      
      .sn-avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .sn-avatar-fallback {
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .sn-avatar-small .sn-avatar-fallback {
        font-size: 10px;
      }
      
      .sn-comment-content {
        font-size: 13px;
        color: #4b5563;
        line-height: 1.4;
        word-wrap: break-word;
      }
      
      .sn-comment-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      
      .sn-comment-action {
        padding: 2px 0;
        border: none;
        background: none;
        color: #9ca3af;
        font-size: 11px;
        cursor: pointer;
        transition: color 0.15s ease;
      }
      
      .sn-comment-action:hover {
        color: #374151;
      }
      
      .sn-delete-btn:hover {
        color: #ef4444;
      }
      
      /* Comment Input */
      .sn-comment-input-container {
        padding: 8px 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        background: rgba(255, 255, 255, 0.5);
      }
      
      .sn-comment-input-wrapper {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .sn-comment-input-wrapper > div:last-child {
        display: flex;
        gap: 8px;
      }
      
      .sn-reply-indicator,
      .sn-edit-indicator {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px;
        background: rgba(59, 130, 246, 0.1);
        border-radius: 4px;
        font-size: 11px;
        color: #3b82f6;
        margin-bottom: 4px;
      }
      
      .sn-edit-indicator {
        background: rgba(250, 204, 21, 0.2);
        color: #a16207;
      }
      
      .sn-cancel-reply,
      .sn-cancel-edit {
        border: none;
        background: none;
        color: inherit;
        font-size: 16px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
      }
      
      .sn-comment-input {
        flex: 1;
        padding: 8px 10px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 6px;
        font-size: 13px;
        font-family: inherit;
        background: white;
        outline: none;
        transition: border-color 0.15s ease;
      }
      
      .sn-comment-input:focus {
        border-color: rgba(59, 130, 246, 0.5);
      }
      
      .sn-comment-input::placeholder {
        color: #9ca3af;
      }
      
      .sn-comment-submit {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 6px;
        background: #3b82f6;
        color: white;
        cursor: pointer;
        transition: background 0.15s ease, opacity 0.15s ease;
      }
      
      .sn-comment-submit:hover:not(:disabled) {
        background: #2563eb;
      }
      
      .sn-comment-submit:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .sn-comment-submit svg {
        width: 14px;
        height: 14px;
      }
    `;
  }
  
  /**
   * Destroy the component
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
