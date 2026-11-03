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
        style={{
          display: 'inline-flex',
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
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
    <div
      className="genre-filter-container"
      style={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        className="genre-nav-btn prev-btn"
        onClick={() => scrollGenres('left')}
        aria-label="Scroll genres left"
        disabled={persistentScrollX <= 0}
        style={{
          position: 'absolute',
          left: '4px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
        }}
      >
        <ChevronLeft size={18} />
      </button>

      <div
        className="genres-container"
        ref={scrollRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: '10px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          width: '100%',
          padding: '6px 44px 10px 44px',
          margin: 0,
        }}
      >
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
        style={{
          position: 'absolute',
          right: '4px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
        }}
      >
        <ChevronRight size={18} />
      </button>

      <style jsx>{`
        .genre-filter-container {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
        }

        .genres-container {
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: nowrap !important;
          align-items: center;
          gap: 10px;
          overflow-x: auto;
          scroll-behavior: smooth;
          padding: 6px 44px 10px 44px;
          margin: 0;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          width: 100%;
        }

        .genres-container::-webkit-scrollbar {
          display: none;
        }

        .genre-chip {
          display: inline-flex !important;
          flex-direction: row !important;
          align-items: center;
          gap: 8px;
          padding: 8px 15px;
          border-radius: 22px;
          border: 1px solid var(--card-border);
          background: var(--input-bg);
          color: var(--foreground);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.1px;
          cursor: pointer;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
          transition: all 0.2s ease;
        }

        .genre-chip:hover {
          background: var(--sidebar-hover);
          color: var(--foreground);
        }

        .genre-chip.active {
          background: var(--primary-gradient);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        .genre-chip-icon {
          display: inline-flex;
        }

        .genre-chip-text {
          font-weight: 500;
        }

        .genre-nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: all 0.2s ease;
        }

        .genre-nav-btn:hover {
          background: var(--sidebar-hover);
          transform: translateY(-50%) scale(1.1);
        }

        .genre-nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .genre-nav-btn.prev-btn {
          left: 4px;
        }

        .genre-nav-btn.next-btn {
          right: 4px;
        }
      `}</style>
    </div>
  );
});

export default GenreFilter;
