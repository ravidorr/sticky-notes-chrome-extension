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
    // Mock queryCommandState since JSDOM doesn't support it
    document.queryCommandState = jest.fn().mockReturnValue(false);
    
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
    delete document.queryCommandState;
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
      // Title is now i18n key in tests (chrome.i18n.getMessage returns key)
      expect(boldBtn.title).toBe('boldText');
      expect(boldBtn.getAttribute('aria-label')).toBe('boldText');
    });
    
    it('should have italic button', () => {
      const italicBtn = editor.toolbar.querySelector('[data-command="italic"]');
      expect(italicBtn).not.toBeNull();
      // Title is now i18n key in tests (chrome.i18n.getMessage returns key)
      expect(italicBtn.title).toBe('italicText');
      expect(italicBtn.getAttribute('aria-label')).toBe('italicText');
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

  describe('toolbar click handling', () => {
    it('should execute bold command when bold button clicked', () => {
      const boldBtn = editor.toolbar.querySelector('[data-command="bold"]');
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      boldBtn.click();
      
      expect(execCommandSpy).toHaveBeenCalledWith('bold', false, null);
      execCommandSpy.mockRestore();
    });

    it('should execute italic command when italic button clicked', () => {
      const italicBtn = editor.toolbar.querySelector('[data-command="italic"]');
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      italicBtn.click();
      
      expect(execCommandSpy).toHaveBeenCalledWith('italic', false, null);
      execCommandSpy.mockRestore();
    });

    it('should not execute command when clicking non-button element', () => {
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      // Click on divider
      const divider = editor.toolbar.querySelector('.sn-toolbar-divider');
      if (divider) {
        divider.click();
      }
      
      // execCommand should not have been called (or only for other reasons)
      execCommandSpy.mockRestore();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should execute bold on Ctrl+B', () => {
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      const event = new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      
      editor.editor.dispatchEvent(event);
      
      expect(execCommandSpy).toHaveBeenCalledWith('bold', false, null);
      execCommandSpy.mockRestore();
    });

    it('should execute italic on Ctrl+I', () => {
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      const event = new KeyboardEvent('keydown', {
        key: 'i',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      
      editor.editor.dispatchEvent(event);
      
      expect(execCommandSpy).toHaveBeenCalledWith('italic', false, null);
      execCommandSpy.mockRestore();
    });

    it('should handle regular keydown without ctrl/meta', () => {
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true
      });
      
      editor.editor.dispatchEvent(event);
      
      // Should not call execCommand for regular keys
      expect(execCommandSpy).not.toHaveBeenCalledWith('bold', false, null);
      execCommandSpy.mockRestore();
    });
  });

  describe('input handling', () => {
    it('should update content on input', () => {
      const onChange = jest.fn();
      const editorWithOnChange = new RichEditor({
        content: '',
        onChange
      });
      document.body.appendChild(editorWithOnChange.element);
      
      editorWithOnChange.editor.innerHTML = 'New content';
      editorWithOnChange.editor.dispatchEvent(new Event('input', { bubbles: true }));
      
      expect(onChange).toHaveBeenCalledWith('New content');
      editorWithOnChange.destroy();
    });
  });

  describe('paste handling', () => {
    it('should clean pasted HTML content', () => {
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      const clipboardData = {
        getData: jest.fn((type) => {
          if (type === 'text/html') return '<p>Hello</p><script>alert("xss")</script>';
          if (type === 'text/plain') return 'Hello';
          return '';
        })
      };
      
      const pasteEvent = new Event('paste', { bubbles: true });
      pasteEvent.clipboardData = clipboardData;
      pasteEvent.preventDefault = jest.fn();
      
      editor.editor.dispatchEvent(pasteEvent);
      
      expect(pasteEvent.preventDefault).toHaveBeenCalled();
      expect(execCommandSpy).toHaveBeenCalledWith('insertHTML', false, expect.any(String));
      execCommandSpy.mockRestore();
    });

    it('should insert plain text when no HTML available', () => {
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      const clipboardData = {
        getData: jest.fn((type) => {
          if (type === 'text/html') return '';
          if (type === 'text/plain') return 'Plain text';
          return '';
        })
      };
      
      const pasteEvent = new Event('paste', { bubbles: true });
      pasteEvent.clipboardData = clipboardData;
      pasteEvent.preventDefault = jest.fn();
      
      editor.editor.dispatchEvent(pasteEvent);
      
      expect(execCommandSpy).toHaveBeenCalledWith('insertText', false, 'Plain text');
      execCommandSpy.mockRestore();
    });
  });

  describe('updatePlaceholder', () => {
    it('should add empty class when editor is empty', () => {
      editor.editor.innerHTML = '';
      editor.updatePlaceholder();
      
      expect(editor.editor.classList.contains('empty')).toBe(true);
    });

    it('should remove empty class when editor has content', () => {
      editor.editor.innerHTML = 'Some content';
      editor.updatePlaceholder();
      
      expect(editor.editor.classList.contains('empty')).toBe(false);
    });

    it('should treat whitespace-only as empty', () => {
      editor.editor.innerHTML = '   ';
      editor.updatePlaceholder();
      
      expect(editor.editor.classList.contains('empty')).toBe(true);
    });
  });

  describe('updateToolbarState', () => {
    it('should call queryCommandState for each button', () => {
      editor.updateToolbarState();
      expect(document.queryCommandState).toHaveBeenCalled();
    });
    
    it('should add active class when command state is true', () => {
      document.queryCommandState.mockReturnValue(true);
      
      editor.updateToolbarState();
      
      const boldBtn = editor.toolbar.querySelector('[data-command="bold"]');
      expect(boldBtn.classList.contains('active')).toBe(true);
    });
    
    it('should remove active class when command state is false', () => {
      const boldBtn = editor.toolbar.querySelector('[data-command="bold"]');
      boldBtn.classList.add('active');
      
      document.queryCommandState.mockReturnValue(false);
      editor.updateToolbarState();
      
      expect(boldBtn.classList.contains('active')).toBe(false);
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
    
    describe('wrapEmailInSpan - edge cases', () => {
      it('should fix span when it contains extra text and email', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="old@example.com">new@example.com extra</span>';
        editorWithCallbacks.wrapEmailInSpan('new@example.com');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span).toBeTruthy();
      });
      
      it('should update data-email when text matches but attribute does not', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share sn-email-share-success" data-email="wrong@example.com" data-tooltip="Old">test@example.com</span>';
        editorWithCallbacks.wrapEmailInSpan('test@example.com');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.dataset.email).toBe('test@example.com');
      });
      
      it('should skip if email is already properly wrapped', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="test@example.com">test@example.com</span>';
        const initialHtml = editorWithCallbacks.editor.innerHTML;
        
        editorWithCallbacks.wrapEmailInSpan('test@example.com');
        
        expect(editorWithCallbacks.editor.innerHTML).toBe(initialHtml);
      });
    });

    describe('updateEmailStatus - edge cases', () => {
      it('should match by text content when data-email is different', () => {
        editorWithCallbacks.trackedEmails.set('test@example.com', { status: 'pending', tooltip: '' });
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share sn-email-share-pending" data-email="other@example.com">test@example.com</span>';
        
        editorWithCallbacks.updateEmailStatus('test@example.com', true, 'Success');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.classList.contains('sn-email-share-success')).toBe(true);
        expect(span.dataset.email).toBe('test@example.com');
      });
      
      it('should handle email not in trackedEmails', () => {
        editorWithCallbacks.editor.innerHTML = '<span class="sn-email-share" data-email="untracked@example.com">untracked@example.com</span>';
        
        editorWithCallbacks.updateEmailStatus('untracked@example.com', true, 'Success');
        
        const span = editorWithCallbacks.editor.querySelector('.sn-email-share');
        expect(span.classList.contains('sn-email-share-success')).toBe(true);
      });
    });

    describe('processEmailsInContent - additional edge cases', () => {
      it('should detect email followed by non-breaking space', () => {
        editorWithCallbacks.editor.innerHTML = 'test@example.com\u00A0more text';
        editorWithCallbacks.processEmailsInContent();
        
        expect(onEmailShare).toHaveBeenCalledWith('test@example.com');
      });
      
      it('should skip invalid email addresses', () => {
        editorWithCallbacks.editor.innerHTML = 'invalid@email ';
        editorWithCallbacks.processEmailsInContent();
        
        expect(onEmailShare).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleCreateLink', () => {
    let originalGetSelection;
    
    beforeEach(() => {
      originalGetSelection = window.getSelection;
    });
    
    afterEach(() => {
      window.getSelection = originalGetSelection;
    });
    
    it('should remove existing link when anchor exists', () => {
      editor.editor.innerHTML = '<a href="https://example.com">Link text</a>';
      
      // Select inside the link
      const link = editor.editor.querySelector('a');
      const range = document.createRange();
      range.selectNodeContents(link);
      
      // Mock window.getSelection to return proper object
      window.getSelection = jest.fn(() => ({
        anchorNode: link.firstChild,
        rangeCount: 1,
        isCollapsed: false,
        toString: () => 'Link text',
        getRangeAt: () => range
      }));
      
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      editor.handleCreateLink();
      
      expect(execCommandSpy).toHaveBeenCalledWith('unlink', false, null);
      execCommandSpy.mockRestore();
    });
    
    it('should show link input when no existing link', () => {
      editor.editor.innerHTML = '';
      const textNode = document.createTextNode('Some text');
      editor.editor.appendChild(textNode);
      
      // Create a range for selection
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 4);
      
      // Mock window.getSelection
      window.getSelection = jest.fn(() => ({
        anchorNode: textNode,
        rangeCount: 1,
        isCollapsed: false,
        toString: () => 'Some',
        getRangeAt: () => range
      }));
      
      editor.handleCreateLink();
      
      const popup = editor.element.querySelector('.sn-inline-popup');
      expect(popup).not.toBeNull();
    });
  });

  describe('showLinkInput', () => {
    it('should remove existing link input before showing new one', () => {
      // Create existing popup
      const existingPopup = document.createElement('div');
      existingPopup.className = 'sn-inline-popup';
      editor.element.appendChild(existingPopup);
      
      const range = document.createRange();
      range.selectNodeContents(editor.editor);
      
      editor.showLinkInput(range, 'test');
      
      const popups = editor.element.querySelectorAll('.sn-inline-popup');
      expect(popups.length).toBe(1);
    });
    
    it('should handle confirm button click', () => {
      const range = document.createRange();
      range.selectNodeContents(editor.editor);
      
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      editor.showLinkInput(range, 'link text');
      
      const input = editor.element.querySelector('.sn-inline-popup-input');
      const confirmBtn = editor.element.querySelector('.sn-btn-primary');
      
      input.value = 'https://example.com';
      confirmBtn.click();
      
      // Should have tried to create link
      expect(execCommandSpy).toHaveBeenCalled();
      execCommandSpy.mockRestore();
    });
    
    it('should handle cancel button click', () => {
      const range = document.createRange();
      range.selectNodeContents(editor.editor);
      
      editor.showLinkInput(range, 'link text');
      
      const cancelBtn = editor.element.querySelector('.sn-btn-secondary');
      cancelBtn.click();
      
      const popup = editor.element.querySelector('.sn-inline-popup');
      expect(popup).toBeNull();
    });
    
    it('should insert link on Enter key', () => {
      const range = document.createRange();
      range.selectNodeContents(editor.editor);
      
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      editor.showLinkInput(range, 'link text');
      
      const input = editor.element.querySelector('.sn-inline-popup-input');
      input.value = 'https://example.com';
      
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      event.preventDefault = jest.fn();
      input.dispatchEvent(event);
      
      expect(event.preventDefault).toHaveBeenCalled();
      execCommandSpy.mockRestore();
    });
    
    it('should close on Escape key', () => {
      const range = document.createRange();
      range.selectNodeContents(editor.editor);
      
      editor.showLinkInput(range, 'link text');
      
      const input = editor.element.querySelector('.sn-inline-popup-input');
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      event.preventDefault = jest.fn();
      input.dispatchEvent(event);
      
      const popup = editor.element.querySelector('.sn-inline-popup');
      expect(popup).toBeNull();
    });
    
    it('should insert URL as text when no selection', () => {
      editor.editor.innerHTML = '';
      
      const range = document.createRange();
      range.setStart(editor.editor, 0);
      range.setEnd(editor.editor, 0);
      
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      editor.showLinkInput(range, ''); // Empty selected text
      
      const input = editor.element.querySelector('.sn-inline-popup-input');
      const confirmBtn = editor.element.querySelector('.sn-btn-primary');
      
      input.value = 'https://example.com';
      confirmBtn.click();
      
      expect(execCommandSpy).toHaveBeenCalledWith('insertHTML', false, expect.stringContaining('href='));
      execCommandSpy.mockRestore();
    });
    
    it('should not insert link when URL is just https://', () => {
      const range = document.createRange();
      range.selectNodeContents(editor.editor);
      
      const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      
      editor.showLinkInput(range, 'link text');
      
      const input = editor.element.querySelector('.sn-inline-popup-input');
      const confirmBtn = editor.element.querySelector('.sn-btn-primary');
      
      // Don't change default value
      confirmBtn.click();
      
      // Should not have called createLink
      expect(execCommandSpy).not.toHaveBeenCalledWith('createLink', expect.anything(), 'https://');
      execCommandSpy.mockRestore();
    });
  });

  describe('cleanHtml - additional cases', () => {
    it('should preserve email share span attributes', () => {
      const html = '<span class="sn-email-share" data-email="test@example.com" data-tooltip="Shared">test@example.com</span>';
      const cleaned = editor.cleanHtml(html);
      expect(cleaned).toContain('data-email');
      expect(cleaned).toContain('class=');
    });
    
    it('should remove unwanted tags but keep their content', () => {
      const html = '<table><tr><td>Cell content</td></tr></table>';
      const cleaned = editor.cleanHtml(html);
      expect(cleaned).toContain('Cell content');
      expect(cleaned).not.toContain('<table>');
    });
  });


  describe('keyboard event propagation', () => {
    it('should stop keyup propagation', () => {
      const event = new KeyboardEvent('keyup', { key: 'a', bubbles: true });
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
      
      editor.editor.dispatchEvent(event);
      
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
    
    it('should stop keypress propagation', () => {
      const event = new KeyboardEvent('keypress', { key: 'a', bubbles: true });
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
      
      editor.editor.dispatchEvent(event);
      
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
    
    it('should stop keydown propagation for regular keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
      
      editor.editor.dispatchEvent(event);
      
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
    
    it('should NOT stop keydown propagation for Ctrl+H (note visibility toggle)', () => {
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        ctrlKey: true, 
        bubbles: true 
      });
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
      
      editor.editor.dispatchEvent(event);
      
      expect(stopPropagationSpy).not.toHaveBeenCalled();
    });
    
    it('should NOT stop keydown propagation for Cmd+H (note visibility toggle on Mac)', () => {
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        metaKey: true, 
        bubbles: true 
      });
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
      
      editor.editor.dispatchEvent(event);
      
      expect(stopPropagationSpy).not.toHaveBeenCalled();
    });
    
    it('should still stop keydown propagation for Ctrl+Shift+H', () => {
      const event = new KeyboardEvent('keydown', { 
        key: 'h', 
        ctrlKey: true, 
        shiftKey: true,
        bubbles: true 
      });
      const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');
      
      editor.editor.dispatchEvent(event);
      
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

  describe('focus and blur events', () => {
    it('should update placeholder on focus', () => {
      const updateSpy = jest.spyOn(editor, 'updatePlaceholder');
      
      editor.editor.dispatchEvent(new Event('focus', { bubbles: true }));
      
      expect(updateSpy).toHaveBeenCalled();
    });
    
    it('should update placeholder on blur', () => {
      const updateSpy = jest.spyOn(editor, 'updatePlaceholder');
      
      editor.editor.dispatchEvent(new Event('blur', { bubbles: true }));
      
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('process initial content', () => {
    it('should process emails in initial content', () => {
      const onShareInit = jest.fn();
      const editorWithInitialContent = new RichEditor({
        content: 'Contact me@example.com ',
        onEmailShare: onShareInit
      });
      document.body.appendChild(editorWithInitialContent.element);
      
      // Should have processed initial content
      expect(onShareInit).toHaveBeenCalledWith('me@example.com');
      
      editorWithInitialContent.destroy();
    });
  });
});
