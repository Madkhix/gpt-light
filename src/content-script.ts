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
    
    // Firefox için content script üzerinden trim yap
    trimDOMInContentScript(currentSettings.keepLastN);
    
    sendResponse({ success: true, action: 'trim' });
  } else {
    if (__DEV__) console.log('[LightSession Content] Unknown message type:', message.type);
    sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return true; // Async response için gerekli
});

function injectPageScript() {
  // Platform spesifik inject
  const isChrome = typeof chrome !== 'undefined' && chrome.runtime;
  
  if (isChrome) {
    // Chrome için page script kullan
    const script = document.createElement("script");
    script.src = api.runtime.getURL("page-script.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    if (__DEV__) console.log('[LightSession Content] Chrome: using page script');
  } else {
    // Firefox için content script kullan
    if (__DEV__) console.log('[LightSession Content] Firefox: using content script trim');
  }
}

// Platform bağımsız content script üzerinden trim fonksiyonu
function trimDOMInContentScript(keepLastN: number) {
  if (__DEV__) console.log('[LightSession Content] Content script trim started, keepLastN:', keepLastN);
  
  // Platform bağımsız geniş container arama
  const container = document.querySelector('.group\\/thread.flex.flex-col.min-h-full') || 
                   document.querySelector('#thread') ||
                   document.querySelector('[id="thread"]') ||
                   document.querySelector('[data-testid*="conversation"]') ||
                   document.querySelector('.flex-1.overflow-y-auto') ||
                   document.querySelector('.overflow-y-auto') ||
                   document.querySelector('main') ||
                   document.querySelector('body');
  
  if (__DEV__) console.log('[LightSession Content] Container found:', !!container);
  
  if (!container) {
    if (__DEV__) console.log('[LightSession Content] trimDOM: conversation container not found');
    return;
  }

  // Platform bağımsız geniş mesaj arama
  let allMessages = Array.from(container.querySelectorAll('[data-message-author-role]'));
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('.min-h-8.text-message'));
  }
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('[data-testid*="conversation-turn"]'));
  }
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('[data-message-id]'));
  }
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('.text-message'));
  }
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('.group'));
  }
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('div'));
  }

  if (__DEV__) console.log('[LightSession Content] trimDOM: found', allMessages.length, 'message containers');
  
  // Mesajları role'lerine göre filtrele
  const validMessages = allMessages.filter(msg => {
    let role = msg.getAttribute('data-message-author-role');
    if (!role) {
      if (msg.classList.contains('user') || msg.querySelector('.user')) role = 'user';
      else if (msg.classList.contains('assistant') || msg.querySelector('.assistant')) role = 'assistant';
      else if (msg.textContent?.includes('You') || msg.textContent?.includes('Siz')) role = 'user';
      else if (msg.textContent?.includes('ChatGPT') || msg.textContent?.includes('Assistant')) role = 'assistant';
      else {
        const content = msg.textContent?.trim();
        if (content && content.length > 0) {
          role = content.length < 200 && content.includes('?') ? 'user' : 'assistant';
        } else {
          role = 'unknown';
        }
      }
    }
    return role === 'user' || role === 'assistant';
  });

  if (__DEV__) console.log('[LightSession Content] trimDOM: filtered to', validMessages.length, 'valid messages');
  
  // Son keepLastN mesajı koru, gerisini sil
  if (validMessages.length > keepLastN) {
    const toRemove = validMessages.slice(0, validMessages.length - keepLastN);
    
    if (__DEV__) console.log('[LightSession Content] trimDOM: removing', toRemove.length, 'messages, keeping', keepLastN);
    
    // Silinecek mesajların ve toolbar'larını temizle
    toRemove.forEach(msg => {
      let wrapper = null;
      
      // Role göre spesifik wrapper ara
      const role = msg.getAttribute('data-message-author-role');
      if (role === 'assistant') {
        wrapper = msg.closest('.agent-turn');
      } else if (role === 'user') {
        wrapper = msg.closest('.group\\/turn-messages');
      }
      
      // Fallback selector'lar
      if (!wrapper) {
        wrapper = msg.closest('[data-testid*="conversation-turn"]');
      }
      if (!wrapper) {
        wrapper = msg.closest('.flex.flex-col.gap-2');
      }
      if (!wrapper) {
        wrapper = msg.closest('.group');
      }
      if (!wrapper) {
        wrapper = msg.parentElement;
      }
      
      // Platform bağımsız daha agresif silme
      if (wrapper) {
        if (__DEV__) console.log('[LightSession Content] Removing wrapper:', wrapper);
        (wrapper as HTMLElement).style.display = 'none';
        (wrapper as HTMLElement).style.visibility = 'hidden';
        wrapper.remove();
      } else {
        if (__DEV__) console.log('[LightSession Content] Removing msg:', msg);
        (msg as HTMLElement).style.display = 'none';
        (msg as HTMLElement).style.visibility = 'hidden';
        msg.remove();
      }
    });
    
    if (__DEV__) console.log('[LightSession Content] trimDOM: trimmed to last', keepLastN, 'messages, removed', toRemove.length, 'messages');
  } else {
    if (__DEV__) console.log('[LightSession Content] trimDOM: nothing to trim, messages', validMessages.length, 'targetCount', keepLastN);
  }
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
  
  // Firefox için auto-trim kontrolü
  if (next.enabled && next.autoTrim) {
    if (__DEV__) console.log('[LightSession Content] Firefox: auto-trim enabled, performing trim');
    trimDOMInContentScript(next.keepLastN);
  }
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
