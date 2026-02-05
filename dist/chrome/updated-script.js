// DOM yüklendiğinde çalıştır
document.addEventListener('DOMContentLoaded', () => {
  const continueBtn = document.getElementById('continue');
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
      // Popup'ı yeni sekmede aç (çıktı almak için)
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    });
  }
});
