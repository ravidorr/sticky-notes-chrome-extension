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
// Permission elements
let permissionGranted;
let permissionNotGranted;
let grantPermissionBtn;
let revokePermissionBtn;

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
  // Permission elements
  permissionGranted = document.getElementById('permissionGranted');
  permissionNotGranted = document.getElementById('permissionNotGranted');
  grantPermissionBtn = document.getElementById('grantPermissionBtn');
  revokePermissionBtn = document.getElementById('revokePermissionBtn');
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
    notesVisibleCheckbox.setAttribute('aria-checked', prefs.notesVisibleByDefault ? 'true' : 'false');
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
  // Remove selected from all
  themePicker.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // Add selected to matching
  const selectedBtn = themePicker.querySelector(`[data-theme="${theme}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
    defaultThemeInput.value = theme;
  }
}

/**
 * Select a position in the picker
 * @param {string} position - Position to select
 */
function selectPosition(position) {
  // Remove selected from all
  positionPicker.querySelectorAll('.position-option').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // Add selected to matching
  const selectedBtn = positionPicker.querySelector(`[data-position="${position}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
    defaultPositionInput.value = position;
  }
}

/**
 * Check if all-sites permission is granted
 * @returns {Promise<boolean>}
 */
async function checkAllSitesPermission() {
  try {
    return await chrome.permissions.contains({ origins: ['<all_urls>'] });
  } catch {
    return false;
  }
}

/**
 * Update permission UI based on current permission state
 */
async function updatePermissionUI() {
  const hasPermission = await checkAllSitesPermission();
  
  if (hasPermission) {
    permissionGranted.classList.remove('hidden');
    permissionNotGranted.classList.add('hidden');
    grantPermissionBtn.classList.add('hidden');
    revokePermissionBtn.classList.remove('hidden');
  } else {
    permissionGranted.classList.add('hidden');
    permissionNotGranted.classList.remove('hidden');
    grantPermissionBtn.classList.remove('hidden');
    revokePermissionBtn.classList.add('hidden');
  }
}

/**
 * Handle grant permission button click
 */
async function handleGrantPermission() {
  try {
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (granted) {
      showStatus(t('permissionGrantedSuccess') || 'Permission granted! Notes will now appear automatically on all websites.', 'success');
    }
    await updatePermissionUI();
  } catch (error) {
    console.error('Failed to request permission:', error);
    showStatus(t('permissionGrantError') || 'Failed to grant permission', 'error');
  }
}

/**
 * Handle revoke permission button click
 */
async function handleRevokePermission() {
  const confirmed = window.confirm(t('permissionRevokeConfirm') || 'Revoke access to all websites? You will need to grant permission for each site individually.');
  if (!confirmed) return;
  
  try {
    const revoked = await chrome.permissions.remove({ origins: ['<all_urls>'] });
    if (revoked) {
      showStatus(t('permissionRevokedSuccess') || 'Permission revoked. You will be asked for permission on each site.', 'success');
    }
    await updatePermissionUI();
  } catch (error) {
    console.error('Failed to revoke permission:', error);
    showStatus(t('permissionRevokeError') || 'Failed to revoke permission', 'error');
  }
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
  
  // Position picker
  positionPicker.querySelectorAll('.position-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const position = btn.dataset.position;
      selectPosition(position);
    });
  });
  
  // Form submit
  settingsForm.addEventListener('submit', handleSave);
  
  // Reset button
  resetBtn.addEventListener('click', handleReset);
  
  // Permission buttons
  grantPermissionBtn.addEventListener('click', handleGrantPermission);
  revokePermissionBtn.addEventListener('click', handleRevokePermission);
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
      notesVisibleCheckbox.setAttribute('aria-checked', DEFAULT_PREFERENCES.notesVisibleByDefault ? 'true' : 'false');
      
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

  // Load preferences and check permissions in parallel for faster loading
  await Promise.all([
    loadPreferences(),
    updatePermissionUI()
  ]);
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
  checkAllSitesPermission,
  updatePermissionUI,
  handleGrantPermission,
  handleRevokePermission
};