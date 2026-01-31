/**
 * Report Modal Component
 * Modal for configuring report export options
 */

import { t } from '../shared/i18n.js';
import { REPORT_FORMATS, REPORT_SCOPES } from '../shared/reportGenerator.js';

/**
 * Create the report modal HTML
 * @returns {string} Modal HTML string
 */
export function createReportModalHTML() {
  return `
    <div id="reportModal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="reportModalTitle">
      <div class="modal-backdrop"></div>
      <div class="modal-content report-modal-content">
        <div class="modal-header">
          <h3 id="reportModalTitle" data-i18n="generateReport">Generate Report</h3>
          <button id="reportModalClose" class="icon-btn icon-btn-small" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <!-- Format Selection -->
          <div class="report-option-group">
            <label class="report-option-label" data-i18n="reportFormat">Format</label>
            <div class="report-format-options">
              <label class="report-format-option">
                <input type="radio" name="reportFormat" value="html" checked>
                <span class="report-format-card">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                  <span data-i18n="reportFormatHTML">HTML</span>
                </span>
              </label>
              <label class="report-format-option">
                <input type="radio" name="reportFormat" value="pdf">
                <span class="report-format-card">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M9 15h2v2H9z"/>
                  </svg>
                  <span data-i18n="reportFormatPDF">PDF</span>
                </span>
              </label>
              <label class="report-format-option">
                <input type="radio" name="reportFormat" value="markdown">
                <span class="report-format-card">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <span data-i18n="reportFormatMarkdown">Markdown</span>
                </span>
              </label>
            </div>
          </div>

          <!-- Scope Selection -->
          <div class="report-option-group">
            <label class="report-option-label" data-i18n="reportScope">Include</label>
            <div class="report-scope-options">
              <label class="report-scope-option">
                <input type="radio" name="reportScope" value="currentPage" checked>
                <span data-i18n="reportScopeCurrentPage">Notes from this page</span>
              </label>
              <label class="report-scope-option">
                <input type="radio" name="reportScope" value="allNotes">
                <span data-i18n="reportScopeAllNotes">All notes</span>
              </label>
              <label class="report-scope-option">
                <input type="radio" name="reportScope" value="selected">
                <span data-i18n="reportScopeSelected">Selected notes</span>
                <span id="selectedNotesCount" class="selected-count">(0)</span>
              </label>
              <label class="report-scope-option">
                <input type="radio" name="reportScope" value="dateRange">
                <span data-i18n="reportScopeDateRange">Notes within date range</span>
              </label>
            </div>

            <!-- Date Range Inputs (shown when dateRange scope is selected) -->
            <div id="dateRangeInputs" class="date-range-inputs hidden">
              <div class="date-input-group">
                <label for="reportDateStart" data-i18n="reportDateFrom">From</label>
                <input type="date" id="reportDateStart" class="date-input">
              </div>
              <div class="date-input-group">
                <label for="reportDateEnd" data-i18n="reportDateTo">To</label>
                <input type="date" id="reportDateEnd" class="date-input">
              </div>
            </div>
          </div>

          <!-- Content Options -->
          <div class="report-option-group">
            <label class="report-option-label" data-i18n="reportContent">Content</label>
            <div class="report-content-options">
              <label class="report-checkbox-option">
                <input type="checkbox" id="reportIncludeMetadata" checked>
                <span data-i18n="reportIncludeMetadata">Include metadata</span>
                <span class="option-hint" data-i18n="reportMetadataHint">(browser, viewport, environment)</span>
              </label>
              <label class="report-checkbox-option">
                <input type="checkbox" id="reportIncludeComments" checked>
                <span data-i18n="reportIncludeComments">Include comments</span>
              </label>
              <label class="report-checkbox-option">
                <input type="checkbox" id="reportIncludeScreenshots">
                <span data-i18n="reportIncludeScreenshots">Include screenshots</span>
                <span class="option-hint option-hint-disabled" data-i18n="reportScreenshotsHint">(if captured)</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="reportModalCancel" class="btn btn-secondary btn-small" data-i18n="cancel">Cancel</button>
          <button id="report-modal-generate" class="btn btn-primary btn-small">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span data-i18n="reportGenerate">Generate</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Report Modal Controller
 * Handles modal interactions and state
 */
export class ReportModalController {
  /**
   * Create a ReportModalController
   * @param {Object} options - Controller options
   * @param {Function} options.onGenerate - Callback when generate is clicked
   * @param {Function} options.getSelectedNoteIds - Function to get selected note IDs
   * @param {Object} deps - Dependencies for testing
   */
  constructor(options = {}, deps = {}) {
    this.onGenerate = options.onGenerate || (() => {});
    this.getSelectedNoteIds = options.getSelectedNoteIds || (() => []);
    this.deps = deps;
    
    this.modal = null;
    this.isOpen = false;
    this.boundHandlers = {};
  }

  /**
   * Initialize the modal
   * @param {HTMLElement} container - Container to append modal to
   */
  init(container) {
    // Check if modal already exists
    this.modal = document.getElementById('reportModal');
    
    if (!this.modal) {
      // Create modal
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = createReportModalHTML();
      this.modal = tempDiv.firstElementChild;
      container.appendChild(this.modal);
    }

    this.bindEvents();
    this.updateSelectedCount();
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Close button
    const closeBtn = this.modal.querySelector('#reportModalClose');
    const cancelBtn = this.modal.querySelector('#reportModalCancel');
    const generateBtn = this.modal.querySelector('#report-modal-generate');
    const backdrop = this.modal.querySelector('.modal-backdrop');
    const scopeRadios = this.modal.querySelectorAll('input[name="reportScope"]');
    
    this.boundHandlers.close = () => this.close();
    this.boundHandlers.generate = () => this.handleGenerate();
    this.boundHandlers.scopeChange = (e) => this.handleScopeChange(e);
    this.boundHandlers.keydown = (e) => this.handleKeydown(e);

    closeBtn?.addEventListener('click', this.boundHandlers.close);
    cancelBtn?.addEventListener('click', this.boundHandlers.close);
    generateBtn?.addEventListener('click', this.boundHandlers.generate);
    backdrop?.addEventListener('click', this.boundHandlers.close);
    
    scopeRadios.forEach(radio => {
      radio.addEventListener('change', this.boundHandlers.scopeChange);
    });

    document.addEventListener('keydown', this.boundHandlers.keydown);
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeydown(e) {
    if (!this.isOpen) return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  /**
   * Handle scope radio change
   * @param {Event} e - Change event
   */
  handleScopeChange(e) {
    const dateRangeInputs = this.modal.querySelector('#dateRangeInputs');
    
    if (e.target.value === REPORT_SCOPES.DATE_RANGE) {
      dateRangeInputs?.classList.remove('hidden');
      // Set default dates (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      const startInput = this.modal.querySelector('#reportDateStart');
      const endInput = this.modal.querySelector('#reportDateEnd');
      
      if (startInput && !startInput.value) {
        startInput.value = startDate.toISOString().split('T')[0];
      }
      if (endInput && !endInput.value) {
        endInput.value = endDate.toISOString().split('T')[0];
      }
    } else {
      dateRangeInputs?.classList.add('hidden');
    }

    // Update selected count visibility
    this.updateSelectedCount();
  }

  /**
   * Update the selected notes count display
   */
  updateSelectedCount() {
    const countEl = this.modal.querySelector('#selectedNotesCount');
    const selectedIds = this.getSelectedNoteIds();
    
    if (countEl) {
      countEl.textContent = `(${selectedIds.length})`;
    }
  }

  /**
   * Handle generate button click
   */
  handleGenerate() {
    const options = this.getOptions();
    
    // Validate options
    if (options.scope === REPORT_SCOPES.SELECTED) {
      const selectedIds = this.getSelectedNoteIds();
      if (selectedIds.length === 0) {
        // Show error or alert
        const errorMsg = t('reportNoNotesSelected') || 'Please select at least one note';
        alert(errorMsg);
        return;
      }
      options.selectedNoteIds = selectedIds;
    }

    if (options.scope === REPORT_SCOPES.DATE_RANGE) {
      const startInput = this.modal.querySelector('#reportDateStart');
      const endInput = this.modal.querySelector('#reportDateEnd');
      
      if (!startInput?.value || !endInput?.value) {
        const errorMsg = t('reportDateRangeRequired') || 'Please select both start and end dates';
        alert(errorMsg);
        return;
      }

      options.dateRange = {
        start: new Date(startInput.value),
        end: new Date(endInput.value + 'T23:59:59')
      };
    }

    this.close();
    this.onGenerate(options);
  }

  /**
   * Get current options from form
   * @returns {Object} Report options
   */
  getOptions() {
    const formatEl = this.modal.querySelector('input[name="reportFormat"]:checked');
    const scopeEl = this.modal.querySelector('input[name="reportScope"]:checked');
    const metadataEl = this.modal.querySelector('#reportIncludeMetadata');
    const commentsEl = this.modal.querySelector('#reportIncludeComments');
    const screenshotsEl = this.modal.querySelector('#reportIncludeScreenshots');

    return {
      format: formatEl?.value || REPORT_FORMATS.HTML,
      scope: scopeEl?.value || REPORT_SCOPES.CURRENT_PAGE,
      includeMetadata: metadataEl?.checked ?? true,
      includeComments: commentsEl?.checked ?? true,
      includeScreenshots: screenshotsEl?.checked ?? false
    };
  }

  /**
   * Open the modal
   */
  open() {
    if (!this.modal) return;
    
    this.modal.classList.remove('hidden');
    this.isOpen = true;
    
    // Update selected count
    this.updateSelectedCount();
    
    // Focus first focusable element
    const firstFocusable = this.modal.querySelector('input, button');
    firstFocusable?.focus();
  }

  /**
   * Close the modal
   */
  close() {
    if (!this.modal) return;
    
    this.modal.classList.add('hidden');
    this.isOpen = false;
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    document.removeEventListener('keydown', this.boundHandlers.keydown);
  }
}

/**
 * Get CSS styles for the report modal
 * @returns {string} CSS styles
 */
export function getReportModalStyles() {
  return `
    /* Report Modal Specific Styles */
    .report-modal-content {
      max-width: 380px;
    }

    .report-option-group {
      margin-bottom: 20px;
    }

    .report-option-group:last-child {
      margin-bottom: 0;
    }

    .report-option-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 10px;
    }

    /* Format Options */
    .report-format-options {
      display: flex;
      gap: 8px;
    }

    .report-format-option {
      flex: 1;
      cursor: pointer;
    }

    .report-format-option input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .report-format-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 12px 8px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      font-size: 12px;
      font-weight: 500;
      color: #6b7280;
      transition: all 0.15s ease;
    }

    .report-format-option input:checked + .report-format-card {
      border-color: #3b82f6;
      background: #eff6ff;
      color: #1d4ed8;
    }

    .report-format-option input:focus + .report-format-card {
      outline: 2px solid #facc15;
      outline-offset: 2px;
    }

    .report-format-card:hover {
      border-color: #d1d5db;
    }

    .report-format-card svg {
      color: #9ca3af;
    }

    .report-format-option input:checked + .report-format-card svg {
      color: #3b82f6;
    }

    /* Scope Options */
    .report-scope-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .report-scope-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      color: #374151;
      transition: all 0.15s ease;
    }

    .report-scope-option:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    .report-scope-option input {
      margin: 0;
      accent-color: #3b82f6;
    }

    .report-scope-option input:checked ~ span:first-of-type {
      font-weight: 500;
    }

    .selected-count {
      margin-left: auto;
      font-size: 12px;
      color: #6b7280;
    }

    /* Date Range Inputs */
    .date-range-inputs {
      display: flex;
      gap: 12px;
      margin-top: 12px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .date-range-inputs.hidden {
      display: none;
    }

    .date-input-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .date-input-group label {
      font-size: 11px;
      color: #6b7280;
    }

    .date-input {
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 13px;
      color: #374151;
    }

    .date-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    /* Content Options */
    .report-content-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .report-checkbox-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      color: #374151;
      transition: background 0.15s ease;
    }

    .report-checkbox-option:hover {
      background: #f9fafb;
    }

    .report-checkbox-option input {
      margin: 0;
      accent-color: #3b82f6;
    }

    .option-hint {
      font-size: 11px;
      color: #9ca3af;
    }

    .option-hint-disabled {
      color: #d1d5db;
    }

    /* Modal footer button with icon */
    #report-modal-generate {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    #report-modal-generate svg {
      flex-shrink: 0;
    }
  `;
}
