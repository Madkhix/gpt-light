export const __DEV__ = true;

export const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log("[LightSession]", ...args);
  }
};
