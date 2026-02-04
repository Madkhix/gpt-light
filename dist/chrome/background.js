"use strict";
(() => {
  // src/shared/settings.ts
  var SETTINGS_KEY = "lightsession_settings";
  var DEFAULT_SETTINGS = {
    enabled: true,
    keepLastN: 30,
    showIndicator: true,
    ultraLean: false
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
  api.runtime.onInstalled.addListener(() => {
    api.storage.local.get(SETTINGS_KEY, (result) => {
      if (result?.[SETTINGS_KEY]) {
        return;
      }
      api.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    });
  });
})();
