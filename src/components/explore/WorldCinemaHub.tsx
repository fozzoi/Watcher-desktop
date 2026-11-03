"use client";

// src/components/explore/WorldCinemaHub.tsx
// Ported from the Watcher Expo app — world cinema hub with language tabs + interleaved movies/TV, adapted for Next.js/web.

import React, { memo, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getImageUrl } from '@/utils/tmdb';
import { LANGUAGE_OPTIONS } from '@/utils/userPreferences';
import QuickAddButton from '@/components/shared/QuickAddButton';

const CARD_WIDTH = 135;
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + GAP;

interface WorldCinemaHubProps {
  langData: Record<string, { movies?: any[]; tv?: any[] }>;
  savedIds?: Set<number>;
  toggleWatchlist: (item: any, e: React.MouseEvent) => void;
}

const WorldCinemaHub = memo(({ langData, savedIds, toggleWatchlist }: WorldCinemaHubProps) => {
  const router = useRouter();

  const availableLangs = useMemo(() => {
    if (!langData) return [];
    const keys = Object.keys(langData).filter((k) => {
      const d = langData[k];
      return (d.movies && d.movies.length > 0) || (d.tv && d.tv.length > 0);
    });
    return keys.map((code) => {
      const match = LANGUAGE_OPTIONS.find((opt) => opt.code === code);
      return { code, label: match ? match.label : code.toUpperCase() };
    });
  }, [langData]);

  const [activeCode, setActiveCode] = useState<string>('all');

  // Interleave movies & series so both appear side-by-side
  const activeItems = useMemo(() => {
    if (!langData) return [];

    const interleave = (movies: any[], series: any[]) => {
      const result: any[] = [];
      const maxLen = Math.max(movies.length, series.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < movies.length) result.push({ ...movies[i], _mediaType: 'movie' });
        if (i < series.length) result.push({ ...series[i], _mediaType: 'tv' });
      }
      return result;
    };

    if (activeCode === 'all') {
      const langEntries = Object.entries(langData).filter(([_, data]) =>
        (data.movies && data.movies.length > 0) || (data.tv && data.tv.length > 0)
      );
      if (langEntries.length === 0) return [];

      const perLangLists = langEntries.map(([code, data]) => {
        const m = (data.movies || []).map((item) => ({ ...item, _langCode: code, _mediaType: 'movie' }));
        const t = (data.tv || []).map((item) => ({ ...item, _langCode: code, _mediaType: 'tv' }));
        return interleave(m, t);
      });

      // Round-robin across all available languages
      const combined: any[] = [];
      const seenIds = new Set<number>();
      const maxItems = Math.max(24, langEntries.length * 3);
      const maxDepth = Math.max(...perLangLists.map((l) => l.length), 0);

      for (let depth = 0; depth < maxDepth && combined.length < maxItems; depth++) {
        for (const list of perLangLists) {
          if (combined.length >= maxItems) break;
          const item = list[depth];
          if (item && item.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            combined.push(item);
          }
        }
      }

      return combined;
    }

    const current = langData[activeCode];
    if (!current) return [];

    const m = (current.movies || []).map((item) => ({ ...item, _langCode: activeCode, _mediaType: 'movie' }));
    const t = (current.tv || []).map((item) => ({ ...item, _langCode: activeCode, _mediaType: 'tv' }));
    return interleave(m, t).slice(0, 24);
  }, [langData, activeCode]);

  const handleViewAll = useCallback(() => {
    if (activeCode && activeCode !== 'all') {
      const langLabel = availableLangs.find((l) => l.code === activeCode)?.label || activeCode.toUpperCase();
      router.push(`/view-all?title=${encodeURIComponent(`${langLabel} Cinema`)}&type=lang-movies-${activeCode}&lang=${activeCode}`);
    } else {
      router.push(`/view-all?title=${encodeURIComponent('World Cinema')}&type=world-cinema&lang=all`);
    }
  }, [router, activeCode, availableLangs]);

  const handlePress = useCallback(
    (item: any) => {
      const mediaType = item._mediaType || item.media_type || (item.first_air_date ? 'tv' : 'movie');
      router.push(`/detail?id=${item.id}&type=${mediaType}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const imagePath = item.poster_path || item.backdrop_path;
      const imageUrl = imagePath ? getImageUrl(imagePath, 'w342') : null;
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const isTV = item._mediaType === 'tv' || Boolean(item.first_air_date);

      return (
        <div
          className="world-card-container"
          onClick={() => handlePress(item)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handlePress(item)}
        >
          <div className="world-card-shadow">
            <div className="world-poster-box">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={item.title || item.name}
                  className="world-poster-image"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="world-placeholder">
                  <PlayIcon size={24} color="#94a3b8" />
                </div>
              )}

              {/* Quick Watchlist Heart: top-right */}
              <div className="world-heart-overlay">
                <QuickAddButton
                  item={item}
                  itemId={item.id}
                  isAdded={savedIds?.has(item.id)}
                  plain
                  onPress={() => toggleWatchlist(item, undefined as unknown as React.MouseEvent)}
                />
              </div>

              {/* Rating — anchored to the poster bottom */}
              {item.vote_average && (
                <div className="world-rating-chip">
                  <StarIcon size={11} fill="#FFD60A" stroke="#FFD60A" strokeWidth={1.5} />
                  <span className="world-rating-text">{item.vote_average.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>

          <h4 className="world-card-title" title={item.title || item.name}>
            {item.title || item.name}
          </h4>
          <p className="world-card-subtext">
            {year ? `${year} • ` : ''}{isTV ? 'Series' : 'Movie'}
          </p>
        </div>
      );
    },
    [handlePress, toggleWatchlist, savedIds]
  );

  if (!availableLangs.length) return null;

  return (
    <div className="world-section">
      {/* Tappable Header to View All */}
      <div
        className="world-header-row"
        onClick={handleViewAll}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleViewAll()}
      >
        <div className="world-title-with-icon">
          <h2 className="world-section-title">World Cinema</h2>
          <ChevronRight size={18} strokeWidth={2} />
        </div>
        <span className="world-lang-counter">{availableLangs.length} Languages</span>
      </div>

      {/* Language Filter Tabs */}
      <div className="world-tabs-scroll">
        <div className="world-tabs-container">
          <button
            type="button"
            className={`world-tab-chip ${activeCode === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCode('all')}
          >
            {activeCode === 'all' ? '• All' : 'All'}
          </button>
          {availableLangs.map((lang) => {
            const isSelected = activeCode === lang.code;
            return (
              <button
                key={`lang-tab-${lang.code}`}
                type="button"
                className={`world-tab-chip ${isSelected ? 'active' : ''}`}
                onClick={() => setActiveCode(lang.code)}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interleaved Movies + TV Rail */}
      <div className="world-list-content">
        {activeItems.map((item) => (
          <div key={`world-${item._mediaType}-${item.id}-${activeCode}`} className="world-item-card">
            {renderItem({ item })}
          </div>
        ))}
      </div>
    </div>
  );
});

// Inline icons
const PlayIcon = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const StarIcon = ({ size, fill, stroke, strokeWidth }: { size: number; fill: string; stroke: string; strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

export default WorldCinemaHub;
