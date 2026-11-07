"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Star, Heart, Play, Info } from 'lucide-react';
import { getImageUrl } from '@/utils/tmdb';

interface MovieCardProps {
  item: any;
  isAdded: boolean;
  toggleWatchlist: (item: any, e: React.MouseEvent) => void;
  showTitle?: boolean;
  enablePopout?: boolean;
}

function MovieCard({
  item,
  isAdded,
  toggleWatchlist,
  showTitle = false,
  enablePopout = true,
}: MovieCardProps) {
  if (!item?.poster_path) return null;

  const titleText = item.title || item.name || 'Untitled';
  const hasRating = typeof item.vote_average === 'number' && item.vote_average > 0;
  const rating = hasRating ? item.vote_average.toFixed(1) : null;
  const isTv = item.media_type === 'tv' || Boolean(item.first_air_date && !item.release_date);
  const mediaType = item.media_type || (isTv ? 'tv' : 'movie');
  const releaseYear = (item.release_date || item.first_air_date)?.substring(0, 4);

  // Pop-out Preview State & Refs
  const [mounted, setMounted] = useState(false);
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);
  const [popoutCoords, setPopoutCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  // Dismiss popout on window scroll to prevent trailing overlays
  useEffect(() => {
    if (!isPopoutOpen) return;
    const handleScroll = () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      setIsPopoutOpen(false);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isPopoutOpen]);

  const handleMouseEnter = useCallback(() => {
    if (!enablePopout) return;
    // Don't trigger hover popout on touch devices
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
      return;
    }

    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        const popoutWidth = Math.min(320, window.innerWidth - 32);

        let left = rect.left + rect.width / 2 - popoutWidth / 2;
        if (left < 16) left = 16;
        if (left + popoutWidth > window.innerWidth - 16) {
          left = window.innerWidth - 16 - popoutWidth;
        }

        let top = rect.top - 20;
        if (top < 16) top = 16;
        const estHeight = 360;
        if (top + estHeight > window.innerHeight - 16) {
          top = Math.max(16, window.innerHeight - 16 - estHeight);
        }

        setPopoutCoords({ top, left, width: popoutWidth });
        setIsPopoutOpen(true);
      }
    }, 800); // 800ms intentional hover delay matching streaming platforms
  }, [enablePopout]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setIsPopoutOpen(false);
    }, 260);
  }, []);

  const detailUrl = `/detail?id=${item.id}&type=${mediaType}`;
  const playerUrl = `/player?id=${item.id}&type=${mediaType}&title=${encodeURIComponent(titleText)}&poster=${encodeURIComponent(item.poster_path || '')}`;
  const backdropUrl = getImageUrl(item.backdrop_path || item.poster_path, 'w500');

  return (
    <div
      ref={cardRef}
      className="movie-card-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="image-wrapper">
        <Link 
          href={detailUrl} 
          className="movie-poster-link"
          aria-label={titleText}
        >
          <img
            src={getImageUrl(item.poster_path, 'w342')}
            alt={titleText}
            className="card-image"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
          
          {rating && (
            <div className="rating-overlay">
              <div className="rating-badge">
                <Star size={12} fill="#f59e0b" stroke="#f59e0b" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }} />
                <span>{rating}</span>
              </div>
            </div>
          )}
        </Link>

        {/* Watchlist Quick-Add Heart Button - Top Right of Poster */}
        <button
          type="button"
          className={`quick-add-btn ${isAdded ? 'added' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWatchlist(item, e);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={isAdded ? "Remove from watchlist" : "Add to watchlist"}
          title={isAdded ? "In Watchlist" : "Add to Watchlist"}
        >
          <Heart 
            size={18} 
            fill={isAdded ? "var(--primary)" : "none"} 
            color={isAdded ? "var(--primary)" : "#ffffff"} 
            strokeWidth={2.4} 
            style={{
              filter: isAdded 
                ? 'drop-shadow(0 2px 6px rgba(229, 9, 20, 0.75))' 
                : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.9))'
            }}
          />
        </button>
      </div>

      {showTitle && (
        <Link href={detailUrl} className="card-title-link">
          <h3 className="card-title" title={titleText}>
            {titleText}
          </h3>
        </Link>
      )}

      {/* Netflix/Disney+ Streaming Style Hover Pop-Out Card */}
      {mounted && isPopoutOpen && popoutCoords && createPortal(
        <div
          className="movie-popout-card"
          style={{
            position: 'fixed',
            top: popoutCoords.top,
            left: popoutCoords.left,
            width: popoutCoords.width,
            zIndex: 99999,
          }}
          onMouseEnter={() => {
            if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
          }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Popout Media Preview */}
          <div className="popout-media-box">
            <img
              src={backdropUrl}
              alt={titleText}
              className="popout-backdrop-img"
              loading="eager"
            />
            <div className="popout-gradient-overlay" />

            {rating && (
              <div className="popout-rating-chip">
                <Star size={11} fill="#fbbf24" color="#fbbf24" />
                <span>{rating}</span>
              </div>
            )}

            <Link href={playerUrl} className="popout-play-overlay" title={`Play ${titleText}`}>
              <div className="popout-play-bubble">
                <Play size={20} fill="#ffffff" color="#ffffff" style={{ marginLeft: 2 }} />
              </div>
            </Link>
          </div>

          {/* Popout Content & Full Description */}
          <div className="popout-body">
            <div className="popout-actions-row">
              <Link href={playerUrl} className="popout-action-primary" title="Watch Now">
                <Play size={14} fill="#000000" color="#000000" style={{ marginLeft: 1 }} />
                <span>Play</span>
              </Link>

              <button
                type="button"
                className={`popout-icon-btn ${isAdded ? 'saved' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleWatchlist(item, e);
                }}
                title={isAdded ? 'Remove from Watchlist' : 'Add to Watchlist'}
              >
                <Heart
                  size={16}
                  fill={isAdded ? 'var(--primary)' : 'none'}
                  color={isAdded ? 'var(--primary)' : '#ffffff'}
                />
              </button>

              <Link href={detailUrl} className="popout-icon-btn" title="View Full Details">
                <Info size={16} color="#ffffff" />
              </Link>
            </div>

            <Link href={detailUrl} className="popout-title-link">
              <h4 className="popout-title" title={titleText}>{titleText}</h4>
            </Link>

            <div className="popout-meta-row">
              {rating && (
                <span className="popout-badge rating">
                  <Star size={10} fill="#fbbf24" color="#fbbf24" />
                  <span>{rating}</span>
                </span>
              )}
              {releaseYear && <span className="popout-badge year">{releaseYear}</span>}
              <span className="popout-badge type">{isTv ? 'TV Series' : 'Movie'}</span>
              <span className="popout-badge quality">HD</span>
            </div>

            {item.overview && (
              <p className="popout-overview">
                {item.overview}
              </p>
            )}
          </div>
        </div>,
        document.body
      )}

      <style jsx>{`
        .movie-card-container {
          position: relative;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
          will-change: transform;
        }

        .movie-card-container:hover {
          transform: translateY(-4px);
        }

        .movie-card-container:active {
          transform: scale(0.98);
        }

        .image-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--card-border);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          transition: box-shadow 0.25s ease, border-color 0.25s ease;
        }

        :global([data-theme="light"]) .image-wrapper {
          border: 1px solid rgba(0, 0, 0, 0.09);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        }

        .movie-card-container:hover .image-wrapper {
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        }

        :global([data-theme="light"]) .movie-card-container:hover .image-wrapper {
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
          border-color: rgba(229, 9, 20, 0.4);
        }

        .movie-poster-link {
          display: block;
          width: 100%;
          height: 100%;
          position: relative;
          text-decoration: none;
        }

        .card-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          will-change: transform;
        }

        .movie-card-container:hover .card-image {
          transform: scale(1.04);
        }

        .quick-add-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 32px;
          height: 32px;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          padding: 0;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
        }

        .quick-add-btn:hover {
          transform: scale(1.25);
        }

        .quick-add-btn:active {
          transform: scale(0.88);
        }

        .quick-add-btn.added {
          opacity: 1 !important;
        }

        /* On Desktop: Fade in on hover when not added, always show when added */
        @media (hover: hover) {
          .quick-add-btn:not(.added) {
            opacity: 0;
          }

          .movie-card-container:hover .quick-add-btn {
            opacity: 1;
          }
        }

        /* On Touch / Small devices: ALWAYS visible */
        @media (hover: none), (max-width: 768px) {
          .quick-add-btn {
            opacity: 1 !important;
            top: 6px;
            right: 6px;
            width: 28px;
            height: 28px;
          }
        }

        .rating-overlay {
          position: absolute;
          bottom: 8px;
          left: 8px;
          z-index: 5;
          pointer-events: none;
        }

        .rating-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: none;
          box-shadow: none;
          padding: 0;
          font-size: 12px;
          font-weight: 700;
          color: #ffffff;
          filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.95));
          letter-spacing: 0.2px;
        }

        .card-title-link {
          text-decoration: none;
          color: inherit;
        }

        .card-title {
          font-size: 13.5px;
          font-weight: 600;
          line-height: 1.3;
          color: var(--foreground-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
          display: block;
          transition: var(--transition-smooth);
        }

        .movie-card-container:hover .card-title {
          color: var(--foreground);
        }

        @media (max-width: 640px) {
          .image-wrapper {
            border-radius: 12px;
          }

          .quick-add-btn {
            top: 6px;
            right: 6px;
            width: 28px;
            height: 28px;
          }

          .rating-overlay {
            bottom: 6px;
            left: 6px;
          }

          .rating-badge {
            font-size: 11px;
            gap: 3px;
          }

          .card-title {
            font-size: 11.5px;
          }
        }
      `}</style>
    </div>
  );
}

export default React.memo(MovieCard, (prev, next) => {
  return (
    prev.item?.id === next.item?.id &&
    prev.isAdded === next.isAdded &&
    prev.showTitle === next.showTitle &&
    prev.toggleWatchlist === next.toggleWatchlist
  );
});
