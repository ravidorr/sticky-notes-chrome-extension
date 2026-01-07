/**
 * SelectorEngine
 * Generates robust CSS selectors for DOM elements
 * Prioritizes stable attributes over dynamic IDs
 */

import { validateSelectorPattern } from '../../shared/utils.js';

export class SelectorEngine {
  constructor() {
    // Patterns for dynamic/unstable IDs to avoid
    this.dynamicIdPatterns = [
      /^ember\d+/i,
      /^react-/i,
      /^ng-/i,
      /^vue-/i,
      /^:r\d+:/,
      /^[a-f0-9]{8}-[a-f0-9]{4}-/i, // UUID pattern
      /^\d+$/, // Pure numbers
      /^js-/i,
      /^_/,
      /^yui_/i,
      /^ext-gen/i,
      /^gwt-/i
    ];
    
    // Preferred attributes for selection (in priority order)
    this.preferredAttributes = [
      'data-testid',
      'data-test-id',
      'data-test',
      'data-cy',
      'data-id',
      'data-component',
      'data-automation-id',
      'name',
      'aria-label',
      'aria-labelledby',
      'role',
      'type',
      'placeholder',
      'title',
      'alt'
    ];
  }
  
  /**
   * Generate a CSS selector for an element
   * @param {Element} element - Target element
   * @returns {string|null} CSS selector or null if failed
   */
  generate(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    
    // Try different strategies in order of preference
    const strategies = [
      () => this.getIdSelector(element),
      () => this.getAttributeSelector(element),
      () => this.getClassSelector(element),
      () => this.getNthChildSelector(element)
    ];
    
    for (const strategy of strategies) {
      const selector = strategy();
      if (selector && this.isUnique(selector)) {
        return selector;
      }
    }
    
    // Fallback: build a path from root
    return this.buildPathSelector(element);
  }
  
  /**
   * Try to get ID-based selector
   * @param {Element} element - Target element
   * @returns {string|null} Selector or null
   */
  getIdSelector(element) {
    const id = element.id;
    
    if (!id) return null;
    
    // Check if ID looks dynamic
    if (this.isDynamicId(id)) return null;
    
    // Validate ID is valid CSS selector
    try {
      const selector = `#${CSS.escape(id)}`;
      return this.isUnique(selector) ? selector : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Try to get attribute-based selector
   * @param {Element} element - Target element
   * @returns {string|null} Selector or null
   */
  getAttributeSelector(element) {
    const tagName = element.tagName.toLowerCase();
    
    for (const attr of this.preferredAttributes) {
      const value = element.getAttribute(attr);
      
      if (value) {
        const selector = `${tagName}[${attr}="${CSS.escape(value)}"]`;
        if (this.isUnique(selector)) {
          return selector;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Try to get class-based selector
   * @param {Element} element - Target element
   * @returns {string|null} Selector or null
   */
  getClassSelector(element) {
    const tagName = element.tagName.toLowerCase();
    const classList = element.classList;
    
    if (!classList || classList.length === 0) return null;
    
    // Filter out dynamic-looking classes
    const stableClasses = Array.from(classList).filter(cls => {
      return !this.isDynamicId(cls) && cls.length > 1;
    });
    
    if (stableClasses.length === 0) return null;
    
    // Try single class first
    for (const cls of stableClasses) {
      const selector = `${tagName}.${CSS.escape(cls)}`;
      if (this.isUnique(selector)) {
        return selector;
      }
    }
    
    // Try combination of classes
    if (stableClasses.length >= 2) {
      const classStr = stableClasses.slice(0, 3).map(cls => `.${CSS.escape(cls)}`).join('');
      const selector = `${tagName}${classStr}`;
      if (this.isUnique(selector)) {
        return selector;
      }
    }
    
    return null;
  }
  
  /**
   * Get nth-child based selector
   * @param {Element} element - Target element
   * @returns {string|null} Selector or null
   */
  getNthChildSelector(element) {
    const parent = element.parentElement;
    if (!parent) return null;
    
    const tagName = element.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      child => child.tagName.toLowerCase() === tagName
    );
    
    const index = siblings.indexOf(element) + 1;
    
    if (index === 0) return null;
    
    // Build parent selector first
    const parentSelector = this.getShortSelector(parent);
    if (!parentSelector) return null;
    
    const selector = `${parentSelector} > ${tagName}:nth-of-type(${index})`;
    return this.isUnique(selector) ? selector : null;
  }
  
  /**
   * Build a path selector from element to unique ancestor
   * @param {Element} element - Target element
   * @returns {string} Path selector
   */
  buildPathSelector(element) {
    const path = [];
    let current = element;
    const maxDepth = 10;
    let depth = 0;
    
    while (current && current !== document.body && depth < maxDepth) {
      const part = this.getElementPart(current);
      path.unshift(part);
      
      // Check if current path is unique
      const selector = path.join(' > ');
      if (this.isUnique(selector)) {
        return selector;
      }
      
      current = current.parentElement;
      depth++;
    }
    
    // Return full path even if not unique
    return path.join(' > ');
  }
  
  /**
   * Get a short selector for an element (for building paths)
   * @param {Element} element - Target element
   * @returns {string|null} Short selector
   */
  getShortSelector(element) {
    if (!element || element === document.body) return null;
    
    // Try ID first
    if (element.id && !this.isDynamicId(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }
    
    // Try preferred attributes
    for (const attr of this.preferredAttributes.slice(0, 5)) {
      const value = element.getAttribute(attr);
      if (value) {
        return `[${attr}="${CSS.escape(value)}"]`;
      }
    }
    
    // Use tag name with classes
    const tagName = element.tagName.toLowerCase();
    const stableClass = Array.from(element.classList || [])
      .find(cls => !this.isDynamicId(cls) && cls.length > 2);
    
    if (stableClass) {
      return `${tagName}.${CSS.escape(stableClass)}`;
    }
    
    return tagName;
  }
  
  /**
   * Get element part for path building
   * @param {Element} element - Target element
   * @returns {string} Element part
   */
  getElementPart(element) {
    const tagName = element.tagName.toLowerCase();
    
    // Try ID
    if (element.id && !this.isDynamicId(element.id)) {
      return `${tagName}#${CSS.escape(element.id)}`;
    }
    
    // Try preferred attribute
    for (const attr of this.preferredAttributes.slice(0, 3)) {
      const value = element.getAttribute(attr);
      if (value) {
        return `${tagName}[${attr}="${CSS.escape(value)}"]`;
      }
    }
    
    // Try stable class
    const stableClass = Array.from(element.classList || [])
      .find(cls => !this.isDynamicId(cls) && cls.length > 2);
    
    if (stableClass) {
      return `${tagName}.${CSS.escape(stableClass)}`;
    }
    
    // Use nth-of-type
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        child => child.tagName.toLowerCase() === tagName
      );
      const index = siblings.indexOf(element) + 1;
      return `${tagName}:nth-of-type(${index})`;
    }
    
    return tagName;
  }
  
  /**
   * Check if an ID looks dynamic/unstable
   * @param {string} id - ID to check
   * @returns {boolean} True if dynamic
   */
  isDynamicId(id) {
    if (!id) return true;
    
    return this.dynamicIdPatterns.some(pattern => pattern.test(id));
  }
  
  /**
   * Check if a selector is unique in the document
   * @param {string} selector - CSS selector
   * @returns {boolean} True if unique
   */
  isUnique(selector) {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1;
    } catch {
      return false;
    }
  }
  
  /**
   * Validate a selector still matches the expected element
   * @param {string} selector - CSS selector
   * @param {Element} element - Expected element
   * @returns {boolean} True if valid
   */
  validate(selector, element) {
    try {
      const match = document.querySelector(selector);
      return match === element;
    } catch {
      return false;
    }
  }
  
  /**
   * Calculate a confidence score for a selector
   * @param {string} selector - CSS selector
   * @returns {number} Score from 0 to 100
   */
  getConfidenceScore(selector) {
    let score = 50; // Base score
    
    // Bonus for using stable attributes
    if (selector.includes('[data-testid=')) score += 30;
    else if (selector.includes('[data-')) score += 20;
    else if (selector.includes('[aria-')) score += 15;
    
    // Bonus for using ID (if not dynamic)
    if (selector.includes('#') && !selector.includes(':nth')) {
      score += 20;
    }
    
    // Penalty for long paths
    const depth = (selector.match(/>/g) || []).length;
    score -= depth * 5;
    
    // Penalty for nth selectors
    const nthCount = (selector.match(/:nth/g) || []).length;
    score -= nthCount * 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Find best matching element using fuzzy matching
   * Used when original selector no longer matches
   * @param {string} originalSelector - Original CSS selector
   * @param {Object} metadata - Additional metadata about the element
   * @returns {Element|null} Best matching element or null
   */
  findBestMatch(originalSelector, metadata = {}) {
    // Extract attributes from original selector
    const selectorParts = this.parseSelector(originalSelector);
    
    // Find candidate elements
    const candidates = this.findCandidates(selectorParts, metadata);
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Score each candidate
    const scoredCandidates = candidates.map(element => ({
      element,
      score: this.scoreCandidate(element, selectorParts, metadata)
    }));
    
    // Sort by score descending
    scoredCandidates.sort((itemA, itemB) => itemB.score - itemA.score);
    
    // Return best match if score is above threshold
    const bestMatch = scoredCandidates[0];
    if (bestMatch.score >= 50) {
      return bestMatch.element;
    }
    
    return null;
  }
  
  /**
   * Parse a CSS selector into parts
   * @param {string} selector - CSS selector
   * @returns {Object} Parsed selector parts
   */
  parseSelector(selector) {
    const parts = {
      tagName: null,
      id: null,
      classes: [],
      attributes: {},
      nthChild: null
    };
    
    // Extract tag name
    const tagMatch = selector.match(/^(\w+)/);
    if (tagMatch) {
      parts.tagName = tagMatch[1].toLowerCase();
    }
    
    // Extract ID
    const idMatch = selector.match(/#([^\s.#[:]+)/);
    if (idMatch) {
      parts.id = idMatch[1];
    }
    
    // Extract classes
    const classMatches = selector.matchAll(/\.([^\s.#[:]+)/g);
    for (const match of classMatches) {
      parts.classes.push(match[1]);
    }
    
    // Extract attributes
    const attrMatches = selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g);
    for (const match of attrMatches) {
      parts.attributes[match[1]] = match[2] || true;
    }
    
    // Extract nth-child/nth-of-type
    const nthMatch = selector.match(/:nth-(?:child|of-type)\((\d+)\)/);
    if (nthMatch) {
      parts.nthChild = parseInt(nthMatch[1], 10);
    }
    
    return parts;
  }
  
  /**
   * Find candidate elements for fuzzy matching
   * @param {Object} selectorParts - Parsed selector parts
   * @param {Object} metadata - Additional metadata
   * @returns {Element[]} Array of candidate elements
   */
  findCandidates(selectorParts, _metadata) {
    let candidates = [];
    
    // Try to find by tag name first
    if (selectorParts.tagName) {
      candidates = Array.from(document.getElementsByTagName(selectorParts.tagName));
    } else {
      candidates = Array.from(document.body.querySelectorAll('*'));
    }
    
    // Filter to reasonable candidates (limit to 100)
    if (candidates.length > 100) {
      // Prioritize elements with similar classes
      if (selectorParts.classes.length > 0) {
        const classSelector = selectorParts.classes.map(cls => `.${CSS.escape(cls)}`).join('');
        const classMatches = document.querySelectorAll(classSelector);
        if (classMatches.length > 0 && classMatches.length < 100) {
          candidates = Array.from(classMatches);
        }
      }
    }
    
    // Further filter by attributes if too many candidates
    if (candidates.length > 100 && Object.keys(selectorParts.attributes).length > 0) {
      candidates = candidates.filter(el => {
        return Object.keys(selectorParts.attributes).some(attr => el.hasAttribute(attr));
      }).slice(0, 100);
    }
    
    return candidates.slice(0, 100);
  }
  
  /**
   * Score a candidate element against selector parts
   * @param {Element} element - Candidate element
   * @param {Object} selectorParts - Parsed selector parts
   * @param {Object} metadata - Additional metadata
   * @returns {number} Score from 0 to 100
   */
  scoreCandidate(element, selectorParts, metadata) {
    let score = 0;
    let maxScore = 0;
    
    // Tag name match (20 points)
    if (selectorParts.tagName) {
      maxScore += 20;
      if (element.tagName.toLowerCase() === selectorParts.tagName) {
        score += 20;
      }
    }
    
    // ID match (25 points, but check for dynamic)
    if (selectorParts.id) {
      maxScore += 25;
      if (element.id === selectorParts.id) {
        score += 25;
      } else if (!this.isDynamicId(selectorParts.id) && element.id && 
                 this.stringSimilarity(element.id, selectorParts.id) > 0.7) {
        score += 15; // Partial match
      }
    }
    
    // Class matches (up to 25 points)
    if (selectorParts.classes.length > 0) {
      maxScore += 25;
      const elementClasses = Array.from(element.classList);
      const matchingClasses = selectorParts.classes.filter(cls => elementClasses.includes(cls));
      score += Math.round((matchingClasses.length / selectorParts.classes.length) * 25);
    }
    
    // Attribute matches (up to 30 points)
    const attrCount = Object.keys(selectorParts.attributes).length;
    if (attrCount > 0) {
      maxScore += 30;
      let attrScore = 0;
      for (const [attr, value] of Object.entries(selectorParts.attributes)) {
        const elementValue = element.getAttribute(attr);
        if (elementValue !== null) {
          if (value === true || elementValue === value) {
            attrScore += 30 / attrCount;
          } else if (typeof value === 'string' && this.stringSimilarity(elementValue, value) > 0.7) {
            attrScore += (20 / attrCount); // Partial match
          }
        }
      }
      score += Math.round(attrScore);
    }
    
    // Text content similarity (if metadata contains text)
    if (metadata.textContent) {
      maxScore += 10;
      const elementText = element.textContent?.trim().substring(0, 100);
      const metadataText = metadata.textContent.substring(0, 100);
      if (elementText && this.stringSimilarity(elementText, metadataText) > 0.8) {
        score += 10;
      }
    }
    
    // Normalize score to 0-100
    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }
  
  /**
   * Calculate string similarity (Sørensen–Dice coefficient)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity from 0 to 1
   */
  stringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
    
    if (str1.length < 2 || str2.length < 2) return 0;
    
    const bigrams1 = new Map();
    for (let i = 0; i < str1.length - 1; i++) {
      const bigram = str1.substring(i, i + 2);
      bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
    }
    
    let intersectionSize = 0;
    for (let i = 0; i < str2.length - 1; i++) {
      const bigram = str2.substring(i, i + 2);
      const count = bigrams1.get(bigram) || 0;
      if (count > 0) {
        bigrams1.set(bigram, count - 1);
        intersectionSize++;
      }
    }
    
    return (2 * intersectionSize) / (str1.length + str2.length - 2);
  }
  
  /**
   * Generate fallback selectors for an element
   * Returns multiple selectors in order of preference
   * @param {Element} element - Target element
   * @returns {string[]} Array of selectors
   */
  generateFallbackSelectors(element) {
    const selectors = [];
    
    // Primary selector
    const primary = this.generate(element);
    if (primary) {
      selectors.push(primary);
    }
    
    // Alternative selectors using different strategies
    const alternatives = [
      this.getIdSelector(element),
      this.getAttributeSelector(element),
      this.getClassSelector(element),
      this.buildPathSelector(element)
    ].filter(sel => sel && !selectors.includes(sel));
    
    selectors.push(...alternatives);
    
    return selectors;
  }
  
  /**
   * Validate that a selector is safe and well-formed
   * Prevents potentially malicious or invalid selectors from being stored
   * @param {string} selector - CSS selector to validate
   * @returns {Object} { valid: boolean, error?: string }
   */
  validateSelector(selector) {
    // Use shared validation for basic pattern checks
    const patternValidation = validateSelectorPattern(selector);
    if (!patternValidation.valid) {
      return patternValidation;
    }
    
    const trimmed = selector.trim();
    
    // Additional patterns not in shared (more strict for client-side)
    const additionalDangerousPatterns = [
      /url\s*\([^)]*\)/i,   // url() that's not safe
      /\\[0-9a-f]/i         // Unicode escape sequences that might bypass filters
    ];
    
    for (const pattern of additionalDangerousPatterns) {
      if (pattern.test(trimmed)) {
        return { valid: false, error: 'Selector contains potentially unsafe patterns' };
      }
    }
    
    // Try to use the selector to verify it's valid CSS (DOM check)
    try {
      document.querySelector(trimmed);
    } catch (_e) {
      return { valid: false, error: 'Invalid CSS selector syntax' };
    }
    
    return { valid: true };
  }
  
  /**
   * Sanitize a selector by removing potentially dangerous parts
   * @param {string} selector - CSS selector to sanitize
   * @returns {string|null} Sanitized selector or null if cannot be sanitized
   */
  sanitizeSelector(selector) {
    const validation = this.validateSelector(selector);
    if (validation.valid) {
      return selector.trim();
    }
    return null;
  }
}
