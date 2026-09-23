"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Star, Heart, CheckCircle2, Bookmark, Film, 
  Calendar, Layers, Check, Plus, ExternalLink 
} from 'lucide-react';
import { 
  getCollectionDetails, 
  getImageUrl, 
  TMDBCollectionDetails, 
  TMDBResult 
} from '@/utils/tmdb';
import { AsyncStorage } from '@/utils/storage';

function CollectionDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idStr = searchParams.get('id');
  const collectionId = Number(idStr);

  const [collection, setCollection] = useState<TMDBCollectionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [historyIds, setHistoryIds] = useState<Set<number>>(new Set());
  const [isSavedCollection, setIsSavedCollection] = useState(false);

  const loadUserData = useCallback(async () => {
    try {
      const [wStr, hStr, cStr] = await Promise.all([
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('history'),
        AsyncStorage.getItem('savedCollections'),
      ]);
      if (wStr) {
        const list = JSON.parse(wStr);
        setWatchlistIds(new Set(list.map((i: any) => i.id)));
      }
      if (hStr) {
        const list = JSON.parse(hStr);
        setHistoryIds(new Set(list.map((i: any) => i.id)));
      }
      if (cStr) {
        const list = JSON.parse(cStr);
        setIsSavedCollection(list.some((c: any) => c.id === collectionId));
      }
    } catch {}
  }, [collectionId]);

  useEffect(() => {
    if (!collectionId) return;
    const fetchCollection = async () => {
      setLoading(true);
      try {
        const data = await getCollectionDetails(collectionId);
        if (data) {
          // Sort parts chronologically by release date
          data.parts.sort((a, b) => {
            const dateA = a.release_date || '9999';
            const dateB = b.release_date || '9999';
            return dateA.localeCompare(dateB);
          });
          setCollection(data);
        }
      } catch (err) {
        console.error('Failed to load collection:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCollection();
    loadUserData();
  }, [collectionId, loadUserData]);

  // Add all unadded franchise movies to watchlist
  const handleAddEntireFranchise = async () => {
    if (!collection || !collection.parts) return;
    try {
      const wStr = await AsyncStorage.getItem('watchlist');
      let currentList = wStr ? JSON.parse(wStr) : [];
      const currentIds = new Set(currentList.map((i: any) => i.id));
      
      let added = false;
      for (const part of collection.parts) {
        if (!currentIds.has(part.id)) {
          currentList.push({
            ...part,
            media_type: 'movie',
          });
          added = true;
        }
      }
      
      if (added) {
        await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
        setWatchlistIds(new Set(currentList.map((i: any) => i.id)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle saving the franchise itself
  const toggleSaveCollection = async () => {
    if (!collection) return;
    try {
      const cStr = await AsyncStorage.getItem('savedCollections');
      let list = cStr ? JSON.parse(cStr) : [];
      if (isSavedCollection) {
        list = list.filter((c: any) => c.id !== collection.id);
        setIsSavedCollection(false);
      } else {
        list.push({
          id: collection.id,
          name: collection.name,
          poster_path: collection.poster_path,
          backdrop_path: collection.backdrop_path,
          overview: collection.overview,
          parts_count: collection.parts.length,
        });
        setIsSavedCollection(true);
      }
      await AsyncStorage.setItem('savedCollections', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="empty-state">
        <Layers size={36} />
        <p>Franchise collection could not be found.</p>
        <button className="btn-secondary" onClick={() => router.back()}>Go Back</button>
      </div>
    );
  }

  const watchedCount = collection.parts.filter(p => historyIds.has(p.id)).length;
  const progressPercent = collection.parts.length > 0 
    ? Math.round((watchedCount / collection.parts.length) * 100) 
    : 0;

  return (
    <div className="collection-detail-page animate-fade-in-up">
      {/* Backdrop cover */}
      <div className="backdrop-header">
        <img 
          src={getImageUrl(collection.backdrop_path || collection.poster_path, 'original')} 
          alt={collection.name} 
          className="backdrop-img" 
        />
        <div className="backdrop-overlay" />
        
        <button className="back-btn glass" onClick={() => router.back()} title="Go Back">
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
      </div>

      {/* Main Collection Info */}
      <div className="collection-content-wrapper">
        <div className="collection-header-box glass-premium">
          <div className="collection-poster">
            <img 
              src={getImageUrl(collection.poster_path, 'w500')} 
              alt={collection.name} 
            />
          </div>

          <div className="collection-info">
            <div className="collection-badge-row">
              <span className="badge franchise">
                <Layers size={13} style={{ marginRight: 6 }} /> Franchise Collection
              </span>
              <span className="badge count">
                <Film size={13} style={{ marginRight: 6 }} /> {collection.parts.length} Films
              </span>
              {watchedCount > 0 && (
                <span className="badge watched-stat">
                  <CheckCircle2 size={13} style={{ marginRight: 6 }} /> {watchedCount}/{collection.parts.length} Watched ({progressPercent}%)
                </span>
              )}
            </div>

            <h1 className="collection-title">{collection.name}</h1>
            {collection.overview && (
              <p className="collection-overview">{collection.overview}</p>
            )}

            <div className="collection-actions">
              <button 
                className="btn-primary"
                onClick={handleAddEntireFranchise}
                title="Add all franchise titles to watchlist"
              >
                <Plus size={18} />
                <span>Add All to Watchlist</span>
              </button>

              <button 
                className={`btn-secondary ${isSavedCollection ? 'saved-active' : ''}`}
                onClick={toggleSaveCollection}
              >
                <Bookmark size={18} fill={isSavedCollection ? "var(--primary)" : "none"} />
                <span>{isSavedCollection ? 'Franchise Saved' : 'Save Franchise'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Chronological Movies List */}
        <div className="franchise-parts-section">
          <h2>Movies in Universe ({collection.parts.length})</h2>
          
          <div className="parts-list">
            {collection.parts.map((movie, index) => {
              const inWatchlist = watchlistIds.has(movie.id);
              const isWatched = historyIds.has(movie.id);
              const year = (movie.release_date || '').substring(0, 4);

              return (
                <Link 
                  key={movie.id} 
                  href={`/detail?id=${movie.id}&type=movie`}
                  className="part-card glass"
                >
                  <div className="part-index">#{index + 1}</div>
                  
                  <div className="part-poster">
                    <img 
                      src={getImageUrl(movie.poster_path, 'w300')} 
                      alt={movie.title} 
                      loading="lazy"
                    />
                  </div>

                  <div className="part-content">
                    <div className="part-header-line">
                      <h3 className="part-title">{movie.title}</h3>
                      <div className="part-meta-badges">
                        {year && (
                          <span className="part-badge">
                            <Calendar size={11} /> {year}
                          </span>
                        )}
                        {movie.vote_average ? (
                          <span className="part-badge rating">
                            <Star size={11} fill="gold" stroke="gold" /> {movie.vote_average.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <p className="part-overview">{movie.overview || "No overview available."}</p>

                    <div className="part-status-row">
                      {isWatched && (
                        <span className="status-pill watched">
                          <CheckCircle2 size={12} /> Watched
                        </span>
                      )}
                      {inWatchlist && (
                        <span className="status-pill in-watchlist">
                          <Bookmark size={12} /> In Watchlist
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .collection-detail-page {
          max-width: 1300px;
          margin: 0 auto;
        }
        .backdrop-header {
          position: relative;
          width: 100%;
          height: 320px;
          border-radius: var(--border-radius-lg);
          overflow: hidden;
          margin-bottom: -80px;
        }
        .backdrop-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .backdrop-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(12,12,14,0.2) 0%, rgba(12,12,14,0.95) 100%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        [data-theme="light"] .backdrop-overlay {
          background: linear-gradient(180deg, rgba(245, 245, 247, 0.1) 0%, rgba(245, 245, 247, 0.95) 100%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .back-btn {
          position: absolute;
          top: 20px;
          left: 20px;
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
          z-index: 10;
        }
        .back-btn:hover {
          background: var(--sidebar-hover);
        }
        .collection-content-wrapper {
          position: relative;
          z-index: 5;
          display: flex;
          flex-direction: column;
          gap: 34px;
        }
        .collection-header-box {
          display: flex;
          gap: 30px;
          padding: 30px;
          border-radius: var(--border-radius-lg);
        }
        @media (max-width: 768px) {
          .collection-header-box {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
        }
        .collection-poster {
          flex-shrink: 0;
          width: 200px;
          height: 290px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(0,0,0,0.6);
        }
        .collection-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .collection-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .collection-badge-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          background: var(--badge-bg);
          border: 1px solid var(--badge-border);
          padding: 6px 12px;
          border-radius: 10px;
          font-size: 13px;
          color: var(--foreground-muted);
        }
        .collection-title {
          font-size: 32px;
          font-weight: 700;
          color: var(--foreground);
        }
        .collection-overview {
          font-size: 14px;
          line-height: 1.7;
          color: var(--foreground-muted);
        }
        .collection-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: auto;
        }
        .franchise-parts-section h2 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 18px;
        }
        .parts-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .part-card {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 16px;
          border-radius: var(--border-radius-md);
          transition: var(--transition-smooth);
        }
        .part-card:hover {
          transform: translateY(-2px);
          border-color: var(--primary);
        }
        .part-index {
          font-size: 18px;
          font-weight: 700;
          color: var(--foreground-muted);
          width: 34px;
          text-align: center;
        }
        .part-poster {
          width: 70px;
          height: 100px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .part-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .part-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .part-header-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .part-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--foreground);
        }
        .part-meta-badges {
          display: flex;
          gap: 8px;
        }
        .part-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--foreground-muted);
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 4px 8px;
          border-radius: 6px;
        }
        .part-overview {
          font-size: 13px;
          line-height: 1.5;
          color: var(--foreground-muted);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .part-status-row {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
        }
        .status-pill.watched {
          background: rgba(48, 209, 88, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #30D158;
        }
        .status-pill.in-watchlist {
          background: rgba(229, 9, 20, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--primary);
        }
      `}</style>
    </div>
  );
}

export default function CollectionPage() {
  return (
    <Suspense fallback={
      <div className="loading-spinner-container">
        <div className="spinner" />
      </div>
    }>
      <CollectionDetailContent />
    </Suspense>
  );
}
