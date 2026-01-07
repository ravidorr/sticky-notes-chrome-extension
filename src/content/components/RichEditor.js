/**
 * RichEditor Component
 * Lightweight contenteditable-based rich text editor
 * Supports: Bold, Italic, Lists, Links
 */

export class RichEditor {
  /**
   * Create rich editor
   * @param {Object} options - Editor options
   * @param {string} options.content - Initial HTML content
   * @param {string} options.placeholder - Placeholder text
   * @param {Function} options.onChange - Change callback
   */
  constructor(options = {}) {
    this.content = options.content || '';
    this.placeholder = options.placeholder || 'Write your note here...';
    this.onChange = options.onChange || (() => {});
    
    this.element = null;
    this.toolbar = null;
    this.editor = null;
    
    this.render();
    this.setupEventListeners();
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
    this.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.sn-toolbar-btn');
      if (!btn) return;
      
      e.preventDefault();
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
    });
    
    // Keyboard shortcuts - stop propagation to prevent page shortcuts from interfering
    this.editor.addEventListener('keydown', (e) => {
      // Stop all keyboard events from reaching the page
      e.stopPropagation();
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            document.execCommand('bold', false, null);
            break;
          case 'i':
            e.preventDefault();
            document.execCommand('italic', false, null);
            break;
          case 'k':
            e.preventDefault();
            this.handleCreateLink();
            break;
        }
        this.updateToolbarState();
      }
    });
    
    // Stop keyup and keypress from propagating to page handlers
    this.editor.addEventListener('keyup', (e) => e.stopPropagation());
    this.editor.addEventListener('keypress', (e) => e.stopPropagation());
    
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
    this.editor.addEventListener('paste', (e) => {
      e.preventDefault();
      
      // Get plain text or HTML from clipboard
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      
      if (html) {
        // Clean the HTML
        const cleaned = this.cleanHtml(html);
        document.execCommand('insertHTML', false, cleaned);
      } else {
        document.execCommand('insertText', false, text);
      }
      
      this.content = this.editor.innerHTML;
      this.onChange(this.content);
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
    
    // Prompt for URL
    const url = prompt('Enter URL:', 'https://');
    
    if (url && url !== 'https://') {
      if (selectedText) {
        document.execCommand('createLink', false, url);
      } else {
        // Insert link with URL as text
        const link = `<a href="${this.escapeHtml(url)}" target="_blank">${this.escapeHtml(url)}</a>`;
        document.execCommand('insertHTML', false, link);
      }
    }
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
    
    // Remove most attributes except href on links
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes);
      attrs.forEach(attr => {
        if (el.tagName === 'A' && attr.name === 'href') {
          return; // Keep href on links
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
  
  /**
   * Escape HTML
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
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
        font-size: 14px;
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
