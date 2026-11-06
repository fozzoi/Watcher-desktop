// Browser-compatible storage with persistent local cache across sessions.

let cloudOnly = false;
const cloudMemory = new Map<string, string>();

export function setCloudOnlyStorage(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled === cloudOnly) return;
  cloudOnly = enabled;
  // Populate cloudMemory from localStorage so in-memory access is warm
  if (enabled) {
    for (const key of LIBRARY_KEYS) {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        cloudMemory.set(key, stored);
      }
    }
  } else {
    cloudMemory.clear();
  }
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
    if (cloudOnly && LIBRARY_KEYS.has(key)) {
      const memVal = cloudMemory.get(key);
      if (memVal !== undefined) return memVal;
      // Fallback to localStorage if in-memory cache hasn't been warmed yet
      const localVal = window.localStorage.getItem(key);
      if (localVal !== null) {
        cloudMemory.set(key, localVal);
        return localVal;
      }
      return null;
    }
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    const previousValue = window.localStorage.getItem(key);
    if (cloudOnly && LIBRARY_KEYS.has(key)) {
      cloudMemory.set(key, value);
    }
    // Always persist to localStorage so data survives page refresh/restart
    window.localStorage.setItem(key, value);
    if (LIBRARY_KEYS.has(key)) {
      window.dispatchEvent(new CustomEvent("watcher_local_library_changed", { detail: { key, previousValue, value } }));
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    const previousValue = window.localStorage.getItem(key);
    if (cloudOnly && LIBRARY_KEYS.has(key)) {
      cloudMemory.delete(key);
    }
    window.localStorage.removeItem(key);
    if (LIBRARY_KEYS.has(key)) {
      window.dispatchEvent(new CustomEvent("watcher_local_library_changed", { detail: { key, previousValue, value: null } }));
    }
  },
  clear: async (): Promise<void> => {
    if (typeof window === "undefined") return;
    cloudMemory.clear();
    window.localStorage.clear();
  }
};

const LIBRARY_KEYS = new Set([
  "watchlist", "history", "favoriteArtists", "savedCollections",
  "@watch_progress", "watch_progress_v1", "watcher.chat.conversations.v1",
  "watcher.chat.userMemory.v1", "watcher.chat.aiName.v1",
]);

export default AsyncStorage;
