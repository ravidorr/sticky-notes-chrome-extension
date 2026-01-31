/**
 * Report Generator
 * Generates formatted reports from sticky notes in HTML, PDF, or Markdown format
 */

import { stripHtml, escapeHtml, THEME_COLORS, ENVIRONMENT_COLORS, formatRelativeTime } from './utils.js';
import { t } from './i18n.js';
import { getReportHTMLTemplate, getReportStyles, getMarkdownTemplate } from './reportTemplates.js';

/**
 * Valid report formats
 */
export const REPORT_FORMATS = {
  HTML: 'html',
  PDF: 'pdf',
  MARKDOWN: 'markdown'
};

/**
 * Valid report scopes
 */
export const REPORT_SCOPES = {
  CURRENT_PAGE: 'currentPage',
  ALL_NOTES: 'allNotes',
  SELECTED: 'selected',
  DATE_RANGE: 'dateRange'
};

/**
 * Default report options
 */
export const DEFAULT_REPORT_OPTIONS = {
  format: REPORT_FORMATS.HTML,
  scope: REPORT_SCOPES.ALL_NOTES,
  includeMetadata: true,
  includeComments: true,
  includeScreenshots: true,
  dateRange: null, // { start: Date, end: Date }
  selectedNoteIds: null // string[]
};

/**
 * ReportGenerator class
 * Generates formatted reports from notes data
 */
export class ReportGenerator {
  /**
   * Create a new ReportGenerator
   * @param {Object} options - Report generation options
   * @param {string} options.format - Output format ('html', 'pdf', 'markdown')
   * @param {string} options.scope - Report scope ('currentPage', 'allNotes', 'selected', 'dateRange')
   * @param {boolean} options.includeMetadata - Include note metadata
   * @param {boolean} options.includeComments - Include comment threads
   * @param {boolean} options.includeScreenshots - Include screenshots (if available)
   * @param {Object} options.dateRange - Date range for filtering { start: Date, end: Date }
   * @param {string[]} options.selectedNoteIds - IDs of selected notes (for 'selected' scope)
   * @param {Object} deps - Dependencies for testing
   */
  constructor(options = {}, deps = {}) {
    this.options = { ...DEFAULT_REPORT_OPTIONS, ...options };
    this.deps = deps;
  }

  /**
   * Generate a report from notes
   * @param {Array} notes - Array of notes to include
   * @param {Object} context - Additional context (userEmail, pageUrl, etc.)
   * @returns {Promise<Object>} Generated report { content, filename, mimeType }
   */
  async generate(notes, context = {}) {
    if (!notes || notes.length === 0) {
      throw new Error(t('noNotesForReport') || 'No notes to include in report');
    }

    // Filter notes based on scope
    const filteredNotes = this.filterNotes(notes);

    if (filteredNotes.length === 0) {
      throw new Error(t('noNotesForReport') || 'No notes match the selected criteria');
    }

    // Generate report based on format
    switch (this.options.format) {
      case REPORT_FORMATS.HTML:
        return this.renderHTML(filteredNotes, context);
      case REPORT_FORMATS.PDF:
        return await this.renderPDF(filteredNotes, context);
      case REPORT_FORMATS.MARKDOWN:
        return this.renderMarkdown(filteredNotes, context);
      default:
        throw new Error(`Unsupported format: ${this.options.format}`);
    }
  }

  /**
   * Filter notes based on scope options
   * @param {Array} notes - All notes
   * @returns {Array} Filtered notes
   */
  filterNotes(notes) {
    let filtered = [...notes];

    // Filter by selected IDs
    if (this.options.scope === REPORT_SCOPES.SELECTED && this.options.selectedNoteIds) {
      const selectedSet = new Set(this.options.selectedNoteIds);
      filtered = filtered.filter(note => selectedSet.has(note.id));
    }

    // Filter by date range
    if (this.options.scope === REPORT_SCOPES.DATE_RANGE && this.options.dateRange) {
      const { start, end } = this.options.dateRange;
      filtered = filtered.filter(note => {
        const noteDate = this.getNoteDate(note);
        if (!noteDate) return false;
        return (!start || noteDate >= start) && (!end || noteDate <= end);
      });
    }

    // Sort by creation date (newest first)
    filtered.sort((a, b) => {
      const dateA = this.getNoteDate(a);
      const dateB = this.getNoteDate(b);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB - dateA;
    });

    return filtered;
  }

  /**
   * Get the date from a note (handles various timestamp formats)
   * @param {Object} note - Note object
   * @returns {Date|null} Date object or null
   */
  getNoteDate(note) {
    const timestamp = note.createdAt || note.updatedAt;
    if (!timestamp) return null;

    // Handle Firestore Timestamp
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }

    // Handle serialized Firestore Timestamp
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000);
    }

    // Handle string or Date
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Format a date for display
   * @param {Date|Object|string} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDate(date) {
    const parsed = this.getNoteDate({ createdAt: date });
    if (!parsed) return 'Unknown';
    return parsed.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Generate statistics from notes
   * @param {Array} notes - Notes to analyze
   * @returns {Object} Statistics object
   */
  generateStats(notes) {
    const stats = {
      total: notes.length,
      byTheme: { yellow: 0, blue: 0, green: 0, pink: 0 },
      byDomain: {},
      byEnvironment: { local: 0, development: 0, staging: 0, production: 0 },
      withComments: 0
    };

    for (const note of notes) {
      // Count by theme
      const theme = note.theme || 'yellow';
      if (stats.byTheme[theme] !== undefined) {
        stats.byTheme[theme]++;
      }

      // Count by domain
      try {
        const url = note.url || note.metadata?.url;
        if (url) {
          const domain = new URL(url).hostname;
          stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
        }
      } catch {
        // Invalid URL, skip domain counting
      }

      // Count by environment
      const env = note.metadata?.environment || 'production';
      if (stats.byEnvironment[env] !== undefined) {
        stats.byEnvironment[env]++;
      }

      // Count notes with comments
      if (note.comments && note.comments.length > 0) {
        stats.withComments++;
      }
    }

    return stats;
  }

  /**
   * Render report as HTML
   * @param {Array} notes - Notes to include
   * @param {Object} context - Report context
   * @returns {Object} Report object { content, filename, mimeType }
   */
  renderHTML(notes, context = {}) {
    const stats = this.generateStats(notes);
    const generatedAt = new Date().toLocaleString();
    const title = t('reportTitle') || 'Sticky Notes Report';

    // Build notes HTML
    const notesHTML = notes.map(note => this.renderNoteHTML(note)).join('\n');

    // Build stats HTML
    const statsHTML = this.renderStatsHTML(stats);

    // Get full HTML document
    const html = getReportHTMLTemplate({
      title,
      generatedAt,
      userEmail: context.userEmail || '',
      noteCount: notes.length,
      statsHTML,
      notesHTML,
      styles: getReportStyles()
    });

    const filename = `sticky-notes-report-${this.getDateString()}.html`;

    return {
      content: html,
      filename,
      mimeType: 'text/html;charset=utf-8'
    };
  }

  /**
   * Render a single note as HTML
   * @param {Object} note - Note to render
   * @returns {string} HTML string
   */
  renderNoteHTML(note) {
    const theme = note.theme || 'yellow';
    const themeColor = THEME_COLORS[theme] || THEME_COLORS.yellow;
    const content = note.content || '';
    const createdAt = this.formatDate(note.createdAt);
    const url = note.url || note.metadata?.url || '';

    let html = `
    <div class="note-card" style="border-left-color: ${themeColor};">
      <div class="note-header">
        <span class="note-theme" style="background-color: ${themeColor};">${theme}</span>
        <span class="note-date">${escapeHtml(createdAt)}</span>
      </div>
      <div class="note-content">${content}</div>`;

    // Add URL
    if (url) {
      html += `
      <div class="note-url">
        <strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>
      </div>`;
    }

    // Add metadata if enabled
    if (this.options.includeMetadata && note.metadata) {
      html += this.renderMetadataHTML(note);
    }

    // Add comments if enabled
    if (this.options.includeComments && note.comments && note.comments.length > 0) {
      html += this.renderCommentsHTML(note.comments);
    }

    html += `
    </div>`;

    return html;
  }

  /**
   * Render note metadata as HTML
   * @param {Object} note - Note with metadata
   * @returns {string} HTML string
   */
  renderMetadataHTML(note) {
    const metadata = note.metadata || {};
    const env = metadata.environment || 'production';
    const envColor = ENVIRONMENT_COLORS[env] || ENVIRONMENT_COLORS.production;
    const selector = note.selector || '';

    let html = `
      <div class="note-metadata">
        <div class="metadata-header">Metadata</div>
        <div class="metadata-grid">`;

    if (metadata.browser) {
      html += `<div class="metadata-item"><strong>Browser:</strong> ${escapeHtml(metadata.browser)}</div>`;
    }
    if (metadata.viewport) {
      html += `<div class="metadata-item"><strong>Viewport:</strong> ${escapeHtml(metadata.viewport)}</div>`;
    }
    if (env) {
      html += `<div class="metadata-item"><strong>Environment:</strong> <span style="color: ${envColor};">${escapeHtml(env)}</span></div>`;
    }
    if (selector && selector !== '__PAGE__') {
      html += `<div class="metadata-item metadata-selector"><strong>Selector:</strong> <code>${escapeHtml(selector)}</code></div>`;
    }

    // Console errors
    if (metadata.consoleErrors && metadata.consoleErrors.length > 0) {
      html += `
        <div class="metadata-item metadata-errors">
          <strong>Console Errors (${metadata.consoleErrors.length}):</strong>
          <ul class="error-list">`;
      for (const error of metadata.consoleErrors.slice(0, 5)) {
        html += `<li class="error-item ${error.type || 'error'}">${escapeHtml(error.message || String(error))}</li>`;
      }
      if (metadata.consoleErrors.length > 5) {
        html += `<li class="error-more">... and ${metadata.consoleErrors.length - 5} more</li>`;
      }
      html += `
          </ul>
        </div>`;
    }

    html += `
        </div>
      </div>`;

    return html;
  }

  /**
   * Render comments as HTML
   * @param {Array} comments - Array of comments
   * @returns {string} HTML string
   */
  renderCommentsHTML(comments) {
    let html = `
      <div class="note-comments">
        <div class="comments-header">Comments (${comments.length})</div>
        <div class="comments-list">`;

    for (const comment of comments) {
      const authorName = comment.authorName || comment.authorEmail || 'Anonymous';
      const createdAt = formatRelativeTime(comment.createdAt);
      const isReply = !!comment.parentId;

      html += `
          <div class="comment ${isReply ? 'comment-reply' : ''}">
            <div class="comment-header">
              <span class="comment-author">${escapeHtml(authorName)}</span>
              <span class="comment-date">${escapeHtml(createdAt)}</span>
            </div>
            <div class="comment-content">${escapeHtml(comment.content)}</div>
          </div>`;
    }

    html += `
        </div>
      </div>`;

    return html;
  }

  /**
   * Render statistics as HTML
   * @param {Object} stats - Statistics object
   * @returns {string} HTML string
   */
  renderStatsHTML(stats) {
    // Theme breakdown
    let themeHTML = '<div class="stats-themes">';
    for (const [theme, count] of Object.entries(stats.byTheme)) {
      if (count > 0) {
        const color = THEME_COLORS[theme] || THEME_COLORS.yellow;
        themeHTML += `<span class="theme-stat" style="background-color: ${color};">${theme}: ${count}</span>`;
      }
    }
    themeHTML += '</div>';

    // Domain breakdown (top 5)
    const sortedDomains = Object.entries(stats.byDomain)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    let domainHTML = '<div class="stats-domains"><strong>Top Domains:</strong>';
    if (sortedDomains.length > 0) {
      domainHTML += '<ul>';
      for (const [domain, count] of sortedDomains) {
        domainHTML += `<li>${escapeHtml(domain)}: ${count} notes</li>`;
      }
      domainHTML += '</ul>';
    } else {
      domainHTML += ' None';
    }
    domainHTML += '</div>';

    return `
      <div class="report-stats">
        <div class="stats-summary">
          <div class="stat-item"><strong>Total Notes:</strong> ${stats.total}</div>
          <div class="stat-item"><strong>Notes with Comments:</strong> ${stats.withComments}</div>
        </div>
        ${themeHTML}
        ${domainHTML}
      </div>`;
  }

  /**
   * Render report as PDF
   * Uses html2pdf.js if available, otherwise falls back to print
   * @param {Array} notes - Notes to include
   * @param {Object} context - Report context
   * @returns {Promise<Object>} Report object { content, filename, mimeType }
   */
  async renderPDF(notes, context = {}) {
    // First generate HTML
    const htmlReport = this.renderHTML(notes, context);

    // Check if html2pdf is available (it would be loaded dynamically)
    const html2pdf = this.deps.html2pdf || (typeof window !== 'undefined' && window.html2pdf);

    if (html2pdf) {
      try {
        const pdfBlob = await html2pdf()
          .from(htmlReport.content)
          .set({
            margin: [10, 10, 10, 10],
            filename: `sticky-notes-report-${this.getDateString()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          })
          .outputPdf('blob');

        return {
          content: pdfBlob,
          filename: `sticky-notes-report-${this.getDateString()}.pdf`,
          mimeType: 'application/pdf'
        };
      } catch (error) {
        // PDF generation failed, fall back to HTML
        // Fall back to HTML
        return {
          ...htmlReport,
          filename: htmlReport.filename.replace('.html', '-print.html'),
          printMode: true
        };
      }
    }

    // No html2pdf available - return HTML with print instructions
    return {
      ...htmlReport,
      filename: htmlReport.filename.replace('.html', '-print.html'),
      printMode: true
    };
  }

  /**
   * Render report as Markdown
   * @param {Array} notes - Notes to include
   * @param {Object} context - Report context
   * @returns {Object} Report object { content, filename, mimeType }
   */
  renderMarkdown(notes, context = {}) {
    const stats = this.generateStats(notes);
    const generatedAt = new Date().toLocaleString();
    const title = t('reportTitle') || 'Sticky Notes Report';

    // Build notes markdown
    const notesMarkdown = notes.map(note => this.renderNoteMarkdown(note)).join('\n\n---\n\n');

    // Get full markdown document
    const markdown = getMarkdownTemplate({
      title,
      generatedAt,
      userEmail: context.userEmail || '',
      noteCount: notes.length,
      stats,
      notesMarkdown
    });

    const filename = `sticky-notes-report-${this.getDateString()}.md`;

    return {
      content: markdown,
      filename,
      mimeType: 'text/markdown;charset=utf-8'
    };
  }

  /**
   * Render a single note as Markdown
   * @param {Object} note - Note to render
   * @returns {string} Markdown string
   */
  renderNoteMarkdown(note) {
    const theme = note.theme || 'yellow';
    const content = stripHtml(note.content || '').trim();
    const createdAt = this.formatDate(note.createdAt);
    const url = note.url || note.metadata?.url || '';

    let md = `### Note (${theme})\n\n`;
    md += `**Created:** ${createdAt}\n\n`;

    if (content) {
      md += `${content}\n\n`;
    }

    if (url) {
      md += `**URL:** ${url}\n\n`;
    }

    // Add metadata if enabled
    if (this.options.includeMetadata && note.metadata) {
      md += this.renderMetadataMarkdown(note);
    }

    // Add comments if enabled
    if (this.options.includeComments && note.comments && note.comments.length > 0) {
      md += this.renderCommentsMarkdown(note.comments);
    }

    return md;
  }

  /**
   * Render note metadata as Markdown
   * @param {Object} note - Note with metadata
   * @returns {string} Markdown string
   */
  renderMetadataMarkdown(note) {
    const metadata = note.metadata || {};
    const selector = note.selector || '';

    let md = '**Metadata:**\n\n';
    
    if (metadata.browser) {
      md += `- Browser: ${metadata.browser}\n`;
    }
    if (metadata.viewport) {
      md += `- Viewport: ${metadata.viewport}\n`;
    }
    if (metadata.environment) {
      md += `- Environment: ${metadata.environment}\n`;
    }
    if (selector && selector !== '__PAGE__') {
      md += `- Selector: \`${selector}\`\n`;
    }

    // Console errors
    if (metadata.consoleErrors && metadata.consoleErrors.length > 0) {
      md += `\n**Console Errors (${metadata.consoleErrors.length}):**\n\n`;
      for (const error of metadata.consoleErrors.slice(0, 5)) {
        md += `- ${error.message || String(error)}\n`;
      }
      if (metadata.consoleErrors.length > 5) {
        md += `- ... and ${metadata.consoleErrors.length - 5} more\n`;
      }
    }

    md += '\n';
    return md;
  }

  /**
   * Render comments as Markdown
   * @param {Array} comments - Array of comments
   * @returns {string} Markdown string
   */
  renderCommentsMarkdown(comments) {
    let md = `**Comments (${comments.length}):**\n\n`;

    for (const comment of comments) {
      const authorName = comment.authorName || comment.authorEmail || 'Anonymous';
      const createdAt = formatRelativeTime(comment.createdAt);
      const isReply = !!comment.parentId;
      const indent = isReply ? '  ' : '';

      md += `${indent}- **${authorName}** (${createdAt}):\n`;
      md += `${indent}  ${comment.content}\n\n`;
    }

    return md;
  }

  /**
   * Get a date string for filenames
   * @returns {string} Date string in YYYY-MM-DD format
   */
  getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
}

/**
 * Download a report file
 * @param {Object} report - Report object from generate()
 */
export function downloadReport(report) {
  if (!report || !report.content) {
    throw new Error('Invalid report object');
  }

  // Handle print mode for PDF fallback
  if (report.printMode) {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(report.content);
      printWindow.document.close();
      printWindow.print();
    }
    return;
  }

  // Create blob and download
  const blob = report.content instanceof Blob 
    ? report.content 
    : new Blob([report.content], { type: report.mimeType });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
