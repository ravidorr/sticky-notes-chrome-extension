/**
 * CSS Styles for Content Script
 * Contains all shadow DOM styles for sticky notes
 */

import { RichEditor } from '../components/RichEditor.js';
import { CommentSection } from '../components/CommentSection.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

/**
 * Get CSS styles for shadow DOM
 * @returns {string} CSS styles
 */
export function getShadowStyles() {
  return `
    /* ==========================================
       CSS Variables - Unified Design System
       ========================================== */
    :host {
      --sn-color-success: #22c55e;
      --sn-color-success-dark: #16a34a;
      --sn-color-error: #ef4444;
      --sn-color-error-dark: #dc2626;
      --sn-color-warning: #f59e0b;
      --sn-color-warning-dark: #d97706;
      --sn-color-primary: #facc15;
      --sn-color-primary-dark: #eab308;
      --sn-color-text-dark: #713f12;
      --sn-color-text-body: #1f2937;
      --sn-color-text-muted: #6b7280;
      --sn-color-text-light: #9ca3af;
      --sn-color-bg-yellow: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
      --sn-color-bg-yellow-header: linear-gradient(135deg, #facc15 0%, #eab308 100%);
      --sn-color-bg-white: #ffffff;
      --sn-color-bg-gray: #f3f4f6;
      --sn-color-border: #d1d5db;
      --sn-color-backdrop: rgba(0, 0, 0, 0.5);
      --sn-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
      --sn-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --sn-shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.15);
      --sn-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      --sn-radius-sm: 4px;
      --sn-radius-md: 6px;
      --sn-radius-lg: 8px;
      --sn-radius-xl: 12px;
      --sn-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      --sn-z-max: 2147483647;
    }

    /* ==========================================
       Unified Button Styles
       ========================================== */
    .sn-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      border: none;
      border-radius: var(--sn-radius-md);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--sn-font-family);
      cursor: pointer;
      transition: all 0.15s ease;
      min-width: 80px;
    }

    .sn-btn:focus {
      outline: 2px solid var(--sn-color-primary);
      outline-offset: 2px;
    }

    .sn-btn-primary {
      background: var(--sn-color-primary);
      color: var(--sn-color-text-dark);
    }

    .sn-btn-primary:hover {
      background: var(--sn-color-primary-dark);
    }

    .sn-btn-secondary {
      background: var(--sn-color-bg-gray);
      color: var(--sn-color-text-muted);
    }

    .sn-btn-secondary:hover {
      background: #e5e7eb;
    }

    .sn-btn-danger {
      background: var(--sn-color-error);
      color: white;
    }

    .sn-btn-danger:hover {
      background: var(--sn-color-error-dark);
    }

    .sn-btn-danger:focus {
      outline-color: var(--sn-color-error);
    }

    .sn-btn-sm {
      padding: 6px 12px;
      font-size: 12px;
      min-width: auto;
    }

    /* ==========================================
       Toast Notifications
       ========================================== */
    .sn-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: var(--sn-radius-lg);
      font-size: 14px;
      font-family: var(--sn-font-family);
      font-weight: 500;
      color: white;
      box-shadow: var(--sn-shadow-lg);
      z-index: var(--sn-z-max);
      animation: sn-toast-slide-in 0.3s ease;
      max-width: 320px;
    }

    .sn-toast-success {
      background: var(--sn-color-success);
    }

    .sn-toast-error {
      background: var(--sn-color-error);
    }

    .sn-toast-warning {
      background: var(--sn-color-warning);
      color: var(--sn-color-text-dark);
    }

    .sn-toast-hiding {
      animation: sn-toast-fade-out 0.3s ease forwards;
    }

    @keyframes sn-toast-slide-in {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes sn-toast-fade-out {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    /* ==========================================
       Modal Overlay & Content
       ========================================== */
    .sn-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--sn-color-backdrop);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--sn-z-max);
      animation: sn-fade-in 0.15s ease;
    }

    .sn-modal-overlay.sn-closing {
      animation: sn-fade-out 0.15s ease forwards;
    }

    .sn-modal {
      background: var(--sn-color-bg-white);
      border-radius: var(--sn-radius-xl);
      padding: 24px;
      min-width: 280px;
      max-width: 360px;
      box-shadow: var(--sn-shadow-xl);
      font-family: var(--sn-font-family);
      animation: sn-scale-in 0.15s ease;
    }

    .sn-modal-overlay.sn-closing .sn-modal {
      animation: sn-scale-out 0.15s ease forwards;
    }

    .sn-modal-yellow {
      background: var(--sn-color-bg-yellow);
    }

    .sn-modal-title {
      margin: 0 0 16px;
      font-size: 18px;
      font-weight: 600;
      color: var(--sn-color-text-body);
    }

    .sn-modal-yellow .sn-modal-title {
      color: var(--sn-color-text-dark);
    }

    .sn-modal-message {
      font-size: 14px;
      color: var(--sn-color-text-muted);
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .sn-modal-yellow .sn-modal-message {
      color: var(--sn-color-text-dark);
      text-align: center;
      font-weight: 500;
    }

    .sn-modal-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }

    .sn-modal-yellow .sn-modal-actions {
      justify-content: center;
    }

    .sn-modal-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--sn-color-border);
      border-radius: var(--sn-radius-lg);
      font-size: 14px;
      font-family: var(--sn-font-family);
      margin-bottom: 16px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .sn-modal-input:focus {
      border-color: var(--sn-color-primary);
    }

    /* ==========================================
       Banner Notifications (Actionable)
       ========================================== */
    .sn-banner {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--sn-color-bg-white);
      border-radius: var(--sn-radius-xl);
      padding: 16px;
      width: 300px;
      box-shadow: var(--sn-shadow-lg);
      font-family: var(--sn-font-family);
      z-index: var(--sn-z-max);
      animation: sn-toast-slide-in 0.3s ease;
    }

    .sn-banner-warning {
      border-left: 4px solid var(--sn-color-warning);
    }

    .sn-banner-hiding {
      animation: sn-toast-fade-out 0.3s ease forwards;
    }

    .sn-banner-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .sn-banner-icon {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      background: #fef3c7;
      border-radius: var(--sn-radius-lg);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sn-banner-icon svg {
      width: 18px;
      height: 18px;
      stroke: var(--sn-color-warning);
    }

    .sn-banner-body {
      flex: 1;
      min-width: 0;
    }

    .sn-banner-title {
      font-weight: 600;
      color: var(--sn-color-text-body);
      margin-bottom: 4px;
    }

    .sn-banner-message {
      font-size: 13px;
      color: var(--sn-color-text-muted);
      margin-bottom: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sn-banner-actions {
      display: flex;
      gap: 8px;
    }

    /* ==========================================
       Inline Input Popup (e.g., Link Input)
       ========================================== */
    .sn-inline-popup {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--sn-color-bg-white);
      border: 1px solid var(--sn-color-border);
      border-radius: var(--sn-radius-md);
      padding: 8px;
      box-shadow: var(--sn-shadow-md);
      z-index: 100;
      display: flex;
      gap: 6px;
      animation: sn-fade-in 0.15s ease;
    }

    .sn-inline-popup-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--sn-color-border);
      border-radius: var(--sn-radius-sm);
      font-size: 13px;
      font-family: var(--sn-font-family);
      outline: none;
    }

    .sn-inline-popup-input:focus {
      border-color: var(--sn-color-primary);
    }

    /* ==========================================
       Instruction Tooltip (Center Screen)
       ========================================== */
    .sn-instruction-tooltip {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--sn-color-text-body);
      color: white;
      padding: 16px 24px;
      border-radius: var(--sn-radius-xl);
      font-size: 14px;
      font-family: var(--sn-font-family);
      z-index: var(--sn-z-max);
      text-align: center;
      box-shadow: var(--sn-shadow-xl);
      animation: sn-scale-in 0.15s ease;
    }

    .sn-instruction-tooltip-title {
      font-weight: 600;
      margin-bottom: 8px;
    }

    .sn-instruction-tooltip-hint {
      opacity: 0.8;
    }

    .sn-instruction-tooltip-escape {
      margin-top: 12px;
      font-size: 12px;
      opacity: 0.6;
    }

    .sn-instruction-tooltip-hiding {
      animation: sn-fade-out 0.5s ease forwards;
    }

    /* ==========================================
       Shared Animations
       ========================================== */
    @keyframes sn-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes sn-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    @keyframes sn-scale-in {
      from { 
        opacity: 0;
        transform: scale(0.95);
      }
      to { 
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes sn-scale-out {
      from { 
        opacity: 1;
        transform: scale(1);
      }
      to { 
        opacity: 0;
        transform: scale(0.95);
      }
    }

    /* ==========================================
       Sticky Note Container
       ========================================== */
    /* Sticky note container */
    /* Note: z-index is set dynamically via inline style for bring-to-front functionality */
    .sn-note {
      position: absolute;
      width: 280px;
      max-width: 280px;
      min-height: 120px;
      background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
      border-radius: 4px;
      box-shadow: 
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 2px 4px -1px rgba(0, 0, 0, 0.06),
        0 0 0 1px rgba(0, 0, 0, 0.05);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 14px;
      transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out, max-width 0.3s ease-in-out, width 0.3s ease-in-out;
      pointer-events: auto;
    }

    .sn-note.sn-hidden {
      opacity: 0;
      pointer-events: none;
      transform: scale(0.95);
    }

    .sn-note.sn-visible {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1);
    }

    /* Note header */
    .sn-note-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: linear-gradient(135deg, #facc15 0%, #eab308 100%);
      border-radius: 4px 4px 0 0;
      cursor: move;
      user-select: none;
      gap: 8px;
    }
    
    .sn-note-header > .sn-minimize-btn {
      flex-shrink: 0;
    }

    .sn-note-header-title {
      font-size: 12px;
      font-weight: 600;
      color: #713f12;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .sn-note-header-actions {
      display: flex;
      gap: 4px;
    }

    .sn-note-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.3);
      color: #713f12;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .sn-note-btn:hover {
      background: rgba(255, 255, 255, 0.5);
    }

    .sn-note-btn svg {
      width: 14px;
      height: 14px;
    }

    /* Note content */
    .sn-note-content {
      padding: 12px;
    }

    .sn-note-textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px;
      border: none;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.5);
      color: #1f2937;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
      resize: vertical;
      outline: none;
      transition: background 0.15s ease;
      box-sizing: border-box;
    }

    .sn-note-textarea:focus {
      background: rgba(255, 255, 255, 0.8);
    }

    .sn-note-textarea::placeholder {
      color: #9ca3af;
    }

    /* Selection overlay */
    .sn-selection-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2147483646;
      pointer-events: none;
    }

    .sn-selection-tooltip {
      position: fixed;
      padding: 8px 12px;
      background: #1f2937;
      color: white;
      font-size: 12px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      pointer-events: none;
      z-index: 2147483647;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* Color themes */
    .sn-note.sn-theme-yellow {
      background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
    }
    .sn-note.sn-theme-yellow .sn-note-header {
      background: linear-gradient(135deg, #facc15 0%, #eab308 100%);
    }

    .sn-note.sn-theme-blue {
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    }
    .sn-note.sn-theme-blue .sn-note-header {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }
    .sn-note.sn-theme-blue .sn-note-header-title,
    .sn-note.sn-theme-blue .sn-note-btn {
      color: white;
    }

    .sn-note.sn-theme-green {
      background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    }
    .sn-note.sn-theme-green .sn-note-header {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    }
    .sn-note.sn-theme-green .sn-note-header-title,
    .sn-note.sn-theme-green .sn-note-btn {
      color: white;
    }

    .sn-note.sn-theme-pink {
      background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%);
    }
    .sn-note.sn-theme-pink .sn-note-header {
      background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
    }
    .sn-note.sn-theme-pink .sn-note-header-title,
    .sn-note.sn-theme-pink .sn-note-btn {
      color: white;
    }
    
    /* Note footer / metadata */
    .sn-note-footer {
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      padding: 0;
      font-size: 11px;
    }
    
    .sn-metadata-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: #6b7280;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      text-align: left;
      transition: background 0.15s ease;
    }
    
    .sn-metadata-toggle:hover {
      background: rgba(0, 0, 0, 0.05);
    }
    
    .sn-metadata-chevron {
      width: 12px;
      height: 12px;
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }
    
    .sn-metadata-time {
      flex: 1;
    }
    
    .sn-metadata-panel {
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.03);
      border-top: 1px solid rgba(0, 0, 0, 0.05);
    }
    
    .sn-metadata-panel.sn-hidden {
      display: none;
    }
    
    .sn-metadata-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 3px 0;
      gap: 8px;
    }
    
    .sn-metadata-label {
      color: #9ca3af;
      font-weight: 500;
      flex-shrink: 0;
    }
    
    .sn-metadata-value {
      color: #4b5563;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 180px;
    }
    
    .sn-metadata-url,
    .sn-metadata-selector {
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 10px;
    }
    
    .sn-metadata-copy-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      padding: 0;
      border: none;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s ease, color 0.15s ease;
    }
    
    .sn-metadata-row:hover .sn-metadata-copy-btn {
      opacity: 1;
    }
    
    .sn-metadata-copy-btn:hover {
      color: #4b5563;
    }
    
    .sn-metadata-copy-btn svg {
      width: 12px;
      height: 12px;
    }
    
    /* ==========================================
       Environment Badge & Dropdown
       ========================================== */
    .sn-metadata-environment-row {
      align-items: center;
    }
    
    .sn-environment-selector {
      position: relative;
      display: inline-block;
    }
    
    .sn-environment-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: none;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      cursor: pointer;
      transition: filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
    }
    
    .sn-environment-badge:hover {
      filter: brightness(0.92);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
    }
    
    .sn-environment-badge:active {
      transform: translateY(0) scale(0.98);
      box-shadow: none;
    }
    
    .sn-environment-badge:focus {
      outline: 2px solid var(--sn-color-primary);
      outline-offset: 2px;
    }
    
    .sn-environment-badge:focus:not(:focus-visible) {
      outline: none;
    }
    
    .sn-env-chevron {
      width: 10px;
      height: 10px;
      transition: transform 0.2s ease;
    }
    
    .sn-env-icon {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }
    
    /* Environment colors - WCAG AA compliant contrast ratios */
    .sn-env-local {
      background: #e5e7eb;
      color: #1f2937; /* Darker gray for 7:1+ contrast */
    }
    
    .sn-env-development {
      background: #dbeafe;
      color: #1e40af; /* 4.5:1+ contrast */
    }
    
    .sn-env-staging {
      background: #fef3c7;
      color: #78350f; /* Darker amber for 4.5:1+ contrast */
    }
    
    .sn-env-production {
      background: #fee2e2;
      color: #991b1b; /* 4.5:1+ contrast */
    }
    
    /* Environment dropdown */
    .sn-environment-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: white;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 4px;
      z-index: 100;
      min-width: 120px;
      animation: sn-fade-in 0.15s ease;
    }
    
    .sn-environment-dropdown.sn-hidden {
      display: none;
    }
    
    .sn-env-option {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 44px; /* WCAG touch target minimum */
      padding: 12px 14px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition: filter 0.1s ease, outline 0.1s ease, transform 0.1s ease;
    }
    
    .sn-env-option:hover {
      filter: brightness(0.95);
      transform: translateX(2px);
    }
    
    .sn-env-option:focus {
      outline: 2px solid var(--sn-color-primary);
      outline-offset: -2px;
    }
    
    .sn-env-option:focus:not(:focus-visible) {
      outline: none;
    }
    
    .sn-env-option:focus-visible {
      outline: 2px solid var(--sn-color-primary);
      outline-offset: -2px;
    }
    
    .sn-env-option .sn-env-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    
    /* ==========================================
       Minimized State & Animation
       ========================================== */
    .sn-note.sn-minimized {
      min-height: auto;
      width: 40px;
      max-width: 40px;
    }
    
    .sn-note.sn-minimized .sn-note-header {
      border-radius: 4px;
      padding: 8px;
      justify-content: center;
      width: auto;
    }

    /* Hide header elements when minimized */
    .sn-note.sn-minimized .sn-note-header-title,
    .sn-note.sn-minimized .sn-note-header-actions {
      display: none;
    }
    
    /* Expandable sections with animation */
    .sn-note .sn-note-content,
    .sn-note .sn-comment-section,
    .sn-note .sn-note-footer {
      overflow: hidden;
      max-height: 1000px;
      max-width: 280px;
      opacity: 1;
      transform: translateY(0);
      transition: max-height 0.3s ease, max-width 0.3s ease, opacity 0.3s ease, transform 0.3s ease, padding 0.3s ease;
    }
    
    .sn-note.sn-minimized .sn-note-content,
    .sn-note.sn-minimized .sn-comment-section,
    .sn-note.sn-minimized .sn-note-footer {
      max-height: 0;
      max-width: 0;
      opacity: 0;
      transform: translateY(-10px);
      padding: 0;
      margin: 0;
    }
    
    ${RichEditor.getStyles()}
    
    ${CommentSection.getStyles()}
    
    ${ConfirmDialog.getStyles()}
  `;
}

/**
 * Get CSS styles for main document (selection mode)
 * @returns {string} CSS styles
 */
export function getMainDocumentStyles() {
  return `
    /* Selection mode cursor */
    .sn-selection-mode,
    .sn-selection-mode * {
      cursor: crosshair !important;
    }

    /* Element highlight on hover during selection */
    .sn-element-highlight {
      outline: 2px solid #3b82f6 !important;
      outline-offset: 2px !important;
      background-color: rgba(59, 130, 246, 0.1) !important;
      transition: outline 0.1s ease, background-color 0.1s ease !important;
    }
  `;
}

/**
 * Inject main document styles
 */
export function injectMainDocumentStyles() {
  const styleId = 'sticky-notes-main-styles';
  
  // Don't inject twice
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = getMainDocumentStyles();
  document.head.appendChild(style);
}
