import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings, type LightSessionSettings } from "./shared/settings";
import { getExtensionApi } from "./shared/extension-api";
import { createElement } from "./shared/dom";

const api = getExtensionApi();
const indicatorId = "lightsession-indicator";
const ultraLeanStyleId = "lightsession-ultra-lean";

injectPageScript();

let currentSettings = DEFAULT_SETTINGS;
let indicator: HTMLDivElement | null = null;

initializeSettings();

// Sayfa yüklendikten sonra settings'i gönder
setTimeout(() => {
  api.storage.local.get([SETTINGS_KEY], (result) => {
    const settings = normalizeSettings(result[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
    const event = new CustomEvent("lightsession:settings", {
      detail: settings
    });
    window.dispatchEvent(event);
  });
}, 1500);

api.storage.onChanged.addListener((changes: StorageChanges, areaName: StorageAreaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }
  const next = normalizeSettings(changes[SETTINGS_KEY].newValue as Partial<LightSessionSettings> | null | undefined);
  applySettings(next);
});

// Background script'ten gelen mesajları dinle
api.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  if (__DEV__) console.log('[LightSession Content] Message received:', message);
  
  if (message.type === 'lightsession:toggle') {
    if (__DEV__) console.log('[LightSession Content] Processing toggle message');
    currentSettings.enabled = message.enabled;
    dispatchSettings(currentSettings);
    updateIndicator(currentSettings);
    sendResponse({ success: true, action: 'toggle' });
  } else if (message.type === 'lightsession:trim-now') {
    if (__DEV__) console.log('[LightSession Content] Processing trim-now message');
    // Trim olayını page script'e gönder
    const event = new CustomEvent("lightsession:trim-now");
    window.dispatchEvent(event);
    sendResponse({ success: true, action: 'trim' });
  } else {
    if (__DEV__) console.log('[LightSession Content] Unknown message type:', message.type);
    sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return true; // Async response için gerekli
});

function injectPageScript() {
  const script = document.createElement("script");
  script.src = api.runtime.getURL("page-script.js");
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function initializeSettings() {
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    const stored = normalizeSettings(result?.[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
    applySettings(stored);
  });
}

function applySettings(next: LightSessionSettings) {
  currentSettings = next;
  dispatchSettings(next);
  updateIndicator(next);
  updateUltraLean(next);
}

function dispatchSettings(next: LightSessionSettings) {
  const event = new CustomEvent("lightsession:settings", {
    detail: {
      enabled: next.enabled,
      keepLastN: next.keepLastN,
      autoTrim: next.autoTrim
    }
  });
  window.dispatchEvent(event);
}

function updateIndicator(settings: LightSessionSettings) {
  if (!settings.showIndicator) {
    indicator?.remove();
    indicator = null;
    return;
  }

  if (!indicator) {
    indicator = createIndicator();
    document.body.appendChild(indicator);
  }

  indicator.textContent = settings.enabled
    ? `LightSession: ON · Last ${settings.keepLastN}`
    : "LightSession: OFF";
}

function createIndicator(): HTMLDivElement {
  const element = createElement("div") as HTMLDivElement;
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

function updateUltraLean(settings: LightSessionSettings) {
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
