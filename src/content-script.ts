import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings, type LightSessionSettings } from "./shared/settings";
import { getExtensionApi } from "./shared/extension-api";
import { createElement } from "./shared/dom";
import { __DEV__, debugLog } from "./shared/debug";

const api = getExtensionApi();
const indicatorId = "lightsession-indicator";
const ultraLeanStyleId = "lightsession-ultra-lean";

injectPageScript();

let currentSettings = DEFAULT_SETTINGS;
let indicator: HTMLDivElement | null = null;

initializeSettings();

// Firefox: message-based toggle
window.addEventListener("message", (event) => {
  if (!event.data || !event.data.type) return;

  switch (event.data.type) {
    case "lightsession:new-message":
      // New message detected by page script, check if we should trim
      if (currentSettings.enabled && currentSettings.autoTrim) {
        setTimeout(() => {
          trimDOMInContentScript(currentSettings.keepLastN);
        }, 1000);
      }
      break;
      
    case "lightsession:toggle-request":
      currentSettings.enabled = event.data.enabled;
      updateIndicator(currentSettings);
      // If disabled, stop auto-trim. If enabled with auto-trim, perform trim
      if (currentSettings.enabled && currentSettings.autoTrim) {
        trimDOMInContentScript(currentSettings.keepLastN);
      }
      window.postMessage({ type: "lightsession:toggle-response", success: true }, "*");
      break;

    case "lightsession:autoTrim-request":
      currentSettings.autoTrim = event.data.autoTrim;
      // Only trim if both enabled and auto-trim are true
      if (currentSettings.autoTrim && currentSettings.enabled) {
        trimDOMInContentScript(currentSettings.keepLastN);
      }
      window.postMessage({ type: "lightsession:autoTrim-response", success: true }, "*");
      break;
  }
});

// Send settings after page loads
setTimeout(() => {
  api.storage.local.get([SETTINGS_KEY], (result) => {
    const settings = normalizeSettings(result[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
    const event = new CustomEvent("lightsession:settings", {
      detail: settings
    });
    window.dispatchEvent(event);
  });
}, 1500);

// Simple storage listener - no complex debouncing
api.storage.onChanged.addListener((changes: StorageChanges, areaName: StorageAreaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }
  
  const next = normalizeSettings(changes[SETTINGS_KEY].newValue as Partial<LightSessionSettings> | null | undefined);
  debugLog('[LightSession Content] Storage changed, applying settings:', next);
  applySettings(next);
});

// Listen for messages from background script
api.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  if (__DEV__) debugLog('[LightSession Content] Message received:', message);
  
  if (message.type === 'lightsession:toggle') {
    if (__DEV__) debugLog('[LightSession Content] Processing toggle message');
    currentSettings.enabled = message.enabled;
    dispatchSettings(currentSettings);
    updateIndicator(currentSettings);
    sendResponse({ success: true, action: 'toggle' });
  } else if (message.type === 'lightsession:trim-now') {
    if (__DEV__) debugLog('[LightSession Content] Processing trim-now message');
    
    // Get latest settings to ensure we have current keepLastN
    api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
      const latestSettings = normalizeSettings(result?.[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
      const keepLastN = latestSettings?.keepLastN || currentSettings.keepLastN;
      
      if (__DEV__) debugLog('[LightSession Content] Ctrl+Shift+2: Trimming with keepLastN:', keepLastN);
      trimDOMInContentScript(keepLastN, true); // true = manual trim
    });
    
    sendResponse({ success: true, action: 'trim' });
  } else {
    if (__DEV__) debugLog('[LightSession Content] Unknown message type:', message.type);
    sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return true; // Required for async response
});

function injectPageScript() {
  // Platform-specific inject
  const isChrome = typeof chrome !== 'undefined' && chrome.runtime;
  
  if (isChrome) {
    // Use page script for Chrome
    const script = document.createElement("script");
    script.src = api.runtime.getURL("page-script.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    if (__DEV__) debugLog('[LightSession Content] Chrome: using page script');
  } else {
    // Use content script for Firefox
    if (__DEV__) debugLog('[LightSession Content] Firefox: using content script trim');
  }
}

// Platform-independent content script trim function
function trimDOMInContentScript(keepLastN: number, isManualTrim: boolean = false) {
  // Get latest settings to ensure we have current state
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    const latestSettings = normalizeSettings(result?.[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
    
    // Update currentSettings with latest values
    if (latestSettings) {
      currentSettings = { ...currentSettings, ...latestSettings };
    }
    
    // Check if trimming is enabled (only for auto-trim, not manual trim)
    if (!isManualTrim && (!currentSettings.enabled || !currentSettings.autoTrim)) {
      if (__DEV__) debugLog('[LightSession Content] trimDOMInContentScript called but trimming disabled:', { enabled: currentSettings.enabled, autoTrim: currentSettings.autoTrim });
      return;
    }
    
    // For manual trim, still check if extension is enabled
    if (isManualTrim && !currentSettings.enabled) {
      if (__DEV__) debugLog('[LightSession Content] Manual trim called but extension disabled:', { enabled: currentSettings.enabled });
      return;
    }
    
    if (__DEV__) debugLog('[LightSession Content] Content script trim started, keepLastN:', keepLastN, 'manual:', isManualTrim);
  
  // Platform-independent wide container search
  const container = document.querySelector('.group\\/thread.flex.flex-col.min-h-full') || 
                   document.querySelector('#thread') ||
                   document.querySelector('[id="thread"]') ||
                   document.querySelector('[data-testid*="conversation"]') ||
                   document.querySelector('.flex-1.overflow-y-auto') ||
                   document.querySelector('.overflow-y-auto') ||
                   document.querySelector('main') ||
                   document.querySelector('body');
  
  if (__DEV__) debugLog('[LightSession Content] Container found:', !!container);
  
  if (!container) {
    if (__DEV__) debugLog('[LightSession Content] trimDOM: conversation container not found');
    return;
  }

  // Platform-independent wide message search
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

  if (__DEV__) debugLog('[LightSession Content] trimDOM: found', allMessages.length, 'message containers');
  
  // Filter messages by role
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

  if (__DEV__) debugLog('[LightSession Content] trimDOM: filtered to', validMessages.length, 'valid messages');
  
  // Keep last keepLastN messages, remove the rest
  if (validMessages.length > keepLastN) {
    const toRemove = validMessages.slice(0, validMessages.length - keepLastN);
    
    if (__DEV__) debugLog('[LightSession Content] trimDOM: removing', toRemove.length, 'messages, keeping', keepLastN);
    
    // Clean up messages to be removed and their toolbars
    toRemove.forEach(msg => {
      let wrapper = null;
      
      // Search for specific wrapper by role
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
      
      // Platform-independent more aggressive removal
      if (wrapper) {
        if (__DEV__) debugLog('[LightSession Content] Removing wrapper:', wrapper);
        
        // Remove the wrapper and all its empty siblings
        let current = wrapper as HTMLElement;
        while (current && current.parentElement) {
          const nextSibling = current.nextElementSibling;
          current.remove();
          
          // Also remove empty siblings like <br class="sr-only">
          if (nextSibling && (
            nextSibling.tagName === 'BR' || 
            nextSibling.classList.contains('sr-only') ||
            (nextSibling.textContent && nextSibling.textContent.trim() === '')
          )) {
            current = nextSibling as HTMLElement;
          } else {
            break;
          }
        }
      } else {
        if (__DEV__) debugLog('[LightSession Content] Removing msg:', msg);
        (msg as HTMLElement).style.display = 'none';
        (msg as HTMLElement).style.visibility = 'hidden';
        msg.remove();
      }
    });
    
    if (__DEV__) debugLog('[LightSession Content] trimDOM: trimmed to last', keepLastN, 'messages, removed', toRemove.length, 'messages');
  } else {
    if (__DEV__) debugLog('[LightSession Content] trimDOM: nothing to trim, messages', validMessages.length, 'targetCount', keepLastN);
  }
    });
  }

function initializeSettings() {
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    const stored = normalizeSettings(result?.[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
    
    // Wait for DOM to be ready and ChatGPT to load
    setTimeout(() => {
      applySettings(stored);
      
      // Additional delay for Firefox to ensure everything is loaded
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        setTimeout(() => {
          applySettings(stored);
        }, 2000);
      }
    }, 3000);
  });
}

function applySettings(next: LightSessionSettings) {
  debugLog('[LightSession Content] applySettings called with:', next);
  const wasEnabled = currentSettings.enabled;
  const wasAutoTrim = currentSettings.autoTrim;
  const oldKeepLastN = currentSettings.keepLastN;
  
  currentSettings = next;
  dispatchSettings(next);
  updateIndicator(next);
  
  // Platform-specific auto-trim with delays
  if (next.enabled && next.autoTrim) {
    if (__DEV__) debugLog('[LightSession Content] Auto-trim enabled, performing trim');
    
    // Different delays for different platforms
    const isChrome = typeof chrome !== 'undefined' && chrome.runtime;
    const delay = isChrome ? 500 : 1000; // Chrome: 500ms, Firefox: 1000ms
    
    setTimeout(() => {
      trimDOMInContentScript(next.keepLastN);
    }, delay);
  } else {
    if (__DEV__) debugLog('[LightSession Content] Auto-trim disabled, NOT performing trim');
  }
  
  // If message count changed and extension is enabled with auto-trim, re-trim with new count
  if (next.enabled && next.autoTrim && oldKeepLastN !== next.keepLastN) {
    if (__DEV__) debugLog('[LightSession Content] Message count changed, re-trimming with new count:', next.keepLastN);
    
    const isChrome = typeof chrome !== 'undefined' && chrome.runtime;
    const delay = isChrome ? 500 : 1000;
    
    setTimeout(() => {
      trimDOMInContentScript(next.keepLastN);
    }, delay);
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

  // Ensure DOM is ready before creating indicator
  if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
    setTimeout(() => updateIndicator(settings), 500);
    return;
  }

  if (!indicator) {
    indicator = createIndicator();
    
    // Try to append to body, if not ready wait
    if (document.body) {
      document.body.appendChild(indicator);
    } else {
      setTimeout(() => {
        if (document.body && indicator) {
          document.body.appendChild(indicator);
        }
      }, 1000);
    }
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
