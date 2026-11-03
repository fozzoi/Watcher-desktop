"use client";

// src/components/explore/HeroSection.tsx
// Cinema-grade Hero Carousel for Watcher Web/Desktop.
// Driven by Trending Now endpoint with Ken Burns motion, rich metadata, CTA buttons, and liquid indicators.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Heart, Info, Star, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { getImageUrl, TMDBResult } from '@/utils/tmdb';
import SpecularButton from '@/components/SpecularButton';

export interface HeroSectionProps {
  items: TMDBResult[];
  savedIds?: Set<number>;
  toggleWatchlist: (item: TMDBResult, e: React.MouseEvent) => void;
  isLoading?: boolean;
}

const MAX_SLIDES = 8;
const AUTOPLAY_MS = 6000;

export default memo(function HeroSection({
  items,
  savedIds,
  toggleWatchlist,
  isLoading = false,
}: HeroSectionProps) {
  const router = useRouter();
  const slides = useMemo(() => items.slice(0, MAX_SLIDES), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Autoplay timer with pause on hover
  useEffect(() => {
    if (slides.length <= 1 || isHovered || isLoading) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, AUTOPLAY_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length, isHovered, isLoading]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const handlePlay = useCallback(
    (item: TMDBResult, e: React.MouseEvent) => {
      e.stopPropagation();
      const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
      const title = item.title || item.name || '';
      const poster = item.poster_path || item.backdrop_path || '';
      router.push(`/player?id=${item.id}&type=${mediaType}&title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}`);
    },
    [router]
  );

  const handleDetails = useCallback(
    (item: TMDBResult, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
      router.push(`/detail?id=${item.id}&type=${mediaType}`);
    },
    [router]
  );

  if (isLoading || !slides.length) {
    return <div className="hero-skeleton glass-card" />;
  }

  const currentItem = slides[activeIndex];
  const isSaved = currentItem?.id ? savedIds?.has(currentItem.id) : false;

  return (
    <div
      className="hero-container"
      onClick={() => currentItem && handleDetails(currentItem)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (currentItem) handleDetails(currentItem);
        }
      }}
    >
      {/* Background slide layers with smooth cross-fade */}
      <div className="hero-slides-wrapper">
        {slides.map((item, idx) => {
          const isActive = idx === activeIndex;
          const backdrop = item.backdrop_path || item.poster_path;
          const imageUrl = backdrop ? getImageUrl(backdrop, 'original') : null;

          return (
            <div
              key={`hero-slide-${item.id}`}
              className={`hero-slide ${isActive ? 'active' : ''}`}
              aria-hidden={!isActive}
              onClick={() => handleDetails(item)}
            >
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={item.title || item.name || 'Hero Banner'}
                  className="hero-backdrop-img"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Cinematic Vignette Overlays */}
      <div className="hero-vignette-left" />
      <div className="hero-vignette-bottom" />
      <div className="hero-vignette-top" />

      {/* Hero Content Panel (Left-aligned Cinema Presentation) */}
      {currentItem && (
        <div className="hero-content animate-fade-in-up" key={`content-${currentItem.id}`}>
          {/* Eyebrow Tag */}
          <div className="hero-eyebrow">
            <span className="hero-pulse-dot" />
            <Sparkles size={13} style={{ marginRight: 5 }} />
            <span>TRENDING TODAY</span>
          </div>

          {/* Title */}
          <h1 className="hero-title" title={currentItem.title || currentItem.name}>
            {currentItem.title || currentItem.name}
          </h1>

          {/* Meta Badges */}
          <div className="hero-meta-row">
            {currentItem.vote_average ? (
              <div className="hero-rating-badge">
                <Star size={13} fill="#f59e0b" stroke="#f59e0b" strokeWidth={1.5} />
                <span>{currentItem.vote_average.toFixed(1)}</span>
              </div>
            ) : null}

            <span className="hero-meta-pill">
              {(currentItem.release_date || currentItem.first_air_date || '').slice(0, 4) || '2026'}
            </span>

            <span className="hero-meta-pill">
              {currentItem.media_type === 'tv' || currentItem.first_air_date ? 'Series' : 'Film'}
            </span>

            <span className="hero-badge-tag">4K Ultra HD</span>
          </div>

          {/* Overview text snippet */}
          {currentItem.overview && (
            <p className="hero-overview">{currentItem.overview}</p>
          )}

          {/* Action CTAs */}
          <div className="hero-actions">
            <SpecularButton
              size="md"
              radius={12}
              tint="#e50914"
              tintOpacity={0.18}
              textColor="#ffffff"
              lineColor="#ff4d4d"
              baseColor="#991111"
              intensity={1.3}
              idleIntensity={0.45}
              shineSize={14}
              shineFade={30}
              thickness={1.4}
              glow={1.3}
              onClick={(e) => handlePlay(currentItem, e)}
            >
              <Play size={18} fill="currentColor" strokeWidth={0} />
              <span>Watch Now</span>
            </SpecularButton>

            <button
              type="button"
              className={`btn-hero-watchlist ${isSaved ? 'added' : ''}`}
              onClick={(e) => toggleWatchlist(currentItem, e)}
              aria-label={isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
            >
              <Heart
                size={18}
                fill={isSaved ? 'var(--primary)' : 'none'}
                stroke={isSaved ? 'var(--primary)' : '#ffffff'}
                strokeWidth={2.4}
              />
              <span>{isSaved ? 'In Watchlist' : 'Watchlist'}</span>
            </button>

            <button
              type="button"
              className="btn-hero-info"
              onClick={(e) => handleDetails(currentItem, e)}
            >
              <Info size={18} strokeWidth={2} />
              <span>Details</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Left/Right Arrow Nav */}
      <button
        type="button"
        className="hero-arrow-btn hero-arrow-left"
        onClick={handlePrev}
        aria-label="Previous slide"
      >
        <ChevronLeft size={22} />
      </button>

      <button
        type="button"
        className="hero-arrow-btn hero-arrow-right"
        onClick={handleNext}
        aria-label="Next slide"
      >
        <ChevronRight size={22} />
      </button>

      {/* Sleek Liquid Dots / Pills */}
      <div className="hero-dots-row">
        {slides.map((_, i) => (
          <button
            key={`dot-${i}`}
            type="button"
            className={`hero-dot ${i === activeIndex ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex(i);
            }}
            aria-label={`Jump to slide ${i + 1}`}
          />
        ))}
      </div>

      <style jsx>{`
        .hero-container {
          position: relative;
          width: 100%;
          height: 480px;
          border-radius: 24px;
          overflow: hidden;
          margin-bottom: 28px;
          background: #0a0a0c;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
          isolation: isolate;
          cursor: pointer;
        }

        .hero-skeleton {
          width: 100%;
          height: 480px;
          border-radius: 24px;
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.8s infinite;
          margin-bottom: 28px;
        }

        .hero-slides-wrapper {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .hero-slide {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.8s cubic-bezier(0.25, 1, 0.5, 1);
          cursor: pointer;
        }

        .hero-slide.active {
          opacity: 1;
          pointer-events: auto;
        }

        .hero-backdrop-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 20%;
          transform: scale(1.04);
          transition: transform 7s ease-out;
        }

        .hero-slide.active .hero-backdrop-img {
          transform: scale(1);
        }

        /* Cinema Vignettes */
        .hero-vignette-left {
          position: absolute;
          inset: 0;
          width: 75%;
          background: linear-gradient(
            90deg,
            rgba(10, 10, 14, 0.96) 0%,
            rgba(10, 10, 14, 0.88) 35%,
            rgba(10, 10, 14, 0.50) 65%,
            transparent 100%
          );
          pointer-events: none;
          z-index: 2;
        }

        .hero-vignette-bottom {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            0deg,
            rgba(10, 10, 14, 0.98) 0%,
            rgba(10, 10, 14, 0.45) 40%,
            transparent 75%
          );
          pointer-events: none;
          z-index: 2;
        }

        .hero-vignette-top {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 100px;
          background: linear-gradient(180deg, rgba(10, 10, 14, 0.55) 0%, transparent 100%);
          pointer-events: none;
          z-index: 2;
        }

        /* Content Presentation */
        .hero-content {
          position: absolute;
          left: 84px;
          bottom: 48px;
          max-width: 660px;
          z-index: 5;
          display: flex;
          flex-direction: column;
          gap: 15px;
          pointer-events: auto;
        }

        .hero-eyebrow {
          display: inline-flex;
          align-items: center;
          align-self: flex-start;
          padding: 6px 14px;
          border-radius: 999px;
          background: rgba(229, 9, 20, 0.16);
          border: 1px solid rgba(229, 9, 20, 0.35);
          color: #ff4d4d;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .hero-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ff4d4d;
          margin-right: 7px;
          box-shadow: 0 0 8px #ff4d4d;
          animation: pulse 1.8s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .hero-title {
          font-size: 42px;
          font-weight: 900;
          color: #ffffff;
          line-height: 1.18;
          letter-spacing: -0.8px;
          margin: 0;
          text-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .hero-meta-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hero-rating-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.18);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: #fbbf24;
          font-size: 13px;
          font-weight: 800;
        }

        .hero-meta-pill {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.85);
          background: rgba(255, 255, 255, 0.08);
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .hero-badge-tag {
          font-size: 11.5px;
          font-weight: 800;
          color: #94a3b8;
          background: rgba(148, 163, 184, 0.12);
          padding: 4px 9px;
          border-radius: 6px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          letter-spacing: 0.5px;
        }

        .hero-overview {
          font-size: 15px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.82);
          margin: 0;
          max-width: 640px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
        }

        /* Action Buttons */
        .hero-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 8px;
        }

        .btn-hero-play {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #e50914 0%, #b80610 100%);
          color: #ffffff;
          padding: 12px 26px;
          border-radius: 12px;
          font-size: 14.5px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(229, 9, 20, 0.45);
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .btn-hero-play:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 24px rgba(229, 9, 20, 0.6);
        }

        .btn-hero-watchlist,
        .btn-hero-info {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-hero-watchlist:hover,
        .btn-hero-info:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.35);
          transform: translateY(-2px);
        }

        .btn-hero-watchlist.added {
          border-color: rgba(229, 9, 20, 0.5);
          background: rgba(229, 9, 20, 0.15);
          color: #ff4d4d;
        }

        /* Arrows */
        .hero-arrow-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(10, 10, 12, 0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transition: all 0.25s ease;
          z-index: 10;
        }

        .hero-container:hover .hero-arrow-btn {
          opacity: 1;
          pointer-events: auto;
        }

        .hero-arrow-btn:hover {
          background: rgba(229, 9, 20, 0.85);
          border-color: #e50914;
          transform: translateY(-50%) scale(1.1);
        }

        .hero-arrow-left { left: 24px; }
        .hero-arrow-right { right: 24px; }

        /* Liquid indicator dots */
        .hero-dots-row {
          position: absolute;
          right: 48px;
          bottom: 48px;
          display: flex;
          align-items: center;
          gap: 9px;
          z-index: 10;
        }

        .hero-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.3);
          border: none;
          cursor: pointer;
          padding: 0;
          transition: all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .hero-dot:hover {
          background: rgba(255, 255, 255, 0.6);
        }

        .hero-dot.active {
          width: 26px;
          background: #e50914;
          box-shadow: 0 0 10px rgba(229, 9, 20, 0.8);
        }

        @media (max-width: 768px) {
          .hero-container {
            height: 380px;
            border-radius: 18px;
          }
          .hero-vignette-left {
            width: 100%;
            background: linear-gradient(
              180deg,
              transparent 0%,
              rgba(10, 10, 14, 0.3) 30%,
              rgba(10, 10, 14, 0.95) 85%,
              rgba(10, 10, 14, 1) 100%
            );
          }
          .hero-content {
            left: 18px;
            right: 18px;
            bottom: 22px;
            gap: 8px;
          }
          .hero-title {
            font-size: 24px;
            line-height: 1.2;
          }
          .hero-meta-row {
            gap: 8px;
          }
          .hero-overview {
            display: none !important;
          }
          .hero-actions {
            display: none !important; /* Hide Watch Now and Watchlist on mobile/phone */
          }
          .hero-arrow-btn {
            display: none !important;
          }
          .hero-dots-row {
            right: 18px;
            bottom: 22px;
          }
        }
      `}</style>
    </div>
  );
});
