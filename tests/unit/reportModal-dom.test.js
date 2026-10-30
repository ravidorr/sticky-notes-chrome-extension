/**
 * Report Modal - real DOM tests (event wiring, validation fallbacks)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../src/shared/i18n.js', () => ({
  t: jest.fn(() => '')
}));

const { ReportModalController, createReportModalHTML } = await import('../../src/popup/reportModal.js');

const checkScope = (value) => {
  document.querySelector(`input[name="reportScope"][value="${value}"]`).checked = true;
};

describe('ReportModalController with real DOM', () => {
  let container;
  let selectedIds;
  let onGenerate;
  let controller;

  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>';
    container = document.getElementById('container');
    selectedIds = [];
    onGenerate = jest.fn();
    controller = new ReportModalController({
      onGenerate,
      getSelectedNoteIds: () => selectedIds
    });
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    controller.destroy();
    jest.restoreAllMocks();
  });

  it('default onGenerate and getSelectedNoteIds are no-ops', () => {
    const bare = new ReportModalController();
    expect(bare.onGenerate()).toBeUndefined();
    expect(bare.getSelectedNoteIds()).toEqual([]);
  });

  it('init builds the modal from HTML template', () => {
    controller.init(container);
    expect(container.querySelector('#reportModal')).toBeTruthy();
    expect(createReportModalHTML()).toContain('reportModal');
  });

  it('close buttons, backdrop and escape close the modal', () => {
    controller.init(container);
    const modal = controller.modal;
    const targets = ['#reportModalClose', '#reportModalCancel', '.modal-backdrop'];

    targets.forEach((selector) => {
      controller.open();
      expect(modal.classList.contains('hidden')).toBe(false);
      modal.querySelector(selector).click();
      expect(modal.classList.contains('hidden')).toBe(true);
      expect(controller.isOpen).toBe(false);
    });

    controller.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(controller.isOpen).toBe(false);
  });

  it('scope radio change shows the date range and fills default dates', () => {
    controller.init(container);
    checkScope('dateRange');
    controller.modal.querySelector('input[name="reportScope"][value="dateRange"]')
      .dispatchEvent(new Event('change', { bubbles: true }));

    expect(controller.modal.querySelector('#dateRangeInputs').classList.contains('hidden')).toBe(false);
    expect(controller.modal.querySelector('#reportDateStart').value).not.toBe('');
    expect(controller.modal.querySelector('#reportDateEnd').value).not.toBe('');
  });

  it('scope change keeps existing date values', () => {
    controller.init(container);
    controller.modal.querySelector('#reportDateStart').value = '2020-01-01';
    controller.modal.querySelector('#reportDateEnd').value = '2020-02-01';
    controller.handleScopeChange({ target: { value: 'dateRange' } });

    expect(controller.modal.querySelector('#reportDateStart').value).toBe('2020-01-01');
    expect(controller.modal.querySelector('#reportDateEnd').value).toBe('2020-02-01');
  });

  it('scope change tolerates missing date inputs', () => {
    controller.init(container);
    controller.modal.querySelector('#dateRangeInputs').remove();

    expect(() => controller.handleScopeChange({ target: { value: 'dateRange' } })).not.toThrow();
    expect(() => controller.handleScopeChange({ target: { value: 'allNotes' } })).not.toThrow();
  });

  it('generate button triggers onGenerate for current page', () => {
    controller.init(container);
    controller.modal.querySelector('#report-modal-generate').click();

    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ scope: 'currentPage' }));
  });

  it('selected scope with selections passes the ids', () => {
    controller.init(container);
    checkScope('selected');
    selectedIds = ['a', 'b'];
    controller.handleGenerate();

    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ selectedNoteIds: ['a', 'b'] }));
  });

  it('selected scope without selections alerts with fallback text', () => {
    controller.init(container);
    checkScope('selected');
    controller.handleGenerate();

    expect(window.alert).toHaveBeenCalledWith('Please select at least one note');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('date range scope without dates alerts with fallback text', () => {
    controller.init(container);
    checkScope('dateRange');
    controller.handleGenerate();

    expect(window.alert).toHaveBeenCalledWith('Please select both start and end dates');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('date range scope with dates passes the range', () => {
    controller.init(container);
    checkScope('dateRange');
    controller.modal.querySelector('#reportDateStart').value = '2024-01-01';
    controller.modal.querySelector('#reportDateEnd').value = '2024-01-31';
    controller.handleGenerate();

    const options = onGenerate.mock.calls[0][0];
    expect(options.dateRange.start).toBeInstanceOf(Date);
    expect(options.dateRange.end).toBeInstanceOf(Date);
  });
});
