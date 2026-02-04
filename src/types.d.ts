type StorageAreaName = "sync" | "local" | "managed" | "session";

type StorageChange = {
  oldValue?: unknown;
  newValue?: unknown;
};

type StorageChanges = Record<string, StorageChange>;

type ChromeStorageArea = {
  get: (keys: string | string[] | null, callback: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
};

type ChromeRuntime = {
  getURL: (path: string) => string;
  onInstalled: {
    addListener: (callback: () => void) => void;
  };
};

type ChromeTabs = {
  query: (queryInfo: { active?: boolean; currentWindow?: boolean }, callback: (tabs: Array<{ id?: number }>) => void) => void;
  reload: (tabId: number) => void;
};

type ChromeStorage = {
  local: ChromeStorageArea;
  onChanged: {
    addListener: (callback: (changes: StorageChanges, areaName: StorageAreaName) => void) => void;
  };
};

type ChromeLike = {
  storage: ChromeStorage;
  runtime: ChromeRuntime;
  tabs: ChromeTabs;
};

declare const chrome: ChromeLike;

declare const browser: ChromeLike | undefined;
