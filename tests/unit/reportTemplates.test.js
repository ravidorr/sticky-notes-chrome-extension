/**
 * Report Templates Unit Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('Report Templates', () => {
  const localThis = {};

  beforeEach(async () => {
    // Import modules fresh for each test
    localThis.templatesModule = await import('../../src/shared/reportTemplates.js');
    localThis.getReportStyles = localThis.templatesModule.getReportStyles;
    localThis.getReportHTMLTemplate = localThis.templatesModule.getReportHTMLTemplate;
    localThis.getMarkdownTemplate = localThis.templatesModule.getMarkdownTemplate;
  });

  describe('getReportStyles', () => {
    it('should return CSS styles as string', () => {
      const styles = localThis.getReportStyles();
      
      expect(typeof styles).toBe('string');
      expect(styles.length).toBeGreaterThan(0);
    });

    it('should contain essential CSS rules', () => {
      const styles = localThis.getReportStyles();
      
      expect(styles).toContain('body');
      expect(styles).toContain('.report-container');
      expect(styles).toContain('.report-header');
      expect(styles).toContain('.note-card');
    });

    it('should include print media query', () => {
      const styles = localThis.getReportStyles();
      
      expect(styles).toContain('@media print');
    });

    it('should include comment styles', () => {
      const styles = localThis.getReportStyles();
      
      expect(styles).toContain('.note-comments');
      expect(styles).toContain('.comment');
    });

    it('should include metadata styles', () => {
      const styles = localThis.getReportStyles();
      
      expect(styles).toContain('.note-metadata');
      expect(styles).toContain('.metadata-grid');
    });
  });

  describe('getReportHTMLTemplate', () => {
    it('should generate valid HTML document', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test Report',
        generatedAt: '2025-01-15 10:00',
        userEmail: 'test@example.com',
        noteCount: 5,
        statsHTML: '<div>Stats</div>',
        notesHTML: '<div>Notes</div>',
        styles: 'body { color: red; }'
      });
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('should include title in head and header', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'My Custom Report',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).toContain('<title>My Custom Report</title>');
      expect(html).toContain('My Custom Report</h1>');
    });

    it('should include generation date', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '2025-01-15 10:00 AM',
        userEmail: '',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).toContain('Generated: 2025-01-15 10:00 AM');
    });

    it('should include user email when provided', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: 'user@example.com',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).toContain('By: user@example.com');
    });

    it('should not include user email when empty', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).not.toContain('By:');
    });

    it('should include note count', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 42,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).toContain('42 notes');
    });

    it('should include stats HTML', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        statsHTML: '<div class="custom-stats">Custom Stats Content</div>',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).toContain('Custom Stats Content');
    });

    it('should include notes HTML', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '<div class="custom-notes">Custom Notes Content</div>',
        styles: ''
      });
      
      expect(html).toContain('Custom Notes Content');
    });

    it('should include styles in head', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: '.custom-rule { color: blue; }'
      });
      
      expect(html).toContain('<style>.custom-rule { color: blue; }</style>');
    });

    it('should include footer', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).toContain('Generated by Sticky Notes Chrome Extension');
    });

    it('should escape HTML special characters in title', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test <script>alert("xss")</script>',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape HTML special characters in email', () => {
      const html = localThis.getReportHTMLTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '<script>alert("xss")</script>',
        noteCount: 0,
        statsHTML: '',
        notesHTML: '',
        styles: ''
      });
      
      expect(html).not.toContain('<script>alert("xss")</script></span>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('getMarkdownTemplate', () => {
    it('should generate valid Markdown document', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test Report',
        generatedAt: '2025-01-15 10:00',
        userEmail: 'test@example.com',
        noteCount: 5,
        stats: {
          total: 5,
          withComments: 2,
          byTheme: { yellow: 3, blue: 2 },
          byDomain: { 'example.com': 5 }
        },
        notesMarkdown: '### Note 1\n\nContent here'
      });
      
      expect(md).toContain('# Test Report');
    });

    it('should include generation date', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '2025-01-15 10:00 AM',
        userEmail: '',
        noteCount: 0,
        stats: { total: 0, withComments: 0, byTheme: {}, byDomain: {} },
        notesMarkdown: ''
      });
      
      expect(md).toContain('**Generated:** 2025-01-15 10:00 AM');
    });

    it('should include user email when provided', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: 'user@example.com',
        noteCount: 0,
        stats: { total: 0, withComments: 0, byTheme: {}, byDomain: {} },
        notesMarkdown: ''
      });
      
      expect(md).toContain('**By:** user@example.com');
    });

    it('should include note count', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 42,
        stats: { total: 42, withComments: 0, byTheme: {}, byDomain: {} },
        notesMarkdown: ''
      });
      
      expect(md).toContain('**Total Notes:** 42');
    });

    it('should include summary section', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 10,
        stats: {
          total: 10,
          withComments: 3,
          byTheme: { yellow: 5, blue: 3, green: 2 },
          byDomain: { 'example.com': 7, 'test.com': 3 }
        },
        notesMarkdown: ''
      });
      
      expect(md).toContain('## Summary');
      expect(md).toContain('**Notes with Comments:** 3');
    });

    it('should include theme breakdown', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 10,
        stats: {
          total: 10,
          withComments: 0,
          byTheme: { yellow: 5, blue: 3, pink: 2 },
          byDomain: {}
        },
        notesMarkdown: ''
      });
      
      expect(md).toContain('**By Theme:**');
      expect(md).toContain('- yellow: 5');
      expect(md).toContain('- blue: 3');
      expect(md).toContain('- pink: 2');
    });

    it('should only include themes with count > 0', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 5,
        stats: {
          total: 5,
          withComments: 0,
          byTheme: { yellow: 5, blue: 0, green: 0, pink: 0 },
          byDomain: {}
        },
        notesMarkdown: ''
      });
      
      expect(md).toContain('- yellow: 5');
      expect(md).not.toContain('- blue: 0');
      expect(md).not.toContain('- green: 0');
    });

    it('should include top domains', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 10,
        stats: {
          total: 10,
          withComments: 0,
          byTheme: {},
          byDomain: { 'example.com': 7, 'test.com': 3 }
        },
        notesMarkdown: ''
      });
      
      expect(md).toContain('**Top Domains:**');
      expect(md).toContain('- example.com: 7 notes');
      expect(md).toContain('- test.com: 3 notes');
    });

    it('should not include domains section when empty', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 5,
        stats: {
          total: 5,
          withComments: 0,
          byTheme: {},
          byDomain: {}
        },
        notesMarkdown: ''
      });
      
      expect(md).not.toContain('**Top Domains:**');
    });

    it('should include notes section', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 1,
        stats: { total: 1, withComments: 0, byTheme: {}, byDomain: {} },
        notesMarkdown: '### Note (yellow)\n\nThis is the note content'
      });
      
      expect(md).toContain('## Notes');
      expect(md).toContain('### Note (yellow)');
      expect(md).toContain('This is the note content');
    });

    it('should include footer', () => {
      const md = localThis.getMarkdownTemplate({
        title: 'Test',
        generatedAt: '',
        userEmail: '',
        noteCount: 0,
        stats: { total: 0, withComments: 0, byTheme: {}, byDomain: {} },
        notesMarkdown: ''
      });
      
      expect(md).toContain('*Generated by Sticky Notes Chrome Extension*');
    });
  });
});
