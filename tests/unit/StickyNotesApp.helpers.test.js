import {
  isContextInvalidatedError,
  shouldSubscribeToNotes,
  shouldUnsubscribeFromNotes,
  shouldReloadNotes
} from '../../src/content/app/StickyNotesApp.helpers.js';

describe('StickyNotesApp Helpers', () => {
  describe('isContextInvalidatedError', () => {
    it('should return true for "Extension context invalidated"', () => {
      const error = new Error('Extension context invalidated');
      expect(isContextInvalidatedError(error)).toBe(true);
    });

    it('should return true for "Extension context was invalidated"', () => {
      const error = new Error('Extension context was invalidated');
      expect(isContextInvalidatedError(error)).toBe(true);
    });
    
    it('should return true for "context invalidated"', () => {
        const error = new Error('context invalidated');
        expect(isContextInvalidatedError(error)).toBe(true);
      });

    it('should return true when error is a string containing the message', () => {
      const error = 'Error: Extension context invalidated';
      expect(isContextInvalidatedError(error)).toBe(true);
    });

    it('should return false for unrelated errors', () => {
      const error = new Error('Network error');
      expect(isContextInvalidatedError(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isContextInvalidatedError(null)).toBe(false);
      expect(isContextInvalidatedError(undefined)).toBe(false);
    });
  });

  describe('shouldSubscribeToNotes', () => {
    it('should return true when user logs in (was not logged in, now is)', () => {
      expect(shouldSubscribeToNotes(false, true)).toBe(true);
    });

    it('should return false when user stays logged out', () => {
      expect(shouldSubscribeToNotes(false, false)).toBe(false);
    });

    it('should return false when user stays logged in', () => {
      expect(shouldSubscribeToNotes(true, true)).toBe(false);
    });

    it('should return false when user logs out', () => {
      expect(shouldSubscribeToNotes(true, false)).toBe(false);
    });
  });

  describe('shouldUnsubscribeFromNotes', () => {
    it('should return true when user logs out (was logged in, now is not)', () => {
      expect(shouldUnsubscribeFromNotes(true, false)).toBe(true);
    });

    it('should return false when user logs in', () => {
      expect(shouldUnsubscribeFromNotes(false, true)).toBe(false);
    });

    it('should return false when user stays logged in', () => {
      expect(shouldUnsubscribeFromNotes(true, true)).toBe(false);
    });

    it('should return false when user stays logged out', () => {
      expect(shouldUnsubscribeFromNotes(false, false)).toBe(false);
    });
  });

  describe('shouldReloadNotes', () => {
    it('should return true when composite URLs differ', () => {
      expect(shouldReloadNotes('url1', 'url2')).toBe(true);
    });

    it('should return false when composite URLs are identical', () => {
      expect(shouldReloadNotes('url1', 'url1')).toBe(false);
    });
  });
});
