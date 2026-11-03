"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Star, Heart, Play, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { 
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  searchTMDB, 
  getImageUrl, 
  TMDBResult,
  getTrendingToday,
  getFranchiseCollections,
  POPULAR_FRANCHISE_COLLECTIONS
} from '@/utils/tmdb';
import { 
  getUserPreferences, 
  setUserPreferences,
  isOnboardingComplete, 
  LANGUAGE_OPTIONS, 
  UserPreferences 
} from '@/utils/userPreferences';
import { getAllProgress, removeProgress, WatchProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';
import MediaCarousel from '@/components/MediaCarousel';
import WatchHistoryCarousel from '@/components/WatchHistoryCarousel';
import MovieCard from '@/components/MovieCard';
// New explore components ported from the Expo app
import HeroSection from '@/components/explore/HeroSection';
import GenreFilter from '@/components/explore/GenreFilter';
import SpotlightCarousel from '@/components/explore/SpotlightCarousel';
import RankedTop10Carousel from '@/components/explore/RankedTop10Carousel';
import WorldCinemaHub from '@/components/explore/WorldCinemaHub';
import { GENRE_DATA } from '@/components/explore/ExploreConstants';

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
  const [trendingToday, setTrendingToday] = useState<TMDBResult[]>([]);
  const [franchiseCollections, setFranchiseCollections] = useState<any[]>(() => POPULAR_FRANCHISE_COLLECTIONS);
  const [becauseYouWatched, setBecauseYouWatched] = useState<{ sourceTitle: string; items: any[] }[]>([]);
  const [onboardingDone, setOnboardingDone] = useState(true);
  
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

      // Prioritize collections the user has started or watched
      try {
        const franchises = await getFranchiseCollections(history);
        if (franchises && franchises.length > 0) {
          setFranchiseCollections(franchises);
        }
      } catch (err) {
        console.warn('Franchise collections load fallback:', err);
      }

      // Fetch dynamic "Because you watched..." feeds
      if (history.length > 0) {
        const simData = await getSimilarForHistory(history);
        setBecauseYouWatched(simData);
      }
    } catch (e) {
      console.error("Failed to load user data:", e);
    }
  }, []);

  const handleSkipOnboarding = async () => {
    setOnboardingDone(true);
    try {
      await setUserPreferences({ onboardingComplete: true });
    } catch (e) {
      console.error("Failed to dismiss onboarding banner:", e);
    }
  };

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
        if (content.franchiseCollections?.length > 0) {
          setFranchiseCollections(content.franchiseCollections);
        }
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

    // Fast direct fetch for Trending Now hero endpoint
    let isMounted = true;
    getTrendingToday('all', 1)
      .then((items) => {
        if (isMounted && items && items.length > 0) {
          setTrendingToday(items);
        }
      })
      .catch((err) => console.warn('Trending today fetch warning:', err));

    return () => {
      isMounted = false;
    };
  }, [selectedGenre, loadUserData, fetchContent]);

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
  const toggleWatchlist = useCallback(async (item: TMDBResult, e: React.MouseEvent) => {
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
  }, []);

  const handleRemoveHistoryItem = useCallback(async (tmdbId: number) => {
    await removeProgress(tmdbId);
    setWatchHistory((prev) => prev.filter((item) => item.tmdbId !== tmdbId));
  }, []);

  const heroList = (selectedGenre === 0 && trendingToday.length > 0
    ? trendingToday
    : (rawContent?.heroMovies || rawContent?.trendingMovies || [])).slice(0, 10);

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
          <div className="welcome-actions">
            <button 
              type="button"
              className="btn-skip" 
              onClick={handleSkipOnboarding}
            >
              Not Now
            </button>
            <Link href="/onboarding" className="btn-primary" style={{ flexShrink: 0 }}>
              <span>Personalize Now</span>
              <ChevronRight size={16} />
            </Link>
          </div>
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
          {/* 1. Dynamic Hero Section (liquid indicator, swipe, autoplay) */}
          {heroList.length > 0 && (
            <HeroSection
              items={heroList}
              savedIds={savedIds}
              toggleWatchlist={toggleWatchlist}
              isLoading={contentLoading && heroList.length === 0}
            />
          )}

          {/* 2. Genre selector (magnetic centering chips) */}
          <div className="genres-wrapper animate-fade-in-up">
            <GenreFilter
              selectedGenre={selectedGenre}
              onSelectGenre={setSelectedGenre}
            />
            {contentLoading && rawContent && (
              <div className="genre-loading-bar">
                <div className="genre-loading-progress" />
              </div>
            )}
          </div>

          {/* 3. Ranked Top 10 Today (mirrors Android hierarchy: Hero -> Genre -> Top 10) */}
          {rawContent?.trendingMovies?.length > 0 && (
            <RankedTop10Carousel
              data={rawContent.trendingMovies}
              savedIds={savedIds}
              toggleWatchlist={toggleWatchlist}
            />
          )}

          {/* 4. Franchise Spotlight — Sagas & Collections ONLY */}
          {franchiseCollections.length > 0 && (
            <SpotlightCarousel
              title="Franchise Spotlight"
              eyebrow="COLLECTION SPOTLIGHT"
              data={franchiseCollections}
            />
          )}

          {/* 5. Continue Watching Section (only when user has history) */}
          <WatchHistoryCarousel 
            history={watchHistory} 
            onRemove={handleRemoveHistoryItem} 
          />

          {/* 6. Trending Series (matching Android midSections) */}
          {rawContent?.trendingTV?.length > 0 && (
            <MediaCarousel 
              title={selectedGenre !== 0 ? `Top ${GENRE_DATA.find(g => g.id === selectedGenre)?.name || ''} Series` : 'Trending Series'}
              type="trendingTV"
              data={rawContent.trendingTV}
              savedIds={savedIds}
              toggleWatchlist={toggleWatchlist}
            />
          )}

          {/* 7. World Cinema Hub (Collapses all international rails into one hub, exactly like Android) */}
          {rawContent?.langData && Object.keys(rawContent.langData).length > 0 && (
            <WorldCinemaHub
              langData={rawContent.langData}
              savedIds={savedIds}
              toggleWatchlist={toggleWatchlist}
            />
          )}

          {/* 8. Single Featured Actor Spotlight (matching Android midSections) */}
          {selectedGenre === 0 && rawContent?.actorData?.length > 0 && (
            (() => {
              const act = rawContent.actorData.find((a: any) => a.items && a.items.length > 0) || rawContent.actorData[0];
              return (
                <MediaCarousel 
                  key={`actor-${act.actorId}`}
                  title={`Spotlight: ${act.actorName}`}
                  type={`actor-${act.actorId}`}
                  data={act.items}
                  savedIds={savedIds}
                  toggleWatchlist={toggleWatchlist}
                />
              );
            })()
          )}

          {/* 9. Personalized "Because You Watched..." dynamic history recommendations */}
          {becauseYouWatched.length > 0 && becauseYouWatched.map((sec, idx) => (
            <MediaCarousel 
              key={`byw-${idx}`}
              title={`More Like ${sec.sourceTitle}`}
              type={`similar/${sec.items[0]?.media_type || 'movie'}/${sec.items[0]?.id}`}
              data={sec.items}
              savedIds={savedIds}
              toggleWatchlist={toggleWatchlist}
            />
          ))}

          {/* 10. Tailored Genre Carousels */}
          {rawContent?.genreData?.length > 0 && rawContent.genreData.map((gen: any) => {
            const genreName = GENRE_DATA.find(g => g.id === gen.genreId)?.name;
            const title = genreName && genreName !== 'All' ? `${genreName} Movies` : 'Curated for You';
            return (
              <MediaCarousel 
                key={`genre-${gen.genreId}`}
                title={title}
                type={`genre/${gen.genreId}`}
                data={gen.items}
                savedIds={savedIds}
                toggleWatchlist={toggleWatchlist}
              />
            );
          })}

          {/* 11. Global Discovery Categories */}
          {rawContent && (
            <div className="carousels-container">
              <MediaCarousel title="Trending Movies" type="trendingMovies" data={rawContent.trendingMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              {rawContent.topRated?.length > 0 && (
                <MediaCarousel title="All-Time Masterpieces" type="topRated" data={rawContent.topRated} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              )}
              {rawContent.upcoming?.length > 0 && (
                <MediaCarousel title="Coming Soon to Theaters" type="upcoming" data={rawContent.upcoming} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              )}
              {rawContent.hiddenGems?.length > 0 && (
                <MediaCarousel title="Hidden Gems" type="hiddenGems" data={rawContent.hiddenGems} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              )}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .explore-container {
          position: relative;
          z-index: 1;
          isolation: isolate;
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
          contain: strict;
          transform: translateZ(0);
        }

        .atmos-blob {
          position: absolute;
          width: 60vw;
          height: 60vw;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.08;
          will-change: transform;
          transform: translateZ(0);
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
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
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

        .welcome-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .btn-skip {
          background: var(--input-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground-muted);
          padding: 10px 18px;
          border-radius: var(--border-radius-sm);
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          height: 42px;
          box-sizing: border-box;
        }

        .btn-skip:hover {
          background: var(--sidebar-hover);
          color: var(--foreground);
          border-color: var(--card-hover-border);
          transform: translateY(-1px);
        }

        .btn-skip:active {
          transform: translateY(0);
        }

        /* Genre Chip Row (ported from Expo app) */
        .genres-wrapper {
          position: relative;
          margin-bottom: 24px;
          width: 100%;
        }

        .genre-filter-container {
          margin: 0;
          padding: 0;
        }

        .genres-container {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          scroll-behavior: smooth;
          padding: 6px 44px 10px 44px;
          margin: 0;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          contain: layout;
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
          opacity: 0.9;
          box-shadow: 0 4px 12px var(--shadow-color);
          transition: var(--transition-fast);
          z-index: 5;
          border: none;
        }

        .genre-nav-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: #ffffff;
          opacity: 1;
          transform: translateY(-50%) scale(1.08);
        }

        .genre-nav-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .genre-nav-btn.prev-btn { left: 4px; }
        .genre-nav-btn.next-btn { right: 4px; }

        @media (max-width: 768px) {
          .genres-container {
            padding: 4px 6px 10px 6px !important;
            gap: 8px;
          }
          .genre-nav-btn {
            display: none !important;
          }
        }

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

        /* ===== Tablet ===== */
        @media (max-width: 1024px) {
          .hero-section {
            height: 360px;
            padding: 30px;
            margin-bottom: 28px;
          }
        }

        /* ===== Phone ===== */
        @media (max-width: 640px) {
          .explore-header-row {
            gap: 10px;
            margin-bottom: 16px;
          }

          .search-input-field {
            height: 42px;
            font-size: 13px;
            padding: 0 14px 0 42px !important;
            border-radius: 12px;
          }

          .search-icon-wrapper {
            left: 14px;
          }

          .genres-wrapper {
            margin: 0 0 18px 0;
            width: 100%;
          }

          .genres-container {
            padding: 4px 0 8px 0 !important;
            gap: 8px;
          }

          .genre-chip {
            padding: 6px 12px;
            font-size: 12px;
            border-radius: 16px;
          }

          .genre-nav-btn {
            display: none !important;
          }

          .onboarding-welcome-card {
            flex-direction: column;
            align-items: flex-start;
            padding: 16px;
            gap: 12px;
          }

          .welcome-actions {
            width: 100%;
            justify-content: flex-end;
            gap: 8px;
          }

          .welcome-actions .btn-skip {
            height: 38px;
            padding: 8px 14px;
            font-size: 12.5px;
          }

          .welcome-actions .btn-primary {
            height: 38px;
            padding: 8px 16px;
            font-size: 12.5px;
          }

          .welcome-left h3 {
            font-size: 14px;
          }

          .welcome-left p {
            font-size: 12px;
          }

          .skeleton-hero {
            height: 220px;
            border-radius: 16px;
          }

          .skeleton-card {
            width: 130px;
            height: 195px;
          }
        }
      `}</style>
    </div>
  );
}
