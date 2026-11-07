"use client";

import PageLoading from "@/components/PageLoading";
import React, { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Download,
  Film,
  History,
  Magnet,
  Search,
  X,
} from "lucide-react";
import { searchTorrents, TorrentResult } from "@/utils/Scraper";
import { AsyncStorage } from "@/utils/storage";
import AuroraBackground from "@/components/AuroraBackground";

type StatusMessage = {
  text: string;
  type: "success" | "error" | "info";
};

interface SearchHistoryEntry {
  query: string;
  date: string;
}

const qualityFor = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("2160p") || normalized.includes("4k")) {
    return { label: "4K", style: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  }
  if (normalized.includes("1080p")) {
    return { label: "1080p", style: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  }
  if (normalized.includes("720p")) {
    return { label: "720p", style: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  }
  return { label: "SD", style: "border-[var(--card-border)] bg-[var(--badge-bg)] text-[var(--foreground-muted)]" };
};

function TorrentSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const searchRequestRef = useRef(0);
  const lastPrefillRef = useRef<string | null>(null);

  const handleSearch = useCallback(async (customQuery?: string) => {
    const queryToSearch = (customQuery ?? searchQuery).trim();
    if (!queryToSearch) return;

    const requestId = ++searchRequestRef.current;
    setHasSearched(true);
    setLoading(true);
    setResults([]);
    setShowMore(false);
    setStatusMessage(null);

    try {
      const storedHistory = await AsyncStorage.getItem("searchHistory");
      const history: SearchHistoryEntry[] = storedHistory ? JSON.parse(storedHistory) : [];
      const nextHistory = history.filter(
        (item) => item.query.toLowerCase() !== queryToSearch.toLowerCase()
      );
      nextHistory.push({ query: queryToSearch, date: new Date().toISOString() });
      await AsyncStorage.setItem("searchHistory", JSON.stringify(nextHistory));
    } catch (error) {
      console.error("History save error:", error);
    }

    try {
      const scrapedResults = await searchTorrents(queryToSearch);
      if (requestId === searchRequestRef.current) setResults(scrapedResults);
    } catch (error) {
      console.error("Torrent search failed:", error);
      if (requestId === searchRequestRef.current) {
        setStatusMessage({
          text: error instanceof Error ? error.message : "Could not load search results.",
          type: "error",
        });
      }
    } finally {
      if (requestId === searchRequestRef.current) setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const prefill = searchParams.get("prefillQuery");
    if (!prefill || prefill === lastPrefillRef.current) return;

    lastPrefillRef.current = prefill;
    setSearchQuery(prefill);
    void handleSearch(prefill);
  }, [handleSearch, searchParams]);

  const handleClear = () => {
    searchRequestRef.current += 1;
    lastPrefillRef.current = null;
    setSearchQuery("");
    setResults([]);
    setLoading(false);
    setHasSearched(false);
    setShowMore(false);
    setStatusMessage(null);
    router.replace("/search");
  };

  const handleDownloadTorrent = async (item: TorrentResult) => {
    const match = item.url.match(/urn:btih:([a-fA-F0-9]{40})/i);
    if (!match) {
      setStatusMessage({ text: "No valid hash found in this magnet link.", type: "error" });
      return;
    }

    const hash = match[1].toUpperCase();
    setDownloadingHash(hash);
    setStatusMessage({ text: "Checking the available file cache…", type: "info" });

    try {
      const response = await fetch(
        `https://watcher-api-rho.vercel.app/api/torrent-file?hash=${hash}`
      );
      if (!response.ok) throw new Error("Torrent file is not available in the cache.");

      const blob = await response.blob();
      if (blob.size < 40) throw new Error("The returned file is invalid.");

      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.download = `${item.name.replace(/[^a-z0-9]/gi, "_").substring(0, 50)}.torrent`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setStatusMessage({ text: "Torrent file downloaded.", type: "success" });
    } catch (error) {
      console.error("Torrent file download failed:", error);
      setStatusMessage({
        text: "This file is not cached yet. You can try opening the magnet link instead.",
        type: "error",
      });
    } finally {
      setDownloadingHash(null);
    }
  };

  const visibleResults = showMore ? results : results.slice(0, 8);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSearch();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 sm:px-7 sm:pt-10 lg:px-10">
      <header className="mb-8 flex flex-col gap-5 border-b border-[var(--card-border)] pb-7 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            Watcher · Discover
          </p>
          <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
            Search titles
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)] sm:text-base">
            Find a movie, series, or anime across available sources.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/history")}
          className="inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 text-sm font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--card-hover-border)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
        >
          <History size={16} />
          Search history
        </button>
      </header>

      <form
        onSubmit={submitSearch}
        role="search"
        className="mb-8 flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--input-border)] bg-[var(--card-bg)] p-2 shadow-[0_8px_28px_var(--shadow-color)] transition focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary-glow)] sm:mb-10"
      >
        <Search
          aria-hidden="true"
          size={19}
          className="ml-2 shrink-0 text-[var(--foreground-muted)]"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search a title…"
          aria-label="Search a title"
          className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)] sm:text-base"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          >
            <X size={17} />
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !searchQuery.trim()}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[image:var(--primary-gradient)] px-3.5 text-sm font-bold text-white shadow-[0_3px_12px_var(--primary-glow)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
        >
          {loading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
          ) : (
            <Search size={16} />
          )}
          <span className="hidden sm:inline">{loading ? "Searching" : "Search"}</span>
        </button>
      </form>

      {statusMessage && (
        <div
          role={statusMessage.type === "error" ? "alert" : "status"}
          className={`mb-7 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            statusMessage.type === "error"
              ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
              : statusMessage.type === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          }`}
        >
          {statusMessage.type === "error" ? (
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          )}
          <span className="flex-1 leading-6">{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label="Dismiss message"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {hasSearched ? (
        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--card-border)] pb-3">
            <h2 className="text-lg font-bold tracking-tight text-[var(--foreground)] sm:text-xl">
              {loading ? "Searching available sources" : "Search results"}
            </h2>
            {!loading && (
              <span className="text-sm text-[var(--foreground-muted)]">
                {results.length} {results.length === 1 ? "match" : "matches"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-[var(--card-border)]" aria-busy="true">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex animate-pulse gap-4 py-5">
                  <div className="size-11 shrink-0 rounded-xl bg-[var(--input-bg)]" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-3/5 rounded bg-[var(--input-bg)]" />
                    <div className="h-3 w-2/5 rounded bg-[var(--input-bg)]" />
                    <div className="h-3 w-1/4 rounded bg-[var(--input-bg)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-[var(--card-border)]">
              {visibleResults.map((item, index) => {
                const quality = qualityFor(item.name);
                const hash = item.url.match(/urn:btih:([a-fA-F0-9]{40})/i)?.[1]?.toUpperCase();
                const isDownloading = downloadingHash === hash;
                const seedStyle =
                  item.seeds > 50
                    ? "text-emerald-600 dark:text-emerald-400"
                    : item.seeds > 10
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-[var(--foreground-muted)]";

                return (
                  <article
                    key={item.id || index}
                    className="group py-5 transition-colors hover:bg-[color-mix(in_srgb,var(--foreground)_2%,transparent)] sm:px-3"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--foreground-muted)] sm:size-11">
                        <Film size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3
                          title={item.name}
                          className="line-clamp-2 text-sm font-bold leading-5 text-[var(--foreground)] sm:text-base"
                        >
                          {item.name}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-md border px-2 py-1 font-bold ${quality.style}`}>
                            {quality.label}
                          </span>
                          <span className="rounded-md border border-[var(--card-border)] px-2 py-1 text-[var(--foreground-muted)]">
                            {item.size}
                          </span>
                          <span className="text-[var(--foreground-muted)]">
                            {item.source}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                          <span className={`inline-flex items-center gap-1.5 ${seedStyle}`}>
                            <ArrowUp size={13} />
                            {item.seeds} seeds
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[var(--foreground-muted)]">
                            <ArrowDown size={13} />
                            {item.peers} peers
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 pl-[52px] sm:flex sm:justify-end sm:pl-0">
                      <button
                        type="button"
                        onClick={() => void handleDownloadTorrent(item)}
                        disabled={isDownloading}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] px-3 text-xs font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--card-hover-border)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:cursor-wait disabled:opacity-60 sm:h-10 sm:px-4 sm:text-sm"
                      >
                        {isDownloading ? (
                          <span className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                        ) : (
                          <Download size={15} />
                        )}
                        Download file
                      </button>
                      <a
                        href={item.url}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[image:var(--primary-gradient)] px-3 text-xs font-bold text-white shadow-[0_2px_8px_var(--primary-glow)] transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:h-10 sm:px-4 sm:text-sm"
                      >
                        <Magnet size={15} />
                        Open magnet
                      </a>
                    </div>
                  </article>
                );
              })}

              {results.length > 8 && (
                <div className="pt-5 text-center">
                  <button
                    type="button"
                    onClick={() => setShowMore((value) => !value)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--primary)] transition hover:bg-[var(--sidebar-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  >
                    {showMore ? "Show fewer results" : `Show all ${results.length} results`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground-muted)]">
                <Search size={21} />
              </span>
              <h3 className="font-semibold text-[var(--foreground)]">
                No matches found
              </h3>
              <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--foreground-muted)]">
                Try another title or check the spelling.
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="grid gap-8 border-t border-[var(--card-border)] py-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-12">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">
              Start with a title
            </h2>
            <p className="mt-1 max-w-lg text-sm leading-6 text-[var(--foreground-muted)]">
              Enter a movie, series, or anime above. Results include format,
              file size, and source activity.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--foreground-muted)]">
            <Clock3 size={15} />
            Searches are saved to your history
          </div>
        </section>
      )}
    </div>
  );
}

export default function TorrentSearch() {
  return (
    <div className="relative isolate min-h-screen">
      <AuroraBackground />
      <div className="relative z-10">
        <Suspense
          fallback={<PageLoading label="Loading search" className="min-h-64 w-full px-4" />}
        >
          <TorrentSearchContent />
        </Suspense>
      </div>
    </div>
  );
}
