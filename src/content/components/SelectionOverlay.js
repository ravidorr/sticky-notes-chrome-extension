/**
 * SelectionOverlay Component
 * Handles element selection mode UI and interactions
 */

export class SelectionOverlay {
  /**
   * Create selection overlay
   * @param {Object} options - Options
   * @param {Function} options.onSelect - Callback when element is selected
   * @param {Function} options.onCancel - Callback when selection is cancelled
   */
  constructor(options) {
    this.onSelect = options.onSelect || (() => {});
    this.onCancel = options.onCancel || (() => {});
    
    this.element = null;
    this.tooltip = null;
    this.highlightedElement = null;
    this.isActive = true;
    
    // Store bound event handlers to allow proper removal
    this.boundHandleMouseOver = this.handleMouseOver.bind(this);
    this.boundHandleMouseOut = this.handleMouseOut.bind(this);
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    
    this.render();
    this.setupEventListeners();
  }
  
  /**
   * Render the overlay
   */
  render() {
    // Create overlay container
    this.element = document.createElement('div');
    this.element.className = 'sn-selection-overlay';
    
    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'sn-selection-tooltip';
    this.tooltip.textContent = 'Click an element to add a note';
    this.tooltip.style.display = 'none';
    this.element.appendChild(this.tooltip);
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Use capture phase to intercept events before page handlers
    // Use stored bound handlers for proper removal
    document.addEventListener('mouseover', this.boundHandleMouseOver, true);
    document.addEventListener('mouseout', this.boundHandleMouseOut, true);
    document.addEventListener('click', this.boundHandleClick, true);
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
  }
  
  /**
   * Remove event listeners
   */
  removeEventListeners() {
    // Use stored bound handlers to ensure proper removal
    document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
    document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
  }
  
  /**
   * Handle mouse over
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseOver(e) {
    if (!this.isActive) return;
    
    const target = e.target;
    
    // Ignore our own elements
    if (this.isOwnElement(target)) return;
    
    // Ignore body, html, and other non-useful elements
    if (this.shouldIgnoreElement(target)) return;
    
    // Remove highlight from previous element
    this.removeHighlight();
    
    // Add highlight to new element
    this.highlightedElement = target;
    target.classList.add('sn-element-highlight');
    
    // Update tooltip
    this.updateTooltip(target);
  }
  
  /**
   * Handle mouse out
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseOut(e) {
    if (!this.isActive) return;
    
    // Hide tooltip when leaving elements
    if (this.shouldIgnoreElement(e.relatedTarget)) {
      this.tooltip.style.display = 'none';
    }
  }
  
  /**
   * Handle mouse move (for tooltip positioning)
   * @param {MouseEvent} e - Mouse event
   */
  handleMouseMove(e) {
    if (!this.isActive || this.tooltip.style.display === 'none') return;
    
    // Position tooltip near cursor
    const offset = 15;
    let x = e.clientX + offset;
    let y = e.clientY + offset;
    
    // Keep tooltip in viewport
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (x + tooltipRect.width > viewportWidth) {
      x = e.clientX - tooltipRect.width - offset;
    }
    
    if (y + tooltipRect.height > viewportHeight) {
      y = e.clientY - tooltipRect.height - offset;
    }
    
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }
  
  /**
   * Handle click
   * @param {MouseEvent} e - Mouse event
   */
  handleClick(e) {
    if (!this.isActive) return;
    
    const target = e.target;
    
    // Ignore our own elements
    if (this.isOwnElement(target)) return;
    
    // Ignore non-useful elements
    if (this.shouldIgnoreElement(target)) return;
    
    // Prevent default click behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Remove highlight
    this.removeHighlight();
    
    // Call select callback
    this.onSelect(target);
  }
  
  /**
   * Handle keydown
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyDown(e) {
    if (!this.isActive) return;
    
    // Cancel on Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      this.removeHighlight();
      this.onCancel();
    }
  }
  
  /**
   * Update tooltip content
   * @param {Element} element - Target element
   */
  updateTooltip(element) {
    this.tooltip.textContent = 'Click to add note';
    this.tooltip.style.display = 'block';
  }
  
  /**
   * Remove highlight from current element
   */
  removeHighlight() {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('sn-element-highlight');
      this.highlightedElement = null;
    }
  }
  
  /**
   * Check if element is part of our extension
   * @param {Element} element - Element to check
   * @returns {boolean} True if our element
   */
  isOwnElement(element) {
    if (!element) return true;
    
    // Check if element is inside our shadow DOM host
    return element.closest('#sticky-notes-extension-root') !== null ||
           element.id === 'sticky-notes-extension-root';
  }
  
  /**
   * Check if element should be ignored
   * @param {Element} element - Element to check
   * @returns {boolean} True if should ignore
   */
  shouldIgnoreElement(element) {
    if (!element || !element.tagName) return true;
    
    const ignoredTags = ['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'];
    return ignoredTags.includes(element.tagName);
  }
  
  /**
   * Destroy and cleanup
   */
  destroy() {
    this.isActive = false;
    this.removeHighlight();
    this.removeEventListeners();
    
    // Remove highlight class from document
    document.querySelectorAll('.sn-element-highlight').forEach(el => {
      el.classList.remove('sn-element-highlight');
    });
    
    // Remove element
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
