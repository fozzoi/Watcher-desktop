import axios from 'axios';
import { AsyncStorage } from './storage';

// ==========================================
// 1. GLOBAL CONFIGURATION & SETUP
// ==========================================

const API_BASE_URL = "https://watcher-api-rho.vercel.app/api/tmdb";
const GEMINI_MODEL = "gemini-flash-latest"; 

export let GLOBAL_CONFIG = {
  hiRes: false,
  nsfwFilterEnabled: true,
  aiEnabled: true,       
  customApiKey: ""       
};

export const setGlobalConfig = (key: keyof typeof GLOBAL_CONFIG, value: any) => {
  // @ts-ignore
  GLOBAL_CONFIG[key] = value;
  
  if (key === 'nsfwFilterEnabled' || key === 'hiRes') {
      requestCache.clear();
  }
  if (key === 'customApiKey') {
      console.log("Global Config: Custom API Key Updated");
  }
};

const tmdbApi = axios.create({
  baseURL: API_BASE_URL,
  params: { api_key: "" }, // Backend handles this
  timeout: 12000, 
});

tmdbApi.interceptors.response.use(
  response => response,
  error => {
    return Promise.reject(error);
  }
);

// --- CACHE SETUP WITH TTL (Time-To-Live) ---
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 Hours
const AI_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 Hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const requestCache = new Map<string, CacheEntry<any>>();
const aiCache = new Map<string, CacheEntry<TMDBResult[]>>();
const STORAGE_CACHE_PREFIX = 'tmdb_resp_cache_v1:';

function getPersistentCache(key: string): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
      return entry.data;
    }
    window.localStorage.removeItem(STORAGE_CACHE_PREFIX + key);
  } catch {}
  return null;
}

function setPersistentCache(key: string, data: any) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_CACHE_PREFIX + key,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch (e) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORAGE_CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.slice(0, Math.ceil(keysToRemove.length / 2)).forEach((k) => window.localStorage.removeItem(k));
    } catch {}
  }
}

export const getTmdbCacheSync = (endpoint: string, params: Record<string, any> = {}): any | null => {
  const cacheKey = createCacheKey(endpoint, params);
  const memCached = requestCache.get(cacheKey);
  if (memCached && (Date.now() - memCached.timestamp) < CACHE_TTL_MS) {
    return memCached.data;
  }
  const diskCached = getPersistentCache(cacheKey);
  if (diskCached) {
    requestCache.set(cacheKey, { data: diskCached, timestamp: Date.now() });
    return diskCached;
  }
  return null;
};

export const clearCache = (keyPrefix: string = "") => {
  if (keyPrefix === "") {
    requestCache.clear();
    aiCache.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(STORAGE_CACHE_PREFIX)) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      } catch {}
    }
  } else {
    for (const key of requestCache.keys()) {
      if (key.startsWith(keyPrefix)) requestCache.delete(key);
    }
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(STORAGE_CACHE_PREFIX + keyPrefix)) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      } catch {}
    }
  }
};

// ==========================================
// 2. INTERFACES
// ==========================================

export interface TMDBImage {
  file_path: string;
  aspect_ratio: number;
  height: number;
  width: number;
  vote_average?: number;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  profile_path: string | null;
  character: string;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  profile_path: string | null;
  job: string;
}

export interface TMDBExternalIds {
  imdb_id?: string;
  facebook_id?: string;
  instagram_id?: string;
  twitter_id?: string;
}

export interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TMDBProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface TMDBCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TMDBCollectionDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  media_type: 'collection';
  parts: TMDBResult[];
}

export interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  vote_average: number;
  vote_count?: number;
  popularity?: number;
  media_type: "movie" | "tv";
  release_date?: string;
  first_air_date?: string;
  certification?: string;
  status?: string; 
  budget?: number; 
  revenue?: number; 
  runtime?: number; 
  tagline?: string; 
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  original_language?: string;
   
  cast?: TMDBCastMember[]; 
  director?: TMDBCrewMember;
  character?: string; 
  number_of_seasons?: number; 
  seasons?: TMDBSeason[];
  external_ids?: TMDBExternalIds; 
  videos?: TMDBVideo[]; 
   
  production_companies?: TMDBProductionCompany[];
  belongs_to_collection?: TMDBCollection | null;
  recommendations?: TMDBResult[];
  added_at?: number;
  created_at?: number;
  watchedAt?: number;
}

export interface TMDBSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  poster_path: string | null;
  overview: string;
  air_date: string | null;
  episodes?: TMDBEpisode[];
}

export interface TMDBEpisode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  vote_average: number;
  runtime: number | null;
}

export interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  also_known_as?: string[];
  deathday?: string | null;
  gender?: number;
  popularity?: number;
  homepage?: string | null;
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

const formatBasicItemData = (item: any): Omit<TMDBResult, 'certification' | 'cast'> => ({
  id: item.id,
  title: item.title || item.name,
  name: item.name,
  overview: item.overview || "No description available.",
  poster_path: item.poster_path,
  backdrop_path: item.backdrop_path,
  vote_average: parseFloat((item.vote_average || 0).toFixed(1)),
  media_type: item.media_type || (item.first_air_date ? "tv" : "movie"),
  release_date: item.release_date,
  first_air_date: item.first_air_date,
  number_of_seasons: item.number_of_seasons,
  genre_ids: item.genre_ids || [],
  status: item.status,
  budget: item.budget,
  revenue: item.revenue,
  runtime: item.runtime || (item.episode_run_time ? item.episode_run_time[0] : null),
  tagline: item.tagline,
  original_language: item.original_language,
});

const createCacheKey = (endpoint: string, params: Record<string, any> = {}) => {
  return `${endpoint}-${JSON.stringify(params)}`;
};

const inFlightRequests = new Map<string, Promise<any>>();
const MAX_REQUEST_CACHE_ENTRIES = 300;

export const buildDetailUrl = (item: any): string => {
  if (!item) return '/';
  const id = item.id ?? item.tmdbId ?? item.media_id;
  if (!id) return '/';
  const isTv = item.media_type === 'tv' || Boolean(item.first_air_date && !item.release_date);
  const mediaType = item.media_type || (isTv ? 'tv' : 'movie');
  const params = new URLSearchParams();
  params.set('id', String(id));
  params.set('type', mediaType);

  const title = item.title || item.name;
  if (title) params.set('title', title);
  const poster = item.poster_path || item.posterPath || item.poster;
  if (poster) params.set('poster_path', poster);
  const backdrop = item.backdrop_path || item.backdropPath;
  if (backdrop) params.set('backdrop_path', backdrop);
  if (item.overview) params.set('overview', item.overview);
  const rating = item.vote_average ?? item.voteAverage;
  if (typeof rating === 'number' && rating > 0) {
    params.set('vote_average', rating.toFixed(1));
  }
  const date = item.release_date || item.first_air_date || item.releaseDate;
  if (date) params.set('release_date', date);

  return `/detail?${params.toString()}`;
};

const fetchWithCache = async (endpoint: string, params: Record<string, any> = {}) => {
  if (GLOBAL_CONFIG.nsfwFilterEnabled) {
    params.include_adult = false;
    if (endpoint.includes('discover')) {
      params.certification_country = "US"; 
      params['certification.lte'] = "PG-13"; 
    }
  } else {
    params.include_adult = true; 
  }

  // TMDB /search/collection throws 422 if include_adult is provided
  if (endpoint.includes('/collection')) {
    delete params.include_adult;
  }

  const cacheKey = createCacheKey(endpoint, params);
  const cached = requestCache.get(cacheKey);

  if (cached) {
    const isExpired = (Date.now() - cached.timestamp) > CACHE_TTL_MS;
    if (!isExpired) {
      return cached.data;
    }
  } else {
    const persistent = getPersistentCache(cacheKey);
    if (persistent) {
      requestCache.set(cacheKey, { data: persistent, timestamp: Date.now() });
      return persistent;
    }
  }

  // Deduplicate concurrent identical in-flight requests
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    const MAX_RETRIES = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await tmdbApi.get(endpoint, { params });
        // Enforce LRU cap so memory stays bounded
        if (requestCache.size >= MAX_REQUEST_CACHE_ENTRIES) {
          const oldestKey = requestCache.keys().next().value;
          if (oldestKey) requestCache.delete(oldestKey);
        }
        requestCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
        if (
          endpoint.startsWith('/movie') ||
          endpoint.startsWith('/tv') ||
          endpoint.startsWith('/discover') ||
          endpoint.startsWith('/trending')
        ) {
          setPersistentCache(cacheKey, response.data);
        }
        return response.data;
      } catch (error: any) {
        lastError = error;
        const statusCode = error.response?.status;
        const isTimeout = error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'));
        const isRetryable = isTimeout || !statusCode || statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode < 600);

        if (attempt < MAX_RETRIES && isRetryable) {
          const delay = Math.min(2500, 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250));
          console.warn(`[TMDB] ${endpoint} attempt ${attempt + 1} timed out or failed (${error.message}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }

    // Stale cache fallback: if all retries failed, return cached data if available
    if (cached) {
      console.warn(`[TMDB] Retries failed for ${endpoint}. Serving stale cached data fallback.`);
      return cached.data;
    }

    throw lastError;
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
};

const fetchDoublePage = async (endpoint: string, params: any = {}, mediaType: "movie" | "tv") => {
    try {
        const [page1, page2] = await Promise.all([
            fetchWithCache(endpoint, { ...params, page: 1 }),
            fetchWithCache(endpoint, { ...params, page: 2 })
        ]);
        const combined = [...(page1.results || []), ...(page2.results || [])];
        const unique = Array.from(new Map(combined.map((item: any) => [item.id, item])).values());
        return unique.map((item: any) => ({ ...formatBasicItemData(item), media_type: mediaType }));
    } catch (error) {
        return [];
    }
};

export const getImageUrl = (path: string | null, size: string = "w500"): string => {
  if (!path) return "https://via.placeholder.com/500x750?text=No+Image";
  let finalSize = size;
  if (GLOBAL_CONFIG.hiRes) {
    if (size === "w500" || size === "w780") finalSize = "original"; 
    if (size === "w185") finalSize = "w500";      
  }
  return `https://image.tmdb.org/t/p/${finalSize}${path}`;
};

// ==========================================
// 4. TMDB FETCH FUNCTIONS 
// ==========================================

export const getDiscoverMedia = async (
    type: 'movie' | 'tv' = 'movie',
    page: number = 1,
    filters: { genreId?: number | null; year?: string; language?: string; rating?: number },
    baseCategory?: string
  ): Promise<TMDBResult[]> => {
    
    const params: any = { sort_by: 'popularity.desc' };

    if (baseCategory) {
        const bc = baseCategory.toLowerCase();
        if (bc === 'toprated') { params.sort_by = 'vote_average.desc'; params['vote_count.gte'] = 300; }
        else if (bc === 'regional') { params.region = 'IN'; }
        else if (bc.includes('hindi')) { params.with_original_language = 'hi'; }
        else if (bc.includes('malayalam')) { params.with_original_language = 'ml'; }
        else if (bc.includes('tamil')) { params.with_original_language = 'ta'; }
        else if (bc.includes('korean')) { params.with_original_language = 'ko'; }
        else if (bc.includes('japanese')) { params.with_original_language = 'ja'; }
        else if (bc === 'animatedmovies') { params.with_genres = '16'; }
        else if (bc === 'animemovies' || bc === 'animeshows') { 
            params.with_genres = '16'; 
            params.with_keywords = '210024'; 
            params.with_original_language = 'ja'; 
        }
        else if (bc === 'hiddengems') { params['vote_average.gte'] = 7.5; params['vote_count.gte'] = 100; params.sort_by = 'vote_average.desc'; }
        else if (bc === 'nostalgia') { params['primary_release_date.gte'] = '1990-01-01'; params['primary_release_date.lte'] = '2005-12-31'; }
        else if (bc.startsWith('genre/')) { params.with_genres = bc.split('/')[1]; }
    }
  
    if (filters.genreId) params.with_genres = params.with_genres ? `${params.with_genres},${filters.genreId}` : filters.genreId;
    if (filters.language) params.with_original_language = filters.language;
    if (filters.rating) params['vote_average.gte'] = filters.rating;
    
    if (filters.year) {
       if (type === 'movie') params.primary_release_year = filters.year;
       else params.first_air_date_year = filters.year;
    }
  
    if (page === 1) {
        return await fetchDoublePage(`/discover/${type}`, params, type);
    } else {
        params.page = page;
        try {
            const data = await fetchWithCache(`/discover/${type}`, params);
            return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: type }));
        } catch (error) { return []; }
    }
};

export const getTrendingToday = async (mediaType: "all" | "movie" | "tv" = "all", page: number = 1): Promise<TMDBResult[]> => {
  const endpoint = `/trending/${mediaType}/day`;
  const params: any = { page };
  try {
    const data = await fetchWithCache(endpoint, params);
    const results = data.results || [];
    return results.map((item: any) => ({
      ...formatBasicItemData(item),
      media_type: item.media_type || (item.first_air_date ? "tv" : "movie"),
    }));
  } catch (error) {
    return await getTrendingMovies(page);
  }
};

export const getTrendingMovies = async (page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
    const endpoint = genreId ? "/discover/movie" : "/trending/movie/week";
    const params: any = {};
    if (genreId) { params.with_genres = genreId; params.sort_by = "popularity.desc"; }
    
    if (page === 1) return await fetchDoublePage(endpoint, params, "movie");
    
    params.page = page;
    try {
      const data = await fetchWithCache(endpoint, params);
      return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
    } catch (error) { return []; }
};

export const getTrendingTV = async (page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
    const endpoint = genreId ? "/discover/tv" : "/trending/tv/week";
    const params: any = {};
    if (genreId) { params.with_genres = genreId; params.sort_by = "popularity.desc"; }
    
    if (page === 1) return await fetchDoublePage(endpoint, params, "tv");

    params.page = page;
    try {
      const data = await fetchWithCache(endpoint, params);
      return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "tv" }));
    } catch (error) { return []; }
};

export const getTopRated = async (page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
    const endpoint = genreId ? "/discover/movie" : "/movie/top_rated";
    const params: any = {};
    if (genreId) { params.with_genres = genreId; params.sort_by = "vote_average.desc"; params["vote_count.gte"] = 300; }
    
    if (page === 1) return await fetchDoublePage(endpoint, params, "movie");

    params.page = page;
    try {
      const data = await fetchWithCache(endpoint, params);
      return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
    } catch (error) { return []; }
};

export const getRegionalMovies = async (region: string = 'IN', page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
  const params: any = { region, sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie");

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) { return []; }
};

export const getLanguageMovies = async (language: string, page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
  const params: any = { with_original_language: language, sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie");

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) { return []; }
};

export const getLanguageTV = async (language: string, page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
  const params: any = { with_original_language: language, sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/tv", params, "tv");

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/tv", params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "tv" }));
  } catch (error) { return []; }
};

const ANIME_GENRE_ID = 16;
const ANIME_KEYWORD_ID = 210024;
export const getAnimeContent = async (page: number = 1, isMovie: boolean = true, genreId?: number): Promise<TMDBResult[]> => {
  const mediaType = isMovie ? 'movie' : 'tv';
  const genres = genreId ? `${ANIME_GENRE_ID},${genreId}` : `${ANIME_GENRE_ID}`;
  const params: any = { with_genres: genres, with_keywords: ANIME_KEYWORD_ID, with_original_language: 'ja', sort_by: 'popularity.desc' };
  
  if (page === 1) return await fetchDoublePage(`/discover/${mediaType}`, params, mediaType);

  params.page = page;
  try {
    const data = await fetchWithCache(`/discover/${mediaType}`, params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: mediaType }));
  } catch (error) { return []; }
};

export const getAnimatedMovies = async (page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
  const genres = genreId ? `${ANIME_GENRE_ID},${genreId}` : `${ANIME_GENRE_ID}`;
  const params: any = { with_genres: genres, sort_by: 'popularity.desc' };
  
  if (page === 1) return await fetchDoublePage('/discover/movie', params, "movie");

  params.page = page;
  try {
    const data = await fetchWithCache('/discover/movie', params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: 'movie' }));
  } catch (error) { return []; }
};

export const getUpcomingMovies = async (page: number = 1): Promise<TMDBResult[]> => {
  const params: any = { region: 'US' };
  if (page === 1) return await fetchDoublePage("/movie/upcoming", params, "movie");

  params.page = page;
  try {
    const data = await fetchWithCache("/movie/upcoming", params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) { return []; }
};

export const getHiddenGems = async (page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
  const params: any = { "vote_average.gte": 7.5, "vote_count.gte": 100, "vote_count.lte": 3000, sort_by: "vote_average.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie");

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) { return []; }
};

export const getNostalgicMovies = async (page: number = 1, genreId?: number): Promise<TMDBResult[]> => {
  const params: any = { "primary_release_date.gte": "1990-01-01", "primary_release_date.lte": "2005-12-31", sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie");

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params);
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) { return []; }
};

// ==========================================
// 6. DETAILS & OTHERS
// ==========================================

export const getFullDetails = async (item: TMDBResult): Promise<TMDBResult> => {
  let resolvedMediaType: "movie" | "tv" = item.media_type || (item.first_air_date ? "tv" : "movie");
  try {
    const append = "credits,release_dates,content_ratings,external_ids,videos,recommendations";
    let data: any;
    try {
      data = await fetchWithCache(`/${resolvedMediaType}/${item.id}`, { append_to_response: append });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        const fallbackType: "movie" | "tv" = resolvedMediaType === "tv" ? "movie" : "tv";
        data = await fetchWithCache(`/${fallbackType}/${item.id}`, { append_to_response: append });
        resolvedMediaType = fallbackType;
      } else {
        throw err;
      }
    }

    let certification = null;
    if (resolvedMediaType === "movie") {
      const usRelease = data.release_dates?.results?.find((r: any) => r.iso_3166_1 === "US");
      certification = usRelease?.release_dates?.[0]?.certification || null;
    } else {
      const usRating = data.content_ratings?.results?.find((r: any) => r.iso_3166_1 === "US");
      certification = usRating?.rating || null;
    }

    const cast = (data.credits?.cast || []).map((member: any) => ({
      id: member.id,
      name: member.name || "Unknown Actor",
      profile_path: member.profile_path || null,
      character: member.character || "Unknown Character"
    }));

    let director: TMDBCrewMember | undefined = undefined;
    if (data.created_by && data.created_by.length > 0) {
        director = {
            id: data.created_by[0].id,
            name: data.created_by[0].name,
            profile_path: data.created_by[0].profile_path,
            job: "Creator"
        };
    } else if (data.credits?.crew) {
        const dir = data.credits.crew.find((m: any) => m.job === "Director");
        if (dir) {
            director = {
                id: dir.id,
                name: dir.name,
                profile_path: dir.profile_path,
                job: "Director"
            };
        }
    }

    let seasonsData = [];
    if (resolvedMediaType === "tv") {
      seasonsData = data.seasons || []; 
    }

    const recommendations = (data.recommendations?.results || []).map((r: any) => ({
      ...formatBasicItemData(r),
      media_type: resolvedMediaType,
    }));

    const baseFormatted = formatBasicItemData(data);
    baseFormatted.media_type = resolvedMediaType;

    return {
      ...item,
      ...baseFormatted, 
      certification,
      cast,
      director,
      seasons: seasonsData,
      external_ids: data.external_ids, 
      videos: data.videos?.results || [],
      production_companies: data.production_companies || [],
      belongs_to_collection: data.belongs_to_collection || null,
      recommendations,
    };
  } catch (error) { return item; }
};

export const getMediaDetails = async (id: number, mediaType: "movie" | "tv"): Promise<TMDBResult> => {
  try {
    return await getFullDetails({ id, media_type: mediaType } as TMDBResult);
  } catch (error) {
    throw error;
  }
};

export const getMediaCredits = async (
  id: number, 
  mediaType: "movie" | "tv" = "movie"
): Promise<TMDBCastMember[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/credits`);
    return Array.isArray(data?.cast) ? data.cast : [];
  } catch (error) {
    return [];
  }
};

export const getMovieGenres = async (id: number, mediaType: "movie" | "tv" = "movie"): Promise<{ id: number; name: string }[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}`);
    return data.genres || [];
  } catch (error) { return []; }
};

export const getTVShowSeasons = async (tvId: number): Promise<TMDBSeason[]> => {
  try {
    const data = await fetchWithCache(`/tv/${tvId}`);
    return data.seasons || [];
  } catch (error) { return []; }
};

export const getSeasonEpisodes = async (tvId: number, seasonNumber: number): Promise<TMDBEpisode[]> => {
  try {
    const data = await fetchWithCache(`/tv/${tvId}/season/${seasonNumber}`);
    return data.episodes || [];
  } catch (error) { return []; }
};

export const getSimilarMedia = async (id: number, mediaType: "movie" | "tv", page: number = 1): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/recommendations`, { page });
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: mediaType }));
  } catch (error) { return []; }
};

export const getPersonDetails = async (personId: number): Promise<TMDBPerson> => {
  return await fetchWithCache(`/person/${personId}`);
};

export const isTalkOrSelfShow = (item: any): boolean => {
  if (!item) return false;
  const genres = Array.isArray(item.genre_ids) ? item.genre_ids : [];
  const char = String(item.character || '').trim().toLowerCase();
  const title = String(item.title || item.name || '').trim().toLowerCase();
  const overview = String(item.overview || '').toLowerCase();

  // 1. TMDB TV genre 10767 = 'Talk' (Talk Show), 10763 = 'News'
  if (genres.includes(10767) || genres.includes(10763)) {
    return true;
  }

  // 2. Any entry where person appears as Self / Guest / Host / Presenter / Interviewee / Panelist
  const isSelfRole = 
    char === 'self' ||
    char.startsWith('self ') ||
    char.startsWith('self-') ||
    char.startsWith('self/') ||
    char.startsWith('self(') ||
    char.startsWith('self,') ||
    char.includes('(self)') ||
    char.includes('self -') ||
    char === 'himself' ||
    char.startsWith('himself ') ||
    char.startsWith('himself-') ||
    char.startsWith('himself(') ||
    char === 'herself' ||
    char.startsWith('herself ') ||
    char.startsWith('herself-') ||
    char.startsWith('herself(') ||
    char === 'themselves' ||
    char.startsWith('themselves ') ||
    char.includes('guest') ||
    char.includes('host') ||
    char.includes('presenter') ||
    char.includes('panelist') ||
    char.includes('interviewee') ||
    char.includes('musical guest');

  if (isSelfRole) {
    return true;
  }

  // 3. Talk / Late Night / Morning / Chat show titles or keywords
  const isTalkOrChat = 
    title.includes('talk show') ||
    title.includes('chat show') ||
    title.includes('late show') ||
    title.includes('late night') ||
    title.includes('tonight show') ||
    title.endsWith(' show') ||
    title.includes(' show starring') ||
    title.includes(' show with') ||
    title.includes('the daily show') ||
    title.includes('the view') ||
    title.includes('the one show') ||
    title.includes('today') ||
    title.includes('saturday night takeaway') ||
    title.includes('saturday night live') ||
    title.includes('finding your roots') ||
    title.includes('watch what happens live') ||
    title.includes('jimmy kimmel live') ||
    overview.includes('chat show') ||
    overview.includes('talk show') ||
    overview.includes('late-night');

  if (isTalkOrChat) {
    return true;
  }

  // 4. Award ceremonies / galas / specials
  const isAwardOrSpecial = 
    title.includes('awards') ||
    title.includes('oscars') ||
    title.includes('academy award') ||
    title.includes('golden globe') ||
    title.includes('grammy') ||
    title.includes('bafta') ||
    title.includes('tony award') ||
    title.includes('emmy') ||
    title.includes('kamera') ||
    title.includes('made in hollywood');

  if (isAwardOrSpecial) {
    return true;
  }

  return false;
};

export const getPersonCombinedCredits = async (personId: number): Promise<TMDBResult[]> => {
  const data = await fetchWithCache(`/person/${personId}/combined_credits`);
  const rawCast = Array.isArray(data?.cast) ? data.cast : [];
  const castItems = rawCast
    .filter((item: any) => !isTalkOrSelfShow(item))
    .map((item: any) => ({
      ...formatBasicItemData(item),
      media_type: item.media_type || (item.title ? "movie" : "tv"),
      character: item.character || null,
      credit_type: 'cast'
    }));

  const crewItems = (data.crew || []).map((item: any) => ({
    ...formatBasicItemData(item),
    media_type: item.media_type || (item.title ? "movie" : "tv"),
    job: item.job || null,
    department: item.department || null,
    credit_type: 'crew'
  }));

  // Merge cast and crew into a deduplicated list, preserving directorial work
  const combinedMap = new Map<number, any>();
  
  // Prioritize crew/directorial credits
  crewItems.forEach((item: any) => {
    if (!combinedMap.has(item.id)) {
      combinedMap.set(item.id, item);
    } else {
      const existing = combinedMap.get(item.id);
      if (item.job === 'Director' || item.department === 'Directing') {
        combinedMap.set(item.id, { ...existing, ...item });
      }
    }
  });

  // Merge cast credits
  castItems.forEach((item: any) => {
    if (!combinedMap.has(item.id)) {
      combinedMap.set(item.id, item);
    } else {
      const existing = combinedMap.get(item.id);
      combinedMap.set(item.id, {
        ...existing,
        character: item.character || existing.character
      });
    }
  });

  return Array.from(combinedMap.values());
};

export const getPersonImages = async (personId: number): Promise<TMDBImage[]> => {
  try {
    const data = await fetchWithCache(`/person/${personId}/images`);
    return data.profiles || [];
  } catch (error) { return []; }
};

export const getMovieImages = async (movieId: number, mediaType: "movie" | "tv"): Promise<TMDBImage[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${movieId}/images`);
    const posters: TMDBImage[] = data.posters || [];
    const backdrops: TMDBImage[] = data.backdrops || [];
    const images: TMDBImage[] = [];

    for (let index = 0; index < Math.max(posters.length, backdrops.length) && images.length < 20; index += 1) {
      if (backdrops[index]) images.push(backdrops[index]);
      if (posters[index] && images.length < 20) images.push(posters[index]);
    }

    return images;
  } catch (error) { return []; }
};

export const getExternalIds = async (id: number, mediaType: "movie" | "tv"): Promise<TMDBExternalIds> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/external_ids`);
    return data;
  } catch (error) { return {}; }
};

export const getTrailers = async (id: number, mediaType: "movie" | "tv"): Promise<TMDBVideo[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/videos`);
    return data.results || [];
  } catch (error) { return []; }
};

export const searchTMDB = async (query: string, page: number = 1): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache("/search/multi", { query, page });
    return data.results.map((item: any) => formatBasicItemData(item));
  } catch (error) { return []; }
};

export const getCollectionDetails = async (collectionId: number): Promise<TMDBCollectionDetails | null> => {
  try {
    const data = await fetchWithCache(`/collection/${collectionId}`);
    return {
      id: data.id,
      name: data.name,
      overview: data.overview || "",
      poster_path: data.poster_path,
      backdrop_path: data.backdrop_path,
      media_type: 'collection',
      parts: (data.parts || []).map((item: any) => ({
        ...formatBasicItemData(item),
        media_type: "movie" as const,
      })),
    };
  } catch (error) { return null; }
};

export const searchCollections = async (query: string, page: number = 1): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache("/search/collection", { query, page });
    return data.results.map((item: any) => ({
      id: item.id,
      title: item.name,
      name: item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      media_type: "collection",
      overview: item.overview,
    }));
  } catch (error) { return []; }
};

export const POPULAR_FRANCHISE_COLLECTIONS = [
  {
    id: 726871,
    collection_id: 726871,
    name: "Dune Collection",
    title: "Dune Collection",
    backdrop_path: "/fahk0Fu7VUUfK6IkTt1R3waOD9F.jpg",
    poster_path: "/lxIGYkpvYjLtYtZH684AQft0FhD.jpg",
    media_type: "collection" as const,
    parts_count: 2,
    vote_average: 8.2,
  },
  {
    id: 404609,
    collection_id: 404609,
    name: "John Wick Collection",
    title: "John Wick Collection",
    backdrop_path: "/fSwYa5q2xRkBoOOjueLpkLf3N1m.jpg",
    poster_path: "/sm7rZZivZm2NhJDucFf3gpfFdVt.jpg",
    media_type: "collection" as const,
    parts_count: 4,
    vote_average: 7.9,
  },
  {
    id: 263,
    collection_id: 263,
    name: "The Dark Knight Collection",
    title: "The Dark Knight Collection",
    backdrop_path: "/xyhrCEdB4XRkelfVsqXeUZ6rLHi.jpg",
    poster_path: "/ogyw5LTmL53dVxsppcy8Dlm30Fu.jpg",
    media_type: "collection" as const,
    parts_count: 3,
    vote_average: 8.5,
  },
  {
    id: 119,
    collection_id: 119,
    name: "The Lord of the Rings Collection",
    title: "The Lord of the Rings Collection",
    backdrop_path: "/bccR2CGTWVVSZAG0yqmy3DIvhTX.jpg",
    poster_path: "/oENY593nKRVL2PnxXsMtlh8izb4.jpg",
    media_type: "collection" as const,
    parts_count: 3,
    vote_average: 8.5,
  },
  {
    id: 1241,
    collection_id: 1241,
    name: "Harry Potter Collection",
    title: "Harry Potter Collection",
    backdrop_path: "/4gV0rKUjB1nLUdZB4zIltLvNZZr.jpg",
    poster_path: "/eVPs2Y0LyvTLZn6AP5Z6O2rtiGB.jpg",
    media_type: "collection" as const,
    parts_count: 8,
    vote_average: 7.9,
  },
  {
    id: 86311,
    collection_id: 86311,
    name: "The Avengers Collection",
    title: "The Avengers Collection",
    backdrop_path: "/2UNUv4NJdC36E5myDHACBJ99EwL.jpg",
    poster_path: "/yFSIUVTCvgYrpalUktulvk3Gi5Y.jpg",
    media_type: "collection" as const,
    parts_count: 4,
    vote_average: 8.0,
  },
  {
    id: 10,
    collection_id: 10,
    name: "Star Wars Collection",
    title: "Star Wars Collection",
    backdrop_path: "/iY2ujEY2m68OTTlPFTiHub9joHS.jpg",
    poster_path: "/pWVLFh4OuejTpUaDQbB1C4zoS2p.jpg",
    media_type: "collection" as const,
    parts_count: 9,
    vote_average: 8.1,
  },
  {
    id: 87359,
    collection_id: 87359,
    name: "Mission: Impossible Collection",
    title: "Mission: Impossible Collection",
    backdrop_path: "/mroWh717g0Ah2c0rrPGW6f3EWMM.jpg",
    poster_path: "/geEjCGfdmRAA1skBPwojcdvnZ8A.jpg",
    media_type: "collection" as const,
    parts_count: 7,
    vote_average: 7.6,
  },
  {
    id: 556,
    collection_id: 556,
    name: "Spider-Man Collection",
    title: "Spider-Man Collection",
    backdrop_path: "/waZqriYTuBE3WqXI3SDGi3kfDQE.jpg",
    poster_path: "/bp5PqLa06QA1LsELA1SsKZ008H7.jpg",
    media_type: "collection" as const,
    parts_count: 3,
    vote_average: 7.5,
  },
  {
    id: 295,
    collection_id: 295,
    name: "Pirates of the Caribbean Collection",
    title: "Pirates of the Caribbean Collection",
    backdrop_path: "/wxgD3fB5lQ2sGJLog0rvXW049Pf.jpg",
    poster_path: "/zRBaZxS5YauLvRYjAdL4AUCwlht.jpg",
    media_type: "collection" as const,
    parts_count: 5,
    vote_average: 7.5,
  },
  {
    id: 87096,
    collection_id: 87096,
    name: "Avatar Collection",
    title: "Avatar Collection",
    backdrop_path: "/4uwX70EzaWVcGUXMtXPoexlNAff.jpg",
    poster_path: "/3C5brXxnBxfkeKWwA1Fh4xvy4wr.jpg",
    media_type: "collection" as const,
    parts_count: 3,
    vote_average: 7.8,
  },
  {
    id: 173710,
    collection_id: 173710,
    name: "Planet of the Apes (Reboot) Collection",
    title: "Planet of the Apes (Reboot) Collection",
    backdrop_path: "/iMhm0g555HgQNIXAMvnlgOiW5Rz.jpg",
    poster_path: "/afGkMC4HF0YtXYNkyfCgTDLFe6m.jpg",
    media_type: "collection" as const,
    parts_count: 4,
    vote_average: 7.4,
  },
  {
    id: 2344,
    collection_id: 2344,
    name: "The Matrix Collection",
    title: "The Matrix Collection",
    backdrop_path: "/bRm2DEgUiYciDw3myHuYFInD7la.jpg",
    poster_path: "/bV9qTVHTVf0gkW0j7p7M0ILD4pG.jpg",
    media_type: "collection" as const,
    parts_count: 4,
    vote_average: 7.4,
  },
  {
    id: 9485,
    collection_id: 9485,
    name: "The Fast and the Furious Collection",
    title: "The Fast and the Furious Collection",
    backdrop_path: "/z5A5W3WYJc3UVEWljSGwdjDgQ0j.jpg",
    poster_path: "/zOCnMPoUxgJK1RFPfN4PcnT16gr.jpg",
    media_type: "collection" as const,
    parts_count: 10,
    vote_average: 7.1,
  },
  {
    id: 448150,
    collection_id: 448150,
    name: "Deadpool Collection",
    title: "Deadpool Collection",
    backdrop_path: "/dTq7mGyAR5eAydR532feWfjJjzm.jpg",
    poster_path: "/30c5jO7YEXuF8KiWXLg9m28GWDA.jpg",
    media_type: "collection" as const,
    parts_count: 3,
    vote_average: 7.7,
  },
  {
    id: 328,
    collection_id: 328,
    name: "Jurassic Park Collection",
    title: "Jurassic Park Collection",
    backdrop_path: "/njFixYzIxX8jsn6KMSEtAzi4avi.jpg",
    poster_path: "/qIm2nHXLpBBdMxi8dvfrnDkBUDh.jpg",
    media_type: "collection" as const,
    parts_count: 6,
    vote_average: 7.0,
  },
  {
    id: 313086,
    collection_id: 313086,
    name: "The Conjuring Collection",
    title: "The Conjuring Collection",
    backdrop_path: "/kHZaX0vuhZdbuq0WKU3BpA9WIQ0.jpg",
    poster_path: "/z5VKhNSQKQyxm0co68HAkCqHnmX.jpg",
    media_type: "collection" as const,
    parts_count: 3,
    vote_average: 7.2,
  },
  {
    id: 8945,
    collection_id: 8945,
    name: "Mad Max Collection",
    title: "Mad Max Collection",
    backdrop_path: "/zI0q2ENcQOLECbe0gAEGlncVh2j.jpg",
    poster_path: "/tRxkZboyyXnFgCthoViWBwISZ0r.jpg",
    media_type: "collection" as const,
    parts_count: 5,
    vote_average: 7.2,
  },
];

export const getFranchiseCollections = async (history: any[] = []): Promise<any[]> => {
  const result: any[] = [];
  const seenColIds = new Set<number>();

  // 1. If history has movies with collections, prioritize user's started collections
  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(0, 10);
    for (const h of recent) {
      const colId = h.collection_id || h.belongs_to_collection?.id || h._colId;
      if (colId && !seenColIds.has(Number(colId))) {
        seenColIds.add(Number(colId));
        try {
          const colDetails = await getCollectionDetails(Number(colId));
          if (colDetails && (colDetails.backdrop_path || colDetails.poster_path)) {
            result.push({
              ...colDetails,
              collection_id: colDetails.id,
              collection_name: colDetails.name,
              parts_count: colDetails.parts?.length || 2,
              _isStarted: true,
            });
          }
        } catch {}
      }
    }
  }

  // 2. Append iconic popular franchises
  for (const franchise of POPULAR_FRANCHISE_COLLECTIONS) {
    if (!seenColIds.has(franchise.id)) {
      seenColIds.add(franchise.id);
      result.push(franchise);
    }
  }

  return result;
};

export const searchPeople = async (query: string, page: number = 1): Promise<TMDBPerson[]> => {
  try {
    const data = await fetchWithCache("/search/person", { query, page });
    return data.results.map((person: any) => ({
      id: person.id,
      name: person.name,
      profile_path: person.profile_path,
      popularity: person.popularity,
      known_for_department: person.known_for_department,
      biography: person.biography || "",
      birthday: person.birthday || null,
      place_of_birth: person.place_of_birth || null
    }));
  } catch (error) { return []; }
};

export const searchGenres = async (query: string): Promise<{ id: number; name: string }[]> => {
  try {
    const [movieGenres, tvGenres] = await Promise.all([ fetchWithCache("/genre/movie/list"), fetchWithCache("/genre/tv/list") ]);
    const allGenres = [...movieGenres.genres, ...tvGenres.genres];
    const uniqueGenres = Array.from(new Map(allGenres.map((g: any) => [g.id, g])).values());
    return uniqueGenres.filter((genre: any) => genre.name.toLowerCase().includes(query.toLowerCase()));
  } catch (error) { return []; }
};

export const getSimilarForHistory = async (history: any[]): Promise<{ sourceTitle: string; items: any[] }[]> => {
  const recent = (history || []).slice(0, 3);
  const results = await Promise.all(
    recent.map(async (item) => {
      try {
        const mediaType = item.mediaType || item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const mediaId = item.tmdbId || item.id;
        if (!mediaId) return null;
        const similar = await getSimilarMedia(mediaId, mediaType, 1);
        return { sourceTitle: item.title || item.name || '', items: similar.slice(0, 10) };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is { sourceTitle: string; items: any[] } => r !== null && r.items.length > 0);
};

/** Small, cache-first payload for the Explore landing page. */
export const fetchExploreHomeContent = async (
  languages: string[] = ["en"],
  preferredGenreIds: number[] = [],
  genreFilterId = 0,
  favoriteActors: { id: number; name: string }[] = [],
  forceRefresh = false,
) => {
  const selectedLanguages = (languages || []).filter((language) => language && language !== "en").slice(0, 1);
  const selectedGenres = genreFilterId ? [] : (preferredGenreIds || []).slice(0, 1);
  const selectedActors = (favoriteActors || []).slice(0, 1);
  const cacheKey = `EXPLORE_HOME_V1_${genreFilterId || "ALL"}_${selectedLanguages.join("_")}_${selectedGenres.join("_")}_${selectedActors.map((actor) => actor.id).join("_")}`;
  const cacheLifetime = 1000 * 60 * 20;

  if (!forceRefresh) {
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (stored) {
        const cached = JSON.parse(stored);
        if (cached.timestamp && Date.now() - cached.timestamp < cacheLifetime && cached.data) return cached.data;
      }
    } catch {}
  }

  if (forceRefresh) {
    ["/trending/movie/week", "/trending/tv/week", "/movie/top_rated", "/movie/upcoming", "/discover/movie", "/discover/tv", "/person/"].forEach(clearCache);
  }

  const onePage = async (endpoint: string, params: Record<string, unknown>, type: "movie" | "tv") => {
    try {
      const data = await fetchWithCache(endpoint, { ...params, page: 1 });
      const results = (data.results || []) as Record<string, unknown>[];
      return results.slice(0, 12).map((item) => ({ ...formatBasicItemData(item), media_type: type }));
    } catch {
      return [];
    }
  };

  const genreParams = genreFilterId ? { with_genres: genreFilterId, sort_by: "popularity.desc" } : {};
  const movieEndpoint = genreFilterId ? "/discover/movie" : "/trending/movie/week";
  const tvEndpoint = genreFilterId ? "/discover/tv" : "/trending/tv/week";
  const topEndpoint = genreFilterId ? "/discover/movie" : "/movie/top_rated";
  const topParams = genreFilterId
    ? { ...genreParams, sort_by: "vote_average.desc", "vote_count.gte": 300 }
    : {};
  const hiddenParams = {
    "vote_average.gte": 7.5,
    "vote_count.gte": 100,
    "vote_count.lte": 3000,
    sort_by: "vote_average.desc",
    ...genreParams,
  };

  const [movies, series, topRated, upcoming, hiddenGems, languageResults, actorResults, genreResults] = await Promise.all([
    onePage(movieEndpoint, genreParams, "movie"),
    onePage(tvEndpoint, genreParams, "tv"),
    onePage(topEndpoint, topParams, "movie"),
    onePage("/movie/upcoming", { region: "US" }, "movie"),
    onePage("/discover/movie", hiddenParams, "movie"),
    Promise.all(selectedLanguages.map(async (language) => {
      const [languageMovies, languageTV] = await Promise.all([
        onePage("/discover/movie", { with_original_language: language, sort_by: "popularity.desc" }, "movie"),
        onePage("/discover/tv", { with_original_language: language, sort_by: "popularity.desc" }, "tv"),
      ]);
      return [language, { movies: languageMovies, tv: languageTV }] as const;
    })),
    Promise.all(selectedActors.map(async (actor) => {
      try {
        const credits = await getPersonCombinedCredits(actor.id);
        return {
          actorId: actor.id,
          actorName: actor.name,
          items: credits.filter((item: TMDBResult) => item.poster_path).slice(0, 12),
        };
      } catch {
        return null;
      }
    })),
    Promise.all(selectedGenres.map(async (id) => ({
      genreId: id,
      items: await onePage("/discover/movie", { with_genres: id, sort_by: "popularity.desc" }, "movie"),
    }))),
  ]);

  const langData = Object.fromEntries(languageResults);
  const result = {
    heroMovies: movies.slice(0, 8),
    trendingMovies: movies,
    trendingTV: series,
    topRated,
    upcoming,
    hiddenGems,
    langData,
    actorData: actorResults.filter(Boolean),
    genreData: genreResults,
  };

  AsyncStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: result })).catch(() => {});
  return result;
};

export const getMoviesByGenre = async (genreId: number, page: number = 1): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache("/discover/movie", { with_genres: genreId, sort_by: "popularity.desc", page });
    return data.results.map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) { return []; }
};

export const fetchMoreContentByType = async (type: string, page: number = 1): Promise<TMDBResult[]> => {
  if (!type) return await getTrendingMovies(page);

  if (type.startsWith('genre/')) {
    const genreId = parseInt(type.split('/')[1]);
    if (isNaN(genreId)) return [];
    return await getMoviesByGenre(genreId, page);
  }

  if (type.startsWith('similar/')) {
    const parts = type.split('/');
    const mediaType = (parts[1] || 'movie') as 'movie' | 'tv';
    const id = parseInt(parts[2]);
    if (isNaN(id)) return [];
    return await getSimilarMedia(id, mediaType, page);
  }

  if (type.startsWith('lang-movies-')) {
    const lang = type.replace('lang-movies-', '');
    return await getLanguageMovies(lang, page);
  }

  if (type.startsWith('lang-tv-')) {
    const lang = type.replace('lang-tv-', '');
    return await getLanguageTV(lang, page);
  }

  if (type.startsWith('actor-')) {
    const actorId = parseInt(type.replace('actor-', ''));
    if (isNaN(actorId)) return [];
    try {
      const credits = await getPersonCombinedCredits(actorId);
      const filtered = credits.filter((item: any) => item.poster_path);
      const pageSize = 20;
      const start = (page - 1) * pageSize;
      return filtered.slice(start, start + pageSize);
    } catch {
      return [];
    }
  }

  if (type.startsWith('search:')) {
    return await searchTMDB(type.substring(7), page);
  }

  switch (type.toLowerCase()) {
    case 'trendingmovies':
      return await getTrendingMovies(page);
    case 'trendingtv':
      return await getTrendingTV(page);
    case 'toprated':
      return await getTopRated(page);
    case 'regional':
      return await getRegionalMovies('IN', page);
    case 'hindimovies':
      return await getLanguageMovies('hi', page);
    case 'malayalammovies':
      return await getLanguageMovies('ml', page);
    case 'tamilmovies':
      return await getLanguageMovies('ta', page);
    case 'koreanmovies':
      return await getLanguageMovies('ko', page);
    case 'japanesemovies':
      return await getLanguageMovies('ja', page);
    case 'hinditv':
      return await getLanguageTV('hi', page);
    case 'malayalamtv':
      return await getLanguageTV('ml', page);
    case 'koreantv':
      return await getLanguageTV('ko', page);
    case 'japanesetv':
      return await getLanguageTV('ja', page);
    case 'upcoming':
      return await getUpcomingMovies(page);
    case 'hiddengems':
      return await getHiddenGems(page);
    case 'nostalgia':
      return await getNostalgicMovies(page);
    case 'animatedmovies':
      return await getAnimatedMovies(page);
    case 'animemovies':
      return await getAnimeContent(page, true);
    case 'animeshows':
      return await getAnimeContent(page, false);
    default:
      return await getDiscoverMedia('movie', page, {}, type);
  }
};

// ==========================================
// 7. GEMINI AI RECOMMENDATIONS & CHAT
// ==========================================

export const getGeminiRecommendations = async (userPrompt: string): Promise<TMDBResult[]> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'search',
      userPrompt: userPrompt,
      customApiKey: GLOBAL_CONFIG.customApiKey
    });
    
    if (!response.data.results || response.data.results.length === 0) return [];

    const moviePromises = response.data.results.map(async (item: any) => {
      const results = await searchTMDB(item.title);
      return results.find(m => m.poster_path) || null;
    });

    const movies = await Promise.all(moviePromises);
    return movies.filter((m): m is TMDBResult => m !== null);

  } catch (error: any) {
    console.error("AI Proxy Error:", error.message);
    return [];
  }
};

export const getGeminiMoviesSimilarTo = async (title: string, mediaType: 'movie' | 'tv' = 'movie', tmdbId: number): Promise<TMDBResult[]> => {
  const cacheKey = `${mediaType}-${tmdbId}`;
  const cached = aiCache.get(cacheKey);
  
  if (cached) {
      const isExpired = (Date.now() - cached.timestamp) > AI_CACHE_TTL_MS;
      if (!isExpired) return cached.data;
      aiCache.delete(cacheKey);
  }

  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'recommend',
      title: title,
      mediaType: mediaType,
      tmdbId: tmdbId,
      customApiKey: GLOBAL_CONFIG.customApiKey
    });
    
    if (!response.data.results || response.data.results.length === 0) return [];

    const moviePromises = response.data.results.map(async (item: any) => {
      const results = await searchTMDB(item.title);
      return results.find(m => m.poster_path) || null;
    });

    const movies = await Promise.all(moviePromises);
    const validMovies = movies.filter((m): m is TMDBResult => m !== null);
    
    aiCache.set(cacheKey, { data: validMovies, timestamp: Date.now() });
    return validMovies;

  } catch (error: any) {
    console.error("AI Proxy Error:", error.message);
    return [];
  }
};

export const getGeminiLensInsight = async (
  title: string,
  mediaType: 'movie' | 'tv' = 'movie',
  year: string = '',
  overview: string = ''
): Promise<any> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'lens',
      title: title,
      mediaType: mediaType,
      year: year,
      overview: overview.slice(0, 500),
      customApiKey: GLOBAL_CONFIG.customApiKey
    });
    return response.data?.result || null;
  } catch (error: any) {
    console.error("Gemini Lens Error:", error);
    throw error;
  }
};

export const fetchChatGemini = async (
  message: string,
  history: any[] = [],
  userMemory: string = '',
  watchedTitles: string[] = [],
  watchlistTitles: string[] = [],
  watchlistCollections: string[] = [],
  userPreferences: any = null
): Promise<any> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'chat',
      message,
      history,
      userMemory,
      watchedTitles,
      watchlistTitles,
      watchlistCollections,
      userPreferences,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    });

    let reply = response.data?.reply || { kind: 'text', text: "I'm not sure how to answer that." };

    if (typeof reply === 'string') {
      try { reply = JSON.parse(reply); } catch {}
    }

    if (reply?.kind === 'text' && typeof reply.text === 'string' && reply.text.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(reply.text.trim());
        if (parsed && typeof parsed === 'object' && parsed.kind) {
          reply = parsed;
        }
      } catch {
        const match = reply.text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed && typeof parsed === 'object' && parsed.kind) {
              reply = parsed;
            }
          } catch {}
        }
      }
    }

    if (reply.kind === 'movies' && Array.isArray(reply.titles) && reply.titles.length > 0) {
      const moviePromises = reply.titles.map(async (t: string) => {
        try {
          const results = await searchTMDB(t);
          return results.find((m) => m.poster_path) || results[0] || null;
        } catch {
          return null;
        }
      });
      const resolvedMovies = await Promise.all(moviePromises);
      reply.movies = resolvedMovies.filter(Boolean);
    }

    if (reply.kind === 'actors' && Array.isArray(reply.names) && reply.names.length > 0) {
      const actorPromises = reply.names.map(async (n: string) => {
        try {
          const results = await searchPeople(n, 1);
          return results[0] || null;
        } catch {
          return null;
        }
      });
      const resolvedActors = await Promise.all(actorPromises);
      reply.actors = resolvedActors.filter(Boolean);
    }

    if (reply.kind === 'movie_detail' && reply.title) {
      try {
        const results = await searchTMDB(reply.title);
        reply.movie = results.find((m) => m.poster_path) || results[0] || null;
      } catch {
        reply.movie = null;
      }
    }

    return reply;
  } catch (error: any) {
    console.error('fetchChatGemini error:', error.message);
    throw error;
  }
};

export const updateUserMemoryWithAi = async (existingMemory: string, userMessage: string): Promise<string> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'update_memory',
      existingMemory,
      userMessage,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    });
    return response.data?.memory || existingMemory;
  } catch (e) {
    return existingMemory;
  }
};

export const fetchEmbedding = async (text: string): Promise<number[] | null> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/embed', {
      text,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    });
    return response.data?.embedding || null;
  } catch (error: any) {
    console.error('fetchEmbedding error:', error.message, error.response?.data);
    return null;
  }
};

export const fetchEmbeddingsBatch = async (texts: string[]): Promise<number[][] | null> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/embed', {
      texts,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    });
    return response.data?.embeddings || null;
  } catch (error: any) {
    console.error('fetchEmbeddingsBatch error:', error.message, error.response?.data);
    return null;
  }
};
