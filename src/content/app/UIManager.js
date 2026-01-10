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
    // Remove existing banner
    const existing = this.container.querySelector('.sn-banner');
    if (existing) {
      existing.remove();
    }
    
    // Create banner notification using CSS classes
    const banner = document.createElement('div');
    banner.className = 'sn-banner sn-banner-warning';
    banner.dataset.noteId = noteData.id;
    
    const contentPreview = (noteData.content || '').substring(0, 50);
    const ellipsis = noteData.content?.length > 50 ? '...' : '';
    
    banner.innerHTML = `
      <div class="sn-banner-content">
        <div class="sn-banner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div class="sn-banner-body">
          <div class="sn-banner-title">${t('noteAnchorNotFound')}</div>
          <div class="sn-banner-message">"${escapeHtml(contentPreview)}${ellipsis}"</div>
          <div class="sn-banner-actions"></div>
        </div>
      </div>
    `;
    
    // Add action buttons
    const actionsContainer = banner.querySelector('.sn-banner-actions');
    
    const reanchorBtn = document.createElement('button');
    reanchorBtn.className = 'sn-btn sn-btn-primary sn-btn-sm';
    reanchorBtn.textContent = t('reanchor');
    reanchorBtn.style.flex = '1';
    
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'sn-btn sn-btn-secondary sn-btn-sm';
    dismissBtn.textContent = t('dismiss');
    
    actionsContainer.appendChild(reanchorBtn);
    actionsContainer.appendChild(dismissBtn);
    
    this.container.appendChild(banner);
    
    // Handle re-anchor button
    reanchorBtn.addEventListener('click', () => {
      this.dismissBanner(banner);
      this.startReanchorMode(noteData);
    });
    
    // Handle dismiss button
    dismissBtn.addEventListener('click', () => {
      this.dismissBanner(banner);
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      this.dismissBanner(banner);
    }, 10000);
  }
  
  /**
   * Dismiss a banner with animation
   * @param {HTMLElement} banner - Banner to dismiss
   */
  dismissBanner(banner) {
    if (!banner || banner.parentNode !== this.container) return;
    
    banner.classList.add('sn-banner-hiding');
    setTimeout(() => {
      if (banner.parentNode === this.container) {
        this.container.removeChild(banner);
      }
    }, 300);
  }
  
  /**
   * Start re-anchor mode to select a new element
   * @param {Object} noteData - Note data to re-anchor
   */
  startReanchorMode(noteData) {
    this.pendingReanchor = noteData;
    this.enableSelectionMode();
    
    // Remove existing tooltip
    const existingTooltip = this.container.querySelector('.sn-instruction-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }
    
    // Show instruction tooltip using CSS classes
    const tooltip = document.createElement('div');
    tooltip.className = 'sn-instruction-tooltip';
    tooltip.innerHTML = `
      <div class="sn-instruction-tooltip-title">${t('selectNewAnchor')}</div>
      <div class="sn-instruction-tooltip-hint">${t('selectNewAnchorHint')}</div>
      <div class="sn-instruction-tooltip-escape">${t('pressEscToCancel')}</div>
    `;
    
    this.container.appendChild(tooltip);
    this.reanchorTooltip = tooltip;
    
    // Remove tooltip after a few seconds with fade
    setTimeout(() => {
      if (tooltip.parentNode === this.container) {
        tooltip.classList.add('sn-instruction-tooltip-hiding');
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
