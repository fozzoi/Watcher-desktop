"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Play, Heart } from 'lucide-react';
import { getImageUrl, TMDBResult } from '@/utils/tmdb';

interface HeroSectionProps {
  heroList: TMDBResult[];
  savedIds: Set<number>;
  toggleWatchlist: (item: TMDBResult, e: React.MouseEvent) => void;
}

function HeroSection({ heroList, savedIds, toggleWatchlist }: HeroSectionProps) {
  const router = useRouter();
  const [heroIndex, setHeroIndex] = useState(0);
  const heroIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const displayList = heroList.slice(0, 6);
  const currentHeroMovie = displayList[heroIndex] || displayList[0];

  useEffect(() => {
    if (displayList.length <= 1) return;

    if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    heroIntervalRef.current = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % displayList.length);
    }, 6000);

    return () => {
      if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    };
  }, [displayList.length]);

  if (!currentHeroMovie) return null;

  const isSaved = savedIds.has(currentHeroMovie.id);
  const mediaType = currentHeroMovie.media_type || (currentHeroMovie.first_air_date ? 'tv' : 'movie');
  const title = currentHeroMovie.title || currentHeroMovie.name || 'Featured Title';
  const rating = currentHeroMovie.vote_average ? currentHeroMovie.vote_average.toFixed(1) : null;
  const year = (currentHeroMovie.release_date || currentHeroMovie.first_air_date || '').substring(0, 4);

  return (
    <div className="hero-section glass-premium animate-fade-in-up">
      <div className="hero-banner-wrapper">
        <img
          key={currentHeroMovie.id}
          src={getImageUrl(currentHeroMovie.backdrop_path || currentHeroMovie.poster_path, 'w1280')}
          alt={title}
          className="hero-backdrop"
          decoding="async"
          fetchPriority="high"
        />
        <div className="hero-gradient-overlay" />
      </div>

      <div className="hero-content">
        <h1 className="hero-title">{title}</h1>

        <div className="hero-meta">
          {rating && (
            <div className="hero-rating">
              <Star size={15} fill="#f59e0b" stroke="#f59e0b" />
              <span>{rating}</span>
            </div>
          )}
          {year && <span className="hero-year">{year}</span>}
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => router.push(`/detail?id=${currentHeroMovie.id}&type=${mediaType}`)}
          >
            <Play size={18} fill="white" />
            <span>View Details</span>
          </button>

          <button
            type="button"
            className="btn-secondary hero-btn"
            onClick={(e) => toggleWatchlist(currentHeroMovie, e)}
          >
            <Heart
              size={18}
              fill={isSaved ? "var(--primary)" : "none"}
              color={isSaved ? "var(--primary)" : "currentColor"}
            />
            <span>{isSaved ? 'In Watchlist' : 'Add Watchlist'}</span>
          </button>
        </div>
      </div>

      {displayList.length > 1 && (
        <div className="hero-indicators">
          {displayList.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setHeroIndex(idx)}
              className={`indicator-dot ${heroIndex === idx ? 'active' : ''}`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .hero-section {
          position: relative;
          width: 100%;
          height: 440px;
          border-radius: var(--border-radius-lg);
          overflow: hidden;
          margin-bottom: 40px;
          display: flex;
          align-items: flex-end;
          padding: 40px;
          contain: paint;
        }

        .hero-banner-wrapper {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .hero-backdrop {
          width: 100%;
          height: 100%;
          object-fit: cover;
          animation: heroFadeIn 0.5s ease-out;
          will-change: opacity;
        }

        @keyframes heroFadeIn {
          from {
            opacity: 0.6;
          }
          to {
            opacity: 1;
          }
        }

        .hero-gradient-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(0deg, rgba(12, 12, 14, 0.95) 0%, rgba(12, 12, 14, 0.45) 50%, rgba(12, 12, 14, 0.15) 100%),
                      linear-gradient(90deg, rgba(12, 12, 14, 0.85) 0%, rgba(12, 12, 14, 0.2) 65%, transparent 100%);
          pointer-events: none;
        }

        .hero-content {
          position: relative;
          z-index: 2;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .hero-title {
          font-size: 44px;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.5px;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
        }

        .hero-meta {
          display: flex;
          align-items: center;
          gap: 14px;
          font-size: 14px;
        }

        .hero-rating {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.6);
          padding: 4px 10px;
          border-radius: 9999px;
          color: #ffffff;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .hero-year {
          color: rgba(255, 255, 255, 0.8);
          font-weight: 600;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 6px;
        }

        .hero-btn {
          background: rgba(255, 255, 255, 0.12);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .hero-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .hero-indicators {
          position: absolute;
          bottom: 24px;
          right: 30px;
          display: flex;
          gap: 8px;
          z-index: 2;
        }

        .indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.35);
          border: none;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .indicator-dot.active {
          background: var(--primary);
          width: 24px;
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .hero-section {
            height: 380px;
            padding: 24px;
            margin-bottom: 24px;
          }

          .hero-title {
            font-size: 28px;
          }

          .hero-indicators {
            bottom: 16px;
            right: 16px;
          }
        }
      `}</style>
    </div>
  );
}

export default React.memo(HeroSection);
