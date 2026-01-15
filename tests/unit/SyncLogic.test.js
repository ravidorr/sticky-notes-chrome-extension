import { purgeExpiredSessionMarkers, calculateNoteDiff } from '../../src/content/app/SyncLogic.js';

describe('SyncLogic', () => {
  describe('purgeExpiredSessionMarkers', () => {
    it('should remove expired markers', () => {
      const markers = new Map([
        ['id1', 1000],
        ['id2', 5000]
      ]);
      const now = 20000; // id1 is 19s old (expired), id2 is 15s old (just on edge, depends on > vs >=)
      const gracePeriod = 10000;
      
      // 19000 > 10000 -> remove
      // 15000 > 10000 -> remove
      
      const expired = purgeExpiredSessionMarkers(markers, now, gracePeriod);
      
      expect(expired).toEqual(['id1', 'id2']);
      expect(markers.size).toBe(0);
    });

    it('should keep valid markers', () => {
      const markers = new Map([
        ['id1', 9000],
        ['id2', 9500]
      ]);
      const now = 10000;
      const gracePeriod = 2000;
      
      // id1: 10000 - 9000 = 1000 < 2000 (keep)
      // id2: 10000 - 9500 = 500 < 2000 (keep)
      
      const expired = purgeExpiredSessionMarkers(markers, now, gracePeriod);
      expect(expired).toEqual([]);
      expect(markers.size).toBe(2);
    });
  });

  describe('calculateNoteDiff', () => {
    it('should identify notes to remove', () => {
      const currentNotes = new Map([
        ['id1', { content: 'test', theme: 'yellow' }],
        ['id2', { content: 'test2', theme: 'yellow' }]
      ]);
      const updatedList = [{ id: 'id1', content: 'test', theme: 'yellow' }]; // id2 missing
      const sessionMarkers = new Map();

      const diff = calculateNoteDiff(currentNotes, updatedList, sessionMarkers);
      
      expect(diff.toRemove).toEqual(['id2']);
      expect(diff.toUpdate).toEqual([]);
      expect(diff.toCreate).toEqual([]);
    });

    it('should NOT remove missing notes if they are session-created (race condition)', () => {
      const currentNotes = new Map([
        ['id1', { content: 'test', theme: 'yellow' }]
      ]);
      const updatedList = []; // Server hasn't seen id1 yet
      const sessionMarkers = new Map([['id1', Date.now()]]);

      const diff = calculateNoteDiff(currentNotes, updatedList, sessionMarkers);
      
      expect(diff.toRemove).toEqual([]);
    });

    it('should identify notes to update (content change)', () => {
      const currentNotes = new Map([
        ['id1', { content: 'old', theme: 'yellow' }]
      ]);
      const updatedList = [{ id: 'id1', content: 'new', theme: 'yellow' }];

      const diff = calculateNoteDiff(currentNotes, updatedList, new Map());
      
      expect(diff.toUpdate).toHaveLength(1);
      expect(diff.toUpdate[0].content).toBe('new');
    });

    it('should identify notes to update (theme change)', () => {
      const currentNotes = new Map([
        ['id1', { content: 'same', theme: 'yellow' }]
      ]);
      const updatedList = [{ id: 'id1', content: 'same', theme: 'blue' }];

      const diff = calculateNoteDiff(currentNotes, updatedList, new Map());
      
      expect(diff.toUpdate).toHaveLength(1);
      expect(diff.toUpdate[0].theme).toBe('blue');
    });

    it('should identify notes to create', () => {
      const currentNotes = new Map();
      const updatedList = [{ id: 'newId', content: 'test', theme: 'yellow' }];

      const diff = calculateNoteDiff(currentNotes, updatedList, new Map());
      
      expect(diff.toCreate).toHaveLength(1);
      expect(diff.toCreate[0].noteData.id).toBe('newId');
      expect(diff.toCreate[0].isNewNote).toBe(false);
    });

    it('should mark created notes as isNewNote if session marker exists', () => {
      const currentNotes = new Map();
      const updatedList = [{ id: 'newId', content: 'test', theme: 'yellow' }];
      const sessionMarkers = new Map([['newId', Date.now()]]);

      const diff = calculateNoteDiff(currentNotes, updatedList, sessionMarkers);
      
      expect(diff.toCreate).toHaveLength(1);
      expect(diff.toCreate[0].isNewNote).toBe(true);
    });
  });
});
