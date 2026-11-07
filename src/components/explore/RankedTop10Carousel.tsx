"use client";

// src/components/explore/RankedTop10Carousel.tsx
// Ported from the Watcher Expo app — Top 10 today carousel with SVG numeral rankings, adapted for Next.js/web.

import React, { memo, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Heart, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl } from '@/utils/tmdb';

interface RankedTop10CarouselProps {
  data: any[];
  savedIds?: Set<number>;
  toggleWatchlist: (item: any, e: React.MouseEvent) => void;
}

const NUMERAL_URIS: Record<number, string> = {};
for (let r = 1; r <= 10; r++) {
  const isDoubleDigit = r >= 10;
  const viewBoxWidth = isDoubleDigit ? 95 : 65;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} 85" width="${viewBoxWidth}" height="85"><text x="2" y="70" font-size="74" font-weight="900" font-family="sans-serif" stroke="white" stroke-width="2.5" fill="none">${r}</text></svg>`;
  NUMERAL_URIS[r] = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const OutlinedNumeral = memo(({ rank }: { rank: number }) => {
  const isDoubleDigit = rank >= 10;
  const svgUri = NUMERAL_URIS[rank] || NUMERAL_URIS[1];
  return (
    <div className="numeral-container" style={{ pointerEvents: 'none' }}>
      <img
        src={svgUri}
        alt={`Rank ${rank}`}
        className="numeral-image"
        style={{ width: isDoubleDigit ? 78 : 54, height: 70 }}
        decoding="async"
      />
    </div>
  );
});

const RankedCard = memo(
  ({
    item,
    rank,
    savedIds,
    onPress,
    toggleWatchlist,
  }: {
    item: any;
    rank: number;
    savedIds?: Set<number>;
    onPress: () => void;
    toggleWatchlist: (item: any, e: React.MouseEvent) => void;
  }) => {
    const imagePath = item.poster_path || item.backdrop_path;
    const imageUrl = imagePath ? getImageUrl(imagePath, 'w342') : null;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

    return (
      <div className="ranked-card-wrapper" onClick={onPress} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onPress()}>
        <div className="ranked-poster-shadow">
          <div className="ranked-poster-box">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={item.title || item.name}
                className="ranked-poster-image"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="ranked-placeholder">
                <Play size={24} color="#94a3b8" />
              </div>
            )}

            {/* Quick-Add Heart: top-right */}
            <div className="ranked-heart-overlay">
              <button
                type="button"
                className={`ranked-quick-add ${item.id && savedIds?.has(item.id) ? 'added' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleWatchlist(item, e);
                }}
                aria-label={item.id && savedIds?.has(item.id) ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Heart
                  size={18}
                  fill={item.id && savedIds?.has(item.id) ? 'var(--primary)' : 'none'}
                  stroke={item.id && savedIds?.has(item.id) ? 'var(--primary)' : '#ffffff'}
                  strokeWidth={2.4}
                />
              </button>
            </div>

            {/* Rating — bottom-right */}
            {rating && (
              <div className="ranked-rating-chip">
                <Star size={11} fill="#FFD60A" stroke="#FFD60A" strokeWidth={1.5} />
                <span className="ranked-rating-text">{rating}</span>
              </div>
            )}

            {/* GPU Outlined Numeral via SVG */}
            <OutlinedNumeral rank={rank} />
          </div>
        </div>

        {/* Title and Metadata below card */}
        <div className="ranked-meta-container">
          <h4 className="ranked-title" title={item.title || item.name}>
            {item.title || item.name}
          </h4>
          <p className="ranked-subtext">
            {year ? `${year} • ` : ''}Top {rank}
          </p>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id && prev.rank === next.rank
);

const RankedTop10Carousel = memo(
  ({ data, savedIds, toggleWatchlist }: RankedTop10CarouselProps) => {
    const router = useRouter();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
      if (scrollContainerRef.current) {
        const { scrollLeft, clientWidth } = scrollContainerRef.current;
        const scrollAmount = clientWidth * 0.75;
        scrollContainerRef.current.scrollTo({
          left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
          behavior: 'smooth'
        });
      }
    };

    const top10Data = useMemo(() => {
      if (!Array.isArray(data)) return [];
      return data.slice(0, 10);
    }, [data]);

    const handlePress = useCallback(
      (item: any) => {
        const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        router.push(`/detail?id=${item.id}&type=${mediaType}`);
      },
      [router]
    );

    const renderItem = useCallback(
      ({ item, index }: { item: any; index: number }) => (
        <RankedCard
          key={item.id || index}
          item={item}
          rank={index + 1}
          savedIds={savedIds}
          onPress={() => handlePress(item)}
          toggleWatchlist={toggleWatchlist}
        />
      ),
      [handlePress, savedIds, toggleWatchlist]
    );

    if (!top10Data.length) return null;

    return (
      <div className="ranked-section">
        <div className="ranked-header">
          <h2 className="ranked-section-title">Top 10 Today</h2>
          <div className="header-nav-arrows">
            <button className="header-arrow-btn" onClick={() => scroll('left')} aria-label="Scroll top 10 left">
              <ChevronLeft size={16} />
            </button>
            <button className="header-arrow-btn" onClick={() => scroll('right')} aria-label="Scroll top 10 right">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div ref={scrollContainerRef} className="ranked-scroll-container">
          {top10Data.map((item, index) => renderItem({ item, index }))}
        </div>
      </div>
    );
  },
  (prev, next) => prev.data === next.data
);

export default React.memo(RankedTop10Carousel);
