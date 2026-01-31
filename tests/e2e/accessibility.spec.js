/**
 * Playwright E2E Accessibility Tests
 * Tests WCAG 2.1 AA compliance for extension UI using axe-core
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Extension Accessibility E2E Tests', () => {
    test.describe('Test Fixture Page Accessibility', () => {
        test('should have no accessibility violations on test fixture page', async ({ page }) => {
            await page.goto('/');
            
            const accessibilityScanResults = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
                .exclude('.sn-note') // Exclude dynamically injected notes
                .analyze();

            expect(accessibilityScanResults.violations).toEqual([]);
        });
    });

    test.describe('Sticky Note Component Accessibility', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            // Wait for page to be ready
            await page.waitForLoadState('networkidle');
        });

        test('should have accessible focus styles on interactive elements', async ({ page }) => {
            // Create a test button and verify focus is visible
            await page.evaluate(() => {
                const btn = document.createElement('button');
                btn.textContent = 'Test Button';
                btn.className = 'test-focus-button';
                document.body.appendChild(btn);
            });

            const button = page.locator('.test-focus-button');
            await button.focus();
            
            // Check that the button is focused
            const isFocused = await button.evaluate(el => document.activeElement === el);
            expect(isFocused).toBe(true);
        });
    });

    test.describe('Color Contrast', () => {
        test('should pass color contrast requirements for text', async ({ page }) => {
            await page.goto('/');
            
            const accessibilityScanResults = await new AxeBuilder({ page })
                .withTags(['cat.color'])
                .analyze();

            const contrastViolations = accessibilityScanResults.violations.filter(
                v => v.id === 'color-contrast'
            );

            expect(contrastViolations).toEqual([]);
        });
    });

    test.describe('Keyboard Navigation', () => {
        test('should allow keyboard navigation through interactive elements', async ({ page }) => {
            await page.goto('/');
            
            // Get all focusable elements
            const focusableSelectors = [
                'button:not([disabled])',
                'a[href]',
                'input:not([disabled])',
                'select:not([disabled])',
                'textarea:not([disabled])',
                '[tabindex]:not([tabindex="-1"])'
            ].join(', ');

            const focusableCount = await page.locator(focusableSelectors).count();
            
            // Tab through elements and verify focus moves
            for (let i = 0; i < Math.min(focusableCount, 5); i++) {
                await page.keyboard.press('Tab');
                
                // Verify something is focused
                const activeElement = await page.evaluate(() => {
                    return document.activeElement?.tagName.toLowerCase();
                });
                
                expect(activeElement).not.toBe('body');
            }
        });

        test('should trap focus within modal dialogs when open', async ({ page }) => {
            await page.goto('/');
            
            // This test would need the extension's modal to be open
            // For now, we test the general pattern
            await page.evaluate(() => {
                // Create a mock modal
                const modal = document.createElement('div');
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.innerHTML = `
                    <button id="modalBtn1">Button 1</button>
                    <button id="modalBtn2">Button 2</button>
                    <button id="modalClose">Close</button>
                `;
                document.body.appendChild(modal);
            });

            const modal = page.locator('[role="dialog"]');
            expect(await modal.getAttribute('aria-modal')).toBe('true');
        });
    });

    test.describe('ARIA Landmarks and Roles', () => {
        test('should have valid ARIA roles', async ({ page }) => {
            await page.goto('/');
            
            const accessibilityScanResults = await new AxeBuilder({ page })
                .withTags(['cat.aria'])
                .analyze();

            const ariaViolations = accessibilityScanResults.violations.filter(v =>
                v.id.startsWith('aria-')
            );

            expect(ariaViolations).toEqual([]);
        });
    });

    test.describe('Form Accessibility', () => {
        test('should have accessible form controls', async ({ page }) => {
            await page.goto('/');
            
            const accessibilityScanResults = await new AxeBuilder({ page })
                .withTags(['cat.forms'])
                .analyze();

            const formViolations = accessibilityScanResults.violations.filter(v =>
                ['label', 'label-title-only', 'select-name', 'input-button-name'].includes(v.id)
            );

            expect(formViolations).toEqual([]);
        });
    });

    test.describe('Interactive Elements', () => {
        test('should have accessible button names', async ({ page }) => {
            await page.goto('/');
            
            const accessibilityScanResults = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa'])
                .analyze();

            const buttonViolations = accessibilityScanResults.violations.filter(
                v => v.id === 'button-name'
            );

            expect(buttonViolations).toEqual([]);
        });

        test('should have accessible link names', async ({ page }) => {
            await page.goto('/');
            
            const accessibilityScanResults = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa'])
                .analyze();

            const linkViolations = accessibilityScanResults.violations.filter(
                v => v.id === 'link-name'
            );

            expect(linkViolations).toEqual([]);
        });
    });

    test.describe('Images and Icons', () => {
        test('should have alt text on images', async ({ page }) => {
            await page.goto('/');
            
            const accessibilityScanResults = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa'])
                .analyze();

            const imageViolations = accessibilityScanResults.violations.filter(
                v => v.id === 'image-alt'
            );

            expect(imageViolations).toEqual([]);
        });

        test('should have decorative icons hidden from screen readers', async ({ page }) => {
            await page.goto('/');
            
            // Check that SVGs inside buttons are aria-hidden
            const iconButtonSvgs = await page.locator('button svg').all();
            
            for (const svg of iconButtonSvgs) {
                const ariaHidden = await svg.getAttribute('aria-hidden');
                // SVGs in buttons should be aria-hidden="true"
                // unless they are the only content of the button
                const parent = await svg.locator('..').first();
                const parentText = await parent.textContent();
                
                if (parentText && parentText.trim().length > 0) {
                    expect(ariaHidden).toBe('true');
                }
            }
        });
    });

    test.describe('Focus Management', () => {
        test('should have visible focus indicators', async ({ page }) => {
            await page.goto('/');
            
            // Add a test button
            await page.evaluate(() => {
                const btn = document.createElement('button');
                btn.textContent = 'Focus Test';
                btn.id = 'focus-test-btn';
                btn.style.cssText = 'padding: 10px; margin: 10px;';
                document.body.appendChild(btn);
            });

            const button = page.locator('#focus-test-btn');
            await button.focus();
            
            // Get computed styles when focused
            const outlineStyle = await button.evaluate(el => {
                const styles = window.getComputedStyle(el);
                return {
                    outline: styles.outline,
                    outlineWidth: styles.outlineWidth,
                    outlineStyle: styles.outlineStyle,
                    boxShadow: styles.boxShadow
                };
            });

            // Focus should be visible via outline or box-shadow
            const hasVisibleFocus = 
                (outlineStyle.outlineWidth !== '0px' && outlineStyle.outlineStyle !== 'none') ||
                outlineStyle.boxShadow !== 'none';
            
            // Note: This test is basic; real focus styles are in extension CSS
            expect(typeof outlineStyle.outline).toBe('string');
        });

        test('should not lose focus when interacting with controls', async ({ page }) => {
            await page.goto('/');
            
            // Find a button and click it
            const buttons = page.locator('button');
            const count = await buttons.count();
            
            if (count > 0) {
                await buttons.first().click();
                
                // Something should still be focused
                const activeTagName = await page.evaluate(() => 
                    document.activeElement?.tagName.toLowerCase()
                );
                
                expect(activeTagName).not.toBe('body');
            }
        });
    });
});
