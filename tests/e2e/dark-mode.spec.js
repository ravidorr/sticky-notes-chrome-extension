/**
 * Integration tests for dark mode toggle functionality
 * Tests dark mode across all site pages
 */

import { test, expect } from '@playwright/test';

test.describe('Dark Mode Toggle', () => {
    test.describe('Marketing Site (index.html)', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
        });

        test('should start with light mode by default', async ({ page }) => {
            const theme = await page.evaluate(() => 
                document.documentElement.getAttribute('data-theme')
            );
            // Should be light or not set (defaults to light)
            expect(theme === 'light' || theme === null).toBeTruthy();
        });

        test('should toggle to dark mode when button clicked', async ({ page }) => {
            await page.click('#theme-toggle');
            
            const theme = await page.evaluate(() => 
                document.documentElement.getAttribute('data-theme')
            );
            expect(theme).toBe('dark');
        });

        test('should toggle back to light mode on second click', async ({ page }) => {
            await page.click('#theme-toggle');
            await page.click('#theme-toggle');
            
            const theme = await page.evaluate(() => 
                document.documentElement.getAttribute('data-theme')
            );
            expect(theme).toBe('light');
        });

        test('should persist theme preference in localStorage', async ({ page }) => {
            await page.click('#theme-toggle');
            
            const storedTheme = await page.evaluate(() => 
                localStorage.getItem('sticky-notes-theme')
            );
            expect(storedTheme).toBe('dark');
        });

        test('should load persisted theme on page reload', async ({ page }) => {
            await page.click('#theme-toggle');
            await page.reload();
            
            const theme = await page.evaluate(() => 
                document.documentElement.getAttribute('data-theme')
            );
            expect(theme).toBe('dark');
        });

        test('should work with mobile theme toggle', async ({ page }) => {
            // Set viewport to mobile size
            await page.setViewportSize({ width: 375, height: 667 });
            
            // Mobile toggle should be visible
            const mobileToggle = page.locator('#theme-toggle-mobile');
            await expect(mobileToggle).toBeVisible();
            
            await mobileToggle.click();
            
            const theme = await page.evaluate(() => 
                document.documentElement.getAttribute('data-theme')
            );
            expect(theme).toBe('dark');
        });

        test('should update icon visibility on toggle', async ({ page }) => {
            // In light mode, moon icon should be visible
            const moonVisible = await page.evaluate(() => {
                const moonIcon = document.querySelector('#theme-toggle .icon-moon');
                return getComputedStyle(moonIcon).display !== 'none';
            });
            expect(moonVisible).toBeTruthy();
            
            // Toggle to dark mode
            await page.click('#theme-toggle');
            
            // In dark mode, sun icon should be visible
            const sunVisible = await page.evaluate(() => {
                const sunIcon = document.querySelector('#theme-toggle .icon-sun');
                return getComputedStyle(sunIcon).display !== 'none';
            });
            expect(sunVisible).toBeTruthy();
        });

        test('should apply correct background color in dark mode', async ({ page }) => {
            await page.click('#theme-toggle');
            
            const bgColor = await page.evaluate(() => {
                return getComputedStyle(document.body).backgroundColor;
            });
            
            // Dark mode background should be dark (close to --c-slate-950: #020617)
            // RGB values should be low
            expect(bgColor).toMatch(/rgb\(\s*\d{1,2}\s*,\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/);
        });

        test('should apply correct text color in dark mode', async ({ page }) => {
            await page.click('#theme-toggle');
            
            const textColor = await page.evaluate(() => {
                return getComputedStyle(document.body).color;
            });
            
            // Dark mode text should be light (close to --c-slate-100)
            // RGB values should be high
            expect(textColor).toMatch(/rgb\(\s*2[0-4]\d|25[0-5]\s*,\s*2[0-4]\d|25[0-5]\s*,\s*2[0-4]\d|25[0-5]\s*\)/);
        });
    });

    test.describe('Legal Pages', () => {
        const legalPages = ['privacy.html', 'terms.html', 'contact.html'];

        for (const pageName of legalPages) {
            test(`should toggle dark mode on ${pageName}`, async ({ page }) => {
                await page.goto(`/${pageName}`);
                
                await page.click('#theme-toggle');
                
                const theme = await page.evaluate(() => 
                    document.documentElement.getAttribute('data-theme')
                );
                expect(theme).toBe('dark');
            });
        }
    });

    test.describe('System Preference Detection', () => {
        test('should respect system dark mode preference', async ({ page }) => {
            // Emulate dark color scheme preference
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.goto('/');
            
            // Clear any stored preference
            await page.evaluate(() => localStorage.removeItem('sticky-notes-theme'));
            await page.reload();
            
            // Should detect system preference
            const theme = await page.evaluate(() => 
                document.documentElement.getAttribute('data-theme')
            );
            // Should be dark or use system preference (not explicitly set to light)
            expect(theme !== 'light').toBeTruthy();
        });

        test('should override system preference with manual toggle', async ({ page }) => {
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.goto('/');
            
            // Clear stored preference
            await page.evaluate(() => localStorage.removeItem('sticky-notes-theme'));
            
            // Manually toggle to light
            await page.click('#theme-toggle');
            await page.click('#theme-toggle'); // Toggle twice to get back to light
            
            // Check stored preference
            const storedTheme = await page.evaluate(() => 
                localStorage.getItem('sticky-notes-theme')
            );
            expect(storedTheme).toBe('light');
        });
    });

    test.describe('Dashboard Page', () => {
        test('should support dark mode via system preference', async ({ page }) => {
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.goto('/dashboard.html');
            
            // Dashboard uses system preference (no toggle button)
            const bgColor = await page.evaluate(() => {
                return getComputedStyle(document.body).backgroundColor;
            });
            
            // Should have dark background
            expect(bgColor).toMatch(/rgb\(\s*\d{1,2}\s*,\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/);
        });
    });

    test.describe('Generate Key Page', () => {
        test('should support dark mode via system preference', async ({ page }) => {
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.goto('/generate-key.html');
            
            const bgColor = await page.evaluate(() => {
                return getComputedStyle(document.body).backgroundColor;
            });
            
            // Should have dark background
            expect(bgColor).toMatch(/rgb\(\s*\d{1,2}\s*,\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/);
        });
    });

    test.describe('Reduced Motion', () => {
        test('should respect prefers-reduced-motion', async ({ page }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.goto('/');
            
            // Toggle theme
            await page.click('#theme-toggle');
            
            // Theme should still toggle (just without animation)
            const theme = await page.evaluate(() => 
                document.documentElement.getAttribute('data-theme')
            );
            expect(theme).toBe('dark');
        });
    });
});
