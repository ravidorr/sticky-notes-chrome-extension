/**
 * Tests for i18n module
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { t, getUILanguage, initializeI18n, createTranslatedElement } from '../../src/shared/i18n.js';

describe('i18n Module', () => {
  const localThis = {};

  beforeEach(() => {
    // Reset chrome mock
    localThis.mockGetMessage = jest.fn();
    localThis.mockGetUILanguage = jest.fn();
    
    global.chrome = {
      i18n: {
        getMessage: localThis.mockGetMessage,
        getUILanguage: localThis.mockGetUILanguage
      }
    };
    
    // Setup DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('t()', () => {
    it('should return translated message when found', () => {
      localThis.mockGetMessage.mockReturnValue('Hello World');
      
      const result = t('greeting');
      
      expect(result).toBe('Hello World');
      expect(localThis.mockGetMessage).toHaveBeenCalledWith('greeting', undefined);
    });

    it('should return key when message not found', () => {
      localThis.mockGetMessage.mockReturnValue('');
      
      const result = t('unknownKey');
      
      expect(result).toBe('unknownKey');
    });

    it('should pass substitutions to getMessage', () => {
      localThis.mockGetMessage.mockReturnValue('5 minutes ago');
      
      const result = t('minutesAgo', ['5']);
      
      expect(localThis.mockGetMessage).toHaveBeenCalledWith('minutesAgo', ['5']);
      expect(result).toBe('5 minutes ago');
    });

    it('should handle array substitutions', () => {
      localThis.mockGetMessage.mockReturnValue('Hello John');
      
      const result = t('greetUser', ['John']);
      
      expect(localThis.mockGetMessage).toHaveBeenCalledWith('greetUser', ['John']);
    });

    it('should return key when chrome.i18n throws', () => {
      localThis.mockGetMessage.mockImplementation(() => {
        throw new Error('Extension context invalidated');
      });
      
      const result = t('someKey');
      
      expect(result).toBe('someKey');
    });

    it('should return key when chrome is undefined', () => {
      delete global.chrome;
      
      const result = t('someKey');
      
      expect(result).toBe('someKey');
    });
  });

  describe('getUILanguage()', () => {
    it('should return current UI language', () => {
      localThis.mockGetUILanguage.mockReturnValue('en-US');
      
      const result = getUILanguage();
      
      expect(result).toBe('en-US');
    });

    it('should return "en" as fallback when chrome.i18n throws', () => {
      localThis.mockGetUILanguage.mockImplementation(() => {
        throw new Error('API not available');
      });
      
      const result = getUILanguage();
      
      expect(result).toBe('en');
    });

    it('should return "en" when chrome is undefined', () => {
      delete global.chrome;
      
      const result = getUILanguage();
      
      expect(result).toBe('en');
    });
  });

  describe('initializeI18n()', () => {
    it('should translate elements with data-i18n attribute', () => {
      document.body.innerHTML = `
        <span data-i18n="greeting">Default text</span>
        <p data-i18n="description">Default description</p>
      `;
      
      localThis.mockGetMessage.mockImplementation((key) => {
        const messages = {
          greeting: 'Hello',
          description: 'This is a description'
        };
        return messages[key] || '';
      });
      
      initializeI18n();
      
      expect(document.querySelector('[data-i18n="greeting"]').textContent).toBe('Hello');
      expect(document.querySelector('[data-i18n="description"]').textContent).toBe('This is a description');
    });

    it('should not change text when translation matches key', () => {
      document.body.innerHTML = `
        <span data-i18n="unknownKey">Original text</span>
      `;
      
      localThis.mockGetMessage.mockReturnValue('');
      
      initializeI18n();
      
      // Should keep original text when translation not found
      expect(document.querySelector('[data-i18n="unknownKey"]').textContent).toBe('Original text');
    });

    it('should translate placeholder attributes', () => {
      document.body.innerHTML = `
        <input data-i18n-placeholder="emailPlaceholder" placeholder="Default">
      `;
      
      localThis.mockGetMessage.mockReturnValue('Enter your email');
      
      initializeI18n();
      
      expect(document.querySelector('input').placeholder).toBe('Enter your email');
    });

    it('should translate title attributes', () => {
      document.body.innerHTML = `
        <button data-i18n-title="closeButton" title="Default">X</button>
      `;
      
      localThis.mockGetMessage.mockReturnValue('Close this dialog');
      
      initializeI18n();
      
      expect(document.querySelector('button').title).toBe('Close this dialog');
    });

    it('should translate aria-label attributes', () => {
      document.body.innerHTML = `
        <button data-i18n-aria-label="menuButton" aria-label="Default">Menu</button>
      `;
      
      localThis.mockGetMessage.mockReturnValue('Open navigation menu');
      
      initializeI18n();
      
      expect(document.querySelector('button').getAttribute('aria-label')).toBe('Open navigation menu');
    });

    it('should work with custom root element', () => {
      document.body.innerHTML = `
        <div id="container">
          <span data-i18n="inside">Inside</span>
        </div>
        <span data-i18n="outside">Outside</span>
      `;
      
      localThis.mockGetMessage.mockReturnValue('Translated');
      
      const container = document.getElementById('container');
      initializeI18n(container);
      
      expect(document.querySelector('#container span').textContent).toBe('Translated');
      expect(document.querySelector('body > span').textContent).toBe('Outside'); // Not translated
    });

    it('should handle elements without data-i18n value', () => {
      document.body.innerHTML = `
        <span data-i18n="">Empty key</span>
      `;
      
      // Should not throw
      expect(() => initializeI18n()).not.toThrow();
    });
  });

  describe('createTranslatedElement()', () => {
    it('should create element with translated content', () => {
      localThis.mockGetMessage.mockReturnValue('Hello World');
      
      const element = createTranslatedElement('span', 'greeting');
      
      expect(element.tagName).toBe('SPAN');
      expect(element.textContent).toBe('Hello World');
      expect(element.getAttribute('data-i18n')).toBe('greeting');
    });

    it('should add additional attributes', () => {
      localThis.mockGetMessage.mockReturnValue('Click me');
      
      const element = createTranslatedElement('button', 'buttonText', {
        class: 'btn btn-primary',
        id: 'submit-btn',
        type: 'submit'
      });
      
      expect(element.tagName).toBe('BUTTON');
      expect(element.getAttribute('class')).toBe('btn btn-primary');
      expect(element.getAttribute('id')).toBe('submit-btn');
      expect(element.getAttribute('type')).toBe('submit');
    });

    it('should use key as fallback when translation not found', () => {
      localThis.mockGetMessage.mockReturnValue('');
      
      const element = createTranslatedElement('div', 'unknownKey');
      
      expect(element.textContent).toBe('unknownKey');
    });

    it('should work with empty attributes object', () => {
      localThis.mockGetMessage.mockReturnValue('Test');
      
      const element = createTranslatedElement('p', 'test', {});
      
      expect(element.tagName).toBe('P');
      expect(element.textContent).toBe('Test');
    });
  });
});
