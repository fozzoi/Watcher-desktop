"use client";

import { useRef } from "react";
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

export type ExploreRowData = {
  title: string;
  type: string;
  items: TMDBResult[];
  note?: string;
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
              alt={title}
              loading="lazy"
              decoding="async"
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
    <section className="mb-9" aria-label={row.title}>
      <div className="mb-3 flex min-h-11 items-end justify-between gap-3">
        <div className="min-w-0">
          {row.note && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">{row.note}</p>}
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
        className="-mx-4 -my-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 py-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:gap-4 sm:px-6"
      >
        {row.items.map((item, index) => (
          <div key={`${getMediaType(item)}-${item.id}-${index}`} className="snap-start">
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
  item,
  saved,
  onToggle,
}: {
  item: TMDBResult;
  saved: boolean;
  onToggle: (item: TMDBResult) => void;
}) {
  const mediaType = getMediaType(item);
  const date = item.release_date || item.first_air_date;

  return (
    <section className="relative isolate mb-8 min-h-[360px] rounded-[28px] border border-white/10 bg-[#17171b] sm:min-h-[430px] lg:min-h-[500px]">
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-[28px]">
        <img src={getImageUrl(item.backdrop_path || item.poster_path, "original")} alt="" fetchPriority="high" className="h-full w-full object-cover object-center opacity-75" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/5" />
      </div>
      <div className="flex min-h-[360px] max-w-2xl flex-col justify-end p-6 sm:min-h-[430px] sm:p-10 lg:min-h-[500px] lg:p-14">
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/75"><span className="size-1.5 rounded-full bg-[var(--accent)]" />TODAY’S SPOTLIGHT</p>
        <h2 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">{getTitle(item)}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
          <span>{mediaType === "tv" ? "Series" : "Movie"}</span>
          {date && <><span aria-hidden="true">·</span><span>{date.slice(0, 4)}</span></>}
          {item.vote_average > 0 && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><Star size={14} fill="#fbbf24" stroke="#fbbf24" />{item.vote_average.toFixed(1)}</span></>}
        </div>
        <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">{item.overview || "A new story to add to your watchlist."}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/detail?id=${item.id}&type=${mediaType}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-black transition hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><CirclePlay size={18} /> Explore title</Link>
          <button type="button" onClick={() => onToggle(item)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-black/25 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{saved ? <Check size={17} /> : <BookmarkPlus size={17} />}{saved ? "In watchlist" : "Add to watchlist"}</button>
        </div>
      </div>
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
      <div className="mb-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">PICK UP WHERE YOU LEFT OFF</p>
        <h2 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">Your recent watches</h2>
      </div>
      <div className="-mx-4 -my-4 flex gap-3 overflow-x-auto px-5 py-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:px-6">
        {history.slice(0, 12).map((entry) => (
          <article key={entry.tmdbId} className="group relative w-64 shrink-0 rounded-2xl transition duration-300 hover:-translate-y-1 sm:w-72">
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

export function ExploreSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading recommendations">
      {[0, 1, 2].map((row) => (
        <div key={row} className="mb-8">
          <div className="mb-3 h-7 w-48 animate-pulse rounded bg-[var(--input-bg)]" />
          <div className="-mx-4 -my-4 flex gap-4 overflow-x-auto px-5 py-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:px-6">
            {Array.from({ length: 7 }, (_, index) => <div key={index} className="aspect-[2/3] w-[148px] shrink-0 animate-pulse rounded-2xl bg-[var(--input-bg)] sm:w-[170px]" />)}
          </div>
        </div>
      ))}
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
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">SEARCH</p>
        <h2 className="mt-1 text-2xl font-bold text-[var(--foreground)]">{loading ? "Looking through the library…" : `Results for “${query.trim()}”`}</h2>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6 xl:grid-cols-7">{Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[2/3] w-full max-w-[180px] animate-pulse rounded-2xl bg-[var(--input-bg)]" />)}</div>
      ) : results.length ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6 xl:grid-cols-7">{results.map((item) => <ExplorePosterCard key={`${getMediaType(item)}-${item.id}`} item={item} saved={savedIds.has(item.id)} onToggle={onToggle} layout="grid" />)}</div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] px-6 text-center"><p className="font-bold text-[var(--foreground)]">No matches found</p><p className="mt-1 text-sm text-[var(--foreground-muted)]">Try another title or check the spelling.</p></div>
      )}
    </section>
  );
}
