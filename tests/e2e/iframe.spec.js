import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '../../dist');

async function createBrowserWithExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox'
    ]
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  return context;
}

test.describe('Iframe Support', () => {
  // Skipping by default as it requires built extension and specific environment
  test.skip('should persist notes created inside iframes', async () => {
    const context = await createBrowserWithExtension();
    
    try {
      const page = await context.newPage();
      
      // Navigate to the parent page containing the iframe
      // Assuming test server is running on localhost:3000
      await page.goto('http://localhost:3000/iframe-parent.html');
      
      // Wait for extension to initialize
      await page.waitForTimeout(1000);
      
      // Get the iframe element
      const iframeElement = page.locator('#test-iframe');
      const iframe = iframeElement.contentFrame();
      
      // Wait for iframe content to load
      await expect(iframe.locator('body')).toBeVisible();
      
      // Simulate right-click context menu to create note inside iframe
      // Note: This relies on the extension's context menu implementation
      // Since we can't easily trigger native chrome context menu in playwright,
      // we might need to simulate the message or use a keyboard shortcut if available.
      // Alternatively, if we can inject code to trigger the creation:
      
      // Select an element inside the iframe
      const targetElement = iframe.locator('[data-testid="card-1"]'); // Assuming exists in index.html
      await targetElement.click({ button: 'right' });
      
      // Since we can't click the native context menu item "Add Sticky Note", 
      // we might verify the context menu tracking works or use the popup if possible.
      // Or, we simulate the message that the context menu would send.
      
      // However, for a true E2E, we'd ideally want to trigger the actual flow.
      // If we can't, we can try to use the Selection Mode from the popup.
      
      // 1. Open popup
      const [background] = context.serviceWorkers();
      const extensionId = background.url().split('/')[2];
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      
      // 2. Click "Add Note" to enable selection mode
      await popupPage.click('#addNoteBtn');
      
      // 3. Switch back to content page
      await page.bringToFront();
      
      // 4. Click inside iframe to create note
      // We need to ensure the click happens on the target element
      const box = await targetElement.boundingBox();
      if (box) {
         // We might need to adjust coordinates for iframe offset
         // But playwright's click should handle frame switching if using frame locator
         await targetElement.click();
      }
      
      // 5. Verify note appears inside iframe
      // The note should be injected into the iframe's shadow DOM or similar
      // Our extension injects a shadow host into the document (or frame document)
      const noteHost = iframe.locator('sticky-note-host'); // Or whatever the host tag/id is
      // Actually it's #sticky-notes-extension-root in the shadow DOM of the container
      
      // Wait for note to appear
      await expect(iframe.locator('sticky-note')).toBeVisible({ timeout: 5000 });
      
      // 6. Type some content
      const note = iframe.locator('sticky-note').first();
      await note.locator('.editor').fill('Test content in iframe');
      
      // 7. Wait for sync/save (simulating network lag)
      await page.waitForTimeout(2000);
      
      // 8. Reload page
      await page.reload();
      
      // 9. Verify persistence
      await expect(iframe.locator('sticky-note')).toBeVisible();
      await expect(iframe.locator('sticky-note .editor')).toHaveText('Test content in iframe');
      
      // 10. Verify metadata (clipboard copy) - Optional/Advanced
      // This would require mocking clipboard or checking the note's internal state
      
    } finally {
      await context.close();
    }
  });
});
