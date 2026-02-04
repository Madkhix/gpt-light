import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings, type LightSessionSettings } from "../shared/settings";
import { getExtensionApi } from "../shared/extension-api";

const api = getExtensionApi();

const enabledToggle = document.getElementById("toggle-enabled") as HTMLInputElement;
const indicatorToggle = document.getElementById("toggle-indicator") as HTMLInputElement;
const ultraToggle = document.getElementById("toggle-ultra") as HTMLInputElement;
const keepLastSlider = document.getElementById("keep-last") as HTMLInputElement;
const keepLastValue = document.getElementById("keep-last-value") as HTMLSpanElement;
const refreshButton = document.getElementById("refresh-tab") as HTMLButtonElement;

let settings = DEFAULT_SETTINGS;

initialize();

function initialize() {
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    settings = normalizeSettings(result?.[SETTINGS_KEY] as Partial<LightSessionSettings> | null | undefined);
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

  keepLastSlider.addEventListener("input", () => {
    keepLastValue.textContent = keepLastSlider.value;
  });

  keepLastSlider.addEventListener("change", () => {
    updateSetting({ keepLastN: Number(keepLastSlider.value) });
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
  keepLastSlider.value = String(settings.keepLastN);
  keepLastValue.textContent = String(settings.keepLastN);
}

function updateSetting(next: Partial<LightSessionSettings>) {
  settings = normalizeSettings({ ...settings, ...next });
  render();
  api.storage.local.set({ [SETTINGS_KEY]: settings });
}
