/**
 * RichEditor Component
 * Lightweight contenteditable-based rich text editor
 * Supports: Bold, Italic, Lists, Links, Auto-share via email detection
 */

import { escapeHtml, isValidEmail, extractEmails } from '../../shared/utils.js';
import { t } from '../../shared/i18n.js';

export class RichEditor {
  /**
   * Create rich editor
   * @param {Object} options - Editor options
   * @param {string} options.content - Initial HTML content
   * @param {string} options.placeholder - Placeholder text
   * @param {Function} options.onChange - Change callback
   * @param {Function} options.onEmailShare - Callback when email detected for sharing (email) => void
   * @param {Function} options.onEmailUnshare - Callback when email removed (email) => void
   */
  constructor(options = {}) {
    this.content = options.content || '';
    this.placeholder = options.placeholder || 'Write your note here...';
    this.onChange = options.onChange || (() => {});
    this.onEmailShare = options.onEmailShare || null;
    this.onEmailUnshare = options.onEmailUnshare || null;
    
    // Track detected emails: Map<email, { status: 'pending'|'success'|'failed', tooltip: string }>
    this.trackedEmails = new Map();
    
    this.element = null;
    this.toolbar = null;
    this.editor = null;
    
    this.render();
    this.setupEventListeners();
    
    // Process initial content for existing emails
    if (this.content) {
      this.processEmailsInContent();
    }
  }
  
  /**
   * Render the editor
   */
  render() {
    this.element = document.createElement('div');
    this.element.className = 'sn-rich-editor';
    
    // Create toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'sn-editor-toolbar';
    this.toolbar.innerHTML = `
      <button type="button" class="sn-toolbar-btn" data-command="bold" title="Bold (Ctrl+B)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
        </svg>
      </button>
      <button type="button" class="sn-toolbar-btn" data-command="italic" title="Italic (Ctrl+I)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="4" x2="10" y2="4"/>
          <line x1="14" y1="20" x2="5" y2="20"/>
          <line x1="15" y1="4" x2="9" y2="20"/>
        </svg>
      </button>
      <span class="sn-toolbar-divider"></span>
      <button type="button" class="sn-toolbar-btn" data-command="insertUnorderedList" title="Bullet List">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="9" y1="6" x2="20" y2="6"/>
          <line x1="9" y1="12" x2="20" y2="12"/>
          <line x1="9" y1="18" x2="20" y2="18"/>
          <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
          <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
        </svg>
      </button>
      <button type="button" class="sn-toolbar-btn" data-command="insertOrderedList" title="Numbered List">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="10" y1="6" x2="21" y2="6"/>
          <line x1="10" y1="12" x2="21" y2="12"/>
          <line x1="10" y1="18" x2="21" y2="18"/>
          <text x="3" y="8" font-size="8" fill="currentColor" stroke="none">1</text>
          <text x="3" y="14" font-size="8" fill="currentColor" stroke="none">2</text>
          <text x="3" y="20" font-size="8" fill="currentColor" stroke="none">3</text>
        </svg>
      </button>
      <span class="sn-toolbar-divider"></span>
      <button type="button" class="sn-toolbar-btn" data-command="createLink" title="Add Link (Ctrl+K)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </button>
    `;
    
    // Create editor area
    this.editor = document.createElement('div');
    this.editor.className = 'sn-editor-content';
    this.editor.contentEditable = 'true';
    this.editor.innerHTML = this.content || '';
    this.editor.dataset.placeholder = this.placeholder;
    
    this.element.appendChild(this.toolbar);
    this.element.appendChild(this.editor);
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Toolbar button clicks
    this.toolbar.addEventListener('click', (event) => {
      const btn = event.target.closest('.sn-toolbar-btn');
      if (!btn) return;
      
      event.preventDefault();
      const command = btn.dataset.command;
      
      if (command === 'createLink') {
        this.handleCreateLink();
      } else {
        document.execCommand(command, false, null);
        this.updateToolbarState();
      }
      
      this.editor.focus();
    });
    
    // Editor input
    this.editor.addEventListener('input', () => {
      this.content = this.editor.innerHTML;
      this.onChange(this.content);
      this.updatePlaceholder();
      this.processEmailsInContent();
    });
    
    // Keyboard shortcuts - stop propagation to prevent page shortcuts from interfering
    this.editor.addEventListener('keydown', (event) => {
      // Allow Ctrl+H/Cmd+H to bubble up for note visibility toggle
      const isVisibilityToggle = (event.ctrlKey || event.metaKey) && 
                                  event.key.toLowerCase() === 'h' && 
                                  !event.shiftKey;
      
      if (!isVisibilityToggle) {
        // Stop all other keyboard events from reaching the page
        event.stopPropagation();
      }
      
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'b':
            event.preventDefault();
            document.execCommand('bold', false, null);
            break;
          case 'i':
            event.preventDefault();
            document.execCommand('italic', false, null);
            break;
          case 'k':
            event.preventDefault();
            this.handleCreateLink();
            break;
        }
        this.updateToolbarState();
      }
    });
    
    // Stop keyup and keypress from propagating to page handlers
    this.editor.addEventListener('keyup', (event) => event.stopPropagation());
    this.editor.addEventListener('keypress', (event) => event.stopPropagation());
    
    // Selection change
    document.addEventListener('selectionchange', () => {
      if (this.editor.contains(document.activeElement)) {
        this.updateToolbarState();
      }
    });
    
    // Focus/blur for placeholder
    this.editor.addEventListener('focus', () => this.updatePlaceholder());
    this.editor.addEventListener('blur', () => this.updatePlaceholder());
    
    // Paste handling - clean up pasted content
    this.editor.addEventListener('paste', (event) => {
      event.preventDefault();
      
      // Get plain text or HTML from clipboard
      const html = event.clipboardData.getData('text/html');
      const text = event.clipboardData.getData('text/plain');
      
      if (html) {
        // Clean the HTML
        const cleaned = this.cleanHtml(html);
        document.execCommand('insertHTML', false, cleaned);
      } else {
        document.execCommand('insertText', false, text);
      }
      
      this.content = this.editor.innerHTML;
      this.onChange(this.content);
      this.processEmailsInContent();
    });
    
    // Initial placeholder state
    this.updatePlaceholder();
  }
  
  /**
   * Handle create link command
   */
  handleCreateLink() {
    const selection = window.getSelection();
    const selectedText = selection.toString();
    
    // Check if already a link
    const anchorNode = selection.anchorNode;
    const existingLink = anchorNode?.parentElement?.closest('a');
    
    if (existingLink) {
      // Remove link
      document.execCommand('unlink', false, null);
      return;
    }
    
    // Save selection range before showing input
    const range = selection.getRangeAt(0).cloneRange();
    
    // Show inline URL input
    this.showLinkInput(range, selectedText);
  }
  
  /**
   * Show inline link input popup
   * @param {Range} range - Selection range to restore
   * @param {string} selectedText - Selected text to link
   */
  showLinkInput(range, selectedText) {
    // Remove any existing link input
    const existingInput = this.element.querySelector('.sn-inline-popup');
    if (existingInput) {
      existingInput.remove();
    }
    
    // Create inline input popup using CSS classes
    const popup = document.createElement('div');
    popup.className = 'sn-inline-popup';
    
    const input = document.createElement('input');
    input.className = 'sn-inline-popup-input';
    input.type = 'url';
    input.placeholder = t('linkUrlPlaceholder');
    input.value = 'https://';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'sn-btn sn-btn-primary sn-btn-sm';
    confirmBtn.textContent = t('add');
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sn-btn sn-btn-secondary sn-btn-sm';
    cancelBtn.textContent = t('cancel');
    
    const cleanup = () => {
      popup.remove();
      this.editor.focus();
    };
    
    const insertLink = () => {
      const url = input.value.trim();
      if (url && url !== 'https://') {
        // Restore selection
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        
        if (selectedText) {
          document.execCommand('createLink', false, url);
        } else {
          // Insert link with URL as text
          const link = `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a>`;
          document.execCommand('insertHTML', false, link);
        }
      }
      cleanup();
    };
    
    confirmBtn.addEventListener('click', insertLink);
    cancelBtn.addEventListener('click', cleanup);
    
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        insertLink();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cleanup();
      }
    });
    
    popup.appendChild(input);
    popup.appendChild(confirmBtn);
    popup.appendChild(cancelBtn);
    
    // Position relative to toolbar
    this.toolbar.style.position = 'relative';
    this.toolbar.appendChild(popup);
    
    // Focus input and select the "https://" part after the protocol
    input.focus();
    input.setSelectionRange(8, 8);
  }
  
  /**
   * Update toolbar button states
   */
  updateToolbarState() {
    const buttons = this.toolbar.querySelectorAll('.sn-toolbar-btn');
    
    buttons.forEach(btn => {
      const command = btn.dataset.command;
      const active = document.queryCommandState(command);
      btn.classList.toggle('active', active);
    });
  }
  
  /**
   * Update placeholder visibility
   */
  updatePlaceholder() {
    const isEmpty = !this.editor.textContent.trim();
    this.editor.classList.toggle('empty', isEmpty);
  }
  
  /**
   * Clean pasted HTML
   * @param {string} html - Raw HTML
   * @returns {string} Cleaned HTML
   */
  cleanHtml(html) {
    // Create a temporary element
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Remove unwanted elements
    const unwanted = temp.querySelectorAll('script, style, meta, link, head');
    unwanted.forEach(el => el.remove());
    
    // Remove most attributes except href on links and data-* on email share spans
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes);
      const isEmailShareSpan = el.tagName === 'SPAN' && el.classList.contains('sn-email-share');
      attrs.forEach(attr => {
        if (el.tagName === 'A' && attr.name === 'href') {
          return; // Keep href on links
        }
        if (isEmailShareSpan && (attr.name === 'class' || attr.name.startsWith('data-'))) {
          return; // Keep class and data attributes on email share spans
        }
        el.removeAttribute(attr.name);
      });
    });
    
    // Only allow certain tags
    const allowedTags = ['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'A', 'UL', 'OL', 'LI', 'DIV', 'SPAN'];
    const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT);
    const nodesToRemove = [];
    
    while (walker.nextNode()) {
      if (!allowedTags.includes(walker.currentNode.tagName)) {
        nodesToRemove.push(walker.currentNode);
      }
    }
    
    nodesToRemove.forEach(node => {
      // Replace with its children
      while (node.firstChild) {
        node.parentNode.insertBefore(node.firstChild, node);
      }
      node.remove();
    });
    
    return temp.innerHTML;
  }
  
  // escapeHtml is now imported from shared/utils.js
  
  /**
   * Get HTML content
   * @returns {string} HTML content
   */
  getContent() {
    return this.editor.innerHTML;
  }
  
  /**
   * Set HTML content
   * @param {string} html - HTML content
   */
  setContent(html) {
    this.editor.innerHTML = html || '';
    this.content = html || '';
    this.updatePlaceholder();
  }
  
  /**
   * Get plain text content
   * @returns {string} Plain text
   */
  getPlainText() {
    return this.editor.textContent || '';
  }
  
  /**
   * Process emails in content - detect new emails and wrap them, detect removed emails
   * Called on input and paste events
   */
  processEmailsInContent() {
    // Get plain text to find emails
    const plainText = this.getPlainText();
    const currentEmails = extractEmails(plainText);
    const currentEmailSet = new Set(currentEmails.map(email => email.toLowerCase()));
    
    // FIRST: Clean up any spans that have accumulated extra text
    this.cleanupEmailSpans();
    
    // Find emails that were removed
    for (const [email] of this.trackedEmails) {
      if (!currentEmailSet.has(email.toLowerCase())) {
        // Email was removed from content
        this.trackedEmails.delete(email);
        if (this.onEmailUnshare) {
          this.onEmailUnshare(email);
        }
      }
    }
    
    // Find new emails that need to be shared
    for (const email of currentEmails) {
      const normalizedEmail = email.toLowerCase();
      if (!this.trackedEmails.has(normalizedEmail) && isValidEmail(email)) {
        // Check if this email is followed by a space (completed typing)
        const emailIndex = plainText.indexOf(email);
        const charAfterEmail = plainText[emailIndex + email.length];
        
        // Only trigger share if email is EXPLICITLY followed by space or newline
        // Do NOT trigger when email is at end of content (undefined) - user may still be typing
        if (charAfterEmail === ' ' || charAfterEmail === '\n' || charAfterEmail === '\u00A0') {
          // New email detected - wrap it and trigger share
          this.wrapEmailInSpan(email);
          this.trackedEmails.set(normalizedEmail, { status: 'pending', tooltip: '' });
          
          if (this.onEmailShare) {
            this.onEmailShare(email);
          }
        }
      }
    }
  }
  
  /**
   * Clean up email spans that have accumulated extra text
   * This happens when user types inside the span after the email
   */
  cleanupEmailSpans() {
    const spans = this.editor.querySelectorAll('.sn-email-share');
    
    for (const span of spans) {
      const spanText = span.textContent;
      
      // Check if span contains text that doesn't match the data-email
      // Extract just the email part from the span text
      const emailsInSpan = extractEmails(spanText);
      
      if (emailsInSpan.length === 0) {
        // No valid email in span - remove the span styling but keep the text
        const textNode = document.createTextNode(spanText);
        span.parentNode.replaceChild(textNode, span);
        this.content = this.editor.innerHTML;
        continue;
      }
      
      const actualEmail = emailsInSpan[0]; // Use the first valid email found
      
      // Check if the span text has extra content beyond the email
      if (spanText !== actualEmail) {
        // Find where the email is in the span text
        const emailIndex = spanText.indexOf(actualEmail);
        const before = spanText.substring(0, emailIndex);
        const after = spanText.substring(emailIndex + actualEmail.length);
        
        // Create new span with just the email
        const newSpan = document.createElement('span');
        newSpan.className = span.className;
        newSpan.dataset.email = actualEmail.toLowerCase();
        newSpan.dataset.tooltip = span.dataset.tooltip;
        newSpan.textContent = actualEmail;
        
        // Create fragment with before text, new span, and after text
        const fragment = document.createDocumentFragment();
        if (before) {
          fragment.appendChild(document.createTextNode(before));
        }
        fragment.appendChild(newSpan);
        if (after) {
          fragment.appendChild(document.createTextNode(after));
        }
        
        // Replace old span with the fixed content
        span.parentNode.replaceChild(fragment, span);
        
        // Update internal content
        this.content = this.editor.innerHTML;
      }
    }
  }
  
  /**
   * Wrap an email address in a styled span for visual feedback
   * @param {string} email - Email to wrap
   */
  wrapEmailInSpan(email) {
    // First, check if this email is inside an existing span that needs updating
    const existingSpans = this.editor.querySelectorAll('.sn-email-share');
    for (const span of existingSpans) {
      const spanText = span.textContent;
      // Check if the span contains this email (possibly with extra text that shouldn't be there)
      if (spanText.includes(email)) {
        // The span contains more than just the email - need to fix it
        if (spanText !== email) {
          // Extract the email and any text before/after it
          const emailIndex = spanText.indexOf(email);
          const before = spanText.substring(0, emailIndex);
          const after = spanText.substring(emailIndex + email.length);
          
          // Create new span with just the email
          const newSpan = document.createElement('span');
          newSpan.className = span.className;
          newSpan.dataset.email = email.toLowerCase();
          newSpan.dataset.tooltip = span.dataset.tooltip;
          newSpan.textContent = email;
          
          // Create fragment with before text, new span, and after text
          const fragment = document.createDocumentFragment();
          if (before) {
            fragment.appendChild(document.createTextNode(before));
          }
          fragment.appendChild(newSpan);
          
          let afterTextNode = null;
          if (after) {
            afterTextNode = document.createTextNode(after);
            fragment.appendChild(afterTextNode);
          }
          
          // Replace old span with the fixed content
          span.parentNode.replaceChild(fragment, span);
          
          // Update the span's data attributes
          newSpan.dataset.email = email.toLowerCase();
          
          // Update internal content
          this.content = this.editor.innerHTML;
          
          // Position cursor after the span
          try {
            const selection = window.getSelection();
            const range = document.createRange();
            if (afterTextNode) {
              range.setStart(afterTextNode, 0);
              range.setEnd(afterTextNode, 0);
            } else {
              range.setStartAfter(newSpan);
              range.setEndAfter(newSpan);
            }
            selection.removeAllRanges();
            selection.addRange(range);
          } catch {
            // Selection positioning may fail
          }
          
          return;
        } else if (span.dataset.email !== email.toLowerCase()) {
          // Span text matches email but data-email attribute is outdated - update it
          span.dataset.email = email.toLowerCase();
          span.dataset.tooltip = t('sharingInProgress') || 'Sharing...';
          span.classList.remove('sn-email-share-success', 'sn-email-share-failed');
          span.classList.add('sn-email-share-pending');
          this.content = this.editor.innerHTML;
          return;
        } else {
          // Already properly wrapped, skip
          return;
        }
      }
    }
    
    // Find and wrap the email in the editor content (for emails not yet in a span)
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      const emailIndex = text.indexOf(email);
      
      if (emailIndex !== -1) {
        // Check if this text node's email is not already wrapped
        const parent = node.parentElement;
        if (parent && parent.classList && parent.classList.contains('sn-email-share')) {
          // Already wrapped, skip
          continue;
        }
        
        // Split the text node and wrap the email
        const before = text.substring(0, emailIndex);
        const after = text.substring(emailIndex + email.length);
        
        const span = document.createElement('span');
        span.className = 'sn-email-share sn-email-share-pending';
        span.dataset.email = email.toLowerCase();
        span.dataset.tooltip = t('sharingInProgress') || 'Sharing...';
        span.textContent = email;
        
        const fragment = document.createDocumentFragment();
        if (before) {
          fragment.appendChild(document.createTextNode(before));
        }
        fragment.appendChild(span);
        
        // Create the "after" text node - we'll use this to position cursor
        let afterTextNode = null;
        if (after) {
          afterTextNode = document.createTextNode(after);
          fragment.appendChild(afterTextNode);
        }
        
        const parentNode = node.parentNode;
        parentNode.replaceChild(fragment, node);
        
        // Update internal content
        this.content = this.editor.innerHTML;
        
        // Position cursor AFTER the span (at start of afterTextNode, or after span if no after text)
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          
          if (afterTextNode) {
            // Position at the start of the text after the email
            range.setStart(afterTextNode, 0);
            range.setEnd(afterTextNode, 0);
          } else {
            // No text after email - position right after the span
            range.setStartAfter(span);
            range.setEndAfter(span);
          }
          
          selection.removeAllRanges();
          selection.addRange(range);
        } catch {
          // Selection positioning may fail in some edge cases
        }
        
        break; // Only wrap first occurrence
      }
    }
  }
  
  /**
   * Update the visual status of an email share
   * @param {string} email - Email address
   * @param {boolean} success - Whether the share succeeded
   * @param {string} tooltip - Tooltip text to display
   */
  updateEmailStatus(email, success, tooltip = '') {
    const normalizedEmail = email.toLowerCase();
    
    // Update tracked status
    if (this.trackedEmails.has(normalizedEmail)) {
      this.trackedEmails.set(normalizedEmail, {
        status: success ? 'success' : 'failed',
        tooltip: tooltip
      });
    }
    
    // Find and update the span in the editor
    // Match by data-email attribute OR by text content containing the email
    const spans = this.editor.querySelectorAll('.sn-email-share');
    for (const span of spans) {
      // Match by data-email OR by text content (in case data-email is outdated)
      const spanEmail = span.dataset.email;
      const spanText = span.textContent.toLowerCase();
      
      if (spanEmail === normalizedEmail || spanText === normalizedEmail || spanText.includes(normalizedEmail)) {
        span.classList.remove('sn-email-share-pending', 'sn-email-share-success', 'sn-email-share-failed');
        span.classList.add(success ? 'sn-email-share-success' : 'sn-email-share-failed');
        span.dataset.tooltip = tooltip;
        // Also update data-email to match the current email
        span.dataset.email = normalizedEmail;
      }
    }
    
    // Update internal content
    this.content = this.editor.innerHTML;
  }
  
  /**
   * Get all tracked emails with their statuses
   * @returns {Map} Map of email -> { status, tooltip }
   */
  getTrackedEmails() {
    return new Map(this.trackedEmails);
  }
  
  /**
   * Set initial email statuses (e.g., when loading a note that's already shared)
   * @param {Array<{email: string, status: string, tooltip: string}>} emailStatuses - Array of email statuses
   */
  setEmailStatuses(emailStatuses) {
    for (const { email, status, tooltip } of emailStatuses) {
      const normalizedEmail = email.toLowerCase();
      this.trackedEmails.set(normalizedEmail, { status, tooltip });
      
      // If the span exists, update it
      const spans = this.editor.querySelectorAll('.sn-email-share');
      for (const span of spans) {
        if (span.dataset.email === normalizedEmail) {
          span.classList.remove('sn-email-share-pending', 'sn-email-share-success', 'sn-email-share-failed');
          span.classList.add(`sn-email-share-${status}`);
          span.dataset.tooltip = tooltip;
        }
      }
    }
  }
  
  /**
   * Focus the editor
   */
  focus() {
    this.editor.focus();
  }
  
  /**
   * Get styles for the editor
   * @returns {string} CSS styles
   */
  static getStyles() {
    return `
      .sn-rich-editor {
        display: flex;
        flex-direction: column;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 4px;
        overflow: hidden;
      }
      
      .sn-editor-toolbar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 6px 8px;
        background: rgba(0, 0, 0, 0.05);
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      }
      
      .sn-toolbar-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      
      .sn-toolbar-btn:hover {
        background: rgba(0, 0, 0, 0.1);
        color: #1f2937;
      }
      
      .sn-toolbar-btn.active {
        background: rgba(250, 204, 21, 0.3);
        color: #713f12;
      }
      
      .sn-toolbar-divider {
        width: 1px;
        height: 20px;
        background: rgba(0, 0, 0, 0.15);
        margin: 0 4px;
      }
      
      .sn-editor-content {
        min-height: 80px;
        padding: 8px;
        font-size: var(--sn-font-size, 14px);
        line-height: 1.5;
        color: #1f2937;
        outline: none;
        overflow-y: auto;
        max-height: 200px;
      }
      
      .sn-editor-content:focus {
        background: rgba(255, 255, 255, 0.3);
      }
      
      .sn-editor-content.empty::before {
        content: attr(data-placeholder);
        color: #9ca3af;
        pointer-events: none;
      }
      
      .sn-editor-content a {
        color: #2563eb;
        text-decoration: underline;
      }
      
      .sn-editor-content ul,
      .sn-editor-content ol {
        margin: 4px 0;
        padding-left: 20px;
      }
      
      .sn-editor-content li {
        margin: 2px 0;
      }
      
      /* Email share styles */
      .sn-email-share {
        text-decoration: underline;
        text-decoration-style: solid;
        text-decoration-thickness: 2px;
        cursor: default;
        position: relative;
      }
      
      .sn-email-share-pending {
        text-decoration-color: #9ca3af;
      }
      
      .sn-email-share-success {
        text-decoration-color: #22c55e;
      }
      
      .sn-email-share-failed {
        text-decoration-color: #ef4444;
      }
      
      /* Tooltip on hover - positioned below to avoid overflow clipping */
      .sn-email-share[data-tooltip]:hover::after {
        content: attr(data-tooltip);
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        padding: 4px 8px;
        background: #1f2937;
        color: white;
        font-size: 12px;
        white-space: nowrap;
        border-radius: 4px;
        z-index: 9999;
        pointer-events: none;
        margin-top: 4px;
      }
      
      .sn-email-share[data-tooltip]:hover::before {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-bottom-color: #1f2937;
        z-index: 9999;
        pointer-events: none;
      }
    `;
  }
  
  /**
   * Destroy the editor
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
