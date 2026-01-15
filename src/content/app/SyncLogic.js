/**
 * SyncLogic
 * Pure logic for handling real-time synchronization updates
 */

/**
 * Clean up expired session-created markers
 * @param {Map<string, number>} sessionCreatedNoteIds - Map of note IDs to creation timestamp
 * @param {number} now - Current timestamp (optional, defaults to Date.now())
 * @param {number} gracePeriodMs - Grace period in ms (optional, defaults to 15000)
 * @returns {Array<string>} List of IDs that were removed (mainly for testing/logging)
 */
export function purgeExpiredSessionMarkers(sessionCreatedNoteIds, now = Date.now(), gracePeriodMs = 15000) {
  const expiredIds = [];
  for (const [id, createdAt] of sessionCreatedNoteIds.entries()) {
    if (now - createdAt > gracePeriodMs) {
      sessionCreatedNoteIds.delete(id);
      expiredIds.push(id);
    }
  }
  return expiredIds;
}

/**
 * Calculate the difference between current notes and updated notes
 * @param {Map<string, any>} currentNotesMap - Current notes in the application
 * @param {Array<Object>} updatedNotesList - List of notes from the server
 * @param {Map<string, number>} sessionCreatedNoteIds - Map of locally created notes (to prevent race conditions)
 * @returns {Object} Diff object containing { toRemove: [], toUpdate: [], toCreate: [] }
 */
export function calculateNoteDiff(currentNotesMap, updatedNotesList, sessionCreatedNoteIds) {
  const updatedIds = new Set(updatedNotesList.map(note => note.id));
  const toRemove = [];
  const toUpdate = [];
  const toCreate = [];

  // 1. Identify notes to remove
  // Notes present locally but missing from server update
  for (const id of currentNotesMap.keys()) {
    if (!updatedIds.has(id)) {
      // If we just created the note locally, avoid removing it due to sync lag
      if (sessionCreatedNoteIds.has(id)) {
        continue;
      }
      toRemove.push(id);
    }
  }

  // 2. Identify notes to update or create
  for (const noteData of updatedNotesList) {
    if (currentNotesMap.has(noteData.id)) {
      const existingNote = currentNotesMap.get(noteData.id);
      
      // Check if content or theme changed
      // We only include in toUpdate if there are actual changes
      // to avoid unnecessary UI updates, though the caller might double-check
      // or just apply blindly if cheap.
      // Here we pass the full data so the caller can decide exactly what to update.
      
      // Simple check for changed properties we care about for now
      const contentChanged = existingNote.content !== (noteData.content || '');
      const themeChanged = existingNote.theme !== (noteData.theme || 'yellow');
      
      if (contentChanged || themeChanged) {
        toUpdate.push(noteData);
      }
    } else {
      // New note
      const isNewNote = sessionCreatedNoteIds.has(noteData.id);
      toCreate.push({ 
        noteData, 
        isNewNote 
      });
    }
  }

  return { toRemove, toUpdate, toCreate };
}
