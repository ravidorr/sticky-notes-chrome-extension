/**
 * Report Modal Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Report Modal', () => {
  const localThis = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock document for DOM operations
    global.document = {
      getElementById: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      createElement: jest.fn(() => ({
        innerHTML: '',
        firstElementChild: null,
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(() => []),
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
          contains: jest.fn(() => false)
        }
      })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    
    // Import module fresh for each test
    localThis.reportModalModule = await import('../../src/popup/reportModal.js');
    localThis.createReportModalHTML = localThis.reportModalModule.createReportModalHTML;
    localThis.ReportModalController = localThis.reportModalModule.ReportModalController;
    localThis.getReportModalStyles = localThis.reportModalModule.getReportModalStyles;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createReportModalHTML', () => {
    it('should return HTML string', () => {
      const html = localThis.createReportModalHTML();
      
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    it('should contain modal structure', () => {
      const html = localThis.createReportModalHTML();
      
      expect(html).toContain('id="reportModal"');
      expect(html).toContain('modal-backdrop');
      expect(html).toContain('modal-content');
      expect(html).toContain('modal-header');
      expect(html).toContain('modal-body');
      expect(html).toContain('modal-footer');
    });

    it('should contain format options', () => {
      const html = localThis.createReportModalHTML();
      
      expect(html).toContain('name="reportFormat"');
      expect(html).toContain('value="html"');
      expect(html).toContain('value="pdf"');
      expect(html).toContain('value="markdown"');
    });

    it('should contain scope options', () => {
      const html = localThis.createReportModalHTML();
      
      expect(html).toContain('name="reportScope"');
      expect(html).toContain('value="currentPage"');
      expect(html).toContain('value="allNotes"');
      expect(html).toContain('value="selected"');
      expect(html).toContain('value="dateRange"');
    });

    it('should contain content toggles', () => {
      const html = localThis.createReportModalHTML();
      
      expect(html).toContain('id="reportIncludeMetadata"');
      expect(html).toContain('id="reportIncludeComments"');
      expect(html).toContain('id="reportIncludeScreenshots"');
    });

    it('should contain date range inputs', () => {
      const html = localThis.createReportModalHTML();
      
      expect(html).toContain('id="dateRangeInputs"');
      expect(html).toContain('id="reportDateStart"');
      expect(html).toContain('id="reportDateEnd"');
    });

    it('should contain action buttons', () => {
      const html = localThis.createReportModalHTML();
      
      expect(html).toContain('id="reportModalClose"');
      expect(html).toContain('id="reportModalCancel"');
      expect(html).toContain('id="report-modal-generate"');
    });

    it('should have i18n data attributes', () => {
      const html = localThis.createReportModalHTML();
      
      expect(html).toContain('data-i18n="generateReport"');
      expect(html).toContain('data-i18n="reportFormat"');
      expect(html).toContain('data-i18n="reportScope"');
    });
  });

  describe('ReportModalController', () => {
    describe('constructor', () => {
      it('should create instance with default options', () => {
        const controller = new localThis.ReportModalController();
        
        expect(controller.onGenerate).toBeDefined();
        expect(controller.getSelectedNoteIds).toBeDefined();
        expect(controller.modal).toBeNull();
        expect(controller.isOpen).toBe(false);
      });

      it('should accept custom options', () => {
        const onGenerate = jest.fn();
        const getSelectedNoteIds = jest.fn(() => ['1', '2']);
        
        const controller = new localThis.ReportModalController({
          onGenerate,
          getSelectedNoteIds
        });
        
        expect(controller.onGenerate).toBe(onGenerate);
        expect(controller.getSelectedNoteIds).toBe(getSelectedNoteIds);
      });
    });

    describe('init', () => {
      it('should find existing modal if present', () => {
        const mockModal = {
          querySelector: jest.fn(() => null),
          querySelectorAll: jest.fn(() => [])
        };
        global.document.getElementById = jest.fn((id) => {
          if (id === 'reportModal') return mockModal;
          return null;
        });
        
        const controller = new localThis.ReportModalController();
        const container = {
          appendChild: jest.fn()
        };
        
        controller.init(container);
        
        expect(controller.modal).toBe(mockModal);
        expect(container.appendChild).not.toHaveBeenCalled();
      });

      it('should create modal if not present', () => {
        global.document.getElementById = jest.fn(() => null);
        
        const mockModalElement = {
          querySelector: jest.fn(() => null),
          querySelectorAll: jest.fn(() => [])
        };
        global.document.createElement = jest.fn(() => ({
          innerHTML: '',
          firstElementChild: mockModalElement,
          querySelector: jest.fn()
        }));
        
        const controller = new localThis.ReportModalController();
        const container = {
          appendChild: jest.fn()
        };
        
        controller.init(container);
        
        expect(container.appendChild).toHaveBeenCalled();
      });
    });

    describe('getOptions', () => {
      it('should return default options when no form elements', () => {
        const controller = new localThis.ReportModalController();
        controller.modal = {
          querySelector: jest.fn(() => null)
        };
        
        const options = controller.getOptions();
        
        expect(options.format).toBe('html');
        expect(options.scope).toBe('currentPage');
        expect(options.includeMetadata).toBe(true);
        expect(options.includeComments).toBe(true);
        expect(options.includeScreenshots).toBe(false);
      });

      it('should return selected options from form', () => {
        const controller = new localThis.ReportModalController();
        controller.modal = {
          querySelector: jest.fn((selector) => {
            if (selector === 'input[name="reportFormat"]:checked') {
              return { value: 'markdown' };
            }
            if (selector === 'input[name="reportScope"]:checked') {
              return { value: 'allNotes' };
            }
            if (selector === '#reportIncludeMetadata') {
              return { checked: false };
            }
            if (selector === '#reportIncludeComments') {
              return { checked: true };
            }
            if (selector === '#reportIncludeScreenshots') {
              return { checked: true };
            }
            return null;
          })
        };
        
        const options = controller.getOptions();
        
        expect(options.format).toBe('markdown');
        expect(options.scope).toBe('allNotes');
        expect(options.includeMetadata).toBe(false);
        expect(options.includeComments).toBe(true);
        expect(options.includeScreenshots).toBe(true);
      });
    });

    describe('open', () => {
      it('should show modal and set isOpen', () => {
        const mockClassList = {
          add: jest.fn(),
          remove: jest.fn()
        };
        const mockFocus = jest.fn();
        
        const controller = new localThis.ReportModalController();
        controller.modal = {
          classList: mockClassList,
          querySelector: jest.fn(() => ({ focus: mockFocus }))
        };
        controller.updateSelectedCount = jest.fn();
        
        controller.open();
        
        expect(mockClassList.remove).toHaveBeenCalledWith('hidden');
        expect(controller.isOpen).toBe(true);
        expect(mockFocus).toHaveBeenCalled();
      });

      it('should do nothing if modal is null', () => {
        const controller = new localThis.ReportModalController();
        controller.modal = null;
        
        expect(() => controller.open()).not.toThrow();
        expect(controller.isOpen).toBe(false);
      });
    });

    describe('close', () => {
      it('should hide modal and set isOpen to false', () => {
        const mockClassList = {
          add: jest.fn(),
          remove: jest.fn()
        };
        
        const controller = new localThis.ReportModalController();
        controller.modal = { classList: mockClassList };
        controller.isOpen = true;
        
        controller.close();
        
        expect(mockClassList.add).toHaveBeenCalledWith('hidden');
        expect(controller.isOpen).toBe(false);
      });

      it('should do nothing if modal is null', () => {
        const controller = new localThis.ReportModalController();
        controller.modal = null;
        controller.isOpen = true;
        
        expect(() => controller.close()).not.toThrow();
      });
    });

    describe('handleKeydown', () => {
      it('should close modal on Escape key when open', () => {
        const controller = new localThis.ReportModalController();
        controller.isOpen = true;
        controller.close = jest.fn();
        
        const event = {
          key: 'Escape',
          preventDefault: jest.fn()
        };
        
        controller.handleKeydown(event);
        
        expect(event.preventDefault).toHaveBeenCalled();
        expect(controller.close).toHaveBeenCalled();
      });

      it('should not close modal on Escape key when closed', () => {
        const controller = new localThis.ReportModalController();
        controller.isOpen = false;
        controller.close = jest.fn();
        
        const event = {
          key: 'Escape',
          preventDefault: jest.fn()
        };
        
        controller.handleKeydown(event);
        
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(controller.close).not.toHaveBeenCalled();
      });

      it('should ignore other keys', () => {
        const controller = new localThis.ReportModalController();
        controller.isOpen = true;
        controller.close = jest.fn();
        
        const event = {
          key: 'Enter',
          preventDefault: jest.fn()
        };
        
        controller.handleKeydown(event);
        
        expect(controller.close).not.toHaveBeenCalled();
      });
    });

    describe('handleScopeChange', () => {
      it('should show date range inputs when dateRange selected', () => {
        const mockClassList = {
          add: jest.fn(),
          remove: jest.fn()
        };
        const mockDateStart = { value: '' };
        const mockDateEnd = { value: '' };
        
        const controller = new localThis.ReportModalController();
        controller.modal = {
          querySelector: jest.fn((selector) => {
            if (selector === '#dateRangeInputs') {
              return { classList: mockClassList };
            }
            if (selector === '#reportDateStart') return mockDateStart;
            if (selector === '#reportDateEnd') return mockDateEnd;
            if (selector === '#selectedNotesCount') return { textContent: '' };
            return null;
          })
        };
        controller.getSelectedNoteIds = jest.fn(() => []);
        
        const event = { target: { value: 'dateRange' } };
        controller.handleScopeChange(event);
        
        expect(mockClassList.remove).toHaveBeenCalledWith('hidden');
      });

      it('should hide date range inputs for other scopes', () => {
        const mockClassList = {
          add: jest.fn(),
          remove: jest.fn()
        };
        
        const controller = new localThis.ReportModalController();
        controller.modal = {
          querySelector: jest.fn((selector) => {
            if (selector === '#dateRangeInputs') {
              return { classList: mockClassList };
            }
            if (selector === '#selectedNotesCount') return { textContent: '' };
            return null;
          })
        };
        controller.getSelectedNoteIds = jest.fn(() => []);
        
        const event = { target: { value: 'allNotes' } };
        controller.handleScopeChange(event);
        
        expect(mockClassList.add).toHaveBeenCalledWith('hidden');
      });
    });

    describe('updateSelectedCount', () => {
      it('should update count display', () => {
        const mockCountEl = { textContent: '' };
        
        const controller = new localThis.ReportModalController({
          getSelectedNoteIds: () => ['1', '2', '3']
        });
        controller.modal = {
          querySelector: jest.fn(() => mockCountEl)
        };
        
        controller.updateSelectedCount();
        
        expect(mockCountEl.textContent).toBe('(3)');
      });

      it('should show zero for empty selection', () => {
        const mockCountEl = { textContent: '' };
        
        const controller = new localThis.ReportModalController({
          getSelectedNoteIds: () => []
        });
        controller.modal = {
          querySelector: jest.fn(() => mockCountEl)
        };
        
        controller.updateSelectedCount();
        
        expect(mockCountEl.textContent).toBe('(0)');
      });
    });

    describe('handleGenerate', () => {
      it('should call onGenerate with options', () => {
        const mockOnGenerate = jest.fn();
        
        const controller = new localThis.ReportModalController({
          onGenerate: mockOnGenerate
        });
        controller.modal = {
          querySelector: jest.fn(() => null),
          classList: { add: jest.fn() }
        };
        controller.getOptions = jest.fn(() => ({
          format: 'html',
          scope: 'allNotes',
          includeMetadata: true,
          includeComments: true,
          includeScreenshots: false
        }));
        controller.close = jest.fn();
        
        controller.handleGenerate();
        
        expect(controller.close).toHaveBeenCalled();
        expect(mockOnGenerate).toHaveBeenCalledWith({
          format: 'html',
          scope: 'allNotes',
          includeMetadata: true,
          includeComments: true,
          includeScreenshots: false
        });
      });

      it('should alert when selected scope has no selections', () => {
        global.alert = jest.fn();
        
        const controller = new localThis.ReportModalController({
          getSelectedNoteIds: () => []
        });
        controller.modal = {
          querySelector: jest.fn(() => null),
          classList: { add: jest.fn() }
        };
        controller.getOptions = jest.fn(() => ({
          format: 'html',
          scope: 'selected'
        }));
        controller.close = jest.fn();
        
        controller.handleGenerate();
        
        expect(global.alert).toHaveBeenCalled();
        expect(controller.close).not.toHaveBeenCalled();
      });

      it('should alert when date range is incomplete', () => {
        global.alert = jest.fn();
        
        const controller = new localThis.ReportModalController();
        controller.modal = {
          querySelector: jest.fn((selector) => {
            if (selector === '#reportDateStart') return { value: '' };
            if (selector === '#reportDateEnd') return { value: '2025-01-31' };
            return null;
          }),
          classList: { add: jest.fn() }
        };
        controller.getOptions = jest.fn(() => ({
          format: 'html',
          scope: 'dateRange'
        }));
        controller.close = jest.fn();
        
        controller.handleGenerate();
        
        expect(global.alert).toHaveBeenCalled();
        expect(controller.close).not.toHaveBeenCalled();
      });

      it('should add date range to options when valid', () => {
        const mockOnGenerate = jest.fn();
        
        const controller = new localThis.ReportModalController({
          onGenerate: mockOnGenerate
        });
        controller.modal = {
          querySelector: jest.fn((selector) => {
            if (selector === '#reportDateStart') return { value: '2025-01-01' };
            if (selector === '#reportDateEnd') return { value: '2025-01-31' };
            return null;
          }),
          classList: { add: jest.fn() }
        };
        controller.getOptions = jest.fn(() => ({
          format: 'html',
          scope: 'dateRange',
          includeMetadata: true,
          includeComments: true,
          includeScreenshots: false
        }));
        controller.close = jest.fn();
        
        controller.handleGenerate();
        
        expect(mockOnGenerate).toHaveBeenCalledWith(expect.objectContaining({
          dateRange: expect.objectContaining({
            start: expect.any(Date),
            end: expect.any(Date)
          })
        }));
      });
    });

    describe('destroy', () => {
      it('should remove keydown event listener', () => {
        const mockRemoveEventListener = jest.fn();
        global.document.removeEventListener = mockRemoveEventListener;
        
        const controller = new localThis.ReportModalController();
        controller.boundHandlers = {
          keydown: jest.fn()
        };
        
        controller.destroy();
        
        expect(mockRemoveEventListener).toHaveBeenCalledWith(
          'keydown',
          controller.boundHandlers.keydown
        );
      });
    });
  });

  describe('getReportModalStyles', () => {
    it('should return CSS styles as string', () => {
      const styles = localThis.getReportModalStyles();
      
      expect(typeof styles).toBe('string');
      expect(styles.length).toBeGreaterThan(0);
    });

    it('should contain modal-specific styles', () => {
      const styles = localThis.getReportModalStyles();
      
      expect(styles).toContain('.report-modal-content');
      expect(styles).toContain('.report-option-group');
      expect(styles).toContain('.report-format-options');
      expect(styles).toContain('.report-scope-options');
    });

    it('should contain format card styles', () => {
      const styles = localThis.getReportModalStyles();
      
      expect(styles).toContain('.report-format-option');
      expect(styles).toContain('.report-format-card');
    });

    it('should contain date range input styles', () => {
      const styles = localThis.getReportModalStyles();
      
      expect(styles).toContain('.date-range-inputs');
      expect(styles).toContain('.date-input');
    });
  });
});
