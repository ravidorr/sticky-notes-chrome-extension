/**
 * Unit tests for src/content/app/styles.js
 * Tests for CSS styles used in shadow DOM
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getShadowStyles, getMainDocumentStyles, injectMainDocumentStyles } from '../../src/content/app/styles.js';

describe('src/content/app/styles.js', () => {
    describe('getShadowStyles', () => {
        let styles;

        beforeEach(() => {
            styles = getShadowStyles();
        });

        it('should return a string', () => {
            expect(typeof styles).toBe('string');
        });

        it('should return non-empty styles', () => {
            expect(styles.length).toBeGreaterThan(0);
        });

        // ============================================
        // CSS Variables Tests
        // ============================================

        describe('CSS Variables', () => {
            it('should include :host selector', () => {
                expect(styles).toContain(':host');
            });

            it('should define color variables', () => {
                expect(styles).toContain('--sn-color-success');
                expect(styles).toContain('--sn-color-error');
                expect(styles).toContain('--sn-color-warning');
                expect(styles).toContain('--sn-color-primary');
            });

            it('should define text color variables', () => {
                expect(styles).toContain('--sn-color-text-dark');
                expect(styles).toContain('--sn-color-text-body');
                expect(styles).toContain('--sn-color-text-muted');
            });

            it('should define shadow variables', () => {
                expect(styles).toContain('--sn-shadow-sm');
                expect(styles).toContain('--sn-shadow-md');
                expect(styles).toContain('--sn-shadow-lg');
            });

            it('should define radius variables', () => {
                expect(styles).toContain('--sn-radius-sm');
                expect(styles).toContain('--sn-radius-md');
                expect(styles).toContain('--sn-radius-lg');
            });

            it('should define font family', () => {
                expect(styles).toContain('--sn-font-family');
            });

            it('should define z-index max', () => {
                expect(styles).toContain('--sn-z-max');
                expect(styles).toContain('2147483647');
            });
        });

        // ============================================
        // Button Styles Tests
        // ============================================

        describe('Button styles', () => {
            it('should include button base class', () => {
                expect(styles).toContain('.sn-btn');
            });

            it('should include button variants', () => {
                expect(styles).toContain('.sn-btn-primary');
                expect(styles).toContain('.sn-btn-secondary');
                expect(styles).toContain('.sn-btn-danger');
            });

            it('should include hover states', () => {
                expect(styles).toContain('.sn-btn-primary:hover');
                expect(styles).toContain('.sn-btn-secondary:hover');
                expect(styles).toContain('.sn-btn-danger:hover');
            });

            it('should include focus styles for accessibility', () => {
                expect(styles).toContain('.sn-btn:focus');
                expect(styles).toContain('outline');
            });
        });

        // ============================================
        // Theme Colors Tests
        // ============================================

        describe('Theme colors', () => {
            it('should define yellow theme', () => {
                expect(styles).toContain('--sn-color-bg-yellow');
            });

            it('should define gradient backgrounds', () => {
                expect(styles).toContain('linear-gradient');
            });
        });

        // ============================================
        // Layout and Positioning Tests
        // ============================================

        describe('Layout styles', () => {
            it('should include transition properties', () => {
                expect(styles).toContain('transition');
            });

            it('should include cursor styles', () => {
                expect(styles).toContain('cursor');
            });

            it('should include display properties', () => {
                expect(styles).toContain('display');
            });

            it('should include flex properties', () => {
                expect(styles).toContain('align-items');
                expect(styles).toContain('justify-content');
            });
        });

        // ============================================
        // Typography Tests
        // ============================================

        describe('Typography', () => {
            it('should include font-size', () => {
                expect(styles).toContain('font-size');
            });

            it('should include font-weight', () => {
                expect(styles).toContain('font-weight');
            });

            it('should include font-family reference', () => {
                expect(styles).toContain('font-family');
            });
        });

        // ============================================
        // Spacing Tests
        // ============================================

        describe('Spacing', () => {
            it('should include padding', () => {
                expect(styles).toContain('padding');
            });

            it('should include margin', () => {
                expect(styles).toContain('margin');
            });
        });

        // ============================================
        // Border and Radius Tests
        // ============================================

        describe('Borders', () => {
            it('should include border properties', () => {
                expect(styles).toContain('border');
            });

            it('should include border-radius', () => {
                expect(styles).toContain('border-radius');
            });
        });

        // ============================================
        // Colors and Backgrounds Tests
        // ============================================

        describe('Colors and backgrounds', () => {
            it('should include background properties', () => {
                expect(styles).toContain('background');
            });

            it('should include color properties', () => {
                expect(styles).toContain('color:');
            });

            it('should include hex color values', () => {
                expect(styles).toMatch(/#[0-9a-fA-F]{3,6}/);
            });

            it('should include rgba values', () => {
                expect(styles).toContain('rgba');
            });
        });

        // ============================================
        // Shadow Tests
        // ============================================

        describe('Shadows', () => {
            it('should include box-shadow', () => {
                expect(styles).toContain('box-shadow');
            });
        });

        // ============================================
        // Accessibility Tests
        // ============================================

        describe('Accessibility', () => {
            it('should include focus visible styles', () => {
                expect(styles).toContain(':focus');
            });

            it('should include outline for focus', () => {
                expect(styles).toContain('outline');
            });
        });

        // ============================================
        // Animation Tests
        // ============================================

        describe('Animations', () => {
            it('should include transition for smooth interactions', () => {
                expect(styles).toContain('transition');
            });
        });

        // ============================================
        // Valid CSS Tests
        // ============================================

        describe('CSS validity', () => {
            it('should have balanced curly braces', () => {
                const openBraces = (styles.match(/{/g) || []).length;
                const closeBraces = (styles.match(/}/g) || []).length;
                expect(openBraces).toBe(closeBraces);
            });

            it('should not have empty selectors', () => {
                // Check for patterns like "{ }" or "{}" with just whitespace
                expect(styles).not.toMatch(/\{\s*\}/);
            });

            it('should have proper semicolons in declarations', () => {
                // Most CSS declarations should end with semicolons
                const hasDeclarations = styles.includes(':');
                if (hasDeclarations) {
                    expect(styles).toContain(';');
                }
            });
        });
    });

    // ============================================
    // getMainDocumentStyles Tests
    // ============================================

    describe('getMainDocumentStyles', () => {
        let mainStyles;

        beforeEach(() => {
            mainStyles = getMainDocumentStyles();
        });

        it('should return a string', () => {
            expect(typeof mainStyles).toBe('string');
        });

        it('should return non-empty styles', () => {
            expect(mainStyles.length).toBeGreaterThan(0);
        });

        it('should include selection mode cursor style', () => {
            expect(mainStyles).toContain('.sn-selection-mode');
            expect(mainStyles).toContain('cursor');
            expect(mainStyles).toContain('crosshair');
        });

        it('should include element highlight style', () => {
            expect(mainStyles).toContain('.sn-element-highlight');
        });

        it('should include outline for highlight', () => {
            expect(mainStyles).toContain('outline');
        });

        it('should include important modifiers for specificity', () => {
            expect(mainStyles).toContain('!important');
        });

        it('should include background highlight color', () => {
            expect(mainStyles).toContain('background-color');
            expect(mainStyles).toContain('rgba');
        });

        it('should include transition for smooth highlighting', () => {
            expect(mainStyles).toContain('transition');
        });

        it('should have balanced curly braces', () => {
            const openBraces = (mainStyles.match(/{/g) || []).length;
            const closeBraces = (mainStyles.match(/}/g) || []).length;
            expect(openBraces).toBe(closeBraces);
        });
    });

    // ============================================
    // injectMainDocumentStyles Tests
    // ============================================

    describe('injectMainDocumentStyles', () => {
        const styleId = 'sticky-notes-main-styles';

        beforeEach(() => {
            // Clean up any existing style element
            const existing = document.getElementById(styleId);
            if (existing) {
                existing.remove();
            }
        });

        afterEach(() => {
            // Clean up after tests
            const style = document.getElementById(styleId);
            if (style) {
                style.remove();
            }
        });

        it('should inject a style element into document head', () => {
            expect(document.getElementById(styleId)).toBeNull();
            
            injectMainDocumentStyles();
            
            const styleElement = document.getElementById(styleId);
            expect(styleElement).not.toBeNull();
            expect(styleElement.tagName.toLowerCase()).toBe('style');
        });

        it('should inject styles into document.head', () => {
            injectMainDocumentStyles();
            
            const styleElement = document.getElementById(styleId);
            expect(document.head.contains(styleElement)).toBe(true);
        });

        it('should include the main document styles content', () => {
            injectMainDocumentStyles();
            
            const styleElement = document.getElementById(styleId);
            expect(styleElement.textContent).toContain('.sn-selection-mode');
            expect(styleElement.textContent).toContain('.sn-element-highlight');
        });

        it('should not inject duplicate style elements', () => {
            injectMainDocumentStyles();
            injectMainDocumentStyles();
            injectMainDocumentStyles();
            
            const styleElements = document.querySelectorAll(`#${styleId}`);
            expect(styleElements.length).toBe(1);
        });

        it('should use correct style id', () => {
            injectMainDocumentStyles();
            
            expect(document.getElementById(styleId)).not.toBeNull();
        });
    });
});
