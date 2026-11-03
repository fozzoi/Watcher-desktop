import { AsyncStorage } from './storage';

export const PROGRESS_KEY = '@watch_progress';
const LEGACY_PROGRESS_KEY = 'watch_progress_v1';

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
  try {
    const raw = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    const history = raw ? JSON.parse(raw) : {};

    const dur = Number(progress.duration) || 0;
    const pos = Number(progress.position) || 0;
    const pct = dur > 0 ? Math.min(100, Math.max(0, (pos / dur) * 100)) : (progress.percentage || 0);
    const isCompleted = progress.completed === true || pct >= 90 || (dur > 0 && dur - pos <= 60 && pos >= 30);

    const updatedItem: WatchProgress = {
      ...progress,
      position: pos,
      duration: dur,
      progress: dur > 0 ? pos / dur : 0,
      percentage: Math.round(pct * 10) / 10,
      completed: isCompleted,
      updatedAt: progress.updatedAt || Date.now(),
    };

    // Index by tmdbId for fast top-level lookup
    history[String(progress.tmdbId)] = updatedItem;

    // For TV shows, also index by specific episode
    if (progress.mediaType === 'tv') {
      const epKey = `${progress.mediaType}:${progress.tmdbId}:${progress.lastSeason}:${progress.lastEpisode}`;
      history[epKey] = updatedItem;
    }

    const serialized = JSON.stringify(history);
    await AsyncStorage.setItem(PROGRESS_KEY, serialized);
    await AsyncStorage.setItem(LEGACY_PROGRESS_KEY, serialized);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('watcher_watch_progress_changed', { detail: history }));
    }

    // Push progress mutation to cloud sync in background
    import('./syncManager')
      .then(({ syncManager }) => {
        syncManager.queueWatchProgress({
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
        });
      })
      .catch((err) => console.warn('Could not sync watch progress:', err));
  } catch (e) {
    console.error("Failed to save progress", e);
  }
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
  } catch (e) {
    console.error("Failed to remove progress", e);
  }
};
