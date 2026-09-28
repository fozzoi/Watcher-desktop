"use client";

import React, { useRef } from 'react';
import Link from 'next/link';
import { Play, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl } from '@/utils/tmdb';
import { WatchProgress } from '@/utils/progress';

interface WatchHistoryCarouselProps {
  history: WatchProgress[];
  onRemove: (tmdbId: number) => void;
}

export default function WatchHistoryCarousel({ history, onRemove }: WatchHistoryCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!history || history.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollAmount = clientWidth * 0.8;
      const targetScroll = direction === 'left' 
        ? scrollLeft - scrollAmount 
        : scrollLeft + scrollAmount;
      
      scrollContainerRef.current.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    if (date.toDateString() === today) return 'Today';
    if (date.toDateString() === yesterday) return 'Yesterday';
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  return (
    <div className="history-section animate-fade-in-up">
      <div className="history-header">
        <div className="title-row">
          <div className="accent-bar" />
          <h2 className="section-title">Continue Watching</h2>
        </div>
        <div className="header-actions">
          <div className="header-nav-arrows">
            <button className="header-arrow-btn" onClick={() => scroll('left')} aria-label="Scroll left">
              <ChevronLeft size={16} />
            </button>
            <button className="header-arrow-btn" onClick={() => scroll('right')} aria-label="Scroll right">
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="count-label">{history.length} titles</span>
        </div>
      </div>

      <div className="carousel-wrapper">
        <button className="nav-btn prev-btn" onClick={() => scroll('left')} aria-label="Scroll left">
          <ChevronLeft size={24} />
        </button>

        <div className="scroll-container" ref={scrollContainerRef}>
          {history.map((item) => {
            const isTV = item.mediaType === 'tv';
            const progressPct = item.duration > 0 ? Math.round((item.position / item.duration) * 100) : 0;
            const progress = progressPct > 0 ? progressPct : 15; // default fallback if no durations saved
            
            return (
              <div key={item.tmdbId} className="history-card">
                {/* Image & Hover Action Wrapper */}
                <div className="poster-container">
                  <img
                    src={getImageUrl(item.poster, 'w342')}
                    alt={item.title}
                    className="poster-img"
                    loading="lazy"
                  />
                  
                  {/* Badges */}
                  <div className="type-badge">{isTV ? 'TV' : 'FILM'}</div>
                  
                  {/* Remove action */}
                  <button 
                    className="remove-btn" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(item.tmdbId); }}
                    title="Remove from history"
                  >
                    <X size={12} />
                  </button>

                  {/* Frosted Play button overlay */}
                  <Link 
                    href={`/player?id=${item.tmdbId}&type=${item.mediaType}&title=${encodeURIComponent(item.title)}&season=${item.lastSeason}&episode=${item.lastEpisode}`}
                    className="play-overlay"
                  >
                    <div className="play-circle">
                      <Play size={16} fill="white" stroke="white" />
                    </div>
                  </Link>

                  {/* Progress bar */}
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Description info */}
                <Link href={`/detail?id=${item.tmdbId}&type=${item.mediaType}`} className="card-info">
                  <h3 className="card-title" title={item.title}>{item.title}</h3>
                  <div className="card-meta">
                    <div className="episode-badge">
                      {isTV ? `S${item.lastSeason} E${item.lastEpisode}` : 'Movie'}
                    </div>
                    <span className="date-text">{formatDate(item.updatedAt)}</span>
                  </div>
                  <span className="progress-label">{progress}% watched</span>
                </Link>
              </div>
            );
          })}
        </div>

        <button className="nav-btn next-btn" onClick={() => scroll('right')} aria-label="Scroll right">
          <ChevronRight size={24} />
        </button>
      </div>

      <style jsx>{`
        .history-section {
          margin-bottom: 35px;
          margin-top: 10px;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .accent-bar {
          width: 3px;
          height: 20px;
          border-radius: 2px;
          background-color: var(--primary);
          box-shadow: 0 0 8px var(--primary-glow);
        }

        .section-title {
          color: var(--foreground);
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .header-nav-arrows {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .header-arrow-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .header-arrow-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: #fff;
          transform: scale(1.05);
        }

        .count-label {
          color: var(--foreground-muted);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .carousel-wrapper {
          position: relative;
          margin: 0;
          width: 100%;
        }

        .scroll-container {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding: 6px 0 16px 0;
          scrollbar-width: none;
        }

        .scroll-container::-webkit-scrollbar {
          display: none;
        }

        .history-card {
          flex: 0 0 200px;
          background: var(--card-bg);
          border-radius: var(--border-radius-md);
          border: 1px solid var(--card-border);
          overflow: hidden;
          scroll-snap-align: start;
          transition: var(--transition-smooth);
          box-shadow: 0 2px 10px var(--shadow-color);
        }

        .history-card:hover {
          border-color: var(--card-hover-border);
          transform: translateY(-2px);
          box-shadow: 0 4px 16px var(--shadow-color);
        }

        .poster-container {
          position: relative;
          width: 100%;
          height: 125px;
          background: var(--card-bg);
          overflow: hidden;
        }

        .poster-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: var(--transition-smooth);
        }

        .history-card:hover .poster-img {
          scale: 1.05;
        }

        .type-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          border: 0.5px solid rgba(255, 255, 255, 0.15);
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 9px;
          font-weight: 800;
          color: #ccc;
          letter-spacing: 0.5px;
          z-index: 5;
        }

        .remove-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 0.5px solid rgba(255, 255, 255, 0.15);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          z-index: 10;
          transition: var(--transition-smooth);
        }

        .history-card:hover .remove-btn {
          opacity: 1;
        }

        .remove-btn:hover {
          background: rgba(229, 9, 20, 0.8);
          border-color: transparent;
        }

        @media (hover: none), (max-width: 768px) {
          .remove-btn {
            opacity: 1 !important;
          }
        }

        .play-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.8));
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: var(--transition-smooth);
          z-index: 4;
        }

        .history-card:hover .play-overlay {
          opacity: 1;
        }

        .play-circle {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-smooth);
        }

        .play-circle:hover {
          background: #fff;
          color: var(--primary);
          scale: 1.1;
        }

        .play-circle:hover :global(svg) {
          fill: var(--primary);
          stroke: var(--primary);
        }

        .progress-bar-track {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255, 255, 255, 0.15);
          z-index: 6;
        }

        .progress-bar-fill {
          height: 100%;
          background: var(--primary);
          box-shadow: 0 0 4px var(--primary);
        }

        .card-info {
          display: flex;
          flex-direction: column;
          padding: 12px;
          gap: 6px;
        }

        .card-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .card-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .episode-badge {
          background: rgba(255, 255, 255, 0.05);
          border: 0.5px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 700;
          color: var(--primary);
        }

        .date-text {
          font-size: 10px;
          color: var(--foreground-muted);
        }

        .progress-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.3);
          font-weight: 600;
        }

        .nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--card-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.85;
          box-shadow: 0 4px 18px var(--shadow-color);
          transition: all 0.2s ease-in-out;
          z-index: 10;
        }

        .carousel-wrapper:hover .nav-btn {
          opacity: 1;
        }

        .nav-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: #ffffff;
          box-shadow: 0 0 15px rgba(229, 9, 20, 0.6);
          transform: translateY(-50%) scale(1.1);
        }

        .prev-btn { left: 12px; }
        .next-btn { right: 12px; }

        @media (max-width: 768px) {
          .nav-btn,
          .header-nav-arrows { 
            display: none !important; 
          }
        }

        @media (max-width: 640px) {
          .carousel-wrapper {
            margin: 0;
          }

          .history-card {
            flex: 0 0 160px;
          }

          .scroll-container {
            gap: 12px;
            padding: 4px 0 14px 0;
          }

          .history-section {
            margin-bottom: 28px;
          }

          .section-title {
            font-size: 16px;
          }

          .card-title {
            font-size: 12px;
          }

          .card-info {
            padding: 8px;
            gap: 4px;
          }

          .poster-container {
            height: 100px;
          }
        }
      `}</style>
    </div>
  );
}
