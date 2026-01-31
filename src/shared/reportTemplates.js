/**
 * Report Templates
 * HTML and Markdown templates for report generation
 */

/**
 * Get CSS styles for HTML reports
 * Self-contained styles for portability
 * @returns {string} CSS styles
 */
export function getReportStyles() {
  return `
    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 20px;
    }

    .report-container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .report-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 24px 32px;
    }

    .report-title {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
    }

    .report-meta {
      font-size: 14px;
      opacity: 0.9;
    }

    .report-meta span {
      margin-right: 16px;
    }

    .report-body {
      padding: 24px 32px;
    }

    .report-stats {
      background: #f3f4f6;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }

    .stats-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 12px;
    }

    .stat-item {
      font-size: 14px;
    }

    .stats-themes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .theme-stat {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      color: #1f2937;
    }

    .stats-domains {
      font-size: 14px;
    }

    .stats-domains ul {
      margin: 8px 0 0 0;
      padding-left: 20px;
    }

    .stats-domains li {
      margin: 4px 0;
    }

    .notes-section {
      margin-top: 24px;
    }

    .notes-section-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }

    .note-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-left: 4px solid #facc15;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }

    .note-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .note-theme {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #1f2937;
    }

    .note-date {
      font-size: 12px;
      color: #6b7280;
    }

    .note-content {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 12px;
    }

    .note-content p {
      margin: 0 0 8px 0;
    }

    .note-content ul, .note-content ol {
      margin: 8px 0;
      padding-left: 24px;
    }

    .note-content a {
      color: #3b82f6;
      text-decoration: none;
    }

    .note-content a:hover {
      text-decoration: underline;
    }

    .note-url {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 12px;
      word-break: break-all;
    }

    .note-url a {
      color: #3b82f6;
      text-decoration: none;
    }

    .note-url a:hover {
      text-decoration: underline;
    }

    .note-metadata {
      background: #f9fafb;
      border-radius: 6px;
      padding: 12px 16px;
      margin-top: 12px;
      font-size: 13px;
    }

    .metadata-header {
      font-weight: 600;
      margin-bottom: 8px;
      color: #4b5563;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 8px;
    }

    .metadata-item {
      color: #6b7280;
    }

    .metadata-item strong {
      color: #4b5563;
    }

    .metadata-selector {
      grid-column: 1 / -1;
    }

    .metadata-selector code {
      background: #e5e7eb;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      word-break: break-all;
    }

    .metadata-errors {
      grid-column: 1 / -1;
      margin-top: 8px;
    }

    .error-list {
      margin: 8px 0 0 0;
      padding-left: 20px;
    }

    .error-item {
      margin: 4px 0;
      font-family: monospace;
      font-size: 12px;
    }

    .error-item.console\\.error {
      color: #dc2626;
    }

    .error-item.console\\.warn {
      color: #d97706;
    }

    .error-item.exception {
      color: #dc2626;
      font-weight: 500;
    }

    .error-more {
      color: #6b7280;
      font-style: italic;
    }

    .note-comments {
      border-top: 1px solid #e5e7eb;
      margin-top: 16px;
      padding-top: 12px;
    }

    .comments-header {
      font-weight: 600;
      font-size: 13px;
      color: #4b5563;
      margin-bottom: 12px;
    }

    .comments-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .comment {
      background: #f9fafb;
      border-radius: 6px;
      padding: 10px 14px;
    }

    .comment-reply {
      margin-left: 24px;
      border-left: 2px solid #d1d5db;
    }

    .comment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .comment-author {
      font-weight: 500;
      font-size: 13px;
      color: #374151;
    }

    .comment-date {
      font-size: 11px;
      color: #9ca3af;
    }

    .comment-content {
      font-size: 13px;
      color: #4b5563;
    }

    .report-footer {
      text-align: center;
      padding: 16px 32px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .report-container {
        box-shadow: none;
        border-radius: 0;
      }

      .note-card {
        break-inside: avoid;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .note-url a::after {
        content: ' (' attr(href) ')';
        font-size: 11px;
        color: #6b7280;
      }
    }
  `;
}

/**
 * Get full HTML template for reports
 * @param {Object} options - Template options
 * @param {string} options.title - Report title
 * @param {string} options.generatedAt - Generation timestamp
 * @param {string} options.userEmail - User email
 * @param {number} options.noteCount - Total note count
 * @param {string} options.statsHTML - Pre-rendered stats HTML
 * @param {string} options.notesHTML - Pre-rendered notes HTML
 * @param {string} options.styles - CSS styles
 * @returns {string} Complete HTML document
 */
export function getReportHTMLTemplate(options) {
  const {
    title,
    generatedAt,
    userEmail,
    noteCount,
    statsHTML,
    notesHTML,
    styles
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeForHTML(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="report-container">
    <header class="report-header">
      <h1 class="report-title">${escapeForHTML(title)}</h1>
      <div class="report-meta">
        <span>Generated: ${escapeForHTML(generatedAt)}</span>
        ${userEmail ? `<span>By: ${escapeForHTML(userEmail)}</span>` : ''}
        <span>${noteCount} notes</span>
      </div>
    </header>

    <main class="report-body">
      ${statsHTML}

      <section class="notes-section">
        <h2 class="notes-section-title">Notes</h2>
        ${notesHTML}
      </section>
    </main>

    <footer class="report-footer">
      Generated by Sticky Notes Chrome Extension
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Get Markdown template for reports
 * @param {Object} options - Template options
 * @param {string} options.title - Report title
 * @param {string} options.generatedAt - Generation timestamp
 * @param {string} options.userEmail - User email
 * @param {number} options.noteCount - Total note count
 * @param {Object} options.stats - Statistics object
 * @param {string} options.notesMarkdown - Pre-rendered notes markdown
 * @returns {string} Complete Markdown document
 */
export function getMarkdownTemplate(options) {
  const {
    title,
    generatedAt,
    userEmail,
    noteCount,
    stats,
    notesMarkdown
  } = options;

  let md = `# ${title}\n\n`;
  md += `**Generated:** ${generatedAt}`;
  if (userEmail) {
    md += ` | **By:** ${userEmail}`;
  }
  md += ` | **Total Notes:** ${noteCount}\n\n`;

  // Stats section
  md += '## Summary\n\n';
  md += `- **Total Notes:** ${stats.total}\n`;
  md += `- **Notes with Comments:** ${stats.withComments}\n\n`;

  // Theme breakdown
  md += '**By Theme:**\n';
  for (const [theme, count] of Object.entries(stats.byTheme)) {
    if (count > 0) {
      md += `- ${theme}: ${count}\n`;
    }
  }
  md += '\n';

  // Domain breakdown
  const sortedDomains = Object.entries(stats.byDomain)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedDomains.length > 0) {
    md += '**Top Domains:**\n';
    for (const [domain, count] of sortedDomains) {
      md += `- ${domain}: ${count} notes\n`;
    }
    md += '\n';
  }

  // Notes section
  md += '## Notes\n\n';
  md += notesMarkdown;
  md += '\n\n---\n\n';
  md += '*Generated by Sticky Notes Chrome Extension*\n';

  return md;
}

/**
 * Escape string for safe HTML insertion
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeForHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
