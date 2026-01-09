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
    /* Sticky note container */
    .sn-note {
      position: absolute;
      z-index: 2147483647;
      width: 280px;
      min-height: 120px;
      background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
      border-radius: 4px;
      box-shadow: 
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 2px 4px -1px rgba(0, 0, 0, 0.06),
        0 0 0 1px rgba(0, 0, 0, 0.05);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 14px;
      transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
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
