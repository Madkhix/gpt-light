import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./shared/settings";
import { getExtensionApi } from "./shared/extension-api";
import { debugLog } from "./shared/debug";

const api = getExtensionApi();

api.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    // Installation - show onboarding
    api.tabs.create({
      url: api.runtime.getURL('installed.html'),
      active: true
    });
  } else if (reason === 'update') {
    // Update - show update page
    api.tabs.create({
      url: api.runtime.getURL('updated.html'),
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

  // Listen for messages from content script
  api.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
    debugLog('[LightSession Background] Message received:', message);
    try {
      if (message.type === 'lightsession:ready') {
        sendResponse({ settings: DEFAULT_SETTINGS });
        return true;
      }
    } catch (error) {
      debugLog('[LightSession Background] Message error:', error);
    }
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
    
    // Report content script
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        api.tabs.sendMessage(tabs[0].id, {
          type: "lightsession:toggle",
          enabled: updated.enabled
        });
        
        // Extra check for Brave - reload page
        if (updated.enabled) {
          api.tabs.reload(tabs[0].id!);
        }
      }
    });
  });
}

function trimNow() {
  if (__DEV__) console.log('[LightSession Background] trimNow() called');
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (__DEV__) console.log('[LightSession Background] Current tabs:', tabs);
    if (tabs[0]?.id) {
      if (__DEV__) console.log('[LightSession Background] Sending trim message to tab:', tabs[0].id);
      api.tabs.sendMessage(tabs[0].id, {
        type: "lightsession:trim-now"
      }, (response) => {
        if (__DEV__) console.log('[LightSession Background] Message response:', response);
      });
    } else {
      if (__DEV__) console.log('[LightSession Background] No active tab found');
    }
  });
}

function openPopup() {
  api.action.openPopup();
}
