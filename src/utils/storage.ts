// Browser-compatible storage with a memory-only library while signed in.

let cloudOnly = false;
const cloudMemory = new Map<string, string>();

export function setCloudOnlyStorage(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled === cloudOnly) return;
  if (enabled) {
    for (const key of LIBRARY_KEYS) {
      cloudMemory.delete(key);
      window.localStorage.removeItem(key);
    }
    cloudOnly = true;
    return;
  }
  cloudOnly = false;
  for (const key of LIBRARY_KEYS) {
    const value = cloudMemory.get(key);
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  }
  cloudMemory.clear();
}

export function clearLocalLibraryStorage() {
  if (typeof window === "undefined") return;
  for (const key of LIBRARY_KEYS) {
    cloudMemory.delete(key);
    window.localStorage.removeItem(key);
  }
}

export const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    if (cloudOnly && LIBRARY_KEYS.has(key)) return cloudMemory.get(key) ?? null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    const previousValue = cloudOnly && LIBRARY_KEYS.has(key) ? cloudMemory.get(key) ?? null : window.localStorage.getItem(key);
    if (cloudOnly && LIBRARY_KEYS.has(key)) cloudMemory.set(key, value);
    else window.localStorage.setItem(key, value);
    if (LIBRARY_KEYS.has(key)) window.dispatchEvent(new CustomEvent("watcher_local_library_changed", { detail: { key, previousValue, value } }));
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    const previousValue = cloudOnly && LIBRARY_KEYS.has(key) ? cloudMemory.get(key) ?? null : window.localStorage.getItem(key);
    if (cloudOnly && LIBRARY_KEYS.has(key)) cloudMemory.delete(key);
    else window.localStorage.removeItem(key);
    if (LIBRARY_KEYS.has(key)) window.dispatchEvent(new CustomEvent("watcher_local_library_changed", { detail: { key, previousValue, value: null } }));
  },
  clear: async (): Promise<void> => {
    if (typeof window === "undefined") return;
    if (cloudOnly) {
      for (const key of LIBRARY_KEYS) cloudMemory.delete(key);
      return;
    }
    window.localStorage.clear();
  }
};

const LIBRARY_KEYS = new Set([
  "watchlist", "history", "favoriteArtists", "savedCollections",
  "watch_progress_v1", "watcher.chat.conversations.v1",
  "watcher.chat.userMemory.v1", "watcher.chat.aiName.v1",
]);

export default AsyncStorage;
