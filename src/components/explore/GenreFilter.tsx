"use client";

// src/components/explore/GenreFilter.tsx
// Ported from the Watcher Expo app — genre chips with magnetic centering, adapted for Next.js/web.

import React, { memo, forwardRef, useCallback, useEffect, useRef } from 'react';
import { GENRE_DATA, GenreItem } from './ExploreConstants';
import {
  Sparkles,
  Zap,
  Compass,
  Palette,
  Smile,
  Fingerprint,
  Skull,
  Heart,
  Globe,
  Activity,
  Film,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const GENRE_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Sparkles,
  Zap,
  Compass,
  Palette,
  Smile,
  Fingerprint,
  Skull,
  Heart,
  Globe,
  Activity,
  Film,
};

interface GenreFilterProps {
  selectedGenre: number;
  onSelectGenre: (id: number) => void;
}

const GenreChipItem = forwardRef<HTMLButtonElement, { item: GenreItem; isSelected: boolean; onPress: () => void }>(
  ({ item, isSelected, onPress }, ref) => {
    const Icon = GENRE_ICON_MAP[item.icon] || Film;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onPress}
        className={`genre-chip ${isSelected ? 'active' : ''}`}
        aria-label={isSelected ? `${item.name}, selected` : item.name}
        aria-pressed={isSelected}
      >
        <Icon size={14} className="genre-chip-icon" />
        <span className="genre-chip-text">{item.name}</span>
      </button>
    );
  }
);
GenreChipItem.displayName = 'GenreChipItem';

// Module-level persistence prevents scroll reset during list header rebuilds or tab switches
let persistentScrollX = 0;
const persistentLayouts: Record<number, { x: number; width: number }> = {};

const GenreFilter = memo(({ selectedGenre, onSelectGenre }: GenreFilterProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const isInitialCenteringDone = useRef(false);

  const centerChip = useCallback(
    (genreId: number, animated: boolean = true) => {
      const layout = persistentLayouts[genreId];
      const container = scrollRef.current;
      if (layout && container) {
        const targetX = Math.max(0, layout.x - container.clientWidth / 2 + layout.width / 2);
        container.scrollTo({ left: targetX, behavior: animated ? 'smooth' : 'auto' });
        persistentScrollX = targetX;
      }
    },
    []
  );

  // Measure all chip layouts after mount / after data changes
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    chipRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      persistentLayouts[id] = { x: rect.left - containerRect.left, width: rect.width };
    });
    // Center the selected genre on initial render
    if (!isInitialCenteringDone.current) {
      isInitialCenteringDone.current = true;
      centerChip(selectedGenre, false);
    }
  }, [selectedGenre, centerChip]);

  // Magnetically center whenever selectedGenre changes
  useEffect(() => {
    centerChip(selectedGenre, true);
  }, [selectedGenre, centerChip]);

  // Restore persistent scroll offset on mount
  useEffect(() => {
    if (persistentScrollX > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ left: persistentScrollX, behavior: 'auto' });
    }
  }, []);

  const handleSelect = useCallback(
    (id: number) => {
      onSelectGenre(id);
      centerChip(id, true);
    },
    [onSelectGenre, centerChip]
  );

  const scrollGenres = useCallback(
    (direction: 'left' | 'right') => {
      const container = scrollRef.current;
      if (container) {
        const { scrollLeft, clientWidth } = container;
        const scrollAmount = clientWidth * 0.6;
        container.scrollTo({
          left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
          behavior: 'smooth',
        });
      }
    },
    []
  );

  return (
    <div className="genre-filter-container">
      <button
        type="button"
        className="genre-nav-btn prev-btn"
        onClick={() => scrollGenres('left')}
        aria-label="Scroll genres left"
        disabled={persistentScrollX <= 0}
      >
        <ChevronLeft size={18} />
      </button>

      <div className="genres-container" ref={scrollRef}>
        {GENRE_DATA.map((item) => (
          <GenreChipItem
            key={`genre-${item.id}`}
            ref={(el) => {
              if (el) chipRefs.current.set(item.id, el);
              else chipRefs.current.delete(item.id);
            }}
            item={item}
            isSelected={selectedGenre === item.id}
            onPress={() => handleSelect(item.id)}
          />
        ))}
      </div>

      <button
        type="button"
        className="genre-nav-btn next-btn"
        onClick={() => scrollGenres('right')}
        aria-label="Scroll genres right"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
});

export default GenreFilter;
