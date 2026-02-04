export type LightSessionSettings = {
  enabled: boolean;
  keepLastN: number;
  showIndicator: boolean;
  ultraLean: boolean;
};

export const SETTINGS_KEY = "lightsession_settings";

export const DEFAULT_SETTINGS: LightSessionSettings = {
  enabled: true,
  keepLastN: 30,
  showIndicator: true,
  ultraLean: false
};

export function normalizeSettings(input: Partial<LightSessionSettings> | null | undefined): LightSessionSettings {
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
    keepLastN: clampNumber(input?.keepLastN, 1, 100, DEFAULT_SETTINGS.keepLastN),
    showIndicator: typeof input?.showIndicator === "boolean" ? input.showIndicator : DEFAULT_SETTINGS.showIndicator,
    ultraLean: typeof input?.ultraLean === "boolean" ? input.ultraLean : DEFAULT_SETTINGS.ultraLean
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
