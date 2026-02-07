export const __DEV__ = false;

export const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log("[LightSession]", ...args);
  }
};
