"use client";

// src/components/explore/SpotlightCarousel.tsx
// Ported from the Watcher Expo app — franchise/collection spotlight carousel, adapted for Next.js/web.
// STRICTLY displays real TMDB Collections and always navigates directly to the collection page.

import React, { memo, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
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
    const collectionName =
      item.collection_name || item.belongs_to_collection?.name || item.name || item.title || 'Collection';
    const filmsCount = item.parts?.length || item.parts_count || null;

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
            <Layers size={32} color="#94a3b8" />
          </div>
        )}

        <div className="spotlight-gradient" />

        <div className="spotlight-content">
          <span className="spotlight-eyebrow">{eyebrow || 'FRANCHISE SPOTLIGHT'}</span>
          <h3 className="spotlight-title">{collectionName}</h3>
          <p className="spotlight-subtitle">
            {filmsCount ? `${filmsCount} Films • Saga` : (item.vote_average ? `★ ${item.vote_average.toFixed(1)} Rating • Franchise` : 'Franchise Collection')}
          </p>
        </div>
      </div>
    );
  },
  (prev, next) => (prev.item.id || prev.item.collection_id) === (next.item.id || next.item.collection_id) && prev.eyebrow === next.eyebrow
);

const SpotlightCarousel = memo(
  ({ title = 'Franchise Spotlight', eyebrow = 'COLLECTION SPOTLIGHT', data }: SpotlightCarouselProps) => {
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

    const validData = useMemo(() => {
      if (!Array.isArray(data)) return [];
      // STRICT FILTER: Only genuine collections are allowed in this spotlight rail
      return data.filter((item) => {
        if (!item || (!item.backdrop_path && !item.poster_path)) return false;
        const isCollection = Boolean(
          item.media_type === 'collection' ||
          item.collection_id ||
          item._colId ||
          item.belongs_to_collection?.id ||
          (item.parts && Array.isArray(item.parts)) ||
          item.parts_count
        );
        return isCollection;
      }).slice(0, 15);
    }, [data]);

    const handlePress = useCallback(
      (item: any) => {
        const collectionId =
          item.collection_id ||
          item.belongs_to_collection?.id ||
          item._colId ||
          (item.media_type === 'collection' ? item.id : null) ||
          item.id;
        const collectionName =
          item.collection_name ||
          item.belongs_to_collection?.name ||
          item._colName ||
          item.name ||
          item.title ||
          '';

        if (collectionId) {
          router.push(`/collection?id=${collectionId}&name=${encodeURIComponent(collectionName)}`);
        }
      },
      [router]
    );

    if (!validData.length) return null;

    return (
      <div className="spotlight-section">
        <div className="spotlight-header">
          <h2 className="spotlight-section-title">{title}</h2>
          <div className="header-nav-arrows">
            <button className="header-arrow-btn" onClick={() => scroll('left')} aria-label="Scroll spotlight left">
              <ChevronLeft size={16} />
            </button>
            <button className="header-arrow-btn" onClick={() => scroll('right')} aria-label="Scroll spotlight right">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="spotlight-scroll-container"
        >
          {validData.map((item) => (
            <div
              key={`spotlight-${item.collection_id || item.id}`}
              className="spotlight-item-wrapper"
            >
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
