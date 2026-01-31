/**
 * Confirm Dialog Component
 * Custom styled confirmation dialog for destructive actions
 */

import { t } from '../../shared/i18n.js';

/**
 * Custom confirmation dialog that matches the extension's styling
 */
export class ConfirmDialog {
  /**
   * Show a confirmation dialog
   * @param {Object} options - Dialog options
   * @param {string} options.message - Message to display
   * @param {string} [options.confirmText] - Confirm button text (default: 'Delete')
   * @param {string} [options.cancelText] - Cancel button text (default: 'Cancel')
   * @param {boolean} [options.danger] - If true, styles confirm button as destructive
   * @param {ShadowRoot} options.shadowRoot - Shadow root to render in
   * @param {number} [options.zIndex] - Z-index for the dialog (default: very high)
   * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled
   */
  static show({ message, confirmText, cancelText, danger = true, shadowRoot, zIndex }) {
    return new Promise((resolve) => {
      // Create backdrop with z-index higher than any note
      const backdrop = document.createElement('div');
      backdrop.className = 'sn-confirm-backdrop';
      // Use provided z-index or default to very high value
      backdrop.style.zIndex = zIndex || 2147483647;
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'sn-confirm-dialog';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'sn-confirm-message');
      
      // Create message (using DOM methods for safety)
      const messageEl = document.createElement('div');
      messageEl.className = 'sn-confirm-message';
      messageEl.id = 'sn-confirm-message';
      messageEl.textContent = message;
      
      // Create actions container
      const actionsEl = document.createElement('div');
      actionsEl.className = 'sn-confirm-actions';
      
      // Create cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'sn-confirm-btn sn-confirm-cancel';
      cancelBtn.type = 'button';
      cancelBtn.textContent = cancelText || t('cancel');
      
      // Create confirm button
      const confirmBtn = document.createElement('button');
      confirmBtn.className = `sn-confirm-btn sn-confirm-ok${danger ? ' sn-confirm-danger' : ''}`;
      confirmBtn.type = 'button';
      confirmBtn.textContent = confirmText || t('delete');
      
      // Assemble dialog
      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(confirmBtn);
      dialog.appendChild(messageEl);
      dialog.appendChild(actionsEl);
      backdrop.appendChild(dialog);
      shadowRoot.appendChild(backdrop);
      
      // Focus confirm button
      confirmBtn.focus();
      
      // Cleanup function with guard to prevent multiple calls
      let cleanupCalled = false;
      const cleanup = (result) => {
        if (cleanupCalled) return;
        cleanupCalled = true;
        
        backdrop.classList.add('sn-confirm-closing');
        const handleAnimationEnd = () => {
          backdrop.remove();
          resolve(result);
        };
        backdrop.addEventListener('animationend', handleAnimationEnd, { once: true });
        // Fallback in case animation doesn't fire (e.g., in tests)
        setTimeout(handleAnimationEnd, 200);
      };
      
      // Event handlers - use mouseup instead of click for more reliable capture
      // Also stop propagation to prevent document-level handlers from interfering
      const handleButtonMouseDown = (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
      };
      
      confirmBtn.addEventListener('mousedown', handleButtonMouseDown);
      cancelBtn.addEventListener('mousedown', handleButtonMouseDown);
      
      confirmBtn.addEventListener('mouseup', (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
        cleanup(true);
      });
      cancelBtn.addEventListener('mouseup', (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
        cleanup(false);
      });
      
      // Also keep click handlers as backup
      confirmBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
        cleanup(true);
      });
      cancelBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
        cleanup(false);
      });
      
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) cleanup(false);
      });
      
      // Keyboard handling
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cleanup(false);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          cleanup(true);
        } else if (event.key === 'Tab') {
          // Trap focus within dialog
          const focusableElements = [cancelBtn, confirmBtn];
          const firstEl = focusableElements[0];
          const lastEl = focusableElements[focusableElements.length - 1];
          
          if (event.shiftKey && document.activeElement === firstEl) {
            event.preventDefault();
            lastEl.focus();
          } else if (!event.shiftKey && document.activeElement === lastEl) {
            event.preventDefault();
            firstEl.focus();
          }
        }
      });
    });
  }
  
  /**
   * Get CSS styles for the confirm dialog
   * @returns {string} CSS styles
   */
  static getStyles() {
    return `
      /* Confirm dialog backdrop */
      /* Note: z-index is set dynamically via inline style to be above all notes */
      .sn-confirm-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--sn-color-backdrop, rgba(0, 0, 0, 0.4));
        backdrop-filter: blur(2px);
        animation: sn-fade-in 0.15s ease;
      }
      
      .sn-confirm-backdrop.sn-confirm-closing {
        animation: sn-fade-out 0.15s ease forwards;
      }
      
      /* Confirm dialog box - uses yellow sticky note theme */
      .sn-confirm-dialog {
        background: var(--sn-color-bg-yellow, linear-gradient(135deg, #fef9c3 0%, #fef08a 100%));
        border-radius: var(--sn-radius-lg, 8px);
        padding: 20px;
        min-width: 280px;
        max-width: 360px;
        box-shadow: var(--sn-shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
        font-family: var(--sn-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        animation: sn-scale-in 0.15s ease;
        pointer-events: auto;
        position: relative;
      }
      
      .sn-confirm-closing .sn-confirm-dialog {
        animation: sn-scale-out 0.15s ease forwards;
      }
      
      /* Message text */
      .sn-confirm-message {
        font-size: 14px;
        font-weight: 500;
        color: var(--sn-color-text-dark, #713f12);
        text-align: center;
        margin-bottom: 20px;
        line-height: 1.5;
      }
      
      /* Button row */
      .sn-confirm-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      
      /* Buttons - extend base .sn-btn styles */
      .sn-confirm-btn {
        padding: 8px 16px;
        border: none;
        border-radius: var(--sn-radius-md, 6px);
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        min-width: 80px;
        pointer-events: auto;
        position: relative;
      }
      
      .sn-confirm-btn:focus {
        outline: 2px solid var(--sn-color-primary, #facc15);
        outline-offset: 2px;
      }
      
      .sn-confirm-cancel {
        background: rgba(255, 255, 255, 0.6);
        color: var(--sn-color-text-dark, #713f12);
      }
      
      .sn-confirm-cancel:hover {
        background: rgba(255, 255, 255, 0.9);
      }
      
      .sn-confirm-ok {
        background: var(--sn-color-primary, #facc15);
        color: var(--sn-color-text-dark, #713f12);
      }
      
      .sn-confirm-ok:hover {
        background: var(--sn-color-primary-dark, #eab308);
      }
      
      .sn-confirm-danger {
        background: var(--sn-color-error, #ef4444);
        color: white;
      }
      
      .sn-confirm-danger:hover {
        background: var(--sn-color-error-dark, #dc2626);
      }
      
      .sn-confirm-danger:focus {
        outline-color: var(--sn-color-error, #ef4444);
      }
      
      /* Reduced motion preference */
      @media (prefers-reduced-motion: reduce) {
        .sn-confirm-backdrop,
        .sn-confirm-dialog,
        .sn-confirm-btn {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
  }
}
