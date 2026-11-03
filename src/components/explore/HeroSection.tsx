"use client";

// src/components/explore/HeroSection.tsx
// Ported from the Watcher Expo app — advanced hero carousel with liquid indicator,
// swipe navigation, autoplay, smooth cross-fade transitions and backdrop blur.
// Adapted for Next.js/web.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Heart, Pause, Play as PlayIcon } from 'lucide-react';
import { getImageUrl, TMDBResult } from '@/utils/tmdb';

export interface HeroSectionProps {
  items: TMDBResult[];
  toggleWatchlist: (item: TMDBResult, e: React.MouseEvent) => void;
  isLoading?: boolean;
}

const MAX_SLIDES = 8;
const AUTOPLAY_MS = 5000;

const C = {
  base: '#0C0D0F',
  text: '#F5F5F5',
  muted: 'rgba(245,245,245,0.7)',
  accent: '#E50914',
  idle: 'rgba(245,245,245,0.3)',
  glass: 'rgba(255,255,255,0.14)',
};

const PAD = 22;
const RADIUS = 24;

// Liquid indicator geometry
const DOT = 6;
const PITCH = 18;
const ACTIVE_W = 18;
const BLOB_INSET = (PITCH - ACTIVE_W) / 2;
const HIT_H = 32;

// LiquidIndicator — CSS-driven active dot (web equivalent of Reanimated liquid blob)
const LiquidIndicator = memo(function LiquidIndicator({
  items,
  index,
  onSelect,
}: {
  items: TMDBResult[];
  index: number;
  onSelect: (i: number) => void;
}) {
  const blobX = index * PITCH + BLOB_INSET;
  return (
    <div className="liquid-indicator" style={{ width: items.length * PITCH }}>
      <div className="liquid-dot-row">
        {items.map((item, i) => (
          <button
            key={`${item.id}-${i}`}
            type="button"
            className={`liquid-dot-hit ${i === index ? 'active' : ''}`}
            onClick={() => onSelect(i)}
            aria-label={`Show ${item.title || item.name}`}
            aria-pressed={i === index}
          >
            <span className="liquid-dot" />
            {i === index && (
              <span className="liquid-blob" style={{ transform: `translateX(${blobX}px)` }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

// FilmLayer — individual hero slide with smooth cross-fade + scale
const FilmLayer = memo(function FilmLayer({
  item,
  active,
  shouldRender,
  width,
  height,
  onToggle,
  onPress,
}: {
  item: TMDBResult;
  active: boolean;
  shouldRender: boolean;
  width: number;
  height: number;
  onToggle: (item: TMDBResult, e: React.MouseEvent) => void;
  onPress: (item: TMDBResult) => void;
}) {
  if (!shouldRender && !active) return null;

  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
  const kind = item.media_type === 'tv' || item.first_air_date ? 'Series' : 'Film';
  const backdrop = item.backdrop_path || item.poster_path;
  const imageUrl = backdrop ? getImageUrl(backdrop, 'w1280') : null;

  return (
    <div
      className={`film-layer ${active ? 'active' : ''}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        opacity: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="film-image"
          loading="lazy"
          decoding="async"
          style={{
            transform: active ? 'scale(1)' : 'scale(1.08)',
            transition: active ? 'opacity 0.7s cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
          }}
        />
      )}

      <div className="film-gradient" />

      {/* Full-slide press area */}
      <button
        type="button"
        className="film-press"
        onClick={() => onPress(item)}
        aria-label={`Open ${title}`}
      />

      <div className="film-copy">
        <div className="film-title-row">
          <h3 className="film-title">{title}</h3>
          <button
            type="button"
            className={`hero-quick-add ${shouldRender ? 'show' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(item, e);
            }}
            aria-label={shouldRender ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Heart size={18} strokeWidth={2.4} />
          </button>
        </div>
        <div className="film-meta">
          {rating && (
            <div className="film-rating">
              <Star size={12} fill="#f59e0b" stroke="#f59e0b" strokeWidth={1.5} />
              <span>{rating}</span>
            </div>
          )}
          {year && <span className="film-meta-text">{year}</span>}
          <span className="film-meta-text">{kind}</span>
        </div>
      </div>
    </div>
  );
});

export default memo(function HeroSection({ items, toggleWatchlist, isLoading = false }: HeroSectionProps) {
  const router = useRouter();
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const width = Math.max(1, screenWidth - 32); // HORIZONTAL_MARGIN * 2
  const height = Math.round(screenWidth * 0.42); // responsive hero height

  const slides = useMemo(() => items.slice(0, MAX_SLIDES), [items]);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
  const paused = userPaused;
  const activeIndex = slides.length ? Math.min(index, slides.length - 1) : 0;

  useEffect(() => {
    setIndex((p) => Math.min(p, Math.max(0, slides.length - 1)));
  }, [slides.length]);

  // Autoplay loop
  useEffect(() => {
    if (!focusedRef.current || paused || reduceMotion || isLoading || slides.length < 2) return;
    intervalRef.current = setTimeout(() => {
      setIndex((p) => (p + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [focusedRef.current, paused, reduceMotion, isLoading, slides.length, index]);

  useEffect(() => {
    const onVis = () => { focusedRef.current = document.visibilityState === 'visible'; };
    const onBlur = () => { focusedRef.current = false; };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', () => { focusedRef.current = true; });
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', () => { focusedRef.current = true; });
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const move = useCallback((d: number) => {
    if (slides.length > 1) setIndex((p) => (p + d + slides.length) % slides.length);
  }, [slides.length]);

  const open = useCallback(
    (item: TMDBResult) => {
      const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
      router.push(`/detail?id=${item.id}&type=${mediaType}`);
    },
    [router]
  );

  if (isLoading) {
    return (
      <div className="hero-skeleton" style={{ width: `${width}px`, height: `${height}px` }} />
    );
  }
  if (!slides.length) return null;

  return (
    <div
      className="hero-root"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      {slides.map((item, i) => {
        const isNearby =
          Math.abs(i - activeIndex) <= 1 ||
          (activeIndex === 0 && i === slides.length - 1) ||
          (activeIndex === slides.length - 1 && i === 0);
        return (
          <FilmLayer
            key={`${item.media_type || 'movie'}-${item.id}`}
            item={item}
            active={i === activeIndex}
            shouldRender={isNearby}
            width={width}
            height={height}
            onToggle={toggleWatchlist}
            onPress={open}
          />
        );
      })}

      <div className="hero-controls">
        <div className="hero-indicator-slot">
          <LiquidIndicator items={slides} index={activeIndex} onSelect={setIndex} />
        </div>
        <button
          type="button"
          className={`hero-pause ${userPaused ? 'paused' : ''}`}
          onClick={() => setUserPaused((v) => !v)}
          aria-label={userPaused ? 'Resume autoplay' : 'Pause autoplay'}
        >
          {userPaused ? <PlayIcon size={14} /> : <Pause size={14} />}
        </button>
      </div>
    </div>
  );
});
