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
  });
});
