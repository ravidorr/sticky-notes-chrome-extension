/**
 * RichEditor Component Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let RichEditor;

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '';
  
  // Mock import.meta.env
  globalThis.import = { meta: { env: {} } };
  
  // Import module fresh for each test
  const module = await import('../../src/content/components/RichEditor.js');
  RichEditor = module.RichEditor;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RichEditor', () => {
  let editor;
  
  beforeEach(() => {
    editor = new RichEditor({
      content: '',
      placeholder: 'Write here...',
      onChange: jest.fn()
    });
    document.body.appendChild(editor.element);
  });
  
  afterEach(() => {
    if (editor && editor.element && editor.element.parentNode) {
      editor.destroy();
    }
  });
  
  describe('constructor', () => {
    it('should create editor element', () => {
      expect(editor.element).not.toBeNull();
      expect(editor.element.className).toBe('sn-rich-editor');
    });
    
    it('should create toolbar', () => {
      expect(editor.toolbar).not.toBeNull();
      expect(editor.toolbar.className).toBe('sn-editor-toolbar');
    });
    
    it('should create contenteditable editor area', () => {
      expect(editor.editor).not.toBeNull();
      expect(editor.editor.contentEditable).toBe('true');
    });
    
    it('should set placeholder', () => {
      expect(editor.editor.dataset.placeholder).toBe('Write here...');
    });
    
    it('should initialize with provided content', () => {
      const editorWithContent = new RichEditor({
        content: '<b>Bold text</b>'
      });
      expect(editorWithContent.editor.innerHTML).toBe('<b>Bold text</b>');
    });
  });
  
  describe('toolbar buttons', () => {
    it('should have bold button', () => {
      const boldBtn = editor.toolbar.querySelector('[data-command="bold"]');
      expect(boldBtn).not.toBeNull();
      expect(boldBtn.title).toContain('Bold');
    });
    
    it('should have italic button', () => {
      const italicBtn = editor.toolbar.querySelector('[data-command="italic"]');
      expect(italicBtn).not.toBeNull();
      expect(italicBtn.title).toContain('Italic');
    });
    
    it('should have unordered list button', () => {
      const ulBtn = editor.toolbar.querySelector('[data-command="insertUnorderedList"]');
      expect(ulBtn).not.toBeNull();
    });
    
    it('should have ordered list button', () => {
      const olBtn = editor.toolbar.querySelector('[data-command="insertOrderedList"]');
      expect(olBtn).not.toBeNull();
    });
    
    it('should have link button', () => {
      const linkBtn = editor.toolbar.querySelector('[data-command="createLink"]');
      expect(linkBtn).not.toBeNull();
    });
  });
  
  describe('getContent', () => {
    it('should return editor HTML content', () => {
      editor.editor.innerHTML = '<p>Test content</p>';
      expect(editor.getContent()).toBe('<p>Test content</p>');
    });
  });
  
  describe('setContent', () => {
    it('should set editor HTML content', () => {
      editor.setContent('<b>New content</b>');
      expect(editor.editor.innerHTML).toBe('<b>New content</b>');
    });
    
    it('should handle empty content', () => {
      editor.setContent('');
      expect(editor.editor.innerHTML).toBe('');
    });
    
    it('should handle null content', () => {
      editor.setContent(null);
      expect(editor.editor.innerHTML).toBe('');
    });
  });
  
  describe('getPlainText', () => {
    it('should return plain text without HTML', () => {
      editor.editor.innerHTML = '<b>Bold</b> and <i>italic</i>';
      expect(editor.getPlainText()).toBe('Bold and italic');
    });
  });
  
  describe('focus', () => {
    it('should call focus on the editor', () => {
      // Note: JSDOM doesn't fully support focus, so we just verify the method exists
      const focusSpy = jest.spyOn(editor.editor, 'focus');
      editor.focus();
      expect(focusSpy).toHaveBeenCalled();
    });
  });
  
  describe('cleanHtml', () => {
    it('should remove script tags', () => {
      const dirty = '<p>Hello</p><script>alert("xss")</script>';
      const clean = editor.cleanHtml(dirty);
      expect(clean).not.toContain('<script>');
    });
    
    it('should remove style tags', () => {
      const dirty = '<p>Hello</p><style>.red { color: red }</style>';
      const clean = editor.cleanHtml(dirty);
      expect(clean).not.toContain('<style>');
    });
    
    it('should preserve safe tags', () => {
      const safe = '<p>Hello <b>world</b></p>';
      const clean = editor.cleanHtml(safe);
      expect(clean).toContain('<b>world</b>');
    });
    
    it('should keep href on links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const clean = editor.cleanHtml(html);
      expect(clean).toContain('href="https://example.com"');
    });
  });
  
  describe('destroy', () => {
    it('should remove element from DOM', () => {
      editor.destroy();
      expect(document.querySelector('.sn-rich-editor')).toBeNull();
    });
  });
  
  describe('static getStyles', () => {
    it('should return CSS string', () => {
      const styles = RichEditor.getStyles();
      expect(typeof styles).toBe('string');
      expect(styles).toContain('.sn-rich-editor');
      expect(styles).toContain('.sn-editor-toolbar');
      expect(styles).toContain('.sn-editor-content');
    });
    
    it('should include email share styles', () => {
      const styles = RichEditor.getStyles();
      expect(styles).toContain('.sn-email-share');
      expect(styles).toContain('.sn-email-share-pending');
      expect(styles).toContain('.sn-email-share-success');
      expect(styles).toContain('.sn-email-share-failed');
    });
  });
  
  describe('email detection and sharing', () => {
    let onEmailShare;
    let onEmailUnshare;
    let editorWithCallbacks;
    
    beforeEach(() => {
      onEmailShare = jest.fn();
      onEmailUnshare = jest.fn();
      editorWithCallbacks = new RichEditor({
        content: '',
        placeholder: 'Write here...',
        onChange: jest.fn(),
        onEmailShare,
        onEmailUnshare
      });
      document.body.appendChild(editorWithCallbacks.element);
    });
    
    afterEach(() => {
      if (editorWithCallbacks && editorWithCallbacks.element && editorWithCallbacks.element.parentNode) {
        editorWithCallbacks.destroy();
      }
    });
    
    describe('processEmailsInContent', () => {
      it('should detect email followed by space and trigger share callback', () => {
        editorWithCallbacks.editor.innerHTML = 'test@example.com ';
        editorWithCallbacks.processEmailsInContent();
        
        expect(onEmailShare).toHaveBeenCalledWith('test@example.com');
      });
      
      it('should NOT detect email at end of content (user still typing)', () => {
        editorWithCallbacks.editor.innerHTML = 'test@example.com';
        editorWithCallbacks.processEmailsInContent();
        
        expect(onEmailShare).not.toHaveBeenCalled();
      });
      
      it('should NOT detect partial email without TLD', () => {
        editorWithCallbacks.editor.innerHTML = 'test@g ';
        editorWithCallbacks.processEmailsInContent();
        
        expect(onEmailShare).not.toHaveBeenCalled();
      });
      
      it('should detect email followed by newline', () => {
        editorWithCallbacks.editor.innerHTML = 'test@example.com\nmore text';
        editorWithCallbacks.processEmailsInContent();
        
        expect(onEmailShare).toHaveBeenCalledWith('test@example.com');
      });
      
      it('should trigger unshare callback when email is removed', () => {
        // First, add and track an email
        editorWithCallbacks.editor.innerHTML = 'test@example.com ';
        editorWithCallbacks.processEmailsInContent();
        expect(onEmailShare).toHaveBeenCalledWith('test@example.com');
        
        // Now remove the email
        editorWithCallbacks.editor.innerHTML = 'some other text';
        editorWithCallbacks.processEmailsInContent();
        
        expect(onEmailUnshare).toHaveBeenCalledWith('test@example.com');
      });
      
      it('should not trigger share for already tracked emails', () => {
        editorWithCallbacks.editor.innerHTML = 'test@example.com ';
        editorWithCallbacks.processEmailsInContent();
        expect(onEmailShare).toHaveBeenCalledTimes(1);
        
        // Process again - should not trigger
        editorWithCallbacks.processEmailsInContent();
        expect(onEmailShare).toHaveBeenCalledTimes(1);
      });
    });
    
    describe('wrapEmailInSpan', () => {
      it('should wrap email in span with pending class', () => {
        editorWithCallbacks.editor.innerHTML = 'Contact test@example.com please';
        editorWithCallbacks.wrapEmailInSpan('test@example.com');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span).not.toBeNull();
        expect(span.classList.contains('sn-email-share-pending')).toBe(true);
        expect(span.dataset.email).toBe('test@example.com');
        expect(span.textContent).toBe('test@example.com');
      });
      
      it('should set data-tooltip attribute', () => {
        editorWithCallbacks.editor.innerHTML = 'test@example.com ';
        editorWithCallbacks.wrapEmailInSpan('test@example.com');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.dataset.tooltip).toBeDefined();
      });
      
      it('should not wrap email that is already wrapped', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="test@example.com">test@example.com</span>';
        editorWithCallbacks.wrapEmailInSpan('test@example.com');
        
        const spans = editorWithCallbacks.editor.querySelectorAll('.sn-email-share');
        expect(spans.length).toBe(1);
      });
    });
    
    describe('cleanupEmailSpans', () => {
      it('should extract extra text typed after email in span', () => {
        // Simulate user typing inside the span (browser behavior)
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share sn-email-share-success" data-email="test@example.com" data-tooltip="Shared">test@example.com extra text</span>';
        editorWithCallbacks.cleanupEmailSpans();
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.textContent).toBe('test@example.com');
        expect(editorWithCallbacks.editor.textContent).toContain('extra text');
      });
      
      it('should extract text typed before email in span', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="test@example.com">before test@example.com</span>';
        editorWithCallbacks.cleanupEmailSpans();
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.textContent).toBe('test@example.com');
        expect(editorWithCallbacks.editor.textContent).toContain('before');
      });
      
      it('should remove span if no valid email remains', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="test@example.com">not an email anymore</span>';
        editorWithCallbacks.cleanupEmailSpans();
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span).toBeNull();
        expect(editorWithCallbacks.editor.textContent).toBe('not an email anymore');
      });
      
      it('should preserve span if content matches email exactly', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="test@example.com">test@example.com</span>';
        const htmlBefore = editorWithCallbacks.editor.innerHTML;
        editorWithCallbacks.cleanupEmailSpans();
        
        expect(editorWithCallbacks.editor.innerHTML).toBe(htmlBefore);
      });
    });
    
    describe('updateEmailStatus', () => {
      beforeEach(() => {
        // Set up a wrapped email
        editorWithCallbacks.editor.innerHTML = 'test@example.com ';
        editorWithCallbacks.processEmailsInContent();
      });
      
      it('should update span to success status', () => {
        editorWithCallbacks.updateEmailStatus('test@example.com', true, 'Shared with test@example.com');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.classList.contains('sn-email-share-success')).toBe(true);
        expect(span.classList.contains('sn-email-share-pending')).toBe(false);
        expect(span.dataset.tooltip).toBe('Shared with test@example.com');
      });
      
      it('should update span to failed status', () => {
        editorWithCallbacks.updateEmailStatus('test@example.com', false, 'Failed to share');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.classList.contains('sn-email-share-failed')).toBe(true);
        expect(span.classList.contains('sn-email-share-pending')).toBe(false);
      });
      
      it('should match email case-insensitively', () => {
        editorWithCallbacks.updateEmailStatus('TEST@EXAMPLE.COM', true, 'Shared');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.classList.contains('sn-email-share-success')).toBe(true);
      });
      
      it('should update tracked emails map', () => {
        editorWithCallbacks.updateEmailStatus('test@example.com', true, 'Shared');
        
        const tracked = editorWithCallbacks.getTrackedEmails();
        expect(tracked.get('test@example.com')).toEqual({
          status: 'success',
          tooltip: 'Shared'
        });
      });
    });
    
    describe('getTrackedEmails', () => {
      it('should return map of tracked emails', () => {
        editorWithCallbacks.editor.innerHTML = 'test@example.com ';
        editorWithCallbacks.processEmailsInContent();
        
        const tracked = editorWithCallbacks.getTrackedEmails();
        expect(tracked.has('test@example.com')).toBe(true);
        expect(tracked.get('test@example.com').status).toBe('pending');
      });
    });
    
    describe('setEmailStatuses', () => {
      it('should set initial email statuses', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="test@example.com">test@example.com</span>';
        
        editorWithCallbacks.setEmailStatuses([
          { email: 'test@example.com', status: 'success', tooltip: 'Already shared' }
        ]);
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.classList.contains('sn-email-share-success')).toBe(true);
        expect(span.dataset.tooltip).toBe('Already shared');
        
        const tracked = editorWithCallbacks.getTrackedEmails();
        expect(tracked.get('test@example.com').status).toBe('success');
      });
    });
  });
});
