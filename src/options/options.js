/**
 * Options Page Script
 * Handles settings form and persistence
 */

import { getPreferences, setPreferences, resetPreferences, DEFAULT_PREFERENCES } from '../shared/preferences.js';
import { initializeI18n, t } from '../shared/i18n.js';

// DOM Elements
let settingsForm;
let themePicker;
let positionPicker;
let defaultThemeInput;
let defaultPositionInput;
let noteWidthSelect;
let fontSizeSelect;
let notesVisibleCheckbox;
let resetBtn;
let saveBtn;
let statusMessage;
let versionDisplay;

/**
 * Initialize DOM element references
 */
function initDOMElements() {
  settingsForm = document.getElementById('settingsForm');
  themePicker = document.getElementById('themePicker');
  positionPicker = document.getElementById('positionPicker');
  defaultThemeInput = document.getElementById('defaultTheme');
  defaultPositionInput = document.getElementById('defaultPosition');
  noteWidthSelect = document.getElementById('noteWidth');
  fontSizeSelect = document.getElementById('fontSize');
  notesVisibleCheckbox = document.getElementById('notesVisibleByDefault');
  resetBtn = document.getElementById('resetBtn');
  saveBtn = document.getElementById('saveBtn');
  statusMessage = document.getElementById('statusMessage');
  versionDisplay = document.getElementById('versionDisplay');
}

/**
 * Display version from manifest
 */
function displayVersion() {
  if (!versionDisplay) return;
  
  try {
    const manifest = chrome.runtime.getManifest();
    versionDisplay.textContent = `v${manifest.version}`;
  } catch {
    versionDisplay.textContent = '';
  }
}

/**
 * Load preferences and populate form
 */
async function loadPreferences() {
  try {
    const prefs = await getPreferences();
    
    // Set theme
    selectTheme(prefs.defaultTheme);
    
    // Set position
    selectPosition(prefs.defaultPosition);
    
    // Set note width
    noteWidthSelect.value = prefs.noteWidth.toString();
    
    // Set font size
    fontSizeSelect.value = prefs.fontSize;
    
    // Set visibility
    notesVisibleCheckbox.checked = prefs.notesVisibleByDefault;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    showStatus(t('settingsLoadError') || 'Failed to load settings', 'error');
  }
}

/**
 * Select a theme in the picker
 * @param {string} theme - Theme to select
 */
function selectTheme(theme) {
  // Remove selected from all and update aria-checked
  themePicker.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.remove('selected');
    btn.setAttribute('aria-checked', 'false');
  });
  
  // Add selected to matching and update aria-checked
  const selectedBtn = themePicker.querySelector(`[data-theme="${theme}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
    selectedBtn.setAttribute('aria-checked', 'true');
    defaultThemeInput.value = theme;
  }
}

/**
 * Select a position in the picker
 * @param {string} position - Position to select
 */
function selectPosition(position) {
  // Remove selected from all and update aria-checked
  positionPicker.querySelectorAll('.position-option').forEach(btn => {
    btn.classList.remove('selected');
    btn.setAttribute('aria-checked', 'false');
  });
  
  // Add selected to matching and update aria-checked
  const selectedBtn = positionPicker.querySelector(`[data-position="${position}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
    selectedBtn.setAttribute('aria-checked', 'true');
    defaultPositionInput.value = position;
  }
}

/**
 * Setup keyboard navigation for a radiogroup
 * @param {HTMLElement} container - The radiogroup container
 * @param {string} itemSelector - Selector for radio items
 * @param {Function} selectFn - Function to call when selecting an item
 * @param {string} dataAttr - Data attribute name for the value
 */
function setupRadiogroupKeyboard(container, itemSelector, selectFn, dataAttr) {
  const items = Array.from(container.querySelectorAll(itemSelector));
  
  items.forEach((item, index) => {
    item.addEventListener('keydown', (event) => {
      let newIndex = index;
      
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        newIndex = index === items.length - 1 ? 0 : index + 1;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        newIndex = index === 0 ? items.length - 1 : index - 1;
      } else if (event.key === 'Home') {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        newIndex = items.length - 1;
      }
      
      if (newIndex !== index) {
        items[newIndex].focus();
        selectFn(items[newIndex].dataset[dataAttr]);
      }
    });
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Theme picker
  themePicker.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      selectTheme(theme);
    });
  });
  
  // Theme picker keyboard navigation
  setupRadiogroupKeyboard(themePicker, '.theme-option', selectTheme, 'theme');
  
  // Position picker
  positionPicker.querySelectorAll('.position-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const position = btn.dataset.position;
      selectPosition(position);
    });
  });
  
  // Position picker keyboard navigation
  setupRadiogroupKeyboard(positionPicker, '.position-option', selectPosition, 'position');
  
  // Toggle switch - update aria-checked
  notesVisibleCheckbox.addEventListener('change', () => {
    notesVisibleCheckbox.setAttribute('aria-checked', notesVisibleCheckbox.checked ? 'true' : 'false');
  });
  
  // Form submit
  settingsForm.addEventListener('submit', handleSave);
  
  // Reset button
  resetBtn.addEventListener('click', handleReset);
}

/**
 * Handle save button click
 * @param {Event} event - Submit event
 */
async function handleSave(event) {
  event.preventDefault();
  
  // Disable button during save
  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = t('settingsSaving') || 'Saving...';
  
  try {
    const prefs = {
      defaultTheme: defaultThemeInput.value,
      defaultPosition: defaultPositionInput.value,
      noteWidth: parseInt(noteWidthSelect.value, 10),
      fontSize: fontSizeSelect.value,
      notesVisibleByDefault: notesVisibleCheckbox.checked
    };
    
    const result = await setPreferences(prefs);
    
    if (result.success) {
      showStatus(t('settingsSaved') || 'Settings saved successfully', 'success');
    } else {
      showStatus(result.error || t('settingsSaveError') || 'Failed to save settings', 'error');
    }
  } catch (error) {
    console.error('Failed to save preferences:', error);
    showStatus(t('settingsSaveError') || 'Failed to save settings', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

/**
 * Handle reset button click
 */
async function handleReset() {
  // Confirm reset
  const confirmed = window.confirm(t('settingsResetConfirm') || 'Reset all settings to defaults?');
  if (!confirmed) return;
  
  try {
    const result = await resetPreferences();
    
    if (result.success) {
      // Reload form with defaults
      selectTheme(DEFAULT_PREFERENCES.defaultTheme);
      selectPosition(DEFAULT_PREFERENCES.defaultPosition);
      noteWidthSelect.value = DEFAULT_PREFERENCES.noteWidth.toString();
      fontSizeSelect.value = DEFAULT_PREFERENCES.fontSize;
      notesVisibleCheckbox.checked = DEFAULT_PREFERENCES.notesVisibleByDefault;
      
      showStatus(t('settingsReset') || 'Settings reset to defaults', 'success');
    } else {
      showStatus(result.error || t('settingsResetError') || 'Failed to reset settings', 'error');
    }
  } catch (error) {
    console.error('Failed to reset preferences:', error);
    showStatus(t('settingsResetError') || 'Failed to reset settings', 'error');
  }
}

/**
 * Show status message
 * @param {string} message - Message to show
 * @param {string} type - 'success' or 'error'
 */
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 3000);
}

/**
 * Initialize the options page
 */
async function init() {
  // Initialize i18n
  initializeI18n();
  
  // Initialize DOM elements
  initDOMElements();
  
  // Display version
  displayVersion();
  
  // Setup event listeners
  setupEventListeners();
  
  // Load current preferences
  await loadPreferences();
}

// Initialize when DOM is ready
if (typeof globalThis.__JEST__ === 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

// Export for testing
export {
  init,
  loadPreferences,
  handleSave,
  handleReset,
  selectTheme,
  selectPosition,
  showStatus,
  initDOMElements,
  displayVersion,
  setupRadiogroupKeyboard
};
