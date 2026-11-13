"use client";

import PageLoading from '@/components/PageLoading';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Film, Star, AlertCircle } from 'lucide-react';
import { getSimilarMedia, TMDBResult } from '@/utils/tmdb';
import { AsyncStorage } from '@/utils/storage';
import MovieCard from '@/components/MovieCard';

function SimilarMoviesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idStr = searchParams.get('id');
  const typeStr = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const nameStr = searchParams.get('name') || 'Media';
  const mediaId = Number(idStr);

  const [movies, setMovies] = useState<TMDBResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const loadUserData = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      if (stored) {
        const list = JSON.parse(stored);
        setSavedIds(new Set(list.map((i: any) => i.id)));
      }
    } catch {}
  }, []);

  const fetchMovies = useCallback(async (pageNum = 1) => {
    if (!mediaId) return;
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const results = await getSimilarMedia(mediaId, typeStr, pageNum);
      if (results.length === 0) {
        setHasMore(false);
      } else {
        if (pageNum === 1) setMovies(results);
        else setMovies(prev => [...prev, ...results]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mediaId, typeStr]);

  useEffect(() => {
    loadUserData();
    fetchMovies(1);
  }, [fetchMovies, loadUserData]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMovies(nextPage);
  };

  const toggleWatchlist = async (item: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const currentStr = await AsyncStorage.getItem('watchlist');
      let currentList = currentStr ? JSON.parse(currentStr) : [];
      const targetId = Number(item.id);
      if (currentList.some((i: any) => Number(i.id) === targetId)) {
        currentList = currentList.filter((i: any) => Number(i.id) !== targetId);
        setSavedIds(prev => {
          const n = new Set(prev);
          n.delete(targetId);
          return n;
        });
      } else {
        const itemToSave = {
          ...item,
          id: targetId,
          media_type: item.media_type || 'movie',
          added_at: Date.now(),
        };
        currentList = [itemToSave, ...currentList.filter((i: any) => Number(i.id) !== targetId)];
        setSavedIds(prev => new Set(prev).add(targetId));
      }
      await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <PageLoading label="Loading similar titles" />;
  }

  return (
    <div className="similar-page animate-fade-in-up">
      {/* Header */}
      <div className="similar-header">
        <button className="back-btn glass" onClick={() => router.back()}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className="title-group">
          <h1>Similar to "{nameStr}"</h1>
          <p>Curated recommendations sharing tone, theme, and style</p>
        </div>
      </div>

      {movies.length > 0 ? (
        <>
          <div className="media-grid">
            {movies.map((item) => (
              <MovieCard
                key={`${item.media_type || typeStr}-${item.id}`}
                item={{ ...item, media_type: item.media_type || typeStr }}
                isAdded={savedIds.has(item.id)}
                toggleWatchlist={toggleWatchlist}
              />
            ))}
          </div>

          {hasMore && (
            <div className="load-more-box">
              <button 
                className="btn-secondary" 
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading More...' : 'Load More Similar Titles'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <Film size={36} />
          <p>No similar titles found for "{nameStr}".</p>
          <button className="btn-secondary" onClick={() => router.back()}>Go Back</button>
        </div>
      )}

      <style jsx>{`
        .similar-page {
          max-width: 1300px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .similar-header {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--foreground);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          padding: 8px 16px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 500;
          transition: var(--transition-smooth);
        }
        .back-btn:hover {
          background: var(--sidebar-hover);
        }
        .title-group h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--foreground);
        }
        .title-group p {
          font-size: 13px;
          color: var(--foreground-muted);
          margin-top: 2px;
        }
        .load-more-box {
          display: flex;
          justify-content: center;
          margin-top: 20px;
        }
      `}</style>
    </div>
  );
}

export default function SimilarMoviesPage() {
  return <Suspense fallback={<PageLoading label="Loading similar titles" />}><SimilarMoviesContent /></Suspense>;
}
