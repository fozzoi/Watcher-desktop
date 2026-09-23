import { AsyncStorage } from './storage';
import axios from 'axios';

const SYNC_API_BASE = 'https://watcher-api-rho.vercel.app';

export interface CloudLibrary {
  watchlist: any[];
  history: any[];
  favoriteArtists: any[];
  savedCollections: any[];
  watchProgress: Record<string, any>;
  preferences: Record<string, any>;
  aiChatData?: {
    conversations?: any[];
    userMemory?: string;
    aiName?: string;
  };
  updatedAt?: string | null;
}

let syncTimeout: any = null;

export const syncManager = {
  /**
   * Perform full bidirectional sync with the cloud.
   * Merges local and cloud data, saving the result to both.
   */
  async performSync(token: string, mode: 'merge' | 'replace' = 'merge'): Promise<{ success: boolean; library?: CloudLibrary; error?: string }> {
    if (!token) {
      return { success: false, error: 'No authorization token available' };
    }

    try {
      // 1. Gather all local data
      const [wStr, hStr, aStr, cStr, pStr, prefStr, convStr, memStr, aiNameStr] = await Promise.all([
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('history'),
        AsyncStorage.getItem('favoriteArtists'),
        AsyncStorage.getItem('savedCollections'),
        AsyncStorage.getItem('watch_progress_v1'),
        AsyncStorage.getItem('user_preferences'),
        AsyncStorage.getItem('watcher.chat.conversations.v1'),
        AsyncStorage.getItem('watcher.chat.userMemory.v1'),
        AsyncStorage.getItem('watcher.chat.aiName.v1'),
      ]);

      const localPayload = {
        watchlist: wStr ? JSON.parse(wStr) : [],
        history: hStr ? JSON.parse(hStr) : [],
        favoriteArtists: aStr ? JSON.parse(aStr) : [],
        savedCollections: cStr ? JSON.parse(cStr) : [],
        watchProgress: pStr ? JSON.parse(pStr) : {},
        preferences: prefStr ? JSON.parse(prefStr) : {},
        aiChatData: {
          conversations: convStr ? JSON.parse(convStr) : [],
          userMemory: memStr || '',
          aiName: aiNameStr || 'Cine',
        },
        mode,
      };

      // 2. Push & merge with cloud
      const response = await axios.post(`${SYNC_API_BASE}/api/sync`, localPayload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: 12000,
      });

      const mergedLibrary: CloudLibrary = response.data?.library;

      if (!mergedLibrary) {
        throw new Error('Invalid response from cloud sync server');
      }

      // 3. Save merged library back to local AsyncStorage
      const saveOps: Promise<void>[] = [
        AsyncStorage.setItem('watchlist', JSON.stringify(mergedLibrary.watchlist || [])),
        AsyncStorage.setItem('history', JSON.stringify(mergedLibrary.history || [])),
        AsyncStorage.setItem('favoriteArtists', JSON.stringify(mergedLibrary.favoriteArtists || [])),
        AsyncStorage.setItem('savedCollections', JSON.stringify(mergedLibrary.savedCollections || [])),
        AsyncStorage.setItem('watch_progress_v1', JSON.stringify(mergedLibrary.watchProgress || {})),
        AsyncStorage.setItem('user_preferences', JSON.stringify(mergedLibrary.preferences || {})),
      ];

      // Restore AI chat data if cloud returned it
      if (mergedLibrary.aiChatData) {
        if (Array.isArray(mergedLibrary.aiChatData.conversations)) {
          saveOps.push(AsyncStorage.setItem('watcher.chat.conversations.v1', JSON.stringify(mergedLibrary.aiChatData.conversations)));
        }
        if (typeof mergedLibrary.aiChatData.userMemory === 'string') {
          saveOps.push(AsyncStorage.setItem('watcher.chat.userMemory.v1', mergedLibrary.aiChatData.userMemory));
        }
        if (typeof mergedLibrary.aiChatData.aiName === 'string' && mergedLibrary.aiChatData.aiName) {
          saveOps.push(AsyncStorage.setItem('watcher.chat.aiName.v1', mergedLibrary.aiChatData.aiName));
        }
      }

      await Promise.all(saveOps);

      const now = new Date().toISOString();
      await AsyncStorage.setItem('last_cloud_sync', now);

      // 4. Notify open pages across the app to refresh state reactively
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('watcher_cloud_synced', { detail: mergedLibrary }));
      }

      return { success: true, library: mergedLibrary };
    } catch (err: any) {
      console.error('Failed to perform cloud sync:', err?.response?.data || err.message);
      return {
        success: false,
        error: err?.response?.data?.error || err.message || 'Sync failed',
      };
    }
  },

  /**
   * Debounced sync trigger. Call this whenever local library items are mutated.
   */
  queueSync(token: string, delayMs = 2500) {
    if (!token) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      this.performSync(token, 'merge');
    }, delayMs);
  },

  /**
   * Fetch current cloud library without pushing local state.
   */
  async fetchCloudLibrary(token: string): Promise<CloudLibrary | null> {
    if (!token) return null;
    try {
      const response = await axios.get(`${SYNC_API_BASE}/api/sync`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      return response.data?.library || null;
    } catch (err) {
      console.error('Failed to fetch cloud library:', err);
      return null;
    }
  },

  /**
   * Clear user's cloud library.
   */
  async clearCloudLibrary(token: string): Promise<boolean> {
    if (!token) return false;
    try {
      await axios.delete(`${SYNC_API_BASE}/api/sync`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch (err) {
      console.error('Failed to clear cloud library:', err);
      return false;
    }
  },
};

