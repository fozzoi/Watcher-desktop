// src/utils/playerPreferences.ts

import { AsyncStorage } from './storage';

const PLAYER_PREFERENCES_KEY = '@player_preferences';

export type PlayerQuality = 'auto' | '1080p' | '720p' | '480p';
export type PlayerServer = 'vidy' | 'vidlink' | 'vidsrc' | 'autoembed' | 'multiembed' | 'twoembed';

export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  audioTrack: string | null;
  subtitleTrack: string | null;
  quality: PlayerQuality;
  preferredServer: PlayerServer;
}

interface StoredPlayerPreferences {
  global?: Partial<PlayerPreferences>;
  sources?: Record<string, Partial<PlayerPreferences>>;
}

export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  volume: 1,
  muted: false,
  audioTrack: null,
  subtitleTrack: null,
  quality: 'auto',
  preferredServer: 'vidy',
};

const SERVERS: PlayerServer[] = ['vidy', 'vidlink', 'vidsrc', 'autoembed', 'multiembed', 'twoembed'];

const normalize = (prefs: Partial<PlayerPreferences>): Partial<PlayerPreferences> => ({
  ...prefs,
  ...(typeof prefs.volume === 'number'
    ? { volume: Math.max(0, Math.min(1, prefs.volume)) }
    : {}),
  ...(prefs.preferredServer && SERVERS.includes(prefs.preferredServer)
    ? { preferredServer: prefs.preferredServer }
    : {}),
});

const readStored = async (): Promise<StoredPlayerPreferences> => {
  const raw = await AsyncStorage.getItem(PLAYER_PREFERENCES_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
};

export const getPlayerPreferences = async (sourceKey?: string): Promise<PlayerPreferences> => {
  try {
    const stored = await readStored();
    return {
      ...DEFAULT_PLAYER_PREFERENCES,
      ...normalize(stored.global || {}),
      ...(sourceKey ? normalize(stored.sources?.[sourceKey] || {}) : {}),
    };
  } catch (error) {
    console.warn('Failed to load player preferences:', error);
    return DEFAULT_PLAYER_PREFERENCES;
  }
};

export const savePlayerPreferences = async (
  sourceKey: string | undefined,
  changes: Partial<PlayerPreferences>,
): Promise<PlayerPreferences> => {
  const stored = await readStored();
  const normalized = normalize(changes);
  const next: StoredPlayerPreferences = {
    ...stored,
    global: { ...stored.global, ...normalized },
    sources: sourceKey
      ? { ...stored.sources, [sourceKey]: { ...stored.sources?.[sourceKey], ...normalized } }
      : stored.sources,
  };
  await AsyncStorage.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(next));
  return getPlayerPreferences(sourceKey);
};
