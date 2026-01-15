/**
 * Visual Regression Tests
 * Uses Playwright's built-in screenshot comparison capabilities
 * 
 * To update baseline screenshots:
 * npx playwright test --update-snapshots
 * 
 * Screenshots are stored in tests/e2e/visual-regression.spec.js-snapshots/
 */

import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
    
    test.describe('Homepage', () => {
        test('homepage full page - light mode', async ({ page }) => {
            await page.goto('/');
            await page.evaluate(() => {
                document.documentElement.setAttribute('data-theme', 'light');
            });
            await page.waitForTimeout(500); // Wait for transitions
            
            await expect(page).toHaveScreenshot('homepage-light.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('homepage full page - dark mode', async ({ page }) => {
            await page.goto('/');
            await page.evaluate(() => {
                document.documentElement.setAttribute('data-theme', 'dark');
            });
            await page.waitForTimeout(500);
            
            await expect(page).toHaveScreenshot('homepage-dark.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('homepage hero section', async ({ page }) => {
            await page.goto('/');
            const hero = page.locator('.hero-section');
            
            await expect(hero).toHaveScreenshot('hero-section.png', {
                animations: 'disabled'
            });
        });

        test('homepage navbar - not scrolled', async ({ page }) => {
            await page.goto('/');
            const navbar = page.locator('#navbar');
            
            await expect(navbar).toHaveScreenshot('navbar-top.png');
        });

        test('homepage navbar - scrolled', async ({ page }) => {
            await page.goto('/');
            await page.evaluate(() => window.scrollTo(0, 100));
            await page.waitForTimeout(300);
            
            const navbar = page.locator('#navbar');
            await expect(navbar).toHaveScreenshot('navbar-scrolled.png');
        });

        test('homepage pricing section', async ({ page }) => {
            await page.goto('/#pricing');
            await page.waitForTimeout(300);
            
            const pricing = page.locator('.section-pricing');
            await expect(pricing).toHaveScreenshot('pricing-section.png', {
                animations: 'disabled'
            });
        });

        test('homepage FAQ section', async ({ page }) => {
            await page.goto('/#faq');
            await page.waitForTimeout(300);
            
            const faq = page.locator('.section-faq');
            await expect(faq).toHaveScreenshot('faq-section.png', {
                animations: 'disabled'
            });
        });

        test('homepage footer', async ({ page }) => {
            await page.goto('/');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(300);
            
            const footer = page.locator('.footer');
            await expect(footer).toHaveScreenshot('footer.png');
        });
    });

    test.describe('Mobile Responsive', () => {
        test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

        test('homepage mobile - light mode', async ({ page }) => {
            await page.goto('/');
            await page.evaluate(() => {
                document.documentElement.setAttribute('data-theme', 'light');
            });
            
            await expect(page).toHaveScreenshot('homepage-mobile-light.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('homepage mobile - dark mode', async ({ page }) => {
            await page.goto('/');
            await page.evaluate(() => {
                document.documentElement.setAttribute('data-theme', 'dark');
            });
            
            await expect(page).toHaveScreenshot('homepage-mobile-dark.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('mobile menu open', async ({ page }) => {
            await page.goto('/');
            await page.click('#mobile-menu-btn');
            await page.waitForTimeout(300);
            
            await expect(page).toHaveScreenshot('mobile-menu-open.png', {
                animations: 'disabled'
            });
        });

        test('pricing cards stack on mobile', async ({ page }) => {
            await page.goto('/#pricing');
            await page.waitForTimeout(300);
            
            const pricing = page.locator('.section-pricing');
            await expect(pricing).toHaveScreenshot('pricing-mobile.png', {
                animations: 'disabled'
            });
        });
    });

    test.describe('Tablet Responsive', () => {
        test.use({ viewport: { width: 768, height: 1024 } }); // iPad

        test('homepage tablet', async ({ page }) => {
            await page.goto('/');
            
            await expect(page).toHaveScreenshot('homepage-tablet.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });
    });

    test.describe('Legal Pages', () => {
        test('privacy page', async ({ page }) => {
            await page.goto('/privacy.html');
            
            await expect(page).toHaveScreenshot('privacy-page.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('terms page', async ({ page }) => {
            await page.goto('/terms.html');
            
            await expect(page).toHaveScreenshot('terms-page.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('contact page', async ({ page }) => {
            await page.goto('/contact.html');
            
            await expect(page).toHaveScreenshot('contact-page.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });
    });

    test.describe('Dashboard Page', () => {
        test('dashboard - API key overlay', async ({ page }) => {
            await page.goto('/dashboard.html');
            // Clear any stored API key to show overlay
            await page.evaluate(() => localStorage.removeItem('sticky_notes_api_key'));
            await page.reload();
            await page.waitForTimeout(300);
            
            await expect(page).toHaveScreenshot('dashboard-api-key-overlay.png', {
                animations: 'disabled'
            });
        });

        test('dashboard - light mode', async ({ page }) => {
            await page.goto('/dashboard.html');
            await page.evaluate(() => {
                localStorage.setItem('sticky_notes_api_key', 'test_key_for_screenshot');
            });
            await page.reload();
            
            await expect(page).toHaveScreenshot('dashboard-light.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('dashboard - dark mode', async ({ page }) => {
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.goto('/dashboard.html');
            await page.evaluate(() => {
                localStorage.setItem('sticky_notes_api_key', 'test_key_for_screenshot');
            });
            await page.reload();
            
            await expect(page).toHaveScreenshot('dashboard-dark.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });
    });

    test.describe('Generate Key Page', () => {
        test('generate key - initial state', async ({ page }) => {
            await page.goto('/generate-key.html');
            
            await expect(page).toHaveScreenshot('generate-key-initial.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });

        test('generate key - dark mode', async ({ page }) => {
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.goto('/generate-key.html');
            
            await expect(page).toHaveScreenshot('generate-key-dark.png', {
                fullPage: true,
                animations: 'disabled'
            });
        });
    });

    test.describe('Interactive Demo', () => {
        test('demo section - initial state', async ({ page }) => {
            await page.goto('/#preview');
            await page.waitForTimeout(300);
            
            const demo = page.locator('#preview');
            await expect(demo).toHaveScreenshot('demo-initial.png', {
                animations: 'disabled'
            });
        });

        test('demo section - selection mode active', async ({ page }) => {
            await page.goto('/#preview');
            await page.waitForTimeout(300);
            await page.click('#demo-activate-btn');
            await page.waitForTimeout(300);
            
            const demo = page.locator('#preview');
            await expect(demo).toHaveScreenshot('demo-selection-active.png', {
                animations: 'disabled'
            });
        });

        test('demo section - with note', async ({ page }) => {
            await page.goto('/#preview');
            await page.waitForTimeout(300);
            await page.click('#demo-activate-btn');
            await page.click('.demo-target[data-id="1"]');
            await page.waitForTimeout(300);
            
            const demo = page.locator('#preview');
            await expect(demo).toHaveScreenshot('demo-with-note.png', {
                animations: 'disabled'
            });
        });
    });

    test.describe('Components', () => {
        test('buttons - all variants', async ({ page }) => {
            await page.goto('/');
            
            // Create a test area with all button types
            await page.evaluate(() => {
                const testArea = document.createElement('div');
                testArea.id = 'button-test-area';
                testArea.style.cssText = 'padding: 2rem; background: white; display: flex; gap: 1rem; flex-wrap: wrap;';
                testArea.innerHTML = `
                    <button class="btn btn-primary">Primary</button>
                    <button class="btn btn-secondary">Secondary</button>
                    <button class="btn btn-primary btn-lg">Large Primary</button>
                    <a class="btn btn-cta">CTA Button</a>
                `;
                document.body.prepend(testArea);
            });
            
            const testArea = page.locator('#button-test-area');
            await expect(testArea).toHaveScreenshot('buttons-all.png');
        });

        test('cards - feature cards', async ({ page }) => {
            await page.goto('/#features');
            await page.waitForTimeout(300);
            
            const featuresGrid = page.locator('.features-grid');
            await expect(featuresGrid).toHaveScreenshot('feature-cards.png', {
                animations: 'disabled'
            });
        });

        test('comparison table', async ({ page }) => {
            await page.goto('/');
            await page.evaluate(() => {
                document.querySelector('.section-comparison')?.scrollIntoView();
            });
            await page.waitForTimeout(300);
            
            const table = page.locator('.comparison-table-wrapper');
            await expect(table).toHaveScreenshot('comparison-table.png', {
                animations: 'disabled'
            });
        });
    });
});
