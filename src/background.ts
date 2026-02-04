import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./shared/settings";
import { getExtensionApi } from "./shared/extension-api";

const api = getExtensionApi();

api.runtime.onInstalled.addListener(() => {
  api.storage.local.get(SETTINGS_KEY, (result: Record<string, unknown>) => {
    if (result?.[SETTINGS_KEY]) {
      return;
    }
    api.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  });
});
