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
  formatRelativeTime
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
    
    this.element = null;
    this.textarea = null;
    this.commentSection = null;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.customPosition = null;
    this.saveTimeout = null;
    this.isMetadataExpanded = false;
    
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
    this.element.className = `sn-note sn-theme-${this.theme} sn-hidden`;
    this.element.dataset.noteId = this.id;
    // Set initial z-index (will be increased when clicked for bring-to-front)
    this.element.style.zIndex = StickyNote.baseZIndex;
    
    this.element.innerHTML = `
      <div class="sn-note-header">
        <span class="sn-note-header-title"></span>
        <div class="sn-note-header-actions">
          <button class="sn-note-btn sn-copy-md-btn" title="${t('copyAsMarkdown')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 3v4a1 1 0 001 1h4"/>
              <path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/>
              <path d="M9 15l2 2 4-4"/>
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
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataBrowser')}</span>
            <span class="sn-metadata-value">${escapeHtml(this.metadata.browser)}</span>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataViewport')}</span>
            <span class="sn-metadata-value">${escapeHtml(this.metadata.viewport)}</span>
          </div>
          <div class="sn-metadata-row">
            <span class="sn-metadata-label">${t('metadataElement')}</span>
            <span class="sn-metadata-value sn-metadata-selector" title="${escapeHtml(this.selector)}">${escapeHtml(this.truncateSelector(this.selector))}</span>
          </div>
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
    
    // Global mouse events for dragging (use stored bound handlers for proper removal)
    document.addEventListener('mousemove', this.boundHandleDragMove);
    document.addEventListener('mouseup', this.boundHandleDragEnd);
    
    // Window resize
    window.addEventListener('resize', this.boundHandleWindowResize);
    
    // Keyboard shortcuts
    this.element.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // Bring to front when editor receives focus
    const editorArea = this.element.querySelector('.sn-note-body');
    if (editorArea) {
      editorArea.addEventListener('focusin', () => this.bringToFront());
    }
    
    // Bring to front when clicking anywhere on the note
    this.element.addEventListener('click', (e) => {
      // Don't bring to front if clicking inside a confirm dialog
      if (e.target.closest('.sn-confirm-backdrop')) return;
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
      await navigator.clipboard.writeText(markdown);
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
        this.onSave(this.content); // Save theme change
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
        this.position.anchor = pos.value;
        this.customPosition = null; // Reset custom position
        this.updatePosition();
        this.onSave(this.content); // Save position change
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
   */
  updatePosition() {
    if (!this.anchor || !this.element) return;
    
    if (this.customPosition) {
      this.element.style.left = `${this.customPosition.x}px`;
      this.element.style.top = `${this.customPosition.y}px`;
      return;
    }
    
    const anchorRect = this.anchor.getBoundingClientRect();
    const noteRect = this.element.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    
    let x, y;
    
    // Calculate position based on anchor position setting
    // Position names are intuitive: "top-right" means note is ABOVE and to the RIGHT of element
    switch (this.position.anchor) {
      case 'top-left':
        // Note above and to the left of element
        x = anchorRect.left + scrollX - noteRect.width - 10;
        y = anchorRect.top + scrollY - noteRect.height - 10;
        break;
      case 'top-right':
        // Note above and to the right of element
        x = anchorRect.right + scrollX + 10;
        y = anchorRect.top + scrollY - noteRect.height - 10;
        break;
      case 'bottom-left':
        // Note below and to the left of element
        x = anchorRect.left + scrollX - noteRect.width - 10;
        y = anchorRect.bottom + scrollY + 10;
        break;
      case 'bottom-right':
      default:
        // Note below and to the right of element (default)
        x = anchorRect.right + scrollX + 10;
        y = anchorRect.bottom + scrollY + 10;
        break;
    }
    
    // Collision detection - keep note in viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Adjust horizontal position
    if (x + noteRect.width > scrollX + viewportWidth) {
      x = anchorRect.left + scrollX - noteRect.width - 10;
    }
    if (x < scrollX) {
      x = scrollX + 10;
    }
    
    // Adjust vertical position
    if (y + noteRect.height > scrollY + viewportHeight) {
      y = scrollY + viewportHeight - noteRect.height - 10;
    }
    if (y < scrollY) {
      y = scrollY + 10;
    }
    
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
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
   */
  handleDragMove(event) {
    if (!this.isDragging) return;
    
    const posX = event.clientX - this.dragOffset.x + window.scrollX;
    const posY = event.clientY - this.dragOffset.y + window.scrollY;
    
    this.customPosition = { x: posX, y: posY };
    this.element.style.left = `${posX}px`;
    this.element.style.top = `${posY}px`;
  }
  
  /**
   * Handle drag end
   */
  handleDragEnd() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.element.style.cursor = '';
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
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'sn-modal';
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      width: 320px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    modal.innerHTML = `
      <h3 style="margin: 0 0 16px; font-size: 18px; color: #1f2937;">${t('shareNote')}</h3>
      <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280;">
        ${t('shareDescription')}
      </p>
      <input type="email" placeholder="${t('emailPlaceholder')}" 
        style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; margin-bottom: 16px; box-sizing: border-box;">
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="sn-modal-cancel" style="padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: white; color: #374151; cursor: pointer; font-size: 14px;">${t('cancel')}</button>
        <button class="sn-modal-share" style="padding: 8px 16px; border: none; border-radius: 6px; background: #facc15; color: #713f12; cursor: pointer; font-size: 14px; font-weight: 500;">${t('shareButton')}</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    
    // Get parent container (shadow root)
    const container = this.element.parentNode;
    container.appendChild(overlay);
    
    // Focus email input
    const emailInput = modal.querySelector('input');
    emailInput.focus();
    
    // Handle cancel
    modal.querySelector('.sn-modal-cancel').addEventListener('click', () => {
      container.removeChild(overlay);
    });
    
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
        log.debug('Sharing note:', this.id, 'with:', email);
        const response = await chrome.runtime.sendMessage({
          action: 'shareNote',
          noteId: this.id,
          email: email
        });
        
        log.debug('Share response:', response);
        
        if (response && response.success) {
          container.removeChild(overlay);
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
    modal.querySelector('.sn-modal-share').addEventListener('click', handleShare);
    
    // Handle Enter key in email input
    emailInput.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Enter') {
        keyEvent.preventDefault();
        handleShare();
      }
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (clickEvent) => {
      if (clickEvent.target === overlay) {
        container.removeChild(overlay);
      }
    });
    
    // Close on escape
    const handleEscape = (keyEvent) => {
      if (keyEvent.key === 'Escape') {
        container.removeChild(overlay);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }
  
  /**
   * Show toast notification
   * @param {string} message - Toast message
   * @param {string} type - Toast type ('success' or 'error')
   */
  showToast(message, type = 'success') {
    const container = this.element.parentNode;
    
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${type === 'error' ? '#ef4444' : '#22c55e'};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      animation: slideUp 0.3s ease;
    `;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => container.removeChild(toast), 300);
    }, TIMEOUTS.TOAST_DISPLAY);
  }
  
  /**
   * Handle window resize
   */
  handleWindowResize() {
    if (!this.customPosition) {
      this.updatePosition();
    }
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
