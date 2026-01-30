/**
 * Email utilities for sending notifications via Firebase Trigger Email Extension.
 * 
 * This module writes documents to the 'mail' collection in Firestore,
 * which are then processed by the Firebase Trigger Email extension.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Collection name that the Firebase Trigger Email extension watches
const MAIL_COLLECTION = 'mail';

// Maximum length for note content preview in emails
const MAX_CONTENT_PREVIEW_LENGTH = 500;

// Chrome Web Store URL for the extension (update with actual URL when published)
const EXTENSION_INSTALL_URL = process.env.EXTENSION_INSTALL_URL || 
  'https://chrome.google.com/webstore/detail/sticky-notes';

/**
 * Extracts the domain from a URL for display purposes.
 * 
 * @param {string} url - The full URL
 * @returns {string} The domain (e.g., "example.com")
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * Truncates content to a maximum length, adding ellipsis if needed.
 * Also strips HTML tags for plain text display.
 * 
 * @param {string} content - The content to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated content
 */
function truncateContent(content, maxLength = MAX_CONTENT_PREVIEW_LENGTH) {
  if (!content) return '';
  
  // Strip HTML tags for plain text preview
  const plainText = content.replace(/<[^>]*>/g, '').trim();
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  return plainText.substring(0, maxLength).trim() + '...';
}

/**
 * Escapes HTML special characters for safe display in HTML emails.
 * 
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates the HTML email template for share notifications.
 * 
 * @param {Object} params - Template parameters
 * @param {string} params.ownerEmail - Email of the person who shared the note
 * @param {string} params.noteContent - Content of the note
 * @param {string} params.noteUrl - URL where the note is attached
 * @param {string} params.domain - Domain of the note URL
 * @returns {string} HTML email content
 */
function generateHtmlTemplate({ ownerEmail, noteContent, noteUrl, domain }) {
  const escapedOwnerEmail = escapeHtml(ownerEmail);
  const escapedContent = escapeHtml(noteContent);
  const escapedUrl = escapeHtml(noteUrl);
  const escapedDomain = escapeHtml(domain);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A note was shared with you</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      border-bottom: 2px solid #ffd700;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #333;
      font-size: 24px;
      margin: 0;
    }
    .note-card {
      background-color: #fffacd;
      border: 1px solid #f0e68c;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .note-content {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin: 15px 0;
    }
    .button {
      display: inline-block;
      background-color: #4a90d9;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 500;
      margin: 10px 5px 10px 0;
    }
    .button:hover {
      background-color: #3a7fc9;
    }
    .button-secondary {
      background-color: #6c757d;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #888;
      font-size: 12px;
    }
    .footer a {
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>A note was shared with you</h1>
    </div>
    
    <p><strong>${escapedOwnerEmail}</strong> shared a sticky note with you on <strong>${escapedDomain}</strong>.</p>
    
    <div class="note-card">
      <div class="note-content">${escapedContent}</div>
    </div>
    
    <div class="meta">
      <strong>Page:</strong> <a href="${escapedUrl}">${escapedUrl}</a>
    </div>
    
    <p>To view this note in context:</p>
    <ol>
      <li>Install the Sticky Notes Chrome Extension (if you haven't already)</li>
      <li>Sign in with this email address</li>
      <li>Visit the page linked above</li>
    </ol>
    
    <a href="${escapedUrl}" class="button">View Page</a>
    <a href="${EXTENSION_INSTALL_URL}" class="button button-secondary">Get Extension</a>
    
    <div class="footer">
      <p>This email was sent because someone shared a sticky note with you using the Sticky Notes Chrome Extension.</p>
      <p>If you did not expect this email, you can safely ignore it.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates the plain text email template for share notifications.
 * 
 * @param {Object} params - Template parameters
 * @param {string} params.ownerEmail - Email of the person who shared the note
 * @param {string} params.noteContent - Content of the note
 * @param {string} params.noteUrl - URL where the note is attached
 * @param {string} params.domain - Domain of the note URL
 * @returns {string} Plain text email content
 */
function generateTextTemplate({ ownerEmail, noteContent, noteUrl, domain }) {
  return `A note was shared with you

${ownerEmail} shared a sticky note with you on ${domain}.

---
${noteContent}
---

Page: ${noteUrl}

To view this note in context:
1. Install the Sticky Notes Chrome Extension (if you haven't already)
2. Sign in with this email address
3. Visit the page linked above

View Page: ${noteUrl}
Get Extension: ${EXTENSION_INSTALL_URL}

---
This email was sent because someone shared a sticky note with you using the Sticky Notes Chrome Extension.
If you did not expect this email, you can safely ignore it.`;
}

/**
 * Writes a share notification email to the mail collection.
 * The Firebase Trigger Email extension will process this and send the email.
 * 
 * @param {string} recipientEmail - Email address of the recipient
 * @param {Object} noteData - The note data from Firestore
 * @param {string} noteData.content - Note content
 * @param {string} noteData.url - URL where note is attached
 * @param {string} noteData.ownerEmail - Email of note owner
 * @param {string} noteId - The note's document ID
 * @param {Object} deps - Optional dependencies for testing
 * @returns {Promise<string>} The document ID of the created mail document
 */
export async function writeShareNotificationEmail(recipientEmail, noteData, noteId, deps = {}) {
  const db = deps.db || getFirestore();
  
  // Validate inputs
  if (!recipientEmail || typeof recipientEmail !== 'string') {
    throw new Error('Recipient email is required');
  }
  
  if (!noteData || typeof noteData !== 'object') {
    throw new Error('Note data is required');
  }
  
  if (!noteData.ownerEmail) {
    throw new Error('Owner email is required in note data');
  }
  
  const ownerEmail = noteData.ownerEmail;
  const noteContent = truncateContent(noteData.content || '');
  const noteUrl = noteData.url || '';
  const domain = extractDomain(noteUrl);
  
  // Generate email subject
  const subject = `${ownerEmail} shared a note with you on ${domain}`;
  
  // Generate email body templates
  const templateParams = { ownerEmail, noteContent, noteUrl, domain };
  const html = generateHtmlTemplate(templateParams);
  const text = generateTextTemplate(templateParams);
  
  // Create the mail document for Firebase Trigger Email extension
  const mailDoc = {
    to: recipientEmail,
    message: {
      subject,
      html,
      text
    },
    // Metadata for tracking
    metadata: {
      type: 'share_notification',
      noteId,
      ownerEmail,
      recipientEmail,
      createdAt: deps.serverTimestamp ? deps.serverTimestamp() : FieldValue.serverTimestamp()
    }
  };
  
  // Write to the mail collection
  const mailRef = await db.collection(MAIL_COLLECTION).add(mailDoc);
  
  console.log(`Created share notification email for ${recipientEmail}, mail doc: ${mailRef.id}`);
  
  return mailRef.id;
}

// Export helper functions for testing
export const _testHelpers = {
  extractDomain,
  truncateContent,
  escapeHtml,
  generateHtmlTemplate,
  generateTextTemplate,
  MAIL_COLLECTION,
  MAX_CONTENT_PREVIEW_LENGTH
};
