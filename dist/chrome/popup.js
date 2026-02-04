"use strict";
(() => {
  // src/shared/settings.ts
  var SETTINGS_KEY = "lightsession_settings";
  var DEFAULT_SETTINGS = {
    enabled: true,
    keepLastN: 5,
    showIndicator: true,
    ultraLean: false
  };
  function normalizeSettings(input) {
    return {
      enabled: typeof input?.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
      keepLastN: clampNumber(input?.keepLastN, 1, 100, DEFAULT_SETTINGS.keepLastN),
      showIndicator: typeof input?.showIndicator === "boolean" ? input.showIndicator : DEFAULT_SETTINGS.showIndicator,
      ultraLean: typeof input?.ultraLean === "boolean" ? input.ultraLean : DEFAULT_SETTINGS.ultraLean
    };
  }
  function clampNumber(value, min, max, fallback) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  // src/shared/extension-api.ts
  function getExtensionApi() {
    if (typeof browser !== "undefined") {
      return browser;
    }
    return chrome;
  }

  // src/popup/popup.ts
  var api = getExtensionApi();
  var enabledToggle = document.getElementById("toggle-enabled");
  var indicatorToggle = document.getElementById("toggle-indicator");
  var ultraToggle = document.getElementById("toggle-ultra");
  var keepLastInput = document.getElementById("keep-last");
  var refreshButton = document.getElementById("refresh-tab");
  var settings = DEFAULT_SETTINGS;
  initialize();
  function initialize() {
    api.storage.local.get(SETTINGS_KEY, (result) => {
      settings = normalizeSettings(result?.[SETTINGS_KEY]);
      render();
    });
    enabledToggle.addEventListener("change", () => {
      updateSetting({ enabled: enabledToggle.checked });
    });
    indicatorToggle.addEventListener("change", () => {
      updateSetting({ showIndicator: indicatorToggle.checked });
    });
    ultraToggle.addEventListener("change", () => {
      updateSetting({ ultraLean: ultraToggle.checked });
    });
    keepLastInput.addEventListener("input", () => {
      let value = keepLastInput.value.replace(/[^0-9]/g, "");
      if (value === "") {
        value = "1";
      }
      const numValue = parseInt(value, 10);
      if (numValue < 1) {
        value = "1";
      } else if (numValue > 100) {
        value = "100";
      }
      keepLastInput.value = value;
    });
    keepLastInput.addEventListener("change", () => {
      const value = parseInt(keepLastInput.value, 10);
      if (!isNaN(value) && value >= 1 && value <= 100) {
        updateSetting({ keepLastN: value });
      } else {
        keepLastInput.value = String(settings.keepLastN);
      }
    });
    refreshButton.addEventListener("click", () => {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (typeof tabId === "number") {
          api.tabs.reload(tabId);
        }
      });
    });
  }
  function render() {
    enabledToggle.checked = settings.enabled;
    indicatorToggle.checked = settings.showIndicator;
    ultraToggle.checked = settings.ultraLean;
    keepLastInput.value = String(settings.keepLastN);
  }
  function updateSetting(next) {
    settings = normalizeSettings({ ...settings, ...next });
    render();
    api.storage.local.set({ [SETTINGS_KEY]: settings });
  }
})();
