import { AsyncStorage } from './storage';
import { syncManager } from './syncManager';

export const PROGRESS_KEY = '@watch_progress';
const LEGACY_PROGRESS_KEY = 'watch_progress_v1';
const PROGRESS_CLOUD_THROTTLE_MS = 8000;

let writeQueue = Promise.resolve();
let pendingCloudProgress: Record<string, any> | null = null;
let progressSyncTimer: ReturnType<typeof setTimeout> | null = null;
let lastProgressPushAt = 0;

export const flushPendingCloudProgressSync = async () => {
  if (progressSyncTimer) {
    clearTimeout(progressSyncTimer);
    progressSyncTimer = null;
  }
  const payload = pendingCloudProgress;
  pendingCloudProgress = null;
  lastProgressPushAt = Date.now();
  try {
    if (payload) {
      await syncManager.queueWatchProgress(payload);
    } else {
      const [token, rawUser] = await Promise.all([
        AsyncStorage.getItem('watcher_auth_token'),
        AsyncStorage.getItem('watcher_auth_user'),
      ]);
      const userId = rawUser ? JSON.parse(rawUser)?.userId : null;
      if (token && userId) {
        await syncManager.flushOutbox(token, userId);
      }
    }
  } catch (err) {
    console.warn('Could not flush watch progress:', err);
  }
};

function scheduleCloudProgressSync(payload: Record<string, any>, immediate = false) {
  pendingCloudProgress = { ...(pendingCloudProgress || {}), ...payload };
  const elapsed = Date.now() - lastProgressPushAt;
  if (immediate || elapsed >= PROGRESS_CLOUD_THROTTLE_MS) {
    if (progressSyncTimer) {
      clearTimeout(progressSyncTimer);
      progressSyncTimer = null;
    }
    const toSend = pendingCloudProgress;
    pendingCloudProgress = null;
    lastProgressPushAt = Date.now();
    if (toSend) void syncManager.queueWatchProgress(toSend);
    return;
  }
  if (!progressSyncTimer) {
    progressSyncTimer = setTimeout(() => {
      progressSyncTimer = null;
      const toSend = pendingCloudProgress;
      pendingCloudProgress = null;
      if (!toSend) return;
      lastProgressPushAt = Date.now();
      void syncManager.queueWatchProgress(toSend);
    }, PROGRESS_CLOUD_THROTTLE_MS - elapsed);
    if (typeof (progressSyncTimer as any)?.unref === 'function') {
      (progressSyncTimer as any).unref();
    }
  }
}

export interface WatchProgress {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;       
  poster: string;      
  lastSeason: number;
  lastEpisode: number; 
  position: number; 
  duration: number; 
  progress?: number;
  percentage?: number;
  completed?: boolean;
  updatedAt: number;
}

export const isEpisodeCompleted = (progress: any): boolean => {
  if (!progress) return false;
  if (progress.completed === true) return true;
  const dur = Number(progress.duration) || 0;
  const pos = Number(progress.position ?? progress.progress) || 0;
  if (dur > 0) {
    if (pos / dur >= 0.9) return true;
    if (dur - pos <= 60 && pos >= 30) return true;
  }
  const pct = Number(progress.percentage) || 0;
  if (pct >= 90) return true;
  return false;
};

// Save progress
export const saveProgress = async (progress: WatchProgress) => {
  const operation = writeQueue.then(async () => {
    try {
      const raw = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
      const history = raw ? JSON.parse(raw) : {};

      const epKey = progress.mediaType === 'tv'
        ? `${progress.mediaType}:${progress.tmdbId}:${progress.lastSeason}:${progress.lastEpisode}`
        : null;
      const previous = epKey ? history[epKey] : (history[String(progress.tmdbId)] || null);

      const dur = Number(progress.duration) > 0 
        ? Number(progress.duration) 
        : (previous?.duration ? Number(previous.duration) : 0);
      const pos = Number(progress.position) > 0 
        ? Number(progress.position) 
        : (progress.completed ? (dur || 100) : (previous?.position ? Number(previous.position) : Number(progress.position) || 0));
      const pct = dur > 0 
        ? Math.min(100, Math.max(0, (pos / dur) * 100)) 
        : (progress.percentage || (previous?.percentage || 0));
      const isCompleted = progress.completed === true || pct >= 90 || (dur > 0 && dur - pos <= 60 && pos >= 30);

      const updatedItem: WatchProgress = {
        ...previous,
        ...progress,
        position: pos,
        duration: dur,
        progress: dur > 0 ? pos / dur : (previous?.progress || 0),
        percentage: Math.round(pct * 10) / 10,
        completed: isCompleted,
        updatedAt: progress.updatedAt || Date.now(),
      };

      // Index by tmdbId for fast top-level lookup
      history[String(progress.tmdbId)] = updatedItem;

      // For TV shows, also index by specific episode
      if (progress.mediaType === 'tv' && epKey) {
        history[epKey] = updatedItem;
      }

      const serialized = JSON.stringify(history);
      await AsyncStorage.setItem(PROGRESS_KEY, serialized);
      await AsyncStorage.setItem(LEGACY_PROGRESS_KEY, serialized);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('watcher_watch_progress_changed', { detail: history }));
      }

      // Push progress mutation to cloud sync (coalesced/throttled during playback, immediate on completion)
      const payload: Record<string, any> = {
        [String(progress.tmdbId)]: {
          progress: pos,
          position: pos,
          duration: dur,
          percentage: Math.round(pct * 10) / 10,
          completed: isCompleted,
          season: progress.lastSeason,
          episode: progress.lastEpisode,
          lastSeason: progress.lastSeason,
          lastEpisode: progress.lastEpisode,
          tmdbId: progress.tmdbId,
          mediaType: progress.mediaType,
          title: progress.title,
          poster: progress.poster,
          updatedAt: updatedItem.updatedAt,
        },
      };
      if (progress.mediaType === 'tv' && epKey) {
        payload[epKey] = {
          ...updatedItem,
        };
      }
      scheduleCloudProgressSync(payload, isCompleted);
    } catch (e) {
      console.error("Failed to save progress", e);
    }
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
};

// Get progress for a specific item
export const getProgress = async (
  tmdbId: number,
  mediaType?: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<WatchProgress | null> => {
  try {
    const raw = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    if (!raw) return null;
    const history = JSON.parse(raw);

    // If specific episode requested
    if (mediaType === 'tv' && season && episode) {
      const epKey = `${mediaType}:${tmdbId}:${season}:${episode}`;
      if (history[epKey]) return history[epKey];
      return null;
    }

    // Check by tmdbId key
    const direct = history[String(tmdbId)] || history[tmdbId];
    if (direct) return direct;

    // Otherwise, find the most recently updated entry for this tmdbId
    const matching = Object.values(history)
      .filter((item: any) => item && Number(item.tmdbId) === Number(tmdbId))
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return (matching[0] as WatchProgress) || null;
  } catch (e) {
    return null;
  }
};

// Get all episode-specific progress records for a given TV show
export const getShowEpisodeProgressMap = async (tmdbId: number): Promise<Record<string, WatchProgress>> => {
  try {
    const raw = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    if (!raw) return {};
    const history = JSON.parse(raw);
    const prefix = `tv:${tmdbId}:`;
    const result: Record<string, WatchProgress> = {};
    for (const [key, value] of Object.entries(history)) {
      if (key.startsWith(prefix) && value) {
        result[key] = value as WatchProgress;
      }
    }
    return result;
  } catch (e) {
    return {};
  }
};

// Get all history as an array, sorted by most recent
export const getAllProgress = async (): Promise<WatchProgress[]> => {
  try {
    const raw = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    if (!raw) return [];
    const history = JSON.parse(raw);

    // Deduplicate by tmdbId, keeping the newest entry
    const map = new Map<number, WatchProgress>();
    for (const item of Object.values(history) as WatchProgress[]) {
      if (!item || !item.tmdbId) continue;
      const existing = map.get(item.tmdbId);
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        map.set(item.tmdbId, item);
      }
    }

    return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    return [];
  }
};

// Remove a specific item from history
export const removeProgress = async (tmdbId: number) => {
  try {
    const raw = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    if (!raw) return;
    
    const history = JSON.parse(raw);
    Object.keys(history).forEach((key) => {
      if (history[key]?.tmdbId === tmdbId || key === String(tmdbId) || key.startsWith(`movie:${tmdbId}`) || key.startsWith(`tv:${tmdbId}`)) {
        delete history[key];
      }
    });
    
    const serialized = JSON.stringify(history);
    await AsyncStorage.setItem(PROGRESS_KEY, serialized);
    await AsyncStorage.setItem(LEGACY_PROGRESS_KEY, serialized);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('watcher_watch_progress_changed', { detail: history }));
    }

    void syncManager.removeWatchProgress(tmdbId);
  } catch (e) {
    console.error("Failed to remove progress", e);
  }
};
