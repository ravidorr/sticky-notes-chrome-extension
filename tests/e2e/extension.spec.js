/**
 * E2E Tests for Sticky Notes Extension
 */

import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '../../dist');

// Helper to create browser context with extension
async function createBrowserWithExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false, // Extensions require headed mode
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });
  
  // Wait for extension to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return context;
}

test.describe('Sticky Notes Extension', () => {
  test.skip('should load extension and show popup', async () => {
    const context = await createBrowserWithExtension();
    
    try {
      // Get extension ID from service worker
      const [background] = context.serviceWorkers();
      const extensionId = background?.url()?.split('/')[2];
      
      if (!extensionId) {
        throw new Error('Could not get extension ID');
      }
      
      // Open extension popup
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      
      // Verify popup content
      await expect(popupPage.locator('h1')).toContainText('Sticky Notes');
      await expect(popupPage.locator('#addNoteBtn')).toBeVisible();
    } finally {
      await context.close();
    }
  });
  
  test.skip('should inject content script into pages', async () => {
    const context = await createBrowserWithExtension();
    
    try {
      const page = await context.newPage();
      await page.goto('http://localhost:3000/');
      
      // Wait for content script to load
      await page.waitForTimeout(1000);
      
      // Check if shadow DOM container exists
      const shadowHost = await page.locator('#sticky-notes-extension-root');
      await expect(shadowHost).toBeAttached();
    } finally {
      await context.close();
    }
  });
});

// These tests can run without the extension loaded
test.describe('Test Page Structure', () => {
  test('should have all test elements', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page.locator('[data-testid="page-title"]')).toContainText('Test Page');
    
    // Check cards
    await expect(page.locator('[data-testid="card-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-2"]')).toBeVisible();
    
    // Check form elements
    await expect(page.locator('#name-input')).toBeVisible();
    await expect(page.locator('#email-input')).toBeVisible();
    
    // Check list items
    await expect(page.locator('[data-id="item-1"]')).toBeVisible();
    await expect(page.locator('[data-id="item-2"]')).toBeVisible();
  });
  
  test('should have dynamic ID elements', async ({ page }) => {
    await page.goto('/');
    
    // Check dynamic elements exist (for testing selector engine)
    await expect(page.locator('#ember123')).toBeVisible();
    await expect(page.locator('#react-root-456')).toBeVisible();
  });
});
