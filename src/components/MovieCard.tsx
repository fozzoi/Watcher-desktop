"use client";

import React from 'react';
import Link from 'next/link';
import { Star, Heart } from 'lucide-react';
import { getImageUrl } from '@/utils/tmdb';

interface MovieCardProps {
  item: any;
  isAdded: boolean;
  toggleWatchlist: (item: any, e: React.MouseEvent) => void;
  showTitle?: boolean;
}

export default function MovieCard({ item, isAdded, toggleWatchlist, showTitle = false }: MovieCardProps) {
  if (!item.poster_path) return null;

  const titleText = item.title || item.name;
  const hasRating = typeof item.vote_average === 'number' && item.vote_average > 0;
  const rating = hasRating ? item.vote_average.toFixed(1) : null;
  const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');

  return (
    <div className="movie-card-container">
      <Link href={`/detail?id=${item.id}&type=${mediaType}`} className="movie-card-link">
        <div className="image-wrapper">
          <img
            src={getImageUrl(item.poster_path, 'w342')}
            alt={titleText}
            className="card-image"
            loading="lazy"
          />
          <button
            className={`quick-add-btn ${isAdded ? 'added' : ''}`}
            onClick={(e) => toggleWatchlist(item, e)}
            aria-label="Add to watchlist"
          >
            <Heart size={16} fill={isAdded ? "var(--primary)" : "none"} />
          </button>
          
          {rating && (
            <div className="rating-overlay">
              <div className="rating-badge">
                <Star size={10} fill="gold" stroke="gold" />
                <span>{rating}</span>
              </div>
            </div>
          )}
        </div>
        {showTitle && (
          <h3 className="card-title" title={titleText}>
            {titleText}
          </h3>
        )}
      </Link>

      <style jsx>{`
        .movie-card-container {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          transition: var(--transition-smooth);
        }

        .movie-card-container:hover {
          transform: translateY(-4px);
        }

        .movie-card-link {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          min-width: 0;
          text-decoration: none;
        }

        .image-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          background: #151518;
          border: 1px solid var(--card-border);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          transition: var(--transition-smooth);
        }

        .movie-card-container:hover .image-wrapper {
          border-color: var(--primary-glow);
          box-shadow: 0 6px 24px rgba(229, 9, 20, 0.15);
        }

        .card-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: var(--transition-smooth);
        }

        .movie-card-container:hover .card-image {
          scale: 1.05;
        }

        .quick-add-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          transition: var(--transition-smooth);
        }

        .quick-add-btn:hover {
          background: rgba(0, 0, 0, 0.85);
          scale: 1.1;
        }

        .quick-add-btn.added {
          color: var(--primary);
          border-color: rgba(229, 9, 20, 0.3);
        }

        .rating-overlay {
          position: absolute;
          bottom: 10px;
          left: 10px;
          z-index: 5;
        }

        .rating-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          padding: 4px 8px;
          border-radius: var(--border-radius-sm);
          font-size: 11px;
          font-weight: 700;
          color: var(--foreground);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
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
      `}</style>
    </div>
  );
}
