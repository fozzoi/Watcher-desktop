"use client";

import React, { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './MovieCard';

interface MediaCarouselProps {
  title: string;
  type?: string;
  data: any[];
  savedIds: Set<number>;
  toggleWatchlist: (item: any, e: React.MouseEvent) => void;
}

function MediaCarousel({ title, type, data, savedIds, toggleWatchlist }: MediaCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!data || data.length === 0) return null;

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

  return (
    <div className="carousel-section animate-fade-in-up">
      <div className="carousel-header">
        <h2 className="carousel-title">{title}</h2>
        <div className="header-actions">
          <div className="header-nav-arrows">
            <button className="header-arrow-btn" onClick={() => scroll('left')} aria-label="Scroll left">
              <ChevronLeft size={16} />
            </button>
            <button className="header-arrow-btn" onClick={() => scroll('right')} aria-label="Scroll right">
              <ChevronRight size={16} />
            </button>
          </div>
          <Link href={`/view-all?title=${encodeURIComponent(title)}&type=${type || ''}`} className="view-all-link">
            See All
          </Link>
        </div>
      </div>

      <div className="carousel-wrapper">
        <div className="scroll-container" ref={scrollContainerRef}>
          {data.map((item, index) => (
            <div key={`${item.id}-${index}`} className="scroll-item">
              <MovieCard
                item={item}
                isAdded={savedIds.has(item.id)}
                toggleWatchlist={toggleWatchlist}
                showTitle={false}
              />
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .carousel-section {
          margin-bottom: 35px;
          position: relative;
          content-visibility: auto;
          contain-intrinsic-size: 0 290px;
        }

        .carousel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 16px;
        }

        .carousel-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--foreground);
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

        .view-all-link {
          font-size: 13px;
          font-weight: 600;
          color: var(--primary);
          transition: var(--transition-smooth);
        }

        .view-all-link:hover {
          filter: brightness(1.2);
          text-decoration: underline;
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
          padding: 14px 8px 24px 8px;
          margin: -14px -8px -24px -8px;
          scrollbar-width: none; /* Firefox */
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
        }

        .scroll-container::-webkit-scrollbar {
          display: none; /* Chrome/Safari */
        }

        .scroll-item {
          flex: 0 0 160px;
          width: 160px;
          min-width: 160px;
          max-width: 160px;
          scroll-snap-align: start;
        }

        @media (min-width: 768px) {
          .scroll-item {
            flex: 0 0 180px;
            width: 180px;
            min-width: 180px;
            max-width: 180px;
          }
        }

        @media (max-width: 640px) {
          .carousel-wrapper {
            margin: 0;
          }

          .scroll-container {
            gap: 12px;
            padding: 4px 0 14px 0;
          }

          .scroll-item {
            flex: 0 0 135px;
            width: 135px;
            min-width: 135px;
            max-width: 135px;
          }

          .carousel-section {
            margin-bottom: 28px;
            contain-intrinsic-size: 0 240px;
          }

          .carousel-title {
            font-size: 17px;
          }

          .carousel-header {
            margin-bottom: 12px;
          }
        }

        @media (max-width: 768px) {
          .header-nav-arrows {
            display: none !important; /* touch scroll is preferred on small screens */
          }
        }
      `}</style>
    </div>
  );
}

export default React.memo(MediaCarousel);
