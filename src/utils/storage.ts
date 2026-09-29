// storage.ts - Mocking AsyncStorage using browser's localStorage for Next.js

export const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    const previousValue = window.localStorage.getItem(key);
    window.localStorage.setItem(key, value);
    if (LIBRARY_KEYS.has(key)) window.dispatchEvent(new CustomEvent("watcher_local_library_changed", { detail: { key, previousValue, value } }));
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    const previousValue = window.localStorage.getItem(key);
    window.localStorage.removeItem(key);
    if (LIBRARY_KEYS.has(key)) window.dispatchEvent(new CustomEvent("watcher_local_library_changed", { detail: { key, previousValue, value: null } }));
  },
  clear: async (): Promise<void> => {
    if (typeof window === "undefined") return;
    window.localStorage.clear();
  }
};

const LIBRARY_KEYS = new Set([
  "watchlist", "history", "favoriteArtists", "savedCollections",
  "watch_progress_v1", "user_preferences", "watcher.chat.conversations.v1",
  "watcher.chat.userMemory.v1", "watcher.chat.aiName.v1",
]);

export default AsyncStorage;
