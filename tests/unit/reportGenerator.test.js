/**
 * ReportGenerator Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('ReportGenerator', () => {
  const localThis = {};

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock document for stripHtml
    global.document = {
      createElement: jest.fn(() => ({
        innerHTML: '',
        textContent: '',
        get innerText() { return this.textContent; }
      }))
    };
    
    // Mock window for URL handling
    global.URL = globalThis.URL;
    
    // Import modules fresh for each test
    localThis.reportGeneratorModule = await import('../../src/shared/reportGenerator.js');
    localThis.ReportGenerator = localThis.reportGeneratorModule.ReportGenerator;
    localThis.REPORT_FORMATS = localThis.reportGeneratorModule.REPORT_FORMATS;
    localThis.REPORT_SCOPES = localThis.reportGeneratorModule.REPORT_SCOPES;
    localThis.DEFAULT_REPORT_OPTIONS = localThis.reportGeneratorModule.DEFAULT_REPORT_OPTIONS;
    localThis.downloadReport = localThis.reportGeneratorModule.downloadReport;
    
    // Sample notes for testing
    localThis.sampleNotes = [
      {
        id: 'note1',
        content: '<p>Test note content</p>',
        theme: 'yellow',
        url: 'https://example.com/page1',
        selector: 'div.content',
        createdAt: new Date('2025-01-15T10:00:00Z'),
        updatedAt: new Date('2025-01-15T12:00:00Z'),
        metadata: {
          browser: 'Chrome 120',
          viewport: '1920x1080',
          environment: 'staging',
          url: 'https://example.com/page1'
        },
        comments: []
      },
      {
        id: 'note2',
        content: '<b>Another note</b>',
        theme: 'blue',
        url: 'https://example.com/page2',
        selector: '__PAGE__',
        createdAt: new Date('2025-01-10T08:00:00Z'),
        metadata: {
          browser: 'Firefox 122',
          viewport: '1440x900',
          environment: 'production',
          url: 'https://example.com/page2',
          consoleErrors: [
            { type: 'console.error', message: 'Test error message' }
          ]
        },
        comments: [
          {
            id: 'comment1',
            authorName: 'Test User',
            authorEmail: 'test@example.com',
            content: 'This is a test comment',
            createdAt: new Date('2025-01-11T09:00:00Z'),
            parentId: null
          }
        ]
      }
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const generator = new localThis.ReportGenerator();
      
      expect(generator.options.format).toBe(localThis.REPORT_FORMATS.HTML);
      expect(generator.options.scope).toBe(localThis.REPORT_SCOPES.ALL_NOTES);
      expect(generator.options.includeMetadata).toBe(true);
      expect(generator.options.includeComments).toBe(true);
      expect(generator.options.includeScreenshots).toBe(true);
    });

    it('should override defaults with provided options', () => {
      const generator = new localThis.ReportGenerator({
        format: localThis.REPORT_FORMATS.MARKDOWN,
        includeMetadata: false
      });
      
      expect(generator.options.format).toBe(localThis.REPORT_FORMATS.MARKDOWN);
      expect(generator.options.includeMetadata).toBe(false);
      expect(generator.options.includeComments).toBe(true);
    });
  });

  describe('filterNotes', () => {
    it('should return all notes when no filters applied', () => {
      const generator = new localThis.ReportGenerator({
        scope: localThis.REPORT_SCOPES.ALL_NOTES
      });
      
      const filtered = generator.filterNotes(localThis.sampleNotes);
      
      expect(filtered.length).toBe(2);
    });

    it('should filter by selected note IDs', () => {
      const generator = new localThis.ReportGenerator({
        scope: localThis.REPORT_SCOPES.SELECTED,
        selectedNoteIds: ['note1']
      });
      
      const filtered = generator.filterNotes(localThis.sampleNotes);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('note1');
    });

    it('should filter by date range', () => {
      const generator = new localThis.ReportGenerator({
        scope: localThis.REPORT_SCOPES.DATE_RANGE,
        dateRange: {
          start: new Date('2025-01-12T00:00:00Z'),
          end: new Date('2025-01-20T23:59:59Z')
        }
      });
      
      const filtered = generator.filterNotes(localThis.sampleNotes);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('note1');
    });

    it('should sort notes by date (newest first)', () => {
      const generator = new localThis.ReportGenerator();
      
      const filtered = generator.filterNotes(localThis.sampleNotes);
      
      expect(filtered[0].id).toBe('note1');
      expect(filtered[1].id).toBe('note2');
    });
  });

  describe('getNoteDate', () => {
    it('should handle Date object', () => {
      const generator = new localThis.ReportGenerator();
      const date = new Date('2025-01-15T10:00:00Z');
      
      const result = generator.getNoteDate({ createdAt: date });
      
      expect(result).toEqual(date);
    });

    it('should handle string date', () => {
      const generator = new localThis.ReportGenerator();
      
      const result = generator.getNoteDate({ createdAt: '2025-01-15T10:00:00Z' });
      
      expect(result.toISOString()).toBe('2025-01-15T10:00:00.000Z');
    });

    it('should handle Firestore timestamp object', () => {
      const generator = new localThis.ReportGenerator();
      const firestoreTimestamp = {
        seconds: 1705312800,
        nanoseconds: 0
      };
      
      const result = generator.getNoteDate({ createdAt: firestoreTimestamp });
      
      expect(result).toBeInstanceOf(Date);
    });

    it('should return null for missing timestamp', () => {
      const generator = new localThis.ReportGenerator();
      
      const result = generator.getNoteDate({});
      
      expect(result).toBeNull();
    });
  });

  describe('generateStats', () => {
    it('should calculate correct statistics', () => {
      const generator = new localThis.ReportGenerator();
      
      const stats = generator.generateStats(localThis.sampleNotes);
      
      expect(stats.total).toBe(2);
      expect(stats.byTheme.yellow).toBe(1);
      expect(stats.byTheme.blue).toBe(1);
      expect(stats.withComments).toBe(1);
    });

    it('should count domains correctly', () => {
      const generator = new localThis.ReportGenerator();
      
      const stats = generator.generateStats(localThis.sampleNotes);
      
      expect(stats.byDomain['example.com']).toBe(2);
    });

    it('should handle notes without comments', () => {
      const generator = new localThis.ReportGenerator();
      const notesWithoutComments = localThis.sampleNotes.map(n => ({ ...n, comments: [] }));
      
      const stats = generator.generateStats(notesWithoutComments);
      
      expect(stats.withComments).toBe(0);
    });
  });

  describe('renderHTML', () => {
    it('should generate valid HTML report', () => {
      const generator = new localThis.ReportGenerator({
        format: localThis.REPORT_FORMATS.HTML,
        includeMetadata: true,
        includeComments: true
      });
      
      const result = generator.renderHTML(localThis.sampleNotes, { userEmail: 'test@example.com' });
      
      expect(result.content).toContain('<!DOCTYPE html>');
      // Title comes from i18n which returns the key in tests
      expect(result.content).toMatch(/<title>.*<\/title>/);
      expect(result.content).toContain('test@example.com');
      expect(result.mimeType).toBe('text/html;charset=utf-8');
      expect(result.filename).toMatch(/sticky-notes-report-.*\.html$/);
    });

    it('should include note content', () => {
      const generator = new localThis.ReportGenerator();
      
      const result = generator.renderHTML(localThis.sampleNotes, {});
      
      expect(result.content).toContain('Test note content');
      expect(result.content).toContain('Another note');
    });

    it('should include metadata when enabled', () => {
      const generator = new localThis.ReportGenerator({
        includeMetadata: true
      });
      
      const result = generator.renderHTML(localThis.sampleNotes, {});
      
      expect(result.content).toContain('Chrome 120');
      expect(result.content).toContain('1920x1080');
      expect(result.content).toContain('staging');
    });

    it('should exclude metadata when disabled', () => {
      const generator = new localThis.ReportGenerator({
        includeMetadata: false
      });
      
      const result = generator.renderHTML(localThis.sampleNotes, {});
      
      // Should not contain metadata section class
      expect(result.content).not.toContain('class="note-metadata"');
    });

    it('should include comments when enabled', () => {
      const generator = new localThis.ReportGenerator({
        includeComments: true
      });
      
      const result = generator.renderHTML(localThis.sampleNotes, {});
      
      expect(result.content).toContain('Comments');
      expect(result.content).toContain('This is a test comment');
    });

    it('should exclude comments when disabled', () => {
      const generator = new localThis.ReportGenerator({
        includeComments: false
      });
      
      const result = generator.renderHTML(localThis.sampleNotes, {});
      
      expect(result.content).not.toContain('This is a test comment');
    });
  });

  describe('renderMarkdown', () => {
    it('should generate valid Markdown report', () => {
      const generator = new localThis.ReportGenerator({
        format: localThis.REPORT_FORMATS.MARKDOWN
      });
      
      const result = generator.renderMarkdown(localThis.sampleNotes, { userEmail: 'test@example.com' });
      
      // The title comes from i18n which returns undefined in tests, so just check for header format
      expect(result.content).toMatch(/^#\s/);
      expect(result.content).toContain('test@example.com');
      expect(result.mimeType).toBe('text/markdown;charset=utf-8');
      expect(result.filename).toMatch(/sticky-notes-report-.*\.md$/);
    });

    it('should include note content in markdown format', () => {
      const generator = new localThis.ReportGenerator();
      
      const result = generator.renderMarkdown(localThis.sampleNotes, {});
      
      expect(result.content).toContain('### Note (yellow)');
      expect(result.content).toContain('### Note (blue)');
    });

    it('should include metadata when enabled', () => {
      const generator = new localThis.ReportGenerator({
        includeMetadata: true
      });
      
      const result = generator.renderMarkdown(localThis.sampleNotes, {});
      
      expect(result.content).toContain('**Metadata:**');
      expect(result.content).toContain('Browser: Chrome 120');
    });

    it('should include comments when enabled', () => {
      const generator = new localThis.ReportGenerator({
        includeComments: true
      });
      
      const result = generator.renderMarkdown(localThis.sampleNotes, {});
      
      expect(result.content).toContain('**Comments');
      expect(result.content).toContain('Test User');
    });
  });

  describe('generate', () => {
    it('should throw error for empty notes array', async () => {
      const generator = new localThis.ReportGenerator();
      
      await expect(generator.generate([])).rejects.toThrow();
    });

    it('should throw error for null notes', async () => {
      const generator = new localThis.ReportGenerator();
      
      await expect(generator.generate(null)).rejects.toThrow();
    });

    it('should generate HTML by default', async () => {
      const generator = new localThis.ReportGenerator({
        format: localThis.REPORT_FORMATS.HTML
      });
      
      const result = await generator.generate(localThis.sampleNotes);
      
      expect(result.mimeType).toBe('text/html;charset=utf-8');
    });

    it('should generate Markdown when specified', async () => {
      const generator = new localThis.ReportGenerator({
        format: localThis.REPORT_FORMATS.MARKDOWN
      });
      
      const result = await generator.generate(localThis.sampleNotes);
      
      expect(result.mimeType).toBe('text/markdown;charset=utf-8');
    });

    it('should throw error for unsupported format', async () => {
      const generator = new localThis.ReportGenerator({
        format: 'invalid'
      });
      
      await expect(generator.generate(localThis.sampleNotes)).rejects.toThrow('Unsupported format');
    });
  });

  describe('renderPDF', () => {
    it('should fall back to HTML when html2pdf is not available', async () => {
      const generator = new localThis.ReportGenerator({
        format: localThis.REPORT_FORMATS.PDF
      });
      
      const result = await generator.renderPDF(localThis.sampleNotes, {});
      
      // Should return HTML with printMode flag
      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.printMode).toBe(true);
    });
  });

  describe('getDateString', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const generator = new localThis.ReportGenerator();
      
      const dateString = generator.getDateString();
      
      expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('REPORT_FORMATS', () => {
    it('should have HTML format', () => {
      expect(localThis.REPORT_FORMATS.HTML).toBe('html');
    });

    it('should have PDF format', () => {
      expect(localThis.REPORT_FORMATS.PDF).toBe('pdf');
    });

    it('should have MARKDOWN format', () => {
      expect(localThis.REPORT_FORMATS.MARKDOWN).toBe('markdown');
    });
  });

  describe('REPORT_SCOPES', () => {
    it('should have CURRENT_PAGE scope', () => {
      expect(localThis.REPORT_SCOPES.CURRENT_PAGE).toBe('currentPage');
    });

    it('should have ALL_NOTES scope', () => {
      expect(localThis.REPORT_SCOPES.ALL_NOTES).toBe('allNotes');
    });

    it('should have SELECTED scope', () => {
      expect(localThis.REPORT_SCOPES.SELECTED).toBe('selected');
    });

    it('should have DATE_RANGE scope', () => {
      expect(localThis.REPORT_SCOPES.DATE_RANGE).toBe('dateRange');
    });
  });

  describe('downloadReport', () => {
    it('should throw error for invalid report', () => {
      expect(() => localThis.downloadReport(null)).toThrow('Invalid report object');
      expect(() => localThis.downloadReport({})).toThrow('Invalid report object');
      expect(() => localThis.downloadReport({ content: null })).toThrow('Invalid report object');
    });

    it('should accept valid report object', () => {
      // Mock the browser APIs that downloadReport needs
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn()
      };
      
      global.document = {
        createElement: jest.fn(() => mockLink),
        body: {
          appendChild: jest.fn(),
          removeChild: jest.fn()
        }
      };
      
      global.URL = {
        createObjectURL: jest.fn(() => 'blob:test'),
        revokeObjectURL: jest.fn()
      };
      
      global.Blob = jest.fn().mockImplementation((content, options) => ({
        content,
        type: options?.type
      }));
      
      const report = {
        content: '<html>Test</html>',
        filename: 'test-report.html',
        mimeType: 'text/html'
      };
      
      // Should not throw
      expect(() => localThis.downloadReport(report)).not.toThrow();
    });

    it('should handle printMode without throwing', () => {
      // Mock window.open for print mode
      global.window = { 
        open: jest.fn(() => ({
          document: {
            write: jest.fn(),
            close: jest.fn()
          },
          print: jest.fn()
        }))
      };
      
      const report = {
        content: '<html>Test</html>',
        filename: 'test-report.html',
        mimeType: 'text/html',
        printMode: true
      };
      
      // Should not throw
      expect(() => localThis.downloadReport(report)).not.toThrow();
    });
  });
});
