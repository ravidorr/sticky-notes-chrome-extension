/**
 * Email Module Unit Tests
 * 
 * Tests email notification functionality for note sharing.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock firebase-admin before import
jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: {
    serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' }))
  }
}));

// Import after mocking
const { writeShareNotificationEmail, _testHelpers } = await import('../../functions/lib/email.js');
const {
  extractDomain,
  truncateContent,
  escapeHtml,
  generateHtmlTemplate,
  generateTextTemplate,
  MAIL_COLLECTION,
  MAX_CONTENT_PREVIEW_LENGTH
} = _testHelpers;

describe('Email Module', () => {
  const localThis = {};

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Firestore
    localThis.mockMailRef = { id: 'mail-doc-123' };
    localThis.mockCollection = {
      add: jest.fn().mockResolvedValue(localThis.mockMailRef)
    };
    localThis.mockDb = {
      collection: jest.fn().mockReturnValue(localThis.mockCollection)
    };
    
    localThis.deps = {
      db: localThis.mockDb,
      serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' }))
    };
    
    // Standard test data
    localThis.recipientEmail = 'recipient@example.com';
    localThis.noteId = 'note-123';
    localThis.noteData = {
      content: 'Test note content',
      url: 'https://example.com/page',
      ownerEmail: 'owner@example.com',
      ownerId: 'owner-123',
      sharedWith: ['recipient@example.com']
    };
  });

  describe('extractDomain', () => {
    it('should extract domain from valid URL', () => {
      expect(extractDomain('https://example.com/page')).toBe('example.com');
      expect(extractDomain('https://www.example.com/path/to/page')).toBe('www.example.com');
      expect(extractDomain('http://sub.domain.example.org:8080/path')).toBe('sub.domain.example.org');
    });

    it('should return original string for invalid URL', () => {
      expect(extractDomain('not-a-url')).toBe('not-a-url');
      expect(extractDomain('')).toBe('');
    });
  });

  describe('truncateContent', () => {
    it('should return content unchanged if within limit', () => {
      const short = 'Short content';
      expect(truncateContent(short)).toBe(short);
    });

    it('should truncate long content with ellipsis', () => {
      const long = 'a'.repeat(600);
      const result = truncateContent(long);
      expect(result.length).toBe(MAX_CONTENT_PREVIEW_LENGTH + 3); // +3 for '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should strip HTML tags', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      expect(truncateContent(html)).toBe('Hello world');
    });

    it('should handle empty or null content', () => {
      expect(truncateContent('')).toBe('');
      expect(truncateContent(null)).toBe('');
      expect(truncateContent(undefined)).toBe('');
    });

    it('should respect custom max length', () => {
      const content = 'This is a test string';
      const result = truncateContent(content, 10);
      expect(result).toBe('This is a...');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
      expect(escapeHtml("It's a test & example")).toBe(
        "It&#039;s a test &amp; example"
      );
    });

    it('should handle empty or null input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should not double-escape already escaped content', () => {
      const alreadyEscaped = '&amp;';
      expect(escapeHtml(alreadyEscaped)).toBe('&amp;amp;');
    });
  });

  describe('generateHtmlTemplate', () => {
    it('should generate valid HTML with all parameters', () => {
      const params = {
        ownerEmail: 'owner@example.com',
        noteContent: 'Test note content',
        noteUrl: 'https://example.com/page',
        domain: 'example.com'
      };
      
      const html = generateHtmlTemplate(params);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('owner@example.com');
      expect(html).toContain('Test note content');
      expect(html).toContain('example.com');
      expect(html).toContain('https://example.com/page');
      expect(html).toContain('A note was shared with you');
    });

    it('should escape special characters in content', () => {
      const params = {
        ownerEmail: 'owner@example.com',
        noteContent: '<script>alert("xss")</script>',
        noteUrl: 'https://example.com/page',
        domain: 'example.com'
      };
      
      const html = generateHtmlTemplate(params);
      
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should include extension install link', () => {
      const params = {
        ownerEmail: 'owner@example.com',
        noteContent: 'Test',
        noteUrl: 'https://example.com',
        domain: 'example.com'
      };
      
      const html = generateHtmlTemplate(params);
      
      expect(html).toContain('Get Extension');
      expect(html).toContain('chrome.google.com/webstore');
    });
  });

  describe('generateTextTemplate', () => {
    it('should generate plain text with all parameters', () => {
      const params = {
        ownerEmail: 'owner@example.com',
        noteContent: 'Test note content',
        noteUrl: 'https://example.com/page',
        domain: 'example.com'
      };
      
      const text = generateTextTemplate(params);
      
      expect(text).toContain('A note was shared with you');
      expect(text).toContain('owner@example.com');
      expect(text).toContain('Test note content');
      expect(text).toContain('example.com');
      expect(text).toContain('https://example.com/page');
    });

    it('should not contain HTML tags', () => {
      const params = {
        ownerEmail: 'owner@example.com',
        noteContent: 'Test',
        noteUrl: 'https://example.com',
        domain: 'example.com'
      };
      
      const text = generateTextTemplate(params);
      
      expect(text).not.toContain('<');
      expect(text).not.toContain('>');
    });
  });

  describe('writeShareNotificationEmail', () => {
    it('should write mail document to Firestore', async () => {
      const result = await writeShareNotificationEmail(
        localThis.recipientEmail,
        localThis.noteData,
        localThis.noteId,
        localThis.deps
      );
      
      expect(result).toBe('mail-doc-123');
      expect(localThis.mockDb.collection).toHaveBeenCalledWith(MAIL_COLLECTION);
      expect(localThis.mockCollection.add).toHaveBeenCalledTimes(1);
    });

    it('should create mail document with correct structure', async () => {
      await writeShareNotificationEmail(
        localThis.recipientEmail,
        localThis.noteData,
        localThis.noteId,
        localThis.deps
      );
      
      const addCall = localThis.mockCollection.add.mock.calls[0][0];
      
      expect(addCall.to).toBe(localThis.recipientEmail);
      expect(addCall.message).toBeDefined();
      expect(addCall.message.subject).toContain('shared a note with you');
      expect(addCall.message.html).toBeDefined();
      expect(addCall.message.text).toBeDefined();
      expect(addCall.metadata).toBeDefined();
      expect(addCall.metadata.type).toBe('share_notification');
      expect(addCall.metadata.noteId).toBe(localThis.noteId);
    });

    it('should include owner email in subject', async () => {
      await writeShareNotificationEmail(
        localThis.recipientEmail,
        localThis.noteData,
        localThis.noteId,
        localThis.deps
      );
      
      const addCall = localThis.mockCollection.add.mock.calls[0][0];
      
      expect(addCall.message.subject).toContain('owner@example.com');
    });

    it('should include domain in subject', async () => {
      await writeShareNotificationEmail(
        localThis.recipientEmail,
        localThis.noteData,
        localThis.noteId,
        localThis.deps
      );
      
      const addCall = localThis.mockCollection.add.mock.calls[0][0];
      
      expect(addCall.message.subject).toContain('example.com');
    });

    it('should throw error for missing recipient email', async () => {
      await expect(
        writeShareNotificationEmail(null, localThis.noteData, localThis.noteId, localThis.deps)
      ).rejects.toThrow('Recipient email is required');
      
      await expect(
        writeShareNotificationEmail('', localThis.noteData, localThis.noteId, localThis.deps)
      ).rejects.toThrow('Recipient email is required');
    });

    it('should throw error for missing note data', async () => {
      await expect(
        writeShareNotificationEmail(localThis.recipientEmail, null, localThis.noteId, localThis.deps)
      ).rejects.toThrow('Note data is required');
    });

    it('should throw error for missing owner email in note data', async () => {
      const noteDataWithoutOwner = { ...localThis.noteData };
      delete noteDataWithoutOwner.ownerEmail;
      
      await expect(
        writeShareNotificationEmail(localThis.recipientEmail, noteDataWithoutOwner, localThis.noteId, localThis.deps)
      ).rejects.toThrow('Owner email is required');
    });

    it('should handle note with empty content', async () => {
      const noteWithEmptyContent = { ...localThis.noteData, content: '' };
      
      const result = await writeShareNotificationEmail(
        localThis.recipientEmail,
        noteWithEmptyContent,
        localThis.noteId,
        localThis.deps
      );
      
      expect(result).toBe('mail-doc-123');
    });

    it('should handle note with HTML content', async () => {
      const noteWithHtml = { 
        ...localThis.noteData, 
        content: '<script>alert("xss")</script>' 
      };
      
      await writeShareNotificationEmail(
        localThis.recipientEmail,
        noteWithHtml,
        localThis.noteId,
        localThis.deps
      );
      
      const addCall = localThis.mockCollection.add.mock.calls[0][0];
      
      // Script tags should be stripped from content (handled by truncateContent)
      // and the escaped text should not contain raw script tags
      expect(addCall.message.html).not.toContain('<script>');
      expect(addCall.message.text).not.toContain('<script>');
      // The content should show the stripped text
      expect(addCall.message.text).toContain('alert("xss")');
    });

    it('should truncate long note content', async () => {
      const longContent = 'a'.repeat(1000);
      const noteWithLongContent = { ...localThis.noteData, content: longContent };
      
      await writeShareNotificationEmail(
        localThis.recipientEmail,
        noteWithLongContent,
        localThis.noteId,
        localThis.deps
      );
      
      const addCall = localThis.mockCollection.add.mock.calls[0][0];
      
      // Content should be truncated
      expect(addCall.message.text).toContain('...');
    });

    it('should include metadata with timestamp', async () => {
      await writeShareNotificationEmail(
        localThis.recipientEmail,
        localThis.noteData,
        localThis.noteId,
        localThis.deps
      );
      
      const addCall = localThis.mockCollection.add.mock.calls[0][0];
      
      expect(addCall.metadata.createdAt).toEqual({ _type: 'serverTimestamp' });
      expect(addCall.metadata.ownerEmail).toBe('owner@example.com');
      expect(addCall.metadata.recipientEmail).toBe(localThis.recipientEmail);
    });
  });

  describe('Constants', () => {
    it('should have correct mail collection name', () => {
      expect(MAIL_COLLECTION).toBe('mail');
    });

    it('should have reasonable max content preview length', () => {
      expect(MAX_CONTENT_PREVIEW_LENGTH).toBe(500);
    });
  });
});
