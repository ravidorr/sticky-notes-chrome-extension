/**
 * UI Manager
 * Handles UI state, selection mode, notifications, and DOM management
 */

import { SelectionOverlay } from '../components/SelectionOverlay.js';
import { getShadowStyles, injectMainDocumentStyles } from './styles.js';
import { contentLogger as log } from '../../shared/logger.js';
import { t } from '../../shared/i18n.js';
import { escapeHtml } from '../../shared/utils.js';

/**
 * Manages UI state and DOM operations
 */
export class UIManager {
  /**
   * Create a UIManager instance
   * @param {Object} options - Configuration options
   * @param {Function} options.onElementSelect - Callback when element is selected
   */
  constructor(options) {
    this.onElementSelect = options.onElementSelect;
    
    this.shadowRoot = null;
    this.container = null;
    this.selectionOverlay = null;
    this.isSelectionMode = false;
    this.pendingReanchor = null;
    this.reanchorTooltip = null;
  }
  
  /**
   * Create shadow DOM container for style isolation
   * @returns {Object} { shadowRoot, container }
   */
  createShadowContainer() {
    // Create host element
    const host = document.createElement('div');
    host.id = 'sticky-notes-extension-root';
    host.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 2147483647;
      pointer-events: none;
    `;
    
    // Create shadow root
    this.shadowRoot = host.attachShadow({ mode: 'closed' });
    
    // Inject styles into shadow DOM
    const style = document.createElement('style');
    style.textContent = getShadowStyles();
    this.shadowRoot.appendChild(style);
    
    // Inject selection styles into main document
    injectMainDocumentStyles();
    
    // Create container for notes
    this.container = document.createElement('div');
    this.container.id = 'sticky-notes-container';
    this.container.style.cssText = 'pointer-events: auto;';
    this.shadowRoot.appendChild(this.container);
    
    // Append to document
    document.body.appendChild(host);
    
    return { shadowRoot: this.shadowRoot, container: this.container };
  }
  
  /**
   * Enable element selection mode
   */
  enableSelectionMode() {
    log.debug(' enableSelectionMode() called, current state:', this.isSelectionMode);
    
    if (this.isSelectionMode) {
      log.debug(' Already in selection mode, skipping');
      return;
    }
    
    this.isSelectionMode = true;
    log.debug(' Set isSelectionMode to true');
    
    // Add selection mode class to document
    log.debug(' Adding sn-selection-mode class to body');
    document.body.classList.add('sn-selection-mode');
    
    // Create selection overlay
    log.debug(' Creating SelectionOverlay...');
    this.selectionOverlay = new SelectionOverlay({
      onSelect: (element) => this.handleElementSelect(element),
      onCancel: () => this.disableSelectionMode()
    });
    
    log.debug(' Appending overlay to container');
    this.container.appendChild(this.selectionOverlay.element);
    log.debug('Selection mode fully enabled - click an element to add a note');
  }
  
  /**
   * Disable element selection mode
   */
  disableSelectionMode() {
    if (!this.isSelectionMode) return;
    
    this.isSelectionMode = false;
    
    // Remove selection mode class
    document.body.classList.remove('sn-selection-mode');
    
    // Remove selection overlay
    if (this.selectionOverlay) {
      this.selectionOverlay.destroy();
      this.selectionOverlay = null;
    }
  }
  
  /**
   * Handle element selection
   * @param {Element} element - Selected element
   */
  async handleElementSelect(element) {
    // Disable selection mode
    this.disableSelectionMode();
    
    // Remove reanchor tooltip if present
    if (this.reanchorTooltip && this.reanchorTooltip.parentNode === this.container) {
      this.container.removeChild(this.reanchorTooltip);
      this.reanchorTooltip = null;
    }
    
    // Call the callback with pending reanchor data
    const pendingReanchor = this.pendingReanchor;
    this.pendingReanchor = null;
    
    await this.onElementSelect(element, pendingReanchor);
  }
  
  /**
   * Show re-anchor UI when element is not found
   * @param {Object} noteData - Note data
   */
  showReanchorUI(noteData) {
    // Create floating notification
    const notification = document.createElement('div');
    notification.className = 'sn-reanchor-notification';
    notification.dataset.noteId = noteData.id;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border-radius: 12px;
      padding: 16px;
      width: 300px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      border-left: 4px solid #f59e0b;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; width: 32px; height: 32px; background: #fef3c7; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${t('noteAnchorNotFound')}</div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            "${escapeHtml((noteData.content || '').substring(0, 50))}${noteData.content?.length > 50 ? '...' : ''}"
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="sn-reanchor-btn" style="flex: 1; padding: 8px 12px; background: #facc15; color: #713f12; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
              ${t('reanchor')}
            </button>
            <button class="sn-dismiss-btn" style="padding: 8px 12px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">
              ${t('dismiss')}
            </button>
          </div>
        </div>
      </div>
    `;
    
    this.container.appendChild(notification);
    
    // Handle re-anchor button
    notification.querySelector('.sn-reanchor-btn').addEventListener('click', () => {
      this.container.removeChild(notification);
      this.startReanchorMode(noteData);
    });
    
    // Handle dismiss button
    notification.querySelector('.sn-dismiss-btn').addEventListener('click', () => {
      this.container.removeChild(notification);
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (notification.parentNode === this.container) {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode === this.container) {
            this.container.removeChild(notification);
          }
        }, 300);
      }
    }, 10000);
  }
  
  /**
   * Start re-anchor mode to select a new element
   * @param {Object} noteData - Note data to re-anchor
   */
  startReanchorMode(noteData) {
    this.pendingReanchor = noteData;
    this.enableSelectionMode();
    
    // Show instruction tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'sn-reanchor-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #1f2937;
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      text-align: center;
      box-shadow: 0 20px 25px rgba(0, 0, 0, 0.2);
    `;
    tooltip.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">${t('selectNewAnchor')}</div>
      <div style="opacity: 0.8;">${t('selectNewAnchorHint')}</div>
      <div style="margin-top: 12px; font-size: 12px; opacity: 0.6;">${t('pressEscToCancel')}</div>
    `;
    
    this.container.appendChild(tooltip);
    this.reanchorTooltip = tooltip;
    
    // Remove tooltip after a few seconds
    setTimeout(() => {
      if (tooltip.parentNode === this.container) {
        tooltip.style.opacity = '0';
        tooltip.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
          if (tooltip.parentNode === this.container) {
            this.container.removeChild(tooltip);
          }
        }, 500);
      }
    }, 3000);
  }
  
  /**
   * Show notification to refresh the page
   */
  showRefreshNotification() {
    // Create notification in main document (shadow DOM might be broken too)
    const notificationId = 'sticky-notes-refresh-notification';
    
    // Don't show twice
    if (document.getElementById(notificationId)) return;
    
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border-radius: 12px;
      padding: 16px;
      width: 320px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      border-left: 4px solid #3b82f6;
      animation: sn-slide-in 0.3s ease;
    `;
    
    notification.innerHTML = `
      <style>
        @keyframes sn-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; width: 36px; height: 36px; background: #dbeafe; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 2v6h-6"/>
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
            <path d="M3 22v-6h6"/>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; font-size: 14px;">
            ${t('extensionUpdated')}
          </div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px; line-height: 1.4;">
            ${t('extensionUpdatedDescription')}
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="sn-refresh-btn" style="flex: 1; padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s;">
              ${t('refreshPage')}
            </button>
            <button id="sn-dismiss-refresh-btn" style="padding: 10px 12px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; transition: background 0.15s;">
              ${t('dismiss')}
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Handle refresh button
    document.getElementById('sn-refresh-btn').addEventListener('click', () => {
      window.location.reload();
    });
    
    // Handle dismiss button
    document.getElementById('sn-dismiss-refresh-btn').addEventListener('click', () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      notification.style.transition = 'all 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    });
    
    // Add hover effects
    const refreshBtn = document.getElementById('sn-refresh-btn');
    refreshBtn.addEventListener('mouseenter', () => refreshBtn.style.background = '#2563eb');
    refreshBtn.addEventListener('mouseleave', () => refreshBtn.style.background = '#3b82f6');
    
    const dismissBtn = document.getElementById('sn-dismiss-refresh-btn');
    dismissBtn.addEventListener('mouseenter', () => dismissBtn.style.background = '#e5e7eb');
    dismissBtn.addEventListener('mouseleave', () => dismissBtn.style.background = '#f3f4f6');
  }
  
  /**
   * Setup mutation observer for dynamic content
   * @param {Map} notes - Notes map
   * @param {Object} visibilityManager - Visibility manager
   */
  setupMutationObserver(notes, visibilityManager) {
    const observer = new MutationObserver((_mutations) => {
      // Check if any anchor elements were removed
      notes.forEach((note, _id) => {
        if (!document.contains(note.anchor)) {
          // Anchor element was removed, try to find it again
          const newAnchor = document.querySelector(note.selector);
          if (newAnchor) {
            note.updateAnchor(newAnchor);
            visibilityManager.unobserve(note.anchor);
            visibilityManager.observe(newAnchor, note);
          }
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}
