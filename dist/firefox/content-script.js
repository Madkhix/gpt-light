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
  function normalizeSettings(input) {
    return {
      enabled: typeof input?.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
      keepLastN: clampNumber(input?.keepLastN, 1, 100, DEFAULT_SETTINGS.keepLastN),
      showIndicator: typeof input?.showIndicator === "boolean" ? input.showIndicator : DEFAULT_SETTINGS.showIndicator,
      ultraLean: typeof input?.ultraLean === "boolean" ? input.ultraLean : DEFAULT_SETTINGS.ultraLean,
      darkMode: typeof input?.darkMode === "boolean" ? input.darkMode : DEFAULT_SETTINGS.darkMode,
      autoTrim: typeof input?.autoTrim === "boolean" ? input.autoTrim : DEFAULT_SETTINGS.autoTrim
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

  // src/shared/dom.ts
  function createElement(tag, className, textContent) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (textContent) {
      element.textContent = textContent;
    }
    return element;
  }

  // src/content-script.ts
  var api = getExtensionApi();
  var indicatorId = "lightsession-indicator";
  var ultraLeanStyleId = "lightsession-ultra-lean";
  injectPageScript();
  var currentSettings = DEFAULT_SETTINGS;
  var indicator = null;
  initializeSettings();
  setTimeout(() => {
    api.storage.local.get([SETTINGS_KEY], (result) => {
      const settings = normalizeSettings(result[SETTINGS_KEY]);
      const event = new CustomEvent("lightsession:settings", {
        detail: settings
      });
      window.dispatchEvent(event);
    });
  }, 1500);
  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) {
      return;
    }
    const next = normalizeSettings(changes[SETTINGS_KEY].newValue);
    applySettings(next);
  });
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (false) console.log("[LightSession Content] Message received:", message);
    if (message.type === "lightsession:toggle") {
      if (false) console.log("[LightSession Content] Processing toggle message");
      currentSettings.enabled = message.enabled;
      dispatchSettings(currentSettings);
      updateIndicator(currentSettings);
      sendResponse({ success: true, action: "toggle" });
    } else if (message.type === "lightsession:trim-now") {
      if (false) console.log("[LightSession Content] Processing trim-now message");
      trimDOMInContentScript(currentSettings.keepLastN);
      sendResponse({ success: true, action: "trim" });
    } else {
      if (false) console.log("[LightSession Content] Unknown message type:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
    }
    return true;
  });
  function injectPageScript() {
    const isChrome = typeof chrome !== "undefined" && chrome.runtime;
    if (isChrome) {
      const script = document.createElement("script");
      script.src = api.runtime.getURL("page-script.js");
      script.async = false;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
      if (false) console.log("[LightSession Content] Chrome: using page script");
    } else {
      if (false) console.log("[LightSession Content] Firefox: using content script trim");
    }
  }
  function trimDOMInContentScript(keepLastN) {
    if (false) console.log("[LightSession Content] Content script trim started, keepLastN:", keepLastN);
    const container = document.querySelector(".group\\/thread.flex.flex-col.min-h-full") || document.querySelector("#thread") || document.querySelector('[id="thread"]') || document.querySelector('[data-testid*="conversation"]') || document.querySelector(".flex-1.overflow-y-auto") || document.querySelector(".overflow-y-auto") || document.querySelector("main") || document.querySelector("body");
    if (false) console.log("[LightSession Content] Container found:", !!container);
    if (!container) {
      if (false) console.log("[LightSession Content] trimDOM: conversation container not found");
      return;
    }
    let allMessages = Array.from(container.querySelectorAll("[data-message-author-role]"));
    if (allMessages.length === 0) {
      allMessages = Array.from(container.querySelectorAll(".min-h-8.text-message"));
    }
    if (allMessages.length === 0) {
      allMessages = Array.from(container.querySelectorAll('[data-testid*="conversation-turn"]'));
    }
    if (allMessages.length === 0) {
      allMessages = Array.from(container.querySelectorAll("[data-message-id]"));
    }
    if (allMessages.length === 0) {
      allMessages = Array.from(container.querySelectorAll(".text-message"));
    }
    if (allMessages.length === 0) {
      allMessages = Array.from(container.querySelectorAll(".group"));
    }
    if (allMessages.length === 0) {
      allMessages = Array.from(container.querySelectorAll("div"));
    }
    if (false) console.log("[LightSession Content] trimDOM: found", allMessages.length, "message containers");
    const validMessages = allMessages.filter((msg) => {
      let role = msg.getAttribute("data-message-author-role");
      if (!role) {
        if (msg.classList.contains("user") || msg.querySelector(".user")) role = "user";
        else if (msg.classList.contains("assistant") || msg.querySelector(".assistant")) role = "assistant";
        else if (msg.textContent?.includes("You") || msg.textContent?.includes("Siz")) role = "user";
        else if (msg.textContent?.includes("ChatGPT") || msg.textContent?.includes("Assistant")) role = "assistant";
        else {
          const content = msg.textContent?.trim();
          if (content && content.length > 0) {
            role = content.length < 200 && content.includes("?") ? "user" : "assistant";
          } else {
            role = "unknown";
          }
        }
      }
      return role === "user" || role === "assistant";
    });
    if (false) console.log("[LightSession Content] trimDOM: filtered to", validMessages.length, "valid messages");
    if (validMessages.length > keepLastN) {
      const toRemove = validMessages.slice(0, validMessages.length - keepLastN);
      if (false) console.log("[LightSession Content] trimDOM: removing", toRemove.length, "messages, keeping", keepLastN);
      toRemove.forEach((msg) => {
        let wrapper = null;
        const role = msg.getAttribute("data-message-author-role");
        if (role === "assistant") {
          wrapper = msg.closest(".agent-turn");
        } else if (role === "user") {
          wrapper = msg.closest(".group\\/turn-messages");
        }
        if (!wrapper) {
          wrapper = msg.closest('[data-testid*="conversation-turn"]');
        }
        if (!wrapper) {
          wrapper = msg.closest(".flex.flex-col.gap-2");
        }
        if (!wrapper) {
          wrapper = msg.closest(".group");
        }
        if (!wrapper) {
          wrapper = msg.parentElement;
        }
        if (wrapper) {
          if (false) console.log("[LightSession Content] Removing wrapper:", wrapper);
          wrapper.style.display = "none";
          wrapper.style.visibility = "hidden";
          wrapper.remove();
        } else {
          if (false) console.log("[LightSession Content] Removing msg:", msg);
          msg.style.display = "none";
          msg.style.visibility = "hidden";
          msg.remove();
        }
      });
      if (false) console.log("[LightSession Content] trimDOM: trimmed to last", keepLastN, "messages, removed", toRemove.length, "messages");
    } else {
      if (false) console.log("[LightSession Content] trimDOM: nothing to trim, messages", validMessages.length, "targetCount", keepLastN);
    }
  }
  function initializeSettings() {
    api.storage.local.get(SETTINGS_KEY, (result) => {
      const stored = normalizeSettings(result?.[SETTINGS_KEY]);
      applySettings(stored);
    });
  }
  function applySettings(next) {
    currentSettings = next;
    dispatchSettings(next);
    updateIndicator(next);
    if (next.enabled && next.autoTrim) {
      if (false) console.log("[LightSession Content] Firefox: auto-trim enabled, performing trim");
      trimDOMInContentScript(next.keepLastN);
    }
    updateUltraLean(next);
  }
  function dispatchSettings(next) {
    const event = new CustomEvent("lightsession:settings", {
      detail: {
        enabled: next.enabled,
        keepLastN: next.keepLastN,
        autoTrim: next.autoTrim
      }
    });
    window.dispatchEvent(event);
  }
  function updateIndicator(settings) {
    if (!settings.showIndicator) {
      indicator?.remove();
      indicator = null;
      return;
    }
    if (!indicator) {
      indicator = createIndicator();
      document.body.appendChild(indicator);
    }
    indicator.textContent = settings.enabled ? `LightSession: ON \xB7 Last ${settings.keepLastN}` : "LightSession: OFF";
  }
  function createIndicator() {
    const element = createElement("div");
    element.id = indicatorId;
    element.setAttribute("role", "status");
    element.style.position = "fixed";
    element.style.right = "16px";
    element.style.bottom = "16px";
    element.style.zIndex = "2147483647";
    element.style.padding = "8px 12px";
    element.style.borderRadius = "999px";
    element.style.background = "rgba(15, 15, 15, 0.85)";
    element.style.color = "#ffffff";
    element.style.font = "12px/1.2 system-ui, sans-serif";
    element.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.2)";
    element.style.backdropFilter = "blur(6px)";
    return element;
  }
  function updateUltraLean(settings) {
    const existing = document.getElementById(ultraLeanStyleId);
    if (!settings.ultraLean) {
      existing?.remove();
      return;
    }
    if (existing) {
      return;
    }
    const style = document.createElement("style");
    style.id = ultraLeanStyleId;
    style.textContent = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }
    img, video, canvas {
      content-visibility: auto;
      contain-intrinsic-size: 300px 300px;
    }
  `;
    document.documentElement.appendChild(style);
  }
})();
