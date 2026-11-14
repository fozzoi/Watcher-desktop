import { getMediaCredits } from './tmdb';

export interface CompactActor {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface ActorStat {
  name: string;
  count: number;
  id?: number;
  profile_path?: string | null;
}

const CAST_INDEX_KEY = 'watcher_media_cast_index_v1';
let memoryCastIndex: Record<string, CompactActor[]> | null = null;

/**
 * Loads the client-side persistent cast index from localStorage.
 * Also scavenges already-cached TMDB responses to warm the index with zero network overhead.
 */
export function getStoredCastIndex(): Record<string, CompactActor[]> {
  if (memoryCastIndex) {
    return memoryCastIndex;
  }

  const index: Record<string, CompactActor[]> = {};

  if (typeof window === 'undefined') {
    return index;
  }

  try {
    const raw = window.localStorage.getItem(CAST_INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v) && v.length > 0) {
            index[k] = v as CompactActor[];
          }
        }
      }
    }
  } catch (e) {
    console.warn('[CastIndex] Failed to parse stored cast index:', e);
  }

  // Pre-seed from existing TMDB response cache in localStorage if available
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('tmdb_resp_cache_v1:/')) continue;

      const match = key.match(/tmdb_resp_cache_v1:\/(movie|tv)\/(\d+)/);
      if (!match) continue;

      const mediaType = match[1];
      const mediaId = Number(match[2]);
      const cacheKey = `${mediaType}_${mediaId}`;

      if (index[cacheKey] && index[cacheKey].length > 0) continue;

      try {
        const entryRaw = window.localStorage.getItem(key);
        if (!entryRaw) continue;
        const entry = JSON.parse(entryRaw);
        const data = entry?.data;
        const cast = data?.credits?.cast || data?.cast;
        if (Array.isArray(cast) && cast.length > 0) {
          const compact = cast.slice(0, 4).map((c: any) => ({
            id: Number(c.id),
            name: String(c.name || '').trim(),
            profile_path: c.profile_path || null,
          })).filter((c: CompactActor) => c.name);

          if (compact.length > 0) {
            index[cacheKey] = compact;
          }
        }
      } catch {}
    }
  } catch {}

  memoryCastIndex = index;
  return index;
}

/**
 * Persists the cast index to localStorage in a compact, bounded format.
 */
export function persistCastIndex(index: Record<string, CompactActor[]>): void {
  if (typeof window === 'undefined') return;
  memoryCastIndex = index;
  try {
    window.localStorage.setItem(CAST_INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.warn('[CastIndex] Failed to persist cast index to localStorage:', e);
  }
}

/**
 * Proactively save cast for a movie/show when viewed or marked watched.
 */
export function recordMediaCast(mediaId: number, mediaType: string, rawCast: any[]): void {
  if (!mediaId || !Array.isArray(rawCast) || rawCast.length === 0) return;
  const index = getStoredCastIndex();
  const normalizedType = mediaType === 'tv' ? 'tv' : 'movie';
  const key = `${normalizedType}_${mediaId}`;

  const compact: CompactActor[] = rawCast.slice(0, 4).map((c: any) => ({
    id: Number(c.id),
    name: String(c.name || '').trim(),
    profile_path: c.profile_path || null,
  })).filter((c: CompactActor) => c.name);

  if (compact.length > 0) {
    index[key] = compact;
    persistCastIndex(index);
  }
}

/**
 * Calculates top watched stars from history using cached credits, returning top stars and missing items.
 */
export function calculateTopStarsFromHistory(
  history: any[],
  castIndex: Record<string, CompactActor[]> = getStoredCastIndex(),
  favoriteArtists: any[] = []
): { topActorsList: ActorStat[]; missingItems: { id: number; mediaType: 'movie' | 'tv'; title: string }[] } {
  const actorMap: Record<string, { count: number; id?: number; profile_path?: string | null }> = {};
  const missingItems: { id: number; mediaType: 'movie' | 'tv'; title: string }[] = [];
  const seenMissing = new Set<string>();

  for (const item of history) {
    const rawId = item.id ?? item.media_id;
    const mediaId = Number(rawId);
    if (!mediaId || isNaN(mediaId)) continue;

    const isTv = item.media_type === 'tv' || !!item.first_air_date || item.lastSeason !== undefined;
    const mediaType: 'movie' | 'tv' = isTv ? 'tv' : 'movie';
    const key = `${mediaType}_${mediaId}`;

    let castList: CompactActor[] | undefined = castIndex[key];

    // If item already carries inline cast, use it and update cache
    const inlineCast = item.cast;
    if ((!castList || castList.length === 0) && Array.isArray(inlineCast) && inlineCast.length > 0) {
      const extracted: CompactActor[] = inlineCast.slice(0, 4).map((c: any) => ({
        id: Number(c.id),
        name: String(c.name || '').trim(),
        profile_path: c.profile_path || null,
      })).filter((c: CompactActor) => c.name);
      if (extracted.length > 0) {
        castList = extracted;
        castIndex[key] = extracted;
      }
    }

    if (castList && castList.length > 0) {
      for (const actor of castList) {
        if (!actor.name) continue;
        if (!actorMap[actor.name]) {
          actorMap[actor.name] = {
            count: 0,
            id: actor.id,
            profile_path: actor.profile_path,
          };
        }
        actorMap[actor.name].count += 1;
        if (!actorMap[actor.name].profile_path && actor.profile_path) {
          actorMap[actor.name].profile_path = actor.profile_path;
        }
        if (!actorMap[actor.name].id && actor.id) {
          actorMap[actor.name].id = actor.id;
        }
      }
    } else {
      if (!seenMissing.has(key)) {
        seenMissing.add(key);
        missingItems.push({
          id: mediaId,
          mediaType,
          title: item.title || item.name || `Title #${mediaId}`,
        });
      }
    }
  }

  // If star tracking is still building, blend favorite artists so users never see an empty card
  if (Object.keys(actorMap).length < 4 && Array.isArray(favoriteArtists)) {
    favoriteArtists.forEach((art: any) => {
      if (art?.name && !actorMap[art.name]) {
        actorMap[art.name] = {
          count: 1,
          id: art.id,
          profile_path: art.profile_path || null,
        };
      }
    });
  }

  const topActorsList: ActorStat[] = Object.entries(actorMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, data]) => ({
      name,
      count: data.count,
      id: data.id,
      profile_path: data.profile_path,
    }));

  return { topActorsList, missingItems };
}

/**
 * Concurrency-limited background indexer for uncached titles.
 * Resolves credits in small non-blocking batches on the client without straining the network.
 */
export async function indexMissingHistoryCredits(
  missingItems: { id: number; mediaType: 'movie' | 'tv'; title: string }[],
  history: any[],
  onProgress?: (indexed: number, total: number, partialTopStars: ActorStat[]) => void,
  shouldAbort?: () => boolean,
  favoriteArtists: any[] = []
): Promise<ActorStat[]> {
  const castIndex = getStoredCastIndex();
  const total = missingItems.length;
  if (total === 0) {
    const { topActorsList } = calculateTopStarsFromHistory(history, castIndex, favoriteArtists);
    return topActorsList;
  }

  const BATCH_SIZE = 25;
  let processed = 0;
  let newEntriesCount = 0;

  for (let i = 0; i < missingItems.length; i += BATCH_SIZE) {
    if (shouldAbort && shouldAbort()) break;

    const chunk = missingItems.slice(i, i + BATCH_SIZE);
    
    // First try batch endpoint via watcher-api using POST to avoid URL length constraints
    let batchSucceeded = false;
    try {
      const resp = await fetch('https://watcher-api-rho.vercel.app/api/tmdb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/batch_credits',
          items: chunk.map(m => ({ id: m.id, mediaType: m.mediaType })),
        }),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json?.status === 'ok' && json?.results) {
          for (const [key, cast] of Object.entries(json.results)) {
            if (Array.isArray(cast) && cast.length > 0) {
              castIndex[key] = cast as CompactActor[];
              newEntriesCount++;
            }
          }
          batchSucceeded = true;
          processed += chunk.length;
        }
      }
    } catch {
      batchSucceeded = false;
    }

    // Fallback: Individual credits fetching if batch API didn't resolve all
    if (!batchSucceeded) {
      const CONCURRENCY = 4;
      for (let j = 0; j < chunk.length; j += CONCURRENCY) {
        if (shouldAbort && shouldAbort()) break;
        const subChunk = chunk.slice(j, j + CONCURRENCY);
        await Promise.all(
          subChunk.map(async (item) => {
            const key = `${item.mediaType}_${item.id}`;
            if (castIndex[key] && castIndex[key].length > 0) return;
            try {
              const rawCast = await getMediaCredits(item.id, item.mediaType);
              if (Array.isArray(rawCast) && rawCast.length > 0) {
                const compact: CompactActor[] = rawCast.slice(0, 4).map((c: any) => ({
                  id: Number(c.id),
                  name: String(c.name || '').trim(),
                  profile_path: c.profile_path || null,
                })).filter((c: CompactActor) => c.name);

                if (compact.length > 0) {
                  castIndex[key] = compact;
                  newEntriesCount++;
                }
              }
            } catch {
              // Ignore single title failure without poisoning the index with []
            }
          })
        );
        processed += subChunk.length;
        await new Promise((r) => setTimeout(r, 40));
      }
    }

    if (newEntriesCount > 0) {
      persistCastIndex(castIndex);
    }

    if (onProgress) {
      const { topActorsList } = calculateTopStarsFromHistory(history, castIndex, favoriteArtists);
      onProgress(processed, total, topActorsList);
    }

    // Small breather between batches
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  // Final persistence
  persistCastIndex(castIndex);
  const { topActorsList } = calculateTopStarsFromHistory(history, castIndex, favoriteArtists);
  return topActorsList;
}
