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
  });
});
