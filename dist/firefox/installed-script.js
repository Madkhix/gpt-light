// Run when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const continueBtn = document.getElementById('start-using');
  const settingsBtn = document.getElementById('settings');
  
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      // Close this tab and open ChatGPT
      chrome.tabs.create({ url: 'https://chat.openai.com' });
      window.close();
    });
  }
  
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      // Open popup in new tab (to get out of extension context)
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    });
  }
});
