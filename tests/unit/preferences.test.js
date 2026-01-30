/**
 * Preferences Module Unit Tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Create mock chrome.storage before importing module
const localThis = {
  mockStorage: {},
  mockChromeStorage: null
};

beforeEach(() => {
  jest.resetModules();
  
  // Reset mock storage
  localThis.mockStorage = {};
  
  // Create mock chrome.storage.sync
  localThis.mockChromeStorage = {
    sync: {
      get: jest.fn(async (keys) => {
        const result = {};
        for (const key of keys) {
          if (localThis.mockStorage[key] !== undefined) {
            result[key] = localThis.mockStorage[key];
          }
        }
        return result;
      }),
      set: jest.fn(async (items) => {
        Object.assign(localThis.mockStorage, items);
      })
    }
  };
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('DEFAULT_PREFERENCES', () => {
  it('should have correct default values', async () => {
    const { DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    
    expect(DEFAULT_PREFERENCES).toEqual({
      defaultTheme: 'yellow',
      defaultPosition: 'top-right',
      noteWidth: 280,
      fontSize: 'medium',
      notesVisibleByDefault: true
    });
  });
});

describe('VALID_POSITIONS', () => {
  it('should contain all valid position options', async () => {
    const { VALID_POSITIONS } = await import('../../src/shared/preferences.js');
    
    expect(VALID_POSITIONS).toContain('top-left');
    expect(VALID_POSITIONS).toContain('top-right');
    expect(VALID_POSITIONS).toContain('bottom-left');
    expect(VALID_POSITIONS).toContain('bottom-right');
    expect(VALID_POSITIONS).toHaveLength(4);
  });
});

describe('VALID_NOTE_WIDTHS', () => {
  it('should contain all valid width options', async () => {
    const { VALID_NOTE_WIDTHS } = await import('../../src/shared/preferences.js');
    
    expect(VALID_NOTE_WIDTHS).toContain(240);
    expect(VALID_NOTE_WIDTHS).toContain(280);
    expect(VALID_NOTE_WIDTHS).toContain(320);
    expect(VALID_NOTE_WIDTHS).toContain(360);
    expect(VALID_NOTE_WIDTHS).toHaveLength(4);
  });
});

describe('VALID_FONT_SIZES', () => {
  it('should contain all valid font size options', async () => {
    const { VALID_FONT_SIZES } = await import('../../src/shared/preferences.js');
    
    expect(VALID_FONT_SIZES).toContain('small');
    expect(VALID_FONT_SIZES).toContain('medium');
    expect(VALID_FONT_SIZES).toContain('large');
    expect(VALID_FONT_SIZES).toHaveLength(3);
  });
});

describe('FONT_SIZE_VALUES', () => {
  it('should map size names to pixel values', async () => {
    const { FONT_SIZE_VALUES } = await import('../../src/shared/preferences.js');
    
    expect(FONT_SIZE_VALUES.small).toBe(12);
    expect(FONT_SIZE_VALUES.medium).toBe(14);
    expect(FONT_SIZE_VALUES.large).toBe(16);
  });
});

describe('getFontSizeValue', () => {
  it('should return correct pixel value for valid size', async () => {
    const { getFontSizeValue } = await import('../../src/shared/preferences.js');
    
    expect(getFontSizeValue('small')).toBe(12);
    expect(getFontSizeValue('medium')).toBe(14);
    expect(getFontSizeValue('large')).toBe(16);
  });
  
  it('should return medium (14px) for invalid size', async () => {
    const { getFontSizeValue } = await import('../../src/shared/preferences.js');
    
    expect(getFontSizeValue('invalid')).toBe(14);
    expect(getFontSizeValue(null)).toBe(14);
    expect(getFontSizeValue(undefined)).toBe(14);
  });
});

describe('getPreferences', () => {
  it('should return defaults when storage is empty', async () => {
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result).toEqual(DEFAULT_PREFERENCES);
    expect(localThis.mockChromeStorage.sync.get).toHaveBeenCalledWith(['preferences']);
  });
  
  it('should return stored preferences when they exist', async () => {
    const storedPrefs = {
      defaultTheme: 'blue',
      defaultPosition: 'bottom-left',
      noteWidth: 320,
      fontSize: 'large',
      notesVisibleByDefault: false
    };
    localThis.mockStorage.preferences = storedPrefs;
    
    const { getPreferences } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result).toEqual(storedPrefs);
  });
  
  it('should merge partial preferences with defaults', async () => {
    localThis.mockStorage.preferences = {
      defaultTheme: 'green'
    };
    
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result.defaultTheme).toBe('green');
    expect(result.defaultPosition).toBe(DEFAULT_PREFERENCES.defaultPosition);
    expect(result.noteWidth).toBe(DEFAULT_PREFERENCES.noteWidth);
    expect(result.fontSize).toBe(DEFAULT_PREFERENCES.fontSize);
    expect(result.notesVisibleByDefault).toBe(DEFAULT_PREFERENCES.notesVisibleByDefault);
  });
  
  it('should reject invalid theme and use default', async () => {
    localThis.mockStorage.preferences = {
      defaultTheme: 'invalid-theme'
    };
    
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result.defaultTheme).toBe(DEFAULT_PREFERENCES.defaultTheme);
  });
  
  it('should reject invalid position and use default', async () => {
    localThis.mockStorage.preferences = {
      defaultPosition: 'invalid-position'
    };
    
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result.defaultPosition).toBe(DEFAULT_PREFERENCES.defaultPosition);
  });
  
  it('should reject invalid note width and use default', async () => {
    localThis.mockStorage.preferences = {
      noteWidth: 999
    };
    
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result.noteWidth).toBe(DEFAULT_PREFERENCES.noteWidth);
  });
  
  it('should reject invalid font size and use default', async () => {
    localThis.mockStorage.preferences = {
      fontSize: 'huge'
    };
    
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result.fontSize).toBe(DEFAULT_PREFERENCES.fontSize);
  });
  
  it('should reject non-boolean visibility and use default', async () => {
    localThis.mockStorage.preferences = {
      notesVisibleByDefault: 'yes'
    };
    
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result.notesVisibleByDefault).toBe(DEFAULT_PREFERENCES.notesVisibleByDefault);
  });
  
  it('should return defaults when storage throws error', async () => {
    const errorStorage = {
      sync: {
        get: jest.fn().mockRejectedValue(new Error('Storage error'))
      }
    };
    
    const { getPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await getPreferences({ chromeStorage: errorStorage });
    
    expect(result).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('setPreferences', () => {
  it('should save valid preferences', async () => {
    const { setPreferences } = await import('../../src/shared/preferences.js');
    
    const newPrefs = {
      defaultTheme: 'pink',
      defaultPosition: 'bottom-right',
      noteWidth: 360,
      fontSize: 'small',
      notesVisibleByDefault: false
    };
    
    const result = await setPreferences(newPrefs, { chromeStorage: localThis.mockChromeStorage });
    
    expect(result.success).toBe(true);
    expect(result.preferences).toEqual(newPrefs);
    expect(localThis.mockChromeStorage.sync.set).toHaveBeenCalled();
  });
  
  it('should merge partial preferences with existing', async () => {
    // Set initial preferences
    localThis.mockStorage.preferences = {
      defaultTheme: 'blue',
      defaultPosition: 'top-left',
      noteWidth: 280,
      fontSize: 'medium',
      notesVisibleByDefault: true
    };
    
    const { setPreferences } = await import('../../src/shared/preferences.js');
    
    const result = await setPreferences(
      { defaultTheme: 'green' },
      { chromeStorage: localThis.mockChromeStorage }
    );
    
    expect(result.success).toBe(true);
    expect(result.preferences.defaultTheme).toBe('green');
    expect(result.preferences.defaultPosition).toBe('top-left');
  });
  
  it('should ignore invalid theme values', async () => {
    const { setPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    
    const result = await setPreferences(
      { defaultTheme: 'invalid' },
      { chromeStorage: localThis.mockChromeStorage }
    );
    
    expect(result.success).toBe(true);
    expect(result.preferences.defaultTheme).toBe(DEFAULT_PREFERENCES.defaultTheme);
  });
  
  it('should ignore invalid position values', async () => {
    const { setPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    
    const result = await setPreferences(
      { defaultPosition: 'center' },
      { chromeStorage: localThis.mockChromeStorage }
    );
    
    expect(result.success).toBe(true);
    expect(result.preferences.defaultPosition).toBe(DEFAULT_PREFERENCES.defaultPosition);
  });
  
  it('should ignore invalid note width values', async () => {
    const { setPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    
    const result = await setPreferences(
      { noteWidth: 500 },
      { chromeStorage: localThis.mockChromeStorage }
    );
    
    expect(result.success).toBe(true);
    expect(result.preferences.noteWidth).toBe(DEFAULT_PREFERENCES.noteWidth);
  });
  
  it('should return error when storage fails', async () => {
    const errorStorage = {
      sync: {
        get: jest.fn(async () => ({})),
        set: jest.fn().mockRejectedValue(new Error('Storage error'))
      }
    };
    
    const { setPreferences } = await import('../../src/shared/preferences.js');
    const result = await setPreferences(
      { defaultTheme: 'blue' },
      { chromeStorage: errorStorage }
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('resetPreferences', () => {
  it('should reset to default preferences', async () => {
    // Set some custom preferences first
    localThis.mockStorage.preferences = {
      defaultTheme: 'pink',
      defaultPosition: 'bottom-left',
      noteWidth: 360,
      fontSize: 'large',
      notesVisibleByDefault: false
    };
    
    const { resetPreferences, DEFAULT_PREFERENCES } = await import('../../src/shared/preferences.js');
    const result = await resetPreferences({ chromeStorage: localThis.mockChromeStorage });
    
    expect(result.success).toBe(true);
    expect(result.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(localThis.mockChromeStorage.sync.set).toHaveBeenCalledWith({
      preferences: DEFAULT_PREFERENCES
    });
  });
  
  it('should return error when storage fails', async () => {
    const errorStorage = {
      sync: {
        set: jest.fn().mockRejectedValue(new Error('Storage error'))
      }
    };
    
    const { resetPreferences } = await import('../../src/shared/preferences.js');
    const result = await resetPreferences({ chromeStorage: errorStorage });
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
