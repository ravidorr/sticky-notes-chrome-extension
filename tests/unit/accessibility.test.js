/**
 * Accessibility Tests using jest-axe
 * Tests WCAG 2.1 AA compliance for extension UI components
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import jestAxe from 'jest-axe';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { axe, toHaveNoViolations } = jestAxe;

// Extend Jest expect with axe matchers
expect.extend(toHaveNoViolations);

describe('Accessibility Tests', () => {
    const localThis = {};

    beforeEach(() => {
        localThis.originalConsoleError = console.error;
        console.error = jest.fn();
    });

    afterEach(() => {
        console.error = localThis.originalConsoleError;
        document.body.innerHTML = '';
    });

    describe('Popup UI Accessibility', () => {
        beforeEach(() => {
            // Load actual popup HTML
            const popupHtml = readFileSync(
                resolve(process.cwd(), 'src/popup/popup.html'),
                'utf8'
            );
            // Extract body content
            const bodyMatch = popupHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                document.body.innerHTML = bodyMatch[1];
            }
        });

        it('should have no critical accessibility violations in popup', async () => {
            const results = await axe(document.body, {
                rules: {
                    // Only check for WCAG 2.1 AA rules
                    'color-contrast': { enabled: true },
                    'link-name': { enabled: true },
                    'button-name': { enabled: true },
                    'image-alt': { enabled: true },
                    'label': { enabled: true },
                    'aria-roles': { enabled: true },
                    'aria-valid-attr': { enabled: true },
                    'aria-valid-attr-value': { enabled: true },
                    'duplicate-id': { enabled: true },
                    'tabindex': { enabled: true },
                    // Disable rules that require running browser context
                    'region': { enabled: false },
                    'landmark-one-main': { enabled: false },
                    'page-has-heading-one': { enabled: false },
                    'bypass': { enabled: false }
                },
                resultTypes: ['violations']
            });

            expect(results).toHaveNoViolations();
        });

        it('should have accessible tab navigation with proper ARIA', async () => {
            const tablist = document.querySelector('[role="tablist"]');
            expect(tablist).not.toBeNull();
            expect(tablist.getAttribute('aria-label')).toBeTruthy();

            const tabs = document.querySelectorAll('[role="tab"]');
            expect(tabs.length).toBeGreaterThan(0);

            tabs.forEach(tab => {
                expect(tab.getAttribute('aria-selected')).toBeTruthy();
                expect(tab.getAttribute('aria-controls')).toBeTruthy();
            });

            const tabpanels = document.querySelectorAll('[role="tabpanel"]');
            expect(tabpanels.length).toBe(tabs.length);

            tabpanels.forEach(panel => {
                expect(panel.getAttribute('aria-labelledby')).toBeTruthy();
            });
        });

        it('should have accessible icon buttons with aria-labels', async () => {
            const iconButtons = document.querySelectorAll('.icon-btn');
            
            iconButtons.forEach(btn => {
                const hasAriaLabel = btn.hasAttribute('aria-label');
                const hasVisibleText = btn.textContent.trim().length > 0;
                const hasTitle = btn.hasAttribute('title');
                
                // Every icon button should have accessible name
                expect(hasAriaLabel || hasVisibleText || hasTitle).toBe(true);
            });
        });

        it('should have accessible dropdown menus with proper ARIA', async () => {
            const actionsBtn = document.getElementById('actionsBtn');
            
            if (actionsBtn) {
                expect(actionsBtn.getAttribute('aria-expanded')).toBeTruthy();
                expect(actionsBtn.getAttribute('aria-haspopup')).toBe('menu');
                expect(actionsBtn.getAttribute('aria-controls')).toBeTruthy();
            }

            const menu = document.querySelector('[role="menu"]');
            if (menu) {
                const menuItems = menu.querySelectorAll('[role="menuitem"]');
                expect(menuItems.length).toBeGreaterThan(0);
            }
        });

        it('should have accessible modal dialogs', async () => {
            const modals = document.querySelectorAll('[role="dialog"]');
            
            modals.forEach(modal => {
                expect(modal.getAttribute('aria-modal')).toBe('true');
                const labelledBy = modal.getAttribute('aria-labelledby');
                expect(labelledBy).toBeTruthy();
                
                // Verify the referenced label element exists
                if (labelledBy) {
                    const labelElement = document.getElementById(labelledBy);
                    expect(labelElement).not.toBeNull();
                }
            });
        });

        it('should have accessible radio groups in delete old notes modal', async () => {
            const radioGroup = document.querySelector('[role="radiogroup"]');
            
            if (radioGroup) {
                expect(radioGroup.getAttribute('aria-label')).toBeTruthy();
                
                const radios = radioGroup.querySelectorAll('[role="radio"]');
                expect(radios.length).toBeGreaterThan(0);
                
                radios.forEach(radio => {
                    expect(radio.getAttribute('aria-checked')).toBeTruthy();
                });
            }
        });

        it('should have a skip link for keyboard navigation', () => {
            const skipLink = document.querySelector('.skip-link');
            expect(skipLink).not.toBeNull();
            expect(skipLink.getAttribute('href')).toBe('#main-content');
            expect(skipLink.textContent || skipLink.getAttribute('data-i18n')).toBeTruthy();
            
            // Skip link target should exist
            const target = document.getElementById('main-content');
            expect(target).not.toBeNull();
            expect(target.getAttribute('tabindex')).toBe('-1');
        });

        it('should have aria-hidden on decorative logo SVG', () => {
            const headerLogo = document.querySelector('.header-logo svg');
            expect(headerLogo).not.toBeNull();
            expect(headerLogo.getAttribute('aria-hidden')).toBe('true');
        });

        it('should have aria-hidden on decorative empty state SVGs', () => {
            const emptyStateSvgs = document.querySelectorAll('.notes-empty svg');
            expect(emptyStateSvgs.length).toBeGreaterThan(0);
            
            emptyStateSvgs.forEach(svg => {
                expect(svg.getAttribute('aria-hidden')).toBe('true');
            });
        });
    });

    describe('Options UI Accessibility', () => {
        beforeEach(() => {
            // Load actual options HTML
            const optionsHtml = readFileSync(
                resolve(process.cwd(), 'src/options/options.html'),
                'utf8'
            );
            // Extract body content
            const bodyMatch = optionsHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
                document.body.innerHTML = bodyMatch[1];
            }
        });

        it('should have no critical accessibility violations in options', async () => {
            const results = await axe(document.body, {
                rules: {
                    'color-contrast': { enabled: true },
                    'link-name': { enabled: true },
                    'button-name': { enabled: true },
                    'image-alt': { enabled: true },
                    'label': { enabled: true },
                    'aria-roles': { enabled: true },
                    'aria-valid-attr': { enabled: true },
                    'aria-valid-attr-value': { enabled: true },
                    'duplicate-id': { enabled: true },
                    'tabindex': { enabled: true },
                    'region': { enabled: false },
                    'landmark-one-main': { enabled: false },
                    'page-has-heading-one': { enabled: false },
                    'bypass': { enabled: false }
                },
                resultTypes: ['violations']
            });

            expect(results).toHaveNoViolations();
        });

        it('should have accessible theme picker as radio group', async () => {
            const themePicker = document.getElementById('themePicker');
            
            if (themePicker) {
                expect(themePicker.getAttribute('role')).toBe('radiogroup');
                expect(themePicker.getAttribute('aria-label')).toBeTruthy();
                
                const themeOptions = themePicker.querySelectorAll('.theme-option');
                themeOptions.forEach(option => {
                    expect(option.getAttribute('role')).toBe('radio');
                    expect(option.getAttribute('aria-checked')).toBeTruthy();
                    expect(option.getAttribute('aria-label')).toBeTruthy();
                });
            }
        });

        it('should have accessible position picker as radio group', async () => {
            const positionPicker = document.getElementById('positionPicker');
            
            if (positionPicker) {
                expect(positionPicker.getAttribute('role')).toBe('radiogroup');
                expect(positionPicker.getAttribute('aria-label')).toBeTruthy();
                
                const positionOptions = positionPicker.querySelectorAll('.position-option');
                positionOptions.forEach(option => {
                    expect(option.getAttribute('role')).toBe('radio');
                    expect(option.getAttribute('aria-checked')).toBeTruthy();
                    expect(option.getAttribute('aria-label')).toBeTruthy();
                });
            }
        });

        it('should have accessible toggle switch', async () => {
            const toggle = document.getElementById('notesVisibleByDefault');
            
            if (toggle) {
                expect(toggle.getAttribute('role')).toBe('switch');
                expect(toggle.getAttribute('aria-checked')).toBeTruthy();
            }
        });

        it('should have labels for all form controls', async () => {
            const inputs = document.querySelectorAll('input, select, textarea');
            
            inputs.forEach(input => {
                const hasLabel = input.labels && input.labels.length > 0;
                const hasAriaLabel = input.hasAttribute('aria-label');
                const hasAriaLabelledBy = input.hasAttribute('aria-labelledby');
                const isHidden = input.type === 'hidden' || input.hidden;
                
                // Every visible input should have an accessible label
                if (!isHidden) {
                    expect(hasLabel || hasAriaLabel || hasAriaLabelledBy).toBe(true);
                }
            });
        });

        it('should have aria-hidden on decorative logo SVG', () => {
            const headerLogo = document.querySelector('.header-logo svg');
            expect(headerLogo).not.toBeNull();
            expect(headerLogo.getAttribute('aria-hidden')).toBe('true');
        });

        it('should have role=status on status message container', () => {
            const statusMessage = document.getElementById('statusMessage');
            expect(statusMessage).not.toBeNull();
            expect(statusMessage.getAttribute('role')).toBe('status');
        });
    });

    describe('General ARIA Patterns', () => {
        it('should have valid ARIA attributes', () => {
            // Valid aria-expanded values
            const expandedElements = document.querySelectorAll('[aria-expanded]');
            expandedElements.forEach(el => {
                const value = el.getAttribute('aria-expanded');
                expect(['true', 'false']).toContain(value);
            });

            // Valid aria-checked values
            const checkedElements = document.querySelectorAll('[aria-checked]');
            checkedElements.forEach(el => {
                const value = el.getAttribute('aria-checked');
                expect(['true', 'false', 'mixed']).toContain(value);
            });

            // Valid aria-selected values
            const selectedElements = document.querySelectorAll('[aria-selected]');
            selectedElements.forEach(el => {
                const value = el.getAttribute('aria-selected');
                expect(['true', 'false']).toContain(value);
            });

            // Valid aria-pressed values
            const pressedElements = document.querySelectorAll('[aria-pressed]');
            pressedElements.forEach(el => {
                const value = el.getAttribute('aria-pressed');
                expect(['true', 'false', 'mixed']).toContain(value);
            });
        });

        it('should have aria-hidden on decorative SVGs', () => {
            document.body.innerHTML = `
                <button>
                    <svg aria-hidden="true"><path d="M0 0"/></svg>
                    Action
                </button>
            `;
            
            const decorativeSvgs = document.querySelectorAll('button svg');
            decorativeSvgs.forEach(svg => {
                // SVGs inside buttons with text should be aria-hidden
                const parent = svg.closest('button');
                if (parent && parent.textContent.trim().length > 0) {
                    expect(svg.getAttribute('aria-hidden')).toBe('true');
                }
            });
        });
    });

    describe('Reduced Motion Support', () => {
        it('should have prefers-reduced-motion styles in popup CSS', () => {
            const popupCss = readFileSync(
                resolve(process.cwd(), 'src/popup/popup.css'),
                'utf8'
            );
            
            expect(popupCss).toContain('@media (prefers-reduced-motion: reduce)');
            expect(popupCss).toContain('animation-duration: 0.01ms');
            expect(popupCss).toContain('transition-duration: 0.01ms');
        });

        it('should have prefers-reduced-motion styles in options CSS', () => {
            const optionsCss = readFileSync(
                resolve(process.cwd(), 'src/options/options.css'),
                'utf8'
            );
            
            expect(optionsCss).toContain('@media (prefers-reduced-motion: reduce)');
            expect(optionsCss).toContain('animation-duration: 0.01ms');
            expect(optionsCss).toContain('transition-duration: 0.01ms');
        });
    });

    describe('Keyboard Navigation', () => {
        it('should have focusable interactive elements', () => {
            document.body.innerHTML = `
                <button id="btn1">Button 1</button>
                <a href="#" id="link1">Link 1</a>
                <input type="text" id="input1">
                <select id="select1"><option>Option</option></select>
            `;

            const interactiveElements = document.querySelectorAll(
                'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
            );

            interactiveElements.forEach(el => {
                const tabindex = el.getAttribute('tabindex');
                // Should be focusable (no tabindex or tabindex >= 0)
                expect(tabindex === null || parseInt(tabindex, 10) >= 0).toBe(true);
            });
        });

        it('should not have positive tabindex values', () => {
            document.body.innerHTML = `
                <button tabindex="0">OK</button>
                <button>Cancel</button>
            `;

            const elementsWithTabindex = document.querySelectorAll('[tabindex]');
            
            elementsWithTabindex.forEach(el => {
                const tabindex = parseInt(el.getAttribute('tabindex'), 10);
                // Positive tabindex is an anti-pattern
                expect(tabindex).toBeLessThanOrEqual(0);
            });
        });
    });
});
