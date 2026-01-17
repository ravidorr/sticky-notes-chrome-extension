/**
 * StickyNote Component
 * Vanilla JS class-based component for displaying sticky notes
 */

import { RichEditor } from './RichEditor.js';
import { CommentSection } from './CommentSection.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { 
  isValidEmail, 
  escapeHtml,
  THEME_COLORS, 
  TIMEOUTS, 
  VALID_THEMES,
  getPageMetadata,
  generateBugReportMarkdown,
  formatRelativeTime,
  detectEnvironment,
  ENVIRONMENTS
} from '../../shared/utils.js';
import { contentLogger as log } from '../../shared/logger.js';
import { t } from '../../shared/i18n.js';

export class StickyNote {
  // Static z-index counter for bring-to-front functionality
  // Base z-index is high to stay above page content but leaves room for incrementing
  // (2147483647 is max int32, so we use a lower value)
  static baseZIndex = 2147480000;
  static currentZIndex = 2147480000;

  /**
   * Create a new sticky note
   * @param {Object} options - Note options
   * @param {string} options.id - Note ID
   * @param {Element} options.anchor - Anchor element
   * @param {string} options.selector - CSS selector for anchor
   * @param {string} options.content - Note content
   * @param {string} options.theme - Color theme (yellow, blue, green, pink)
   * @param {Object} options.position - Position config
   * @param {Function} options.onSave - Save callback
   * @param {Function} options.onThemeChange - Theme change callback
   * @param {Function} options.onDelete - Delete callback
   * @param {Object} options.user - Current user for comments { uid, email, displayName }
   * @param {Function} options.onAddComment - Add comment callback
   * @param {Function} options.onEditComment - Edit comment callback
   * @param {Function} options.onDeleteComment - Delete comment callback
   * @param {Function} options.onLoadComments - Load comments callback
   * @param {Function} options.onCommentsOpened - Called when comments panel is opened
   * @param {Function} options.onCommentsClosed - Called when comments panel is closed
   */
  constructor(options) {
    this.id = options.id;
    this.anchor = options.anchor;
    this.selector = options.selector;
    this.content = options.content || '';
    this.theme = options.theme || 'yellow';
    this.position = options.position || { anchor: 'top-right' };
    this.onSave = options.onSave || (() => {});
    this.onThemeChange = options.onThemeChange || (() => {});
    this.onPositionChange = options.onPositionChange || (() => {});
    this.onDelete = options.onDelete || (() => {});
    
    // Comment-related callbacks
    this.user = options.user || null;
    this.onAddComment = options.onAddComment || (() => Promise.resolve());
    this.onEditComment = options.onEditComment || (() => Promise.resolve());
    this.onDeleteComment = options.onDeleteComment || (() => Promise.resolve());
    this.onLoadComments = options.onLoadComments || (() => Promise.resolve([]));
    this.onCommentsOpened = options.onCommentsOpened || (() => {});
    this.onCommentsClosed = options.onCommentsClosed || (() => {});
    
    // Capture metadata at creation time, or use provided metadata
    this.metadata = options.metadata || getPageMetadata();
    this.createdAt = options.createdAt || new Date().toISOString();
    this.ownerEmail = options.ownerEmail || null;
    this.ownerId = options.ownerId || null;

    this.element = null;
    this.textarea = null;
    this.commentSection = null;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    // Restore custom position if it was saved
    this.customPosition = this.position.custom || null;
    this.saveTimeout = null;
    this.isMetadataExpanded = false;
    // Notes start minimized by default, but new notes can be created maximized
    this.isMinimized = options.isMinimized !== undefined ? options.isMinimized : true;
    
    // Store bound event handlers to allow proper removal
    this.boundHandleDragMove = this.handleDragMove.bind(this);
    this.boundHandleDragEnd = this.handleDragEnd.bind(this);
    this.boundHandleWindowResize = this.handleWindowResize.bind(this);
    
    this.render();
    this.setupEventListeners();
    this.updatePosition();
  }
  
  /**
   * Render the note element
   */
  render() {
    this.element = document.createElement('div');
    this.element.className = `sn-note sn-theme-${this.theme} sn-hidden${this.isMinimized ? ' sn-minimized' : ''}`;
    this.element.dataset.noteId = this.id;
    // Set initial z-index (will be increased when clicked for bring-to-front)
    this.element.style.zIndex = StickyNote.baseZIndex;
    
    this.element.innerHTML = `
      <div class="sn-note-header">
        <button class="sn-note-btn sn-minimize-btn" title="${this.isMinimized ? t('expand') : t('minimize')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="${this.isMinimized ? '6 15 12 9 18 15' : '6 9 12 15 18 9'}"/>
          </svg>
        </button>
        <span class="sn-note-header-title"></span>
        <div class="sn-note-header-actions">
          <button class="sn-note-btn sn-copy-md-btn" title="${t('copyAsMarkdown')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 4l2 2M16 4l-2 2"/>
              <ellipse cx="12" cy="14" rx="6" ry="7"/>
              <path d="M12 7v14"/>
              <path d="M6 11l-3-1M18 11l3-1"/>
              <path d="M6 15l-3 1M18 15l3 1"/>
              <path d="M6 19l-2 2M18 19l2 2"/>
            </svg>
          </button>
          <button class="sn-note-btn sn-screenshot-btn" title="${t('copyScreenshot')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </button>
          <button class="sn-note-btn sn-theme-btn" title="${t('changeColor')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.14-.74-.39-1.04-.23-.28-.37-.61-.37-.96 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.5-9-10-9z"/>
              <circle cx="7.5" cy="11.5" r="1.5" fill="currentColor"/>
              <circle cx="12" cy="7.5" r="1.5" fill="currentColor"/>
              <circle cx="16.5" cy="11.5" r="1.5" fill="currentColor"/>
            </svg>
          </button>
          <button class="sn-note-btn sn-position-btn" title="${t('changePosition')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l3 3 3-3M19 9l3 3-3 3"/>
              <path d="M2 12h20M12 2v20"/>
            </svg>
          </button>
          <button class="sn-note-btn sn-share-btn" title="${t('share')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
            </svg>
          </button>
          <button class="sn-note-btn sn-delete-btn" title="${t('delete')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="sn-note-content">
        <div class="sn-note-editor-container"></div>
      </div>
      <div class="sn-note-footer">
        <button class="sn-metadata-toggle">
          <svg class="sn-metadata-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="sn-metadata-time">${formatRelativeTime(this.createdAt)}</span>
        </button>
        <div class="sn-metadata-panel sn-hidden">
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataUrl')}</span>
            <span class="sn-metadata-value sn-metadata-url" title="${escapeHtml(this.metadata.url)}">${escapeHtml(this.truncateUrl(this.metadata.url))}</span>
            <button class="sn-metadata-copy-btn" data-copy-value="${escapeHtml(this.metadata.url)}" title="${t('copyMetadata')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          <div class="sn-metadata-row sn-metadata-environment-row">
            <span class="sn-metadata-label" id="sn-env-label-${this.id}">${t('metadataEnvironment')}</span>
            <div class="sn-environment-selector">
              <button 
                class="sn-environment-badge sn-env-${this.getEnvironment()}" 
                title="${t('changeEnvironment')}"
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-labelledby="sn-env-label-${this.id}"
              >
                ${this.getEnvironmentLabel(this.getEnvironment())}
                <svg class="sn-env-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div 
                class="sn-environment-dropdown sn-hidden" 
                role="listbox" 
                aria-label="${t('metadataEnvironment')}"
                tabindex="-1"
              >
                <button class="sn-env-option sn-env-local" data-env="local" role="option" aria-selected="${this.getEnvironment() === 'local'}">
                  <svg class="sn-env-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  ${t('envLocal')}
                </button>
                <button class="sn-env-option sn-env-development" data-env="development" role="option" aria-selected="${this.getEnvironment() === 'development'}">
                  <svg class="sn-env-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  ${t('envDevelopment')}
                </button>
                <button class="sn-env-option sn-env-staging" data-env="staging" role="option" aria-selected="${this.getEnvironment() === 'staging'}">
                  <svg class="sn-env-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M9 3h6l3 7-6 11-6-11z"/><line x1="12" y1="3" x2="12" y2="8"/>
                  </svg>
                  ${t('envStaging')}
                </button>
                <button class="sn-env-option sn-env-production" data-env="production" role="option" aria-selected="${this.getEnvironment() === 'production'}">
                  <svg class="sn-env-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  ${t('envProduction')}
                </button>
              </div>
            </div>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataBrowser')}</span>
            <span class="sn-metadata-value">${escapeHtml(this.metadata.browser)}</span>
            <button class="sn-metadata-copy-btn" data-copy-value="${escapeHtml(this.metadata.browser)}" title="${t('copyMetadata')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataViewport')}</span>
            <span class="sn-metadata-value">${escapeHtml(this.metadata.viewport)}</span>
            <button class="sn-metadata-copy-btn" data-copy-value="${escapeHtml(this.metadata.viewport)}" title="${t('copyMetadata')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataElement')}</span>
            <span class="sn-metadata-value sn-metadata-selector" title="${escapeHtml(this.selector)}">${escapeHtml(this.truncateSelector(this.selector))}</span>
            <button class="sn-metadata-copy-btn" data-copy-value="${escapeHtml(this.selector)}" title="${t('copyMetadata')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataOwner')}</span>
            <span class="sn-metadata-value sn-metadata-owner" title="${escapeHtml(this.ownerEmail || '')}">${escapeHtml(this.ownerEmail || t('anonymous'))}</span>
            <button class="sn-metadata-copy-btn" data-copy-value="${escapeHtml(this.ownerEmail || '')}" title="${t('copyMetadata')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataOwnerId')}</span>
            <span class="sn-metadata-value sn-metadata-owner-id" title="${escapeHtml(this.ownerId || '')}">${escapeHtml(this.ownerId || t('notAvailable'))}</span>
            <button class="sn-metadata-copy-btn" data-copy-value="${escapeHtml(this.ownerId || '')}" title="${t('copyMetadata')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataNoteId')}</span>
            <span class="sn-metadata-value sn-metadata-note-id" title="${escapeHtml(this.id || '')}">${escapeHtml(this.id || t('notAvailable'))}</span>
            <button class="sn-metadata-copy-btn" data-copy-value="${escapeHtml(this.id || '')}" title="${t('copyMetadata')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
          ${this.renderConsoleErrors()}
        </div>
      </div>
    `;
    
    // Create rich editor
    const editorContainer = this.element.querySelector('.sn-note-editor-container');
    this.richEditor = new RichEditor({
      content: this.content,
      placeholder: t('notePlaceholder'),
      onChange: (html) => this.handleEditorChange(html)
    });
    editorContainer.appendChild(this.richEditor.element);
    
    // Keep textarea reference for backward compatibility
    this.textarea = this.richEditor.editor;
    
    // Create comment section (inserted before footer)
    this.commentSection = new CommentSection({
      noteId: this.id,
      user: this.user,
      onAddComment: this.onAddComment,
      onEditComment: this.onEditComment,
      onDeleteComment: this.onDeleteComment,
      onLoadComments: this.onLoadComments,
      onPanelOpened: this.onCommentsOpened,
      onPanelClosed: this.onCommentsClosed
    });
    
    const footer = this.element.querySelector('.sn-note-footer');
    this.element.insertBefore(this.commentSection.element, footer);
  }
  
  /**
   * Truncate URL for display
   * @param {string} url - URL to truncate
   * @returns {string} Truncated URL
   */
  truncateUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      if (path.length > 30) {
        return parsed.host + path.substring(0, 27) + '...';
      }
      return parsed.host + path;
    } catch {
      return url.length > 40 ? url.substring(0, 37) + '...' : url;
    }
  }
  
  /**
   * Truncate selector for display
   * @param {string} selector - CSS selector to truncate
   * @returns {string} Truncated selector
   */
  truncateSelector(selector) {
    if (!selector) return '';
    return selector.length > 35 ? selector.substring(0, 32) + '...' : selector;
  }
  
  /**
   * Render console errors section for metadata panel
   * @returns {string} HTML string for console errors section
   */
  renderConsoleErrors() {
    const errors = this.metadata.consoleErrors || [];
    
    if (errors.length === 0) {
      return '';
    }
    
    const errorItems = errors.map(err => {
      const typeLabel = this.getErrorTypeLabel(err.type);
      const message = escapeHtml(err.message || '').substring(0, 200);
      const timestamp = err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : '';
      
      return `
        <div class="sn-console-error-item sn-console-error-${err.type.replace('.', '-')}">
          <span class="sn-console-error-type">${typeLabel}</span>
          <span class="sn-console-error-message" title="${escapeHtml(err.message || '')}">${message}</span>
          ${timestamp ? `<span class="sn-console-error-time">${timestamp}</span>` : ''}
        </div>
      `;
    }).join('');
    
    return `
      <div class="sn-console-errors-section">
        <button class="sn-console-errors-toggle">
          <svg class="sn-console-errors-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span class="sn-console-errors-label">${t('metadataConsoleErrors')}</span>
          <span class="sn-console-errors-count">${errors.length}</span>
          <svg class="sn-console-errors-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="sn-console-errors-list sn-hidden">
          ${errorItems}
        </div>
      </div>
    `;
  }
  
  /**
   * Get translated label for error type
   * @param {string} type - Error type
   * @returns {string} Translated label
   */
  getErrorTypeLabel(type) {
    switch (type) {
      case 'console.error': return t('consoleErrorType');
      case 'console.warn': return t('consoleWarnType');
      case 'exception': return t('consoleExceptionType');
      case 'unhandledrejection': return t('consolePromiseType');
      default: return type;
    }
  }
  
  /**
   * Get the current environment for this note
   * Uses stored metadata or auto-detects from URL
   * @returns {string} Environment type
   */
  getEnvironment() {
    // Use stored environment if available
    if (this.metadata.environment) {
      return this.metadata.environment;
    }
    // Auto-detect from URL
    return detectEnvironment(this.metadata.url);
  }
  
  /**
   * Get translated label for environment
   * @param {string} env - Environment type
   * @returns {string} Translated label
   */
  getEnvironmentLabel(env) {
    const labels = {
      [ENVIRONMENTS.LOCAL]: t('envLocal'),
      [ENVIRONMENTS.DEVELOPMENT]: t('envDevelopment'),
      [ENVIRONMENTS.STAGING]: t('envStaging'),
      [ENVIRONMENTS.PRODUCTION]: t('envProduction')
    };
    return labels[env] || t('envProduction');
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Header drag (also brings note to front)
    const header = this.element.querySelector('.sn-note-header');
    header.addEventListener('mousedown', this.handleDragStart.bind(this));
    
    // Delete button
    const deleteBtn = this.element.querySelector('.sn-delete-btn');
    deleteBtn.addEventListener('click', this.handleDelete.bind(this));
    
    // Share button
    const shareBtn = this.element.querySelector('.sn-share-btn');
    shareBtn.addEventListener('click', this.handleShare.bind(this));
    
    // Theme button
    const themeBtn = this.element.querySelector('.sn-theme-btn');
    themeBtn.addEventListener('click', this.handleThemeClick.bind(this));
    
    // Position button
    const positionBtn = this.element.querySelector('.sn-position-btn');
    positionBtn.addEventListener('click', this.handlePositionClick.bind(this));
    
    // Copy as Markdown button
    const copyMdBtn = this.element.querySelector('.sn-copy-md-btn');
    copyMdBtn.addEventListener('click', this.handleCopyMarkdown.bind(this));
    
    // Screenshot button
    const screenshotBtn = this.element.querySelector('.sn-screenshot-btn');
    screenshotBtn.addEventListener('click', this.handleScreenshot.bind(this));
    
    // Metadata toggle
    const metadataToggle = this.element.querySelector('.sn-metadata-toggle');
    metadataToggle.addEventListener('click', this.toggleMetadata.bind(this));
    
    // Metadata copy buttons
    const copyButtons = this.element.querySelectorAll('.sn-metadata-copy-btn');
    copyButtons.forEach(btn => {
      btn.addEventListener('click', this.handleMetadataCopy.bind(this));
    });
    
    // Console errors toggle (if present)
    const consoleErrorsToggle = this.element.querySelector('.sn-console-errors-toggle');
    if (consoleErrorsToggle) {
      consoleErrorsToggle.addEventListener('click', this.toggleConsoleErrors.bind(this));
    }
    
    // Environment badge and dropdown
    const envBadge = this.element.querySelector('.sn-environment-badge');
    if (envBadge) {
      envBadge.addEventListener('click', this.handleEnvironmentClick.bind(this));
      envBadge.addEventListener('keydown', this.handleEnvironmentBadgeKeydown.bind(this));
    }
    
    const envOptions = this.element.querySelectorAll('.sn-env-option');
    envOptions.forEach(option => {
      option.addEventListener('click', this.handleEnvironmentSelect.bind(this));
      option.addEventListener('keydown', this.handleEnvironmentOptionKeydown.bind(this));
    });
    
    // Close environment dropdown when clicking outside
    document.addEventListener('click', this.handleDocumentClick.bind(this));
    
    // Minimize button
    const minimizeBtn = this.element.querySelector('.sn-minimize-btn');
    minimizeBtn.addEventListener('click', this.handleMinimizeClick.bind(this));
    
    // Global mouse events for dragging (use stored bound handlers for proper removal)
    document.addEventListener('mousemove', this.boundHandleDragMove);
    document.addEventListener('mouseup', this.boundHandleDragEnd);
    
    // Window resize and scroll
    window.addEventListener('resize', this.boundHandleWindowResize);
    window.addEventListener('scroll', this.boundHandleWindowResize, { passive: true });
    
    // Keyboard shortcuts
    this.element.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // Bring to front when editor receives focus
    const editorArea = this.element.querySelector('.sn-note-body');
    if (editorArea) {
      editorArea.addEventListener('focusin', () => this.bringToFront());
    }
    
    // Bring to front when clicking anywhere on the note
    this.element.addEventListener('click', (event) => {
      // Don't bring to front if clicking inside a confirm dialog
      if (event.target.closest('.sn-confirm-backdrop')) return;
      this.bringToFront();
    });
  }
  
  /**
   * Handle editor content change
   * @param {string} html - New HTML content
   */
  handleEditorChange(html) {
    this.content = html;
    
    // Debounced auto-save
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.onSave(this.content);
    }, TIMEOUTS.DEBOUNCE_SAVE);
  }
  
  /**
   * Handle theme button click
   */
  handleThemeClick(event) {
    event.stopPropagation();
    this.showThemePicker();
  }
  
  /**
   * Handle position button click
   */
  handlePositionClick(event) {
    event.stopPropagation();
    this.showPositionPicker();
  }
  
  /**
   * Handle Copy as Markdown button click
   */
  async handleCopyMarkdown(event) {
    event.stopPropagation();
    
    const markdown = generateBugReportMarkdown({
      content: this.content,
      selector: this.selector,
      metadata: this.metadata
    });
    
    try {
      await this.copyTextToClipboard(markdown);
      this.showToast(t('copiedToClipboard'));
    } catch (error) {
      log.error('Failed to copy markdown:', error);
      this.showToast(t('failedToCopy'), 'error');
    }
  }
  
  /**
   * Handle Screenshot button click
   */
  async handleScreenshot(event) {
    event.stopPropagation();
    
    try {
      // Highlight the anchor element temporarily
      if (this.anchor) {
        this.anchor.style.outline = '3px solid #3b82f6';
        this.anchor.style.outlineOffset = '2px';
      }
      
      // Hide the note temporarily to get a cleaner screenshot
      const wasVisible = this.isVisible;
      this.hide();
      
      // Small delay to ensure the UI updates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if extension context is still valid
      if (!chrome?.runtime?.sendMessage) {
        throw new Error('Extension context invalidated');
      }
      
      // Request screenshot from background script
      const response = await chrome.runtime.sendMessage({
        action: 'captureScreenshot'
      });
      
      // Restore note visibility
      if (wasVisible) {
        this.show();
      }
      
      // Remove highlight
      if (this.anchor) {
        this.anchor.style.outline = '';
        this.anchor.style.outlineOffset = '';
      }
      
      if (response.success && response.dataUrl) {
        // Convert data URL to blob and copy to clipboard
        const blob = await this.dataUrlToBlob(response.dataUrl);
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        this.showToast(t('screenshotCopied'));
      } else {
        throw new Error(response.error || 'Failed to capture screenshot');
      }
    } catch (error) {
      log.error('Failed to capture screenshot:', error);
      
      // Restore highlight removal on error
      if (this.anchor) {
        this.anchor.style.outline = '';
        this.anchor.style.outlineOffset = '';
      }
      
      this.showToast(t('failedToScreenshot'), 'error');
    }
  }
  
  /**
   * Convert data URL to Blob
   * @param {string} dataUrl - Data URL string
   * @returns {Promise<Blob>} Blob object
   */
  async dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }
  
  /**
   * Toggle metadata panel visibility
   */
  toggleMetadata(event) {
    event.stopPropagation();
    
    const panel = this.element.querySelector('.sn-metadata-panel');
    const chevron = this.element.querySelector('.sn-metadata-chevron');
    
    this.isMetadataExpanded = !this.isMetadataExpanded;
    
    if (this.isMetadataExpanded) {
      panel.classList.remove('sn-hidden');
      chevron.style.transform = 'rotate(180deg)';
    } else {
      panel.classList.add('sn-hidden');
      chevron.style.transform = '';
    }
  }
  
  /**
   * Toggle console errors list visibility
   * @param {MouseEvent} event - Click event
   */
  toggleConsoleErrors(event) {
    event.stopPropagation();
    
    const list = this.element.querySelector('.sn-console-errors-list');
    const chevron = this.element.querySelector('.sn-console-errors-chevron');
    
    if (list) {
      const isHidden = list.classList.contains('sn-hidden');
      list.classList.toggle('sn-hidden');
      if (chevron) {
        chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
      }
    }
  }
  
  /**
   * Handle metadata copy button click
   * @param {MouseEvent} event - Click event
   */
  async handleMetadataCopy(event) {
    event.stopPropagation();
    
    const button = event.currentTarget;
    const value = button.dataset.copyValue;
    
    if (!value) {
      this.showToast(t('failedToCopy'), 'error');
      return;
    }
    
    try {
      await this.copyTextToClipboard(value);
      this.showToast(t('copiedToClipboard'));
    } catch (error) {
      log.error('Failed to copy metadata:', error);
      this.showToast(t('failedToCopy'), 'error');
    }
  }
  
  /**
   * Handle environment badge click - toggle dropdown
   * @param {MouseEvent} event - Click event
   */
  handleEnvironmentClick(event) {
    event.stopPropagation();
    this.toggleEnvironmentDropdown();
  }
  
  /**
   * Handle keyboard events on environment badge
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleEnvironmentBadgeKeydown(event) {
    switch (event.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.openEnvironmentDropdown();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closeEnvironmentDropdown();
        break;
    }
  }
  
  /**
   * Handle keyboard events on environment dropdown options
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleEnvironmentOptionKeydown(event) {
    const options = Array.from(this.element.querySelectorAll('.sn-env-option'));
    const currentIndex = options.indexOf(event.currentTarget);
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        if (currentIndex < options.length - 1) {
          options[currentIndex + 1].focus();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        if (currentIndex > 0) {
          options[currentIndex - 1].focus();
        } else {
          // Go back to badge
          this.element.querySelector('.sn-environment-badge')?.focus();
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        this.handleEnvironmentSelect(event);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closeEnvironmentDropdown();
        this.element.querySelector('.sn-environment-badge')?.focus();
        break;
      case 'Tab':
        // Close dropdown when tabbing out
        this.closeEnvironmentDropdown();
        break;
    }
  }
  
  /**
   * Toggle environment dropdown open/closed
   */
  toggleEnvironmentDropdown() {
    const dropdown = this.element.querySelector('.sn-environment-dropdown');
    const isHidden = dropdown?.classList.contains('sn-hidden');
    
    if (isHidden) {
      this.openEnvironmentDropdown();
    } else {
      this.closeEnvironmentDropdown();
    }
  }
  
  /**
   * Open environment dropdown and focus first option
   */
  openEnvironmentDropdown() {
    const dropdown = this.element.querySelector('.sn-environment-dropdown');
    const badge = this.element.querySelector('.sn-environment-badge');
    
    if (dropdown && badge) {
      dropdown.classList.remove('sn-hidden');
      badge.setAttribute('aria-expanded', 'true');
      
      // Focus the currently selected option, or first option
      const currentEnv = this.getEnvironment();
      const selectedOption = dropdown.querySelector(`[data-env="${currentEnv}"]`);
      const firstOption = dropdown.querySelector('.sn-env-option');
      (selectedOption || firstOption)?.focus();
    }
  }
  
  /**
   * Handle environment option selection
   * @param {MouseEvent|KeyboardEvent} event - Click or keyboard event
   */
  handleEnvironmentSelect(event) {
    event.stopPropagation();
    
    const option = event.currentTarget;
    const newEnv = option.dataset.env;
    const badge = this.element.querySelector('.sn-environment-badge');
    
    if (!newEnv || newEnv === this.metadata.environment) {
      // Close dropdown if same selection
      this.closeEnvironmentDropdown();
      badge?.focus();
      return;
    }
    
    // Update metadata
    this.metadata.environment = newEnv;
    
    // Update badge display
    if (badge) {
      // Remove all env classes and add the new one
      badge.className = `sn-environment-badge sn-env-${newEnv}`;
      // Recreate content with chevron
      badge.innerHTML = `${this.getEnvironmentLabel(newEnv)}
        <svg class="sn-env-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>`;
      // Restore ARIA attributes
      badge.setAttribute('aria-haspopup', 'listbox');
      badge.setAttribute('aria-expanded', 'false');
    }
    
    // Update aria-selected on all options
    const options = this.element.querySelectorAll('.sn-env-option');
    options.forEach(opt => {
      opt.setAttribute('aria-selected', opt.dataset.env === newEnv);
    });
    
    // Close dropdown and return focus to badge
    this.closeEnvironmentDropdown();
    badge?.focus();
    
    // Trigger save
    this.triggerSave();
    
    log.debug('Environment changed to:', newEnv);
  }
  
  /**
   * Handle document click to close environment dropdown
   * @param {MouseEvent} event - Click event
   */
  handleDocumentClick(event) {
    // Guard against element being destroyed
    if (!this.element) return;
    
    // Check if click is outside the environment selector
    const envSelector = this.element.querySelector('.sn-environment-selector');
    if (envSelector && !envSelector.contains(event.target)) {
      this.closeEnvironmentDropdown();
    }
  }
  
  /**
   * Close environment dropdown and update ARIA
   */
  closeEnvironmentDropdown() {
    const dropdown = this.element.querySelector('.sn-environment-dropdown');
    const badge = this.element.querySelector('.sn-environment-badge');
    
    if (dropdown) {
      dropdown.classList.add('sn-hidden');
    }
    if (badge) {
      badge.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Copy text to clipboard with a fallback for iframes where the Clipboard API is blocked
   * by Permissions Policy (common in embedded/cross-origin frames).
   * @param {string} text
   */
  async copyTextToClipboard(text) {
    const isTopFrame = window.self === window.top;

    // If Permissions Policy blocks clipboard-write, skip Clipboard API entirely.
    // This avoids Chrome emitting a "[Violation] Permissions policy violation" console message.
    let policyAllowsClipboardWrite = null;
    try {
      if (document?.permissionsPolicy?.allowsFeature) {
        policyAllowsClipboardWrite = document.permissionsPolicy.allowsFeature('clipboard-write');
      } else if (document?.featurePolicy?.allowsFeature) {
        // Deprecated alias, but present in some environments
        policyAllowsClipboardWrite = document.featurePolicy.allowsFeature('clipboard-write');
      }
    } catch {
      policyAllowsClipboardWrite = null;
    }

    // First try modern Clipboard API (may still fail even if policy allows)
    // In embedded/cross-origin iframes, Clipboard API is frequently blocked by policy and logs a console violation.
    // Prefer the legacy fallback in iframes to keep console clean.
    if (isTopFrame && policyAllowsClipboardWrite !== false && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to legacy copy
      }
    }

    // Legacy fallback - execCommand('copy') - often still works even when Clipboard API is blocked
    // as long as it is invoked from a user gesture.
    if (typeof document?.execCommand !== 'function') {
      throw new Error('Clipboard API unavailable and execCommand not supported');
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    try {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const ok = document.execCommand('copy');
      if (!ok) throw new Error('execCommand copy returned false');
    } finally {
      textarea.remove();
    }
  }
  
  /**
   * Handle minimize button click
   * @param {MouseEvent} event - Click event
   */
  handleMinimizeClick(event) {
    event.stopPropagation();
    this.toggleMinimize();
  }
  
  /**
   * Toggle minimized state
   */
  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.updateMinimizeUI();
  }
  
  /**
   * Maximize the note (expand if minimized)
   */
  maximize() {
    if (this.isMinimized) {
      this.isMinimized = false;
      this.updateMinimizeUI();
    }
  }
  
  /**
   * Minimize the note (collapse if expanded)
   */
  minimize() {
    if (!this.isMinimized) {
      this.isMinimized = true;
      this.updateMinimizeUI();
    }
  }
  
  /**
   * Update the minimize button UI based on current state
   */
  updateMinimizeUI() {
    const minimizeBtn = this.element.querySelector('.sn-minimize-btn');
    
    if (this.isMinimized) {
      this.element.classList.add('sn-minimized');
      // Update button to show expand icon (up arrow)
      minimizeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 15 12 9 18 15"/>
        </svg>
      `;
      minimizeBtn.title = t('expand');
    } else {
      this.element.classList.remove('sn-minimized');
      // Update button to show minimize icon (down arrow)
      minimizeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      `;
      minimizeBtn.title = t('minimize');
    }
  }
  
  /**
   * Handle keyboard shortcuts
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    // Escape to unfocus
    if (event.key === 'Escape') {
      this.element.blur();
      document.activeElement?.blur();
    }
  }
  
  /**
   * Show theme picker popup
   */
  showThemePicker() {
    const themes = VALID_THEMES;
    const themeColors = THEME_COLORS;
    
    // Create picker
    const picker = document.createElement('div');
    picker.className = 'sn-theme-picker';
    picker.style.cssText = `
      position: absolute;
      top: 40px;
      right: 8px;
      background: white;
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      gap: 6px;
      z-index: 10;
    `;
    
    themes.forEach(theme => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid ${this.theme === theme ? '#1f2937' : 'transparent'};
        background: ${themeColors[theme]};
        cursor: pointer;
        transition: transform 0.15s ease;
      `;
      btn.title = theme.charAt(0).toUpperCase() + theme.slice(1);
      
      btn.addEventListener('click', () => {
        this.setTheme(theme);
        this.onThemeChange(theme); // Save theme change
        picker.remove();
      });
      
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'scale(1.1)';
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'scale(1)';
      });
      
      picker.appendChild(btn);
    });
    
    this.element.appendChild(picker);
    
    // Close on click outside
    const closeHandler = (clickEvent) => {
      if (!picker.contains(clickEvent.target)) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }
  
  /**
   * Get SVG icon for position
   * Shows a small filled square (element) with a larger empty square (note) 
   * positioned intuitively relative to the element
   * @param {string} position - Position value (top-left, top-right, etc.)
   * @returns {string} SVG markup
   */
  getPositionIcon(position) {
    // Small filled square = element, larger empty square = note
    // Position names are intuitive: "top-right" means note is above and to the right of element
    const icons = {
      'top-left': `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-width="1.5">
          <rect x="1" y="1" width="10" height="10" rx="1" stroke="#9ca3af" fill="none"/>
          <rect x="13" y="13" width="6" height="6" rx="1" fill="#374151" stroke="none"/>
        </svg>`,
      'top-right': `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-width="1.5">
          <rect x="13" y="1" width="10" height="10" rx="1" stroke="#9ca3af" fill="none"/>
          <rect x="5" y="13" width="6" height="6" rx="1" fill="#374151" stroke="none"/>
        </svg>`,
      'bottom-left': `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-width="1.5">
          <rect x="1" y="13" width="10" height="10" rx="1" stroke="#9ca3af" fill="none"/>
          <rect x="13" y="5" width="6" height="6" rx="1" fill="#374151" stroke="none"/>
        </svg>`,
      'bottom-right': `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke-width="1.5">
          <rect x="13" y="13" width="10" height="10" rx="1" stroke="#9ca3af" fill="none"/>
          <rect x="5" y="5" width="6" height="6" rx="1" fill="#374151" stroke="none"/>
        </svg>`
    };
    return icons[position] || icons['top-right'];
  }
  
  /**
   * Show position picker popup
   */
  showPositionPicker() {
    const positions = [
      { value: 'top-left', label: t('positionTopLeft') },
      { value: 'top-right', label: t('positionTopRight') },
      { value: 'bottom-left', label: t('positionBottomLeft') },
      { value: 'bottom-right', label: t('positionBottomRight') }
    ];
    
    const picker = document.createElement('div');
    picker.className = 'sn-position-picker';
    picker.style.cssText = `
      position: absolute;
      top: 40px;
      right: 36px;
      background: white;
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10;
    `;
    
    positions.forEach(pos => {
      const btn = document.createElement('button');
      const isSelected = this.position.anchor === pos.value;
      btn.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: ${isSelected ? '#f3f4f6' : 'transparent'};
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        color: #374151;
        text-align: left;
      `;
      btn.innerHTML = `${this.getPositionIcon(pos.value)}<span>${pos.label}</span>`;
      
      btn.addEventListener('click', () => {
        this.position = { anchor: pos.value };
        this.customPosition = null; // Reset custom position
        this.updatePosition();
        this.onPositionChange(this.position);
        picker.remove();
      });
      
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f3f4f6';
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.style.background = this.position.anchor === pos.value ? '#f3f4f6' : 'transparent';
      });
      
      picker.appendChild(btn);
    });
    
    this.element.appendChild(picker);
    
    // Close on click outside
    const closeHandler = (clickEvent) => {
      if (!picker.contains(clickEvent.target)) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }
  
  /**
   * Update note position relative to anchor element
   * Note: The note element is inside a position:fixed container,
   * so all coordinates are viewport-relative (no scroll adjustment needed)
   */
  updatePosition() {
    if (!this.anchor || !this.element) return;

    // Use untransformed layout dimensions where possible.
    // getBoundingClientRect() includes CSS transforms (e.g. sn-hidden scale), which can cause
    // small "jumps" as the note transitions between hidden/visible states.
    const measuredWidth = this.element.offsetWidth || this.element.getBoundingClientRect().width;
    const measuredHeight = this.element.offsetHeight || this.element.getBoundingClientRect().height;
    if (!measuredWidth || !measuredHeight) return;

    // (debug instrumentation removed)
    
    // Handle custom drag position (stored relative to anchor)
    if (this.customPosition) {
      let x, y;
      
      if (this.customPosition.offsetX !== undefined) {
        // Position relative to anchor element (viewport coordinates)
        const anchorRect = this.anchor.getBoundingClientRect();
        x = anchorRect.left + this.customPosition.offsetX;
        y = anchorRect.top + this.customPosition.offsetY;
      } else {
        // Legacy: absolute document position - convert to viewport coordinates
        x = this.customPosition.x - window.scrollX;
        y = this.customPosition.y - window.scrollY;
      }
      
      // Clamp to viewport to ensure note is fully visible
      const clamped = this.clampToViewport(x, y, measuredWidth, measuredHeight);
      this.element.style.left = `${clamped.x}px`;
      this.element.style.top = `${clamped.y}px`;
      return;
    }
    
    const anchorRect = this.anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    
    // For wide elements (more than 70% of viewport), use a smarter positioning
    const isWideElement = anchorRect.width > viewportWidth * 0.7;
    
    let x, y;
    
    // Calculate position based on anchor position setting (all in viewport coordinates)
    // Position names are intuitive: "top-right" means note is ABOVE and to the RIGHT of element
    switch (this.position.anchor) {
      case 'top-left':
        // Note above and to the left of element
        x = anchorRect.left - measuredWidth - 10;
        y = anchorRect.top - measuredHeight - 10;
        break;
      case 'top-right':
        // Note above and to the right of element
        if (isWideElement) {
          x = Math.min(anchorRect.right, viewportWidth - measuredWidth - 20);
        } else {
          x = anchorRect.right + 10;
        }
        y = anchorRect.top - measuredHeight - 10;
        break;
      case 'bottom-left':
        // Note below and to the left of element
        x = anchorRect.left - measuredWidth - 10;
        y = anchorRect.bottom + 10;
        break;
      case 'bottom-right':
      default:
        // Note below and to the right of element (default)
        if (isWideElement) {
          // For wide elements, position at a reasonable location within viewport
          x = Math.min(anchorRect.right, viewportWidth * 0.7);
        } else {
          x = anchorRect.right + 10;
        }
        y = anchorRect.bottom + 10;
        break;
    }
    
    // Clamp to viewport to ensure note is fully visible
    const clamped = this.clampToViewport(x, y, measuredWidth, measuredHeight);
    this.element.style.left = `${clamped.x}px`;
    this.element.style.top = `${clamped.y}px`;
  }
  
  /**
   * Clamp position to keep note fully within viewport
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} noteWidth - Note width
   * @param {number} noteHeight - Note height
   * @returns {Object} Clamped { x, y }
   */
  clampToViewport(x, y, noteWidth, noteHeight) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10; // Small padding from edges
    
    // Clamp horizontal
    if (x < padding) {
      x = padding;
    } else if (x + noteWidth > viewportWidth - padding) {
      x = viewportWidth - noteWidth - padding;
    }
    
    // Clamp vertical
    if (y < padding) {
      y = padding;
    } else if (y + noteHeight > viewportHeight - padding) {
      y = viewportHeight - noteHeight - padding;
    }
    
    return { x, y };
  }
  
  /**
   * Bring this note to the front (above other notes)
   */
  bringToFront() {
    if (!this.element) return;
    StickyNote.currentZIndex++;
    this.element.style.zIndex = StickyNote.currentZIndex;
  }

  /**
   * Handle drag start
   * @param {MouseEvent} event - Mouse event
   */
  handleDragStart(event) {
    // Don't start drag if clicking buttons
    if (event.target.closest('.sn-note-btn')) return;
    
    // Bring note to front when starting to drag
    this.bringToFront();
    
    this.isDragging = true;
    this.dragOffset = {
      x: event.clientX - this.element.getBoundingClientRect().left,
      y: event.clientY - this.element.getBoundingClientRect().top
    };
    
    this.element.style.cursor = 'grabbing';
    event.preventDefault();
  }
  
  /**
   * Handle drag move
   * @param {MouseEvent} event - Mouse event
   * Note: Position is stored relative to anchor element to survive page scrolls
   * The note container is position:fixed, so all coordinates are viewport-relative
   */
  handleDragMove(event) {
    if (!this.isDragging) return;
    
    // Calculate viewport position (container is position:fixed)
    const posX = event.clientX - this.dragOffset.x;
    const posY = event.clientY - this.dragOffset.y;
    
    // Clamp to viewport to prevent dragging note off-screen
    const noteRect = this.element.getBoundingClientRect();
    const clamped = this.clampToViewport(posX, posY, noteRect.width, noteRect.height);
    
    // Apply clamped position for smooth dragging (viewport coordinates)
    this.element.style.left = `${clamped.x}px`;
    this.element.style.top = `${clamped.y}px`;
    
    // Store position relative to anchor for persistence
    if (this.anchor) {
      const anchorRect = this.anchor.getBoundingClientRect();
      this.customPosition = {
        offsetX: clamped.x - anchorRect.left,
        offsetY: clamped.y - anchorRect.top
      };
    } else {
      // Fallback: store absolute document position (for legacy compatibility)
      this.customPosition = { x: clamped.x + window.scrollX, y: clamped.y + window.scrollY };
    }
  }
  
  /**
   * Handle drag end
   */
  handleDragEnd() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.element.style.cursor = '';
    
    // Save custom position if dragged
    if (this.customPosition) {
      this.position = { custom: this.customPosition };
      this.onPositionChange(this.position);
    }
  }
  
  
  /**
   * Handle delete button click
   */
  async handleDelete() {
    const confirmed = await ConfirmDialog.show({
      message: t('deleteConfirm'),
      shadowRoot: this.element.getRootNode(),
      zIndex: StickyNote.currentZIndex + 1000
    });
    if (confirmed) {
      this.onDelete();
    }
  }
  
  /**
   * Handle share button click
   */
  handleShare() {
    this.showShareModal();
  }
  
  /**
   * Show share modal
   */
  showShareModal() {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'sn-modal-overlay';
    
    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'sn-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    
    // Build modal with CSS classes
    const title = document.createElement('h3');
    title.className = 'sn-modal-title';
    title.textContent = t('shareNote');
    
    const description = document.createElement('p');
    description.className = 'sn-modal-message';
    description.textContent = t('shareDescription');
    
    const emailInput = document.createElement('input');
    emailInput.className = 'sn-modal-input';
    emailInput.type = 'email';
    emailInput.placeholder = t('emailPlaceholder');
    
    const actions = document.createElement('div');
    actions.className = 'sn-modal-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sn-btn sn-btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = t('cancel');
    
    const shareBtn = document.createElement('button');
    shareBtn.className = 'sn-btn sn-btn-primary';
    shareBtn.type = 'button';
    shareBtn.textContent = t('shareButton');
    
    actions.appendChild(cancelBtn);
    actions.appendChild(shareBtn);
    
    modal.appendChild(title);
    modal.appendChild(description);
    modal.appendChild(emailInput);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    
    // Get parent container (shadow root)
    const container = this.element.parentNode;
    container.appendChild(overlay);
    
    // Focus email input
    emailInput.focus();
    
    // Cleanup function
    const cleanup = () => {
      overlay.classList.add('sn-closing');
      setTimeout(() => {
        if (overlay.parentNode === container) {
          container.removeChild(overlay);
        }
      }, 150);
    };
    
    // Handle cancel
    cancelBtn.addEventListener('click', cleanup);
    
    // Share handler function
    const handleShare = async () => {
      const email = emailInput.value.trim();
      if (!email) {
        this.showToast(t('invalidEmail'), 'error');
        emailInput.focus();
        return;
      }
      
      // Validate email format
      if (!isValidEmail(email)) {
        this.showToast(t('invalidEmail'), 'error');
        emailInput.focus();
        return;
      }
      
      try {
        // Check if extension context is still valid
        if (!chrome?.runtime?.sendMessage) {
          throw new Error('Extension context invalidated');
        }
        
        log.debug('Sharing note:', this.id, 'with:', email);
        const response = await chrome.runtime.sendMessage({
          action: 'shareNote',
          noteId: this.id,
          email: email
        });
        
        log.debug('Share response:', response);
        
        if (response && response.success) {
          cleanup();
          this.showToast(t('noteShared'));
        } else {
          const errorMsg = response?.error || t('failedToShare');
          log.error('Share failed:', errorMsg);
          this.showToast(errorMsg, 'error');
        }
      } catch (error) {
        log.error('Failed to share note:', error);
        this.showToast(t('failedToShare'), 'error');
      }
    };
    
    // Handle share button click
    shareBtn.addEventListener('click', handleShare);
    
    // Handle Enter key in email input
    emailInput.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Enter') {
        keyEvent.preventDefault();
        handleShare();
      }
    });
    
    // Handle Escape key anywhere in modal (accessibility)
    overlay.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        cleanup();
      }
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (clickEvent) => {
      if (clickEvent.target === overlay) {
        cleanup();
      }
    });
  }
  
  /**
   * Show toast notification
   * @param {string} message - Toast message
   * @param {string} type - Toast type ('success' or 'error')
   */
  showToast(message, type = 'success') {
    const container = this.element.parentNode;
    if (!container) return;
    
    // Remove existing toast
    const existing = container.querySelector('.sn-toast');
    if (existing) {
      existing.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `sn-toast sn-toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('sn-toast-hiding');
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, 300);
    }, TIMEOUTS.TOAST_DISPLAY);
  }
  
  /**
   * Handle window resize or scroll
   * Custom positions stored relative to anchor need recalculation
   */
  handleWindowResize() {
    // Always update position - anchor-based and anchor-relative custom positions both need recalculation
    // Only skip for legacy absolute custom positions
    if (this.customPosition && this.customPosition.x !== undefined) {
      return; // Legacy absolute position - don't update
    }
    this.updatePosition();
  }
  
  /**
   * Show the note
   */
  show() {
    this.isVisible = true;
    this.element.classList.remove('sn-hidden');
    this.element.classList.add('sn-visible');
    this.updatePosition();
  }
  
  /**
   * Hide the note
   */
  hide() {
    this.isVisible = false;
    this.element.classList.remove('sn-visible');
    this.element.classList.add('sn-hidden');
  }
  
  /**
   * Highlight the note (visual feedback)
   */
  highlight() {
    this.element.style.transform = 'scale(1.05)';
    this.element.style.boxShadow = '0 0 0 3px #3b82f6, 0 4px 12px rgba(0,0,0,0.15)';
    
    setTimeout(() => {
      this.element.style.transform = '';
      this.element.style.boxShadow = '';
    }, 1000);
  }
  
  /**
   * Update anchor element
   * @param {Element} newAnchor - New anchor element
   */
  updateAnchor(newAnchor) {
    this.anchor = newAnchor;
    this.customPosition = null;
    // Reset position to default anchor and persist the change
    // This ensures the cleared customPosition is saved to storage
    this.position = { anchor: 'top-right' };
    this.onPositionChange(this.position);
    this.updatePosition();
  }
  
  /**
   * Set note theme
   * @param {string} theme - Theme name
   */
  setTheme(theme) {
    this.element.classList.remove(`sn-theme-${this.theme}`);
    this.theme = theme;
    this.element.classList.add(`sn-theme-${this.theme}`);
  }
  
  /**
   * Set the current user for comments
   * @param {Object} user - User object { uid, email, displayName }
   */
  setUser(user) {
    this.user = user;
    if (this.commentSection) {
      this.commentSection.setUser(user);
    }
  }
  
  /**
   * Refresh comments in the comment section
   */
  async refreshComments() {
    if (this.commentSection) {
      await this.commentSection.refresh();
    }
  }
  
  // isValidEmail and escapeHtml are now imported from shared/utils.js
  
  /**
   * Destroy the note and cleanup
   */
  destroy() {
    // Clear save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // Remove event listeners (use stored bound handlers)
    document.removeEventListener('mousemove', this.boundHandleDragMove);
    document.removeEventListener('mouseup', this.boundHandleDragEnd);
    window.removeEventListener('resize', this.boundHandleWindowResize);
    window.removeEventListener('scroll', this.boundHandleWindowResize);
    
    // Destroy comment section
    if (this.commentSection) {
      this.commentSection.destroy();
      this.commentSection = null;
    }
    
    // Remove element
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
