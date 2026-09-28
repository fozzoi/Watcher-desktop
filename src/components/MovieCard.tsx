"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
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
    <motion.div 
      className="movie-card-container"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={{ y: -4, transition: { duration: 0.18, ease: "easeOut" } }}
      whileTap={{ scale: 0.98 }}
    >
      <Link href={`/detail?id=${item.id}&type=${mediaType}`} className="movie-card-link">
        <div className="image-wrapper">
          <img
            src={getImageUrl(item.poster_path, 'w342')}
            alt={titleText}
            className={`card-image ${imageLoaded ? 'loaded' : ''}`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onLoad={() => setImageLoaded(true)}
          />

          <motion.button
            type="button"
            className={`quick-add-btn ${isAdded ? 'added' : ''}`}
            onClick={(e) => toggleWatchlist(item, e)}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.88 }}
            aria-label={isAdded ? "Remove from watchlist" : "Add to watchlist"}
            title={isAdded ? "In Watchlist" : "Add to Watchlist"}
          >
            <Heart 
              size={18} 
              fill={isAdded ? "var(--primary)" : "none"} 
              color={isAdded ? "var(--primary)" : "#ffffff"} 
              strokeWidth={2.2} 
            />
          </motion.button>
          
          {rating && (
            <div className="rating-overlay">
              <div className="rating-badge">
                <Star size={12} fill="#f59e0b" stroke="#f59e0b" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }} />
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
          will-change: transform;
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
          background: rgba(255, 255, 255, 0.04);
          border: none;
          box-shadow: 0 4px 16px var(--shadow-color);
          transition: box-shadow 0.25s ease;
        }

        .movie-card-container:hover .image-wrapper {
          box-shadow: 0 8px 24px var(--shadow-color);
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
          border-radius: 50%;
          background: rgba(14, 14, 18, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
          transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .quick-add-btn:hover {
          background: rgba(14, 14, 18, 0.9);
          border-color: rgba(255, 255, 255, 0.4);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6);
        }

        .quick-add-btn.added {
          background: rgba(229, 9, 20, 0.25);
          border-color: var(--primary);
          color: var(--primary);
          box-shadow: 0 0 14px rgba(229, 9, 20, 0.55);
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
            width: 24px;
            height: 24px;
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
    </motion.div>
  );
}

export default React.memo(MovieCard);
