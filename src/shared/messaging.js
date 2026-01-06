/**
 * Messaging Utility
 * Wrapper for Chrome message passing API
 */

export const messaging = {
  /**
   * Send message to background script
   * @param {Object} message - Message object
   * @returns {Promise<Object>} Response
   */
  async sendToBackground(message) {
    return chrome.runtime.sendMessage(message);
  },
  
  /**
   * Send message to content script in active tab
   * @param {Object} message - Message object
   * @returns {Promise<Object>} Response
   */
  async sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    return chrome.tabs.sendMessage(tab.id, message);
  },
  
  /**
   * Send message to content script in specific tab
   * @param {number} tabId - Tab ID
   * @param {Object} message - Message object
   * @returns {Promise<Object>} Response
   */
  async sendToTab(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
  },
  
  /**
   * Add message listener
   * @param {Function} handler - Handler function
   * @returns {Function} Remove listener function
   */
  onMessage(handler) {
    const listener = (message, sender, sendResponse) => {
      const result = handler(message, sender);
      
      if (result instanceof Promise) {
        result
          .then(sendResponse)
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Async response
      }
      
      sendResponse(result);
    };
    
    chrome.runtime.onMessage.addListener(listener);
    
    return () => chrome.runtime.onMessage.removeListener(listener);
  }
};
