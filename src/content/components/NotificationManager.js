/**
 * NotificationManager Component
 * Unified notification system for toasts, modals, and banners
 */

import { t } from '../../shared/i18n.js';

// Default timeouts
const TIMEOUTS = {
  TOAST: 3000,
  BANNER: 10000,
  TOOLTIP: 5000
};

/**
 * Centralized notification manager for consistent UI communication
 */
export class NotificationManager {
  /**
   * Create a NotificationManager
   * @param {ShadowRoot|Element} container - Container to render notifications in
   */
  constructor(container) {
    this.container = container;
  }

  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {string} type - 'success', 'error', or 'warning'
   * @param {number} duration - Auto-dismiss duration in ms (default: 3000)
   * @returns {HTMLElement} The toast element
   */
  showToast(message, type = 'success', duration = TIMEOUTS.TOAST) {
    // Remove any existing toast
    const existing = this.container.querySelector('.sn-toast');
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = `sn-toast sn-toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    this.container.appendChild(toast);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('sn-toast-hiding');
        setTimeout(() => {
          if (toast.parentNode === this.container) {
            this.container.removeChild(toast);
          }
        }, 300);
      }, duration);
    }

    return toast;
  }

  /**
   * Show a modal dialog
   * @param {Object} options - Modal options
   * @param {string} options.title - Modal title (optional)
   * @param {string} options.message - Modal message
   * @param {string} options.confirmText - Confirm button text
   * @param {string} options.cancelText - Cancel button text
   * @param {boolean} options.danger - Style confirm button as destructive
   * @param {boolean} options.yellowTheme - Use yellow sticky note theme
   * @param {string} options.inputPlaceholder - If provided, shows an input field
   * @param {string} options.inputValue - Default input value
   * @param {string} options.inputType - Input type (default: 'text')
   * @param {number} options.zIndex - Custom z-index (optional)
   * @returns {Promise<{confirmed: boolean, value?: string}>}
   */
  showModal(options) {
    return new Promise((resolve) => {
      const {
        title,
        message,
        confirmText = t('confirm'),
        cancelText = t('cancel'),
        danger = false,
        yellowTheme = false,
        inputPlaceholder,
        inputValue = '',
        inputType = 'text',
        zIndex
      } = options;

      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'sn-modal-overlay';
      if (zIndex) {
        overlay.style.zIndex = zIndex;
      }

      // Create modal
      const modal = document.createElement('div');
      modal.className = `sn-modal${yellowTheme ? ' sn-modal-yellow' : ''}`;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      // Build modal content
      if (title) {
        const titleEl = document.createElement('h3');
        titleEl.className = 'sn-modal-title';
        titleEl.textContent = title;
        modal.appendChild(titleEl);
      }

      if (message) {
        const messageEl = document.createElement('p');
        messageEl.className = 'sn-modal-message';
        messageEl.textContent = message;
        modal.appendChild(messageEl);
      }

      let inputEl = null;
      if (inputPlaceholder !== undefined) {
        inputEl = document.createElement('input');
        inputEl.className = 'sn-modal-input';
        inputEl.type = inputType;
        inputEl.placeholder = inputPlaceholder;
        inputEl.value = inputValue;
        modal.appendChild(inputEl);
      }

      // Actions
      const actionsEl = document.createElement('div');
      actionsEl.className = 'sn-modal-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'sn-btn sn-btn-secondary';
      cancelBtn.type = 'button';
      cancelBtn.textContent = cancelText;

      const confirmBtn = document.createElement('button');
      confirmBtn.className = `sn-btn ${danger ? 'sn-btn-danger' : 'sn-btn-primary'}`;
      confirmBtn.type = 'button';
      confirmBtn.textContent = confirmText;

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(confirmBtn);
      modal.appendChild(actionsEl);

      overlay.appendChild(modal);
      this.container.appendChild(overlay);

      // Focus
      if (inputEl) {
        inputEl.focus();
        if (inputValue) {
          inputEl.setSelectionRange(inputValue.length, inputValue.length);
        }
      } else {
        confirmBtn.focus();
      }

      // Cleanup function
      let cleanupCalled = false;
      const cleanup = (result) => {
        if (cleanupCalled) return;
        cleanupCalled = true;

        overlay.classList.add('sn-closing');
        const handleAnimationEnd = () => {
          overlay.remove();
          resolve(result);
        };
        overlay.addEventListener('animationend', handleAnimationEnd, { once: true });
        setTimeout(handleAnimationEnd, 200); // Fallback
      };

      // Event handlers
      confirmBtn.addEventListener('click', () => {
        cleanup({ confirmed: true, value: inputEl?.value });
      });

      cancelBtn.addEventListener('click', () => {
        cleanup({ confirmed: false });
      });

      // Keyboard handling
      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cleanup({ confirmed: false });
        } else if (event.key === 'Enter' && inputEl && event.target === inputEl) {
          // Use e.target instead of document.activeElement because in shadow DOM,
          // document.activeElement returns the shadow host, not the focused element
          event.preventDefault();
          cleanup({ confirmed: true, value: inputEl.value });
        }
      };
      overlay.addEventListener('keydown', handleKeydown);

      // Close on backdrop click
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          cleanup({ confirmed: false });
        }
      });
    });
  }

  /**
   * Show a banner notification with actions
   * @param {Object} options - Banner options
   * @param {string} options.title - Banner title
   * @param {string} options.message - Banner message
   * @param {string} options.type - 'warning', 'info' (default: 'warning')
   * @param {Array<{text: string, primary?: boolean, onClick: Function}>} options.actions - Action buttons
   * @param {number} options.duration - Auto-dismiss duration (0 for no auto-dismiss)
   * @returns {HTMLElement} The banner element
   */
  showBanner(options) {
    const {
      title,
      message,
      type = 'warning',
      actions = [],
      duration = TIMEOUTS.BANNER
    } = options;

    // Remove any existing banner with same title (prevent duplicates)
    const existing = this.container.querySelector('.sn-banner');
    if (existing) {
      existing.remove();
    }

    const banner = document.createElement('div');
    banner.className = `sn-banner sn-banner-${type}`;

    // Icon
    const iconSvg = type === 'warning' 
      ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`;

    banner.innerHTML = `
      <div class="sn-banner-content">
        <div class="sn-banner-icon">${iconSvg}</div>
        <div class="sn-banner-body">
          <div class="sn-banner-title">${this.escapeHtml(title)}</div>
          <div class="sn-banner-message">${this.escapeHtml(message)}</div>
          <div class="sn-banner-actions"></div>
        </div>
      </div>
    `;

    // Add action buttons
    const actionsContainer = banner.querySelector('.sn-banner-actions');
    actions.forEach((action) => {
      const btn = document.createElement('button');
      btn.className = `sn-btn sn-btn-sm ${action.primary ? 'sn-btn-primary' : 'sn-btn-secondary'}`;
      btn.textContent = action.text;
      btn.addEventListener('click', () => {
        action.onClick();
        this.dismissBanner(banner);
      });
      actionsContainer.appendChild(btn);
    });

    this.container.appendChild(banner);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.dismissBanner(banner);
      }, duration);
    }

    return banner;
  }

  /**
   * Dismiss a banner with animation
   * @param {HTMLElement} banner - Banner element to dismiss
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
   * Show an instruction tooltip (centered)
   * @param {Object} options - Tooltip options
   * @param {string} options.title - Main instruction
   * @param {string} options.hint - Secondary hint text
   * @param {string} options.escape - Escape key hint
   * @param {number} options.duration - Auto-hide duration (0 for manual)
   * @returns {HTMLElement} The tooltip element
   */
  showInstructionTooltip(options) {
    const {
      title,
      hint,
      escape,
      duration = TIMEOUTS.TOOLTIP
    } = options;

    // Remove existing tooltip
    const existing = this.container.querySelector('.sn-instruction-tooltip');
    if (existing) {
      existing.remove();
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'sn-instruction-tooltip';

    let html = '';
    if (title) {
      html += `<div class="sn-instruction-tooltip-title">${this.escapeHtml(title)}</div>`;
    }
    if (hint) {
      html += `<div class="sn-instruction-tooltip-hint">${this.escapeHtml(hint)}</div>`;
    }
    if (escape) {
      html += `<div class="sn-instruction-tooltip-escape">${this.escapeHtml(escape)}</div>`;
    }
    tooltip.innerHTML = html;

    this.container.appendChild(tooltip);

    // Auto-hide with fade
    if (duration > 0) {
      setTimeout(() => {
        tooltip.classList.add('sn-instruction-tooltip-hiding');
        setTimeout(() => {
          if (tooltip.parentNode === this.container) {
            this.container.removeChild(tooltip);
          }
        }, 500);
      }, duration);
    }

    return tooltip;
  }

  /**
   * Remove instruction tooltip
   */
  hideInstructionTooltip() {
    const tooltip = this.container.querySelector('.sn-instruction-tooltip');
    if (tooltip) {
      tooltip.classList.add('sn-instruction-tooltip-hiding');
      setTimeout(() => {
        if (tooltip.parentNode === this.container) {
          this.container.removeChild(tooltip);
        }
      }, 500);
    }
  }

  /**
   * Show an inline popup (e.g., for link input)
   * @param {Object} options - Popup options
   * @param {HTMLElement} options.anchor - Element to position relative to
   * @param {string} options.inputPlaceholder - Input placeholder
   * @param {string} options.inputValue - Default input value
   * @param {string} options.inputType - Input type
   * @param {string} options.confirmText - Confirm button text
   * @param {string} options.cancelText - Cancel button text
   * @param {Function} options.onConfirm - Callback with input value
   * @param {Function} options.onCancel - Cancel callback
   * @returns {HTMLElement} The popup element
   */
  showInlinePopup(options) {
    const {
      anchor,
      inputPlaceholder = '',
      inputValue = '',
      inputType = 'text',
      confirmText = t('add'),
      cancelText = t('cancel'),
      onConfirm,
      onCancel
    } = options;

    // Remove existing popup
    const existing = anchor.querySelector('.sn-inline-popup');
    if (existing) {
      existing.remove();
    }

    const popup = document.createElement('div');
    popup.className = 'sn-inline-popup';

    const input = document.createElement('input');
    input.className = 'sn-inline-popup-input';
    input.type = inputType;
    input.placeholder = inputPlaceholder;
    input.value = inputValue;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'sn-btn sn-btn-primary sn-btn-sm';
    confirmBtn.textContent = confirmText;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sn-btn sn-btn-secondary sn-btn-sm';
    cancelBtn.textContent = cancelText;

    popup.appendChild(input);
    popup.appendChild(confirmBtn);
    popup.appendChild(cancelBtn);

    // Position relative to anchor
    anchor.style.position = 'relative';
    anchor.appendChild(popup);

    // Focus and select
    input.focus();
    if (inputValue) {
      const selectStart = inputValue.indexOf('://') > -1 ? inputValue.indexOf('://') + 3 : 0;
      input.setSelectionRange(selectStart, selectStart);
    }

    // Cleanup
    const cleanup = () => {
      popup.remove();
    };

    // Event handlers
    confirmBtn.addEventListener('click', () => {
      if (onConfirm) onConfirm(input.value);
      cleanup();
    });

    cancelBtn.addEventListener('click', () => {
      if (onCancel) onCancel();
      cleanup();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (onConfirm) onConfirm(input.value);
        cleanup();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (onCancel) {
          onCancel();
        }
        cleanup();
      }
    });

    return popup;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
