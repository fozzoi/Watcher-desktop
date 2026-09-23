"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Star, Heart, Play, Sparkles, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { 
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  searchTMDB, 
  getImageUrl, 
  TMDBResult 
} from '@/utils/tmdb';
import { 
  getUserPreferences, 
  isOnboardingComplete, 
  LANGUAGE_OPTIONS, 
  UserPreferences 
} from '@/utils/userPreferences';
import { getAllProgress, removeProgress, WatchProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';
import MediaCarousel from '@/components/MediaCarousel';
import WatchHistoryCarousel from '@/components/WatchHistoryCarousel';
import MovieCard from '@/components/MovieCard';

const GENRE_DATA = [
  { id: 0, name: 'All', icon: '🎬' },
  { id: 28, name: 'Action', icon: '💥' },
  { id: 12, name: 'Adventure', icon: '🗺️' },
  { id: 16, name: 'Animation', icon: '🎨' },
  { id: 35, name: 'Comedy', icon: '😂' },
  { id: 80, name: 'Crime', icon: '🔪' },
  { id: 27, name: 'Horror', icon: '👻' },
  { id: 10749, name: 'Romance', icon: '💕' },
  { id: 878, name: 'Sci-Fi', icon: '🚀' },
  { id: 53, name: 'Thriller', icon: '😱' },
];

export default function ExplorePage() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [watchHistory, setWatchHistory] = useState<WatchProgress[]>([]);
  const [rawContent, setRawContent] = useState<any>(null);
  const [becauseYouWatched, setBecauseYouWatched] = useState<{ sourceTitle: string; items: any[] }[]>([]);
  const [onboardingDone, setOnboardingDone] = useState(true);
  
  // Hero section sliding index
  const [heroIndex, setHeroIndex] = useState(0);
  const heroIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const genresScrollRef = useRef<HTMLDivElement>(null);

  const scrollGenres = (direction: 'left' | 'right') => {
    if (genresScrollRef.current) {
      const { scrollLeft, clientWidth } = genresScrollRef.current;
      const scrollAmount = clientWidth * 0.6;
      genresScrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Load user details
  const loadUserData = useCallback(async () => {
    try {
      const [mStr, aStr, history, onbDone] = await Promise.all([
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('favoriteArtists'),
        getAllProgress(),
        isOnboardingComplete(),
      ]);

      const m = mStr ? JSON.parse(mStr) : [];
      const a = aStr ? JSON.parse(aStr) : [];
      setSavedIds(new Set([...m.map((i: any) => i.id), ...a.map((i: any) => i.id)]));
      setWatchHistory(history);
      setOnboardingDone(onbDone);

      // Fetch dynamic "Because you watched..." feeds
      if (history.length > 0) {
        const simData = await getSimilarForHistory(history);
        setBecauseYouWatched(simData);
      }
    } catch (e) {
      console.error("Failed to load user data:", e);
    }
  }, []);

  // Fetch explore content using personalization
  const fetchContent = useCallback(async (genreId: number = 0, forceRefresh: boolean = false) => {
    setContentLoading(true);
    try {
      const prefs = await getUserPreferences();
      const content = await fetchPersonalisedDiscoveryContent(
        prefs.languages,
        prefs.genreIds,
        genreId,
        forceRefresh,
        prefs.favoriteActors
      );
      if (content) {
        setRawContent(content);
      }
    } catch (err) {
      console.error("Failed to load explore content:", err);
    } finally {
      setContentLoading(false);
    }
  }, []);

  // Initialize
  useEffect(() => {
    loadUserData();
    fetchContent(selectedGenre);
  }, [selectedGenre, loadUserData, fetchContent]);

  // Auto-slide hero section
  useEffect(() => {
    const heroList = rawContent?.heroMovies || rawContent?.trendingMovies;
    if (!heroList || heroList.length === 0) return;
    
    if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    
    heroIntervalRef.current = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(6, heroList.length));
    }, 6000);
    
    return () => {
      if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    };
  }, [rawContent]);

  // Search handler
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    
    setSearchLoading(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchTMDB(query);
        setSearchResults(results.filter(item => item.poster_path));
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Toggle watchlist
  const toggleWatchlist = async (item: TMDBResult, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const stored = await AsyncStorage.getItem('watchlist');
      let list = stored ? JSON.parse(stored) : [];
      
      const exists = list.some((i: any) => i.id === item.id);
      if (exists) {
        list = list.filter((i: any) => i.id !== item.id);
        setSavedIds((prev) => {
          const updated = new Set(prev);
          updated.delete(item.id);
          return updated;
        });
      } else {
        list.push(item);
        setSavedIds((prev) => new Set(prev).add(item.id));
      }
      
      await AsyncStorage.setItem('watchlist', JSON.stringify(list));
    } catch (err) {
      console.error("Failed to update watchlist:", err);
    }
  };

  const handleRemoveHistoryItem = async (tmdbId: number) => {
    await removeProgress(tmdbId);
    setWatchHistory((prev) => prev.filter((item) => item.tmdbId !== tmdbId));
  };

  const heroList = rawContent?.heroMovies || rawContent?.trendingMovies || [];
  const currentHeroMovie = heroList[heroIndex] || heroList[0];

  return (
    <div className="explore-container">
      {/* Background Ambience */}
      <div className="atmos-container">
        <div className="atmos-blob rotate-1" />
        <div className="atmos-blob rotate-2" />
      </div>

      {/* Header Search & Actions */}
      <div className="explore-header-row">
        <div className="search-bar-container">
          <span className="search-icon-wrapper">
            <Search size={19} />
          </span>
          <input
            type="text"
            placeholder="Search movies, TV shows, actors, directors..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input-field glass"
          />
        </div>
        
        <button className="ai-btn" onClick={() => router.push('/ai-search')}>
          <Sparkles size={16} />
          <span>Ask AI</span>
        </button>
      </div>

      {/* Onboarding Welcome Banner if not yet completed */}
      {!onboardingDone && (
        <div className="onboarding-welcome-card glass-premium animate-fade-in-up">
          <div className="welcome-left">
            <div className="welcome-sparkle-icon">
              <Sparkles size={24} />
            </div>
            <div>
              <h3>Personalize Your Cinema Experience</h3>
              <p>Choose your preferred languages (*Hollywood, Bollywood, Mollywood, Anime, etc.*), favorite genres, and favorite stars to customize this feed.</p>
            </div>
          </div>
          <Link href="/onboarding" className="btn-primary" style={{ flexShrink: 0 }}>
            <span>Personalize Now</span>
            <ChevronRight size={16} />
          </Link>
        </div>
      )}

      {/* Search mode results */}
      {query.trim() !== '' ? (
        <div className="search-results-section animate-fade-in-up">
          <h2 className="section-title">
            {searchLoading ? 'Searching...' : `Results for "${query}"`}
          </h2>
          {searchLoading ? (
            <div className="loading-spinner-container">
              <div className="spinner" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="media-grid">
              {searchResults.map((item) => (
                <MovieCard
                  key={item.id}
                  item={item}
                  isAdded={savedIds.has(item.id)}
                  toggleWatchlist={toggleWatchlist}
                  showTitle={true}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">No results found.</div>
          )}
        </div>
      ) : !rawContent && contentLoading ? (
        <div className="explore-skeleton-container animate-fade-in-up">
          <div className="skeleton-hero glass-card" />
          <div className="skeleton-genres-row">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div key={n} className="skeleton-chip glass" />
            ))}
          </div>
          <div className="skeleton-carousels">
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton-carousel-block">
                <div className="skeleton-title glass" />
                <div className="skeleton-cards-row">
                  {[1, 2, 3, 4, 5, 6].map((m) => (
                    <div key={m} className="skeleton-card glass" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Standard explore mode dashboard */
        <>
              {/* Dynamic Hero Section */}
              {currentHeroMovie && (
                <div className="hero-section glass-premium animate-fade-in-up">
                  <div className="hero-banner-wrapper">
                    <img
                      src={getImageUrl(currentHeroMovie.backdrop_path || currentHeroMovie.poster_path, 'original')}
                      alt={currentHeroMovie.title || currentHeroMovie.name}
                      className="hero-backdrop"
                    />
                    <div className="hero-gradient-overlay" />
                  </div>
                  
                  <div className="hero-content">
                    <h1 className="hero-title">{currentHeroMovie.title || currentHeroMovie.name}</h1>
                    <p className="hero-overview">{currentHeroMovie.overview}</p>
                    
                    <div className="hero-meta">
                      <div className="hero-rating">
                        <Star size={16} fill="gold" stroke="gold" />
                        <span>{currentHeroMovie.vote_average?.toFixed(1) || 'N/A'}</span>
                      </div>
                      <span className="hero-year">
                        {(currentHeroMovie.release_date || currentHeroMovie.first_air_date || '').substring(0, 4)}
                      </span>
                    </div>

                    <div className="hero-actions">
                      <button 
                        className="btn-primary" 
                        onClick={() => router.push(`/detail?id=${currentHeroMovie.id}&type=${currentHeroMovie.media_type || 'movie'}`)}
                      >
                        <Play size={18} fill="white" />
                        <span>View Details</span>
                      </button>
                      
                      <button 
                        className="btn-secondary hero-btn" 
                        onClick={(e) => toggleWatchlist(currentHeroMovie, e)}
                      >
                        <Heart size={18} fill={savedIds.has(currentHeroMovie.id) ? "var(--primary)" : "none"} color={savedIds.has(currentHeroMovie.id) ? "var(--primary)" : "currentColor"} />
                        <span>{savedIds.has(currentHeroMovie.id) ? 'In Watchlist' : 'Add Watchlist'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Slides Indicators */}
                  <div className="hero-indicators">
                    {heroList.slice(0, 6).map((_: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setHeroIndex(idx)}
                        className={`indicator-dot ${heroIndex === idx ? 'active' : ''}`}
                        aria-label={`Slide ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Genre selector (placed below hero carousel) */}
              <div className="genres-wrapper animate-fade-in-up">
                <button 
                  className="genre-nav-btn prev-btn" 
                  onClick={() => scrollGenres('left')} 
                  aria-label="Scroll genres left"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="genres-container" ref={genresScrollRef}>
                  {GENRE_DATA.map((genre) => (
                    <button
                      key={genre.id}
                      onClick={() => setSelectedGenre(genre.id)}
                      className={`genre-chip ${selectedGenre === genre.id ? 'active' : ''}`}
                    >
                      <span className="genre-icon">{genre.icon}</span>
                      <span className="genre-name">{genre.name}</span>
                    </button>
                  ))}
                </div>

                <button 
                  className="genre-nav-btn next-btn" 
                  onClick={() => scrollGenres('right')} 
                  aria-label="Scroll genres right"
                >
                  <ChevronRight size={18} />
                </button>

                {contentLoading && rawContent && (
                  <div className="genre-loading-bar">
                    <div className="genre-loading-progress" />
                  </div>
                )}
              </div>

              {/* Continue Watching Section */}
              <WatchHistoryCarousel 
                history={watchHistory} 
                onRemove={handleRemoveHistoryItem} 
              />

              {/* "Because you watched..." dynamic history recommendations */}
              {becauseYouWatched.length > 0 && becauseYouWatched.map((sec, idx) => (
                <MediaCarousel 
                  key={idx}
                  title={`Because you watched ${sec.sourceTitle}`}
                  type={`similar/${sec.items[0]?.media_type || 'movie'}/${sec.items[0]?.id}`}
                  data={sec.items}
                  savedIds={savedIds}
                  toggleWatchlist={toggleWatchlist}
                />
              ))}

              {/* Actor Spotlight Carousels */}
              {rawContent?.actorData?.length > 0 && rawContent.actorData.map((act: any) => (
                <MediaCarousel 
                  key={`actor-${act.actorId}`}
                  title={`Because you love ${act.actorName}`}
                  type={`actor-${act.actorId}`}
                  data={act.items}
                  savedIds={savedIds}
                  toggleWatchlist={toggleWatchlist}
                />
              ))}

              {/* Tailored Language Carousels */}
              {rawContent?.langData && Object.entries(rawContent.langData).map(([langCode, data]: [string, any]) => {
                const langMeta = LANGUAGE_OPTIONS.find(l => l.code === langCode);
                const title = langMeta ? `Trending in ${langMeta.label} (${langMeta.industry})` : `Trending in ${langCode.toUpperCase()}`;
                return (
                  <React.Fragment key={langCode}>
                    {data.movies?.length > 0 && (
                      <MediaCarousel 
                        title={`${title} - Movies`}
                        type={`lang-movies-${langCode}`}
                        data={data.movies}
                        savedIds={savedIds}
                        toggleWatchlist={toggleWatchlist}
                      />
                    )}
                    {data.tv?.length > 0 && (
                      <MediaCarousel 
                        title={`${title} - Series`}
                        type={`lang-tv-${langCode}`}
                        data={data.tv}
                        savedIds={savedIds}
                        toggleWatchlist={toggleWatchlist}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {/* Tailored Genre Carousels */}
              {rawContent?.genreData?.length > 0 && rawContent.genreData.map((gen: any) => (
                <MediaCarousel 
                  key={`genre-${gen.genreId}`}
                  title="Curated for Your Taste"
                  type={`genre/${gen.genreId}`}
                  data={gen.items}
                  savedIds={savedIds}
                  toggleWatchlist={toggleWatchlist}
                />
              ))}

              {/* Global Discovery Categories */}
              {rawContent && (
                <div className="carousels-container">
                  <MediaCarousel title="Trending Movies Worldwide" type="trendingMovies" data={rawContent.trendingMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Trending Television Series" type="trendingTV" data={rawContent.trendingTV} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Top Rated Masterpieces" type="topRated" data={rawContent.topRated} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Upcoming Releases" type="upcoming" data={rawContent.upcoming} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Hidden Cinema Gems" type="hiddenGems" data={rawContent.hiddenGems} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                </div>
              )}
            </>
          )}

      <style jsx>{`
        .explore-container {
          position: relative;
          z-index: 1;
        }

        /* Atmospheric Animated Background */
        .atmos-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          z-index: -1;
          pointer-events: none;
        }

        .atmos-blob {
          position: absolute;
          width: 60vw;
          height: 60vw;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.15;
        }

        .rotate-1 {
          background: radial-gradient(circle, var(--primary) 0%, transparent 70%);
          top: -10vw;
          left: 10vw;
          animation: spin 60s linear infinite;
        }

        .rotate-2 {
          background: radial-gradient(circle, #5b1bf5 0%, transparent 70%);
          bottom: -10vw;
          right: 10vw;
          animation: spin-back 75s linear infinite;
        }

        @keyframes spin {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(50px, -30px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes spin-back {
          0% { transform: translate(0, 0) rotate(360deg); }
          50% { transform: translate(-40px, 40px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }

        /* Header search row */
        .explore-header-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          width: 100%;
        }

        .search-bar-container {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
        }

        .search-icon-wrapper {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--foreground-muted);
          pointer-events: none;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
        }

        .search-input-field {
          width: 100%;
          height: 48px;
          padding: 0 20px 0 52px !important;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 14px;
          color: var(--foreground);
          font-size: 14.5px;
          font-weight: 500;
          outline: none;
          box-sizing: border-box;
          transition: var(--transition-smooth);
        }

        .search-input-field:focus {
          border-color: var(--primary);
          background: var(--input-focus-bg);
          box-shadow: 0 0 15px rgba(229, 9, 20, 0.25);
        }

        /* Explore Skeleton Loader */
        .explore-skeleton-container {
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding: 10px 0 50px;
        }

        .skeleton-hero {
          width: 100%;
          height: 440px;
          border-radius: 24px;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.8s infinite;
        }

        .skeleton-genres-row {
          display: flex;
          gap: 12px;
          overflow: hidden;
        }

        .skeleton-chip {
          width: 110px;
          height: 42px;
          border-radius: 20px;
          flex-shrink: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.8s infinite;
        }

        .skeleton-carousels {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .skeleton-carousel-block {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .skeleton-title {
          width: 220px;
          height: 22px;
          border-radius: 6px;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.8s infinite;
        }

        .skeleton-cards-row {
          display: flex;
          gap: 16px;
          overflow: hidden;
        }

        .skeleton-card {
          width: 170px;
          height: 255px;
          border-radius: 16px;
          flex-shrink: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.8s infinite;
        }

        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .ai-btn {
          background: linear-gradient(135deg, #8a2be2 0%, #4a00e0 100%);
          color: white;
          border: none;
          padding: 0 24px;
          height: 48px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
          box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4);
        }

        .ai-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(138, 43, 226, 0.6);
          filter: brightness(1.1);
        }

        .onboarding-welcome-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-radius: var(--border-radius-md);
          margin-bottom: 24px;
          gap: 20px;
        }

        .welcome-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .welcome-sparkle-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(229, 9, 20, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .welcome-left h3 {
          font-size: 16px;
          font-weight: 700;
        }

        .welcome-left p {
          font-size: 13px;
          color: var(--foreground-muted);
          margin-top: 2px;
        }

        /* Genre Chip Row */
        .genres-wrapper {
          position: relative;
          margin-bottom: 24px;
        }

        .genres-container {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding: 4px 38px 8px 38px;
          scrollbar-width: none;
        }

        .genres-container::-webkit-scrollbar {
          display: none;
        }

        .genre-nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.85;
          box-shadow: 0 4px 12px var(--shadow-color);
          transition: var(--transition-fast);
          z-index: 5;
        }

        .genre-nav-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          opacity: 1;
          transform: translateY(-50%) scale(1.1);
        }

        .genre-nav-btn.prev-btn { left: 0; }
        .genre-nav-btn.next-btn { right: 0; }

        .genre-loading-bar {
          position: absolute;
          bottom: 0;
          left: 40px;
          right: 40px;
          height: 2px;
          border-radius: 1px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          overflow: hidden;
        }

        .genre-loading-progress {
          width: 40%;
          height: 100%;
          background: var(--primary);
          border-radius: 1px;
          animation: genreLoadingShimmer 1s infinite ease-in-out;
        }

        @keyframes genreLoadingShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }

        .genre-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 20px;
          background: var(--input-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground-muted);
          cursor: pointer;
          white-space: nowrap;
          transition: var(--transition-fast);
          font-size: 14px;
          font-weight: 500;
        }

        .genre-chip:hover {
          background: var(--sidebar-hover);
          color: var(--foreground);
        }

        .genre-chip.active {
          background: var(--primary-gradient);
          color: white;
          border-color: transparent;
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        /* Hero section */
        .hero-section {
          position: relative;
          width: 100%;
          height: 440px;
          border-radius: var(--border-radius-lg);
          overflow: hidden;
          margin-bottom: 40px;
          display: flex;
          align-items: flex-end;
          padding: 40px;
        }

        .hero-banner-wrapper {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .hero-backdrop {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .hero-gradient-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(0deg, rgba(12, 12, 14, 0.95) 0%, rgba(12, 12, 14, 0.4) 50%, rgba(12, 12, 14, 0.1) 100%),
                      linear-gradient(90deg, rgba(12, 12, 14, 0.8) 0%, transparent 60%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .hero-content {
          position: relative;
          z-index: 2;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .hero-title {
          font-size: 44px;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.5px;
          color: white;
        }

        .hero-overview {
          font-size: 15px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.8);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .hero-meta {
          display: flex;
          align-items: center;
          gap: 14px;
          font-size: 14px;
        }

        .hero-rating {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          padding: 4px 10px;
          border-radius: var(--border-radius-sm);
          color: #ffd700;
          font-weight: 700;
        }

        .hero-year {
          color: rgba(255, 255, 255, 0.7);
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 6px;
        }

        .hero-btn {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          color: white;
        }

        .hero-indicators {
          position: absolute;
          bottom: 24px;
          right: 30px;
          display: flex;
          gap: 8px;
          z-index: 2;
        }

        .indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: none;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .indicator-dot.active {
          background: var(--primary);
          width: 24px;
          border-radius: 4px;
        }

        /* Loading shimmer */
        .loading-shimmer-explore {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .shimmer-hero {
          width: 100%;
          height: 380px;
          border-radius: var(--border-radius-lg);
          background: var(--input-bg);
          animation: pulse 1.5s infinite ease-in-out;
        }

        .shimmer-title {
          width: 200px;
          height: 24px;
          border-radius: 6px;
          background: var(--input-bg);
          animation: pulse 1.5s infinite ease-in-out;
        }

        .shimmer-cards-row {
          display: flex;
          gap: 16px;
          overflow: hidden;
        }

        .shimmer-card {
          width: 180px;
          height: 270px;
          border-radius: var(--border-radius-md);
          background: var(--input-bg);
          flex-shrink: 0;
          animation: pulse 1.5s infinite ease-in-out;
        }

        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 0.8; }
          100% { opacity: 0.5; }
        }

        .empty-state {
          text-align: center;
          padding: 80px 0;
          color: var(--foreground-muted);
          font-size: 16px;
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
      `}</style>
    </div>
  );
}
