import { AsyncStorage, clearLocalLibraryStorage, setCloudOnlyStorage } from './storage';
import axios from 'axios';
import { setGlobalConfig } from './tmdb';

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
let flushingOutbox = false;
let retryAfter = 0;
let retryDelay = 1000;
const outboxKey = (userId: string) => `watcher_sync_outbox_v1:${userId}`;
const snapshotCacheKey = (userId: string) => `watcher_cloud_snapshot_v1:${userId}`;
export const isApplyingCloudState = () => applyingCloudState;

function makeOperationId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function readOutbox(userId: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function saveCloudLibrary(library: CloudLibrary) {
  setCloudOnlyStorage(true);
  let saveOps: Promise<void>[] = [];
  applyingCloudState = true;
  try {
    saveOps = [
      AsyncStorage.setItem('watchlist', JSON.stringify(library.watchlist || [])),
      AsyncStorage.setItem('history', JSON.stringify(library.history || [])),
      AsyncStorage.setItem('favoriteArtists', JSON.stringify(library.favoriteArtists || [])),
      AsyncStorage.setItem('savedCollections', JSON.stringify(library.savedCollections || [])),
      AsyncStorage.setItem('watch_progress_v1', JSON.stringify(library.watchProgress || {})),
    ];
    if (typeof library.preferences?.nsfwFilterEnabled === 'boolean') {
      saveOps.push(AsyncStorage.setItem('settings_nsfw', JSON.stringify(library.preferences.nsfwFilterEnabled)));
    }
    if (library.aiChatData) {
      if (Array.isArray(library.aiChatData.conversations)) saveOps.push(AsyncStorage.setItem('watcher.chat.conversations.v1', JSON.stringify(library.aiChatData.conversations)));
      if (typeof library.aiChatData.userMemory === 'string') saveOps.push(AsyncStorage.setItem('watcher.chat.userMemory.v1', library.aiChatData.userMemory));
      if (typeof library.aiChatData.aiName === 'string' && library.aiChatData.aiName) saveOps.push(AsyncStorage.setItem('watcher.chat.aiName.v1', library.aiChatData.aiName));
    }
  } finally {
    applyingCloudState = false;
  }
  await Promise.all(saveOps);
  if (typeof library.preferences?.nsfwFilterEnabled === 'boolean') {
    setGlobalConfig('nsfwFilterEnabled', library.preferences.nsfwFilterEnabled);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('watcher_nsfw_setting_changed', { detail: { value: library.preferences.nsfwFilterEnabled } }));
  }
  await persistCloudSnapshot(library);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('watcher_cloud_synced', { detail: library }));
}

async function persistCloudSnapshot(library: Partial<CloudLibrary>) {
  try {
    const rawUser = await AsyncStorage.getItem('watcher_auth_user');
    const userId = rawUser ? JSON.parse(rawUser)?.userId : null;
    if (!userId) return;
    await AsyncStorage.setItem(snapshotCacheKey(userId), JSON.stringify({
      watchlist: Array.isArray(library.watchlist) ? library.watchlist : [],
      history: Array.isArray(library.history) ? library.history : [],
      favoriteArtists: Array.isArray(library.favoriteArtists) ? library.favoriteArtists : [],
      savedCollections: Array.isArray(library.savedCollections) ? library.savedCollections : [],
      preferences: library.preferences && typeof library.preferences === 'object'
        ? library.preferences
        : {},
    }));
  } catch (error) {
    console.warn('Could not save the cloud library display cache:', error);
  }
}

export const syncManager = {
  async primeCachedLibrary(userId: string) {
    try {
      const raw = await AsyncStorage.getItem(snapshotCacheKey(userId));
      const cached = raw ? JSON.parse(raw) : null;
      if (!cached || !Array.isArray(cached.watchlist) || !Array.isArray(cached.history)) return false;
      await saveCloudLibrary(cached as CloudLibrary);
      return true;
    } catch { return false; }
  },

  async prepareLocalLibraryForAccount(userId: string) {
    const owner = await AsyncStorage.getItem('watcher_local_library_owner');
    if (owner && owner !== userId) {
      setCloudOnlyStorage(false);
      clearLocalLibraryStorage();
      await AsyncStorage.removeItem('watcher_cloud_revision');
    }
    await AsyncStorage.setItem('watcher_local_library_owner', userId);
  },
  /**
   * Perform full bidirectional sync with the cloud.
   * Merges local and cloud data, saving the result to both.
   */
  async performSync(token: string, mode: 'merge' | 'replace' = 'merge'): Promise<{ success: boolean; library?: CloudLibrary; error?: string }> {
    if (!token) {
      return { success: false, error: 'No authorization token available' };
    }

    try {
      if (mode === 'merge') {
        const knownRevision = Number((await AsyncStorage.getItem('watcher_cloud_revision')) || 0);
        if (knownRevision > 0) {
          const delta = await axios.get(`${SYNC_API_BASE}/api/sync?since_revision=${knownRevision}`, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
          });
          if (Array.isArray(delta.data?.changes) && delta.data.changes.some((change: any) => change.action === 'clear' && !change.type)) {
            const snapshot = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
            if (snapshot.data?.library) {
              await saveCloudLibrary(snapshot.data.library);
              await AsyncStorage.setItem('watcher_cloud_revision', String(snapshot.data.revision || delta.data.revision || 0));
              return { success: true, library: snapshot.data.library };
            }
          }
        }
      }
      // 1. Gather all local data
      const [wStr, hStr, aStr, cStr, pStr, convStr, memStr, aiNameStr] = await Promise.all([
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('history'),
        AsyncStorage.getItem('favoriteArtists'),
        AsyncStorage.getItem('savedCollections'),
        AsyncStorage.getItem('watch_progress_v1'),
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
        aiChatData: {
          conversations: convStr ? JSON.parse(convStr) : [],
          userMemory: memStr || '',
          aiName: aiNameStr || 'Cine',
        },
        mode,
      };

      // 2. Push & merge with cloud
      let response: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          response = await axios.post(`${SYNC_API_BASE}/api/sync`, { ...localPayload, mode: mode === 'replace' ? 'replace' : 'merge' }, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, timeout: 30000,
          });
          break;
        } catch (error: any) {
          if (error?.response?.status !== 409 || attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }

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

  queueLocalChange(token: string, detail: { key?: string; previousValue?: string | null; value?: string | null }, userId = 'default') {
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
      const id = (item: any) => `${item?.media_type === 'tv' ? 'tv' : 'movie'}:${String(item?.id ?? item?.media_id ?? '')}`;
      const oldMap = new Map((Array.isArray(before) ? before : []).map((item: any) => [id(item), item]));
      const newMap = new Map((Array.isArray(after) ? after : []).map((item: any) => [id(item), item]));
      const mutations: any[] = [];
      for (const [key, item] of newMap) {
        if (!oldMap.has(key) || JSON.stringify(oldMap.get(key)) !== JSON.stringify(item)) mutations.push({ type, action: 'add', item });
      }
      for (const [key, item] of oldMap) if (!newMap.has(key)) mutations.push({ type, action: 'remove', mediaId: Number((item as any)?.id ?? key.split(':').pop()), mediaType: (item as any)?.media_type === 'tv' ? 'tv' : 'movie' });
      if (oldMap.size && !newMap.size) mutations.splice(0, mutations.length, { type, action: 'clear' });
      void this.enqueueMutations(token, userId, mutations);
    } catch (error) {
      console.warn('Could not build cloud library changes:', error);
      this.queueSync(token, 700);
    }
  },

  async enqueueMutations(token: string, userId: string, mutations: any[]) {
    if (!token || !mutations.length || applyingCloudState) return;
    const outbox = await readOutbox(userId);
    const now = Date.now();
    for (const mutation of mutations) {
      outbox.push({ ...mutation, operationId: makeOperationId(), clientTimestamp: now });
    }
    await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(outbox));
    await this.flushOutbox(token, userId);
  },

  async queueNsfwSetting(token: string | null, userId: string, enabled: boolean) {
    if (!token) return;
    await this.enqueueMutations(token, userId, [{
      type: 'preferences', action: 'set', value: { nsfwFilterEnabled: enabled },
    }]);
  },

  async flushOutbox(token: string, userId: string) {
    if (!token || flushingOutbox || Date.now() < retryAfter) return;
    flushingOutbox = true;
    try {
      let conflicts = 0;
      while (true) {
        const outbox = await readOutbox(userId);
        const operation = outbox[0];
        if (!operation) { retryAfter = 0; break; }
        try {
          await axios.post(`${SYNC_API_BASE}/api/sync`, { action: 'mutate', mutation: operation }, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
          });
          await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(outbox.slice(1)));
          retryAfter = 0;
          retryDelay = 1000;
          conflicts = 0;
        } catch (error: any) {
          const status = error?.response?.status;
          if (status === 409 && conflicts++ < 4) {
            await new Promise(resolve => setTimeout(resolve, 150 * conflicts));
            continue;
          }
          retryAfter = Date.now() + retryDelay;
          retryDelay = Math.min(30000, retryDelay * 2);
          console.warn('Cloud library edit is queued for retry:', error?.response?.data || error.message);
          break;
        }
      }
    } finally { flushingOutbox = false; }
  },

  async pullIfChanged(token: string): Promise<boolean> {
    if (!token || syncInFlight) return false;
    syncInFlight = true;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const savedRevision = await AsyncStorage.getItem('watcher_cloud_revision');
      if (Number(savedRevision || 0) <= 0) {
        setCloudOnlyStorage(true);
        const snapshot = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers, timeout: 20000 });
        if (!snapshot.data?.library) return false;
        await saveCloudLibrary(snapshot.data.library);
        await AsyncStorage.setItem('watcher_cloud_revision', String(snapshot.data.revision || 0));
        return true;
      }
      const response = await axios.get(`${SYNC_API_BASE}/api/sync?since_revision=${Number(savedRevision || 0)}`, { headers, timeout: 15000 });
      const revision = Number(response.data?.revision || 0);
      if (!revision || revision === Number(savedRevision || 0)) return false;
      const changes = response.data?.changes;
      const previousRevision = Number(savedRevision || 0);
      const completeDelta = Array.isArray(changes) && changes.length > 0 &&
        changes.length === revision - previousRevision &&
        changes.every((change: any, index: number) => change.revision === previousRevision + index + 1 && (
          (['watchlist', 'history', 'favoriteArtists', 'savedCollections'].includes(change.type) && ['add', 'remove', 'clear'].includes(change.action)) ||
          (['preferences', 'watchProgress'].includes(change.type) && change.action === 'set')
        ));
      if (response.data?.status === 'delta' && completeDelta) {
        const lists: Record<string, any[]> = {};
        const listChanges = changes.filter((change: any) => ['watchlist', 'history', 'favoriteArtists', 'savedCollections'].includes(change.type));
        const itemKey = (item: any) => `${item?.media_type === 'tv' ? 'tv' : 'movie'}:${String(item?.id ?? item?.media_id)}`;
        for (const type of new Set<string>(listChanges.map((change: any) => String(change.type)))) {
          lists[type] = JSON.parse((await AsyncStorage.getItem(type)) || '[]');
        }
        for (const change of listChanges) {
          const list = lists[change.type] || [];
          if (change.action === 'clear') lists[change.type] = [];
          else if (change.action === 'remove') lists[change.type] = list.filter((item: any) => Number(item?.id ?? item?.media_id) !== Number(change.mediaId) || (change.mediaType && (item?.media_type === 'tv' ? 'tv' : 'movie') !== change.mediaType));
          else if (change.action === 'add' && change.item) {
            lists[change.type] = [change.item, ...list.filter((item: any) => itemKey(item) !== itemKey(change.item))];
            if (change.type === 'history' && change.removesMatchingWatchlistItem) {
              const watchlist = lists.watchlist || JSON.parse((await AsyncStorage.getItem('watchlist')) || '[]');
              lists.watchlist = watchlist.filter((item: any) => itemKey(item) !== itemKey(change.item));
            }
          }
          else lists[change.type] = list;
        }
        let saveOps: Promise<void>[] = [];
        applyingCloudState = true;
        try {
          saveOps = Object.entries(lists).map(([type, list]) => AsyncStorage.setItem(type, JSON.stringify(list)));
          saveOps.push(AsyncStorage.setItem('watcher_cloud_revision', String(revision)));
        } finally { applyingCloudState = false; }
        await Promise.all(saveOps);
        for (const change of changes) {
          if (change.type === 'preferences' && change.action === 'set' && typeof change.value?.nsfwFilterEnabled === 'boolean') {
            await AsyncStorage.setItem('settings_nsfw', JSON.stringify(change.value.nsfwFilterEnabled));
            setGlobalConfig('nsfwFilterEnabled', change.value.nsfwFilterEnabled);
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('watcher_nsfw_setting_changed', { detail: { value: change.value.nsfwFilterEnabled } }));
          }
          if (change.type === 'watchProgress' && change.action === 'set' && change.value && typeof change.value === 'object') {
            await AsyncStorage.setItem('watch_progress_v1', JSON.stringify(change.value));
          }
        }
        const [watchlist, history, favoriteArtists, savedCollections] = await Promise.all([
          AsyncStorage.getItem('watchlist'), AsyncStorage.getItem('history'), AsyncStorage.getItem('favoriteArtists'), AsyncStorage.getItem('savedCollections'),
        ]);
        await persistCloudSnapshot({
          watchlist: watchlist ? JSON.parse(watchlist) : [],
          history: history ? JSON.parse(history) : [],
          favoriteArtists: favoriteArtists ? JSON.parse(favoriteArtists) : [],
          savedCollections: savedCollections ? JSON.parse(savedCollections) : [],
          preferences: {},
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('watcher_cloud_synced', { detail: { revision } }));
        }
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

  async pullFromCloud(token: string): Promise<boolean> {
    if (!token) return false;
    const knownRevision = Number((await AsyncStorage.getItem('watcher_cloud_revision')) || 0);
    if (knownRevision > 0) {
      await this.pullIfChanged(token);
      return true;
    }
    try {
      const response = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
      if (!response.data?.library) return false;
      await saveCloudLibrary(response.data.library);
      await AsyncStorage.setItem('watcher_cloud_revision', String(response.data.revision || 0));
      return true;
    } catch (error) {
      console.warn('Could not load cloud library:', error);
      return false;
    }
  },

  async syncOnStartup(token: string): Promise<boolean> {
    if (!token || syncInFlight) return false;
    const knownRevision = Number((await AsyncStorage.getItem('watcher_cloud_revision')) || 0);
    if (knownRevision > 0) return this.pullIfChanged(token);

    syncInFlight = true;
    setCloudOnlyStorage(true);
    try {
      const response = await axios.get(`${SYNC_API_BASE}/api/sync`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
      });
      if (!response.data?.library) return false;
      await saveCloudLibrary(response.data.library);
      await AsyncStorage.setItem('watcher_cloud_revision', String(response.data.revision || 0));
      await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
      return true;
    } catch (error) {
      console.warn('Could not load the signed-in cloud library on startup:', error);
      return false;
    } finally { syncInFlight = false; }
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
      await this.pullFromCloud(token);
      return true;
    } catch (err) {
      console.error('Failed to clear cloud library:', err);
      return false;
    }
  },
};

