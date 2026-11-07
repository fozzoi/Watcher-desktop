"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Film, RotateCw, Search, Sparkles, X } from "lucide-react";
import {
  ExploreCatalogRow,
  ExploreContinueWatching,
  ExploreGenrePicker,
  ExploreHero,
  ExploreSearchGrid,
  ExploreSkeleton,
  type ExploreRowData,
} from "@/components/explore/ExploreComponents";
import { GENRE_DATA } from "@/components/explore/ExploreConstants";
import { getAllProgress, removeProgress, type WatchProgress } from "@/utils/progress";
import {
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  getTrendingToday,
  searchTMDB,
  type TMDBResult,
} from "@/utils/tmdb";
import { getUserPreferences, isOnboardingComplete, setUserPreferences } from "@/utils/userPreferences";
import { AsyncStorage } from "@/utils/storage";

type Feed = {
  heroMovies?: TMDBResult[];
  trendingMovies?: TMDBResult[];
  trendingTV?: TMDBResult[];
  topRated?: TMDBResult[];
  upcoming?: TMDBResult[];
  hiddenGems?: TMDBResult[];
  langData?: Record<string, { movies?: TMDBResult[]; tv?: TMDBResult[] }>;
  actorData?: { actorId: number; actorName: string; items: TMDBResult[] }[];
  genreData?: { genreId: number; items: TMDBResult[] }[];
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", ml: "Malayalam",
  kn: "Kannada", bn: "Bengali", mr: "Marathi", ko: "Korean", ja: "Japanese",
  zh: "Chinese", fr: "French", es: "Spanish", de: "German", pt: "Portuguese",
  it: "Italian", tr: "Turkish", ar: "Arabic", th: "Thai",
};

export default function ExplorePage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [today, setToday] = useState<TMDBResult[]>([]);
  const [genreId, setGenreId] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<number>>(() => new Set());
  const [history, setHistory] = useState<WatchProgress[]>([]);
  const [similarRows, setSimilarRows] = useState<{ sourceTitle: string; items: TMDBResult[] }[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [hour, setHour] = useState(12);
  const searchInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const refreshLibrary = useCallback(async () => {
    try {
      const [watchlist, artists, progress, onboarded] = await Promise.all([
        AsyncStorage.getItem("watchlist"),
        AsyncStorage.getItem("favoriteArtists"),
        getAllProgress(),
        isOnboardingComplete(),
      ]);
      const titles: { id: number }[] = watchlist ? JSON.parse(watchlist) : [];
      const people: { id: number }[] = artists ? JSON.parse(artists) : [];
      setSavedIds(new Set([...titles, ...people].map(({ id }) => id)));
      setHistory(progress);
      setOnboardingComplete(onboarded);
    } catch (cause) {
      console.error("Could not load your library", cause);
    }
  }, []);

  const loadFeed = useCallback(async (nextGenre = 0, forceRefresh = false) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const preferences = await getUserPreferences();
      const result = await fetchPersonalisedDiscoveryContent(
        preferences.languages,
        preferences.genreIds,
        nextGenre,
        forceRefresh,
        preferences.favoriteActors,
      );
      if (currentRequest !== requestId.current) return;
      if (!result) throw new Error("No recommendations were returned");
      setFeed(result);
    } catch (cause) {
      console.error("Could not load Explore", cause);
      if (currentRequest === requestId.current) setError(true);
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const hourTimer = window.setTimeout(() => setHour(new Date().getHours()), 0);
    const firstLoad = window.setTimeout(() => {
      void refreshLibrary();
      void loadFeed();
    }, 0);
    void getTrendingToday("all", 1).then(setToday).catch(() => {});

    const syncLibrary = () => void refreshLibrary();
    const libraryEvents = ["focus", "pageshow", "watcher_cloud_synced", "watcher_local_library_changed", "watcher_watch_progress_changed"];
    libraryEvents.forEach((name) => window.addEventListener(name, syncLibrary));

    const keyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", keyboardShortcut);

    return () => {
      window.clearTimeout(hourTimer);
      window.clearTimeout(firstLoad);
      libraryEvents.forEach((name) => window.removeEventListener(name, syncLibrary));
      window.removeEventListener("keydown", keyboardShortcut);
    };
  }, [loadFeed, refreshLibrary]);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchTMDB(term);
        if (!cancelled) setSearchResults(results.filter((item) => item.poster_path));
      } catch (cause) {
        console.error("Search failed", cause);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!history.length) {
      const timer = window.setTimeout(() => setSimilarRows([]), 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    void getSimilarForHistory(history.slice(0, 8))
      .then((results) => { if (!cancelled) setSimilarRows(results); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [history]);

  const toggleWatchlist = useCallback(async (item: TMDBResult) => {
    try {
      const stored = await AsyncStorage.getItem("watchlist");
      const current: TMDBResult[] = stored ? JSON.parse(stored) : [];
      const alreadySaved = current.some((saved) => saved.id === item.id);
      const next = alreadySaved ? current.filter((saved) => saved.id !== item.id) : [...current, item];
      await AsyncStorage.setItem("watchlist", JSON.stringify(next));
      setSavedIds((ids) => {
        const updated = new Set(ids);
        if (alreadySaved) updated.delete(item.id);
        else updated.add(item.id);
        return updated;
      });
    } catch (cause) {
      console.error("Could not update your watchlist", cause);
    }
  }, []);

  const selectGenre = (nextGenre: number) => {
    setGenreId(nextGenre);
    void loadFeed(nextGenre);
  };

  const dismissPersonalization = async () => {
    setOnboardingComplete(true);
    try {
      await setUserPreferences({ onboardingComplete: true });
    } catch (cause) {
      console.error("Could not save preferences", cause);
    }
  };

  const removeFromHistory = async (id: number) => {
    await removeProgress(id);
    setHistory((entries) => entries.filter((entry) => entry.tmdbId !== id));
  };

  const featured = useMemo(() => {
    const candidates = genreId === 0 && today.length ? today : feed?.heroMovies || feed?.trendingMovies || [];
    return candidates.find((item) => item.backdrop_path || item.poster_path) || null;
  }, [feed, genreId, today]);

  const rows = useMemo<ExploreRowData[]>(() => {
    if (!feed) return [];
    const selectedGenre = GENRE_DATA.find((genre) => genre.id === genreId)?.name;
    const result: ExploreRowData[] = [];
    const add = (title: string, type: string, items?: TMDBResult[], note?: string) => {
      if (items?.length) result.push({ title, type, items, note });
    };

    add(selectedGenre && selectedGenre !== "All" ? `${selectedGenre} films to start with` : "Popular with everyone", "trendingMovies", feed.trendingMovies, "MOVIES");
    add(selectedGenre && selectedGenre !== "All" ? `${selectedGenre} series` : "Series people are watching", "trendingTV", feed.trendingTV, "SERIES");
    Object.entries(feed.langData || {}).forEach(([code, collection]) => {
      const language = LANGUAGE_NAMES[code] || code.toUpperCase();
      add(`${language} films`, `lang-movies-${code}`, collection.movies, "FROM YOUR LANGUAGES");
      add(`${language} series`, `lang-tv-${code}`, collection.tv, "FROM YOUR LANGUAGES");
    });
    (feed.actorData || []).forEach((actor) => add(`With ${actor.actorName}`, `actor-${actor.actorId}`, actor.items, "A FAVORITE OF YOURS"));
    (feed.genreData || []).forEach((genre) => {
      const name = GENRE_DATA.find((item) => item.id === genre.genreId)?.name || "Picked for you";
      add(`${name}, picked for you`, `genre/${genre.genreId}`, genre.items, "YOUR TASTE");
    });
    add("The all-time greats", "topRated", feed.topRated, "HIGHLY RATED");
    add("Coming soon", "upcoming", feed.upcoming, "UP NEXT");
    add("Worth discovering", "hiddenGems", feed.hiddenGems, "UNDER THE RADAR");
    similarRows.forEach((section) => {
      const firstItem = section.items[0];
      if (firstItem) {
        const type = firstItem.media_type || (firstItem.first_air_date && !firstItem.release_date ? "tv" : "movie");
        add(`Because you watched ${section.sourceTitle}`, `similar/${type}/${firstItem.id}`, section.items, "MORE LIKE THIS");
      }
    });
    return result;
  }, [feed, genreId, similarRows]);

  const greeting = hour < 5 || hour >= 22 ? "Up for a good story?" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const searchingFor = query.trim().length > 0;

  return (
    <div className="min-h-screen px-4 pb-24 pt-6 sm:px-7 sm:pt-9 xl:px-10">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]"><span className="size-1.5 rounded-full bg-[var(--primary)]" />{greeting}</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-4xl">Find your next favorite.</h1>
            <p className="mt-2 text-sm text-[var(--foreground-muted)] sm:text-base">A fresh place to discover what to watch next.</p>
          </div>
          <div className="relative w-full md:max-w-md">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]" />
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                setSearching(Boolean(next.trim()));
                if (!next.trim()) setSearchResults([]);
              }}
              onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
              type="search"
              aria-label="Search movies and series"
              placeholder="Search movies and series…"
              className="h-12 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] pl-11 pr-12 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-glow)]"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--foreground-muted)] hover:bg-[var(--sidebar-hover)]"><X size={16} /></button>
            ) : (
              <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-[var(--card-border)] px-2 py-0.5 text-xs text-[var(--foreground-muted)] sm:block">/</kbd>
            )}
          </div>
        </header>

        {!onboardingComplete && !searchingFor && (
          <aside className="mb-7 flex flex-col gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3"><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-glow)] text-[var(--primary)]"><Sparkles size={19} /></span><div><h2 className="font-bold text-[var(--foreground)]">Make Explore yours</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">Choose your favorite genres, languages, and stars to personalize these picks.</p></div></div>
            <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={dismissPersonalization} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--foreground-muted)] hover:text-[var(--foreground)]">Later</button><Link href="/onboarding" className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm">Set preferences <ArrowRight size={15} /></Link></div>
          </aside>
        )}

        {searchingFor ? (
          <ExploreSearchGrid query={query} results={searchResults} loading={searching} savedIds={savedIds} onToggle={toggleWatchlist} />
        ) : (
          <>
            {featured && <ExploreHero item={featured} saved={savedIds.has(featured.id)} onToggle={toggleWatchlist} />}

            <section className="mb-7">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">BROWSE BY MOOD</p><h2 className="mt-1 text-lg font-bold text-[var(--foreground)]">Pick a genre</h2></div>
                <button type="button" onClick={() => { setRefreshing(true); void loadFeed(genreId, true); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--foreground-muted)] transition hover:text-[var(--foreground)] disabled:opacity-50"><RotateCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh picks</button>
              </div>
              <ExploreGenrePicker selectedGenre={genreId} onSelect={selectGenre} />
            </section>

            {loading && !feed ? (
              <ExploreSkeleton />
            ) : error && !feed ? (
              <section className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] px-6 text-center">
                <Film size={30} className="mb-3 text-[var(--foreground-muted)]" />
                <h2 className="font-bold text-[var(--foreground)]">Explore could not load</h2>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">Check your connection and try again.</p>
                <button type="button" onClick={() => { setRefreshing(true); void loadFeed(genreId, true); }} className="btn-primary mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"><RotateCw size={15} /> Try again</button>
              </section>
            ) : (
              <div className={loading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
                <ExploreContinueWatching history={history} onRemove={(id) => void removeFromHistory(id)} />
                {rows.map((row) => <ExploreCatalogRow key={`${row.type}-${row.title}`} row={row} savedIds={savedIds} onToggle={toggleWatchlist} />)}
                {!rows.length && !loading && <section className="flex min-h-56 flex-col items-center justify-center text-center"><Film size={28} className="mb-3 text-[var(--foreground-muted)]" /><h2 className="font-bold text-[var(--foreground)]">No picks for this genre yet</h2><p className="mt-1 text-sm text-[var(--foreground-muted)]">Try another genre or refresh your picks.</p></section>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
