"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Star, Heart, Play, Search, ExternalLink, Film, Tv, Clock, Sparkles, Layers, Info,
  Calendar, ChevronRight, ChevronLeft, ChevronDown, RotateCcw, RefreshCw, X, CheckCircle2, Video,
  MessageSquare, Copy, Check, Download, Send, ZoomIn
} from 'lucide-react';
import {
  getImageUrl, getMediaDetails, getMovieImages, getExternalIds, getSimilarMedia, getSeasonEpisodes,
  getGeminiMoviesSimilarTo, getGeminiLensInsight, getTrailers, getCollectionDetails, GLOBAL_CONFIG,
  getTmdbCacheSync, buildDetailUrl,
  TMDBResult, TMDBSeason, TMDBEpisode, TMDBVideo, TMDBImage, TMDBCollectionDetails
} from '@/utils/tmdb';
import { searchTorrents, TorrentResult } from '@/utils/Scraper';
import { getProgress, getShowEpisodeProgressMap, isEpisodeCompleted, WatchProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';
import { useImagePalette, warmPaletteForMedia, AMBIENT_PENDING_BG } from '@/utils/colorExtractor';
import MovieCard from '@/components/MovieCard';
import PageLoading from '@/components/PageLoading';
import axios from 'axios';
import { Split } from 'loading-dev';

// Picks black/white text for a given hex background
const readableOn = (hex: string) => {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#ffffff';
};

function DetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idStr = searchParams.get('id');
  const typeStr = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const tmdbId = Number(idStr);

  const getInitialSeed = useCallback((): TMDBResult | null => {
    if (!tmdbId) return null;
    // 1. Memory / persistent disk cache
    if (typeof window !== 'undefined') {
      const cached = getTmdbCacheSync(`/${typeStr}/${tmdbId}`);
      if (cached) return cached;
    }
    // 2. Query params from card navigation
    const title = searchParams.get('title') || searchParams.get('name');
    const poster_path = searchParams.get('poster_path');
    const backdrop_path = searchParams.get('backdrop_path');
    const overview = searchParams.get('overview');
    const vote_average = searchParams.get('vote_average');
    const release_date = searchParams.get('release_date') || searchParams.get('first_air_date');
    if (title || poster_path || backdrop_path) {
      return {
        id: tmdbId,
        media_type: typeStr,
        title: title || '',
        name: title || '',
        poster_path: poster_path || null,
        backdrop_path: backdrop_path || null,
        overview: overview || '',
        vote_average: vote_average ? Number(vote_average) : 0,
        release_date: release_date || undefined,
        first_air_date: release_date || undefined,
      } as TMDBResult;
    }
    // 3. Saved library from localStorage
    if (typeof window !== 'undefined') {
      try {
        const rawWatchlist = window.localStorage.getItem('watchlist');
        const rawHistory = window.localStorage.getItem('history');
        const list = [
          ...(rawWatchlist ? JSON.parse(rawWatchlist) : []),
          ...(rawHistory ? JSON.parse(rawHistory) : []),
        ];
        const match = list.find((item: any) => Number(item?.id ?? item?.media_id) === tmdbId);
        if (match) return match;
      } catch {}
    }
    return null;
  }, [tmdbId, typeStr, searchParams]);

  const [movie, setMovie] = useState<TMDBResult | null>(() => getInitialSeed());
  const movieRef = useRef(movie);
  movieRef.current = movie;
  const [galleryImages, setGalleryImages] = useState<TMDBImage[]>([]);
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState<number | null>(null);
  const [isGalleryMounted, setIsGalleryMounted] = useState(false);
  const [loading, setLoading] = useState<boolean>(() => movie === null);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [historyProgress, setHistoryProgress] = useState<WatchProgress | null>(null);
  const [episodeProgressMap, setEpisodeProgressMap] = useState<Record<string, WatchProgress>>({});
  const [collectionData, setCollectionData] = useState<TMDBCollectionDetails | null>(null);

  // Cast and recommendations
  const [castLimit, setCastLimit] = useState(15);
  const [similarMedia, setSimilarMedia] = useState<TMDBResult[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<TMDBResult[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  // TV Seasons & Episodes
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  // AI Insights Panel State
  const [aiTab, setAiTab] = useState<'lens' | 'chat' | 'vibe'>('lens');
  const [lensInsight, setLensInsight] = useState<any>(null);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensError, setLensError] = useState<string | null>(null);
  const [aiVibeError, setAiVibeError] = useState<string | null>(null);

  // Ambient color extraction
  const heroThumbUrl = movie?.poster_path
    ? getImageUrl(movie.poster_path, 'w500')
    : movie?.backdrop_path
    ? getImageUrl(movie.backdrop_path, 'w780')
    : null;
  const { palette } = useImagePalette(heroThumbUrl);
  const ambientBg = palette?.pastelDark || null;
  const dominantAccent = palette?.dominant || '#e50914';
  const onAccent = readableOn(dominantAccent);

  // Carousel refs
  const castScrollRef = useRef<HTMLDivElement>(null);
  const episodesScrollRef = useRef<HTMLDivElement>(null);
  const similarScrollRef = useRef<HTMLDivElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);

  const scrollCarousel = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const amount = ref.current.clientWidth * 0.75;
      ref.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  useEffect(() => setIsGalleryMounted(true), []);

  // Ambient body background and root CSS sync (for navigation tab bar / sidebar)
  useEffect(() => {
    if (!ambientBg) return;
    document.documentElement.style.setProperty('--page-ambient-bg', ambientBg);
    if (dominantAccent) {
      document.documentElement.style.setProperty('--page-ambient-accent', dominantAccent);
    }
    const prevBg = document.body.style.backgroundColor;
    const prevBgImage = document.body.style.backgroundImage;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevHtmlBgImage = document.documentElement.style.backgroundImage;

    document.documentElement.style.backgroundColor = ambientBg;
    document.documentElement.style.backgroundImage = 'none';
    document.body.style.backgroundColor = ambientBg;
    document.body.style.backgroundImage = 'none';
    document.documentElement.classList.add('is-ambient-page');
    document.body.classList.add('is-ambient-page');

    return () => {
      document.documentElement.style.removeProperty('--page-ambient-bg');
      document.documentElement.style.removeProperty('--page-ambient-accent');
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.documentElement.style.backgroundImage = prevHtmlBgImage;
      document.body.style.backgroundColor = prevBg;
      document.body.style.backgroundImage = prevBgImage;
      document.documentElement.classList.remove('is-ambient-page');
      document.body.classList.remove('is-ambient-page');
    };
  }, [ambientBg, dominantAccent]);

  // Reset cast pagination and ensure scroll position starts at 0 (first cast member)
  useEffect(() => {
    setCastLimit(15);
    if (castScrollRef.current) {
      castScrollRef.current.scrollLeft = 0;
    }
  }, [movie?.id]);

  useEffect(() => {
    if (selectedGalleryIndex === null) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedGalleryIndex]);

  useEffect(() => {
    if (selectedGalleryIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedGalleryIndex(null);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        setSelectedGalleryIndex((current) => {
          if (current === null || galleryImages.length === 0) return null;
          return (current + direction + galleryImages.length) % galleryImages.length;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGalleryIndex, galleryImages.length]);

  const moveGalleryImage = (direction: -1 | 1) => {
    setSelectedGalleryIndex((current) => {
      if (current === null || galleryImages.length === 0) return null;
      return (current + direction + galleryImages.length) % galleryImages.length;
    });
  };

  // Trailers
  const [trailers, setTrailers] = useState<TMDBVideo[]>([]);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);

  // Torrent Scraper Modal
  const [showTorrentModal, setShowTorrentModal] = useState(false);
  const [torrents, setTorrents] = useState<TorrentResult[]>([]);
  const [torrentLoading, setTorrentLoading] = useState(false);
  const [copiedMagnet, setCopiedMagnet] = useState<string | null>(null);

  // In-Tab Movie AI Chat
  const [movieChatMessages, setMovieChatMessages] = useState<{ role: 'user' | 'bot'; text: string }[]>([]);
  const [movieChatInput, setMovieChatInput] = useState('');
  const [movieChatLoading, setMovieChatLoading] = useState(false);
  const [isCopiedLink, setIsCopiedLink] = useState(false);

  // Franchise collection
  useEffect(() => {
    if (movie?.belongs_to_collection?.id) {
      getCollectionDetails(movie.belongs_to_collection.id)
        .then((col) => setCollectionData(col))
        .catch(() => {});
    } else {
      setCollectionData(null);
    }
  }, [movie?.belongs_to_collection?.id]);

  useEffect(() => {
    if (!tmdbId) return;
    if (movieRef.current?.id !== tmdbId) {
      const seed = getInitialSeed();
      if (seed) {
        setMovie(seed);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
  }, [tmdbId, getInitialSeed]);

  const fetchDetails = useCallback(async () => {
    if (!tmdbId || !typeStr) return;
    if (!movieRef.current) {
      setLoading(true);
    }
    setGalleryImages([]);
    setSelectedGalleryIndex(null);
    try {
      const details = await getMediaDetails(tmdbId, typeStr);
      setMovie((prev) => ({ ...(prev || {}), ...details }));
      setCastLimit(15);
      requestAnimationFrame(() => {
        if (castScrollRef.current) {
          castScrollRef.current.scrollLeft = 0;
        }
      });
      setLoading(false);

      // Gallery images: background fetch
      void getMovieImages(tmdbId, typeStr).then(setGalleryImages).catch(() => {});

      // Trailers: use details.videos if already present, or fetch on demand
      if (details.videos && details.videos.length > 0) {
        setTrailers(details.videos);
      } else {
        void getTrailers(tmdbId, typeStr).then(setTrailers).catch(() => {});
      }

      // Similar: use details.recommendations if already present, or fetch on demand
      if (details.recommendations && details.recommendations.length > 0) {
        setSimilarMedia(details.recommendations.slice(0, 10));
      } else {
        void getSimilarMedia(tmdbId, typeStr).then((sim) => setSimilarMedia(sim.slice(0, 10))).catch(() => {});
      }

      // Parallelize progress and TV season loading
      const [progress, epMap, storedSeasonStr] = await Promise.all([
        getProgress(tmdbId),
        typeStr === 'tv' ? getShowEpisodeProgressMap(tmdbId) : Promise.resolve(null),
        typeStr === 'tv' ? AsyncStorage.getItem(`@selected_season:${tmdbId}`) : Promise.resolve(null),
      ]);

      if (progress) setHistoryProgress(progress);
      if (epMap) setEpisodeProgressMap(epMap);

      if (typeStr === 'tv' && details.seasons && details.seasons.length > 0) {
        const storedSeason = storedSeasonStr ? parseInt(storedSeasonStr, 10) : null;
        const savedSeason = progress?.lastSeason || storedSeason;
        const validSavedSeason =
          savedSeason && details.seasons.some((s: any) => s.season_number === savedSeason) ? savedSeason : null;
        const firstSeason = details.seasons.find((s) => s.season_number > 0) || details.seasons[0];
        setSelectedSeason(validSavedSeason ?? firstSeason.season_number);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tmdbId, typeStr]);

  const loadWatchlistState = useCallback(async () => {
    try {
      const [stored, historyStr] = await Promise.all([
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('history'),
      ]);
      if (stored) {
        const list = JSON.parse(stored);
        setWatchlistIds(new Set(list.map((i: any) => i.id)));
        setIsInWatchlist(list.some((item: any) => item.id === tmdbId && (!item.media_type || item.media_type === typeStr)));
      } else {
        setWatchlistIds(new Set());
        setIsInWatchlist(false);
      }
      if (historyStr) {
        const hList = JSON.parse(historyStr);
        setIsWatched(hList.some((item: any) => item.id === tmdbId && (!item.media_type || item.media_type === typeStr)));
      } else {
        setIsWatched(false);
      }
    } catch (e) {}
  }, [tmdbId, typeStr]);

  useEffect(() => {
    fetchDetails();
    loadWatchlistState();
  }, [fetchDetails, loadWatchlistState]);

  useEffect(() => {
    const refreshLibraryState = () => { void loadWatchlistState(); };
    const refreshProgressState = () => {
      if (!tmdbId) return;
      void Promise.all([
        getProgress(tmdbId),
        AsyncStorage.getItem(`@selected_season:${tmdbId}`)
      ]).then(([prog, savedSeasonStr]) => {
        setHistoryProgress(prog || null);
        const seasonToSelect = prog?.lastSeason || (savedSeasonStr ? parseInt(savedSeasonStr, 10) : null);
        if (typeStr === 'tv' && seasonToSelect) {
          setSelectedSeason(seasonToSelect);
        }
      });
      if (typeStr === 'tv') {
        void getShowEpisodeProgressMap(tmdbId).then((map) => {
          setEpisodeProgressMap(map);
        });
      }
    };
    const onWindowActive = () => {
      refreshProgressState();
    };

    window.addEventListener('watcher_cloud_synced', refreshLibraryState);
    window.addEventListener('watcher_cloud_synced', refreshProgressState);
    window.addEventListener('watcher_local_library_changed', refreshLibraryState);
    window.addEventListener('watcher_watch_progress_changed', refreshProgressState);
    window.addEventListener('focus', onWindowActive);
    window.addEventListener('pageshow', onWindowActive);
    window.addEventListener('popstate', onWindowActive);
    return () => {
      window.removeEventListener('watcher_cloud_synced', refreshLibraryState);
      window.removeEventListener('watcher_cloud_synced', refreshProgressState);
      window.removeEventListener('watcher_local_library_changed', refreshLibraryState);
      window.removeEventListener('watcher_watch_progress_changed', refreshProgressState);
      window.removeEventListener('focus', onWindowActive);
      window.removeEventListener('pageshow', onWindowActive);
      window.removeEventListener('popstate', onWindowActive);
    };
  }, [loadWatchlistState, tmdbId, typeStr]);

  // Manual trigger for Gemini AI vibes
  const handleFetchAiVibes = async () => {
    if (!movie) return;
    setLoadingAi(true);
    setAiVibeError(null);
    try {
      const aiData = await getGeminiMoviesSimilarTo(movie.title || movie.name || '', typeStr, tmdbId);
      setAiRecommendations(aiData);
      if (!aiData || aiData.length === 0) {
        setAiVibeError('No matching vibe titles found.');
      }
    } catch (e: any) {
      setAiVibeError('Failed to generate vibe recommendations.');
    } finally {
      setLoadingAi(false);
    }
  };

  // Load episodes when season changes
  useEffect(() => {
    if (typeStr !== 'tv' || selectedSeason === null) return;
    const fetchEpisodes = async () => {
      setLoadingEpisodes(true);
      try {
        const epData = await getSeasonEpisodes(tmdbId, selectedSeason);
        setEpisodes(epData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingEpisodes(false);
      }
    };
    fetchEpisodes();
  }, [selectedSeason, typeStr, tmdbId]);

  // Close season dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(e.target as Node)) {
        setIsSeasonDropdownOpen(false);
      }
    };
    if (isSeasonDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSeasonDropdownOpen]);

  const toggleWatchlist = async () => {
    if (!movie) return;
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      let currentList = stored ? JSON.parse(stored) : [];
      const targetId = Number(movie.id);
      if (currentList.some((i: any) => Number(i.id) === targetId)) {
        currentList = currentList.filter((i: any) => Number(i.id) !== targetId);
        setIsInWatchlist(false);
      } else {
        const itemToSave = {
          ...movie,
          id: targetId,
          media_type: movie.media_type || typeStr || 'movie',
          added_at: Date.now(),
        };
        currentList = [itemToSave, ...currentList.filter((i: any) => Number(i.id) !== targetId)];
        setIsInWatchlist(true);
      }
      await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleWatched = async () => {
    if (!movie) return;
    try {
      const stored = await AsyncStorage.getItem('history');
      let list = stored ? JSON.parse(stored) : [];
      const targetId = Number(movie.id);
      const isAlreadyWatched = list.some((i: any) => Number(i.id) === targetId && (!i.media_type || i.media_type === typeStr));
      if (isAlreadyWatched) {
        list = list.filter((i: any) => !(Number(i.id) === targetId && (!i.media_type || i.media_type === typeStr)));
        setIsWatched(false);
      } else {
        const now = Date.now();
        const itemToSave = {
          ...movie,
          id: targetId,
          media_type: movie.media_type || typeStr || 'movie',
          added_at: now,
          created_at: now,
          watchedAt: now,
        };
        list = [itemToSave, ...list.filter((i: any) => !(Number(i.id) === targetId && (!i.media_type || i.media_type === typeStr)))];
        setIsWatched(true);
        const wStr = await AsyncStorage.getItem('watchlist');
        if (wStr) {
          const wList = JSON.parse(wStr);
          const filtered = wList.filter((i: any) => !(Number(i.id) === targetId && (!i.media_type || i.media_type === typeStr)));
          if (filtered.length !== wList.length) {
            await AsyncStorage.setItem('watchlist', JSON.stringify(filtered));
            setIsInWatchlist(false);
          }
        }
      }
      await AsyncStorage.setItem('history', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  const handleFetchLensInsight = async () => {
    if (!movie) return;
    setLensLoading(true);
    setLensError(null);
    try {
      const year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
      const result = await getGeminiLensInsight(
        movie.title || movie.name || '',
        typeStr,
        year,
        movie.overview || ''
      );
      if (result) {
        setLensInsight(result);
      } else {
        setLensError('No insight returned.');
      }
    } catch (e: any) {
      setLensError(e.message || 'Failed to fetch Lens insight.');
    } finally {
      setLensLoading(false);
    }
  };

  const handleOpenTrailer = () => {
    const officialTrailer = trailers.find((t) => t.type === 'Trailer' && t.site === 'YouTube') || trailers[0];
    if (officialTrailer) {
      setActiveTrailerKey(officialTrailer.key);
      setShowTrailerModal(true);
    } else {
      alert('No video trailer available for this title.');
    }
  };

  const handleOpenTorrents = async () => {
    setShowTorrentModal(true);
    if (torrents.length > 0) return;
    setTorrentLoading(true);
    try {
      const results = await searchTorrents(movie?.title || movie?.name || '');
      setTorrents(results);
    } catch (e) {
      console.error(e);
    } finally {
      setTorrentLoading(false);
    }
  };

  const handleCopyMagnet = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedMagnet(url);
    setTimeout(() => setCopiedMagnet(null), 2000);
  };

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setIsCopiedLink(true);
      setTimeout(() => setIsCopiedLink(false), 2000);
    }
  };

  const handleSendMovieChat = async () => {
    if (!movieChatInput.trim() || movieChatLoading) return;
    const userMsg = movieChatInput.trim();
    setMovieChatInput('');
    setMovieChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setMovieChatLoading(true);

    try {
      const title = movie?.title || movie?.name || '';
      const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
        action: 'chat',
        message: `Regarding the movie/TV show "${title}" (${movie?.release_date || movie?.first_air_date || ''}): ${userMsg}`,
        customApiKey: GLOBAL_CONFIG.customApiKey,
      });
      const botText =
        response.data?.reply?.text ||
        (typeof response.data?.reply === 'string' ? response.data.reply : "I couldn't process that question.");
      setMovieChatMessages((prev) => [...prev, { role: 'bot', text: botText }]);
    } catch {
      setMovieChatMessages((prev) => [...prev, { role: 'bot', text: 'Sorry, I had trouble answering that right now.' }]);
    } finally {
      setMovieChatLoading(false);
    }
  };

  if (loading) {
    return <PageLoading label="Loading title details" className="min-h-screen" />;
  }

  if (!movie) {
    return (
      <div className="empty-state">
        <Info size={32} />
        <p>Media details could not be loaded or timed out.</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <button className="btn-primary" onClick={() => { setLoading(true); void fetchDetails(); }}>
            <RefreshCw size={15} />
            <span>Retry</span>
          </button>
          <button className="btn-secondary" onClick={() => router.push('/')}>Go Home</button>
        </div>
      </div>
    );
  }

  const titleText = movie.title || movie.name;
  const ratingText = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const yearText = (movie.release_date || movie.first_air_date || '').substring(0, 4);

  // Completion & next episode calculation
  const isCompleted = isEpisodeCompleted(historyProgress);
  let playTargetSeason = 1;
  let playTargetEpisode = 1;
  let playIsNext = false;

  if (typeStr === 'tv') {
    if (historyProgress) {
      const lastS = historyProgress.lastSeason || 1;
      const lastE = historyProgress.lastEpisode || 1;
      if (!isCompleted) {
        playTargetSeason = lastS;
        playTargetEpisode = lastE;
      } else {
        playIsNext = true;
        const currentSeasonMeta = movie?.seasons?.find((s: any) => s.season_number === lastS);
        const epCount =
          currentSeasonMeta?.episode_count ||
          (episodes.length > 0 && selectedSeason === lastS ? episodes.length : 999);
        if (lastE < epCount) {
          playTargetSeason = lastS;
          playTargetEpisode = lastE + 1;
        } else {
          const nextSeasonMeta = movie?.seasons?.find((s: any) => s.season_number > lastS && s.episode_count > 0);
          if (nextSeasonMeta) {
            playTargetSeason = nextSeasonMeta.season_number;
            playTargetEpisode = 1;
          } else {
            playTargetSeason = lastS;
            playTargetEpisode = lastE;
            playIsNext = false;
          }
        }
      }
    } else {
      playTargetSeason = selectedSeason || 1;
      playTargetEpisode = 1;
    }
  }

  const tvButtonLabel = !historyProgress
    ? 'Play Episode 1'
    : isCompleted
    ? playIsNext
      ? `Play S${playTargetSeason}:E${playTargetEpisode}`
      : 'Watch Again (S1:E1)'
    : `Resume S${playTargetSeason}:E${playTargetEpisode}`;

  const movieButtonLabel = !historyProgress ? 'Play Movie' : isCompleted ? 'Watch Again' : 'Resume Movie';

  const formatAirDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className={`detail-container ${ambientBg ? 'is-ambient' : ''}`}
      style={{
        ['--detail-ambient-bg' as any]: ambientBg || 'var(--bg-color)',
        ['--detail-ambient-accent' as any]: dominantAccent,
        ['--accent' as any]: dominantAccent,
        ['--on-accent' as any]: onAccent,
        // re-point the theme primary so every var(--primary) follows the poster colour
        ['--primary' as any]: dominantAccent,
        ['--primary-glow' as any]: `${dominantAccent}66`,
        ['--primary-gradient' as any]: `linear-gradient(135deg, ${dominantAccent}, color-mix(in srgb, ${dominantAccent} 65%, #000))`,
        backgroundColor: ambientBg || 'var(--bg-color)',
        minHeight: '100vh',
        transition: 'background-color 0.4s ease',
      }}
    >
      {/* Backdrop banner */}
      <div className="backdrop-header">
        <img
          src={getImageUrl(movie.backdrop_path || movie.poster_path, 'original')}
          alt={titleText}
          className="backdrop-img"
        />
        <div className="backdrop-overlay" />
        <button className="back-btn glass" onClick={() => router.back()} title="Go Back">
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="detail-content-wrapper animate-fade-in-up">
        {/* ───────── HERO (full width) ───────── */}
        <section className="hero-row">
          <div className="main-meta-box">
            <div
              className="poster-box"
              style={{ boxShadow: `0 16px 40px rgba(0, 0, 0, 0.6), 0 0 40px ${dominantAccent}40`, borderColor: `${dominantAccent}55` }}
            >
              <img src={getImageUrl(movie.poster_path, 'w500')} alt={titleText} className="poster-img" />
            </div>

            <div className="meta-details">
              <h1 className="movie-title">{titleText}</h1>
              {movie.tagline && <p className="tagline">"{movie.tagline}"</p>}

              <div className="details-badges">
                <div className="rating-badge">
                  <Star size={14} fill="currentColor" stroke="currentColor" />
                  <span>{ratingText}</span>
                </div>
                <span className="badge year" title="Release Date">
                  {movie.release_date || movie.first_air_date || 'Unknown Date'}
                </span>
                {movie.original_language && (
                  <span className="badge lang" style={{ textTransform: 'uppercase' }} title="Original Language">
                    {movie.original_language}
                  </span>
                )}
                {typeStr === 'tv' && movie.number_of_seasons && (
                  <span className="badge seasons-count">{movie.number_of_seasons} Seasons</span>
                )}
                {movie.runtime ? (
                  <span className="badge runtime">
                    <Clock size={12} />
                    <span>{movie.runtime} min</span>
                  </span>
                ) : null}
                {movie.certification && <span className="badge rating">{movie.certification}</span>}
                {movie.genres && movie.genres.length > 0 && (
                  <span className="badge genre-badge">
                    {movie.genres.map((g) => g.name).slice(0, 3).join(' • ')}
                  </span>
                )}
              </div>

              <div className="detail-actions">
                {typeStr === 'movie' ? (
                  <Link
                    href={`/player?id=${movie.id}&type=movie&title=${encodeURIComponent(titleText || '')}&poster=${encodeURIComponent(movie.poster_path || '')}${isCompleted ? '&restart=true' : ''}`}
                    className="btn-primary"
                  >
                    <Play size={18} fill="currentColor" />
                    <span>{movieButtonLabel}</span>
                  </Link>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const finalS = isCompleted && !playIsNext ? 1 : playTargetSeason;
                      const finalE = isCompleted && !playIsNext ? 1 : playTargetEpisode;
                      router.push(
                        `/player?id=${movie.id}&type=tv&title=${encodeURIComponent(titleText || '')}&season=${finalS}&episode=${finalE}&poster=${encodeURIComponent(movie.poster_path || '')}`
                      );
                    }}
                  >
                    <Play size={18} fill="currentColor" />
                    <span>{tvButtonLabel}</span>
                  </button>
                )}

                {trailers.length > 0 && (
                  <button className="btn-secondary" onClick={handleOpenTrailer}>
                    <Video size={18} />
                    <span>Trailer</span>
                  </button>
                )}

                <button
                  className={`btn-secondary ${isInWatchlist ? 'watchlist-added' : ''}`}
                  onClick={toggleWatchlist}
                >
                  <Heart
                    size={18}
                    fill={isInWatchlist ? 'var(--accent)' : 'none'}
                    color={isInWatchlist ? 'var(--accent)' : 'currentColor'}
                  />
                  <span>{isInWatchlist ? 'In Watchlist' : 'Watchlist'}</span>
                </button>

                <button
                  className={`btn-secondary ${isWatched ? 'watched-active' : ''}`}
                  onClick={toggleWatched}
                  title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                >
                  <CheckCircle2
                    size={18}
                    color={isWatched ? '#30D158' : 'currentColor'}
                    fill={isWatched ? 'rgba(48, 209, 88, 0.2)' : 'none'}
                  />
                  <span>{isWatched ? 'Watched' : 'Mark Watched'}</span>
                </button>

                <button className="btn-secondary" onClick={handleOpenTorrents}>
                  <Download size={18} />
                  <span>Torrents</span>
                </button>

                <button className="btn-secondary" onClick={handleCopyShareLink} title="Copy Link">
                  {isCopiedLink ? <Check size={18} color="#30D158" /> : <Copy size={18} />}
                  <span>{isCopiedLink ? 'Copied!' : 'Share'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Playback resume */}
          {historyProgress && (
            <div className="resume-play-box tint-card animate-fade-in-up">
              <div className="resume-info">
                <Film size={20} className="resume-icon" />
                <div>
                  <h4>{isCompleted ? (playIsNext ? 'Up Next' : 'Completed') : 'Resume Playback'}</h4>
                  <p>
                    {typeStr === 'tv'
                      ? `Season ${playTargetSeason}, Episode ${playTargetEpisode}`
                      : isCompleted
                      ? 'Completed'
                      : 'Movie'}
                  </p>
                </div>
              </div>
              <Link
                href={`/player?id=${movie.id}&type=${typeStr}&title=${encodeURIComponent(titleText || '')}&season=${isCompleted && !playIsNext ? 1 : playTargetSeason}&episode=${isCompleted && !playIsNext ? 1 : playTargetEpisode}`}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {isCompleted ? (playIsNext ? 'Play Next' : 'Watch Again') : 'Resume Play'}
              </Link>
            </div>
          )}
        </section>

        {/* ───────── MAIN + SIDEBAR ───────── */}
        <div className="desktop-layout-grid">
          {/* MAIN COLUMN */}
          <main className="detail-main-col">
            {/* Synopsis */}
            <div className="synopsis-box tint-card">
              <h2>Synopsis</h2>
              <p className="overview-text">{movie.overview}</p>
            </div>

            {/* Episodes */}
            {typeStr === 'tv' && movie.seasons && movie.seasons.length > 0 && (
              <div className="episodes-section" id="episodes-section">
                <div className="section-header-tv">
                  <h2>Episodes</h2>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="carousel-nav-arrows">
                      <button className="nav-arrow-btn" onClick={() => scrollCarousel(episodesScrollRef, 'left')} aria-label="Scroll episodes left">
                        <ChevronLeft size={18} />
                      </button>
                      <button className="nav-arrow-btn" onClick={() => scrollCarousel(episodesScrollRef, 'right')} aria-label="Scroll episodes right">
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    <div className="season-selector-wrapper" ref={seasonDropdownRef}>
                      <button
                        type="button"
                        className={`season-trigger-btn ${isSeasonDropdownOpen ? 'open' : ''}`}
                        onClick={() => setIsSeasonDropdownOpen((prev) => !prev)}
                        aria-expanded={isSeasonDropdownOpen}
                        aria-haspopup="listbox"
                      >
                        <span className="season-trigger-label">
                          {(() => {
                            const current = movie.seasons.find((s) => s.season_number === (selectedSeason || 1));
                            return current
                              ? `${current.name} (${current.episode_count} Episodes)`
                              : `Season ${selectedSeason || 1}`;
                          })()}
                        </span>
                        <ChevronDown size={15} className={`season-chevron ${isSeasonDropdownOpen ? 'rotated' : ''}`} />
                      </button>

                      {isSeasonDropdownOpen && (
                        <div className="season-dropdown-menu animate-fade-in" role="listbox">
                          {movie.seasons
                            .filter((s) => s.season_number > 0)
                            .map((s) => {
                              const isCurrent = s.season_number === (selectedSeason || 1);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={`season-option-item ${isCurrent ? 'selected' : ''}`}
                                  onClick={() => {
                                    setSelectedSeason(s.season_number);
                                    setIsSeasonDropdownOpen(false);
                                    void AsyncStorage.setItem(`@selected_season:${tmdbId}`, String(s.season_number));
                                  }}
                                  role="option"
                                  aria-selected={isCurrent}
                                >
                                  <div className="season-opt-info">
                                    <span className="season-opt-name">{s.name}</span>
                                    <span className="season-opt-count">{s.episode_count} Episodes</span>
                                  </div>
                                  {isCurrent && <Check size={15} className="season-opt-check" />}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {loadingEpisodes ? (
                  <PageLoading label="Loading episodes" />
                ) : episodes.length > 0 ? (
                  <div className="episodes-carousel-wrapper">
                    <div className="episodes-scroll-container" ref={episodesScrollRef}>
                      {episodes.map((ep) => {
                        const epKey = `tv:${movie.id}:${ep.season_number}:${ep.episode_number}`;
                        const epProg = episodeProgressMap[epKey];
                        const isEpDone = epProg ? isEpisodeCompleted(epProg) : false;
                        const hasEpProg = Boolean(
                          epProg && (epProg.position > 0 || (typeof epProg.percentage === 'number' && epProg.percentage > 0))
                        );
                        const epPercentage =
                          epProg && typeof epProg.percentage === 'number'
                            ? epProg.percentage
                            : epProg && epProg.duration > 0
                            ? Math.round((epProg.position / epProg.duration) * 100)
                            : 0;

                        const lastS = historyProgress?.lastSeason || 1;
                        const lastE = historyProgress?.lastEpisode || 1;
                        const isPriorEpisode = Boolean(
                          historyProgress &&
                            (ep.season_number < lastS || (ep.season_number === lastS && ep.episode_number < lastE))
                        );
                        const isResumeTarget = Boolean(
                          historyProgress &&
                            historyProgress.lastSeason === ep.season_number &&
                            historyProgress.lastEpisode === ep.episode_number
                        );
                        const isResumeDone = isResumeTarget && isEpisodeCompleted(historyProgress);
                        const isPlayed = isEpDone || isResumeDone || (isPriorEpisode && !hasEpProg);

                        return (
                          <div key={ep.id} className="episode-card-item">
                            <Link
                              href={`/player?id=${movie.id}&type=tv&title=${encodeURIComponent(titleText || '')}&season=${ep.season_number}&episode=${ep.episode_number}&poster=${encodeURIComponent(movie.poster_path || '')}`}
                              className={`episode-item-card ${isResumeTarget ? 'episode-active' : ''} ${isPlayed ? 'episode-watched' : ''}`}
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(
                                  `/player?id=${movie.id}&type=tv&title=${encodeURIComponent(titleText || '')}&season=${ep.season_number}&episode=${ep.episode_number}&poster=${encodeURIComponent(movie.poster_path || '')}`
                                );
                              }}
                            >
                              <div className="ep-still-box">
                                <img
                                  src={getImageUrl(ep.still_path || movie.backdrop_path || movie.poster_path, 'w500')}
                                  alt={ep.name}
                                  className="ep-still-img"
                                  loading="lazy"
                                />

                                <div className="ep-badge-pill">
                                  <span>EP {ep.episode_number}</span>
                                </div>

                                {isPlayed ? (
                                  <div className="ep-played-pill">
                                    <Check size={11} strokeWidth={3} />
                                    <span>Played</span>
                                  </div>
                                ) : null}

                                {ep.runtime && ep.runtime > 0 ? (
                                  <div className="ep-runtime-pill">
                                    <span>{ep.runtime}m</span>
                                  </div>
                                ) : null}

                                {hasEpProg && !isPlayed ? (
                                  <div className="ep-progress-bar-container">
                                    <div
                                      className="ep-progress-bar-fill"
                                      style={{ width: `${Math.min(100, Math.max(5, epPercentage))}%` }}
                                    />
                                  </div>
                                ) : null}

                                <div className="ep-play-overlay">
                                  <div className="ep-play-circle">
                                    <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                                  </div>
                                </div>
                              </div>

                              <div className="ep-details">
                                <h3 className="ep-title" title={`Episode ${ep.episode_number}: ${ep.name}`}>
                                  {ep.episode_number}. {ep.name || `Episode ${ep.episode_number}`}
                                </h3>

                                <div className="ep-meta-row">
                                  {ep.air_date ? (
                                    <span className="ep-meta-item">
                                      <Calendar size={11} />
                                      <span>{formatAirDate(ep.air_date)}</span>
                                    </span>
                                  ) : null}
                                  {ep.vote_average && ep.vote_average > 0 ? (
                                    <span className="ep-meta-item ep-rating-item">
                                      <Star size={11} fill="#FFB800" color="#FFB800" />
                                      <span>{ep.vote_average.toFixed(1)}</span>
                                    </span>
                                  ) : null}
                                  {isResumeTarget ? (
                                    <span className="ep-resume-badge">{isEpDone ? 'Next' : 'Resume'}</span>
                                  ) : null}
                                  {isPlayed ? (
                                    <span className="ep-played-badge">
                                      <Check size={11} strokeWidth={2.5} />
                                      <span>Played</span>
                                    </span>
                                  ) : null}
                                </div>

                                <p className="ep-overview">{ep.overview || 'No episode description available.'}</p>
                              </div>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="empty-text">No episodes found for this season.</p>
                )}
              </div>
            )}

            {/* Gallery */}
            {galleryImages.length > 0 && (
              <section className="gallery-section animate-fade-in-up" aria-label="Scenes and posters">
                <div className="gallery-heading">
                  <h2>Scenes &amp; Posters</h2>
                  <span>{galleryImages.length}</span>
                  <div className="gallery-controls">
                    <button type="button" className="gallery-scroll-btn" onClick={() => scrollCarousel(galleryScrollRef, 'left')} aria-label="Scroll gallery left">
                      <ChevronLeft size={18} />
                    </button>
                    <button type="button" className="gallery-scroll-btn" onClick={() => scrollCarousel(galleryScrollRef, 'right')} aria-label="Scroll gallery right">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="gallery-track" ref={galleryScrollRef}>
                  {galleryImages.map((image, index) => {
                    const isPoster = image.aspect_ratio > 0 && image.aspect_ratio < 1;
                    return (
                      <button
                        type="button"
                        className={`gallery-item ${isPoster ? 'poster' : 'backdrop'}`}
                        key={`${image.file_path}-${index}`}
                        onClick={() => setSelectedGalleryIndex(index)}
                        aria-label={`View ${titleText} ${isPoster ? 'poster' : 'scene'} ${index + 1}`}
                        title="View full size"
                      >
                        <img
                          src={getImageUrl(image.file_path, isPoster ? 'w500' : 'w780')}
                          alt={`${titleText} ${isPoster ? 'poster' : 'scene'} ${index + 1}`}
                          loading="lazy"
                        />
                        <span className="gallery-zoom-icon" aria-hidden="true"><ZoomIn size={20} /></span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Cast */}
            {movie.cast && movie.cast.length > 0 && (
              <div className="cast-section">
                <div className="section-header-row">
                  <h2>
                    Cast
                    <span className="section-count-badge">({movie.cast.length})</span>
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {movie.cast.length > 15 && (
                      <button
                        type="button"
                        className="section-action-btn"
                        onClick={() => {
                          if (castLimit >= movie.cast!.length) {
                            setCastLimit(15);
                            if (castScrollRef.current) {
                              castScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                            }
                          } else {
                            setCastLimit(movie.cast!.length);
                          }
                        }}
                      >
                        {castLimit >= movie.cast.length ? 'Show Less' : `Show All (${movie.cast.length})`}
                      </button>
                    )}
                    <div className="carousel-nav-arrows">
                      <button className="nav-arrow-btn" onClick={() => scrollCarousel(castScrollRef, 'left')} aria-label="Scroll cast left">
                        <ChevronLeft size={18} />
                      </button>
                      <button className="nav-arrow-btn" onClick={() => scrollCarousel(castScrollRef, 'right')} aria-label="Scroll cast right">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="cast-carousel-wrapper">
                  <div className="cast-scroll-container" ref={castScrollRef}>
                    {movie.cast.slice(0, castLimit).map((member) => (
                      <Link key={member.id} href={`/cast?id=${member.id}`} className="cast-card">
                        <div className="cast-avatar">
                          <img src={getImageUrl(member.profile_path, 'w185')} alt={member.name} className="cast-img" loading="lazy" />
                        </div>
                        <span className="cast-name" title={member.name}>{member.name}</span>
                        <span className="cast-character" title={member.character}>{member.character}</span>
                      </Link>
                    ))}

                    {movie.cast.length > castLimit && (
                      <button
                        type="button"
                        className="cast-card cast-load-more-card"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          setCastLimit((prev) => Math.min(prev + 15, movie.cast!.length));
                        }}
                        title={`Load more cast (${movie.cast.length - castLimit} remaining)`}
                      >
                        <div className="cast-load-more-inner">
                          <div className="cast-load-more-bubble">
                            <ChevronRight size={22} />
                          </div>
                          <span className="cast-load-more-count">+{Math.min(15, movie.cast.length - castLimit)} More</span>
                          <span className="cast-load-more-sub">Page {Math.floor(castLimit / 15) + 1}</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Franchise banner */}
            {movie.belongs_to_collection && (
              <div className="franchise-banner-section animate-fade-in-up">
                <Link
                  href={`/collection?id=${movie.belongs_to_collection.id}&name=${encodeURIComponent(movie.belongs_to_collection.name)}`}
                  className="franchise-card"
                >
                  <img
                    src={getImageUrl(
                      (movie.belongs_to_collection.backdrop_path || collectionData?.backdrop_path || movie.backdrop_path) ?? null,
                      'original'
                    )}
                    alt={movie.belongs_to_collection.name}
                    className="franchise-backdrop-img"
                  />
                  <div className="franchise-backdrop-gradient" />

                  <div className="franchise-content">
                    <div className="franchise-badge-row">
                      <span className="franchise-pill">
                        <Layers size={13} className="franchise-icon" />
                        <span>Part of Franchise Universe</span>
                      </span>
                      {collectionData?.parts && collectionData.parts.length > 0 && (
                        <span className="franchise-parts-count">{collectionData.parts.length} Movies in Timeline</span>
                      )}
                    </div>

                    <div className="franchise-bottom-row">
                      <div className="franchise-title-wrap">
                        <h3 className="franchise-title">{movie.belongs_to_collection.name}</h3>
                        <p className="franchise-desc">
                          Explore the entire storyline in release order with automated collection tracking
                        </p>
                      </div>

                      <div className="franchise-action-btn">
                        <span>Explore Universe</span>
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {/* Similar media */}
            {similarMedia.length > 0 && (
              <div className="similar-media-section">
                <div className="section-header-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <h2>Similar Recommendations</h2>
                    <Link
                      href={`/similarmovies?id=${movie.id}&type=${typeStr}&name=${encodeURIComponent(titleText || '')}`}
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '5px 12px' }}
                    >
                      View All Similar &rarr;
                    </Link>
                  </div>

                  <div className="carousel-nav-arrows">
                    <button className="nav-arrow-btn" onClick={() => scrollCarousel(similarScrollRef, 'left')} aria-label="Scroll similar left">
                      <ChevronLeft size={18} />
                    </button>
                    <button className="nav-arrow-btn" onClick={() => scrollCarousel(similarScrollRef, 'right')} aria-label="Scroll similar right">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>

                <div className="similar-carousel-wrapper">
                  <div className="similar-scroll-container" ref={similarScrollRef}>
                    {similarMedia.map((item) => (
                      <div key={item.id} className="similar-card-item">
                        <MovieCard
                          item={item}
                          isAdded={watchlistIds.has(item.id)}
                          toggleWatchlist={async (it, e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const stored = await AsyncStorage.getItem('watchlist');
                            let list = stored ? JSON.parse(stored) : [];
                            const targetId = Number(it.id);
                            if (list.some((i: any) => Number(i.id) === targetId)) {
                              list = list.filter((i: any) => Number(i.id) !== targetId);
                            } else {
                              const itemToSave = {
                                ...it,
                                id: targetId,
                                media_type: it.media_type || 'movie',
                                added_at: Date.now(),
                              };
                              list = [itemToSave, ...list.filter((i: any) => Number(i.id) !== targetId)];
                            }
                            await AsyncStorage.setItem('watchlist', JSON.stringify(list));
                            setWatchlistIds(new Set(list.map((i: any) => Number(i.id))));
                          }}
                          showTitle={true}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* SIDEBAR */}
          <aside className="detail-side-col">
            {/* Director / Creator */}
            {movie.director && (
              <div className="director-section tint-card animate-fade-in-up">
                <h2 className="director-heading">{movie.director.job === 'Creator' ? 'Creator' : 'Director'}</h2>
                <Link href={`/cast?id=${movie.director.id}`} className="director-card">
                  <div className="director-avatar">
                    <img
                      src={getImageUrl(movie.director.profile_path, 'w185')}
                      alt={movie.director.name}
                      className="director-img"
                      loading="lazy"
                    />
                  </div>
                  <div className="director-meta">
                    <span className="director-name">{movie.director.name}</span>
                    <span className="director-role">{movie.director.job}</span>
                  </div>
                </Link>
              </div>
            )}

            {/* AI Panel */}
            <div className="ai-panel animate-fade-in-up">
              <div className="ai-header">
                <div className="ai-header-left">
                  <Sparkles size={18} className="ai-sparkle-icon" />
                  <div>
                    <h3 className="ai-header-title">AI Insights</h3>
                    <p className="ai-header-subtitle">Powered by Gemini AI</p>
                  </div>
                </div>

                <div className="ai-tabs">
                  <button className={`ai-tab-btn ${aiTab === 'lens' ? 'active' : ''}`} onClick={() => setAiTab('lens')}>
                    <span>Lens</span>
                  </button>
                  <button className={`ai-tab-btn ${aiTab === 'chat' ? 'active' : ''}`} onClick={() => setAiTab('chat')}>
                    <span>Chat</span>
                  </button>
                  <button className={`ai-tab-btn ${aiTab === 'vibe' ? 'active' : ''}`} onClick={() => setAiTab('vibe')}>
                    <span>Vibe</span>
                  </button>
                </div>
              </div>

              <div className="ai-tab-body">
                {/* LENS TAB */}
                {aiTab === 'lens' && (
                  <div className="ai-tab-pane animate-fade-in">
                    {lensLoading ? (
                      <div className="ai-loading-box">
                        <div className="shimmer-bar full" />
                        <div className="shimmer-bar half" />
                        <div className="shimmer-bar three-quarters" />
                        <p className="loading-note">Consulting Gemini Lens...</p>
                      </div>
                    ) : lensError ? (
                      <div className="ai-error-box">
                        <p className="error-msg">{lensError}</p>
                        <button className="btn-secondary retry-btn" onClick={handleFetchLensInsight}>
                          <RotateCcw size={14} />
                          <span>Try again</span>
                        </button>
                      </div>
                    ) : lensInsight ? (
                      <div className="lens-insight-body animate-fade-in">
                        {typeof lensInsight === 'object' && !Array.isArray(lensInsight) ? (
                          <>
                            {lensInsight.worthIt && (
                              <div className="verdict-row">
                                <span className="verdict-pill">{lensInsight.worthIt}</span>
                              </div>
                            )}
                            {lensInsight.friendVerdict && (
                              <blockquote className="friend-verdict">"{lensInsight.friendVerdict}"</blockquote>
                            )}
                            <div className="lens-fields-grid">
                              {lensInsight.vibe && (
                                <div className="lens-field-card">
                                  <span className="field-label">Vibe &amp; Tone</span>
                                  <p className="field-val">{lensInsight.vibe}</p>
                                </div>
                              )}
                              {lensInsight.whatItsActuallyAbout && (
                                <div className="lens-field-card">
                                  <span className="field-label">Story &amp; Premise</span>
                                  <p className="field-val">{lensInsight.whatItsActuallyAbout}</p>
                                </div>
                              )}
                            </div>
                            {(lensInsight.certificationWarning || lensInsight.whatYoullSee) && (
                              <div className="lens-advisory">
                                <span className="advisory-title">⚠️ Content Advisory &amp; Certification</span>
                                <p className="advisory-text">{lensInsight.certificationWarning || lensInsight.whatYoullSee}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="lens-markdown-output">
                            {String(lensInsight).split('\n').map((line: string, idx: number) => {
                              if (line.startsWith('###')) return <h4 key={idx}>{line.replace('###', '').trim()}</h4>;
                              if (line.startsWith('##')) return <h3 key={idx}>{line.replace('##', '').trim()}</h3>;
                              return <p key={idx}>{line}</p>;
                            })}
                          </div>
                        )}
                        <button className="re-generate-btn" onClick={handleFetchLensInsight} title="Refresh Lens insight">
                          <RotateCcw size={14} />
                          <span>Refresh Insight</span>
                        </button>
                      </div>
                    ) : (
                      <div className="ai-unloaded-state">
                        <p>Get a quick, friend-style verdict, tone breakdown, and advisory for this title.</p>
                        <button className="btn-primary ai-action-btn" onClick={handleFetchLensInsight}>
                          <Sparkles size={16} />
                          <span>Generate Lens insight</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* CHAT TAB */}
                {aiTab === 'chat' && (
                  <div className="ai-tab-pane animate-fade-in">
                    <div className="chat-tab-header">
                      <MessageSquare size={18} className="chat-icon" />
                      <p>Ask anything about "{titleText}" (plot analysis, ending theories, symbolism, trivia)</p>
                    </div>

                    {movieChatMessages.length > 0 && (
                      <div className="chat-messages-container">
                        {movieChatMessages.map((msg, i) => (
                          <div key={i} className={`chat-bubble-row ${msg.role}`}>
                            <div className="bubble-content">
                              <span className="bubble-sender">{msg.role === 'user' ? 'You' : 'Cinema AI'}</span>
                              <p>{msg.text}</p>
                            </div>
                          </div>
                        ))}
                        {movieChatLoading && (
                          <div className="chat-bubble-row bot">
                            <div className="bubble-content loading" role="status" aria-label="Cinema AI is thinking">
                              <Split size={24} color="currentColor" duration={1400} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="chat-input-row">
                      <input
                        type="text"
                        placeholder={`Ask about ${titleText}...`}
                        value={movieChatInput}
                        onChange={(e) => setMovieChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMovieChat()}
                        className="chat-input"
                      />
                      <button
                        className="send-btn btn-primary"
                        onClick={handleSendMovieChat}
                        disabled={movieChatLoading || !movieChatInput.trim()}
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* VIBE TAB */}
                {aiTab === 'vibe' && (
                  <div className="ai-tab-pane animate-fade-in">
                    {loadingAi ? (
                      <div className="vibe-loading-vertical">
                        {[1, 2, 3].map((n) => (
                          <div key={n} className="vibe-vertical-skeleton">
                            <div className="vibe-skel-poster" />
                            <div className="vibe-skel-info">
                              <div className="vibe-skel-line title" />
                              <div className="vibe-skel-line meta" />
                              <div className="vibe-skel-line desc" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : aiVibeError ? (
                      <div className="ai-error-box">
                        <p className="error-msg">{aiVibeError}</p>
                        <button className="btn-secondary retry-btn" onClick={handleFetchAiVibes}>
                          <RotateCcw size={14} />
                          <span>Try again</span>
                        </button>
                      </div>
                    ) : aiRecommendations.length > 0 ? (
                      <div className="vibe-results-vertical animate-fade-in">
                        <div className="vibe-vertical-list">
                          {aiRecommendations.map((item) => {
                            const itemTitle = item.title || item.name || 'Untitled';
                            const itemYear = (item.release_date || item.first_air_date)?.substring(0, 4);
                            const isTv = item.media_type === 'tv' || Boolean(item.first_air_date && !item.release_date);
                            const mediaTypeParam = item.media_type || (isTv ? 'tv' : 'movie');
                            const isAdded = watchlistIds.has(item.id);
                            const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

                            return (
                              <div
                                key={item.id}
                                className="vibe-vertical-card"
                              >
                                <Link
                                  href={buildDetailUrl(item)}
                                  className="vibe-card-poster-link"
                                  title={`View details for ${itemTitle}`}
                                >
                                  <div className="vibe-card-poster">
                                    {item.poster_path ? (
                                      <img
                                        src={getImageUrl(item.poster_path, 'w342')}
                                        alt={itemTitle}
                                        className="vibe-poster-img"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="vibe-poster-placeholder">
                                        <Film size={24} />
                                      </div>
                                    )}
                                  </div>
                                </Link>

                                <div className="vibe-card-content">
                                  <div className="vibe-card-header">
                                    <Link
                                      href={buildDetailUrl(item)}
                                      className="vibe-title-link"
                                      title={itemTitle}
                                    >
                                      <h4 className="vibe-card-title">{itemTitle}</h4>
                                    </Link>
                                    <button
                                      type="button"
                                      className={`vibe-bookmark-btn ${isAdded ? 'saved' : ''}`}
                                      title={isAdded ? 'Remove from Watchlist' : 'Add to Watchlist'}
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const stored = await AsyncStorage.getItem('watchlist');
                                        let list = stored ? JSON.parse(stored) : [];
                                        const targetId = Number(item.id);
                                        if (list.some((i: any) => Number(i.id) === targetId)) {
                                          list = list.filter((i: any) => Number(i.id) !== targetId);
                                        } else {
                                          const itemToSave = {
                                            ...item,
                                            id: targetId,
                                            media_type: item.media_type || (isTv ? 'tv' : 'movie'),
                                            added_at: Date.now(),
                                          };
                                          list = [itemToSave, ...list.filter((i: any) => Number(i.id) !== targetId)];
                                        }
                                        await AsyncStorage.setItem('watchlist', JSON.stringify(list));
                                        setWatchlistIds(new Set(list.map((i: any) => Number(i.id))));
                                      }}
                                    >
                                      <Heart
                                        size={16}
                                        fill={isAdded ? 'var(--primary)' : 'none'}
                                        color={isAdded ? 'var(--primary)' : 'rgba(255, 255, 255, 0.7)'}
                                      />
                                    </button>
                                  </div>

                                  <div className="vibe-card-meta">
                                    {rating && (
                                      <span className="vibe-meta-badge rating">
                                        <Star size={11} fill="#fbbf24" color="#fbbf24" />
                                        <span>{rating}</span>
                                      </span>
                                    )}
                                    {itemYear && <span className="vibe-meta-badge year">{itemYear}</span>}
                                    <span className="vibe-meta-badge type">{isTv ? 'TV' : 'Movie'}</span>
                                  </div>

                                  {item.overview && (
                                    <p className="vibe-card-overview" title="Hover to view full description">
                                      {item.overview}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="vibe-actions-row">
                          <button className="re-generate-btn" onClick={handleFetchAiVibes}>
                            <RotateCcw size={14} />
                            <span>Find more vibes</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="ai-unloaded-state">
                        <p>Discover hand-picked movies and series sharing similar atmosphere, themes, and pacing.</p>
                        <button className="btn-primary ai-action-btn" onClick={handleFetchAiVibes}>
                          <Sparkles size={16} />
                          <span>Find similar vibes</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Trailer Modal */}
      {showTrailerModal && activeTrailerKey && (
        <div className="modal-backdrop" onClick={() => setShowTrailerModal(false)}>
          <div className="trailer-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Official Trailer</h3>
              <button className="panel-close-btn" onClick={() => setShowTrailerModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="trailer-iframe-container">
              <iframe
                src={`https://www.youtube.com/embed/${activeTrailerKey}?autoplay=1`}
                title="Trailer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="trailer-iframe"
              />
            </div>
          </div>
        </div>
      )}

      {/* Torrent Modal */}
      {showTorrentModal && (
        <div className="modal-backdrop" onClick={() => setShowTorrentModal(false)}>
          <div className="torrent-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Download size={20} style={{ color: 'var(--accent)' }} />
                <h3>Torrents for "{titleText}"</h3>
              </div>
              <button className="panel-close-btn" onClick={() => setShowTorrentModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="torrent-modal-body">
              {torrentLoading ? (
                <PageLoading label="Loading torrent sources" />
              ) : torrents.length > 0 ? (
                <div className="torrent-list">
                  {torrents.map((t) => (
                    <div key={t.id} className="torrent-item">
                      <div className="torrent-meta">
                        <span className="torrent-name" title={t.name}>{t.name}</span>
                        <div className="torrent-badges">
                          <span className="t-badge source">{t.source}</span>
                          <span className="t-badge size">{t.size}</span>
                          <span className="t-badge seeds">🟢 {t.seeds} seeds</span>
                          <span className="t-badge peers">🔴 {t.peers} peers</span>
                        </div>
                      </div>

                      <div className="torrent-actions">
                        <a href={t.url} className="btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} title="Open Magnet Link">
                          <Download size={14} /> Magnet
                        </a>
                        <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => handleCopyMagnet(t.url)} title="Copy Magnet Link">
                          {copiedMagnet === t.url ? <Check size={14} color="#30D158" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">No torrent results found. Try adjusting title in search.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {isGalleryMounted &&
        selectedGalleryIndex !== null &&
        galleryImages[selectedGalleryIndex] &&
        createPortal(
          <div className="detail-lightbox-backdrop" onClick={() => setSelectedGalleryIndex(null)}>
            <div className="detail-lightbox-content" role="dialog" aria-modal="true" aria-label="Image preview" onClick={(event) => event.stopPropagation()}>
              <div className="detail-lightbox-header">
                <span>{selectedGalleryIndex + 1} / {galleryImages.length}</span>
                <button type="button" onClick={() => setSelectedGalleryIndex(null)} aria-label="Close image preview">
                  <X size={20} />
                </button>
              </div>
              <img
                className="detail-lightbox-image"
                src={getImageUrl(galleryImages[selectedGalleryIndex].file_path, 'original')}
                alt={`${titleText} image ${selectedGalleryIndex + 1}`}
              />
              {galleryImages.length > 1 && (
                <>
                  <button type="button" className="detail-lightbox-nav previous" onClick={() => moveGalleryImage(-1)} aria-label="Previous image">
                    <ChevronLeft size={26} />
                  </button>
                  <button type="button" className="detail-lightbox-nav next" onClick={() => moveGalleryImage(1)} aria-label="Next image">
                    <ChevronRight size={26} />
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      <style jsx>{`
        /* ═════════ Adaptive colour tokens (all derived from the poster accent) ═════════ */
        .detail-container {
          position: relative;
          margin: 0;
          padding-bottom: 120px;
          width: 100%;
          max-width: 100%;
          min-height: 100vh;
          box-sizing: border-box;
          background-color: var(--detail-ambient-bg, var(--bg-color));
          transition: background-color 0.4s ease;

          --tint: rgba(255, 255, 255, 0.08);
          --tint-hover: rgba(255, 255, 255, 0.14);
          --tint-strong: rgba(255, 255, 255, 0.2);
          --tint-border: rgba(255, 255, 255, 0.14);
          --tint-border-strong: rgba(255, 255, 255, 0.28);
          --accent-text: color-mix(in srgb, var(--accent, #e50914) 65%, #ffffff);
          --tint-shadow: rgba(0, 0, 0, 0.25);
        }

        @media (max-width: 1024px) {
          .detail-container {
            margin: 0;
            padding-bottom: 120px;
            width: 100%;
            max-width: 100%;
          }
        }
        @media (max-width: 768px) {
          .detail-container {
            margin: 0;
            padding-bottom: 130px;
            width: 100%;
            max-width: 100%;
          }
          .carousel-nav-arrows, .nav-arrow-btn { display: none !important; }
        }

        /* Shared tinted card surface */
        .tint-card {
          background: var(--tint);
          border: 1px solid var(--tint-border);
          border-radius: var(--border-radius-md);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 8px 28px var(--tint-shadow);
        }
        .synopsis-box { padding: 22px 26px; border: none !important; }
        .director-section { padding: 20px 22px; overflow: visible; border: none !important; }

        /* ═════════ Ambient solid theme tokens & high contrast text ═════════ */
        .detail-container.is-ambient {
          color-scheme: dark !important;
          --foreground: #ffffff !important;
          --foreground-muted: rgba(255, 255, 255, 0.72) !important;
          --card-bg: rgba(255, 255, 255, 0.08) !important;
          --card-border: rgba(255, 255, 255, 0.14) !important;
          --input-bg: rgba(255, 255, 255, 0.1) !important;
          --input-border: rgba(255, 255, 255, 0.18) !important;
          --badge-bg: rgba(255, 255, 255, 0.1) !important;
          --badge-border: rgba(255, 255, 255, 0.16) !important;
          color: #ffffff !important;
        }
        .detail-container.is-ambient :global(.movie-title),
        .detail-container.is-ambient :global(.section-title),
        .detail-container.is-ambient :global(h1),
        .detail-container.is-ambient :global(h2),
        .detail-container.is-ambient :global(h3),
        .detail-container.is-ambient :global(h4) { color: #ffffff !important; }
        .detail-container.is-ambient :global(.tagline),
        .detail-container.is-ambient :global(.overview-text),
        .detail-container.is-ambient :global(.meta-details p) { color: rgba(255, 255, 255, 0.88) !important; }

        /* Card titles in carousels (MovieCard, similar, vibes) */
        .detail-container.is-ambient :global(.card-title),
        .detail-container.is-ambient :global(.card-title-link) {
          color: rgba(255, 255, 255, 0.9) !important;
        }
        .detail-container.is-ambient :global(.movie-card-container:hover .card-title) {
          color: #ffffff !important;
        }

        .detail-container :global(.btn-primary) {
          background: var(--primary-gradient) !important;
          color: var(--on-accent, #fff) !important;
          border: 1px solid transparent !important;
          box-shadow: 0 6px 20px var(--tint-shadow);
        }
        .detail-container :global(.btn-primary:hover) {
          filter: brightness(1.08);
          box-shadow: 0 8px 26px var(--tint-strong);
        }
        .detail-container :global(.btn-secondary) {
          background: var(--tint) !important;
          color: #ffffff !important;
          border: 1px solid var(--tint-border) !important;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .detail-container :global(.btn-secondary:hover) {
          background: var(--tint-hover) !important;
          border-color: var(--tint-border-strong) !important;
        }

        /* ═════════ Backdrop ═════════ */
        .backdrop-header {
          position: relative;
          width: 100%;
          height: 480px;
          min-height: 420px;
          max-height: 55vh;
          overflow: hidden;
          background: var(--detail-ambient-bg, var(--bg-color));
          transition: background-color 0.4s ease;
        }
        @media (max-width: 900px) { .backdrop-header { height: 340px; min-height: 300px; } }

        .backdrop-img {
          width: 100%; height: 100%;
          object-fit: cover;
          object-position: center 20%;
          opacity: 0.88;
        }
        .backdrop-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.08) 0%,
            rgba(0, 0, 0, 0.35) 45%,
            rgba(0, 0, 0, 0.7) 75%,
            var(--detail-ambient-bg, var(--bg-color)) 100%
          );
          pointer-events: none;
        }

        .back-btn {
          position: absolute;
          top: 30px; left: 40px;
          color: #fff;
          background: var(--tint);
          border: 1px solid var(--tint-border);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 50%;
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: var(--transition-smooth);
          z-index: 10;
        }
        .back-btn:hover { background: var(--tint-strong); transform: scale(1.05); }

        .detail-content-wrapper {
          position: relative;
          padding: 0 40px 60px;
          margin-top: -150px;
          z-index: 5;
        }

        /* ═════════ NEW LAYOUT: hero on top, main + sidebar below ═════════ */
        .hero-row {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 40px;
        }

        .desktop-layout-grid {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }
        .detail-main-col {
          display: flex;
          flex-direction: column;
          gap: 40px;
          min-width: 0;
        }
        .detail-side-col {
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-width: 0;
          padding: 8px 14px 24px 14px;
          margin: -8px -14px -24px -14px;
          overflow: visible !important;
          max-height: none !important;
          border: none !important;
          border-radius: var(--border-radius-lg);
        }

        @media (min-width: 1200px) {
          .desktop-layout-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 380px;
            gap: 48px;
            align-items: start;
          }
          .detail-side-col {
            position: sticky;
            top: 24px;
            overflow: visible !important;
            max-height: none !important;
            padding: 8px 16px 24px 16px;
            margin: -8px -16px -24px -16px;
          }

          .main-meta-box { gap: 40px; align-items: flex-end; }
          .poster-box { width: 260px; height: 390px; }
          .movie-title { font-size: 48px; }
        }

        /* ═════════ Hero ═════════ */
        .main-meta-box { display: flex; gap: 32px; align-items: flex-end; }
        @media (max-width: 768px) {
          .main-meta-box { flex-direction: column; align-items: center; text-align: center; }
          .details-badges, .detail-actions { justify-content: center; }
        }

        .poster-box {
          width: 220px; height: 330px;
          flex-shrink: 0;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          border: 1px solid var(--tint-border);
        }
        .poster-img { width: 100%; height: 100%; object-fit: cover; }

        .meta-details { flex: 1; display: flex; flex-direction: column; gap: 16px; }
        .movie-title { font-size: 38px; font-weight: 800; line-height: 1.15; letter-spacing: -0.5px; }
        .tagline { font-style: italic; color: var(--foreground-muted); font-size: 15px; }

        .details-badges { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

        .rating-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--tint-strong);
          color: var(--accent-text);
          border: 1px solid var(--tint-border-strong);
          padding: 4px 10px;
          border-radius: 9999px;
          font-weight: 700;
          font-size: 13px;
        }

        .badge {
          font-size: 12px;
          background: var(--tint);
          border: 1px solid var(--tint-border);
          padding: 4px 10px;
          border-radius: var(--border-radius-sm);
          color: rgba(255, 255, 255, 0.92);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .detail-actions { display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }

        .watchlist-added {
          border-color: var(--tint-border-strong) !important;
          color: var(--accent-text) !important;
          background: var(--tint-strong) !important;
        }
        .watched-active {
          border-color: #30D158 !important;
          color: #30D158 !important;
          background: rgba(48, 209, 88, 0.12) !important;
        }

        .resume-play-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          max-width: 760px;
        }
        .resume-info { display: flex; align-items: center; gap: 16px; }
        .resume-icon { color: var(--accent-text); }
        .resume-info h4 { font-size: 15px; font-weight: 600; }
        .resume-info p { font-size: 13px; color: rgba(255, 255, 255, 0.7); }

        /* ═════════ Section headings ═════════ */
        .synopsis-box h2, .cast-section h2, .similar-media-section h2, .episodes-section h2 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .overview-text { font-size: 15px; line-height: 1.7; color: var(--foreground-muted); max-width: 900px; }

        .section-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .section-count-badge { font-size: 14px; font-weight: 500; color: rgba(255, 255, 255, 0.6); margin-left: 6px; }
        .section-action-btn {
          background: var(--tint);
          border: 1px solid var(--tint-border);
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          padding: 5px 12px;
          border-radius: 20px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .section-action-btn:hover { background: var(--tint-hover); border-color: var(--tint-border-strong); }

        .carousel-nav-arrows { display: flex; align-items: center; gap: 6px; }
        .nav-arrow-btn {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(255, 255, 255, 0.22) !important;
          color: #ffffff !important;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
          transition: var(--transition-fast);
        }
        .nav-arrow-btn:hover {
          background: var(--primary) !important;
          border-color: var(--primary) !important;
          color: #ffffff !important;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35) !important;
        }

        .cast-carousel-wrapper, .episodes-carousel-wrapper, .similar-carousel-wrapper {
          position: relative; margin: 0; width: 100%;
        }

        /* ═════════ Franchise banner ═════════ */
        .franchise-banner-section { width: 100%; }
        :global(.franchise-card) {
          position: relative;
          width: 100%;
          height: 180px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          display: flex;
          align-items: stretch;
          background: #0d0d12;
          border: 1px solid var(--tint-border);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          text-decoration: none;
          cursor: pointer;
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }
        :global(.franchise-card:hover) {
          transform: translateY(-2px);
          border-color: var(--tint-border-strong);
          box-shadow: 0 14px 35px rgba(0, 0, 0, 0.65), 0 0 24px var(--tint-shadow);
        }
        .franchise-backdrop-img {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          object-position: center 25%;
          opacity: 0.5;
          transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        }
        :global(.franchise-card:hover) .franchise-backdrop-img { transform: scale(1.04); opacity: 0.65; }
        .franchise-backdrop-gradient {
          position: absolute; inset: 0;
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, #0a0a0e) 0%, rgba(10, 10, 14, 0.78) 45%, rgba(10, 10, 14, 0.3) 100%),
            linear-gradient(0deg, rgba(10, 10, 14, 0.92) 0%, transparent 60%);
          pointer-events: none;
        }
        .franchise-content {
          position: relative; z-index: 2; flex: 1;
          display: flex; flex-direction: column; justify-content: space-between;
          padding: 24px 32px;
        }
        .franchise-badge-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .franchise-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 12px;
          background: var(--tint-strong);
          border: 1px solid var(--tint-border-strong);
          border-radius: 20px;
          color: var(--accent-text);
          font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 1px;
        }
        .franchise-icon { color: var(--accent-text); }
        .franchise-parts-count { font-size: 12px; font-weight: 700; color: rgba(255, 255, 255, 0.75); display: inline-flex; align-items: center; gap: 6px; }
        .franchise-parts-count::before { content: '•'; color: rgba(255, 255, 255, 0.4); }
        .franchise-bottom-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
        .franchise-title-wrap { flex: 1; max-width: 750px; }
        .franchise-title { font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 6px; letter-spacing: -0.3px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8); }
        .franchise-desc { font-size: 13.5px; color: rgba(255, 255, 255, 0.7); line-height: 1.4; margin: 0; }
        .franchise-action-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 20px;
          background: var(--tint-strong);
          backdrop-filter: blur(12px);
          border: 1px solid var(--tint-border-strong);
          border-radius: 30px;
          color: #fff;
          font-size: 13.5px; font-weight: 700; letter-spacing: 0.3px;
          flex-shrink: 0;
          transition: all 0.25s ease;
        }
        :global(.franchise-card:hover) .franchise-action-btn {
          background: var(--primary-gradient);
          color: var(--on-accent);
          border-color: transparent;
          box-shadow: 0 4px 15px var(--tint-shadow);
          transform: translateX(4px);
        }
        @media (max-width: 768px) {
          :global(.franchise-card) { height: auto; min-height: 160px; }
          .franchise-content { padding: 18px 20px; gap: 16px; }
          .franchise-bottom-row { flex-direction: column; align-items: flex-start; gap: 14px; }
          .franchise-title { font-size: 20px; }
          .franchise-desc { font-size: 12.5px; }
          .franchise-action-btn { padding: 8px 16px; font-size: 12.5px; }
        }

        /* ═════════ Gallery ═════════ */
        .gallery-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        .gallery-heading { display: flex; align-items: center; gap: 10px; }
        .gallery-heading h2 { font-size: 20px; font-weight: 600; }
        .gallery-heading span { color: rgba(255, 255, 255, 0.6); font-size: 13px; }
        .gallery-controls { display: flex; gap: 8px; margin-left: auto; }
        .gallery-scroll-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          border: 1px solid var(--tint-border);
          border-radius: 50%;
          color: #fff;
          background: var(--tint);
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .gallery-scroll-btn:hover { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
        .gallery-track {
          display: flex; align-items: center; gap: 14px;
          overflow-x: auto;
          padding: 2px 2px 12px;
          overscroll-behavior-x: contain;
          scroll-snap-type: x mandatory;
        }
        .gallery-item {
          position: relative;
          flex: 0 0 auto;
          width: 320px; height: 180px;
          padding: 0;
          overflow: hidden;
          border: 1px solid var(--tint-border);
          border-radius: 12px;
          background: var(--tint);
          color: inherit;
          cursor: zoom-in;
          scroll-snap-align: start;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .gallery-item:hover { border-color: var(--tint-border-strong); box-shadow: 0 6px 22px var(--tint-shadow); }
        .gallery-item.poster { width: 120px; }
        .gallery-item img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .gallery-zoom-icon {
          position: absolute; right: 10px; bottom: 10px;
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          border: 1px solid var(--tint-border-strong);
          border-radius: 50%;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .gallery-item:hover .gallery-zoom-icon, .gallery-item:focus-visible .gallery-zoom-icon { opacity: 1; }

        :global(.detail-lightbox-backdrop) {
          position: fixed; inset: 0; z-index: 999999;
          display: flex; align-items: center; justify-content: center;
          padding: 56px 72px;
          background: rgba(0, 0, 0, 0.94);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          animation: detail-lightbox-in 0.18s ease-out;
        }
        :global(.detail-lightbox-content) { position: relative; display: flex; align-items: center; justify-content: center; max-width: 100%; max-height: 100%; }
        :global(.detail-lightbox-header) {
          position: absolute; top: -44px; right: 0; left: 0;
          display: flex; align-items: center; justify-content: space-between;
          color: rgba(255, 255, 255, 0.88); font-size: 14px; font-weight: 600;
        }
        :global(.detail-lightbox-header button), :global(.detail-lightbox-nav) {
          display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 50%;
          color: #fff;
          background: rgba(30, 30, 34, 0.85);
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        :global(.detail-lightbox-header button:hover), :global(.detail-lightbox-nav:hover) { background: var(--primary); transform: scale(1.06); }
        :global(.detail-lightbox-image) { display: block; max-width: min(86vw, 1400px); max-height: 82vh; object-fit: contain; border-radius: 8px; user-select: none; }
        :global(.detail-lightbox-nav) { position: fixed; top: 50%; transform: translateY(-50%); }
        :global(.detail-lightbox-nav:hover) { transform: translateY(-50%) scale(1.06); }
        :global(.detail-lightbox-nav.previous) { left: 20px; }
        :global(.detail-lightbox-nav.next) { right: 20px; }
        @keyframes detail-lightbox-in { from { opacity: 0; } to { opacity: 1; } }

        @media (max-width: 640px) {
          .gallery-item { width: 278px; height: 156px; }
          .gallery-item.poster { width: 104px; }
          .gallery-zoom-icon { opacity: 1; }
          :global(.detail-lightbox-backdrop) { padding: 52px 12px; }
          :global(.detail-lightbox-image) { max-width: 94vw; max-height: 78vh; }
          :global(.detail-lightbox-nav) { width: 38px; height: 38px; }
          :global(.detail-lightbox-nav.previous) { left: 8px; }
          :global(.detail-lightbox-nav.next) { right: 8px; }
        }

        /* ═════════ Director ═════════ */
        .director-heading { font-size: 20px; font-weight: 600; margin-bottom: 12px; }
        .director-card {
          display: inline-flex; align-items: center; gap: 14px;
          padding: 10px 16px 10px 10px;
          background: var(--tint);
          border: none !important;
          border-radius: 100px;
          text-decoration: none;
          transition: var(--transition-fast);
          cursor: pointer;
        }
        .director-card:hover { background: var(--tint-hover); transform: translateY(-1px); }
        .director-avatar { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid var(--tint-border-strong); }
        .director-img { width: 100%; height: 100%; object-fit: cover; }
        .director-meta { display: flex; flex-direction: column; gap: 2px; }
        .director-name { font-size: 14px; font-weight: 600; color: #fff; }
        .director-role { font-size: 11.5px; color: rgba(255, 255, 255, 0.65); text-transform: uppercase; letter-spacing: 0.5px; }

        /* ═════════ AI panel ═════════ */
        .ai-panel {
          padding: 24px;
          border-radius: var(--border-radius-lg);
          border: none !important;
          background: rgba(0, 0, 0, 0.35) !important;
          backdrop-filter: blur(20px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
          box-shadow: 0 10px 34px rgba(0, 0, 0, 0.4) !important;
          overflow: visible;
        }
        .ai-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 20px; padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          flex-wrap: wrap; gap: 14px;
        }
        .ai-header-left { display: flex; align-items: center; gap: 12px; }
        .ai-sparkle-icon { color: var(--accent, var(--primary)); filter: drop-shadow(0 0 8px rgba(229, 9, 20, 0.4)); }
        .ai-header-title { font-size: 18px; font-weight: 700; color: #ffffff !important; letter-spacing: -0.3px; }
        .ai-header-subtitle { font-size: 11.5px; color: rgba(255, 255, 255, 0.72) !important; margin-top: 1px; }

        .ai-tabs {
          display: flex;
          background: rgba(0, 0, 0, 0.5) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 100px;
          padding: 3px; gap: 4px;
        }
        .ai-tab-btn {
          padding: 6px 18px;
          border-radius: 100px;
          background: transparent;
          border: 1px solid transparent;
          color: rgba(255, 255, 255, 0.75) !important;
          font-size: 13px; font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .ai-tab-btn:hover { color: #ffffff !important; }
        .ai-tab-btn.active {
          background: rgba(255, 255, 255, 0.22) !important;
          border-color: rgba(255, 255, 255, 0.35) !important;
          color: #ffffff !important;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3) !important;
        }

        .ai-tab-body { min-height: 120px; }
        .ai-unloaded-state {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 30px 20px; text-align: center; gap: 16px;
        }
        .ai-unloaded-state p { font-size: 14px; color: rgba(255, 255, 255, 0.88) !important; max-width: 500px; line-height: 1.5; }
        .ai-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 700 !important;
          cursor: pointer;
          transition: var(--transition-smooth);
          background: var(--primary) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          box-shadow: 0 6px 20px rgba(229, 9, 20, 0.35) !important;
        }
        .ai-action-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.1);
          box-shadow: 0 8px 24px rgba(229, 9, 20, 0.45) !important;
        }
        .ai-action-btn:hover { transform: translateY(-2px); }

        .re-generate-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          background: var(--tint);
          border: 1px solid var(--tint-border);
          color: rgba(255, 255, 255, 0.8);
          font-size: 12px; font-weight: 600;
          cursor: pointer;
          margin-top: 16px;
          transition: var(--transition-fast);
        }
        .re-generate-btn:hover { color: #fff; background: var(--tint-hover); border-color: var(--tint-border-strong); }

        /* Lens output */
        .lens-insight-body { display: flex; flex-direction: column; gap: 14px; }
        .verdict-row { display: flex; align-items: center; }
        .verdict-pill {
          display: inline-flex; align-items: center;
          background: var(--tint-strong);
          border: 1px solid var(--tint-border-strong);
          color: var(--accent-text);
          padding: 4px 14px;
          border-radius: 100px;
          font-size: 12.5px; font-weight: 700; letter-spacing: 0.3px;
        }
        .friend-verdict {
          font-size: 16px; font-weight: 600; line-height: 1.6; color: #fff; font-style: italic;
          padding-left: 14px;
          border-left: 3px solid var(--accent);
          margin: 6px 0 10px 0;
        }
        .lens-fields-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .lens-field-card {
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid var(--tint-border);
          background: var(--tint);
        }
        .field-label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--accent-text); margin-bottom: 6px; }
        .field-val { font-size: 13.5px; line-height: 1.5; color: #fff; }
        .lens-advisory {
          padding: 14px 18px;
          border-radius: 14px;
          background: rgba(255, 179, 0, 0.08);
          border: 1px solid rgba(255, 179, 0, 0.25);
        }
        .advisory-title { display: block; font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: #ffb300; letter-spacing: 0.8px; margin-bottom: 4px; }
        .advisory-text { font-size: 13px; line-height: 1.5; color: #fff; }

        .ai-loading-box { display: flex; flex-direction: column; gap: 12px; padding: 20px 0; }
        .shimmer-bar {
          height: 14px; border-radius: 8px;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, var(--tint-strong) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.6s infinite;
        }
        .shimmer-bar.full { width: 100%; }
        .shimmer-bar.three-quarters { width: 75%; }
        .shimmer-bar.half { width: 45%; }
        .loading-note { font-size: 12.5px; color: rgba(255, 255, 255, 0.65); font-style: italic; margin-top: 4px; }

        .ai-error-box { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 16px 0; }
        .error-msg { font-size: 13.5px; color: #fca5a5; }
        .retry-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 12px; }

        /* Chat tab */
        .chat-tab-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 13px; color: rgba(255, 255, 255, 0.72); }
        .chat-icon { color: var(--accent-text); flex-shrink: 0; }
        .chat-messages-container { display: flex; flex-direction: column; gap: 12px; max-height: 320px; overflow-y: auto; padding: 10px 4px; margin-bottom: 14px; }
        .chat-bubble-row { display: flex; width: 100%; }
        .chat-bubble-row.user { justify-content: flex-end; }
        .chat-bubble-row.bot { justify-content: flex-start; }
        .bubble-content { max-width: 85%; padding: 10px 16px; border-radius: 16px; font-size: 13.5px; line-height: 1.5; }
        .chat-bubble-row.user .bubble-content {
          background: var(--primary-gradient);
          color: var(--on-accent);
          border-bottom-right-radius: 4px;
        }
        .chat-bubble-row.bot .bubble-content {
          background: var(--tint);
          border: 1px solid var(--tint-border);
          color: #fff;
          border-bottom-left-radius: 4px;
        }
        .bubble-sender { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; opacity: 0.7; margin-bottom: 3px; }
        .chat-input-row { display: flex; gap: 10px; }
        .chat-input {
          flex: 1;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--tint-border);
          padding: 10px 16px;
          border-radius: 12px;
          color: #fff;
          font-size: 13.5px;
          outline: none;
          min-width: 0;
        }
        .chat-input::placeholder { color: rgba(255, 255, 255, 0.45); }
        .chat-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--tint); }
        .send-btn { padding: 0 16px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }

        /* Vibe tab - Vertical Cards */
        .vibe-results-vertical {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 6px;
        }
        .vibe-vertical-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 480px;
          overflow-y: auto;
          padding-right: 4px;
          scrollbar-width: thin;
        }
        .vibe-vertical-list::-webkit-scrollbar {
          width: 5px;
        }
        .vibe-vertical-list::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.04);
          border-radius: 4px;
        }
        .vibe-vertical-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .vibe-vertical-card {
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-start !important;
          gap: 14px !important;
          padding: 12px !important;
          border-radius: 14px !important;
          background: rgba(255, 255, 255, 0.05) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          text-decoration: none;
          color: inherit;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
          position: relative;
        }
        .vibe-vertical-card:hover {
          background: rgba(255, 255, 255, 0.09) !important;
          border-color: rgba(255, 255, 255, 0.22) !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
          transform: translateY(-2px);
        }
        .vibe-card-poster-link {
          flex-shrink: 0;
          display: block;
          text-decoration: none;
        }
        .vibe-card-poster {
          width: 90px !important;
          min-width: 90px !important;
          height: 135px !important;
          border-radius: 10px !important;
          overflow: hidden !important;
          flex-shrink: 0 !important;
          background: rgba(0, 0, 0, 0.45) !important;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35) !important;
          position: relative;
          transition: transform 0.25s ease;
        }
        .vibe-vertical-card:hover .vibe-card-poster {
          transform: scale(1.03);
        }
        .vibe-poster-img {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          display: block !important;
        }
        .vibe-poster-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.4);
        }
        .vibe-card-content {
          display: flex !important;
          flex-direction: column !important;
          gap: 6px !important;
          flex: 1 !important;
          min-width: 0 !important;
        }
        .vibe-card-header {
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 8px !important;
        }
        .vibe-title-link {
          flex: 1;
          min-width: 0;
          text-decoration: none;
        }
        .vibe-card-title {
          font-size: 14.5px !important;
          font-weight: 700 !important;
          color: #ffffff !important;
          margin: 0 !important;
          line-height: 1.3 !important;
          display: -webkit-box !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
          overflow: hidden !important;
          transition: color 0.2s ease;
        }
        .vibe-title-link:hover .vibe-card-title {
          color: var(--page-ambient-accent, var(--primary)) !important;
        }
        .vibe-bookmark-btn {
          background: transparent !important;
          border: none !important;
          cursor: pointer !important;
          padding: 4px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 6px !important;
          transition: all 0.2s ease !important;
          flex-shrink: 0 !important;
        }
        .vibe-bookmark-btn:hover {
          background: rgba(255, 255, 255, 0.14) !important;
          transform: scale(1.1);
        }
        .vibe-bookmark-btn.saved {
          color: var(--primary) !important;
        }
        .vibe-card-meta {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          flex-wrap: wrap !important;
        }
        .vibe-meta-badge {
          display: inline-flex !important;
          align-items: center !important;
          gap: 3px !important;
          padding: 2px 7px !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          background: rgba(255, 255, 255, 0.08) !important;
          color: rgba(255, 255, 255, 0.88) !important;
          line-height: 1.2 !important;
        }
        .vibe-meta-badge.rating {
          background: rgba(251, 191, 36, 0.16) !important;
          color: #fbbf24 !important;
        }
        .vibe-meta-badge.type {
          text-transform: uppercase !important;
          font-size: 10px !important;
          letter-spacing: 0.5px !important;
        }
        .vibe-card-overview {
          font-size: 12px !important;
          line-height: 1.48 !important;
          color: rgba(255, 255, 255, 0.68) !important;
          margin: 2px 0 0 0 !important;
          display: -webkit-box !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
          overflow: hidden !important;
          transition: all 0.3s ease !important;
        }
        .vibe-vertical-card:hover .vibe-card-overview {
          display: block !important;
          -webkit-line-clamp: unset !important;
          overflow: visible !important;
          color: rgba(255, 255, 255, 0.94) !important;
        }

        /* Vibe vertical skeletons */
        .vibe-loading-vertical {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 6px;
        }
        .vibe-vertical-skeleton {
          display: flex;
          gap: 14px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          align-items: flex-start;
        }
        .vibe-skel-poster {
          width: 90px !important;
          min-width: 90px !important;
          height: 135px !important;
          border-radius: 10px !important;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.04) 25%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.04) 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s infinite;
          flex-shrink: 0;
        }
        .vibe-skel-info {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
          justify-content: center;
          padding-top: 4px;
        }
        .vibe-skel-line {
          border-radius: 4px;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.04) 25%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.04) 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s infinite;
        }
        .vibe-skel-line.title { width: 75%; height: 16px; }
        .vibe-skel-line.meta { width: 45%; height: 14px; }
        .vibe-skel-line.desc { width: 95%; height: 36px; }

        /* ═════════ Cast ═════════ */
        .cast-scroll-container {
          display: flex; align-items: flex-start; gap: 16px;
          overflow-x: auto; scroll-behavior: smooth;
          padding: 6px 0 16px 0; scrollbar-width: none;
        }
        .cast-scroll-container::-webkit-scrollbar { display: none; }
        .cast-card {
          flex: 0 0 130px; width: 130px; min-width: 130px; max-width: 130px;
          display: flex !important; flex-direction: column !important;
          gap: 4px; text-decoration: none; color: inherit;
        }
        .cast-avatar {
          width: 130px; height: 175px;
          border-radius: 12px; overflow: hidden;
          background: var(--tint);
          margin-bottom: 6px;
          border: 1px solid var(--tint-border);
          transition: var(--transition-smooth);
        }
        .cast-card:hover .cast-avatar { transform: translateY(-4px); border-color: var(--tint-border-strong); box-shadow: 0 8px 22px var(--tint-shadow); }
        .cast-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .cast-name { display: block !important; width: 100%; font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
        .cast-character { display: block !important; width: 100%; font-size: 11.5px; color: rgba(255, 255, 255, 0.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }

        .cast-load-more-card {
          border: 1px dashed var(--tint-border-strong);
          cursor: pointer;
          align-items: center; justify-content: center;
          background: var(--tint);
          border-radius: 12px;
          transition: var(--transition-smooth);
        }
        .cast-load-more-card:hover { background: var(--tint-hover); transform: translateY(-4px); }
        .cast-load-more-inner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 20px 8px; width: 130px; height: 175px; }
        .cast-load-more-bubble { width: 44px; height: 44px; border-radius: 50%; background: var(--tint-strong); display: flex; align-items: center; justify-content: center; color: #fff; }
        .cast-load-more-count { font-size: 13px; font-weight: 700; color: #fff; }
        .cast-load-more-sub { font-size: 11px; color: rgba(255, 255, 255, 0.6); }

        @media (max-width: 768px) {
          .cast-scroll-container, .episodes-scroll-container, .similar-scroll-container {
            padding: 4px 0 14px 0; gap: 12px;
          }
          .episode-card-item { flex: 0 0 230px; width: 230px; min-width: 230px; max-width: 230px; }
        }

        /* ═════════ Episodes ═════════ */
        .section-header-tv { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }

        .season-selector-wrapper { position: relative; z-index: 20; }
        .season-trigger-btn {
          display: inline-flex; align-items: center; gap: 10px;
          background: var(--tint);
          color: #fff;
          border: 1px solid var(--tint-border);
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13.5px; font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
          outline: none;
        }
        .season-trigger-btn:hover, .season-trigger-btn.open { border-color: var(--tint-border-strong); background: var(--tint-hover); }
        .season-chevron { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); color: rgba(255, 255, 255, 0.7); }
        .season-chevron.rotated { transform: rotate(180deg); color: var(--accent-text); }
        .season-dropdown-menu {
          position: absolute; top: calc(100% + 8px); right: 0;
          min-width: 250px; max-height: 280px; overflow-y: auto;
          background: color-mix(in srgb, var(--accent) 14%, rgba(14, 14, 18, 0.92));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--tint-border-strong);
          border-radius: var(--border-radius-md);
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
          padding: 6px;
          display: flex; flex-direction: column; gap: 3px;
          z-index: 50;
        }
        .season-option-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          border-radius: 10px;
          border: none !important;
          background: transparent;
          color: #fff;
          font-size: 13px; text-align: left;
          cursor: pointer;
          transition: var(--transition-fast);
          width: 100%;
        }
        .season-option-item:hover { background: var(--tint-hover); }
        .season-option-item.selected { background: var(--tint-strong); color: var(--accent-text); font-weight: 700; }
        .season-opt-info { display: flex; flex-direction: column; gap: 2px; }
        .season-opt-name { font-weight: 600; }
        .season-opt-count { font-size: 11px; color: rgba(255, 255, 255, 0.6); }
        .season-opt-check { color: var(--accent-text); flex-shrink: 0; }

        .episodes-scroll-container {
          display: flex; gap: 16px;
          overflow-x: auto; scroll-behavior: smooth; scroll-snap-type: x mandatory;
          padding: 16px 16px 24px 16px; scrollbar-width: none;
        }
        .episodes-scroll-container::-webkit-scrollbar { display: none; }
        .episode-card-item { flex: 0 0 280px; width: 280px; min-width: 280px; max-width: 280px; scroll-snap-align: start; }

        :global(.episode-item-card) {
          width: 100%; height: 100%;
          display: flex !important; flex-direction: column !important;
          gap: 10px; padding: 10px;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid var(--tint-border);
          background: var(--tint);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          text-decoration: none;
          color: inherit;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
        }
        :global(.episode-item-card:hover) {
          transform: translateY(-4px);
          background: var(--tint-hover);
          border-color: var(--tint-border-strong);
          box-shadow: 0 10px 28px var(--tint-shadow);
        }
        :global(.episode-item-card.episode-active) {
          border-color: var(--accent);
          box-shadow: 0 0 18px var(--tint-shadow);
        }

        .ep-still-box { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: rgba(0, 0, 0, 0.25); flex-shrink: 0; }
        .ep-still-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        :global(.episode-item-card:hover) .ep-still-img { transform: scale(1.05); }
        .ep-badge-pill {
          position: absolute; top: 8px; left: 8px;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          border: 1px solid var(--tint-border);
          color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.4px;
          padding: 3px 7px; border-radius: 6px; z-index: 2;
        }
        .ep-runtime-pill {
          position: absolute; bottom: 8px; right: 8px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
          font-size: 11px; font-weight: 500;
          padding: 2px 6px; border-radius: 4px; z-index: 2;
        }
        .ep-play-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.2); transition: background 0.25s ease; z-index: 1; }
        :global(.episode-item-card:hover) .ep-play-overlay { background: rgba(0, 0, 0, 0.35); }
        .ep-play-circle {
          width: 44px; height: 44px; border-radius: 50%;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
          border: 1px solid var(--tint-border-strong);
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          transform: scale(0.95);
        }
        :global(.episode-item-card:hover) .ep-play-circle {
          transform: scale(1.1);
          background: var(--accent);
          color: var(--on-accent);
          border-color: var(--accent);
          box-shadow: 0 0 22px var(--tint-shadow);
        }

        .ep-details { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .ep-title { font-size: 14px; font-weight: 600; color: #fff; margin: 0; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ep-meta-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ep-meta-item { font-size: 11.5px; color: rgba(255, 255, 255, 0.65); display: inline-flex; align-items: center; gap: 4px; }
        .ep-rating-item { color: #FFB800; font-weight: 600; }
        .ep-resume-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 1px 6px; border-radius: 4px; background: var(--accent); color: var(--on-accent); }
        .ep-played-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.4px; padding: 1px 6px; border-radius: 4px; background: rgba(48, 209, 88, 0.18); color: #30D158; border: 1px solid rgba(48, 209, 88, 0.35); display: inline-flex; align-items: center; gap: 3px; }
        .ep-played-pill { position: absolute; top: 8px; right: 8px; background: rgba(48, 209, 88, 0.88); backdrop-filter: blur(8px); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; z-index: 2; }
        .ep-progress-bar-container { position: absolute; left: 0; right: 0; bottom: 0; height: 3.5px; background: rgba(255, 255, 255, 0.2); z-index: 2; }
        .ep-progress-bar-fill { height: 100%; background: var(--accent); }
        .ep-overview {
          font-size: 12px; line-height: 1.45; color: rgba(255, 255, 255, 0.65);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; margin: 2px 0 0; min-height: 34px;
        }

        /* ═════════ Similar carousel ═════════ */
        .similar-scroll-container {
          display: flex; align-items: flex-start; gap: 16px;
          overflow-x: auto; scroll-behavior: smooth;
          padding: 16px 16px 24px 16px; scrollbar-width: none;
        }
        .similar-scroll-container::-webkit-scrollbar { display: none; }
        .similar-card-item { flex: 0 0 170px; width: 170px; min-width: 170px; max-width: 170px; }
        @media (min-width: 1024px) {
          .similar-card-item { flex: 0 0 175px; width: 175px; min-width: 175px; max-width: 175px; }
        }

        /* ═════════ Modals ═════════ */
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 20px;
        }
        .trailer-modal-content, .torrent-modal-content {
          width: 100%;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          border: 1px solid var(--tint-border-strong);
          background: color-mix(in srgb, var(--accent) 12%, rgba(14, 14, 18, 0.96));
          color: #fff;
        }
        .trailer-modal-content { max-width: 860px; }
        .torrent-modal-content { max-width: 760px; max-height: 80vh; display: flex; flex-direction: column; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--tint-border); }
        .trailer-iframe-container { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; }
        .trailer-iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }

        .torrent-modal-body { padding: 20px; overflow-y: auto; }
        .torrent-list { display: flex; flex-direction: column; gap: 10px; }
        .torrent-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 16px; border-radius: 10px; gap: 16px;
          background: var(--tint);
          border: 1px solid var(--tint-border);
        }
        .torrent-meta { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .torrent-name { font-size: 13px; font-weight: 600; }
        .torrent-badges { display: flex; gap: 8px; flex-wrap: wrap; }
        .t-badge { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: var(--tint-strong); }
        .torrent-actions { display: flex; align-items: center; gap: 8px; }

        .loading-spinner-container { display: flex; justify-content: center; padding: 80px 0; }
        .spinner {
          width: 40px; height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--accent, var(--primary));
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function DetailPage() {
  return (
    <Suspense
      fallback={<PageLoading label="Loading title details" className="min-h-screen" />}
    >
      <DetailContent />
    </Suspense>
  );
}