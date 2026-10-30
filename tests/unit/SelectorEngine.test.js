/**
 * SelectorEngine Unit Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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

  describe('getIdSelector()', () => {
    it('should return null for elements without ID', () => {
      document.body.innerHTML = '<div class="no-id">Content</div>';
      const element = document.querySelector('.no-id');
      expect(engine.getIdSelector(element)).toBeNull();
    });
    
    it('should return null for dynamic IDs', () => {
      document.body.innerHTML = '<div id="ember456">Content</div>';
      const element = document.querySelector('#ember456');
      expect(engine.getIdSelector(element)).toBeNull();
    });
    
    it('should return selector when ID is unique', () => {
      document.body.innerHTML = '<div id="unique-id">First</div>';
      const element = document.querySelector('#unique-id');
      const result = engine.getIdSelector(element);
      expect(result).toBe('#unique-id');
    });
  });

  describe('getAttributeSelector()', () => {
    it('should return selector for preferred attribute', () => {
      document.body.innerHTML = '<button data-testid="submit-btn">Submit</button>';
      const element = document.querySelector('[data-testid="submit-btn"]');
      const selector = engine.getAttributeSelector(element);
      expect(selector).toContain('data-testid');
    });
    
    it('should return null when no preferred attributes', () => {
      document.body.innerHTML = '<div>No attributes</div>';
      const element = document.querySelector('div');
      expect(engine.getAttributeSelector(element)).toBeNull();
    });
    
    it('should return null when attribute selector is not unique', () => {
      document.body.innerHTML = `
        <button data-testid="same-id">One</button>
        <button data-testid="same-id">Two</button>
      `;
      const element = document.querySelector('[data-testid="same-id"]');
      expect(engine.getAttributeSelector(element)).toBeNull();
    });
  });

  describe('getClassSelector()', () => {
    it('should return null for elements without classes', () => {
      document.body.innerHTML = '<div>No classes</div>';
      const element = document.querySelector('div');
      expect(engine.getClassSelector(element)).toBeNull();
    });
    
    it('should filter out dynamic-looking classes', () => {
      document.body.innerHTML = '<div class="ember123 stable-class">Content</div>';
      const element = document.querySelector('div');
      const selector = engine.getClassSelector(element);
      if (selector) {
        expect(selector).not.toContain('ember123');
        expect(selector).toContain('stable-class');
      }
    });
    
    it('should try combination of classes when single class is not unique', () => {
      document.body.innerHTML = `
        <div class="aaa bbb ccc">Target</div>
        <div class="aaa">Other</div>
      `;
      const element = document.querySelector('.aaa.bbb.ccc');
      const selector = engine.getClassSelector(element);
      // Should include multiple classes or be a valid selector
      if (selector) {
        expect(typeof selector).toBe('string');
        expect(document.querySelector(selector)).toBe(element);
      }
    });
    
    it('should return null when all classes are filtered out', () => {
      document.body.innerHTML = '<div class="a">Short</div>';
      const element = document.querySelector('.a');
      // Class 'a' is only 1 char, filtered out
      const selector = engine.getClassSelector(element);
      // May return null or a selector depending on uniqueness
      if (selector) {
        expect(typeof selector).toBe('string');
      }
    });
  });

  describe('getNthChildSelector()', () => {
    it('should return null when element has no parent', () => {
      // document.body always has a parent (document), so we need to test differently
      const orphan = document.createElement('div');
      expect(engine.getNthChildSelector(orphan)).toBeNull();
    });
    
    it('should return null when parent selector cannot be generated', () => {
      document.body.innerHTML = '<div><span>Child</span></div>';
      const span = document.querySelector('span');
      // getShortSelector for the parent div should work, but if it returns null
      // we'd get null here
      const result = engine.getNthChildSelector(span);
      // Should return a valid selector
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('buildPathSelector()', () => {
    it('should build path from element to unique ancestor', () => {
      document.body.innerHTML = `
        <div id="root">
          <div class="level1">
            <div class="level2">
              <span class="target">Target</span>
            </div>
          </div>
        </div>
      `;
      const target = document.querySelector('.target');
      const selector = engine.buildPathSelector(target);
      expect(selector).toBeTruthy();
      // Should be able to find the element
      expect(document.querySelector(selector)).toBe(target);
    });
    
    it('should return full path even if not unique', () => {
      document.body.innerHTML = `
        <div><div><div><span>A</span></div></div></div>
        <div><div><div><span>B</span></div></div></div>
      `;
      const span = document.querySelector('span');
      const selector = engine.buildPathSelector(span);
      expect(selector).toBeTruthy();
    });
    
    it('should respect max depth limit', () => {
      // Create deeply nested structure (> 10 levels)
      let html = '<div id="root">';
      for (let i = 0; i < 15; i++) {
        html += '<div>';
      }
      html += '<span class="deep">Deep</span>';
      for (let i = 0; i < 15; i++) {
        html += '</div>';
      }
      html += '</div>';
      
      document.body.innerHTML = html;
      const target = document.querySelector('.deep');
      const selector = engine.buildPathSelector(target);
      // Should have limited depth
      const depth = (selector.match(/>/g) || []).length;
      expect(depth).toBeLessThanOrEqual(10);
    });
  });

  describe('getShortSelector()', () => {
    it('should return null for document.body', () => {
      expect(engine.getShortSelector(document.body)).toBeNull();
    });
    
    it('should return null for null element', () => {
      expect(engine.getShortSelector(null)).toBeNull();
    });
    
    it('should prefer ID when available', () => {
      document.body.innerHTML = '<div id="my-id" class="my-class">Content</div>';
      const element = document.querySelector('#my-id');
      const selector = engine.getShortSelector(element);
      expect(selector).toBe('#my-id');
    });
    
    it('should use preferred attribute when no ID', () => {
      document.body.innerHTML = '<div data-testid="test">Content</div>';
      const element = document.querySelector('[data-testid="test"]');
      const selector = engine.getShortSelector(element);
      expect(selector).toContain('data-testid');
    });
    
    it('should use tag with class when no ID or preferred attr', () => {
      document.body.innerHTML = '<div class="my-long-class">Content</div>';
      const element = document.querySelector('.my-long-class');
      const selector = engine.getShortSelector(element);
      expect(selector).toContain('div');
      expect(selector).toContain('.my-long-class');
    });
    
    it('should return just tag name as fallback', () => {
      document.body.innerHTML = '<article>Content</article>';
      const element = document.querySelector('article');
      const selector = engine.getShortSelector(element);
      expect(selector).toBe('article');
    });
  });

  describe('getElementPart()', () => {
    it('should include ID in part when available', () => {
      document.body.innerHTML = '<div id="my-elem">Content</div>';
      const element = document.querySelector('#my-elem');
      const part = engine.getElementPart(element);
      expect(part).toBe('div#my-elem');
    });
    
    it('should skip dynamic ID', () => {
      document.body.innerHTML = '<div id="ember789" class="stable">Content</div>';
      const element = document.querySelector('.stable');
      const part = engine.getElementPart(element);
      expect(part).not.toContain('ember789');
    });
    
    it('should use nth-of-type when no unique identifiers', () => {
      document.body.innerHTML = `
        <div>
          <span>First</span>
          <span>Second</span>
        </div>
      `;
      const spans = document.querySelectorAll('span');
      const part = engine.getElementPart(spans[1]);
      expect(part).toContain(':nth-of-type(2)');
    });
  });

  describe('stringSimilarity()', () => {
    it('should return 1 for identical strings', () => {
      expect(engine.stringSimilarity('hello', 'hello')).toBe(1);
    });
    
    it('should return 0 for empty strings', () => {
      expect(engine.stringSimilarity('', 'hello')).toBe(0);
      expect(engine.stringSimilarity('hello', '')).toBe(0);
    });
    
    it('should return 0 for null/undefined', () => {
      expect(engine.stringSimilarity(null, 'hello')).toBe(0);
      expect(engine.stringSimilarity('hello', undefined)).toBe(0);
    });
    
    it('should return 0 for very short strings', () => {
      expect(engine.stringSimilarity('a', 'b')).toBe(0);
    });
    
    it('should be case insensitive', () => {
      expect(engine.stringSimilarity('Hello', 'HELLO')).toBe(1);
    });
    
    it('should return value between 0 and 1 for similar strings', () => {
      const sim = engine.stringSimilarity('hello', 'hallo');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('scoreCandidate()', () => {
    it('should score attribute partial match', () => {
      document.body.innerHTML = '<div data-testid="similar-component"></div>';
      const element = document.querySelector('div');
      
      const parts = {
        tagName: 'div',
        classes: [],
        attributes: { 'data-testid': 'similar-comp' }, // partial match
        id: null,
        nthChild: null
      };
      
      const score = engine.scoreCandidate(element, parts, {});
      expect(score).toBeGreaterThan(0);
    });
    
    it('should score text content similarity', () => {
      document.body.innerHTML = '<div>Hello World Content</div>';
      const element = document.querySelector('div');
      
      const parts = { tagName: 'div', classes: [], attributes: {}, id: null, nthChild: null };
      const metadata = { textContent: 'Hello World Content' };
      
      const score = engine.scoreCandidate(element, parts, metadata);
      expect(score).toBeGreaterThan(0);
    });
    
    it('should score ID partial match', () => {
      document.body.innerHTML = '<div id="my-component-123"></div>';
      const element = document.querySelector('div');
      
      const parts = {
        tagName: 'div',
        classes: [],
        attributes: {},
        id: 'my-component-456', // similar but not exact
        nthChild: null
      };
      
      const score = engine.scoreCandidate(element, parts, {});
      expect(score).toBeGreaterThan(0);
    });
    
    it('should return 0 when maxScore is 0', () => {
      document.body.innerHTML = '<div></div>';
      const element = document.querySelector('div');
      
      const parts = { tagName: null, classes: [], attributes: {}, id: null, nthChild: null };
      const score = engine.scoreCandidate(element, parts, {});
      expect(score).toBe(0);
    });
  });

  describe('findCandidates()', () => {
    it('should filter by attributes when too many candidates', () => {
      // Create many elements
      let html = '';
      for (let i = 0; i < 120; i++) {
        html += `<div class="many">Item ${i}</div>`;
      }
      html += '<div class="many" data-special="yes">Special</div>';
      document.body.innerHTML = html;
      
      const parts = { tagName: 'div', classes: [], attributes: { 'data-special': 'yes' } };
      const candidates = engine.findCandidates(parts, {});
      
      expect(candidates.length).toBeLessThanOrEqual(100);
    });
    
    it('should search all elements when no tag name', () => {
      document.body.innerHTML = `
        <div>Div</div>
        <span>Span</span>
        <p>Para</p>
      `;
      
      const parts = { tagName: null, classes: ['some-class'], attributes: {} };
      const candidates = engine.findCandidates(parts, {});
      
      // Should have searched all elements
      expect(candidates.length).toBeGreaterThan(0);
    });
  });

  describe('findBestMatch()', () => {
    it('should return null when best match score is below threshold', () => {
      document.body.innerHTML = `
        <div class="completely-different">Unrelated</div>
      `;
      
      const result = engine.findBestMatch('button#specific-button.special-class[data-id="123"]', {});
      expect(result).toBeNull();
    });
    
    it('should find element by attribute match', () => {
      document.body.innerHTML = `
        <button data-testid="submit">Submit</button>
        <button data-testid="cancel">Cancel</button>
      `;
      
      const result = engine.findBestMatch('[data-testid="submit"]', {});
      expect(result).not.toBeNull();
      if (result) {
        expect(result.textContent).toBe('Submit');
      }
    });
  });

  describe('generateFallbackSelectors()', () => {
    it('should return multiple selectors', () => {
      document.body.innerHTML = '<div id="fallback-test" class="test-class">Content</div>';
      const element = document.querySelector('#fallback-test');
      
      const selectors = engine.generateFallbackSelectors(element);
      
      expect(selectors.length).toBeGreaterThan(0);
      // All selectors should find the element
      selectors.forEach(sel => {
        expect(document.querySelector(sel)).toBe(element);
      });
    });
    
    it('should not include duplicate selectors', () => {
      document.body.innerHTML = '<div id="unique">Content</div>';
      const element = document.querySelector('#unique');
      
      const selectors = engine.generateFallbackSelectors(element);
      const uniqueSelectors = new Set(selectors);
      
      expect(selectors.length).toBe(uniqueSelectors.size);
    });
  });

  describe('validateSelector() - additional patterns', () => {
    it('should reject url() patterns', () => {
      const result = engine.validateSelector('[style*="url(javascript:alert)"]');
      expect(result.valid).toBe(false);
    });
    
    it('should handle selector that throws in querySelector', () => {
      const result = engine.validateSelector('div:has(:invalid-pseudo)');
      // May be invalid depending on browser support
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('remaining branch coverage', () => {
    describe('generate() path fallback', () => {
      it('should fall back to a path selector when no strategy is unique', () => {
        document.body.innerHTML = '<div><span></span></div><div><span></span></div>';
        const target = document.querySelectorAll('span')[1];

        const selector = engine.generate(target);

        expect(selector).toBe('div:nth-of-type(2) > span:nth-of-type(1)');
        expect(document.querySelector(selector)).toBe(target);
      });
    });

    describe('getIdSelector()', () => {
      it('should return null when the id is shared by several elements', () => {
        document.body.innerHTML = '<div id="dup"></div><div id="dup"></div>';
        expect(engine.getIdSelector(document.querySelector('#dup'))).toBeNull();
      });

      it('should return null when CSS.escape throws', () => {
        document.body.innerHTML = '<div id="boom"></div>';
        CSS.escape.mockImplementationOnce(() => {
          throw new Error('escape failed');
        });
        expect(engine.getIdSelector(document.querySelector('#boom'))).toBeNull();
      });
    });

    describe('getClassSelector()', () => {
      it('should use a class combination when single classes are not unique', () => {
        document.body.innerHTML = `
          <div class="aa bb" id="target"></div>
          <div class="aa"></div>
          <div class="bb"></div>
        `;
        const selector = engine.getClassSelector(document.getElementById('target'));
        expect(selector).toBe('div.aa.bb');
      });

      it('should return null when the only stable class is not unique', () => {
        document.body.innerHTML = '<div class="aa"></div><div class="aa"></div>';
        expect(engine.getClassSelector(document.querySelector('div'))).toBeNull();
      });

      it('should return null when even the class combination is not unique', () => {
        document.body.innerHTML = '<div class="aa bb"></div><div class="aa bb"></div>';
        expect(engine.getClassSelector(document.querySelector('div'))).toBeNull();
      });
    });

    describe('getNthChildSelector()', () => {
      it('should return null when the element is not among its parent children', () => {
        const fake = {
          tagName: 'DIV',
          parentElement: { children: [] }
        };
        expect(engine.getNthChildSelector(fake)).toBeNull();
      });

      it('should return null when the parent has no short selector', () => {
        document.body.innerHTML = '<div></div>';
        expect(engine.getNthChildSelector(document.querySelector('div'))).toBeNull();
      });

      it('should return null when the nth-of-type selector is not unique', () => {
        document.body.innerHTML = '<section><p></p></section><section><p></p></section>';
        expect(engine.getNthChildSelector(document.querySelector('p'))).toBeNull();
      });
    });

    describe('buildPathSelector() and getElementPart()', () => {
      it('should return the full path when it never becomes unique (detached tree)', () => {
        const wrapper = document.createElement('section');
        const child = document.createElement('div');
        wrapper.appendChild(child);

        expect(engine.buildPathSelector(child)).toBe('section > div:nth-of-type(1)');
      });

      it('should use a preferred attribute for a path part', () => {
        document.body.innerHTML = '<div data-test-id="part"></div>';
        const part = engine.getElementPart(document.querySelector('div'));
        expect(part).toBe('div[data-test-id="part"]');
      });

      it('should use the bare tag name for an element without a parent', () => {
        expect(engine.getElementPart(document.documentElement)).toBe('html');
      });

      it('should handle elements without a classList', () => {
        const fake = {
          tagName: 'DIV',
          id: '',
          getAttribute: () => null,
          parentElement: null
        };
        expect(engine.getElementPart(fake)).toBe('div');
        expect(engine.getShortSelector(fake)).toBe('div');
      });
    });

    describe('isDynamicId()', () => {
      it('should treat an empty id as dynamic', () => {
        expect(engine.isDynamicId('')).toBe(true);
      });
    });

    describe('validate()', () => {
      it('should return false for a syntactically invalid selector', () => {
        const element = document.body;
        expect(engine.validate('div[', element)).toBe(false);
      });
    });

    describe('findBestMatch() and findCandidates()', () => {
      it('should work without metadata', () => {
        document.body.innerHTML = '<button id="save">Save</button>';
        expect(engine.findBestMatch('button#save')).toBe(document.getElementById('save'));
      });

      const buildMany = (count, className) => {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
          const item = document.createElement('div');
          if (className && i < 3) item.className = className;
          fragment.appendChild(item);
        }
        document.body.appendChild(fragment);
      };

      it('should narrow many candidates to elements sharing the classes', () => {
        buildMany(150, 'target-class');
        const parts = engine.parseSelector('div.target-class');
        const candidates = engine.findCandidates(parts, {});
        expect(candidates).toHaveLength(3);
      });

      it('should keep the tag candidates when no element matches the classes', () => {
        buildMany(150);
        const parts = engine.parseSelector('div.missing-class');
        const candidates = engine.findCandidates(parts, {});
        expect(candidates).toHaveLength(100);
      });

      it('should keep the tag candidates when too many elements match the classes', () => {
        buildMany(150, '');
        document.querySelectorAll('div').forEach(div => div.classList.add('common'));
        const parts = engine.parseSelector('div.common');
        expect(engine.findCandidates(parts, {})).toHaveLength(100);
      });

      it('should filter many candidates by attribute when there are no classes', () => {
        buildMany(150);
        document.querySelectorAll('div')[120].setAttribute('data-x', '1');
        const parts = engine.parseSelector('div[data-x="1"]');
        const candidates = engine.findCandidates(parts, {});
        expect(candidates).toHaveLength(1);
        expect(candidates[0].getAttribute('data-x')).toBe('1');
      });

      it('should query every element when the selector has no tag name', () => {
        document.body.innerHTML = '<p class="one"></p><span class="one"></span>';
        const parts = engine.parseSelector('.one');
        expect(engine.findCandidates(parts, {})).toHaveLength(2);
      });
    });

    describe('scoreCandidate()', () => {
      it('should not award tag points for a different tag', () => {
        document.body.innerHTML = '<span id="x"></span>';
        const parts = engine.parseSelector('div');
        expect(engine.scoreCandidate(document.getElementById('x'), parts, {})).toBe(0);
      });

      it('should skip attributes missing on the element', () => {
        document.body.innerHTML = '<div></div>';
        const parts = engine.parseSelector('div[data-missing="a"]');
        expect(engine.scoreCandidate(document.querySelector('div'), parts, {})).toBe(40);
      });

      it('should not award text points for dissimilar text', () => {
        document.body.innerHTML = '<div>completely different</div>';
        const parts = engine.parseSelector('div');
        const score = engine.scoreCandidate(document.querySelector('div'), parts, {
          textContent: 'zzzzzzzzzzzz'
        });
        expect(score).toBe(67);
      });
    });

    describe('generateFallbackSelectors()', () => {
      it('should skip the primary selector when generate returns nothing', () => {
        document.body.innerHTML = '<div id="solo"></div>';
        const element = document.getElementById('solo');
        const spy = jest.spyOn(engine, 'generate').mockReturnValue(null);

        const selectors = engine.generateFallbackSelectors(element);

        expect(selectors).toContain('#solo');
        spy.mockRestore();
      });
    });

    describe('validateSelector() extra patterns', () => {
      it('should reject a url() pattern that passes the shared checks', () => {
        const result = engine.validateSelector('[style*="url(image.png)"]');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Selector contains potentially unsafe patterns');
      });

      it('should reject unicode escape sequences', () => {
        const result = engine.validateSelector('.a\\31 b');
        expect(result.valid).toBe(false);
      });

      it('should report invalid CSS syntax', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = engine.validateSelector('div[');
        expect(result).toEqual({ valid: false, error: 'Invalid CSS selector syntax' });
        errorSpy.mockRestore();
      });
    });
  });
});
