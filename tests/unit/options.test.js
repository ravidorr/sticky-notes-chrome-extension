/**
 * Options Page Script Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Import the functions to test
import {
  init,
  loadPreferences,
  handleSave,
  handleReset,
  selectTheme,
  selectPosition,
  showStatus,
  initDOMElements,
  displayVersion
} from '../../src/options/options.js';

import { DEFAULT_PREFERENCES } from '../../src/shared/preferences.js';

describe('Options Page Script', () => {
  const localThis = {};
  
  beforeEach(async () => {
    // Reset chrome mocks
    chrome.runtime.getManifest.mockClear();
    chrome.runtime.getManifest.mockReturnValue({ version: '1.13.0' });
    
    // Setup chrome.storage.sync mock to return default preferences
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      const result = {
        preferences: {
          defaultTheme: 'yellow',
          defaultPosition: 'top-right',
          noteWidth: 280,
          fontSize: 'medium',
          notesVisibleByDefault: true
        }
      };
      if (callback) callback(result);
      return Promise.resolve(result);
    });
    
    chrome.storage.sync.set.mockImplementation((data, callback) => {
      if (callback) callback();
      return Promise.resolve();
    });
    
    // Setup DOM for options tests
    document.body.innerHTML = `
      <form id="settingsForm">
        <div class="theme-picker" id="themePicker">
          <button type="button" class="theme-option" data-theme="yellow" title="Yellow">
            <span class="theme-color"></span>
            <span class="theme-name">Yellow</span>
          </button>
          <button type="button" class="theme-option" data-theme="blue" title="Blue">
            <span class="theme-color"></span>
            <span class="theme-name">Blue</span>
          </button>
          <button type="button" class="theme-option" data-theme="green" title="Green">
            <span class="theme-color"></span>
            <span class="theme-name">Green</span>
          </button>
          <button type="button" class="theme-option" data-theme="pink" title="Pink">
            <span class="theme-color"></span>
            <span class="theme-name">Pink</span>
          </button>
        </div>
        <input type="hidden" name="defaultTheme" id="defaultTheme" value="yellow">
        
        <div class="position-picker" id="positionPicker">
          <button type="button" class="position-option" data-position="top-left" title="Top Left"></button>
          <button type="button" class="position-option" data-position="top-center" title="Top Center"></button>
          <button type="button" class="position-option" data-position="top-right" title="Top Right"></button>
          <button type="button" class="position-option" data-position="center-left" title="Center Left"></button>
          <div class="position-placeholder"></div>
          <button type="button" class="position-option" data-position="center-right" title="Center Right"></button>
          <button type="button" class="position-option" data-position="bottom-left" title="Bottom Left"></button>
          <button type="button" class="position-option" data-position="bottom-center" title="Bottom Center"></button>
          <button type="button" class="position-option" data-position="bottom-right" title="Bottom Right"></button>
        </div>
        <input type="hidden" name="defaultPosition" id="defaultPosition" value="top-right">
        
        <select id="noteWidth">
          <option value="240">240px</option>
          <option value="280" selected>280px</option>
          <option value="320">320px</option>
          <option value="360">360px</option>
        </select>
        
        <select id="fontSize">
          <option value="small">Small</option>
          <option value="medium" selected>Medium</option>
          <option value="large">Large</option>
        </select>
        
        <input type="checkbox" id="notesVisibleByDefault" checked>
        
        <button type="button" id="resetBtn">Reset</button>
        <button type="submit" id="saveBtn">Save</button>
      </form>
      
      <div id="statusMessage" class="status-message hidden"></div>
      <span id="versionDisplay"></span>
    `;
    
    // Initialize DOM elements
    initDOMElements();
    
    // Store reference to DEFAULT_PREFERENCES
    localThis.DEFAULT_PREFERENCES = DEFAULT_PREFERENCES;
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });
  
  describe('initDOMElements', () => {
    it('should initialize all DOM element references', () => {
      initDOMElements();
      
      // Check that elements exist
      expect(document.getElementById('settingsForm')).toBeTruthy();
      expect(document.getElementById('themePicker')).toBeTruthy();
      expect(document.getElementById('positionPicker')).toBeTruthy();
      expect(document.getElementById('defaultTheme')).toBeTruthy();
      expect(document.getElementById('defaultPosition')).toBeTruthy();
      expect(document.getElementById('noteWidth')).toBeTruthy();
      expect(document.getElementById('fontSize')).toBeTruthy();
      expect(document.getElementById('notesVisibleByDefault')).toBeTruthy();
      expect(document.getElementById('resetBtn')).toBeTruthy();
      expect(document.getElementById('saveBtn')).toBeTruthy();
      expect(document.getElementById('statusMessage')).toBeTruthy();
      expect(document.getElementById('versionDisplay')).toBeTruthy();
    });
  });
  
  describe('displayVersion', () => {
    it('should display version from manifest', () => {
      displayVersion();
      
      const versionDisplay = document.getElementById('versionDisplay');
      expect(versionDisplay.textContent).toBe('v1.13.0');
    });
    
    it('should handle missing versionDisplay element gracefully', () => {
      // Remove the element
      document.getElementById('versionDisplay').remove();
      initDOMElements();
      
      // Should not throw - if it throws, Jest will fail the test
      expect(() => displayVersion()).not.toThrow();
    });
    
    it('should handle chrome.runtime.getManifest error', () => {
      chrome.runtime.getManifest.mockImplementation(() => {
        throw new Error('Not available');
      });
      
      displayVersion();
      
      const versionDisplay = document.getElementById('versionDisplay');
      expect(versionDisplay.textContent).toBe('');
    });
  });
  
  describe('selectTheme', () => {
    it('should add selected class to matching theme button', () => {
      selectTheme('blue');
      
      const blueBtn = document.querySelector('[data-theme="blue"]');
      const yellowBtn = document.querySelector('[data-theme="yellow"]');
      
      expect(blueBtn.classList.contains('selected')).toBe(true);
      expect(yellowBtn.classList.contains('selected')).toBe(false);
    });
    
    it('should update hidden input value', () => {
      selectTheme('green');
      
      const input = document.getElementById('defaultTheme');
      expect(input.value).toBe('green');
    });
    
    it('should remove selected from all other buttons', () => {
      // First select yellow
      selectTheme('yellow');
      expect(document.querySelector('[data-theme="yellow"]').classList.contains('selected')).toBe(true);
      
      // Then select pink
      selectTheme('pink');
      
      expect(document.querySelector('[data-theme="yellow"]').classList.contains('selected')).toBe(false);
      expect(document.querySelector('[data-theme="pink"]').classList.contains('selected')).toBe(true);
    });
    
    it('should handle non-existent theme gracefully', () => {
      // Should not throw - if it throws, Jest will fail the test
      expect(() => selectTheme('nonexistent')).not.toThrow();
    });
  });
  
  describe('selectPosition', () => {
    it('should add selected class to matching position button', () => {
      selectPosition('bottom-left');
      
      const bottomLeftBtn = document.querySelector('[data-position="bottom-left"]');
      const topRightBtn = document.querySelector('[data-position="top-right"]');
      
      expect(bottomLeftBtn.classList.contains('selected')).toBe(true);
      expect(topRightBtn.classList.contains('selected')).toBe(false);
    });
    
    it('should update hidden input value', () => {
      selectPosition('bottom-right');
      
      const input = document.getElementById('defaultPosition');
      expect(input.value).toBe('bottom-right');
    });
    
    it('should remove selected from all other buttons', () => {
      // First select top-left
      selectPosition('top-left');
      expect(document.querySelector('[data-position="top-left"]').classList.contains('selected')).toBe(true);
      
      // Then select top-right
      selectPosition('top-right');
      
      expect(document.querySelector('[data-position="top-left"]').classList.contains('selected')).toBe(false);
      expect(document.querySelector('[data-position="top-right"]').classList.contains('selected')).toBe(true);
    });
    
    it('should handle non-existent position gracefully', () => {
      // Should not throw - if it throws, Jest will fail the test
      expect(() => selectPosition('nonexistent')).not.toThrow();
    });
    
    it('should select center positions correctly', () => {
      // Test top-center
      selectPosition('top-center');
      expect(document.querySelector('[data-position="top-center"]').classList.contains('selected')).toBe(true);
      expect(document.getElementById('defaultPosition').value).toBe('top-center');
      
      // Test center-left
      selectPosition('center-left');
      expect(document.querySelector('[data-position="center-left"]').classList.contains('selected')).toBe(true);
      expect(document.querySelector('[data-position="top-center"]').classList.contains('selected')).toBe(false);
      
      // Test center-right
      selectPosition('center-right');
      expect(document.querySelector('[data-position="center-right"]').classList.contains('selected')).toBe(true);
      
      // Test bottom-center
      selectPosition('bottom-center');
      expect(document.querySelector('[data-position="bottom-center"]').classList.contains('selected')).toBe(true);
      expect(document.getElementById('defaultPosition').value).toBe('bottom-center');
    });
  });
  
  describe('showStatus', () => {
    it('should display success message', () => {
      showStatus('Settings saved', 'success');
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.textContent).toBe('Settings saved');
      expect(statusMessage.className).toContain('success');
      expect(statusMessage.classList.contains('hidden')).toBe(false);
    });
    
    it('should display error message', () => {
      showStatus('Failed to save', 'error');
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.textContent).toBe('Failed to save');
      expect(statusMessage.className).toContain('error');
      expect(statusMessage.classList.contains('hidden')).toBe(false);
    });
    
    it('should auto-hide after timeout', async () => {
      jest.useFakeTimers();
      
      showStatus('Test message', 'success');
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.classList.contains('hidden')).toBe(false);
      
      // Fast-forward timer
      jest.advanceTimersByTime(3000);
      
      expect(statusMessage.classList.contains('hidden')).toBe(true);
      
      jest.useRealTimers();
    });
  });
  
  describe('loadPreferences', () => {
    it('should load and apply preferences to form', async () => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        const result = {
          preferences: {
            defaultTheme: 'blue',
            defaultPosition: 'bottom-left',
            noteWidth: 320,
            fontSize: 'large',
            notesVisibleByDefault: false
          }
        };
        if (callback) callback(result);
        return Promise.resolve(result);
      });
      
      await loadPreferences();
      
      // Check theme is selected
      expect(document.querySelector('[data-theme="blue"]').classList.contains('selected')).toBe(true);
      
      // Check position is selected
      expect(document.querySelector('[data-position="bottom-left"]').classList.contains('selected')).toBe(true);
      
      // Check select values
      expect(document.getElementById('noteWidth').value).toBe('320');
      expect(document.getElementById('fontSize').value).toBe('large');
      expect(document.getElementById('notesVisibleByDefault').checked).toBe(false);
    });
    
    it('should handle load error gracefully', async () => {
      chrome.storage.sync.get.mockRejectedValue(new Error('Load failed'));
      
      // Should not throw - if it throws, Jest will fail the test
      await loadPreferences();
    });
    
    it('should apply default preferences when storage is empty', async () => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        const result = {};
        if (callback) callback(result);
        return Promise.resolve(result);
      });
      
      await loadPreferences();
      
      // Should apply defaults
      expect(document.querySelector('[data-theme="yellow"]').classList.contains('selected')).toBe(true);
      expect(document.querySelector('[data-position="top-right"]').classList.contains('selected')).toBe(true);
    });
  });
  
  describe('handleSave', () => {
    it('should save preferences successfully', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      
      // Set form values
      selectTheme('green');
      selectPosition('bottom-right');
      document.getElementById('noteWidth').value = '360';
      document.getElementById('fontSize').value = 'small';
      document.getElementById('notesVisibleByDefault').checked = false;
      
      await handleSave(mockEvent);
      
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(chrome.storage.sync.set).toHaveBeenCalled();
      
      // Check that the saved preferences are correct
      const savedCall = chrome.storage.sync.set.mock.calls[0][0];
      expect(savedCall.preferences.defaultTheme).toBe('green');
      expect(savedCall.preferences.defaultPosition).toBe('bottom-right');
      expect(savedCall.preferences.noteWidth).toBe(360);
      expect(savedCall.preferences.fontSize).toBe('small');
      expect(savedCall.preferences.notesVisibleByDefault).toBe(false);
    });
    
    it('should show success message after saving', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      
      await handleSave(mockEvent);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.className).toContain('success');
    });
    
    it('should handle save exception', async () => {
      chrome.storage.sync.set.mockRejectedValue(new Error('Network error'));
      
      const mockEvent = { preventDefault: jest.fn() };
      
      // Should not throw - if it throws, Jest will fail the test
      await handleSave(mockEvent);
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.className).toContain('error');
    });
    
    it('should disable save button during save', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      
      // Make storage.set take some time
      chrome.storage.sync.set.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(), 100))
      );
      
      const savePromise = handleSave(mockEvent);
      
      // Button should be disabled during save
      const saveBtn = document.getElementById('saveBtn');
      expect(saveBtn.disabled).toBe(true);
      
      await savePromise;
      
      // Button should be re-enabled after save
      expect(saveBtn.disabled).toBe(false);
    });
    
    it('should restore button text after save', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      const saveBtn = document.getElementById('saveBtn');
      const originalText = saveBtn.textContent;
      
      await handleSave(mockEvent);
      
      expect(saveBtn.textContent).toBe(originalText);
    });
  });
  
  describe('handleReset', () => {
    it('should reset preferences when confirmed', async () => {
      // Mock window.confirm to return true
      window.confirm = jest.fn(() => true);
      
      await handleReset();
      
      expect(window.confirm).toHaveBeenCalled();
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
    
    it('should not reset when cancelled', async () => {
      // Mock window.confirm to return false
      window.confirm = jest.fn(() => false);
      
      await handleReset();
      
      expect(window.confirm).toHaveBeenCalled();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });
    
    it('should reload form with defaults after reset', async () => {
      window.confirm = jest.fn(() => true);
      
      // First set different values
      selectTheme('pink');
      selectPosition('bottom-left');
      
      await handleReset();
      
      // Should be reset to defaults
      expect(document.querySelector('[data-theme="yellow"]').classList.contains('selected')).toBe(true);
      expect(document.querySelector('[data-position="top-right"]').classList.contains('selected')).toBe(true);
    });
    
    it('should show success message after reset', async () => {
      window.confirm = jest.fn(() => true);
      
      await handleReset();
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.className).toContain('success');
    });
    
    it('should handle reset exception', async () => {
      window.confirm = jest.fn(() => true);
      chrome.storage.sync.set.mockRejectedValue(new Error('Network error'));
      
      // Should not throw - if it throws, Jest will fail the test
      await handleReset();
      
      const statusMessage = document.getElementById('statusMessage');
      expect(statusMessage.className).toContain('error');
    });
  });
  
  describe('init', () => {
    it('should initialize all components', async () => {
      await init();
      
      // Version should be displayed
      const versionDisplay = document.getElementById('versionDisplay');
      expect(versionDisplay.textContent).toBe('v1.13.0');
      
      // Preferences should be loaded (theme selected)
      expect(document.querySelector('[data-theme="yellow"]').classList.contains('selected')).toBe(true);
    });
    
    it('should setup theme picker event listeners', async () => {
      await init();
      
      // Click on a theme button
      const blueBtn = document.querySelector('[data-theme="blue"]');
      blueBtn.click();
      
      // Theme should be selected
      expect(blueBtn.classList.contains('selected')).toBe(true);
      expect(document.getElementById('defaultTheme').value).toBe('blue');
    });
    
    it('should setup position picker event listeners', async () => {
      await init();
      
      // Click on a position button
      const bottomLeftBtn = document.querySelector('[data-position="bottom-left"]');
      bottomLeftBtn.click();
      
      // Position should be selected
      expect(bottomLeftBtn.classList.contains('selected')).toBe(true);
      expect(document.getElementById('defaultPosition').value).toBe('bottom-left');
    });
    
    it('should setup form submit handler', async () => {
      await init();
      
      const form = document.getElementById('settingsForm');
      
      // Dispatch submit event
      const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
      submitEvent.preventDefault = jest.fn();
      form.dispatchEvent(submitEvent);
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Storage set should have been called (form was submitted)
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
    
    it('should setup reset button handler', async () => {
      window.confirm = jest.fn(() => false);
      
      await init();
      
      const resetBtn = document.getElementById('resetBtn');
      resetBtn.click();
      
      // Confirm should have been called
      expect(window.confirm).toHaveBeenCalled();
    });
  });
  
  describe('edge cases', () => {
    it('should parse noteWidth as integer', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      
      document.getElementById('noteWidth').value = '320';
      
      await handleSave(mockEvent);
      
      const savedCall = chrome.storage.sync.set.mock.calls[0][0];
      expect(typeof savedCall.preferences.noteWidth).toBe('number');
      expect(savedCall.preferences.noteWidth).toBe(320);
    });
    
    it('should handle checkbox state correctly', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      
      // Test checked state
      document.getElementById('notesVisibleByDefault').checked = true;
      await handleSave(mockEvent);
      expect(chrome.storage.sync.set.mock.calls[0][0].preferences.notesVisibleByDefault).toBe(true);
      
      // Reset and test unchecked state
      chrome.storage.sync.set.mockClear();
      document.getElementById('notesVisibleByDefault').checked = false;
      await handleSave(mockEvent);
      expect(chrome.storage.sync.set.mock.calls[0][0].preferences.notesVisibleByDefault).toBe(false);
    });
    
    it('should load preferences with all default values when partial data exists', async () => {
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        const result = {
          preferences: {
            defaultTheme: 'blue'
            // Other fields missing
          }
        };
        if (callback) callback(result);
        return Promise.resolve(result);
      });
      
      await loadPreferences();
      
      // Theme should be loaded
      expect(document.querySelector('[data-theme="blue"]').classList.contains('selected')).toBe(true);
      
      // Other values should have defaults
      expect(document.getElementById('noteWidth').value).toBe('280');
    });
  });
  
  describe('DEFAULT_PREFERENCES', () => {
    it('should have expected default values', () => {
      expect(localThis.DEFAULT_PREFERENCES).toBeDefined();
      expect(localThis.DEFAULT_PREFERENCES.defaultTheme).toBe('yellow');
      expect(localThis.DEFAULT_PREFERENCES.defaultPosition).toBe('top-right');
      expect(localThis.DEFAULT_PREFERENCES.noteWidth).toBe(280);
      expect(localThis.DEFAULT_PREFERENCES.fontSize).toBe('medium');
      expect(localThis.DEFAULT_PREFERENCES.notesVisibleByDefault).toBe(true);
    });
  });
});
