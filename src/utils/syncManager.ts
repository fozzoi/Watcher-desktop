import { AsyncStorage, clearLocalLibraryStorage, setCloudOnlyStorage } from './storage';
import axios from 'axios';
import { GLOBAL_CONFIG, setGlobalConfig } from './tmdb';

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

type FlushResult = { flushed: boolean; remaining: number; error?: string };

let syncTimeout: any = null;
let applyingCloudState = false;
let outboxLock: Promise<unknown> = Promise.resolve();
let inFlightFlushPromise: Promise<FlushResult> | null = null;
let inFlightPollPromise: Promise<boolean> | null = null;
let inFlightOperationId: string | null = null;
let initialMergeInFlight = false;
let syncInFlight = false;
let retryAfter = 0;
let retryDelay = 1000;
let lastSyncError: string | null = null;
const outboxKey = (userId: string) => `watcher_sync_outbox_v1:${userId}`;
const snapshotCacheKey = (userId: string) => `watcher_cloud_snapshot_v1:${userId}`;
const revisionRepairKey = (userId: string) => `watcher_cloud_revision_repaired_v1:${userId}`;
export const isApplyingCloudState = () => applyingCloudState;

async function repairRevisionCheckpoint(userId: string | null) {
  if (!userId) return;
  const repairKey = revisionRepairKey(userId);
  if (await AsyncStorage.getItem(repairKey) !== null) return;
  // Older clients advanced this checkpoint after uploads and could skip remote
  // edits. Clearing it forces one authoritative snapshot for this account.
  await AsyncStorage.removeItem('watcher_cloud_revision');
  await AsyncStorage.setItem(repairKey, 'true');
}

function withOutboxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = outboxLock.then(fn, fn);
  outboxLock = run.catch(() => undefined);
  return run;
}

function makeOperationId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeMediaType(item: any): 'movie' | 'tv' | 'collection' {
  if (item?.media_type === 'tv') return 'tv';
  if (item?.media_type === 'collection') return 'collection';
  if (item?.media_type === 'movie') return 'movie';
  return item?.first_air_date && !item?.release_date ? 'tv' : 'movie';
}

function libraryItemKey(item: any) {
  return `${normalizeMediaType(item)}:${String(item?.id ?? item?.media_id ?? '')}`;
}

function mergeWatchProgressMaps(localProg: Record<string, any>, remoteProg: Record<string, any>) {
  const merged: Record<string, any> = { ...(localProg || {}) };
  for (const [k, v] of Object.entries(remoteProg || {})) {
    if (!v || typeof v !== 'object') continue;
    const localVal: any = merged[k];
    const rTime = Number((v as any).updatedAt || (v as any).timestamp || 0);
    const lTime = Number(localVal?.updatedAt || localVal?.timestamp || 0);
    if (!localVal || rTime >= lTime) {
      merged[k] = v;
    }
  }
  return merged;
}

function removeWatchProgressEntries(localProg: Record<string, any>, mediaId: number) {
  const next: Record<string, any> = { ...(localProg || {}) };
  const targetId = Number(mediaId);
  const idPrefix = String(targetId);
  for (const [key, val] of Object.entries(next)) {
    if (
      key === idPrefix ||
      key.startsWith(`movie:${idPrefix}`) ||
      key.startsWith(`tv:${idPrefix}:`) ||
      Number((val as any)?.tmdbId) === targetId
    ) {
      delete next[key];
    }
  }
  return next;
}

async function resolveUserId(userId?: string): Promise<string | null> {
  if (userId && userId !== 'default') return userId;
  try {
    const rawUser = await AsyncStorage.getItem('watcher_auth_user');
    const parsed = rawUser ? JSON.parse(rawUser)?.userId : null;
    return parsed || userId || null;
  } catch {
    return userId || null;
  }
}

async function readOutbox(userId: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function writeOutbox(userId: string, outbox: any[]): Promise<void> {
  await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(outbox));
}

async function handleUnauthorizedSession() {
  try {
    const rawUser = await AsyncStorage.getItem('watcher_auth_user');
    const parsedUserId = rawUser ? JSON.parse(rawUser)?.userId : null;
    if (parsedUserId) {
      await AsyncStorage.setItem('watcher_local_library_owner', parsedUserId);
    }
  } catch {}
  setCloudOnlyStorage(false);
  await Promise.all([
    AsyncStorage.removeItem('watcher_auth_token'),
    AsyncStorage.removeItem('watcher_auth_user'),
  ]);
  retryAfter = 0;
  retryDelay = 1000;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('watcher_auth_expired'));
  }
}

async function persistCloudSnapshot(library: Partial<CloudLibrary>, explicitUserId?: string) {
  try {
    const userId = await resolveUserId(explicitUserId);
    if (!userId) return;
    await AsyncStorage.setItem(snapshotCacheKey(userId), JSON.stringify({
      watchlist: Array.isArray(library.watchlist) ? library.watchlist : [],
      history: Array.isArray(library.history) ? library.history : [],
      favoriteArtists: Array.isArray(library.favoriteArtists) ? library.favoriteArtists : [],
      savedCollections: Array.isArray(library.savedCollections) ? library.savedCollections : [],
      watchProgress: library.watchProgress && typeof library.watchProgress === 'object' ? library.watchProgress : {},
      preferences: library.preferences && typeof library.preferences === 'object'
        ? library.preferences
        : {},
    }));
  } catch (error) {
    console.warn('Could not save the cloud library display cache:', error);
  }
}

async function persistCurrentSnapshot(explicitUserId?: string) {
  try {
    const [wStr, hStr, aStr, cStr, pStr, nsfwStr] = await Promise.all([
      AsyncStorage.getItem('watchlist'),
      AsyncStorage.getItem('history'),
      AsyncStorage.getItem('favoriteArtists'),
      AsyncStorage.getItem('savedCollections'),
      AsyncStorage.getItem('@watch_progress').then(res => res || AsyncStorage.getItem('watch_progress_v1')),
      AsyncStorage.getItem('settings_nsfw'),
    ]);
    const preferences: Record<string, any> = {};
    if (nsfwStr !== null) {
      try { preferences.nsfwFilterEnabled = JSON.parse(nsfwStr) === true; } catch {}
    } else {
      preferences.nsfwFilterEnabled = GLOBAL_CONFIG.nsfwFilterEnabled;
    }
    await persistCloudSnapshot({
      watchlist: wStr ? JSON.parse(wStr) : [],
      history: hStr ? JSON.parse(hStr) : [],
      favoriteArtists: aStr ? JSON.parse(aStr) : [],
      savedCollections: cStr ? JSON.parse(cStr) : [],
      watchProgress: pStr ? JSON.parse(pStr) : {},
      preferences,
    }, explicitUserId);
  } catch (error) {
    console.warn('Could not refresh cloud display snapshot:', error);
  }
}

async function saveCloudLibrary(library: CloudLibrary, options?: { replaceProgress?: boolean }) {
  setCloudOnlyStorage(true);
  applyingCloudState = true;
  try {
    let mergedProg: Record<string, any> = {};
    const remoteProg = (library.watchProgress && typeof library.watchProgress === 'object') ? library.watchProgress : {};
    if (options?.replaceProgress) {
      mergedProg = remoteProg;
    } else {
      const localRaw = (await AsyncStorage.getItem('@watch_progress')) || (await AsyncStorage.getItem('watch_progress_v1'));
      let localProg: Record<string, any> = {};
      try { localProg = localRaw ? JSON.parse(localRaw) : {}; } catch { localProg = {}; }
      mergedProg = mergeWatchProgressMaps(localProg, remoteProg);
    }
    const progJson = JSON.stringify(mergedProg);

    const saveOps: Promise<void>[] = [
      AsyncStorage.setItem('watchlist', JSON.stringify(library.watchlist || [])),
      AsyncStorage.setItem('history', JSON.stringify(library.history || [])),
      AsyncStorage.setItem('favoriteArtists', JSON.stringify(library.favoriteArtists || [])),
      AsyncStorage.setItem('savedCollections', JSON.stringify(library.savedCollections || [])),
      AsyncStorage.setItem('@watch_progress', progJson),
      AsyncStorage.setItem('watch_progress_v1', progJson),
    ];
    if (typeof library.preferences?.nsfwFilterEnabled === 'boolean') {
      saveOps.push(AsyncStorage.setItem('settings_nsfw', JSON.stringify(library.preferences.nsfwFilterEnabled)));
    }
    if (library.aiChatData) {
      if (Array.isArray(library.aiChatData.conversations)) saveOps.push(AsyncStorage.setItem('watcher.chat.conversations.v1', JSON.stringify(library.aiChatData.conversations)));
      if (typeof library.aiChatData.userMemory === 'string') saveOps.push(AsyncStorage.setItem('watcher.chat.userMemory.v1', library.aiChatData.userMemory));
      if (typeof library.aiChatData.aiName === 'string' && library.aiChatData.aiName) saveOps.push(AsyncStorage.setItem('watcher.chat.aiName.v1', library.aiChatData.aiName));
    }
    await Promise.all(saveOps);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('watcher_watch_progress_changed', { detail: mergedProg }));
    }
  } finally {
    applyingCloudState = false;
  }
  if (typeof library.preferences?.nsfwFilterEnabled === 'boolean') {
    setGlobalConfig('nsfwFilterEnabled', library.preferences.nsfwFilterEnabled);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('watcher_nsfw_setting_changed', { detail: { value: library.preferences.nsfwFilterEnabled } }));
  }
  await persistCloudSnapshot(library);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('watcher_cloud_synced', { detail: library }));
}

export const syncManager = {
  getLastSyncError() {
    return lastSyncError;
  },

  async primeCachedLibrary(userId: string) {
    try {
      const raw = await AsyncStorage.getItem(snapshotCacheKey(userId));
      const cached = raw ? JSON.parse(raw) : null;
      if (!cached || !Array.isArray(cached.watchlist) || !Array.isArray(cached.history)) return false;
      await saveCloudLibrary(cached as CloudLibrary);
      return true;
    } catch { return false; }
  },

  async hasPendingOutbox(userId: string): Promise<boolean> {
    const resolved = await resolveUserId(userId);
    if (!resolved) return false;
    const outbox = await readOutbox(resolved);
    return outbox.length > 0;
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
    if (initialMergeInFlight) {
      return { success: false, error: 'Library sync is already in progress' };
    }
    initialMergeInFlight = true;

    try {
      const resolvedUserId = await resolveUserId();
      if (mode === 'merge' && resolvedUserId) {
        await outboxLock;
        const flushRes = await this.flushOutbox(token, resolvedUserId, { ignoreBackoff: true });
        if (!flushRes.flushed && flushRes.remaining > 0) {
          return { success: false, error: flushRes.error || 'Pending edits could not be flushed yet' };
        }
      }

      if (mode === 'merge') {
        const knownRevision = Number((await AsyncStorage.getItem('watcher_cloud_revision')) || 0);
        if (knownRevision > 0) {
          const delta = await axios.get(`${SYNC_API_BASE}/api/sync?since_revision=${knownRevision}`, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
          });
          if (Array.isArray(delta.data?.changes) && delta.data.changes.some((change: any) => change.action === 'clear' && !change.type)) {
            const snapshot = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
            if (snapshot.data?.library) {
              await saveCloudLibrary(snapshot.data.library, { replaceProgress: true });
              await AsyncStorage.setItem('watcher_cloud_revision', String(snapshot.data.revision || delta.data.revision || 0));
              return { success: true, library: snapshot.data.library };
            }
          }
        }
      }
      // 1. Gather all local data
      const [wStr, hStr, aStr, cStr, pStr, convStr, memStr, aiNameStr, nsfwStr] = await Promise.all([
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('history'),
        AsyncStorage.getItem('favoriteArtists'),
        AsyncStorage.getItem('savedCollections'),
        AsyncStorage.getItem('@watch_progress').then(res => res || AsyncStorage.getItem('watch_progress_v1')),
        AsyncStorage.getItem('watcher.chat.conversations.v1'),
        AsyncStorage.getItem('watcher.chat.userMemory.v1'),
        AsyncStorage.getItem('watcher.chat.aiName.v1'),
        AsyncStorage.getItem('settings_nsfw'),
      ]);

      const localPayload: Record<string, any> = {
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
      if (nsfwStr !== null) {
        try {
          localPayload.preferences = { nsfwFilterEnabled: JSON.parse(nsfwStr) === true };
        } catch {}
      }

      // 2. Push & merge with cloud
      let response: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          response = await axios.post(`${SYNC_API_BASE}/api/sync`, { ...localPayload, mode: mode === 'replace' ? 'replace' : 'merge' }, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, timeout: 30000,
          });
          break;
        } catch (error: any) {
          if (error?.response?.status === 401) {
            await handleUnauthorizedSession();
            throw error;
          }
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
    } finally {
      initialMergeInFlight = false;
    }
  },

  /**
   * Debounced sync trigger (only for explicit snapshot sync fallback).
   */
  queueSync(token: string, delayMs = 2500) {
    if (!token) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      if (!applyingCloudState) void this.performSync(token, 'merge');
    }, delayMs);
  },

  queueLocalChange(token: string, detail: { key?: string; previousValue?: string | null; value?: string | null }, userId = 'default') {
    if (!token || applyingCloudState) return;
    const typeByKey: Record<string, string> = {
      watchlist: 'watchlist', history: 'history', favoriteArtists: 'favoriteArtists', savedCollections: 'savedCollections',
    };
    const type = detail?.key ? typeByKey[detail.key] : undefined;
    // Ignore non-list keys here (progress & chat are handled separately so they never trigger snapshot storms).
    if (!type) return;

    try {
      const before = detail.previousValue ? JSON.parse(detail.previousValue) : [];
      const after = detail.value ? JSON.parse(detail.value) : [];
      const oldMap = new Map((Array.isArray(before) ? before : []).map((item: any) => [libraryItemKey(item), item]));
      const newMap = new Map((Array.isArray(after) ? after : []).map((item: any) => [libraryItemKey(item), item]));
      const mutations: any[] = [];
      for (const [key, item] of newMap) {
        if (!oldMap.has(key) || JSON.stringify(oldMap.get(key)) !== JSON.stringify(item)) {
          mutations.push({ type, action: 'add', item });
        }
      }
      for (const [key, item] of oldMap) {
        if (!newMap.has(key)) {
          const mediaId = Number((item as any)?.id ?? (item as any)?.media_id ?? key.split(':').pop());
          if (Number.isFinite(mediaId) && mediaId > 0) {
            mutations.push({
              type,
              action: 'remove',
              mediaId,
              ...(type === 'watchlist' || type === 'history' ? { mediaType: normalizeMediaType(item) } : {}),
            });
          }
        }
      }
      // Only collapse to 'clear' when multiple items were wiped at once; single-item removal must stay 'remove'.
      if (oldMap.size > 1 && !newMap.size) {
        mutations.splice(0, mutations.length, { type, action: 'clear' });
      }
      void this.enqueueMutations(token, userId, mutations);
    } catch (error) {
      console.warn('Could not build cloud library changes:', error);
    }
  },

  async enqueueMutations(token: string, userId: string, mutations: any[]) {
    if (!token || !mutations.length || applyingCloudState) return;
    const resolvedUserId = await resolveUserId(userId);
    if (!resolvedUserId) return;

    await withOutboxLock(async () => {
      const outbox = await readOutbox(resolvedUserId);
      const now = Date.now();
      for (const mutation of mutations) {
        if (!mutation || !mutation.type) continue;
        if (mutation.action === 'set' && (mutation.type === 'watchProgress' || mutation.type === 'preferences')) {
          const idx = outbox.findIndex(
            (op: any) =>
              op &&
              op.type === mutation.type &&
              op.action === 'set' &&
              op.operationId !== inFlightOperationId
          );
          if (idx >= 0) {
            const prev = outbox[idx];
            const mergedValue = mutation.type === 'watchProgress'
              ? mergeWatchProgressMaps(prev.value || {}, mutation.value || {})
              : { ...(prev.value || {}), ...(mutation.value || {}) };
            outbox[idx] = {
              ...mutation,
              value: mergedValue,
              operationId: makeOperationId(),
              clientTimestamp: now,
            };
            continue;
          }
        }
        outbox.push({ ...mutation, operationId: makeOperationId(), clientTimestamp: now });
      }
      await writeOutbox(resolvedUserId, outbox);
      await persistCurrentSnapshot(resolvedUserId);
    });

    await this.flushOutbox(token, resolvedUserId);
  },

  async queueNsfwSetting(token: string | null, userId: string, enabled: boolean) {
    if (!token) return;
    await this.enqueueMutations(token, userId, [{
      type: 'preferences', action: 'set', value: { nsfwFilterEnabled: enabled },
    }]);
  },

  async queueWatchProgress(progressPayload: Record<string, any>) {
    try {
      const [token, rawUser] = await Promise.all([
        AsyncStorage.getItem('watcher_auth_token'),
        AsyncStorage.getItem('watcher_auth_user'),
      ]);
      const userId = rawUser ? JSON.parse(rawUser)?.userId : null;
      if (!token || !userId) return;
      await this.enqueueMutations(token, userId, [{
        type: 'watchProgress', action: 'set', value: progressPayload,
      }]);
    } catch (err) {
      console.warn('Could not queue watchProgress sync:', err);
    }
  },

  async removeWatchProgress(tmdbId: number) {
    try {
      const [token, rawUser] = await Promise.all([
        AsyncStorage.getItem('watcher_auth_token'),
        AsyncStorage.getItem('watcher_auth_user'),
      ]);
      const userId = rawUser ? JSON.parse(rawUser)?.userId : null;
      if (!token || !userId || !Number.isFinite(Number(tmdbId))) return;
      await this.enqueueMutations(token, userId, [{
        type: 'watchProgress', action: 'remove', mediaId: Number(tmdbId),
      }]);
    } catch (err) {
      console.warn('Could not queue watchProgress removal sync:', err);
    }
  },

  async flushOutbox(token: string, userId: string, options?: { ignoreBackoff?: boolean }): Promise<FlushResult> {
    if (!token) return { flushed: false, remaining: 0, error: 'No authorization token available' };
    if (inFlightFlushPromise) return inFlightFlushPromise;

    const resolvedUserId = await resolveUserId(userId);
    if (!resolvedUserId) return { flushed: false, remaining: 0, error: 'Missing user identity' };

    const ignoreBackoff = options?.ignoreBackoff === true;
    if (!ignoreBackoff && Date.now() < retryAfter) {
      const remaining = (await readOutbox(resolvedUserId)).length;
      return { flushed: remaining === 0, remaining };
    }

    const run = (async (): Promise<FlushResult> => {
      let conflicts = 0;
      try {
        while (true) {
          const operation = await withOutboxLock(async () => {
            const outbox = await readOutbox(resolvedUserId);
            const sanitized = outbox.filter((op: any) => op && op.type && op.type !== 'tasteTelemetry');
            if (sanitized.length !== outbox.length) {
              await writeOutbox(resolvedUserId, sanitized);
            }
            return sanitized[0] || null;
          });

          if (!operation) {
            retryAfter = 0;
            retryDelay = 1000;
            return { flushed: true, remaining: 0 };
          }

          inFlightOperationId = operation.operationId;
          try {
            const response = await axios.post(`${SYNC_API_BASE}/api/sync`, { action: 'mutate', mutation: operation }, {
              headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
            });
            await withOutboxLock(async () => {
              const current = await readOutbox(resolvedUserId);
              const next = current.filter((op: any) => op?.operationId !== operation.operationId);
              await writeOutbox(resolvedUserId, next);
            });

            // Do not advance the applied revision from a mutation response. Other
            // devices may have written earlier revisions that this client still
            // needs to pull and apply, along with any server side effects.

            retryAfter = 0;
            retryDelay = 1000;
            conflicts = 0;
          } catch (error: any) {
            const status = error?.response?.status;
            if (status === 400) {
              console.warn('Dropping invalid cloud mutation from queue:', operation?.type, error?.response?.data);
              await withOutboxLock(async () => {
                const current = await readOutbox(resolvedUserId);
                const next = current.filter((op: any) => op?.operationId !== operation.operationId);
                await writeOutbox(resolvedUserId, next);
              });
              conflicts = 0;
              continue;
            }
            if (status === 401) {
              await handleUnauthorizedSession();
              return { flushed: false, remaining: 0, error: 'Session expired. Please sign in again.' };
            }
            if (status === 409 && conflicts++ < 4) {
              await new Promise(resolve => setTimeout(resolve, 150 * conflicts));
              continue;
            }
            retryAfter = Date.now() + retryDelay;
            retryDelay = Math.min(30000, retryDelay * 2);
            const message = error?.response?.data?.error || error.message || 'Cloud sync failed';
            console.warn('Cloud library edit is queued for retry:', error?.response?.data || error.message);
            const remaining = await withOutboxLock(async () => (await readOutbox(resolvedUserId)).length);
            return { flushed: false, remaining, error: message };
          } finally {
            inFlightOperationId = null;
          }
        }
      } finally {
        inFlightOperationId = null;
        await persistCurrentSnapshot(resolvedUserId);
      }
    })();

    inFlightFlushPromise = run;
    try {
      return await run;
    } finally {
      if (inFlightFlushPromise === run) inFlightFlushPromise = null;
    }
  },

  async pullIfChanged(token: string, userId?: string): Promise<boolean> {
    if (!token || initialMergeInFlight) return false;
    if (inFlightPollPromise) return inFlightPollPromise;

    const run = (async (): Promise<boolean> => {
      syncInFlight = true;
      try {
        const resolvedUserId = await resolveUserId(userId);
        if (resolvedUserId) {
          await outboxLock;
          const flushRes = await this.flushOutbox(token, resolvedUserId);
          if (!flushRes.flushed || flushRes.remaining > 0) {
            // Do not overwrite local unsynced changes with a cloud snapshot while outbox is dirty.
            lastSyncError = flushRes.error || 'Pending local edits could not be uploaded yet.';
            return false;
          }
        }

        await repairRevisionCheckpoint(resolvedUserId);

        const headers = { Authorization: `Bearer ${token}` };
        const savedRevision = await AsyncStorage.getItem('watcher_cloud_revision');
        if (savedRevision === null) {
          setCloudOnlyStorage(true);
          const snapshot = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers, timeout: 20000 });
          if (!snapshot.data?.library) return false;
          await saveCloudLibrary(snapshot.data.library);
          await AsyncStorage.setItem('watcher_cloud_revision', String(snapshot.data.revision || 0));
          await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
          return true;
        }
        const previousRevision = Number(savedRevision || 0);
        const response = await axios.get(`${SYNC_API_BASE}/api/sync?since_revision=${previousRevision}`, { headers, timeout: 15000 });
        const revision = Number(response.data?.revision || 0);
        if (!revision || revision <= previousRevision) return false;

        const changes = response.data?.changes;
        const completeDelta = Array.isArray(changes) && changes.length > 0 &&
          changes.length === revision - previousRevision &&
          changes.every((change: any, index: number) => change.revision === previousRevision + index + 1 && (
            (['watchlist', 'history', 'favoriteArtists', 'savedCollections'].includes(change.type) && ['add', 'remove', 'clear'].includes(change.action)) ||
            (change.type === 'preferences' && change.action === 'set') ||
            (change.type === 'watchProgress' && ['set', 'remove'].includes(change.action))
          ));

        if (response.data?.status === 'delta' && completeDelta) {
          const lists: Record<string, any[]> = {};
          const listChanges = changes.filter((change: any) => ['watchlist', 'history', 'favoriteArtists', 'savedCollections'].includes(change.type));
          for (const type of new Set<string>(listChanges.map((change: any) => String(change.type)))) {
            lists[type] = JSON.parse((await AsyncStorage.getItem(type)) || '[]');
          }
          for (const change of listChanges) {
            const list = lists[change.type] || [];
            if (change.action === 'clear') {
              lists[change.type] = [];
            } else if (change.action === 'remove') {
              const targetId = Number(change.mediaId);
              const isMediaList = change.type === 'watchlist' || change.type === 'history';
              lists[change.type] = list.filter((item: any) => {
                if (Number(item?.id ?? item?.media_id) !== targetId) return true;
                if (!isMediaList || !change.mediaType) return false;
                return normalizeMediaType(item) !== change.mediaType;
              });
            } else if (change.action === 'add' && change.item) {
              lists[change.type] = [change.item, ...list.filter((item: any) => libraryItemKey(item) !== libraryItemKey(change.item))];
              if (change.type === 'history' && change.removesMatchingWatchlistItem) {
                const watchlist = lists.watchlist || JSON.parse((await AsyncStorage.getItem('watchlist')) || '[]');
                lists.watchlist = watchlist.filter((item: any) => libraryItemKey(item) !== libraryItemKey(change.item));
              }
            }
          }

          let updatedNsfw: boolean | null = null;
          let updatedProgress: Record<string, any> | null = null;
          const progressChanges = changes.filter((c: any) => c.type === 'watchProgress');
          if (progressChanges.length > 0) {
            const rawCurrent = (await AsyncStorage.getItem('@watch_progress')) || (await AsyncStorage.getItem('watch_progress_v1'));
            let workingProg: Record<string, any> = rawCurrent ? JSON.parse(rawCurrent) : {};
            for (const change of progressChanges) {
              if (change.action === 'set' && change.value && typeof change.value === 'object') {
                workingProg = mergeWatchProgressMaps(workingProg, change.value);
              } else if (change.action === 'remove' && Number.isFinite(Number(change.mediaId))) {
                workingProg = removeWatchProgressEntries(workingProg, Number(change.mediaId));
              }
            }
            updatedProgress = workingProg;
          }

          for (const change of changes) {
            if (change.type === 'preferences' && change.action === 'set' && typeof change.value?.nsfwFilterEnabled === 'boolean') {
              updatedNsfw = change.value.nsfwFilterEnabled;
            }
          }

          applyingCloudState = true;
          try {
            const saveOps: Promise<void>[] = Object.entries(lists).map(([type, list]) =>
              AsyncStorage.setItem(type, JSON.stringify(list))
            );
            saveOps.push(AsyncStorage.setItem('watcher_cloud_revision', String(revision)));
            if (updatedNsfw !== null) {
              saveOps.push(AsyncStorage.setItem('settings_nsfw', JSON.stringify(updatedNsfw)));
            }
            if (updatedProgress !== null) {
              const jsonStr = JSON.stringify(updatedProgress);
              saveOps.push(AsyncStorage.setItem('watch_progress_v1', jsonStr));
              saveOps.push(AsyncStorage.setItem('@watch_progress', jsonStr));
            }
            await Promise.all(saveOps);
          } finally {
            applyingCloudState = false;
          }

          if (updatedNsfw !== null) {
            setGlobalConfig('nsfwFilterEnabled', updatedNsfw);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('watcher_nsfw_setting_changed', { detail: { value: updatedNsfw } }));
            }
          }
          if (updatedProgress !== null && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('watcher_watch_progress_changed', { detail: updatedProgress }));
          }

          await persistCurrentSnapshot(resolvedUserId || undefined);
          await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('watcher_cloud_synced', { detail: { revision } }));
          }
          return true;
        }

        let library = response.data?.library as CloudLibrary | undefined;
        let finalRevision = revision;
        if (!library) {
          const snapshot = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers, timeout: 20000 });
          library = snapshot.data?.library as CloudLibrary | undefined;
          finalRevision = Number(snapshot.data?.revision || revision);
        }
        if (!library) return false;
        const isFullReset = Array.isArray(changes) && changes.some((c: any) => c.action === 'clear' && !c.type);
        await saveCloudLibrary(library, { replaceProgress: isFullReset });
        await AsyncStorage.setItem('watcher_cloud_revision', String(finalRevision));
        await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
        return true;
      } catch (err: any) {
        if (err?.response?.status === 401) {
          await handleUnauthorizedSession();
        }
        lastSyncError = err?.response?.data?.error || err?.message || 'Cloud sync check failed.';
        console.warn('Cloud change check failed:', err);
        return false;
      } finally {
        applyingCloudState = false;
        syncInFlight = false;
      }
    })();

    inFlightPollPromise = run;
    try {
      return await run;
    } finally {
      if (inFlightPollPromise === run) inFlightPollPromise = null;
    }
  },

  async pullFromCloud(token: string, userId?: string, options?: { ignoreBackoff?: boolean }): Promise<boolean> {
    lastSyncError = null;
    if (!token) {
      lastSyncError = 'Sign in to sync with the cloud.';
      return false;
    }
    const resolvedUserId = await resolveUserId(userId);
    if (resolvedUserId) {
      await outboxLock;
      const flushRes = await this.flushOutbox(token, resolvedUserId, { ignoreBackoff: options?.ignoreBackoff ?? true });
      if (!flushRes.flushed || flushRes.remaining > 0) {
        lastSyncError = flushRes.error || 'Pending local edits could not be uploaded yet.';
        return false;
      }
    }
    await repairRevisionCheckpoint(resolvedUserId);
    const savedRevision = await AsyncStorage.getItem('watcher_cloud_revision');
    if (savedRevision !== null) {
      const knownRevision = Number(savedRevision || 0);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const preflight = await axios.get(`${SYNC_API_BASE}/api/sync?since_revision=${knownRevision}`, { headers, timeout: 15000 });
        const remoteRev = Number(preflight.data?.revision || 0);
        if (remoteRev === knownRevision) {
          await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
          return true;
        }
      } catch (err: any) {
        if (err?.response?.status === 401) await handleUnauthorizedSession();
        lastSyncError = err?.response?.data?.error || err?.message || 'Could not check the cloud revision.';
        return false;
      }
      const success = await this.pullIfChanged(token, resolvedUserId || undefined);
      if (!success && !lastSyncError) lastSyncError = 'Cloud changes could not be applied.';
      return success;
    }
    try {
      const response = await axios.get(`${SYNC_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
      if (!response.data?.library) {
        lastSyncError = 'The cloud response did not include a library.';
        return false;
      }
      await saveCloudLibrary(response.data.library);
      await AsyncStorage.setItem('watcher_cloud_revision', String(response.data.revision || 0));
      await AsyncStorage.setItem('last_cloud_sync', new Date().toISOString());
      return true;
    } catch (error: any) {
      if (error?.response?.status === 401) await handleUnauthorizedSession();
      lastSyncError = error?.response?.data?.error || error?.message || 'Could not load the cloud library.';
      console.warn('Could not load cloud library:', error);
      return false;
    }
  },

  async syncOnStartup(token: string, userId?: string): Promise<boolean> {
    if (!token || initialMergeInFlight) return false;
    const resolvedUserId = await resolveUserId(userId);
    if (resolvedUserId) {
      await outboxLock;
      const flushRes = await this.flushOutbox(token, resolvedUserId);
      if (!flushRes.flushed && flushRes.remaining > 0) {
        return false;
      }
    }

    await repairRevisionCheckpoint(resolvedUserId);

    const savedRevision = await AsyncStorage.getItem('watcher_cloud_revision');
    if (savedRevision !== null) return this.pullIfChanged(token, resolvedUserId || undefined);

    if (syncInFlight) return false;
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
    } catch (error: any) {
      if (error?.response?.status === 401) await handleUnauthorizedSession();
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
      const resolvedUserId = await resolveUserId();
      if (resolvedUserId) {
        await withOutboxLock(async () => {
          await writeOutbox(resolvedUserId, []);
        });
      }
      const response = await axios.delete(`${SYNC_API_BASE}/api/sync`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rev = Number(response.data?.revision || 0);
      await saveCloudLibrary({
        watchlist: [],
        history: [],
        favoriteArtists: [],
        savedCollections: [],
        watchProgress: {},
        preferences: {},
        aiChatData: undefined,
      }, { replaceProgress: true });
      await AsyncStorage.setItem('watcher_cloud_revision', String(rev));
      return true;
    } catch (err: any) {
      if (err?.response?.status === 401) await handleUnauthorizedSession();
      console.error('Failed to clear cloud library:', err);
      return false;
    }
  },
};
