"use client";

// src/app/page.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Search, Sparkles, ChevronRight, X, RefreshCw } from 'lucide-react';
import {
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  searchTMDB,
  TMDBResult,
  getTrendingToday,
  getFranchiseCollections,
  POPULAR_FRANCHISE_COLLECTIONS,
} from '@/utils/tmdb';
import { getUserPreferences, setUserPreferences, isOnboardingComplete } from '@/utils/userPreferences';
import { getAllProgress, removeProgress, WatchProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';
import MediaCarousel from '@/components/MediaCarousel';
import WatchHistoryCarousel from '@/components/WatchHistoryCarousel';
import MovieCard from '@/components/MovieCard';
import HeroSection from '@/components/explore/HeroSection';
import GenreFilter from '@/components/explore/GenreFilter';
import SpotlightCarousel from '@/components/explore/SpotlightCarousel';
import RankedTop10Carousel from '@/components/explore/RankedTop10Carousel';
import WorldCinemaHub from '@/components/explore/WorldCinemaHub';
import { GENRE_DATA } from '@/components/explore/ExploreConstants';

const greetingFor = (hour: number) => {
  if (hour < 5) return 'Late night picks';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Late night picks';
};

export default function ExplorePage() {
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState(false);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  const [greeting, setGreeting] = useState('Welcome back');

  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [watchHistory, setWatchHistory] = useState<WatchProgress[]>([]);
  const [rawContent, setRawContent] = useState<any>(null);
  const [trendingToday, setTrendingToday] = useState<TMDBResult[]>([]);
  const [franchiseCollections, setFranchiseCollections] = useState<any[]>(() => POPULAR_FRANCHISE_COLLECTIONS);
  const [becauseYouWatched, setBecauseYouWatched] = useState<{ sourceTitle: string; items: any[] }[]>([]);
  const [onboardingDone, setOnboardingDone] = useState(true);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRequestRef = useRef(0);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  // "/" focuses search (like most media apps)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Light user data: watchlist ids, history, onboarding flag
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
    } catch (e) {
      console.error('Failed to load user data:', e);
    }
  }, []);

  useEffect(() => {
    loadUserData();
    const refresh = () => { void loadUserData(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('watcher_cloud_synced', refresh);
    window.addEventListener('watcher_local_library_changed', refresh);
    window.addEventListener('watcher_watch_progress_changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('watcher_cloud_synced', refresh);
      window.removeEventListener('watcher_local_library_changed', refresh);
      window.removeEventListener('watcher_watch_progress_changed', refresh);
    };
  }, [loadUserData]);

  // History-driven rails only re-run when the set of watched titles changes
  const historyKey = useMemo(() => watchHistory.slice(0, 12).map((h) => h.tmdbId).join(','), [watchHistory]);

  useEffect(() => {
    if (watchHistory.length === 0) {
      setBecauseYouWatched([]);
      return;
    }
    let cancelled = false;
    getSimilarForHistory(watchHistory)
      .then((d) => { if (!cancelled) setBecauseYouWatched(d); })
      .catch(() => {});
    getFranchiseCollections(watchHistory)
      .then((f) => { if (!cancelled && f && f.length > 0) setFranchiseCollections(f); })
      .catch((err) => console.warn('Franchise collections fallback:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  // Trending hero feed (once)
  useEffect(() => {
    let mounted = true;
    getTrendingToday('all', 1)
      .then((items) => { if (mounted && items?.length) setTrendingToday(items); })
      .catch((err) => console.warn('Trending today fetch warning:', err));
    return () => { mounted = false; };
  }, []);

  // Personalised content, refetched per genre; stale responses are ignored
  const fetchContent = useCallback(async (genreId: number = 0, forceRefresh: boolean = false) => {
    const requestId = ++contentRequestRef.current;
    setContentLoading(true);
    setContentError(false);
    try {
      const prefs = await getUserPreferences();
      const content = await fetchPersonalisedDiscoveryContent(
        prefs.languages,
        prefs.genreIds,
        genreId,
        forceRefresh,
        prefs.favoriteActors
      );
      if (requestId !== contentRequestRef.current) return;
      if (content) {
        setRawContent(content);
        if (content.franchiseCollections?.length > 0) setFranchiseCollections(content.franchiseCollections);
      } else {
        setContentError(true);
      }
    } catch (err) {
      console.error('Failed to load explore content:', err);
      if (requestId === contentRequestRef.current) setContentError(true);
    } finally {
      if (requestId === contentRequestRef.current) setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent(selectedGenre);
  }, [selectedGenre, fetchContent]);

  // Debounced search with stale-result protection
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchTMDB(q);
        if (!cancelled) setSearchResults(results.filter((item) => item.poster_path));
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // NOTE: some child components (WorldCinemaHub) call this without an event, so `e` is optional.
  const toggleWatchlist = useCallback(async (item: TMDBResult, e?: React.MouseEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      let list = stored ? JSON.parse(stored) : [];
      const exists = list.some((i: any) => i.id === item.id);
      if (exists) {
        list = list.filter((i: any) => i.id !== item.id);
        setSavedIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
      } else {
        list.push(item);
        setSavedIds((prev) => new Set(prev).add(item.id));
      }
      await AsyncStorage.setItem('watchlist', JSON.stringify(list));
    } catch (err) {
      console.error('Failed to update watchlist:', err);
    }
  }, []);

  const handleRemoveHistoryItem = useCallback(async (tmdbId: number) => {
    await removeProgress(tmdbId);
    setWatchHistory((prev) => prev.filter((item) => item.tmdbId !== tmdbId));
  }, []);

  const handleSkipOnboarding = async () => {
    setOnboardingDone(true);
    try {
      await setUserPreferences({ onboardingComplete: true });
    } catch (e) {
      console.error('Failed to dismiss onboarding banner:', e);
    }
  };

  const heroList = (
    selectedGenre === 0 && trendingToday.length > 0
      ? trendingToday
      : rawContent?.heroMovies || rawContent?.trendingMovies || []
  ).slice(0, 10);

  const isSearching = query.trim() !== '';
  const genreName = GENRE_DATA.find((g) => g.id === selectedGenre)?.name || '';

  const featuredActor =
    selectedGenre === 0 && rawContent?.actorData?.length > 0
      ? rawContent.actorData.find((a: any) => a.items && a.items.length > 0) || rawContent.actorData[0]
      : null;

  return (
    <div className="explore-container">
      <div className="atmos-container" aria-hidden="true">
        <div className="atmos-blob blob-a" />
        <div className="atmos-blob blob-b" />
      </div>

      {/* Header: greeting + search */}
      <header className="explore-header">
        <div className="explore-greeting">
          <p className="greeting-eyebrow">{greeting}</p>
          <h1 className="greeting-title">What are we watching?</h1>
        </div>

        <div className="search-bar-container">
          <span className="search-icon-wrapper"><Search size={18} /></span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search movies, shows, actors, directors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            className="explore-search-input"
            aria-label="Search"
          />
          {query ? (
            <button type="button" className="search-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={16} />
            </button>
          ) : (
            <kbd className="search-kbd" aria-hidden="true">/</kbd>
          )}
        </div>
      </header>

      {/* Onboarding banner */}
      {!onboardingDone && !isSearching && (
        <div className="onboarding-card animate-fade-in-up">
          <div className="onboarding-left">
            <div className="onboarding-icon"><Sparkles size={22} /></div>
            <div>
              <h3>Make this feed yours</h3>
              <p>Pick your languages, favorite genres and stars (Hollywood, Bollywood, Mollywood, Anime and more) to tailor everything below.</p>
            </div>
          </div>
          <div className="onboarding-actions">
            <button type="button" className="btn-skip" onClick={handleSkipOnboarding}>Not now</button>
            <Link href="/onboarding" className="btn-primary" style={{ flexShrink: 0 }}>
              <span>Personalize</span>
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {isSearching ? (
        /* ───────── Search mode ───────── */
        <section className="search-results-section animate-fade-in-up">
          <div className="section-head">
            <h2 className="section-heading">
              {searchLoading ? 'Searching…' : `Results for “${query.trim()}”`}
            </h2>
            {!searchLoading && searchResults.length > 0 && (
              <span className="section-count">{searchResults.length} found</span>
            )}
          </div>

          {searchLoading ? (
            <div className="media-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="skeleton-block skeleton-poster" />
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="media-grid">
              {searchResults.map((item) => (
                <MovieCard
                  key={`${item.media_type || 'm'}-${item.id}`}
                  item={item}
                  isAdded={savedIds.has(item.id)}
                  toggleWatchlist={toggleWatchlist}
                  showTitle={true}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={30} />
              <p>No results for “{query.trim()}”.</p>
              <span>Check the spelling or try a different title.</span>
            </div>
          )}
        </section>
      ) : !rawContent && contentLoading ? (
        /* ───────── Skeleton ───────── */
        <div className="explore-skeleton-container animate-fade-in-up" aria-busy="true">
          <div className="skeleton-block skeleton-hero" />
          <div className="skeleton-genres-row">
            {Array.from({ length: 7 }).map((_, n) => (
              <div key={n} className="skeleton-block skeleton-chip" />
            ))}
          </div>
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton-carousel-block">
              <div className="skeleton-block skeleton-title" />
              <div className="skeleton-cards-row">
                {Array.from({ length: 7 }).map((_, m) => (
                  <div key={m} className="skeleton-block skeleton-card" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !rawContent && contentError ? (
        /* ───────── Error ───────── */
        <div className="empty-state">
          <RefreshCw size={30} />
          <p>Couldn’t load your feed.</p>
          <span>Check your connection and try again.</span>
          <button type="button" className="btn-primary" style={{ marginTop: 14 }} onClick={() => fetchContent(selectedGenre, true)}>
            <RefreshCw size={15} />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        /* ───────── Dashboard ───────── */
        <div className="dashboard">
          {heroList.length > 0 && (
            <HeroSection items={heroList} savedIds={savedIds} toggleWatchlist={toggleWatchlist} isLoading={false} />
          )}

          <div className="genres-wrapper">
            <GenreFilter selectedGenre={selectedGenre} onSelectGenre={setSelectedGenre} />
            {contentLoading && rawContent && (
              <div className="genre-loading-bar"><div className="genre-loading-progress" /></div>
            )}
          </div>

          <div className={`rails ${contentLoading && rawContent ? 'is-refreshing' : ''}`}>
            {rawContent?.trendingMovies?.length > 0 && (
              <RankedTop10Carousel data={rawContent.trendingMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            )}

            {franchiseCollections.length > 0 && (
              <SpotlightCarousel title="Franchise Spotlight" eyebrow="COLLECTION SPOTLIGHT" data={franchiseCollections} />
            )}

            <WatchHistoryCarousel history={watchHistory} onRemove={handleRemoveHistoryItem} />

            {rawContent?.trendingTV?.length > 0 && (
              <MediaCarousel
                title={selectedGenre !== 0 ? `Top ${genreName} Series` : 'Trending Series'}
                type="trendingTV"
                data={rawContent.trendingTV}
                savedIds={savedIds}
                toggleWatchlist={toggleWatchlist}
              />
            )}

            {rawContent?.langData && Object.keys(rawContent.langData).length > 0 && (
              <WorldCinemaHub langData={rawContent.langData} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            )}

            {featuredActor && (
              <MediaCarousel
                key={`actor-${featuredActor.actorId}`}
                title={`Spotlight: ${featuredActor.actorName}`}
                type={`actor-${featuredActor.actorId}`}
                data={featuredActor.items}
                savedIds={savedIds}
                toggleWatchlist={toggleWatchlist}
              />
            )}

            {becauseYouWatched.map((sec, idx) => (
              <MediaCarousel
                key={`byw-${idx}`}
                title={`More like ${sec.sourceTitle}`}
                type={`similar/${sec.items[0]?.media_type || 'movie'}/${sec.items[0]?.id}`}
                data={sec.items}
                savedIds={savedIds}
                toggleWatchlist={toggleWatchlist}
              />
            ))}

            {rawContent?.genreData?.length > 0 &&
              rawContent.genreData.map((gen: any) => {
                const name = GENRE_DATA.find((g) => g.id === gen.genreId)?.name;
                const title = name && name !== 'All' ? `${name} Movies` : 'Curated for You';
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

            {rawContent?.topRated?.length > 0 && (
              <MediaCarousel title="All-Time Masterpieces" type="topRated" data={rawContent.topRated} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            )}
            {rawContent?.upcoming?.length > 0 && (
              <MediaCarousel title="Coming Soon to Theaters" type="upcoming" data={rawContent.upcoming} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            )}
            {rawContent?.hiddenGems?.length > 0 && (
              <MediaCarousel title="Hidden Gems" type="hiddenGems" data={rawContent.hiddenGems} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .explore-container {
          position: relative;
          z-index: 1;
          isolation: isolate;
          --skel-a: color-mix(in srgb, var(--foreground) 5%, transparent);
          --skel-b: color-mix(in srgb, var(--foreground) 11%, transparent);
        }

        /* Atmosphere (theme aware) */
        .atmos-container {
          position: fixed;
          inset: 0;
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
          filter: blur(90px);
          opacity: 0.09;
          will-change: transform;
          transform: translateZ(0);
        }
        :global([data-theme='light']) .atmos-blob { opacity: 0.07; }
        .blob-a {
          background: radial-gradient(circle, var(--primary) 0%, transparent 70%);
          top: -12vw;
          left: 8vw;
          animation: explore-drift-a 60s linear infinite;
        }
        .blob-b {
          background: radial-gradient(circle, #5b1bf5 0%, transparent 70%);
          bottom: -12vw;
          right: 8vw;
          animation: explore-drift-b 75s linear infinite;
        }
        @keyframes explore-drift-a {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(50px, -30px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }
        @keyframes explore-drift-b {
          0% { transform: translate(0, 0) rotate(360deg); }
          50% { transform: translate(-40px, 40px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }

        /* Header */
        .explore-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 26px;
          flex-wrap: wrap;
        }
        .explore-greeting { min-width: 0; }
        .greeting-eyebrow {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--primary);
          margin-bottom: 4px;
        }
        .greeting-title {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.6px;
          line-height: 1.15;
          color: var(--foreground);
        }

        .search-bar-container {
          position: relative;
          flex: 1 1 380px;
          max-width: 560px;
          display: flex;
          align-items: center;
        }
        .search-icon-wrapper {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--foreground-muted);
          pointer-events: none;
          display: flex;
          transition: color 0.2s ease;
        }
        .search-bar-container:focus-within .search-icon-wrapper { color: var(--primary); }
        .explore-search-input {
          width: 100%;
          height: 50px;
          padding: 0 48px 0 46px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          color: var(--foreground);
          font-size: 14.5px;
          font-weight: 500;
          outline: none;
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          box-shadow: 0 4px 18px var(--shadow-color);
          transition: var(--transition-smooth);
        }
        .explore-search-input::placeholder { color: var(--foreground-muted); }
        .explore-search-input:focus {
          border-color: var(--primary);
          background: var(--input-focus-bg);
          box-shadow: 0 0 0 4px var(--primary-glow);
        }
        .search-clear-btn {
          position: absolute;
          right: 10px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: none;
          background: var(--sidebar-hover);
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .search-clear-btn:hover { background: var(--primary); color: #fff; }
        .search-kbd {
          position: absolute;
          right: 14px;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          border: 1px solid var(--card-border);
          background: var(--badge-bg);
          color: var(--foreground-muted);
          font-size: 12px;
          font-weight: 600;
          pointer-events: none;
        }

        /* Onboarding */
        .onboarding-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 18px 22px;
          margin-bottom: 26px;
          border-radius: var(--border-radius-md);
          background: color-mix(in srgb, var(--primary) 8%, var(--card-bg));
          border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--card-border));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 8px 28px var(--shadow-color);
        }
        .onboarding-left { display: flex; align-items: center; gap: 16px; min-width: 0; }
        .onboarding-icon {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          background: color-mix(in srgb, var(--primary) 16%, transparent);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .onboarding-left h3 { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .onboarding-left p { font-size: 13px; color: var(--foreground-muted); margin-top: 2px; line-height: 1.45; }
        .onboarding-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .btn-skip {
          background: var(--input-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground-muted);
          padding: 0 18px;
          height: 42px;
          border-radius: 12px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
          white-space: nowrap;
        }
        .btn-skip:hover { background: var(--sidebar-hover); color: var(--foreground); border-color: var(--card-hover-border); }

        /* Section heading (search + misc) */
        .section-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
        .section-heading { font-size: 20px; font-weight: 700; letter-spacing: -0.2px; color: var(--foreground); }
        .section-count { font-size: 13px; font-weight: 600; color: var(--foreground-muted); }

        /* Dashboard */
        .dashboard { display: flex; flex-direction: column; }
        .genres-wrapper { position: relative; margin-bottom: 26px; width: 100%; }
        .genre-loading-bar {
          position: absolute;
          bottom: 0;
          left: 44px;
          right: 44px;
          height: 2px;
          border-radius: 1px;
          background: var(--skel-a);
          overflow: hidden;
        }
        .genre-loading-progress {
          width: 40%;
          height: 100%;
          background: var(--primary);
          border-radius: 1px;
          animation: explore-load 1s infinite ease-in-out;
        }
        @keyframes explore-load {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        .rails { transition: opacity 0.25s ease; }
        .rails.is-refreshing { opacity: 0.55; pointer-events: none; }

        /* Skeletons */
        .explore-skeleton-container { display: flex; flex-direction: column; gap: 26px; padding: 4px 0 50px; }
        .skeleton-block {
          background: linear-gradient(90deg, var(--skel-a) 25%, var(--skel-b) 50%, var(--skel-a) 75%);
          background-size: 200% 100%;
          animation: explore-shimmer 1.6s infinite;
        }
        .skeleton-hero { width: 100%; height: 480px; border-radius: 24px; }
        .skeleton-genres-row { display: flex; gap: 12px; overflow: hidden; }
        .skeleton-chip { width: 110px; height: 40px; border-radius: 22px; flex-shrink: 0; }
        .skeleton-carousel-block { display: flex; flex-direction: column; gap: 14px; }
        .skeleton-title { width: 220px; height: 22px; border-radius: 6px; }
        .skeleton-cards-row { display: flex; gap: 16px; overflow: hidden; }
        .skeleton-card { width: 170px; height: 255px; border-radius: 16px; flex-shrink: 0; }
        .skeleton-poster { aspect-ratio: 2 / 3; border-radius: 16px; }
        @keyframes explore-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Empty / error */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          text-align: center;
          padding: 80px 20px;
          color: var(--foreground-muted);
        }
        .empty-state p { font-size: 17px; font-weight: 600; color: var(--foreground); margin-top: 8px; }
        .empty-state span { font-size: 13.5px; }

        /* Tablet */
        @media (max-width: 1024px) {
          .skeleton-hero { height: 400px; }
        }

        /* Phone */
        @media (max-width: 768px) {
          .explore-header { gap: 14px; margin-bottom: 18px; align-items: stretch; }
          .greeting-title { font-size: 24px; }
          .search-bar-container { flex: 1 1 100%; max-width: none; }
          .search-kbd { display: none; }
          .explore-search-input { height: 46px; font-size: 14px; border-radius: 14px; }
          .skeleton-hero { height: 300px; border-radius: 18px; }
          .skeleton-card { width: 135px; height: 202px; }
          .onboarding-card { flex-direction: column; align-items: flex-start; padding: 16px; gap: 14px; }
          .onboarding-actions { width: 100%; justify-content: flex-end; }
          .btn-skip { height: 38px; padding: 0 14px; font-size: 12.5px; }
          .genre-loading-bar { left: 6px; right: 6px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .atmos-blob, .skeleton-block, .genre-loading-progress { animation: none; }
        }
      `}</style>
    </div>
  );
}