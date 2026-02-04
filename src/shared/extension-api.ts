export type ExtensionApi = ChromeLike;

declare const browser: ExtensionApi | undefined;

export function getExtensionApi(): ExtensionApi {
  if (typeof browser !== "undefined") {
    return browser;
  }
  return chrome;
}
