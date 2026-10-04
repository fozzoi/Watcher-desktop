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
  timeout: 15000, 
});

tmdbApi.interceptors.response.use(
  response => response,
  error => {
    return Promise.reject(error);
  }
);

// --- CACHE SETUP WITH TTL (Time-To-Live) ---
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 Hours
const AI_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 Hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const requestCache = new Map<string, CacheEntry<any>>();
const aiCache = new Map<string, CacheEntry<TMDBResult[]>>();

export const clearCache = (keyPrefix: string = "") => {
  if (keyPrefix === "") {
    requestCache.clear();
    aiCache.clear();
  } else {
    for (const key of requestCache.keys()) {
      if (key.startsWith(keyPrefix)) requestCache.delete(key);
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

  const cacheKey = createCacheKey(endpoint, params);
  const cached = requestCache.get(cacheKey);

  if (cached) {
    const isExpired = (Date.now() - cached.timestamp) > CACHE_TTL_MS;
    if (!isExpired) {
      return cached.data;
    }
    requestCache.delete(cacheKey);
  }
   
  try {
    const response = await tmdbApi.get(endpoint, { params });
    requestCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    return response.data;
  } catch (error) {
    throw error;
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
// 5. BATCH FETCH WITH ASYNC STORAGE (OFFLINE-FIRST)
// ==========================================

export const fetchAllDiscoveryContent = async (genreId?: number, forceRefresh = false) => {
  const gId = genreId === 0 ? undefined : genreId;
  const cacheKey = `EXPLORE_PAGE_DATA_${gId || 'ALL'}`;

  if (!forceRefresh) {
      try {
          const savedData = await AsyncStorage.getItem(cacheKey);
          if (savedData) {
              const parsed = JSON.parse(savedData);
              fetchFreshDiscoveryContent(gId, cacheKey); 
              return parsed;
          }
      } catch (e) {
          console.log("Failed to load local cache", e);
      }
  }

  return await fetchFreshDiscoveryContent(gId, cacheKey);
};

const fetchFreshDiscoveryContent = async (gId: number | undefined, cacheKey: string) => {
  try {
    const priorityResults = await Promise.all([
      getTrendingMovies(1, gId), getTrendingTV(1, gId), getTopRated(1, gId),
      getRegionalMovies('IN', 1, gId), getUpcomingMovies(1)
    ]);

    const secondaryResults = await Promise.all([
      getLanguageMovies('hi', 1, gId), getLanguageMovies('ml', 1, gId), getLanguageMovies('ta', 1, gId),
      getLanguageTV('hi', 1, gId), getLanguageTV('ml', 1, gId),
      getLanguageMovies('ko', 1, gId), getLanguageTV('ko', 1, gId),
      getLanguageMovies('ja', 1, gId), getLanguageTV('ja', 1, gId),
      getAnimeContent(1, true, gId), getAnimeContent(1, false, gId), getAnimatedMovies(1, gId),
      getHiddenGems(1, gId), getNostalgicMovies(1, gId)
    ]);
    
    const finalData = {
      trendingMovies: priorityResults[0], trendingTV: priorityResults[1], topRated: priorityResults[2], 
      regional: priorityResults[3], upcoming: priorityResults[4],
      
      hindiMovies: secondaryResults[0], malayalamMovies: secondaryResults[1], tamilMovies: secondaryResults[2],
      hindiTV: secondaryResults[3], malayalamTV: secondaryResults[4],
      koreanMovies: secondaryResults[5], koreanTV: secondaryResults[6],
      japaneseMovies: secondaryResults[7], japaneseTV: secondaryResults[8],
      animeMovies: secondaryResults[9], animeShows: secondaryResults[10], animatedMovies: secondaryResults[11],
      hiddenGems: secondaryResults[12], nostalgia: secondaryResults[13]
    };

    AsyncStorage.setItem(cacheKey, JSON.stringify(finalData)).catch(err => console.log(err));

    return finalData;
  } catch (error) {
    console.error("Error fetching discovery content:", error);
    return null;
  }
};

// ==========================================
// 6. DETAILS & OTHERS
// ==========================================

export const getFullDetails = async (item: TMDBResult): Promise<TMDBResult> => {
  try {
    const append = "credits,release_dates,content_ratings,external_ids,videos";
    const data = await fetchWithCache(`/${item.media_type}/${item.id}`, { append_to_response: append });

    let certification = null;
    if (item.media_type === "movie") {
      const usRelease = data.release_dates?.results?.find((r: any) => r.iso_3166_1 === "US");
      certification = usRelease?.release_dates?.[0]?.certification || null;
    } else {
      const usRating = data.content_ratings?.results?.find((r: any) => r.iso_3166_1 === "US");
      certification = usRating?.rating || null;
    }

    const cast = data.credits?.cast?.slice(0, 10).map((member: any) => ({
      id: member.id,
      name: member.name || "Unknown Actor",
      profile_path: member.profile_path || null,
      character: member.character || "Unknown Character"
    })) || [];

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
    if (item.media_type === "tv") {
      seasonsData = data.seasons || []; 
    }

    return {
      ...item,
      ...formatBasicItemData(data), 
      certification,
      cast,
      director,
      seasons: seasonsData,
      external_ids: data.external_ids, 
      videos: data.videos?.results || [],
      production_companies: data.production_companies || [],
      belongs_to_collection: data.belongs_to_collection || null,
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

export const getPersonCombinedCredits = async (personId: number): Promise<TMDBResult[]> => {
  const data = await fetchWithCache(`/person/${personId}/combined_credits`);
  const castItems = (data.cast || []).map((item: any) => ({
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

export const fetchPersonalisedDiscoveryContent = async (
  languages: string[] = ['en'],
  genreIds: number[] = [],
  genreFilterId: number = 0,
  forceRefresh = false,
  favoriteActors: any[] = []
) => {
  const gId = genreFilterId === 0 ? undefined : genreFilterId;
  const actorsKey = (favoriteActors || []).map((a: any) => a.id).join('_');
  const cacheKey = `PERSONALISED_PAGE_DATA_${languages.join('_')}_${genreIds.join('_')}_${actorsKey}_${gId || 'ALL'}`;

  if (!forceRefresh) {
    try {
      const saved = await AsyncStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        fetchFreshPersonalisedContent(languages, genreIds, favoriteActors, gId, cacheKey);
        return parsed;
      }
    } catch {}
  }

  return fetchFreshPersonalisedContent(languages, genreIds, favoriteActors, gId, cacheKey);
};

const fetchFreshPersonalisedContent = async (
  languages: string[],
  genreIds: number[],
  favoriteActors: any[],
  gId: number | undefined,
  cacheKey: string,
) => {
  try {
    const langSlice = (languages && languages.length > 0) ? languages.slice(0, 15) : ['en'];
    const langResults = await Promise.all(
      langSlice.flatMap(lang => [
        getLanguageMovies(lang, 1, gId),
        getLanguageTV(lang, 1, gId),
      ])
    );

    const langData: Record<string, { movies: any[]; tv: any[] }> = {};
    langSlice.forEach((lang, i) => {
      const movies = langResults[i * 2] ?? [];
      const tv = langResults[i * 2 + 1] ?? [];
      if (movies.length > 0 || tv.length > 0) {
        langData[lang] = { movies, tv };
      }
    });

    const actorSlice = (favoriteActors || []).slice(0, 4);
    const actorResults = await Promise.all(
      actorSlice.map(async (actor: any) => {
        try {
          const credits = await getPersonCombinedCredits(actor.id);
          const topItems = credits
            .filter((item: any) => item.poster_path && (item.vote_count || 0) > 10)
            .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 15);
          return {
            actorId: actor.id,
            actorName: actor.name,
            profilePath: actor.profile_path,
            items: topItems,
          };
        } catch {
          return null;
        }
      })
    );
    const actorData = actorResults.filter(Boolean);

    const genreSlice = (genreIds || []).slice(0, 3);
    const genreResults = await Promise.all(
      genreSlice.map(async (genreId: number) => {
        try {
          const movies = await getMoviesByGenre(genreId, 1);
          return {
            genreId,
            items: movies.slice(0, 15),
          };
        } catch {
          return null;
        }
      })
    );
    const genreData = genreResults.filter(Boolean);

    const base = await Promise.all([
      getTrendingMovies(1, gId),
      getTrendingTV(1, gId),
      getUpcomingMovies(1),
      getHiddenGems(1, gId),
      getTopRated(1, gId),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    const twoYearsAgoStr = `${new Date().getFullYear() - 2}-01-01`;

    const releasedTrending = base[0].filter((m: any) => {
      const relDate = m.release_date || '';
      return (
        relDate &&
        relDate <= todayStr &&
        relDate >= twoYearsAgoStr &&
        m.poster_path &&
        (m.vote_count || 0) >= 20
      );
    });
    const heroMovies = releasedTrending.length >= 5 
      ? releasedTrending.slice(0, 10) 
      : base[0].filter((m: any) => m.release_date && m.release_date <= todayStr).slice(0, 10);

    let personalizedTrending = [...base[0]];
    if (langSlice.length > 0) {
      const topLangMovies = langSlice.flatMap(l => (langData[l]?.movies || []).slice(0, 3));
      if (topLangMovies.length > 0) {
        const seen = new Set<number>();
        const merged: any[] = [];
        for (const m of [...base[0], ...topLangMovies]) {
          if (m && m.id && !seen.has(m.id)) {
            seen.add(m.id);
            merged.push(m);
          }
        }
        personalizedTrending = merged;
      }
    }

    const result = {
      heroMovies,
      trendingMovies: personalizedTrending,
      trendingTV: base[1],
      upcoming: base[2],
      hiddenGems: base[3],
      topRated: base[4],
      langData,
      actorData,
      genreData,
    };

    AsyncStorage.setItem(cacheKey, JSON.stringify(result)).catch(() => {});
    return result;
  } catch (error) {
    console.error('Error fetching personalised content:', error);
    return null;
  }
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
