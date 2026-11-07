"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Heart,
  Star,
  X,
} from "lucide-react";
import type { WatchProgress } from "@/utils/progress";
import { getImageUrl, type TMDBResult } from "@/utils/tmdb";
import { GENRE_DATA } from "./ExploreConstants";
import PageLoading from "@/components/PageLoading";

export type ExploreRowData = {
  title: string;
  type: string;
  items: TMDBResult[];
};

function getTitle(item: TMDBResult) {
  return item.title || item.name || "Untitled";
}

function getMediaType(item: TMDBResult): "movie" | "tv" {
  return item.media_type || (item.first_air_date && !item.release_date ? "tv" : "movie");
}

export function ExplorePosterCard({
  item,
  saved,
  onToggle,
  layout = "rail",
}: {
  item: TMDBResult;
  saved: boolean;
  onToggle: (item: TMDBResult) => void;
  layout?: "rail" | "grid";
}) {
  if (!item.poster_path) return null;

  const title = getTitle(item);
  const mediaType = getMediaType(item);
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);

  return (
    <article className={layout === "grid" ? "group w-full max-w-[180px]" : "group w-[148px] shrink-0 sm:w-[170px]"}>
      <div className="relative rounded-2xl transition duration-300 group-hover:-translate-y-1">
        <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[0_8px_20px_rgba(0,0,0,0.24)] transition duration-300 group-hover:border-[var(--card-hover-border)] group-hover:shadow-[0_16px_34px_rgba(0,0,0,0.34)]">
          <Link href={`/detail?id=${item.id}&type=${mediaType}`} aria-label={`View ${title}`} className="absolute inset-0">
            <img
              src={getImageUrl(item.poster_path, "w342")}
              srcSet={`${getImageUrl(item.poster_path, "w185")} 185w, ${getImageUrl(item.poster_path, "w342")} 342w`}
              sizes={layout === "rail" ? "(max-width: 640px) 148px, 170px" : "(max-width: 640px) 44vw, (max-width: 1023px) 22vw, 16vw"}
              alt={title}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
            {item.vote_average > 0 && (
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
                <Star size={12} fill="#fbbf24" stroke="#fbbf24" />
                {item.vote_average.toFixed(1)}
              </span>
            )}
          </Link>
          <button
            type="button"
            aria-label={saved ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
            title={saved ? "In your watchlist" : "Add to watchlist"}
            onClick={() => onToggle(item)}
            className={`absolute right-2.5 top-2.5 inline-flex size-9 items-center justify-center rounded-full border border-white/20 backdrop-blur-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${saved ? "bg-[var(--primary)] text-white" : "bg-black/65 text-white hover:bg-[var(--primary)]"}`}
          >
            {saved ? <Check size={17} /> : <Heart size={17} />}
          </button>
        </div>
      </div>
      <Link href={`/detail?id=${item.id}&type=${mediaType}`} className="mt-2 block min-w-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
        <h3 className="truncate text-sm font-semibold text-[var(--foreground)] transition group-hover:text-[var(--primary)]">{title}</h3>
        <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{mediaType === "tv" ? "Series" : "Movie"}{year ? ` · ${year}` : ""}</p>
      </Link>
    </article>
  );
}

export function ExploreCatalogRow({
  row,
  savedIds,
  onToggle,
}: {
  row: ExploreRowData;
  savedIds: Set<number>;
  onToggle: (item: TMDBResult) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  if (!row.items?.length) return null;

  const scroll = (direction: -1 | 1) => {
    if (!rail.current) return;
    rail.current.scrollBy({ left: direction * Math.max(320, rail.current.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className="mb-7" aria-label={row.title}>
      <div className="mb-3 flex min-h-11 items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight text-[var(--foreground)] sm:text-2xl">{row.title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href={`/view-all?title=${encodeURIComponent(row.title)}&type=${encodeURIComponent(row.type)}`} className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-[var(--foreground-muted)] transition hover:text-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] sm:text-sm">
            View all <ArrowRight size={14} />
          </Link>
          <div className="hidden gap-1 sm:flex">
            <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${row.title} left`} className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground-muted)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${row.title} right`} className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground-muted)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"><ChevronRight size={17} /></button>
          </div>
        </div>
      </div>
      <div
        ref={rail}
        className="-mx-4 -my-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scroll-pl-5 px-5 py-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:gap-4 sm:scroll-pl-6 sm:px-6"
      >
        {row.items.map((item, index) => (
          <div key={`${getMediaType(item)}-${item.id}-${index}`} className="snap-start snap-always">
            <ExplorePosterCard item={item} saved={savedIds.has(item.id)} onToggle={onToggle} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ExploreGenrePicker({
  selectedGenre,
  onSelect,
}: {
  selectedGenre: number;
  onSelect: (genreId: number) => void;
}) {
  return (
    <div className="-mx-4 -my-2 flex gap-2 overflow-x-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {GENRE_DATA.map((genre) => (
        <button
          key={genre.id}
          type="button"
          onClick={() => onSelect(genre.id)}
          aria-pressed={selectedGenre === genre.id}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${selectedGenre === genre.id ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[0_5px_16px_var(--primary-glow)]" : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"}`}
        >
          {genre.name}
        </button>
      ))}
    </div>
  );
}

export function ExploreHero({
  items,
  savedIds,
  onToggle,
}: {
  items: TMDBResult[];
  savedIds: Set<number>;
  onToggle: (item: TMDBResult) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slideCount = items.length;
  const currentIndex = slideCount ? activeIndex % slideCount : 0;
  const item = items[currentIndex];

  useEffect(() => {
    if (slideCount < 2 || paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slideCount);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [paused, slideCount]);

  if (!item) return null;

  const mediaType = getMediaType(item);
  const date = item.release_date || item.first_air_date;
  const saved = savedIds.has(item.id);

  const changeSlide = (direction: -1 | 1) => {
    setActiveIndex((index) => ((index % slideCount) + direction + slideCount) % slideCount);
  };

  return (
    <section
      className="group relative isolate mb-6 min-h-[300px] overflow-hidden rounded-[24px] border border-white/10 bg-[#17171b] sm:min-h-[350px] lg:min-h-[380px]"
      role="region"
      aria-label="Featured titles"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="absolute inset-0 z-0 overflow-hidden rounded-[24px]">
        <img
          key={item.id}
          src={getImageUrl(item.backdrop_path || item.poster_path, "w1280")}
          srcSet={`${getImageUrl(item.backdrop_path || item.poster_path, "w780")} 780w, ${getImageUrl(item.backdrop_path || item.poster_path, "w1280")} 1280w`}
          sizes="100vw"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full animate-[hero-image-in_500ms_ease-out] object-cover object-center opacity-90"
        />
        <div className="absolute inset-0 z-[2] bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
        <div className="absolute inset-0 z-[2] bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      </div>
      <div
        key={`content-${item.id}`}
        className="relative z-10 flex min-h-[300px] max-w-2xl animate-[hero-content-in_350ms_ease-out] flex-col justify-end p-6 sm:min-h-[350px] sm:p-10 lg:min-h-[380px] lg:p-12"
        role="group"
        aria-roledescription="slide"
        aria-label={`${currentIndex + 1} of ${slideCount}: ${getTitle(item)}`}
      >
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">FEATURED</p>
        <h2 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">{getTitle(item)}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
          <span>{mediaType === "tv" ? "Series" : "Movie"}</span>
          {date && <><span aria-hidden="true">·</span><span>{date.slice(0, 4)}</span></>}
          {item.vote_average > 0 && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><Star size={14} fill="#fbbf24" stroke="#fbbf24" />{item.vote_average.toFixed(1)}</span></>}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/detail?id=${item.id}&type=${mediaType}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-black transition hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><CirclePlay size={18} /> Explore title</Link>
          <button type="button" onClick={() => onToggle(item)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-black/25 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{saved ? <Check size={17} /> : <BookmarkPlus size={17} />}{saved ? "In watchlist" : "Add to watchlist"}</button>
        </div>
      </div>
      {slideCount > 1 && (
        <>
          <div className="absolute right-4 top-4 z-10 flex gap-2 sm:right-6 sm:top-6">
            <button
              type="button"
              onClick={() => changeSlide(-1)}
              aria-label="Previous featured title"
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => changeSlide(1)}
              aria-label="Next featured title"
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="absolute bottom-4 right-5 z-10 flex items-center gap-2 sm:bottom-6 sm:right-7" aria-label="Choose featured title">
            {items.map((featuredItem, index) => (
              <button
                key={featuredItem.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show ${getTitle(featuredItem)}`}
                aria-current={currentIndex === index ? "true" : undefined}
                className={`h-2 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${activeIndex === index ? "w-6 bg-white" : "w-2 bg-white/55 hover:bg-white/85"}`}
              />
            ))}
          </div>
        </>
      )}
      <style jsx>{`
        @keyframes hero-image-in {
          from { opacity: 0.45; transform: scale(1.015); }
          to { opacity: 0.75; transform: scale(1); }
        }
        @keyframes hero-content-in {
          from { opacity: 0.55; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          section :global(img),
          section > div:nth-child(2) {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

export function ExploreContinueWatching({
  history,
  onRemove,
}: {
  history: WatchProgress[];
  onRemove: (id: number) => void;
}) {
  if (!history.length) return null;

  return (
    <section className="mb-8" aria-label="Your recent watches">
      <h2 className="mb-1 text-xl font-bold text-[var(--foreground)] sm:text-2xl">Continue watching</h2>
      <div className="-mx-4 -my-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scroll-pl-5 px-5 py-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:scroll-pl-6 sm:px-6">
        {history.slice(0, 12).map((entry) => (
          <article key={entry.tmdbId} className="group relative w-64 shrink-0 snap-start snap-always rounded-2xl transition duration-300 hover:-translate-y-1 sm:w-72">
            <div className="relative rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[0_8px_20px_rgba(0,0,0,0.2)] transition group-hover:border-[var(--card-hover-border)] group-hover:shadow-[0_16px_32px_rgba(0,0,0,0.3)]">
              <Link href={`/player?id=${entry.tmdbId}&type=${entry.mediaType}&title=${encodeURIComponent(entry.title)}&poster=${encodeURIComponent(entry.poster)}`} className="flex min-h-[122px] gap-3 rounded-2xl p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
                <img src={getImageUrl(entry.poster, "w185")} alt="" className="h-24 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                <div className="min-w-0 self-center pr-5">
                  <h3 className="line-clamp-2 text-sm font-bold text-[var(--foreground)]">{entry.title}</h3>
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">{entry.mediaType === "tv" ? `Season ${entry.lastSeason}, episode ${entry.lastEpisode}` : "Continue watching"}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)]"><CirclePlay size={14} /> Continue</span>
                </div>
              </Link>
              <button type="button" onClick={() => onRemove(entry.tmdbId)} aria-label={`Remove ${entry.title} from recent watches`} className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:opacity-0 sm:group-hover:opacity-100"><X size={14} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ExploreLoading({ label }: { label: string }) {
  return (
    <PageLoading label={label} className="min-h-[32vh] px-6" />
  );
}

export function ExploreProgress() {
  return (
    <div className="mb-5 h-1 overflow-hidden rounded-full bg-[var(--card-border)]" role="progressbar" aria-label="Updating recommendations">
      <div className="explore-progress h-full w-1/3 rounded-full bg-[var(--primary)]" />
      <style jsx>{`
        @keyframes explore-progress {
          0% { transform: translateX(-120%); }
          55% { transform: translateX(195%); }
          100% { transform: translateX(390%); }
        }
        .explore-progress { animation: explore-progress 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .explore-progress { animation: none; opacity: 0.65; }
        }
      `}</style>
    </div>
  );
}

export function ExploreSearchGrid({
  query,
  results,
  loading,
  savedIds,
  onToggle,
}: {
  query: string;
  results: TMDBResult[];
  loading: boolean;
  savedIds: Set<number>;
  onToggle: (item: TMDBResult) => void;
}) {
  return (
    <section aria-live="polite" aria-busy={loading}>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[var(--foreground)]">{loading ? "Searching…" : `Results for “${query.trim()}”`}</h2>
      </div>
      {loading ? (
        <ExploreLoading label="Searching titles" />
      ) : results.length ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6 xl:grid-cols-7">{results.map((item) => <ExplorePosterCard key={`${getMediaType(item)}-${item.id}`} item={item} saved={savedIds.has(item.id)} onToggle={onToggle} layout="grid" />)}</div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] px-6 text-center"><p className="font-bold text-[var(--foreground)]">No matches found</p><p className="mt-1 text-sm text-[var(--foreground-muted)]">Try another title or check the spelling.</p></div>
      )}
    </section>
  );
}
