"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Star, 
  Heart, 
  Play, 
  Search, 
  ExternalLink, 
  Film, 
  Tv, 
  Clock, 
  Sparkles,
  Layers,
  Info,
  Calendar,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  RotateCcw,
  X,
  CheckCircle2,
  Video,
  MessageSquare,
  Copy,
  Check,
  Download,
  Send,
  ZoomIn
} from 'lucide-react';
import { 
  getImageUrl, 
  getMediaDetails, 
  getMovieImages,
  getExternalIds, 
  getSimilarMedia, 
  getSeasonEpisodes, 
  getGeminiMoviesSimilarTo, 
  getGeminiLensInsight,
  getTrailers,
  getCollectionDetails,
  GLOBAL_CONFIG,
  TMDBResult,
  TMDBSeason,
  TMDBEpisode,
  TMDBVideo,
  TMDBImage,
  TMDBCollectionDetails
} from '@/utils/tmdb';
import { searchTorrents, TorrentResult } from '@/utils/Scraper';
import { getProgress, WatchProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';
import MovieCard from '@/components/MovieCard';
import axios from 'axios';

function DetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idStr = searchParams.get('id');
  const typeStr = (searchParams.get('type') as 'movie' | 'tv') || 'movie';

  const [movie, setMovie] = useState<TMDBResult | null>(null);
  const [galleryImages, setGalleryImages] = useState<TMDBImage[]>([]);
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState<number | null>(null);
  const [isGalleryMounted, setIsGalleryMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [historyProgress, setHistoryProgress] = useState<WatchProgress | null>(null);
  const [collectionData, setCollectionData] = useState<TMDBCollectionDetails | null>(null);
  
  // Cast and recommendations
  const [similarMedia, setSimilarMedia] = useState<TMDBResult[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<TMDBResult[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  // TV Seasons & Episodes
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  // AI Insights Panel State (Lens, Chat, Vibe)
  const [aiTab, setAiTab] = useState<'lens' | 'chat' | 'vibe'>('lens');
  const [lensInsight, setLensInsight] = useState<any>(null);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensError, setLensError] = useState<string | null>(null);
  const [aiVibeError, setAiVibeError] = useState<string | null>(null);

  // Horizontal Carousel scroll refs
  const castScrollRef = useRef<HTMLDivElement>(null);
  const episodesScrollRef = useRef<HTMLDivElement>(null);
  const similarScrollRef = useRef<HTMLDivElement>(null);
  const vibeScrollRef = useRef<HTMLDivElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);

  const scrollCarousel = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const amount = ref.current.clientWidth * 0.75;
      ref.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  useEffect(() => setIsGalleryMounted(true), []);

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

  // Fetch franchise collection parts if movie belongs to a collection
  useEffect(() => {
    if (movie?.belongs_to_collection?.id) {
      getCollectionDetails(movie.belongs_to_collection.id)
        .then(col => setCollectionData(col))
        .catch(() => {});
    } else {
      setCollectionData(null);
    }
  }, [movie?.belongs_to_collection?.id]);

  const tmdbId = Number(idStr);

  const fetchDetails = useCallback(async () => {
    if (!tmdbId || !typeStr) return;
    setLoading(true);
    setGalleryImages([]);
    setSelectedGalleryIndex(null);
    try {
      const details = await getMediaDetails(tmdbId, typeStr);
      setMovie(details);
      setLoading(false);
      void getMovieImages(tmdbId, typeStr).then(setGalleryImages);
      
      const similar = await getSimilarMedia(tmdbId, typeStr);
      setSimilarMedia(similar.slice(0, 10));

      const progress = await getProgress(tmdbId);
      if (progress) setHistoryProgress(progress);

      const trailerList = await getTrailers(tmdbId, typeStr);
      setTrailers(trailerList);

      if (typeStr === 'tv' && details.seasons && details.seasons.length > 0) {
        const firstSeason = details.seasons.find(s => s.season_number > 0) || details.seasons[0];
        setSelectedSeason(firstSeason.season_number);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tmdbId, typeStr]);

  const loadWatchlistState = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      if (stored) {
        const list = JSON.parse(stored);
        setWatchlistIds(new Set(list.map((i: any) => i.id)));
        setIsInWatchlist(list.some((item: any) => item.id === tmdbId));
      }
      const historyStr = await AsyncStorage.getItem('history');
      if (historyStr) {
        const hList = JSON.parse(historyStr);
        setIsWatched(hList.some((item: any) => item.id === tmdbId));
      }
    } catch (e) {}
  }, [tmdbId]);

  useEffect(() => {
    fetchDetails();
    loadWatchlistState();
  }, [fetchDetails, loadWatchlistState]);

  useEffect(() => {
    const refreshLibraryState = () => { void loadWatchlistState(); };
    window.addEventListener('watcher_cloud_synced', refreshLibraryState);
    window.addEventListener('watcher_local_library_changed', refreshLibraryState);
    return () => {
      window.removeEventListener('watcher_cloud_synced', refreshLibraryState);
      window.removeEventListener('watcher_local_library_changed', refreshLibraryState);
    };
  }, [loadWatchlistState]);

  // Manual trigger for Gemini AI vibes (does not auto-run on mount)
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

  // Load TV show episodes when season changes
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
      
      if (currentList.find((i: any) => i.id === movie.id)) {
        currentList = currentList.filter((i: any) => i.id !== movie.id);
        setIsInWatchlist(false);
      } else {
        currentList.push(movie);
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
      if (list.some((i: any) => i.id === movie.id)) {
        list = list.filter((i: any) => i.id !== movie.id);
        setIsWatched(false);
      } else {
        list.push({
          ...movie,
          media_type: typeStr,
          watchedAt: Date.now(),
        });
        setIsWatched(true);
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
    const officialTrailer = trailers.find(t => t.type === 'Trailer' && t.site === 'YouTube') || trailers[0];
    if (officialTrailer) {
      setActiveTrailerKey(officialTrailer.key);
      setShowTrailerModal(true);
    } else {
      alert("No video trailer available for this title.");
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
    setMovieChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setMovieChatLoading(true);

    try {
      const title = movie?.title || movie?.name || '';
      const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
        action: 'chat',
        message: `Regarding the movie/TV show "${title}" (${movie?.release_date || movie?.first_air_date || ''}): ${userMsg}`,
        customApiKey: GLOBAL_CONFIG.customApiKey,
      });
      const botText = response.data?.reply?.text || (typeof response.data?.reply === 'string' ? response.data.reply : "I couldn't process that question.");
      setMovieChatMessages(prev => [...prev, { role: 'bot', text: botText }]);
    } catch {
      setMovieChatMessages(prev => [...prev, { role: 'bot', text: "Sorry, I had trouble answering that right now." }]);
    } finally {
      setMovieChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="detail-container detail-skeleton" aria-busy="true" aria-label="Loading title details">
        <div className="skeleton-backdrop">
          <div className="skeleton-back-button skeleton-shimmer" />
          <div className="skeleton-backdrop-shade" />
        </div>
        <div className="skeleton-content">
          <div className="skeleton-main">
            <div className="skeleton-poster skeleton-shimmer" />
            <div className="skeleton-meta">
              <div className="skeleton-title skeleton-shimmer" />
              <div className="skeleton-tagline skeleton-shimmer" />
              <div className="skeleton-badges">
                <div className="skeleton-badge skeleton-shimmer" />
                <div className="skeleton-badge skeleton-shimmer" />
                <div className="skeleton-badge skeleton-shimmer" />
                <div className="skeleton-badge skeleton-shimmer" />
              </div>
              <div className="skeleton-actions">
                <div className="skeleton-action skeleton-shimmer" />
                <div className="skeleton-action secondary skeleton-shimmer" />
              </div>
            </div>
          </div>
          <div className="skeleton-overview">
            <div className="skeleton-heading skeleton-shimmer" />
            <div className="skeleton-line skeleton-shimmer" />
            <div className="skeleton-line skeleton-shimmer" />
            <div className="skeleton-line short skeleton-shimmer" />
          </div>
        </div>
        <style jsx>{`
          .detail-container {
            position: relative;
            margin: -32px -36px 0;
            width: calc(100% + 72px);
            min-height: 100vh;
            overflow: hidden;
            background: var(--bg-color);
          }

          .skeleton-backdrop {
            position: relative;
            height: min(55vh, 480px);
            min-height: 420px;
            background: var(--card-bg);
          }

          .skeleton-back-button {
            position: absolute;
            z-index: 1;
            top: 30px;
            left: 40px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
          }

          .skeleton-backdrop-shade {
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, transparent 25%, var(--bg-color) 100%);
          }

          .skeleton-content {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            gap: 40px;
            margin-top: -120px;
            padding: 0 40px 48px;
          }

          .skeleton-main {
            display: flex;
            align-items: flex-end;
            gap: 32px;
          }

          .skeleton-poster {
            flex: 0 0 220px;
            height: 330px;
            border: 1px solid var(--card-border);
            border-radius: var(--border-radius-md);
          }

          .skeleton-meta {
            display: flex;
            flex: 1;
            flex-direction: column;
            gap: 16px;
            padding-bottom: 4px;
          }

          .skeleton-title {
            width: min(58%, 440px);
            height: 42px;
            border-radius: 6px;
          }

          .skeleton-tagline {
            width: min(38%, 300px);
            height: 16px;
            border-radius: 5px;
          }

          .skeleton-badges,
          .skeleton-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }

          .skeleton-badge {
            width: 74px;
            height: 28px;
            border-radius: 14px;
          }

          .skeleton-badge:nth-child(2) { width: 110px; }
          .skeleton-badge:nth-child(3) { width: 58px; }

          .skeleton-actions { margin-top: 4px; }

          .skeleton-action {
            width: 150px;
            height: 46px;
            border-radius: var(--border-radius-md);
          }

          .skeleton-action.secondary { width: 112px; }

          .skeleton-overview {
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-width: 760px;
          }

          .skeleton-heading {
            width: 150px;
            height: 24px;
            margin-bottom: 4px;
            border-radius: 5px;
          }

          .skeleton-line {
            width: 100%;
            height: 14px;
            border-radius: 5px;
          }

          .skeleton-line.short { width: 68%; }

          .skeleton-shimmer {
            background: linear-gradient(90deg, var(--card-bg) 25%, var(--sidebar-hover) 50%, var(--card-bg) 75%);
            background-size: 200% 100%;
            animation: detail-skeleton-shimmer 1.5s ease-in-out infinite;
          }

          @keyframes detail-skeleton-shimmer {
            to { background-position: -200% 0; }
          }

          @media (max-width: 1024px) {
            .detail-container { margin: -24px -24px 0; width: calc(100% + 48px); }
          }

          @media (max-width: 900px) {
            .detail-container { margin: -20px -20px 0; width: calc(100% + 40px); }
            .skeleton-backdrop { height: 340px; min-height: 300px; }
            .skeleton-content { margin-top: -100px; }
          }

          @media (max-width: 768px) {
            .skeleton-main { flex-direction: column; align-items: center; text-align: center; }
            .skeleton-meta { align-items: center; width: 100%; }
            .skeleton-badges, .skeleton-actions { justify-content: center; }
            .skeleton-overview { width: 100%; }
          }

          @media (max-width: 640px) {
            .detail-container { margin: -16px -16px 0; width: calc(100% + 32px); }
            .skeleton-back-button { top: 20px; left: 20px; }
            .skeleton-content { margin-top: -88px; padding: 0 20px 36px; gap: 32px; }
            .skeleton-poster { flex-basis: auto; width: 180px; height: 270px; }
            .skeleton-title { width: 78%; height: 34px; }
            .skeleton-tagline { width: 52%; }
            .skeleton-overview { text-align: left; }
          }

          @media (prefers-reduced-motion: reduce) {
            .skeleton-shimmer { animation: none; }
          }
        `}</style>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="empty-state">
        <Info size={32} />
        <p>Movie details could not be found.</p>
        <button className="btn-secondary" onClick={() => router.push('/')}>Go Home</button>
      </div>
    );
  }

  const titleText = movie.title || movie.name;
  const ratingText = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const yearText = (movie.release_date || movie.first_air_date || '').substring(0, 4);

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
    <div className="detail-container">
      {/* Backdrop cover and banner */}
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

      {/* Media Details Summary Panel */}
      <div className="detail-content-wrapper animate-fade-in-up">
        <div className="main-meta-box">
          <div className="poster-box">
            <img src={getImageUrl(movie.poster_path, 'w500')} alt={titleText} className="poster-img" />
          </div>
          
          <div className="meta-details">
            <h1 className="movie-title">{titleText}</h1>
            {movie.tagline && <p className="tagline">"{movie.tagline}"</p>}
            
            <div className="details-badges">
              <div className="rating-badge">
                <Star size={14} fill="#f59e0b" stroke="#f59e0b" />
                <span>{ratingText}</span>
              </div>
              <span className="badge year" title="Release Date">{movie.release_date || movie.first_air_date || 'Unknown Date'}</span>
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
                  {movie.genres.map(g => g.name).slice(0, 3).join(' • ')}
                </span>
              )}
            </div>

            {/* Core Action buttons */}
            <div className="detail-actions">
              {typeStr === 'movie' ? (
                <Link 
                  href={`/player?id=${movie.id}&type=movie&title=${encodeURIComponent(titleText || '')}&poster=${encodeURIComponent(movie.poster_path || '')}`}
                  className="btn-primary"
                >
                  <Play size={18} fill="white" />
                  <span>Play Movie</span>
                </Link>
              ) : (
                <button 
                  className="btn-primary"
                  onClick={() => {
                    const seasonNum = historyProgress?.lastSeason || selectedSeason || 1;
                    const epNum = historyProgress?.lastEpisode || 1;
                    router.push(`/player?id=${movie.id}&type=tv&title=${encodeURIComponent(titleText || '')}&season=${seasonNum}&episode=${epNum}&poster=${encodeURIComponent(movie.poster_path || '')}`);
                  }}
                >
                  <Play size={18} fill="white" />
                  <span>
                    {historyProgress?.lastSeason 
                      ? `Resume S${historyProgress.lastSeason}:E${historyProgress.lastEpisode}`
                      : 'Play Episode 1'}
                  </span>
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
                <Heart size={18} fill={isInWatchlist ? "var(--primary)" : "none"} color={isInWatchlist ? "var(--primary)" : "currentColor"} />
                <span>{isInWatchlist ? 'In Watchlist' : 'Watchlist'}</span>
              </button>

              <button 
                className={`btn-secondary ${isWatched ? 'watched-active' : ''}`}
                onClick={toggleWatched}
                title={isWatched ? "Mark as unwatched" : "Mark as watched"}
              >
                <CheckCircle2 
                  size={18} 
                  color={isWatched ? "#30D158" : "currentColor"} 
                  fill={isWatched ? "rgba(48, 209, 88, 0.2)" : "none"} 
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

        {/* Playback Resume State */}
        {historyProgress && (
          <div className="resume-play-box glass animate-fade-in-up">
            <div className="resume-info">
              <Film size={20} className="resume-icon" />
              <div>
                <h4>Resume Playback</h4>
                <p>
                  {typeStr === 'tv' 
                    ? `Season ${historyProgress.lastSeason}, Episode ${historyProgress.lastEpisode}`
                    : 'Movie'}
                </p>
              </div>
            </div>
            <Link 
              href={`/player?id=${movie.id}&type=${typeStr}&title=${encodeURIComponent(titleText || '')}&season=${historyProgress.lastSeason}&episode=${historyProgress.lastEpisode}`}
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              Resume Play
            </Link>
          </div>
        )}

        {/* Synopsis Grid details */}
        <div className="synopsis-box">
          <h2>Synopsis</h2>
          <p className="overview-text">{movie.overview}</p>
        </div>

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


        {/* Franchise / Collection Universe Banner */}
        {movie.belongs_to_collection && (
          <div className="franchise-banner-section animate-fade-in-up">
            <Link 
              href={`/collection?id=${movie.belongs_to_collection.id}&name=${encodeURIComponent(movie.belongs_to_collection.name)}`}
              className="franchise-card"
            >
              <img 
                src={getImageUrl(
                  (movie.belongs_to_collection.backdrop_path || 
                  collectionData?.backdrop_path || 
                  movie.backdrop_path) ?? null, 
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
                    <span className="franchise-parts-count">
                      {collectionData.parts.length} Movies in Timeline
                    </span>
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

        {/* Unified AI Insights Panel (Lens | Chat | Vibe) */}
        <div className="ai-panel glass-premium animate-fade-in-up">
          <div className="ai-header">
            <div className="ai-header-left">
              <Sparkles size={18} className="ai-sparkle-icon" />
              <div>
                <h3 className="ai-header-title">AI Insights</h3>
                <p className="ai-header-subtitle">Powered by Gemini AI</p>
              </div>
            </div>
            
            <div className="ai-tabs">
              <button 
                className={`ai-tab-btn ${aiTab === 'lens' ? 'active' : ''}`}
                onClick={() => setAiTab('lens')}
              >
                <span>Lens</span>
              </button>
              <button 
                className={`ai-tab-btn ${aiTab === 'chat' ? 'active' : ''}`}
                onClick={() => setAiTab('chat')}
              >
                <span>Chat</span>
              </button>
              <button 
                className={`ai-tab-btn ${aiTab === 'vibe' ? 'active' : ''}`}
                onClick={() => setAiTab('vibe')}
              >
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
                          <blockquote className="friend-verdict">
                            "{lensInsight.friendVerdict}"
                          </blockquote>
                        )}
                        <div className="lens-fields-grid">
                          {lensInsight.vibe && (
                            <div className="lens-field-card glass">
                              <span className="field-label">Vibe & Tone</span>
                              <p className="field-val">{lensInsight.vibe}</p>
                            </div>
                          )}
                          {lensInsight.whatItsActuallyAbout && (
                            <div className="lens-field-card glass">
                              <span className="field-label">Story & Premise</span>
                              <p className="field-val">{lensInsight.whatItsActuallyAbout}</p>
                            </div>
                          )}
                        </div>
                        {(lensInsight.certificationWarning || lensInsight.whatYoullSee) && (
                          <div className="lens-advisory glass">
                            <span className="advisory-title">⚠️ Content Advisory & Certification</span>
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
                        <div className="bubble-content loading">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
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
                  <div className="vibe-loading-row">
                    {[1, 2, 3, 4].map(n => (
                      <div key={n} className="vibe-skeleton-card glass" />
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
                  <div className="vibe-results-carousel">
                    <div className="section-header-row" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-muted)' }}>Vibe Matches</span>
                      <div className="carousel-nav-arrows">
                        <button className="nav-arrow-btn" onClick={() => scrollCarousel(vibeScrollRef, 'left')} aria-label="Scroll vibe left">
                          <ChevronLeft size={18} />
                        </button>
                        <button className="nav-arrow-btn" onClick={() => scrollCarousel(vibeScrollRef, 'right')} aria-label="Scroll vibe right">
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="vibe-carousel-wrapper">
                      <div className="vibe-scroll-container" ref={vibeScrollRef}>
                        {aiRecommendations.map((item) => (
                          <div key={item.id} className="vibe-card-item">
                            <MovieCard
                              item={item}
                              isAdded={watchlistIds.has(item.id)}
                              toggleWatchlist={async (it, e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const stored = await AsyncStorage.getItem('watchlist');
                                let list = stored ? JSON.parse(stored) : [];
                                if (list.find((i: any) => i.id === it.id)) {
                                  list = list.filter((i: any) => i.id !== it.id);
                                } else {
                                  list.push(it);
                                }
                                await AsyncStorage.setItem('watchlist', JSON.stringify(list));
                                setWatchlistIds(new Set(list.map((i: any) => i.id)));
                              }}
                              showTitle={true}
                            />
                          </div>
                        ))}
                      </div>
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

        {/* Director / Creator */}
        {movie.director && (
          <div className="director-section animate-fade-in-up" style={{ marginBottom: 32 }}>
            <h2 className="director-heading">
              {movie.director.job === 'Creator' ? 'Creator' : 'Director'}
            </h2>
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

        {/* Cast list linking to /cast */}
        {movie.cast && movie.cast.length > 0 && (
          <div className="cast-section">
            <div className="section-header-row">
              <h2>Cast</h2>
              <div className="carousel-nav-arrows">
                <button className="nav-arrow-btn" onClick={() => scrollCarousel(castScrollRef, 'left')} aria-label="Scroll cast left">
                  <ChevronLeft size={18} />
                </button>
                <button className="nav-arrow-btn" onClick={() => scrollCarousel(castScrollRef, 'right')} aria-label="Scroll cast right">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            
            <div className="cast-carousel-wrapper">
              <div className="cast-scroll-container" ref={castScrollRef}>
                {movie.cast.map((member) => (
                  <Link key={member.id} href={`/cast?id=${member.id}`} className="cast-card">
                    <div className="cast-avatar">
                      <img 
                        src={getImageUrl(member.profile_path, 'w185')} 
                        alt={member.name} 
                        className="cast-img" 
                        loading="lazy"
                      />
                    </div>
                    <span className="cast-name" title={member.name}>{member.name}</span>
                    <span className="cast-character" title={member.character}>{member.character}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Episodes listing for TV Show */}
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

                {/* Themed Season Selector Dropdown */}
                <div className="season-selector-wrapper" ref={seasonDropdownRef}>
                  <button 
                    type="button"
                    className={`season-trigger-btn ${isSeasonDropdownOpen ? 'open' : ''}`}
                    onClick={() => setIsSeasonDropdownOpen(prev => !prev)}
                    aria-expanded={isSeasonDropdownOpen}
                    aria-haspopup="listbox"
                  >
                    <span className="season-trigger-label">
                      {(() => {
                        const current = movie.seasons.find(s => s.season_number === (selectedSeason || 1));
                        return current ? `${current.name} (${current.episode_count} Episodes)` : `Season ${selectedSeason || 1}`;
                      })()}
                    </span>
                    <ChevronDown size={15} className={`season-chevron ${isSeasonDropdownOpen ? 'rotated' : ''}`} />
                  </button>

                  {isSeasonDropdownOpen && (
                    <div className="season-dropdown-menu glass-premium animate-fade-in" role="listbox">
                      {movie.seasons
                        .filter(s => s.season_number > 0)
                        .map(s => {
                          const isCurrent = s.season_number === (selectedSeason || 1);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`season-option-item ${isCurrent ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedSeason(s.season_number);
                                setIsSeasonDropdownOpen(false);
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
                        })
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>

            {loadingEpisodes ? (
              <div className="loading-spinner-container" style={{ padding: '30px' }}>
                <div className="spinner" />
              </div>
            ) : episodes.length > 0 ? (
              <div className="episodes-carousel-wrapper">
                <div className="episodes-scroll-container" ref={episodesScrollRef}>
                  {episodes.map((ep) => {
                    const isResumeTarget = Boolean(
                      historyProgress && 
                      historyProgress.lastSeason === ep.season_number && 
                      historyProgress.lastEpisode === ep.episode_number
                    );

                    return (
                      <div key={ep.id} className="episode-card-item">
                        <Link
                          href={`/player?id=${movie.id}&type=tv&title=${encodeURIComponent(titleText || '')}&season=${ep.season_number}&episode=${ep.episode_number}&poster=${encodeURIComponent(movie.poster_path || '')}`}
                          className={`episode-item-card glass ${isResumeTarget ? 'episode-active' : ''}`}
                          onClick={(e) => {
                            e.preventDefault();
                            router.push(`/player?id=${movie.id}&type=tv&title=${encodeURIComponent(titleText || '')}&season=${ep.season_number}&episode=${ep.episode_number}&poster=${encodeURIComponent(movie.poster_path || '')}`);
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

                            {ep.runtime && ep.runtime > 0 ? (
                              <div className="ep-runtime-pill">
                                <span>{ep.runtime}m</span>
                              </div>
                            ) : null}

                            <div className="ep-play-overlay">
                              <div className="ep-play-circle">
                                <Play size={18} fill="white" style={{ marginLeft: 2 }} />
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
                                <span className="ep-resume-badge">Resume</span>
                              ) : null}
                            </div>

                            <p className="ep-overview">{ep.overview || "No episode description available."}</p>
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

        {/* Similar Media Section */}
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
                        if (list.find((i: any) => i.id === it.id)) {
                          list = list.filter((i: any) => i.id !== it.id);
                        } else {
                          list.push(it);
                        }
                        await AsyncStorage.setItem('watchlist', JSON.stringify(list));
                        setWatchlistIds(new Set(list.map((i: any) => i.id)));
                      }}
                      showTitle={true}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trailer Modal */}
      {showTrailerModal && activeTrailerKey && (
        <div className="modal-backdrop" onClick={() => setShowTrailerModal(false)}>
          <div className="trailer-modal-content glass-premium" onClick={(e) => e.stopPropagation()}>
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

      {/* Torrent Scraper Modal */}
      {showTorrentModal && (
        <div className="modal-backdrop" onClick={() => setShowTorrentModal(false)}>
          <div className="torrent-modal-content glass-premium" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Download size={20} style={{ color: 'var(--primary)' }} />
                <h3>Torrents for "{titleText}"</h3>
              </div>
              <button className="panel-close-btn" onClick={() => setShowTorrentModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="torrent-modal-body">
              {torrentLoading ? (
                <div className="loading-spinner-container" style={{ padding: '40px 0' }}>
                  <div className="spinner" />
                </div>
              ) : torrents.length > 0 ? (
                <div className="torrent-list">
                  {torrents.map((t) => (
                    <div key={t.id} className="torrent-item glass">
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
                        <a 
                          href={t.url} 
                          className="btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          title="Open Magnet Link"
                        >
                          <Download size={14} /> Magnet
                        </a>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 10px' }}
                          onClick={() => handleCopyMagnet(t.url)}
                          title="Copy Magnet Link"
                        >
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

      {isGalleryMounted && selectedGalleryIndex !== null && galleryImages[selectedGalleryIndex] && createPortal(
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
        .detail-container {
          position: relative;
          margin-top: -32px;
          margin-left: -36px;
          margin-right: -36px;
          width: calc(100% + 72px);
          max-width: calc(100% + 72px);
          box-sizing: border-box;
        }

        @media (max-width: 1024px) {
          .detail-container {
            margin-top: -24px;
            margin-left: -24px;
            margin-right: -24px;
            width: calc(100% + 48px);
            max-width: calc(100% + 48px);
          }
        }

        @media (max-width: 900px) {
          .detail-container {
            margin-top: -20px;
            margin-left: -20px;
            margin-right: -20px;
            width: calc(100% + 40px);
            max-width: calc(100% + 40px);
          }
        }

        @media (max-width: 640px) {
          .detail-container {
            margin-top: -16px;
            margin-left: -16px;
            margin-right: -16px;
            width: calc(100% + 32px);
            max-width: calc(100% + 32px);
          }
        }

        @media (max-width: 768px) {
          .carousel-nav-arrows,
          .nav-arrow-btn {
            display: none !important;
          }
        }

        .backdrop-header {
          position: relative;
          width: 100%;
          height: 480px;
          min-height: 420px;
          max-height: 55vh;
          overflow: hidden;
          background: var(--bg-color);
        }

        @media (max-width: 900px) {
          .backdrop-header {
            height: 340px;
            min-height: 300px;
          }
        }

        .backdrop-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 20%;
          opacity: 0.88;
          transition: opacity 0.3s ease;
        }

        :global([data-theme="light"]) .backdrop-img {
          opacity: 0.95;
        }

        .backdrop-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg, 
            rgba(12, 12, 14, 0.08) 0%, 
            rgba(12, 12, 14, 0.25) 45%, 
            rgba(12, 12, 14, 0.75) 80%, 
            var(--bg-color) 100%
          );
          pointer-events: none;
        }

        :global([data-theme="light"]) .backdrop-overlay {
          background: linear-gradient(
            180deg, 
            rgba(255, 255, 255, 0.02) 0%, 
            rgba(245, 245, 247, 0.2) 45%, 
            rgba(245, 245, 247, 0.75) 80%, 
            var(--bg-color) 100%
          );
        }

        .back-btn {
          position: absolute;
          top: 30px;
          left: 40px;
          color: var(--foreground);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-smooth);
          z-index: 10;
        }

        .back-btn:hover {
          background: var(--sidebar-hover);
          transform: scale(1.05);
        }

        .detail-content-wrapper {
          position: relative;
          padding: 0 40px;
          margin-top: -120px;
          display: flex;
          flex-direction: column;
          gap: 34px;
          z-index: 5;
        }

        .main-meta-box {
          display: flex;
          gap: 32px;
          align-items: flex-end;
        }

        @media (max-width: 768px) {
          .main-meta-box {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
        }

        .poster-box {
          width: 220px;
          height: 330px;
          flex-shrink: 0;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
          border: 1px solid var(--card-border);
        }

        .poster-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .meta-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .movie-title {
          font-size: 38px;
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.5px;
        }

        .tagline {
          font-style: italic;
          color: var(--foreground-muted);
          font-size: 15px;
        }

        .details-badges {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .rating-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
          border: 1px solid rgba(245, 158, 11, 0.25);
          padding: 4px 10px;
          border-radius: 9999px;
          font-weight: 700;
          font-size: 13px;
        }

        [data-theme="dark"] .rating-badge {
          background: rgba(250, 204, 21, 0.15);
          color: #facc15;
          border-color: rgba(250, 204, 21, 0.3);
        }

        .badge {
          font-size: 12px;
          background: var(--badge-bg);
          border: 1px solid var(--badge-border);
          padding: 4px 10px;
          border-radius: var(--border-radius-sm);
          color: var(--foreground-muted);
          display: inline-flex;
          align-items: center;
        }

        .detail-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .watchlist-added {
          border-color: var(--primary) !important;
          color: var(--primary) !important;
          background: rgba(229, 9, 20, 0.1) !important;
        }

        .watched-active {
          border-color: #30D158;
          color: #30D158;
          background: rgba(48, 209, 88, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .watched-active:hover {
          background: rgba(48, 209, 88, 0.2);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: #30D158;
        }

        .resume-play-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-radius: var(--border-radius-md);
        }

        .resume-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .resume-icon {
          color: var(--primary);
        }

        .resume-info h4 {
          font-size: 15px;
          font-weight: 600;
        }

        .resume-info p {
          font-size: 13px;
          color: var(--foreground-muted);
        }

        /* Franchise / Collection Universe Banner */
        .franchise-banner-section {
          width: 100%;
          margin-top: 12px;
          margin-bottom: 36px;
        }

        :global(.franchise-card) {
          position: relative;
          width: 100%;
          height: 180px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          display: flex;
          align-items: stretch;
          background: #0d0d12;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          text-decoration: none;
          cursor: pointer;
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }

        :global([data-theme="light"]) :global(.franchise-card) {
          background: #111827;
          border: 1px solid rgba(0, 0, 0, 0.1);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        }

        :global(.franchise-card:hover) {
          transform: translateY(-2px) scale(1.002);
          border-color: rgba(229, 9, 20, 0.45);
          box-shadow: 0 14px 35px rgba(0, 0, 0, 0.65), 0 0 20px rgba(229, 9, 20, 0.15);
        }

        .franchise-backdrop-img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 25%;
          opacity: 0.5;
          transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        }

        :global(.franchise-card:hover) .franchise-backdrop-img {
          transform: scale(1.04);
          opacity: 0.65;
        }

        .franchise-backdrop-gradient {
          position: absolute;
          inset: 0;
          background: 
            linear-gradient(90deg, rgba(10, 10, 14, 0.96) 0%, rgba(10, 10, 14, 0.78) 45%, rgba(10, 10, 14, 0.35) 100%),
            linear-gradient(0deg, rgba(10, 10, 14, 0.92) 0%, transparent 60%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          pointer-events: none;
        }

        .franchise-content {
          position: relative;
          z-index: 2;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 24px 32px;
        }

        .franchise-badge-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .franchise-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          background: rgba(229, 169, 60, 0.16);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(229, 169, 60, 0.35);
          border-radius: 20px;
          color: #E5A93C;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .franchise-icon {
          color: #E5A93C;
        }

        .franchise-parts-count {
          font-size: 12px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.75);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .franchise-parts-count::before {
          content: '•';
          color: rgba(255, 255, 255, 0.4);
        }

        .franchise-bottom-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
        }

        .franchise-title-wrap {
          flex: 1;
          max-width: 750px;
        }

        .franchise-title {
          font-size: 24px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 6px;
          letter-spacing: -0.3px;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
        }

        .franchise-desc {
          font-size: 13.5px;
          color: var(--foreground-muted);
          line-height: 1.4;
          margin: 0;
        }

        .franchise-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 30px;
          color: #fff;
          font-size: 13.5px;
          font-weight: 700;
          letter-spacing: 0.3px;
          flex-shrink: 0;
          transition: all 0.25s ease;
        }

        :global(.franchise-card:hover) .franchise-action-btn {
          background: var(--primary-gradient);
          border-color: transparent;
          box-shadow: 0 4px 15px rgba(229, 9, 20, 0.5);
          transform: translateX(4px);
        }

        @media (max-width: 768px) {
          :global(.franchise-card) {
            height: auto;
            min-height: 160px;
          }

          .franchise-content {
            padding: 18px 20px;
            gap: 16px;
          }

          .franchise-bottom-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 14px;
          }

          .franchise-title {
            font-size: 20px;
          }

          .franchise-desc {
            font-size: 12.5px;
          }

          .franchise-action-btn {
            padding: 8px 16px;
            font-size: 12.5px;
          }
        }

        .synopsis-box h2, .cast-section h2, .similar-media-section h2, .ai-recs-section h2 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .overview-text {
          font-size: 15px;
          line-height: 1.7;
          color: var(--foreground-muted);
          max-width: 900px;
        }

        .gallery-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }

        .gallery-heading {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .gallery-heading h2 {
          font-size: 20px;
          font-weight: 600;
        }

        .gallery-heading span {
          color: var(--foreground-muted);
          font-size: 13px;
        }

        .gallery-controls {
          display: flex;
          gap: 8px;
          margin-left: auto;
        }

        .gallery-scroll-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: 1px solid var(--card-border);
          border-radius: 50%;
          color: var(--foreground);
          background: var(--card-bg);
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .gallery-scroll-btn:hover {
          background: var(--sidebar-hover);
          border-color: var(--foreground-muted);
        }

        .gallery-track {
          display: flex;
          align-items: center;
          gap: 14px;
          overflow-x: auto;
          padding: 2px 2px 12px;
          overscroll-behavior-x: contain;
          scroll-snap-type: x mandatory;
        }

        .gallery-item {
          position: relative;
          flex: 0 0 auto;
          width: 320px;
          height: 180px;
          padding: 0;
          overflow: hidden;
          border: 1px solid var(--card-border);
          border-radius: 12px;
          background: var(--card-bg);
          color: inherit;
          cursor: zoom-in;
          scroll-snap-align: start;
        }

        .gallery-item.poster {
          width: 120px;
        }

        .gallery-item img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .gallery-zoom-icon {
          position: absolute;
          right: 10px;
          bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .gallery-item:hover .gallery-zoom-icon,
        .gallery-item:focus-visible .gallery-zoom-icon {
          opacity: 1;
        }

        :global(.detail-lightbox-backdrop) {
          position: fixed;
          inset: 0;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 56px 72px;
          background: rgba(0, 0, 0, 0.94);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          animation: detail-lightbox-in 0.18s ease-out;
        }

        :global(.detail-lightbox-content) {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          max-width: 100%;
          max-height: 100%;
        }

        :global(.detail-lightbox-header) {
          position: absolute;
          top: -44px;
          right: 0;
          left: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: rgba(255, 255, 255, 0.88);
          font-size: 14px;
          font-weight: 600;
        }

        :global(.detail-lightbox-header button),
        :global(.detail-lightbox-nav) {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 50%;
          color: #fff;
          background: rgba(30, 30, 34, 0.85);
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }

        :global(.detail-lightbox-header button:hover),
        :global(.detail-lightbox-nav:hover) {
          background: var(--primary);
          transform: scale(1.06);
        }

        :global(.detail-lightbox-image) {
          display: block;
          max-width: min(86vw, 1400px);
          max-height: 82vh;
          object-fit: contain;
          border-radius: 8px;
          user-select: none;
        }

        :global(.detail-lightbox-nav) {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
        }

        :global(.detail-lightbox-nav:hover) {
          transform: translateY(-50%) scale(1.06);
        }

        :global(.detail-lightbox-nav.previous) { left: 20px; }
        :global(.detail-lightbox-nav.next) { right: 20px; }

        @keyframes detail-lightbox-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @media (max-width: 640px) {
          .gallery-item {
            width: 278px;
            height: 156px;
          }

          .gallery-item.poster {
            width: 104px;
          }

          .gallery-zoom-icon { opacity: 1; }
          :global(.detail-lightbox-backdrop) { padding: 52px 12px; }
          :global(.detail-lightbox-image) { max-width: 94vw; max-height: 78vh; }
          :global(.detail-lightbox-nav) { width: 38px; height: 38px; }
          :global(.detail-lightbox-nav.previous) { left: 8px; }
          :global(.detail-lightbox-nav.next) { right: 8px; }
        }

        /* Director / Creator Section */
        .director-section {
          margin-top: 4px;
        }

        .director-heading {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .director-card {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          padding: 10px 16px 10px 10px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 100px;
          text-decoration: none;
          transition: var(--transition-fast);
          cursor: pointer;
        }

        .director-card:hover {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-1px);
        }

        .director-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          border: 2px solid rgba(255, 255, 255, 0.12);
        }

        .director-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .director-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .director-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
        }

        .director-role {
          font-size: 11.5px;
          color: var(--foreground-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        :global([data-theme="light"]) .director-card {
          background: rgba(0, 0, 0, 0.04);
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        :global([data-theme="light"]) .director-card:hover {
          background: rgba(0, 0, 0, 0.07);
          border-color: rgba(0, 0, 0, 0.15);
        }

        :global([data-theme="light"]) .director-avatar {
          border-color: rgba(0, 0, 0, 0.1);
        }

        .ai-panel {
          padding: 24px;
          border-radius: var(--border-radius-lg);
          border: 1px solid rgba(138, 43, 226, 0.3);
          background: rgba(18, 14, 28, 0.6);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          margin-top: 4px;
        }

        :global([data-theme="light"]) .ai-panel {
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(138, 43, 226, 0.22);
          box-shadow: 0 10px 30px rgba(138, 43, 226, 0.08), 0 2px 10px rgba(0, 0, 0, 0.04);
        }

        .ai-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          flex-wrap: wrap;
          gap: 14px;
        }

        :global([data-theme="light"]) .ai-header {
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        }

        .ai-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ai-sparkle-icon {
          color: #a78bfa;
          filter: drop-shadow(0 0 8px rgba(167, 139, 250, 0.5));
        }

        :global([data-theme="light"]) .ai-sparkle-icon {
          color: #7c3aed;
          filter: drop-shadow(0 0 8px rgba(124, 58, 237, 0.35));
        }

        .ai-header-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.3px;
        }

        .ai-header-subtitle {
          font-size: 11.5px;
          color: var(--foreground-muted);
          margin-top: 1px;
        }

        .ai-tabs {
          display: flex;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 100px;
          padding: 3px;
          gap: 4px;
        }

        :global([data-theme="light"]) .ai-tabs {
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .ai-tab-btn {
          padding: 6px 18px;
          border-radius: 100px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--foreground-muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .ai-tab-btn:hover {
          color: var(--foreground);
        }

        :global([data-theme="light"]) .ai-tab-btn {
          color: var(--foreground-muted);
        }

        :global([data-theme="light"]) .ai-tab-btn:hover {
          color: var(--foreground);
        }

        .ai-tab-btn.active {
          background: rgba(138, 43, 226, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: rgba(167, 139, 250, 0.4);
          color: #a78bfa;
          box-shadow: 0 2px 10px rgba(138, 43, 226, 0.3);
        }

        :global([data-theme="light"]) .ai-tab-btn.active {
          background: #ffffff;
          border-color: rgba(124, 58, 237, 0.3);
          color: #7c3aed;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.15);
        }

        .ai-tab-body {
          min-height: 120px;
        }

        .ai-unloaded-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 20px;
          text-align: center;
          gap: 16px;
        }

        .ai-unloaded-state p {
          font-size: 14px;
          color: var(--foreground-muted);
          max-width: 500px;
          line-height: 1.5;
        }

        .ai-action-btn,
        .ai-generate-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          border-radius: 100px;
          background: linear-gradient(135deg, rgba(138, 43, 226, 0.85) 0%, rgba(109, 40, 217, 0.9) 100%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(167, 139, 250, 0.5);
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
          box-shadow: 0 4px 15px rgba(138, 43, 226, 0.35);
        }

        .ai-action-btn:hover,
        .ai-generate-btn:hover {
          transform: translateY(-2px);
          background: linear-gradient(135deg, rgba(147, 51, 234, 0.95) 0%, rgba(124, 58, 237, 1) 100%);
          border-color: #c4b5fd;
          box-shadow: 0 6px 20px rgba(138, 43, 226, 0.5);
        }

        .re-generate-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          color: var(--foreground-muted);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 16px;
          transition: var(--transition-fast);
        }

        .re-generate-btn:hover {
          color: var(--foreground);
          border-color: rgba(255, 255, 255, 0.2);
        }

        :global([data-theme="light"]) .re-generate-btn {
          background: rgba(0, 0, 0, 0.04);
          border: 1px solid rgba(0, 0, 0, 0.1);
          color: var(--foreground-muted);
        }

        :global([data-theme="light"]) .re-generate-btn:hover {
          background: rgba(0, 0, 0, 0.08);
          border-color: rgba(0, 0, 0, 0.2);
          color: var(--foreground);
        }

        :global([data-theme="light"]) .verdict-pill {
          background: rgba(124, 58, 237, 0.1);
          border: 1px solid rgba(124, 58, 237, 0.3);
          color: #6d28d9;
        }

        :global([data-theme="light"]) .friend-verdict {
          color: var(--foreground);
          border-left: 3px solid #7c3aed;
        }

        :global([data-theme="light"]) .lens-field-card {
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        :global([data-theme="light"]) .lens-advisory {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        :global([data-theme="light"]) .advisory-title {
          color: #b45309;
        }

        :global([data-theme="light"]) .chat-bubble-row.bot .bubble-content {
          background: rgba(0, 0, 0, 0.04);
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: var(--foreground);
        }

        :global([data-theme="light"]) .chat-input {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.12);
          color: var(--foreground);
        }

        :global([data-theme="light"]) .chat-input:focus {
          border-color: #7c3aed;
        }

        :global([data-theme="light"]) .shimmer-bar {
          background: linear-gradient(90deg, rgba(0,0,0,0.02) 25%, rgba(124,58,237,0.1) 50%, rgba(0,0,0,0.02) 75%);
        }

        :global([data-theme="light"]) .vibe-skeleton-card {
          background: linear-gradient(90deg, rgba(0,0,0,0.02) 25%, rgba(124,58,237,0.08) 50%, rgba(0,0,0,0.02) 75%);
        }

        /* Lens Output */
        .lens-insight-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .verdict-row {
          display: flex;
          align-items: center;
        }

        .verdict-pill {
          display: inline-flex;
          align-items: center;
          background: rgba(138, 43, 226, 0.2);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(167, 139, 250, 0.4);
          color: #c4b5fd;
          padding: 4px 14px;
          border-radius: 100px;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }

        .friend-verdict {
          font-size: 16px;
          font-weight: 600;
          line-height: 1.6;
          color: #fff;
          font-style: italic;
          padding-left: 14px;
          border-left: 3px solid #a78bfa;
          margin: 6px 0 10px 0;
        }

        .lens-fields-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 12px;
        }

        .lens-field-card {
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .field-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: var(--foreground-muted);
          margin-bottom: 6px;
        }

        .field-val {
          font-size: 13.5px;
          line-height: 1.5;
          color: var(--foreground);
        }

        .lens-advisory {
          padding: 14px 18px;
          border-radius: 14px;
          background: rgba(255, 179, 0, 0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 179, 0, 0.25);
        }

        .advisory-title {
          display: block;
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          color: #ffb300;
          letter-spacing: 0.8px;
          margin-bottom: 4px;
        }

        .advisory-text {
          font-size: 13px;
          line-height: 1.5;
          color: var(--foreground);
        }

        /* AI Loading Skeleton */
        .ai-loading-box {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 20px 0;
        }

        .shimmer-bar {
          height: 14px;
          border-radius: 8px;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(138,43,226,0.15) 50%, rgba(255,255,255,0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.6s infinite;
        }

        .shimmer-bar.full { width: 100%; }
        .shimmer-bar.three-quarters { width: 75%; }
        .shimmer-bar.half { width: 45%; }

        .loading-note {
          font-size: 12.5px;
          color: var(--foreground-muted);
          font-style: italic;
          margin-top: 4px;
        }

        .ai-error-box {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          padding: 16px 0;
        }

        .error-msg {
          font-size: 13.5px;
          color: #fca5a5;
        }

        .retry-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          font-size: 12px;
        }

        /* Chat Tab */
        .chat-tab-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          font-size: 13px;
          color: var(--foreground-muted);
        }

        .chat-messages-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 320px;
          overflow-y: auto;
          padding: 10px 4px;
          margin-bottom: 14px;
        }

        .chat-bubble-row {
          display: flex;
          width: 100%;
        }

        .chat-bubble-row.user {
          justify-content: flex-end;
        }

        .chat-bubble-row.bot {
          justify-content: flex-start;
        }

        .bubble-content {
          max-width: 75%;
          padding: 10px 16px;
          border-radius: 16px;
          font-size: 13.5px;
          line-height: 1.5;
        }

        .chat-bubble-row.user .bubble-content {
          background: linear-gradient(135deg, var(--primary) 0%, #b30710 100%);
          color: #fff;
          border-bottom-right-radius: 4px;
        }

        .chat-bubble-row.bot .bubble-content {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--foreground);
          border-bottom-left-radius: 4px;
        }

        .bubble-sender {
          display: block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          opacity: 0.6;
          margin-bottom: 3px;
        }

        .chat-input-row {
          display: flex;
          gap: 10px;
        }

        .chat-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          padding: 10px 16px;
          border-radius: 12px;
          color: var(--foreground);
          font-size: 13.5px;
          outline: none;
        }

        .chat-input:focus {
          border-color: #a78bfa;
        }

        .send-btn {
          padding: 0 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Vibe Carousel */
        .vibe-results-carousel {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }



        .vibe-loading-row {
          display: flex;
          gap: 14px;
          overflow: hidden;
          padding: 10px 0;
        }

        .vibe-skeleton-card {
          width: 160px;
          height: 240px;
          border-radius: 14px;
          flex-shrink: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(138,43,226,0.12) 50%, rgba(255,255,255,0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.8s infinite;
        }

        /* Cast Section */
        .section-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .carousel-nav-arrows {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .nav-arrow-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .nav-arrow-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
        }

        .cast-carousel-wrapper, .episodes-carousel-wrapper, .similar-carousel-wrapper, .vibe-carousel-wrapper {
          position: relative;
          margin: 0;
          width: 100%;
        }

        .cast-scroll-container {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          overflow-x: auto;
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;
          padding: 6px 0 16px 0;
          scrollbar-width: none;
        }

        .cast-scroll-container::-webkit-scrollbar {
          display: none;
        }

        .cast-card {
          flex: 0 0 130px;
          width: 130px;
          min-width: 130px;
          max-width: 130px;
          scroll-snap-align: start;
          display: flex !important;
          flex-direction: column !important;
          gap: 4px;
          text-decoration: none;
          color: inherit;
        }

        .cast-avatar {
          width: 130px;
          height: 175px;
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          margin-bottom: 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: var(--transition-smooth);
        }

        .cast-card:hover .cast-avatar {
          transform: translateY(-4px);
          border-color: var(--primary);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
        }

        .cast-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .cast-name {
          display: block !important;
          width: 100%;
          font-size: 13px;
          font-weight: 700;
          color: var(--foreground);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.3;
        }

        .cast-character {
          display: block !important;
          width: 100%;
          font-size: 11.5px;
          color: var(--foreground-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }

        /* Flanking nav buttons for carousels */
        .nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--card-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.85;
          box-shadow: 0 4px 18px var(--shadow-color);
          transition: all 0.2s ease-in-out;
          z-index: 10;
        }

        .nav-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: #ffffff;
          transform: translateY(-50%) scale(1.1);
          opacity: 1;
        }

        .prev-btn { left: 8px; }
        .next-btn { right: 8px; }

        @media (max-width: 768px) {
          .nav-btn { display: none; }
          .cast-carousel-wrapper,
          .episodes-carousel-wrapper,
          .similar-carousel-wrapper,
          .vibe-carousel-wrapper {
            margin: 0;
          }
          .cast-scroll-container,
          .episodes-scroll-container,
          .similar-scroll-container,
          .vibe-scroll-container {
            padding: 4px 0 14px 0;
            gap: 12px;
          }
          .episode-card-item {
            flex: 0 0 230px;
            width: 230px;
            min-width: 230px;
            max-width: 230px;
          }
        }

        /* TV Episodes section */
        .section-header-tv {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }

        /* Themed Season Selector Dropdown Menu */
        .season-selector-wrapper {
          position: relative;
          z-index: 20;
        }

        .season-trigger-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: var(--input-bg);
          color: var(--foreground);
          border: 1px solid var(--card-border);
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
          box-shadow: 0 2px 8px var(--shadow-color);
          outline: none;
        }

        .season-trigger-btn:hover,
        .season-trigger-btn.open {
          border-color: var(--primary);
          background: var(--sidebar-hover);
        }

        .season-chevron {
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          color: var(--foreground-muted);
        }

        .season-chevron.rotated {
          transform: rotate(180deg);
          color: var(--primary);
        }

        .season-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 250px;
          max-height: 280px;
          overflow-y: auto;
          background: var(--card-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius-md);
          box-shadow: 0 12px 36px var(--shadow-color);
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          z-index: 50;
        }

        .season-option-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: var(--foreground);
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          transition: var(--transition-fast);
          width: 100%;
        }

        .season-option-item:hover {
          background: var(--sidebar-hover);
          color: var(--foreground);
        }

        .season-option-item.selected {
          background: rgba(229, 9, 20, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--primary);
          font-weight: 700;
        }

        .season-opt-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .season-opt-name {
          font-weight: 600;
        }

        .season-opt-count {
          font-size: 11px;
          color: var(--foreground-muted);
        }

        .season-opt-check {
          color: var(--primary);
          flex-shrink: 0;
        }

        .episodes-scroll-container {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;
          padding: 16px 16px 24px 16px;
          scrollbar-width: none;
        }

        .episodes-scroll-container::-webkit-scrollbar {
          display: none;
        }

        .episode-card-item {
          flex: 0 0 280px;
          width: 280px;
          min-width: 280px;
          max-width: 280px;
          scroll-snap-align: start;
        }

        :global(.episode-item-card) {
          width: 100%;
          height: 100%;
          display: flex !important;
          flex-direction: column !important;
          gap: 10px;
          padding: 10px;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid var(--card-border);
          background: var(--card-bg);
          box-shadow: 0 4px 16px var(--shadow-color);
          cursor: pointer;
          text-decoration: none;
          color: inherit;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), 
                      border-color 0.25s ease, 
                      box-shadow 0.25s ease;
        }

        :global(.episode-item-card:hover) {
          transform: translateY(-4px);
          border-color: var(--primary-glow, rgba(229, 9, 20, 0.4));
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        }

        :global(.episode-item-card.episode-active) {
          border-color: var(--primary);
          box-shadow: 0 0 16px rgba(229, 9, 20, 0.25);
        }

        .ep-still-box {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 10px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.25);
          flex-shrink: 0;
        }

        .ep-still-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }

        :global(.episode-item-card:hover) .ep-still-img {
          transform: scale(1.05);
        }

        .ep-badge-pill {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.4px;
          padding: 3px 7px;
          border-radius: 6px;
          z-index: 2;
        }

        .ep-runtime-pill {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
          font-size: 11px;
          font-weight: 500;
          padding: 2px 6px;
          border-radius: 4px;
          z-index: 2;
        }

        .ep-play-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.2);
          transition: background 0.25s ease;
          z-index: 1;
        }

        :global(.episode-item-card:hover) .ep-play-overlay {
          background: rgba(0, 0, 0, 0.35);
        }

        .ep-play-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          transform: scale(0.95);
        }

        :global(.episode-item-card:hover) .ep-play-circle {
          transform: scale(1.1);
          background: var(--primary);
          border-color: var(--primary);
          box-shadow: 0 0 20px rgba(229, 9, 20, 0.6);
        }

        .ep-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1;
        }

        .ep-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
          margin: 0;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ep-meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .ep-meta-item {
          font-size: 11.5px;
          color: var(--foreground-muted);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .ep-rating-item {
          color: #FFB800;
          font-weight: 600;
        }

        .ep-resume-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 1px 6px;
          border-radius: 4px;
          background: var(--primary);
          color: #ffffff;
        }

        .ep-overview {
          font-size: 12px;
          line-height: 1.45;
          color: var(--foreground-muted);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 2px 0 0;
          min-height: 34px;
        }

        /* AI Vibe Carousel */
        .vibe-scroll-container {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          overflow-x: auto;
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;
          padding: 16px 16px 24px 16px;
          scrollbar-width: none;
        }

        .vibe-scroll-container::-webkit-scrollbar {
          display: none;
        }

        .vibe-card-item {
          flex: 0 0 170px;
          width: 170px;
          min-width: 170px;
          max-width: 170px;
          scroll-snap-align: start;
        }

        @media (min-width: 1024px) {
          .vibe-card-item {
            flex: 0 0 175px;
            width: 175px;
            min-width: 175px;
            max-width: 175px;
          }
        }

        /* Similar Media Carousel */
        .similar-scroll-container {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          overflow-x: auto;
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;
          padding: 16px 16px 24px 16px;
          scrollbar-width: none;
        }

        .similar-scroll-container::-webkit-scrollbar {
          display: none;
        }

        .similar-card-item {
          flex: 0 0 170px;
          width: 170px;
          min-width: 170px;
          max-width: 170px;
          scroll-snap-align: start;
        }

        @media (min-width: 1024px) {
          .similar-card-item {
            flex: 0 0 175px;
            width: 175px;
            min-width: 175px;
            max-width: 175px;
          }
        }

        /* Modal Overlays */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }

        .trailer-modal-content {
          width: 100%;
          max-width: 860px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--card-border);
        }

        .trailer-iframe-container {
          position: relative;
          padding-bottom: 56.25%;
          height: 0;
          overflow: hidden;
        }

        .trailer-iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
        }

        .torrent-modal-content {
          width: 100%;
          max-width: 760px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          border-radius: var(--border-radius-md);
          overflow: hidden;
        }

        .torrent-modal-body {
          padding: 20px;
          overflow-y: auto;
        }

        .torrent-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .torrent-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: 10px;
          gap: 16px;
        }

        .torrent-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .torrent-name {
          font-size: 13px;
          font-weight: 600;
        }

        .torrent-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .t-badge {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 6px;
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .torrent-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          padding: 80px 0;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function DetailPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner" />
      </div>
    }>
      <DetailContent />
    </Suspense>
  );
}
