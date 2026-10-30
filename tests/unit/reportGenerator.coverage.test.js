/**
 * ReportGenerator branch coverage tests
 *
 * Uses the real jsdom document and a stubbed i18n module whose translator
 * returns an empty string, so the literal English fallbacks are exercised.
 */

import { fileURLToPath } from 'node:url';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const i18nPath = fileURLToPath(new URL('../../src/shared/i18n.js', import.meta.url));

jest.unstable_mockModule(i18nPath, () => ({
  t: jest.fn(() => '')
}));

const { ReportGenerator, REPORT_FORMATS, REPORT_SCOPES, downloadReport } =
  await import('../../src/shared/reportGenerator.js');

describe('ReportGenerator branch coverage', () => {
  const baseNote = {
    id: 'a',
    content: '<p>Hello</p>',
    theme: 'blue',
    url: 'https://example.com/a',
    createdAt: new Date('2025-01-15T10:00:00Z')
  };

  describe('generate', () => {
    it('should use the English fallback when no notes are given', async () => {
      await expect(new ReportGenerator().generate([])).rejects.toThrow('No notes to include in report');
    });

    it('should throw when the scope filters out every note', async () => {
      const generator = new ReportGenerator({ scope: REPORT_SCOPES.SELECTED, selectedNoteIds: [] });
      await expect(generator.generate([baseNote])).rejects.toThrow('No notes match the selected criteria');
    });

    it('should dispatch to the PDF renderer', async () => {
      const generator = new ReportGenerator({ format: REPORT_FORMATS.PDF });
      const result = await generator.generate([baseNote]);
      expect(result.printMode).toBe(true);
      expect(result.filename).toMatch(/-print\.html$/);
    });
  });

  describe('filterNotes', () => {
    it('should drop undated notes in a date range and handle open bounds', () => {
      const undated = { id: 'u' };
      const generator = new ReportGenerator({
        scope: REPORT_SCOPES.DATE_RANGE,
        dateRange: { start: new Date('2025-01-01T00:00:00Z'), end: null }
      });
      const result = generator.filterNotes([undated, baseNote]);
      expect(result.map(note => note.id)).toEqual(['a']);
    });

    it('should sort undated notes after dated notes', () => {
      const generator = new ReportGenerator();
      const undatedOne = { id: 'u1' };
      const undatedTwo = { id: 'u2' };
      const older = { id: 'old', createdAt: new Date('2024-01-01T00:00:00Z') };
      const permutations = [
        [undatedOne, baseNote, undatedTwo, older],
        [older, undatedOne, undatedTwo, baseNote],
        [baseNote, undatedOne, older, undatedTwo],
        [undatedTwo, older, baseNote, undatedOne]
      ];
      for (const notes of permutations) {
        const ids = generator.filterNotes(notes).map(note => note.id);
        expect(ids.slice(0, 2)).toEqual(['a', 'old']);
        expect(ids.slice(2).sort()).toEqual(['u1', 'u2']);
      }
    });

    it('should compare a dated note against an undated note in both directions', () => {
      const generator = new ReportGenerator();
      const undated = { id: 'u' };
      expect(generator.filterNotes([baseNote, undated]).map(note => note.id)).toEqual(['a', 'u']);
      expect(generator.filterNotes([undated, baseNote]).map(note => note.id)).toEqual(['a', 'u']);
    });
  });

  describe('getNoteDate and formatDate', () => {
    it('should use toDate() when the timestamp provides it', () => {
      const date = new Date('2025-02-01T00:00:00Z');
      const generator = new ReportGenerator();
      expect(generator.getNoteDate({ createdAt: { toDate: () => date } })).toBe(date);
    });

    it('should return null for an unparseable date string', () => {
      expect(new ReportGenerator().getNoteDate({ createdAt: 'not a date' })).toBeNull();
    });

    it('should format an invalid date as Unknown', () => {
      expect(new ReportGenerator().formatDate('not a date')).toBe('Unknown');
    });
  });

  describe('generateStats', () => {
    it('should handle missing and unknown themes, urls and environments', () => {
      const generator = new ReportGenerator();
      const stats = generator.generateStats([
        { id: '1' },
        { id: '2', theme: 'purple', metadata: { url: 'https://meta.example.com/x', environment: 'weird' } },
        { id: '3', url: 'not a url' },
        { id: '4', theme: 'pink', metadata: { environment: 'staging' }, comments: [{ id: 'c' }] }
      ]);
      expect(stats.total).toBe(4);
      expect(stats.byTheme.yellow).toBe(2);
      expect(stats.byTheme.pink).toBe(1);
      expect(stats.byTheme.purple).toBeUndefined();
      expect(stats.byDomain).toEqual({ 'meta.example.com': 1 });
      expect(stats.byEnvironment.production).toBe(2);
      expect(stats.byEnvironment.staging).toBe(1);
      expect(stats.byEnvironment.weird).toBeUndefined();
      expect(stats.withComments).toBe(1);
    });
  });

  describe('renderHTML', () => {
    it('should render without a context argument and use the title fallback', () => {
      const result = new ReportGenerator().renderHTML([baseNote]);
      expect(result.mimeType).toBe('text/html;charset=utf-8');
      expect(result.content).toContain('Sticky Notes Report');
    });

    it('should render notes with missing optional fields', () => {
      const generator = new ReportGenerator();
      const html = generator.renderNoteHTML({ id: 'x', theme: 'purple' });
      expect(html).toContain('purple');
      expect(html).not.toContain('note-url');
    });

    it('should take the url from metadata when the note has none', () => {
      const generator = new ReportGenerator({ includeMetadata: false });
      const html = generator.renderNoteHTML({ id: 'x', metadata: { url: 'https://meta.example.com/p' } });
      expect(html).toContain('https://meta.example.com/p');
    });

    it('should skip metadata and comments blocks when the note has none', () => {
      const generator = new ReportGenerator();
      const html = generator.renderNoteHTML({ ...baseNote, comments: [] });
      expect(html).not.toContain('note-metadata');
      expect(html).not.toContain('note-comments');
    });
  });

  describe('renderMetadataHTML', () => {
    it('should handle a note without metadata or selector', () => {
      const html = new ReportGenerator().renderMetadataHTML({});
      expect(html).toContain('Environment:');
      expect(html).toContain('production');
      expect(html).not.toContain('Browser:');
      expect(html).not.toContain('Viewport:');
      expect(html).not.toContain('Selector:');
    });

    it('should fall back to the production colour for an unknown environment', () => {
      const html = new ReportGenerator().renderMetadataHTML({ metadata: { environment: 'weird' } });
      expect(html).toContain('weird');
    });

    it('should render console errors with fallbacks and an overflow row', () => {
      const consoleErrors = [
        { type: 'warn', message: 'typed' },
        { message: 'untyped' },
        'plain string error',
        { type: 'error' },
        { message: 'five' },
        { message: 'six' },
        { message: 'seven' }
      ];
      const html = new ReportGenerator().renderMetadataHTML({
        selector: 'div.target',
        metadata: { browser: 'Chrome', viewport: '1x1', environment: 'staging', consoleErrors }
      });
      expect(html).toContain('Console Errors (7)');
      expect(html).toContain('error-item warn');
      expect(html).toContain('error-item error');
      expect(html).toContain('plain string error');
      expect(html).toContain('... and 2 more');
      expect(html).toContain('div.target');
    });

    it('should not add an overflow row for five or fewer errors', () => {
      const html = new ReportGenerator().renderMetadataHTML({
        metadata: { consoleErrors: [{ message: 'one' }] }
      });
      expect(html).not.toContain('error-more');
    });
  });

  describe('renderCommentsHTML', () => {
    it('should fall back through author name, email and Anonymous and mark replies', () => {
      const html = new ReportGenerator().renderCommentsHTML([
        { authorName: 'Named', content: 'one', createdAt: new Date() },
        { authorEmail: 'mail@example.com', content: 'two', createdAt: new Date(), parentId: 'p' },
        { content: 'three', createdAt: new Date() }
      ]);
      expect(html).toContain('Named');
      expect(html).toContain('mail@example.com');
      expect(html).toContain('Anonymous');
      expect(html).toContain('comment-reply');
    });
  });

  describe('renderStatsHTML', () => {
    it('should use the default colour for unknown themes and show None without domains', () => {
      const html = new ReportGenerator().renderStatsHTML({
        total: 1,
        withComments: 0,
        byTheme: { purple: 1, yellow: 0 },
        byDomain: {}
      });
      expect(html).toContain('purple: 1');
      expect(html).not.toContain('yellow: 0');
      expect(html).toContain('None');
    });

    it('should list top domains', () => {
      const html = new ReportGenerator().renderStatsHTML({
        total: 2,
        withComments: 0,
        byTheme: {},
        byDomain: { 'a.com': 1, 'b.com': 3 }
      });
      expect(html.indexOf('b.com')).toBeLessThan(html.indexOf('a.com'));
    });
  });

  describe('renderPDF', () => {
    it('should render a PDF blob through the injected html2pdf', async () => {
      const chain = {
        from: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        outputPdf: jest.fn().mockResolvedValue('pdf-blob')
      };
      const generator = new ReportGenerator({}, { html2pdf: () => chain });
      const result = await generator.renderPDF([baseNote]);
      expect(result.content).toBe('pdf-blob');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.filename).toMatch(/\.pdf$/);
    });

    it('should fall back to print mode when html2pdf fails', async () => {
      const chain = {
        from: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        outputPdf: jest.fn().mockRejectedValue(new Error('boom'))
      };
      const generator = new ReportGenerator({}, { html2pdf: () => chain });
      const result = await generator.renderPDF([baseNote], {});
      expect(result.printMode).toBe(true);
      expect(result.filename).toMatch(/-print\.html$/);
    });
  });

  describe('renderMarkdown', () => {
    it('should render without a context argument and use the title fallback', () => {
      const result = new ReportGenerator().renderMarkdown([baseNote]);
      expect(result.mimeType).toBe('text/markdown;charset=utf-8');
      expect(result.content).toContain('Sticky Notes Report');
    });

    it('should render a bare note without content, url or metadata', () => {
      const md = new ReportGenerator().renderNoteMarkdown({ id: 'x', createdAt: baseNote.createdAt });
      expect(md).toContain('### Note (yellow)');
      expect(md).not.toContain('**URL:**');
      expect(md).not.toContain('**Metadata:**');
    });

    it('should use the metadata url and skip metadata when it is disabled', () => {
      const generator = new ReportGenerator({ includeMetadata: false, includeComments: false });
      const md = generator.renderNoteMarkdown({
        id: 'x',
        content: '<b>Body</b>',
        metadata: { url: 'https://meta.example.com/m' },
        comments: [{ content: 'ignored' }]
      });
      expect(md).toContain('Body');
      expect(md).toContain('https://meta.example.com/m');
      expect(md).not.toContain('**Metadata:**');
      expect(md).not.toContain('**Comments');
    });
  });

  describe('renderMetadataMarkdown', () => {
    it('should handle a note without metadata', () => {
      const md = new ReportGenerator().renderMetadataMarkdown({});
      expect(md).toBe('**Metadata:**\n\n\n');
    });

    it('should render all fields, error fallbacks and an overflow row', () => {
      const md = new ReportGenerator().renderMetadataMarkdown({
        selector: 'div.target',
        metadata: {
          browser: 'Chrome',
          viewport: '1x1',
          environment: 'staging',
          consoleErrors: [
            { message: 'first' },
            'plain string error',
            { message: 'three' },
            { message: 'four' },
            { message: 'five' },
            { message: 'six' }
          ]
        }
      });
      expect(md).toContain('- Browser: Chrome');
      expect(md).toContain('- Viewport: 1x1');
      expect(md).toContain('- Environment: staging');
      expect(md).toContain('- Selector: `div.target`');
      expect(md).toContain('plain string error');
      expect(md).toContain('... and 1 more');
    });

    it('should omit the overflow row for five or fewer errors', () => {
      const md = new ReportGenerator().renderMetadataMarkdown({
        selector: '__PAGE__',
        metadata: { consoleErrors: [{ message: 'one' }] }
      });
      expect(md).not.toContain('more');
      expect(md).not.toContain('Selector');
    });
  });

  describe('renderCommentsMarkdown', () => {
    it('should fall back through author name, email and Anonymous and indent replies', () => {
      const md = new ReportGenerator().renderCommentsMarkdown([
        { authorName: 'Named', content: 'one', createdAt: new Date() },
        { authorEmail: 'mail@example.com', content: 'two', createdAt: new Date(), parentId: 'p' },
        { content: 'three', createdAt: new Date() }
      ]);
      expect(md).toContain('**Named**');
      expect(md).toContain('  - **mail@example.com**');
      expect(md).toContain('**Anonymous**');
    });
  });

  describe('downloadReport', () => {
    const originalOpen = window.open;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;

    beforeEach(() => {
      URL.createObjectURL = jest.fn(() => 'blob:test');
      URL.revokeObjectURL = jest.fn();
    });

    afterEach(() => {
      window.open = originalOpen;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });

    it('should do nothing further when the print window is blocked', () => {
      window.open = jest.fn(() => null);
      expect(() => downloadReport({ content: '<html></html>', printMode: true })).not.toThrow();
      expect(window.open).toHaveBeenCalled();
    });

    it('should write to and print from the print window', () => {
      const printWindow = { document: { write: jest.fn(), close: jest.fn() }, print: jest.fn() };
      window.open = jest.fn(() => printWindow);
      downloadReport({ content: '<html></html>', printMode: true });
      expect(printWindow.document.write).toHaveBeenCalledWith('<html></html>');
      expect(printWindow.print).toHaveBeenCalled();
    });

    it('should reuse a Blob content as is', () => {
      const blob = new Blob(['pdf'], { type: 'application/pdf' });
      const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      downloadReport({ content: blob, filename: 'r.pdf', mimeType: 'application/pdf' });
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('should wrap string content in a Blob', () => {
      const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      downloadReport({ content: 'text', filename: 'r.md', mimeType: 'text/markdown' });
      expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
      clickSpy.mockRestore();
    });
  });
});
