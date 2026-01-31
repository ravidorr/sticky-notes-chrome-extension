/**
 * RichEditor Component
 * Lightweight contenteditable-based rich text editor
 * Supports: Bold, Italic, Lists, Links, Auto-share via email detection
 */

import { escapeHtml, isValidEmail, extractEmails, MAX_NOTE_LENGTH, NOTE_LENGTH_WARNING_THRESHOLD } from '../../shared/utils.js';
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
   * @param {number} options.maxLength - Maximum character limit (defaults to MAX_NOTE_LENGTH)
   */
  constructor(options = {}) {
    this.content = options.content || '';
    this.placeholder = options.placeholder || 'Write your note here...';
    this.onChange = options.onChange || (() => {});
    this.onEmailShare = options.onEmailShare || null;
    this.onEmailUnshare = options.onEmailUnshare || null;
    this.maxLength = options.maxLength !== undefined ? options.maxLength : MAX_NOTE_LENGTH;
    this.warningThreshold = NOTE_LENGTH_WARNING_THRESHOLD;
    
    // Track detected emails: Map<email, { status: 'pending'|'success'|'failed', tooltip: string }>
    this.trackedEmails = new Map();
    
    this.element = null;
    this.toolbar = null;
    this.editor = null;
    this.counter = null;
    
    this.render();
    this.setupEventListeners();
    
    // Process initial content for existing emails
    if (this.content) {
      this.processEmailsInContent();
    }
    
    // Initialize character counter
    this.updateCharacterCounter();
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
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', t('textFormatting'));
    this.toolbar.innerHTML = `
      <button type="button" class="sn-toolbar-btn" data-command="bold" title="${t('boldText')}" aria-label="${t('boldText')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
        </svg>
      </button>
      <button type="button" class="sn-toolbar-btn" data-command="italic" title="${t('italicText')}" aria-label="${t('italicText')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="19" y1="4" x2="10" y2="4"/>
          <line x1="14" y1="20" x2="5" y2="20"/>
          <line x1="15" y1="4" x2="9" y2="20"/>
        </svg>
      </button>
      <span class="sn-toolbar-divider" aria-hidden="true"></span>
      <button type="button" class="sn-toolbar-btn" data-command="insertUnorderedList" title="${t('bulletList')}" aria-label="${t('bulletList')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="9" y1="6" x2="20" y2="6"/>
          <line x1="9" y1="12" x2="20" y2="12"/>
          <line x1="9" y1="18" x2="20" y2="18"/>
          <circle cx="4" cy="6" r="1.5" fill="currentColor"/>
          <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
        </svg>
      </button>
      <button type="button" class="sn-toolbar-btn" data-command="insertOrderedList" title="${t('numberedList')}" aria-label="${t('numberedList')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="10" y1="6" x2="21" y2="6"/>
          <line x1="10" y1="12" x2="21" y2="12"/>
          <line x1="10" y1="18" x2="21" y2="18"/>
          <text x="3" y="8" font-size="8" fill="currentColor" stroke="none">1</text>
          <text x="3" y="14" font-size="8" fill="currentColor" stroke="none">2</text>
          <text x="3" y="20" font-size="8" fill="currentColor" stroke="none">3</text>
        </svg>
      </button>
      <span class="sn-toolbar-divider" aria-hidden="true"></span>
      <button type="button" class="sn-toolbar-btn" data-command="createLink" title="${t('addLink')}" aria-label="${t('addLink')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </button>
      <span class="sn-toolbar-divider" aria-hidden="true"></span>
      <button type="button" class="sn-toolbar-btn" data-command="strikethrough" title="${t('strikethroughText')}" aria-label="${t('strikethroughText')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="4" y1="12" x2="20" y2="12"/>
          <path d="M17.5 7.5c0-2.5-2-4-5.5-4s-5.5 1.5-5.5 4c0 1.5 1 2.5 2.5 3.5"/>
          <path d="M6.5 16.5c0 2.5 2 4 5.5 4s5.5-1.5 5.5-4c0-1.5-1-2.5-2.5-3.5"/>
        </svg>
      </button>
      <button type="button" class="sn-toolbar-btn" data-command="code" title="${t('codeText')}" aria-label="${t('codeText')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      </button>
      <button type="button" class="sn-toolbar-btn" data-command="blockquote" title="${t('blockquoteText')}" aria-label="${t('blockquoteText')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/>
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v4"/>
        </svg>
      </button>
      <button type="button" class="sn-toolbar-btn" data-command="insertCheckbox" title="${t('checkboxText')}" aria-label="${t('checkboxText')}" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <polyline points="9 11 12 14 22 4" stroke-width="2"/>
        </svg>
      </button>
    `;
    
    // Create editor area
    this.editor = document.createElement('div');
    this.editor.className = 'sn-editor-content';
    this.editor.contentEditable = 'true';
    this.editor.setAttribute('role', 'textbox');
    this.editor.setAttribute('aria-multiline', 'true');
    this.editor.setAttribute('aria-label', this.placeholder);
    this.editor.innerHTML = this.content || '';
    this.editor.dataset.placeholder = this.placeholder;
    
    // Create character counter
    this.counter = document.createElement('div');
    this.counter.className = 'sn-char-counter';
    this.counter.setAttribute('aria-live', 'polite');
    this.counter.setAttribute('aria-atomic', 'true');
    
    this.element.appendChild(this.toolbar);
    this.element.appendChild(this.editor);
    this.element.appendChild(this.counter);
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
      } else if (command === 'code') {
        this.handleCode();
      } else if (command === 'blockquote') {
        this.handleBlockquote();
      } else if (command === 'insertCheckbox') {
        this.handleInsertCheckbox();
      } else {
        document.execCommand(command, false, null);
        this.updateToolbarState();
      }
      
      this.editor.focus();
    });
    
    // Editor input
    this.editor.addEventListener('input', () => {
      const textLength = this.getTextLength();
      
      // Check if content exceeds max length
      if (this.maxLength && textLength > this.maxLength) {
        // Truncate content to max length
        this.truncateToMaxLength();
        return;
      }
      
      this.content = this.editor.innerHTML;
      this.updateCharacterCounter();
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
          case 's':
            if (event.shiftKey) {
              event.preventDefault();
              document.execCommand('strikethrough', false, null);
            }
            break;
          case '`':
            event.preventDefault();
            this.handleCode();
            break;
          case 'q':
            if (event.shiftKey) {
              event.preventDefault();
              this.handleBlockquote();
            }
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
      
      // Calculate how much space is available
      const currentLength = this.getTextLength();
      const availableSpace = this.maxLength ? this.maxLength - currentLength : Infinity;
      
      if (html) {
        // Clean the HTML
        const cleaned = this.cleanHtml(html);
        
        // If pasting would exceed limit, truncate to plain text
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cleaned;
        const pasteTextLength = (tempDiv.textContent || '').length;
        
        if (pasteTextLength > availableSpace) {
          // Truncate to available space
          const truncatedText = (tempDiv.textContent || '').substring(0, availableSpace);
          document.execCommand('insertText', false, truncatedText);
        } else {
          document.execCommand('insertHTML', false, cleaned);
        }
      } else {
        // Truncate plain text if needed
        const textToInsert = text.length > availableSpace ? text.substring(0, availableSpace) : text;
        document.execCommand('insertText', false, textToInsert);
      }
      
      this.content = this.editor.innerHTML;
      this.updateCharacterCounter();
      this.onChange(this.content);
      this.processEmailsInContent();
    });
    
    // Initial placeholder state
    this.updatePlaceholder();
    
    // Checkbox click handling
    this.editor.addEventListener('click', (event) => {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (checkbox && this.editor.contains(checkbox)) {
        // Toggle checkbox state and update content
        // Use setTimeout to let the checkbox update first
        setTimeout(() => {
          this.content = this.editor.innerHTML;
          this.onChange(this.content);
        }, 0);
      }
    });
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
   * Handle code/monospace formatting toggle
   */
  handleCode() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString();
    
    // Check if selection is inside a code element
    const anchorNode = selection.anchorNode;
    const existingCode = anchorNode?.parentElement?.closest('code');
    
    if (existingCode && this.editor.contains(existingCode)) {
      // Remove code formatting - unwrap the code element
      const parent = existingCode.parentNode;
      while (existingCode.firstChild) {
        parent.insertBefore(existingCode.firstChild, existingCode);
      }
      parent.removeChild(existingCode);
      this.content = this.editor.innerHTML;
      this.onChange(this.content);
    } else if (selectedText) {
      // Wrap selection in code element
      const code = document.createElement('code');
      try {
        range.surroundContents(code);
        this.content = this.editor.innerHTML;
        this.onChange(this.content);
      } catch {
        // surroundContents fails if selection spans multiple elements
        // Fall back to insertHTML
        const escapedText = escapeHtml(selectedText);
        document.execCommand('insertHTML', false, `<code>${escapedText}</code>`);
        this.content = this.editor.innerHTML;
        this.onChange(this.content);
      }
    }
    
    this.updateToolbarState();
  }
  
  /**
   * Handle blockquote formatting toggle
   */
  handleBlockquote() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    // Check if cursor is inside a blockquote
    const anchorNode = selection.anchorNode;
    const existingBlockquote = anchorNode?.parentElement?.closest('blockquote');
    
    if (existingBlockquote && this.editor.contains(existingBlockquote)) {
      // Remove blockquote - use formatBlock with div to unwrap
      document.execCommand('formatBlock', false, 'div');
    } else {
      // Add blockquote
      document.execCommand('formatBlock', false, 'blockquote');
    }
    
    this.content = this.editor.innerHTML;
    this.onChange(this.content);
    this.updateToolbarState();
  }
  
  /**
   * Handle checkbox insertion
   */
  handleInsertCheckbox() {
    // Create checkbox element with label wrapper
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'sn-checkbox-input';
    
    const wrapper = document.createElement('label');
    wrapper.className = 'sn-checkbox';
    wrapper.contentEditable = 'false';
    wrapper.appendChild(checkbox);
    
    // Add a space after for typing
    const space = document.createTextNode('\u00A0');
    
    // Insert at cursor position
    const selection = window.getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(space);
      range.insertNode(wrapper);
      
      // Move cursor after the checkbox
      range.setStartAfter(space);
      range.setEndAfter(space);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // No selection, append to end
      this.editor.appendChild(wrapper);
      this.editor.appendChild(space);
    }
    
    this.content = this.editor.innerHTML;
    this.onChange(this.content);
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
    input.setAttribute('aria-label', t('linkUrlPlaceholder'));
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
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
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
    
    // Remove most attributes except specific allowed ones
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes);
      const isEmailShareSpan = el.tagName === 'SPAN' && el.classList.contains('sn-email-share');
      const isCheckboxInput = el.tagName === 'INPUT' && el.getAttribute('type') === 'checkbox';
      const isCheckboxLabel = el.tagName === 'LABEL' && el.classList.contains('sn-checkbox');
      attrs.forEach(attr => {
        if (el.tagName === 'A' && attr.name === 'href') {
          return; // Keep href on links
        }
        if (isEmailShareSpan && (attr.name === 'class' || attr.name.startsWith('data-'))) {
          return; // Keep class and data attributes on email share spans
        }
        if (isCheckboxInput && (attr.name === 'type' || attr.name === 'checked' || attr.name === 'class')) {
          return; // Keep type, checked, and class on checkbox inputs
        }
        if (isCheckboxLabel && (attr.name === 'class' || attr.name === 'contenteditable')) {
          return; // Keep class and contenteditable on checkbox labels
        }
        el.removeAttribute(attr.name);
      });
    });
    
    // Only allow certain tags
    const allowedTags = ['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'A', 'UL', 'OL', 'LI', 'DIV', 'SPAN', 'CODE', 'STRIKE', 'S', 'DEL', 'BLOCKQUOTE', 'INPUT', 'LABEL'];
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
    this.updateCharacterCounter();
  }
  
  /**
   * Get plain text content
   * @returns {string} Plain text
   */
  getPlainText() {
    return this.editor.textContent || '';
  }
  
  /**
   * Get the length of plain text content (excluding HTML tags)
   * @returns {number} Character count
   */
  getTextLength() {
    return this.getPlainText().length;
  }
  
  /**
   * Update the character counter display
   */
  updateCharacterCounter() {
    if (!this.counter || !this.maxLength) return;
    
    const currentLength = this.getTextLength();
    const warningLimit = Math.floor(this.maxLength * this.warningThreshold);
    
    // Update counter text
    this.counter.textContent = t('noteCharacterCount', [currentLength.toLocaleString(), this.maxLength.toLocaleString()]);
    
    // Update counter state classes
    this.counter.classList.remove('sn-char-counter-warning', 'sn-char-counter-error');
    
    if (currentLength >= this.maxLength) {
      this.counter.classList.add('sn-char-counter-error');
    } else if (currentLength >= warningLimit) {
      this.counter.classList.add('sn-char-counter-warning');
    }
  }
  
  /**
   * Truncate content to max length
   * Called when user tries to input beyond the limit
   */
  truncateToMaxLength() {
    if (!this.maxLength) return;
    
    const plainText = this.getPlainText();
    if (plainText.length <= this.maxLength) return;
    
    // Save current selection position
    const selection = window.getSelection();
    let cursorPosition = 0;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      // Get cursor position relative to editor
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(this.editor);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      cursorPosition = preCaretRange.toString().length;
    }
    
    // Truncate the plain text and set it back
    // Note: This is a simple approach that preserves the truncation
    // but may lose some formatting at the end
    const truncatedText = plainText.substring(0, this.maxLength);
    
    // Find how much text to remove from the end
    const charsToRemove = plainText.length - this.maxLength;
    
    // Remove characters from the end of the editor content
    // We do this by walking backwards through text nodes
    this.removeCharsFromEnd(charsToRemove);
    
    // Update content
    this.content = this.editor.innerHTML;
    this.updateCharacterCounter();
    this.onChange(this.content);
    this.updatePlaceholder();
    
    // Process emails in truncated content to ensure auto-email-sharing works
    // even when typing at the character limit
    this.processEmailsInContent();
    
    // Restore cursor position (clamped to new length)
    const newLength = this.getTextLength();
    const newCursorPos = Math.min(cursorPosition, newLength);
    this.setCursorPosition(newCursorPos);
  }
  
  /**
   * Remove a number of characters from the end of the editor content
   * @param {number} count - Number of characters to remove
   */
  removeCharsFromEnd(count) {
    if (count <= 0) return;
    
    let remaining = count;
    
    // Walk through text nodes in reverse order
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    // Collect all text nodes
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    
    // Process nodes in reverse order
    for (let i = textNodes.length - 1; i >= 0 && remaining > 0; i--) {
      const node = textNodes[i];
      const text = node.textContent;
      
      if (text.length <= remaining) {
        // Remove entire node content
        remaining -= text.length;
        node.textContent = '';
      } else {
        // Remove part of node content
        node.textContent = text.substring(0, text.length - remaining);
        remaining = 0;
      }
    }
  }
  
  /**
   * Set cursor position in the editor
   * @param {number} position - Character position
   */
  setCursorPosition(position) {
    const selection = window.getSelection();
    const range = document.createRange();
    
    let currentPos = 0;
    let targetNode = null;
    let targetOffset = 0;
    
    // Walk through text nodes to find position
    const walker = document.createTreeWalker(
      this.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeLength = node.textContent.length;
      
      if (currentPos + nodeLength >= position) {
        targetNode = node;
        targetOffset = position - currentPos;
        break;
      }
      currentPos += nodeLength;
    }
    
    if (targetNode) {
      try {
        range.setStart(targetNode, targetOffset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {
        // Position may be invalid, ignore
      }
    }
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
      
      .sn-toolbar-btn:focus {
        outline: 2px solid var(--sn-color-primary, #facc15);
        outline-offset: 1px;
      }
      
      .sn-toolbar-btn:focus:not(:focus-visible) {
        outline: none;
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
        outline: 2px solid var(--sn-color-primary, #facc15);
        outline-offset: -2px;
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
      
      /* Code/monospace inline */
      .sn-editor-content code {
        font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace;
        font-size: 0.9em;
        background: rgba(0, 0, 0, 0.06);
        padding: 2px 5px;
        border-radius: 3px;
        color: #c7254e;
      }
      
      /* Strikethrough */
      .sn-editor-content s,
      .sn-editor-content strike,
      .sn-editor-content del {
        text-decoration: line-through;
        color: #6b7280;
      }
      
      /* Blockquote */
      .sn-editor-content blockquote {
        border-left: 3px solid rgba(0, 0, 0, 0.2);
        margin: 8px 0;
        padding: 4px 0 4px 12px;
        color: #4b5563;
        font-style: italic;
      }
      
      /* Checkbox styles */
      .sn-editor-content .sn-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        user-select: none;
        vertical-align: middle;
      }
      
      .sn-editor-content .sn-checkbox-input {
        width: 16px;
        height: 16px;
        margin: 0;
        cursor: pointer;
        accent-color: #facc15;
      }
      
      .sn-editor-content .sn-checkbox-input:checked + span {
        text-decoration: line-through;
        color: #9ca3af;
      }
      
      /* Character counter */
      .sn-char-counter {
        font-size: 11px;
        color: #6b7280;
        text-align: right;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.02);
        border-top: 1px solid rgba(0, 0, 0, 0.05);
      }
      
      .sn-char-counter-warning {
        color: #b45309;
        font-weight: 500;
      }
      
      .sn-char-counter-error {
        color: #dc2626;
        font-weight: 600;
      }
      
      /* Reduced motion preference */
      @media (prefers-reduced-motion: reduce) {
        .sn-toolbar-btn,
        .sn-editor-content,
        .sn-inline-popup {
          transition: none !important;
        }
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
