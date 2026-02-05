import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./shared/settings";
import { getExtensionApi } from "./shared/extension-api";

const api = getExtensionApi();

api.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    // Installation - show onboarding
    chrome.tabs.create({
      url: chrome.runtime.getURL('views/installed.html'),
      active: true
    });
  } else if (reason === 'update') {
    // Update - show update page
    chrome.tabs.create({
      url: chrome.runtime.getURL('views/updated.html'),
      active: true
    });
  }
  
  // Initialize settings if they don't exist
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    if (result?.[SETTINGS_KEY]) {
      return;
    }
    api.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  });
});

// Keyboard shortcuts
api.commands.onCommand.addListener((command) => {
  switch (command) {
    case "toggle-extension":
      toggleExtension();
      break;
    case "trim-now":
      trimNow();
      break;
    case "open-popup":
      openPopup();
      break;
  }
});

function toggleExtension() {
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    const settings = result?.[SETTINGS_KEY] as any || DEFAULT_SETTINGS;
    const updated = { ...settings, enabled: !settings.enabled };
    api.storage.local.set({ [SETTINGS_KEY]: updated });
    
    // Content script'e bildir
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        api.tabs.sendMessage(tabs[0].id, {
          type: "lightsession:toggle",
          enabled: updated.enabled
        });
      }
    });
  });
}

function trimNow() {
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      api.tabs.sendMessage(tabs[0].id, {
        type: "lightsession:trim-now"
      });
    }
  });
}

function openPopup() {
  api.action.openPopup();
}
