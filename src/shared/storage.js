/**
 * Storage Utility
 * Wrapper for Chrome storage API with helper methods
 */

export const storage = {
  /**
   * Get item from storage
   * @param {string} key - Storage key
   * @returns {Promise<any>} Stored value
   */
  async get(key) {
    const result = await chrome.storage.local.get([key]);
    return result[key];
  },
  
  /**
   * Set item in storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   */
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  
  /**
   * Remove item from storage
   * @param {string} key - Storage key
   */
  async remove(key) {
    await chrome.storage.local.remove([key]);
  },
  
  /**
   * Get all notes
   * @returns {Promise<Array>} Array of notes
   */
  async getNotes() {
    return (await this.get('notes')) || [];
  },
  
  /**
   * Get notes for a specific URL
   * @param {string} url - Page URL
   * @returns {Promise<Array>} Array of notes for the URL
   */
  async getNotesForUrl(url) {
    const notes = await this.getNotes();
    const pageUrl = new URL(url);
    
    return notes.filter(note => {
      try {
        const noteUrl = new URL(note.url);
        return noteUrl.origin + noteUrl.pathname === pageUrl.origin + pageUrl.pathname;
      } catch {
        return false;
      }
    });
  },
  
  /**
   * Save a new note
   * @param {Object} note - Note object
   * @returns {Promise<Object>} Saved note with ID
   */
  async saveNote(note) {
    const notes = await this.getNotes();
    
    const newNote = {
      ...note,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    notes.push(newNote);
    await this.set('notes', notes);
    
    return newNote;
  },
  
  /**
   * Update an existing note
   * @param {Object} note - Note object with ID
   * @returns {Promise<Object>} Updated note
   */
  async updateNote(note) {
    const notes = await this.getNotes();
    const index = notes.findIndex(n => n.id === note.id);
    
    if (index === -1) {
      throw new Error('Note not found');
    }
    
    notes[index] = {
      ...notes[index],
      ...note,
      updatedAt: new Date().toISOString()
    };
    
    await this.set('notes', notes);
    
    return notes[index];
  },
  
  /**
   * Delete a note
   * @param {string} noteId - Note ID
   */
  async deleteNote(noteId) {
    const notes = await this.getNotes();
    const filteredNotes = notes.filter(n => n.id !== noteId);
    
    if (filteredNotes.length === notes.length) {
      throw new Error('Note not found');
    }
    
    await this.set('notes', filteredNotes);
  },
  
  /**
   * Generate unique ID
   * @returns {string} Unique ID
   */
  generateId() {
    return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
};
