"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Star, Heart } from 'lucide-react';
import { getImageUrl } from '@/utils/tmdb';

interface MovieCardProps {
  item: any;
  isAdded: boolean;
  toggleWatchlist: (item: any, e: React.MouseEvent) => void;
  showTitle?: boolean;
}

function MovieCard({ item, isAdded, toggleWatchlist, showTitle = false }: MovieCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  if (!item.poster_path) return null;

  const titleText = item.title || item.name;
  const hasRating = typeof item.vote_average === 'number' && item.vote_average > 0;
  const rating = hasRating ? item.vote_average.toFixed(1) : null;
  const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');

  return (
    <div className="movie-card-container">
      <div className="image-wrapper">
        <Link 
          href={`/detail?id=${item.id}&type=${mediaType}`} 
          className="movie-poster-link"
          aria-label={titleText}
        >
          <img
            src={getImageUrl(item.poster_path, 'w342')}
            alt={titleText}
            className={`card-image ${imageLoaded ? 'loaded' : ''}`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onLoad={() => setImageLoaded(true)}
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
        <Link href={`/detail?id=${item.id}&type=${mediaType}`} className="card-title-link">
          <h3 className="card-title" title={titleText}>
            {titleText}
          </h3>
        </Link>
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
          transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
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
          box-shadow: 0 4px 16px var(--shadow-color);
          transition: box-shadow 0.25s ease;
        }

        .movie-card-container:hover .image-wrapper {
          box-shadow: 0 8px 24px var(--shadow-color);
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
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          will-change: opacity, transform;
        }

        .card-image.loaded {
          opacity: 1;
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

export default React.memo(MovieCard);
