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

  // src/background.ts
  var api = getExtensionApi();
  api.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      chrome.tabs.create({
        url: chrome.runtime.getURL("views/installed.html"),
        active: true
      });
    } else if (reason === "update") {
      chrome.tabs.create({
        url: chrome.runtime.getURL("views/updated.html"),
        active: true
      });
    }
    api.storage.local.get(SETTINGS_KEY, (result) => {
      if (result?.[SETTINGS_KEY]) {
        return;
      }
      api.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
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
    api.storage.local.get(SETTINGS_KEY, (result) => {
      const settings = result?.[SETTINGS_KEY] || DEFAULT_SETTINGS;
      const updated = { ...settings, enabled: !settings.enabled };
      api.storage.local.set({ [SETTINGS_KEY]: updated });
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
})();
