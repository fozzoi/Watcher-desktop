"use client";

// src/components/explore/SpotlightCarousel.tsx
// Ported from the Watcher Expo app — franchise/collection spotlight carousel, adapted for Next.js/web.

import React, { memo, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Play } from 'lucide-react';
import { getImageUrl } from '@/utils/tmdb';

interface SpotlightCarouselProps {
  title?: string;
  eyebrow?: string;
  data: any[];
}

const SpotlightCard = memo(
  ({ item, eyebrow, onPress }: { item: any; eyebrow?: string; onPress: () => void }) => {
    const backdropPath = item.backdrop_path || item.poster_path;
    const imageUrl = backdropPath ? getImageUrl(backdropPath, 'w780') : null;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const collectionName =
      item.collection_name || item.belongs_to_collection?.name || item.title || item.name;

    return (
      <div
        className="spotlight-card"
        onClick={onPress}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onPress()}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={collectionName}
            className="spotlight-image"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="spotlight-placeholder">
            <Play size={32} color="#94a3b8" />
          </div>
        )}

        <div className="spotlight-gradient" />

        <div className="spotlight-content">
          <span className="spotlight-eyebrow">{eyebrow || 'COLLECTION SPOTLIGHT'}</span>
          <h3 className="spotlight-title">{collectionName}</h3>
          <p className="spotlight-subtitle">
            {item.vote_average ? `★ ${item.vote_average.toFixed(1)} Rating` : 'Curated Collection'}
            {year ? ` • ${year}` : ''}
          </p>
        </div>

        <div className="spotlight-arrow">
          <ChevronRight size={16} strokeWidth={2.5} />
        </div>
      </div>
    );
  },
  (prev, next) => prev.item.id === next.item.id && prev.eyebrow === next.eyebrow
);

const SpotlightCarousel = memo(
  ({ title = 'Franchise Spotlight', eyebrow, data }: SpotlightCarouselProps) => {
    const router = useRouter();

    const validData = useMemo(() => {
      if (!Array.isArray(data)) return [];
      return data.filter((item) => Boolean(item && (item.backdrop_path || item.poster_path))).slice(0, 10);
    }, [data]);

    const handlePress = useCallback(
      (item: any) => {
        const collectionId = item.collection_id || item.belongs_to_collection?.id || item._colId;
        const collectionName = item.collection_name || item.belongs_to_collection?.name || item._colName;

        if (collectionId) {
          const titleToPass = collectionName || item.title || item.name || '';
          router.push(`/collection?id=${collectionId}&name=${encodeURIComponent(titleToPass)}`);
        } else if (item.id) {
          const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
          router.push(`/detail?id=${item.id}&type=${mediaType}`);
        }
      },
      [router]
    );

    if (!validData.length) return null;

    return (
      <div className="spotlight-section">
        <div className="spotlight-header">
          <h2 className="spotlight-section-title">{title}</h2>
        </div>

        <div className="spotlight-scroll-container">
          {validData.map((item) => (
            <div key={`spotlight-${item.id}`} className="spotlight-item-wrapper">
              <SpotlightCard item={item} eyebrow={eyebrow} onPress={() => handlePress(item)} />
            </div>
          ))}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.title === next.title && prev.eyebrow === next.eyebrow && prev.data === next.data
);

export default React.memo(SpotlightCarousel);
