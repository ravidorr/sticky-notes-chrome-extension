/**
 * SelectorEngine Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// We need to import the module dynamically due to ES modules
let SelectorEngine;

beforeEach(async () => {
  // Reset DOM
  document.body.innerHTML = '';
  
  // Import the module fresh for each test
  const module = await import('../../src/content/selectors/SelectorEngine.js');
  SelectorEngine = module.SelectorEngine;
});

describe('SelectorEngine', () => {
  let engine;
  
  beforeEach(() => {
    engine = new SelectorEngine();
  });
  
  describe('generate()', () => {
    it('should return null for invalid elements', () => {
      expect(engine.generate(null)).toBeNull();
      expect(engine.generate(undefined)).toBeNull();
      expect(engine.generate(document.createTextNode('text'))).toBeNull();
    });
    
    it('should generate ID-based selector for elements with stable IDs', () => {
      document.body.innerHTML = '<div id="stable-id">Content</div>';
      const element = document.getElementById('stable-id');
      
      const selector = engine.generate(element);
      
      expect(selector).toBe('#stable-id');
      expect(document.querySelector(selector)).toBe(element);
    });
    
    it('should avoid dynamic ID patterns', () => {
      document.body.innerHTML = `
        <div id="ember123" class="test-class">Content</div>
      `;
      const element = document.querySelector('.test-class');
      
      const selector = engine.generate(element);
      
      // Should not use the ember ID
      expect(selector).not.toContain('#ember123');
    });
    
    it('should prefer data-testid attribute', () => {
      document.body.innerHTML = `
        <div data-testid="my-component" class="some-class">Content</div>
      `;
      const element = document.querySelector('[data-testid="my-component"]');
      
      const selector = engine.generate(element);
      
      expect(selector).toContain('data-testid');
      expect(document.querySelector(selector)).toBe(element);
    });
    
    it('should use class-based selector when no ID or data attributes', () => {
      document.body.innerHTML = `
        <div class="unique-class">Content</div>
      `;
      const element = document.querySelector('.unique-class');
      
      const selector = engine.generate(element);
      
      expect(selector).toContain('.unique-class');
      expect(document.querySelector(selector)).toBe(element);
    });
    
    it('should use nth-child for elements without unique identifiers', () => {
      document.body.innerHTML = `
        <ul id="list">
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>
      `;
      const secondItem = document.querySelectorAll('li')[1];
      
      const selector = engine.generate(secondItem);
      
      expect(document.querySelector(selector)).toBe(secondItem);
    });
    
    it('should generate unique selector for nested elements', () => {
      document.body.innerHTML = `
        <div id="parent">
          <div class="child">
            <span class="target">Target</span>
          </div>
        </div>
      `;
      const target = document.querySelector('.target');
      
      const selector = engine.generate(target);
      
      expect(document.querySelector(selector)).toBe(target);
    });
  });
  
  describe('isDynamicId()', () => {
    it('should detect ember IDs', () => {
      expect(engine.isDynamicId('ember123')).toBe(true);
      expect(engine.isDynamicId('ember1')).toBe(true);
    });
    
    it('should detect react IDs', () => {
      expect(engine.isDynamicId('react-123')).toBe(true);
      expect(engine.isDynamicId(':r0:')).toBe(true);
    });
    
    it('should detect numeric IDs', () => {
      expect(engine.isDynamicId('123456')).toBe(true);
    });
    
    it('should detect UUID patterns', () => {
      expect(engine.isDynamicId('a1b2c3d4-e5f6-7890')).toBe(true);
    });
    
    it('should accept stable IDs', () => {
      expect(engine.isDynamicId('header')).toBe(false);
      expect(engine.isDynamicId('main-content')).toBe(false);
      expect(engine.isDynamicId('btn-submit')).toBe(false);
    });
  });
  
  describe('isUnique()', () => {
    it('should return true for unique selectors', () => {
      document.body.innerHTML = '<div id="unique">Content</div>';
      
      expect(engine.isUnique('#unique')).toBe(true);
    });
    
    it('should return false for non-unique selectors', () => {
      document.body.innerHTML = `
        <div class="common">Content 1</div>
        <div class="common">Content 2</div>
      `;
      
      expect(engine.isUnique('.common')).toBe(false);
    });
    
    it('should return false for invalid selectors', () => {
      expect(engine.isUnique('invalid[[')).toBe(false);
    });
  });
  
  describe('validate()', () => {
    it('should return true when selector matches expected element', () => {
      document.body.innerHTML = '<div id="test">Content</div>';
      const element = document.getElementById('test');
      
      expect(engine.validate('#test', element)).toBe(true);
    });
    
    it('should return false when selector matches different element', () => {
      document.body.innerHTML = `
        <div id="test1">Content 1</div>
        <div id="test2">Content 2</div>
      `;
      const element1 = document.getElementById('test1');
      
      expect(engine.validate('#test2', element1)).toBe(false);
    });
  });
  
  describe('getConfidenceScore()', () => {
    it('should give high score to data-testid selectors', () => {
      const score = engine.getConfidenceScore('[data-testid="component"]');
      expect(score).toBeGreaterThan(70);
    });
    
    it('should give medium score to ID selectors', () => {
      const score = engine.getConfidenceScore('#my-id');
      expect(score).toBeGreaterThan(50);
    });
    
    it('should penalize deep paths', () => {
      const shallow = engine.getConfidenceScore('div.class');
      const deep = engine.getConfidenceScore('div > div > div > div > span');
      
      expect(shallow).toBeGreaterThan(deep);
    });
    
    it('should penalize nth selectors', () => {
      const noNth = engine.getConfidenceScore('div.class');
      const withNth = engine.getConfidenceScore('div:nth-of-type(2)');
      
      expect(noNth).toBeGreaterThan(withNth);
    });
    
    it('should give bonus for aria attributes', () => {
      const score = engine.getConfidenceScore('[aria-label="close"]');
      expect(score).toBeGreaterThan(60);
    });
    
    it('should give bonus for data attributes', () => {
      const score = engine.getConfidenceScore('[data-component="header"]');
      expect(score).toBeGreaterThan(60);
    });
    
    it('should clamp score between 0 and 100', () => {
      // Very deep selector should still be >= 0
      const deepSelector = 'div > div > div > div > div > div > div > div > div > div > div > span';
      const score = engine.getConfidenceScore(deepSelector);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
  
  describe('parseSelector()', () => {
    it('should extract tag name', () => {
      const parts = engine.parseSelector('div.class');
      expect(parts.tagName).toBe('div');
    });
    
    it('should extract ID', () => {
      const parts = engine.parseSelector('#my-id');
      expect(parts.id).toBe('my-id');
    });
    
    it('should extract multiple classes', () => {
      const parts = engine.parseSelector('.class1.class2.class3');
      expect(parts.classes).toContain('class1');
      expect(parts.classes).toContain('class2');
      expect(parts.classes).toContain('class3');
    });
    
    it('should extract attributes', () => {
      const parts = engine.parseSelector('[data-testid="component"]');
      expect(parts.attributes['data-testid']).toBe('component');
    });
    
    it('should extract nth-child', () => {
      const parts = engine.parseSelector('li:nth-child(3)');
      expect(parts.nthChild).toBe(3);
    });
    
    it('should extract nth-of-type', () => {
      const parts = engine.parseSelector('div:nth-of-type(2)');
      expect(parts.nthChild).toBe(2);
    });
    
    it('should handle complex selectors', () => {
      const parts = engine.parseSelector('div#main.container.wide[data-page="home"]:nth-child(1)');
      expect(parts.tagName).toBe('div');
      expect(parts.id).toBe('main');
      expect(parts.classes).toContain('container');
      expect(parts.classes).toContain('wide');
      expect(parts.attributes['data-page']).toBe('home');
      expect(parts.nthChild).toBe(1);
    });
    
    it('should handle attribute without value', () => {
      const parts = engine.parseSelector('[disabled]');
      expect(parts.attributes['disabled']).toBe(true);
    });
  });
  
  describe('findCandidates()', () => {
    it('should find elements by tag name', () => {
      document.body.innerHTML = `
        <div>Div 1</div>
        <div>Div 2</div>
        <span>Span</span>
      `;
      
      const parts = { tagName: 'div', classes: [], attributes: {} };
      const candidates = engine.findCandidates(parts, {});
      
      expect(candidates.length).toBe(2);
    });
    
    it('should find elements by class', () => {
      document.body.innerHTML = `
        <div class="target">Target 1</div>
        <div class="target">Target 2</div>
        <div class="other">Other</div>
      `;
      
      const parts = { tagName: null, classes: ['target'], attributes: {} };
      const candidates = engine.findCandidates(parts, {});
      
      expect(candidates.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should limit results to 100', () => {
      // Create 150 elements
      const elements = Array(150).fill('<div></div>').join('');
      document.body.innerHTML = elements;
      
      const parts = { tagName: 'div', classes: [], attributes: {} };
      const candidates = engine.findCandidates(parts, {});
      
      expect(candidates.length).toBeLessThanOrEqual(100);
    });
  });
  
  describe('findBestMatch()', () => {
    it('should return null when no candidates found', () => {
      document.body.innerHTML = '<div></div>';
      
      const result = engine.findBestMatch('.non-existent', {});
      
      expect(result).toBeNull();
    });
    
    it('should find element by matching classes', () => {
      document.body.innerHTML = `
        <div class="target-class">Target</div>
        <div class="other-class">Other</div>
      `;
      
      const result = engine.findBestMatch('.target-class', {});
      
      // Should find the element
      expect(result).not.toBeNull();
      if (result) {
        expect(result.classList.contains('target-class')).toBe(true);
      }
    });
    
    it('should find element by matching ID', () => {
      document.body.innerHTML = `
        <div id="target-id">Target</div>
        <div id="other-id">Other</div>
      `;
      
      const result = engine.findBestMatch('#target-id', {});
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result.id).toBe('target-id');
      }
    });
  });
  
  describe('scoreCandidate()', () => {
    it('should score tag name match', () => {
      document.body.innerHTML = '<div></div><span></span>';
      const div = document.querySelector('div');
      
      const parts = { tagName: 'div', classes: [], attributes: {}, id: null, nthChild: null };
      const score = engine.scoreCandidate(div, parts, {});
      
      expect(score).toBeGreaterThan(0);
    });
    
    it('should score class matches', () => {
      document.body.innerHTML = '<div class="a b c"></div>';
      const element = document.querySelector('.a');
      
      const parts = { tagName: null, classes: ['a', 'b'], attributes: {}, id: null, nthChild: null };
      const score = engine.scoreCandidate(element, parts, {});
      
      expect(score).toBeGreaterThan(0);
    });
  });
  
  describe('validateSelector()', () => {
    it('should accept valid selectors', () => {
      const result = engine.validateSelector('#valid-id');
      expect(result.valid).toBe(true);
    });
    
    it('should reject null/undefined', () => {
      expect(engine.validateSelector(null).valid).toBe(false);
      expect(engine.validateSelector(undefined).valid).toBe(false);
    });
    
    it('should reject empty strings', () => {
      expect(engine.validateSelector('').valid).toBe(false);
      expect(engine.validateSelector('   ').valid).toBe(false);
    });
    
    it('should reject selectors that are too long', () => {
      const longSelector = 'a'.repeat(1001);
      expect(engine.validateSelector(longSelector).valid).toBe(false);
    });
    
    it('should reject selectors with script tags', () => {
      expect(engine.validateSelector('<script>alert(1)</script>').valid).toBe(false);
    });
    
    it('should reject selectors with javascript: protocol', () => {
      expect(engine.validateSelector('javascript:alert(1)').valid).toBe(false);
    });
    
    it('should reject selectors with event handlers', () => {
      expect(engine.validateSelector('onclick=alert(1)').valid).toBe(false);
    });
    
    it('should reject CSS expression', () => {
      expect(engine.validateSelector('expression(alert(1))').valid).toBe(false);
    });
    
    it('should reject behavior property', () => {
      expect(engine.validateSelector('behavior:url()').valid).toBe(false);
    });
    
    it('should reject @import', () => {
      expect(engine.validateSelector('@import url()').valid).toBe(false);
    });
  });
  
  describe('sanitizeSelector()', () => {
    it('should return trimmed valid selector', () => {
      const result = engine.sanitizeSelector('  #valid-id  ');
      expect(result).toBe('#valid-id');
    });
    
    it('should return null for invalid selector', () => {
      const result = engine.sanitizeSelector('<script>');
      expect(result).toBeNull();
    });
  });
});
