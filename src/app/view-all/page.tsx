"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Film, AlertCircle, Loader2 } from 'lucide-react';
import { fetchMoreContentByType, TMDBResult } from '@/utils/tmdb';
import { AsyncStorage } from '@/utils/storage';
import MovieCard from '@/components/MovieCard';

function ViewAllContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const title = searchParams.get('title') || 'View All';
  const type = searchParams.get('type') || '';

  const [items, setItems] = useState<TMDBResult[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Load watchlist IDs
  const loadUserData = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      if (stored) {
        const list = JSON.parse(stored);
        setSavedIds(new Set(list.map((i: any) => i.id)));
      }
    } catch (e) {}
  }, []);

  // Fetch initial content list
  const fetchContent = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    setPage(1);
    pageRef.current = 1;
    hasMoreRef.current = true;
    setHasMore(true);
    
    try {
      const results = await fetchMoreContentByType(type, 1);
      setItems(results);
      if (!results || results.length < 15) {
        setHasMore(false);
        hasMoreRef.current = false;
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadUserData();
    fetchContent();
  }, [fetchContent, loadUserData]);

  // Load more pages
  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !type) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    
    try {
      const results = await fetchMoreContentByType(type, nextPage);
      if (!results || results.length === 0) {
        setHasMore(false);
        hasMoreRef.current = false;
      } else {
        setItems(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const newUnique = results.filter(i => !existingIds.has(i.id));
          return [...prev, ...newUnique];
        });
        setPage(nextPage);
        pageRef.current = nextPage;
        if (results.length < 15) {
          setHasMore(false);
          hasMoreRef.current = false;
        }
      }
    } catch (err) {
      console.error("Pagination error:", err);
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [type]);

  // Auto infinite-scroll intersection observer
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreRef.current && !loadingMoreRef.current && !loading) {
          handleLoadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [handleLoadMore, loading]);

  // Toggle watchlist
  const toggleWatchlist = async (item: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const currentStr = await AsyncStorage.getItem('watchlist');
      let currentList = currentStr ? JSON.parse(currentStr) : [];
      
      if (currentList.find((i: any) => i.id === item.id)) {
        currentList = currentList.filter((i: any) => i.id !== item.id);
      } else {
        currentList.push(item);
      }
      
      await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
      setSavedIds(prev => {
        const n = new Set(prev);
        if (n.has(item.id)) n.delete(item.id);
        else n.add(item.id);
        return n;
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="viewall-container">
      {/* Header */}
      <div className="header-row animate-fade-in-up">
        <div className="title-section">
          <button className="back-btn" onClick={() => router.back()} title="Go Back">
            <ArrowLeft size={20} />
          </button>
          <Film className="header-icon" />
          <div>
            <h1 className="header-title">{title}</h1>
            <span className="header-subtitle">{items.length} titles available</span>
          </div>
        </div>
      </div>

      {/* Grid listing */}
      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner" />
        </div>
      ) : items.length > 0 ? (
        <div className="results-wrapper animate-fade-in-up">
          <div className="media-grid">
            {items.map((item, index) => (
              <MovieCard
                key={`${item.id}-${index}`}
                item={item}
                isAdded={savedIds.has(item.id)}
                toggleWatchlist={toggleWatchlist}
                showTitle={true}
              />
            ))}
          </div>
          
          {/* Sentinel element for infinite scroll */}
          <div ref={sentinelRef} style={{ height: '20px', margin: '20px 0' }} />

          {/* Load More Button / Indicator */}
          {hasMore && (
            <div className="load-more-container">
              <button 
                className="btn-secondary load-more-btn" 
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={16} className="spinner-inline" />
                    <span>Loading more titles...</span>
                  </>
                ) : (
                  <span>Load More</span>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state animate-fade-in-up">
          <AlertCircle size={40} className="empty-icon" />
          <h2>No items found</h2>
          <p>We couldn't retrieve any titles for this category.</p>
        </div>
      )}

      <style jsx>{`
        .viewall-container {
          max-width: 1300px;
          margin: 0 auto;
          padding-bottom: 60px;
        }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }

        .title-section {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .back-btn {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-radius: 50%;
          transition: var(--transition-smooth);
        }

        .back-btn:hover {
          color: var(--foreground);
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transform: translateX(-2px);
        }

        .header-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .header-title {
          font-size: 24px;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.3px;
        }

        .header-subtitle {
          font-size: 12.5px;
          color: var(--foreground-muted);
        }

        .media-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 20px;
        }

        .load-more-container {
          display: flex;
          justify-content: center;
          margin: 40px 0 20px;
        }

        .load-more-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 32px;
          font-size: 14px;
          font-weight: 700;
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .load-more-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .spinner-inline {
          animation: spin 1s linear infinite;
          color: var(--primary);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          padding: 100px 0;
        }

        .spinner {
          width: 44px;
          height: 44px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 20px;
          gap: 14px;
          color: var(--foreground-muted);
        }

        .empty-icon {
          opacity: 0.4;
          margin-bottom: 8px;
        }

        .empty-state h2 {
          font-size: 18px;
          font-weight: 700;
          color: var(--foreground);
        }

        .empty-state p {
          font-size: 13.5px;
        }
      `}</style>
    </div>
  );
}

export default function ViewAllPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
        <div className="spinner" />
      </div>
    }>
      <ViewAllContent />
    </Suspense>
  );
}
