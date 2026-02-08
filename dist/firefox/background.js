"use strict";
(() => {
  // src/shared/settings.ts
  var SETTINGS_KEY = "lightsession_settings";
  var DEFAULT_SETTINGS = {
    enabled: true,
    keepLastN: 4,
    showIndicator: true,
    ultraLean: false,
    darkMode: true,
    autoTrim: true
  };

  // src/shared/extension-api.ts
  function getExtensionApi() {
    if (typeof browser !== "undefined") {
      return browser;
    }
    return chrome;
  }

  // src/shared/debug.ts
  var __DEV__ = true;
  var debugLog = (...args) => {
    if (__DEV__) {
      console.log("[LightSession]", ...args);
    }
  };

  // src/background.ts
  var api = getExtensionApi();
  api.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      api.tabs.create({
        url: api.runtime.getURL("installed.html"),
        active: true
      });
    } else if (reason === "update") {
      api.tabs.create({
        url: api.runtime.getURL("updated.html"),
        active: true
      });
    }
    api.storage.local.get(SETTINGS_KEY, (result) => {
      if (result?.[SETTINGS_KEY]) {
        return;
      }
      api.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    });
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      debugLog("[LightSession Background] Message received:", message);
      try {
        if (message.type === "lightsession:ready") {
          sendResponse({ settings: DEFAULT_SETTINGS });
          return true;
        }
      } catch (error) {
        debugLog("[LightSession Background] Message error:", error);
      }
    });
  });
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
    debugLog("[LightSession Background] toggleExtension() called");
    api.storage.local.get(SETTINGS_KEY, (result) => {
      const settings = result?.[SETTINGS_KEY] || DEFAULT_SETTINGS;
      const updated = { ...settings, enabled: !settings.enabled };
      debugLog("[LightSession Background] Toggle settings:", { current: settings.enabled, updated: updated.enabled });
      api.storage.local.set({ [SETTINGS_KEY]: updated });
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          api.tabs.sendMessage(tabs[0].id, {
            type: "lightsession:toggle",
            enabled: updated.enabled
          });
          if (updated.enabled) {
            api.tabs.reload(tabs[0].id);
          }
        }
      });
    });
  }
  function trimNow() {
    if (__DEV__) debugLog("[LightSession Background] trimNow() called");
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (__DEV__) debugLog("[LightSession Background] Current tabs:", tabs);
      if (tabs[0]?.id) {
        if (__DEV__) debugLog("[LightSession Background] Sending trim message to tab:", tabs[0].id);
        api.tabs.sendMessage(tabs[0].id, {
          type: "lightsession:trim-now"
        }, (response) => {
          if (__DEV__) debugLog("[LightSession Background] Message response:", response);
        });
      } else {
        if (__DEV__) debugLog("[LightSession Background] No active tab found");
      }
    });
  }
  function openPopup() {
    api.action.openPopup();
  }
})();
