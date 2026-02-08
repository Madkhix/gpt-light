import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings, type LightSessionSettings } from "../shared/settings";
import { getExtensionApi } from "../shared/extension-api";
import { debugLog } from "../shared/debug";

const api = getExtensionApi();

const enabledToggle = document.getElementById("toggle-enabled") as HTMLInputElement;
const indicatorToggle = document.getElementById("toggle-indicator") as HTMLInputElement;
const ultraToggle = document.getElementById("toggle-ultra") as HTMLInputElement;
const darkToggle = document.getElementById("toggle-dark") as HTMLInputElement;
const autoTrimToggle = document.getElementById("toggle-autotrim") as HTMLInputElement;
const keepLastInput = document.getElementById("keep-last") as HTMLInputElement;
const refreshButton = document.getElementById("refresh-tab") as HTMLButtonElement;

let settings = DEFAULT_SETTINGS;

initialize();

function initialize() {
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    settings = normalizeSettings(result?.[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
    render();
  });

  // Listen for storage changes (when toggle is pressed via keyboard shortcut)
  api.storage.onChanged.addListener((changes: Record<string, any>, areaName: string) => {
    if (areaName === "local" && changes[SETTINGS_KEY]) {
      debugLog('[LightSession Popup] Storage changed:', changes[SETTINGS_KEY]);
      settings = normalizeSettings(changes[SETTINGS_KEY].newValue as Partial<LightSessionSettings> | null | undefined);
      debugLog('[LightSession Popup] New settings:', settings);
      render();
      
      // Force update keepLastN input value
      if (keepLastInput) {
        keepLastInput.value = String(settings.keepLastN);
        debugLog('[LightSession Popup] Updated keepLastN input to:', settings.keepLastN);
      }
    }
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

  darkToggle.addEventListener("change", () => {
    updateSetting({ darkMode: darkToggle.checked });
  });

  autoTrimToggle.addEventListener("change", () => {
    updateSetting({ autoTrim: autoTrimToggle.checked });
  });

  keepLastInput.addEventListener("input", () => {
    // Only allow numbers to be entered
    let value = keepLastInput.value.replace(/[^0-9]/g, '');
    
    // If empty, make it 1
    if (value === '') {
      value = '1';
    }
    
    // Min/max check
    const numValue = parseInt(value, 10);
    if (numValue < 1) {
      value = '1';
    } else if (numValue > 100) {
      value = '100';
    }
    
    keepLastInput.value = value;
  });

  keepLastInput.addEventListener("change", () => {
    const value = parseInt(keepLastInput.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 100) {
      updateSetting({ keepLastN: value });
    } else {
      // If invalid value, return to default
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
  darkToggle.checked = settings.darkMode;
  autoTrimToggle.checked = settings.autoTrim;
  keepLastInput.value = String(settings.keepLastN);
  
  // Dark mode
  if (settings.darkMode) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
}

function updateSetting(next: Partial<LightSessionSettings>) {
  settings = normalizeSettings({ ...settings, ...next });
  render();
  api.storage.local.set({ [SETTINGS_KEY]: settings });
}
