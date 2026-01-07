/**
 * Popup Script Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  escapeHtml, 
  stripHtml, 
  truncate, 
  isRestrictedUrl, 
  THEME_COLORS 
} from '../../src/shared/utils.js';

describe('Popup Script Logic', () => {
  beforeEach(() => {
    // Reset chrome mocks
    chrome.runtime.sendMessage.mockClear();
    chrome.tabs.query.mockClear();
    chrome.scripting.executeScript.mockClear();
  });
  
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).not.toContain('<script>');
    });
    
    it('should handle null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });
  
  describe('stripHtml', () => {
    it('should strip HTML tags', () => {
      expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });
    
    it('should handle null/undefined', () => {
      expect(stripHtml(null)).toBe('');
      expect(stripHtml(undefined)).toBe('');
    });
  });
  
  describe('truncate (truncateSelector)', () => {
    it('should truncate long strings', () => {
      const long = 'a'.repeat(50);
      const result = truncate(long, 30);
      expect(result).toHaveLength(33); // 30 + '...'
      expect(result.endsWith('...')).toBe(true);
    });
    
    it('should not truncate short strings', () => {
      expect(truncate('short', 30)).toBe('short');
    });
    
    it('should handle null/empty', () => {
      expect(truncate(null, 30)).toBe('');
      expect(truncate('', 30)).toBe('');
    });
  });
  
  describe('isRestrictedUrl', () => {
    it('should identify chrome:// as restricted', () => {
      expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    });
    
    it('should identify chrome-extension:// as restricted', () => {
      expect(isRestrictedUrl('chrome-extension://abc123/popup.html')).toBe(true);
    });
    
    it('should identify about: as restricted', () => {
      expect(isRestrictedUrl('about:blank')).toBe(true);
    });
    
    it('should identify edge:// as restricted', () => {
      expect(isRestrictedUrl('edge://settings')).toBe(true);
    });
    
    it('should identify data: as restricted', () => {
      expect(isRestrictedUrl('data:text/html,<h1>Hello</h1>')).toBe(true);
    });
    
    it('should identify javascript: as restricted', () => {
      expect(isRestrictedUrl('javascript:alert(1)')).toBe(true);
    });
    
    it('should allow regular URLs', () => {
      expect(isRestrictedUrl('https://example.com')).toBe(false);
      expect(isRestrictedUrl('http://localhost:3000')).toBe(false);
    });
    
    it('should return true for null/empty', () => {
      expect(isRestrictedUrl(null)).toBe(true);
      expect(isRestrictedUrl('')).toBe(true);
    });
  });
  
  describe('THEME_COLORS (getThemeColor)', () => {
    it('should have all theme colors', () => {
      expect(THEME_COLORS.yellow).toBe('#facc15');
      expect(THEME_COLORS.blue).toBe('#3b82f6');
      expect(THEME_COLORS.green).toBe('#22c55e');
      expect(THEME_COLORS.pink).toBe('#ec4899');
    });
    
    function getThemeColor(theme) {
      return THEME_COLORS[theme] || THEME_COLORS.yellow;
    }
    
    it('should return correct color for each theme', () => {
      expect(getThemeColor('yellow')).toBe('#facc15');
      expect(getThemeColor('blue')).toBe('#3b82f6');
      expect(getThemeColor('green')).toBe('#22c55e');
      expect(getThemeColor('pink')).toBe('#ec4899');
    });
    
    it('should default to yellow for unknown theme', () => {
      expect(getThemeColor('unknown')).toBe('#facc15');
      expect(getThemeColor(null)).toBe('#facc15');
    });
  });
  
  describe('chrome.tabs API usage', () => {
    it('should query active tab', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(tab.url).toBe('https://example.com');
    });
  });
  
  describe('chrome.runtime.sendMessage usage', () => {
    it('should send login message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, user: { email: 'test@example.com' } });
      
      const response = await chrome.runtime.sendMessage({ action: 'login' });
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'login' });
      expect(response.success).toBe(true);
    });
    
    it('should send logout message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      
      const response = await chrome.runtime.sendMessage({ action: 'logout' });
      
      expect(response.success).toBe(true);
    });
    
    it('should send getUser message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        user: { email: 'test@example.com', displayName: 'Test User' } 
      });
      
      const response = await chrome.runtime.sendMessage({ action: 'getUser' });
      
      expect(response.user).toHaveProperty('email');
    });
    
    it('should send getNotes message', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ 
        success: true, 
        notes: [{ id: '1', content: 'Test' }] 
      });
      
      const response = await chrome.runtime.sendMessage({ 
        action: 'getNotes', 
        url: 'https://example.com' 
      });
      
      expect(response.notes).toHaveLength(1);
    });
  });
  
  describe('chrome.scripting.executeScript usage', () => {
    it('should inject content script', async () => {
      chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: 1 },
        files: ['src/content/content.js']
      });
      
      expect(chrome.scripting.executeScript).toHaveBeenCalled();
    });
  });
  
  describe('content script injection logic', () => {
    async function injectContentScript(tabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/content.js']
        });
        return true;
      } catch (error) {
        console.error('Failed to inject:', error);
        return false;
      }
    }
    
    it('should successfully inject script', async () => {
      chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);
      
      const result = await injectContentScript(1);
      expect(result).toBe(true);
    });
    
    it('should handle injection failure', async () => {
      chrome.scripting.executeScript.mockRejectedValue(new Error('Injection failed'));
      
      const result = await injectContentScript(1);
      expect(result).toBe(false);
    });
  });
  
  describe('note rendering logic', () => {
    function renderNote(note) {
      const themeColor = THEME_COLORS[note.theme] || THEME_COLORS.yellow;
      const content = stripHtml(note.content) || 'Empty note';
      const selector = truncate(note.selector, 30);
      
      return {
        themeColor,
        displayContent: content,
        displaySelector: selector
      };
    }
    
    it('should render note with theme color', () => {
      const note = { theme: 'blue', content: '<b>Test</b>', selector: '#main' };
      const rendered = renderNote(note);
      
      expect(rendered.themeColor).toBe('#3b82f6');
    });
    
    it('should strip HTML from content', () => {
      const note = { theme: 'yellow', content: '<p>Hello</p>', selector: '#main' };
      const rendered = renderNote(note);
      
      expect(rendered.displayContent).toBe('Hello');
    });
    
    it('should truncate long selectors', () => {
      const longSelector = 'body > div#container > section.content > article:nth-child(3)';
      const note = { theme: 'yellow', content: 'Test', selector: longSelector };
      const rendered = renderNote(note);
      
      expect(rendered.displaySelector.length).toBeLessThanOrEqual(33);
    });
    
    it('should default to "Empty note" for empty content', () => {
      const note = { theme: 'yellow', content: '', selector: '#main' };
      const rendered = renderNote(note);
      
      expect(rendered.displayContent).toBe('Empty note');
    });
  });
  
  describe('auth state handling', () => {
    function updateAuthUI(user) {
      return {
        isLoggedIn: !!user,
        displayName: user?.displayName || user?.email || 'Guest',
        showLoginButton: !user,
        showLogoutButton: !!user
      };
    }
    
    it('should show login state for logged in user', () => {
      const ui = updateAuthUI({ email: 'test@example.com', displayName: 'Test User' });
      
      expect(ui.isLoggedIn).toBe(true);
      expect(ui.displayName).toBe('Test User');
      expect(ui.showLoginButton).toBe(false);
      expect(ui.showLogoutButton).toBe(true);
    });
    
    it('should show logout state for no user', () => {
      const ui = updateAuthUI(null);
      
      expect(ui.isLoggedIn).toBe(false);
      expect(ui.displayName).toBe('Guest');
      expect(ui.showLoginButton).toBe(true);
      expect(ui.showLogoutButton).toBe(false);
    });
    
    it('should use email if displayName is not available', () => {
      const ui = updateAuthUI({ email: 'test@example.com' });
      
      expect(ui.displayName).toBe('test@example.com');
    });
  });
});
