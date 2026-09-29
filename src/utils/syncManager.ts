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
let syncInFlight = false;
let pendingMutations: Promise<unknown> = Promise.resolve();
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
      if (!applyingCloudState) this.performSync(token, 'merge');
    }, delayMs);
  },

  queueLocalChange(token: string, detail: { key?: string; previousValue?: string | null; value?: string | null }) {
    if (!token || applyingCloudState) return;
    const typeByKey: Record<string, string> = {
      watchlist: 'watchlist', history: 'history', favoriteArtists: 'favoriteArtists', savedCollections: 'savedCollections',
    };
    const type = detail?.key ? typeByKey[detail.key] : undefined;
    if (!type) {
      this.queueSync(token, 700);
      return;
    }
    try {
      const before = detail.previousValue ? JSON.parse(detail.previousValue) : [];
      const after = detail.value ? JSON.parse(detail.value) : [];
      const id = (item: any) => String(item?.id ?? item?.media_id ?? '');
      const oldMap = new Map((Array.isArray(before) ? before : []).map((item: any) => [id(item), item]));
      const newMap = new Map((Array.isArray(after) ? after : []).map((item: any) => [id(item), item]));
      const mutations: any[] = [];
      for (const [key, item] of newMap) {
        if (!oldMap.has(key) || JSON.stringify(oldMap.get(key)) !== JSON.stringify(item)) mutations.push({ type, action: 'add', item });
      }
      for (const key of oldMap.keys()) if (!newMap.has(key)) mutations.push({ type, action: 'remove', mediaId: Number(key) });
      if (!mutations.length && oldMap.size && !newMap.size) mutations.push({ type, action: 'clear' });
      for (const mutation of mutations) {
        pendingMutations = pendingMutations.then(async () => {
          const response = await axios.post(`${SYNC_API_BASE}/api/sync`, { action: 'mutate', mutation }, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
          });
          await AsyncStorage.setItem('watcher_cloud_revision', String(response.data?.revision || 0));
        }).catch(error => console.warn('Cloud library edit failed:', error?.response?.data || error.message));
      }
    } catch (error) {
      console.warn('Could not build cloud library changes:', error);
      this.queueSync(token, 700);
    }
  },

  async pullIfChanged(token: string): Promise<boolean> {
    if (!token || syncInFlight) return false;
    syncInFlight = true;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const savedRevision = await AsyncStorage.getItem('watcher_cloud_revision');
      const response = await axios.get(`${SYNC_API_BASE}/api/sync?since_revision=${Number(savedRevision || 0)}`, { headers, timeout: 15000 });
      const revision = Number(response.data?.revision || 0);
      if (!revision || revision === Number(savedRevision || 0)) return false;
      if (response.data?.status === 'delta' && Array.isArray(response.data.changes) && response.data.changes.every((change: any) => ['watchlist', 'history', 'favoriteArtists', 'savedCollections'].includes(change.type) && ['add', 'remove', 'clear'].includes(change.action))) {
        applyingCloudState = true;
        const lists: Record<string, any[]> = {};
        for (const change of response.data.changes) {
          const list = lists[change.type] || JSON.parse((await AsyncStorage.getItem(change.type)) || '[]');
          if (change.action === 'clear') lists[change.type] = [];
          else if (change.action === 'remove') lists[change.type] = list.filter((item: any) => Number(item?.id ?? item?.media_id) !== Number(change.mediaId));
          else if (change.action === 'add' && change.item) lists[change.type] = [change.item, ...list.filter((item: any) => String(item?.id ?? item?.media_id) !== String(change.item.id))];
          else lists[change.type] = list;
        }
        for (const [type, list] of Object.entries(lists)) await AsyncStorage.setItem(type, JSON.stringify(list));
        await AsyncStorage.setItem('watcher_cloud_revision', String(revision));
        return true;
      }
      let library = response.data?.library as CloudLibrary | undefined;
      if (!library) {
        const snapshot = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers, timeout: 20000 });
        library = snapshot.data?.library as CloudLibrary | undefined;
      }
      if (!library) return false;
      await saveCloudLibrary(library);
      await AsyncStorage.setItem('watcher_cloud_revision', String(revision));
      await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
      return true;
    } catch (err) {
      console.warn('Cloud change check failed:', err);
      return false;
    } finally {
      applyingCloudState = false;
      syncInFlight = false;
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

