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
let applyingCloudState = false;
export const isApplyingCloudState = () => applyingCloudState;

async function saveCloudLibrary(library: CloudLibrary) {
  applyingCloudState = true;
  try {
    const saveOps: Promise<void>[] = [
      AsyncStorage.setItem('watchlist', JSON.stringify(library.watchlist || [])),
      AsyncStorage.setItem('history', JSON.stringify(library.history || [])),
      AsyncStorage.setItem('favoriteArtists', JSON.stringify(library.favoriteArtists || [])),
      AsyncStorage.setItem('savedCollections', JSON.stringify(library.savedCollections || [])),
      AsyncStorage.setItem('watch_progress_v1', JSON.stringify(library.watchProgress || {})),
      AsyncStorage.setItem('user_preferences', JSON.stringify(library.preferences || {})),
    ];
    if (library.aiChatData) {
      if (Array.isArray(library.aiChatData.conversations)) saveOps.push(AsyncStorage.setItem('watcher.chat.conversations.v1', JSON.stringify(library.aiChatData.conversations)));
      if (typeof library.aiChatData.userMemory === 'string') saveOps.push(AsyncStorage.setItem('watcher.chat.userMemory.v1', library.aiChatData.userMemory));
      if (typeof library.aiChatData.aiName === 'string' && library.aiChatData.aiName) saveOps.push(AsyncStorage.setItem('watcher.chat.aiName.v1', library.aiChatData.aiName));
    }
    await Promise.all(saveOps);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('watcher_cloud_synced', { detail: library }));
  } finally {
    applyingCloudState = false;
  }
}

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
      const response = await axios.post(`${SYNC_API_BASE}/api/sync`, { ...localPayload, mode: mode === 'replace' ? 'replace' : 'merge' }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: 30000,
      });

      const mergedLibrary: CloudLibrary = response.data?.library;

      if (!mergedLibrary) {
        throw new Error('Invalid response from cloud sync server');
      }

      await saveCloudLibrary(mergedLibrary);
      await AsyncStorage.setItem('watcher_cloud_revision', String(response.data?.revision || 0));

      const now = new Date().toISOString();
      await AsyncStorage.setItem('last_cloud_sync', now);

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
      if (!applyingCloudState) this.performSync(token, 'replace');
    }, delayMs);
  },

  async pullIfChanged(token: string): Promise<boolean> {
    if (!token) return false;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [revisionResponse, savedRevision] = await Promise.all([
        axios.get(`${SYNC_API_BASE}/api/sync?version_only=true`, { headers, timeout: 12000 }),
        AsyncStorage.getItem('watcher_cloud_revision'),
      ]);
      const revision = Number(revisionResponse.data?.revision || 0);
      if (!revision || revision === Number(savedRevision || 0)) return false;
      const response = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers, timeout: 20000 });
      const library = response.data?.library as CloudLibrary | undefined;
      if (!library) return false;
      await saveCloudLibrary(library);
      await AsyncStorage.setItem('watcher_cloud_revision', String(response.data?.revision || revision));
      await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
      return true;
    } catch (err) {
      console.warn('Cloud change check failed:', err);
      return false;
    }
  },

  /**
   * Fetch current cloud library without pushing local state.
   */
  async fetchCloudLibrary(token: string): Promise<CloudLibrary | null> {
    if (!token) return null;
    try {
      const response = await axios.get(`${SYNC_API_BASE}/api/sync`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
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
      const response = await axios.delete(`${SYNC_API_BASE}/api/sync`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.revision) {
        await AsyncStorage.setItem('watcher_cloud_revision', String(response.data.revision));
      }
      return true;
    } catch (err) {
      console.error('Failed to clear cloud library:', err);
      return false;
    }
  },
};

