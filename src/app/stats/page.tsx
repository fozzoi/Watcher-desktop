"use client";

import PageLoading from '@/components/PageLoading';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  BarChart3, Film, Tv, Clock, Award, Flame, Bookmark, 
  Sparkles, CheckCircle2, TrendingUp, ArrowLeft, User, ChevronRight
} from 'lucide-react';
import { AsyncStorage } from '@/utils/storage';
import { 
  getStoredCastIndex, 
  calculateTopStarsFromHistory, 
  indexMissingHistoryCredits, 
  ActorStat 
} from '@/utils/castIndexer';

interface StatData {
  totalMovies: number;
  totalTv: number;
  totalRuntimeHours: number;
  topGenre: string;
  topGenresList: { name: string; count: number; percent: number }[];
  topActorsList: ActorStat[];
  watchlistSize: number;
  historySize: number;
  completionRate: number;
}

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [indexingProgress, setIndexingProgress] = useState<{ indexed: number; total: number } | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadStats();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadStats = async () => {
    try {
      const [hStr, wStr, aStr] = await Promise.all([
        AsyncStorage.getItem('history'),
        AsyncStorage.getItem('watchlist'),
        AsyncStorage.getItem('favoriteArtists'),
      ]);

      const history: any[] = hStr ? JSON.parse(hStr) : [];
      const watchlist: any[] = wStr ? JSON.parse(wStr) : [];
      const favoriteArtists: any[] = aStr ? JSON.parse(aStr) : [];

      let totalMovies = 0;
      let totalTv = 0;
      let totalRuntimeMinutes = 0;
      const genres: Record<string, number> = {};

      for (const item of history) {
        const isTv = item.media_type === 'tv' || item.first_air_date || item.lastSeason !== undefined;
        if (isTv) totalTv++;
        else totalMovies++;

        // Runtime estimate: movies ~110m, TV episode ~45m if not specified
        const runtime = item.runtime || (isTv ? 45 : 110);
        totalRuntimeMinutes += runtime;

        if (item.genres && Array.isArray(item.genres)) {
          item.genres.forEach((g: any) => {
            const name = typeof g === 'string' ? g : g.name;
            if (name) genres[name] = (genres[name] || 0) + 1;
          });
        }
      }

      const sortedGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]);
      const topGenre = sortedGenres[0]?.[0] || 'Eclectic';

      const totalGenreEntries = sortedGenres.reduce((acc, curr) => acc + curr[1], 0) || 1;
      const topGenresList = sortedGenres.slice(0, 6).map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / totalGenreEntries) * 100),
      }));

      // Immediate client-side calculation from local cache
      const castIndex = getStoredCastIndex();
      const { topActorsList: initialTopActors, missingItems } = calculateTopStarsFromHistory(history, castIndex, favoriteArtists);

      const totalItems = history.length + watchlist.length;
      const completionRate = totalItems > 0 ? Math.round((history.length / totalItems) * 100) : 0;

      if (!isMountedRef.current) return;

      setStats({
        totalMovies,
        totalTv,
        totalRuntimeHours: Math.round(totalRuntimeMinutes / 60),
        topGenre,
        topGenresList,
        topActorsList: initialTopActors,
        watchlistSize: watchlist.length,
        historySize: history.length,
        completionRate,
      });
      setLoading(false);

      // If any titles lack cast in local cache, resolve them progressively on client
      if (missingItems.length > 0) {
        const alreadyIndexed = history.length - missingItems.length;
        setIndexingProgress({ indexed: alreadyIndexed, total: history.length });

        indexMissingHistoryCredits(
          missingItems,
          history,
          (processed, totalMissing, updatedTopStars) => {
            if (!isMountedRef.current) return;
            setIndexingProgress({ indexed: alreadyIndexed + processed, total: history.length });
            setStats((prev) => prev ? { ...prev, topActorsList: updatedTopStars } : prev);
          },
          () => !isMountedRef.current,
          favoriteArtists
        ).then((finalTopStars) => {
          if (!isMountedRef.current) return;
          setIndexingProgress(null);
          setStats((prev) => prev ? { ...prev, topActorsList: finalTopStars } : prev);
        }).catch((err) => {
          console.warn('[Stats] Background credit resolution paused:', err);
          if (isMountedRef.current) setIndexingProgress(null);
        });
      }
    } catch (e) {
      console.error('Failed to load stats', e);
      if (isMountedRef.current) setLoading(false);
    }
  };

  if (loading) {
    return <PageLoading label="Loading statistics" />;
  }

  return (
    <div className="stats-page animate-fade-in-up">
      {/* Header */}
      <div className="stats-header">
        <div>
          <h1 className="page-title">
            <BarChart3 className="title-icon" size={28} />
            <span>Cinematic Stats</span>
          </h1>
          <p className="page-subtitle">Your viewing metrics, habits, and cinematic milestones</p>
        </div>
      </div>

      {stats && (
        <div className="stats-grid">
          {/* Main Key Metrics */}
          <div className="metrics-cards-row">
            <div className="metric-card glass">
              <div className="metric-icon-box" style={{ background: 'rgba(229, 9, 20, 0.15)', color: 'var(--primary)' }}>
                <Film size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-value">{stats.totalMovies}</span>
                <span className="metric-label">Movies Watched</span>
              </div>
            </div>

            <div className="metric-card glass">
              <div className="metric-icon-box" style={{ background: 'rgba(52, 199, 89, 0.15)', color: '#34c759' }}>
                <Tv size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-value">{stats.totalTv}</span>
                <span className="metric-label">TV Series Watched</span>
              </div>
            </div>

            <div className="metric-card glass">
              <div className="metric-icon-box" style={{ background: 'rgba(255, 159, 10, 0.15)', color: '#ff9f0a' }}>
                <Clock size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-value">{stats.totalRuntimeHours}h</span>
                <span className="metric-label">Total Watch Time (~{(stats.totalRuntimeHours / 24).toFixed(1)} days)</span>
              </div>
            </div>

            <div className="metric-card glass">
              <div className="metric-icon-box" style={{ background: 'rgba(175, 82, 222, 0.15)', color: '#af52de' }}>
                <Bookmark size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-value">{stats.watchlistSize}</span>
                <span className="metric-label">In Watchlist ({stats.completionRate}% Cleared)</span>
              </div>
            </div>
          </div>

          {/* Genre & Actor Breakdown */}
          <div className="breakdown-grid">
            {/* Top Genres */}
            <div className="breakdown-panel glass-premium">
              <div className="panel-title-row">
                <TrendingUp size={20} className="panel-icon" />
                <h3>Top Genres</h3>
              </div>

              {stats.topGenresList.length > 0 ? (
                <div className="genre-bars">
                  {stats.topGenresList.map((g) => (
                    <div key={g.name} className="genre-bar-item">
                      <div className="bar-label-row">
                        <span className="genre-name">{g.name}</span>
                        <span className="genre-count">{g.count} titles ({g.percent}%)</span>
                      </div>
                      <div className="progress-track">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${Math.max(8, g.percent)}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">Watch more titles to generate your genre breakdown.</p>
              )}
            </div>

            {/* Top Actors */}
            <div className="breakdown-panel glass-premium">
              <div className="panel-title-row flex items-center justify-between gap-3">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={20} className="panel-icon" />
                  <h3 className="text-lg font-bold">Most Watched Stars</h3>
                </div>
                {indexingProgress && (
                  <span className="indexing-badge">
                    <Sparkles size={12} className="indexing-sparkle" />
                    <span>Analyzing {indexingProgress.indexed} / {indexingProgress.total}</span>
                  </span>
                )}
              </div>

              {stats.topActorsList.length > 0 ? (
                <div className="actors-list flex flex-col gap-2.5">
                  {stats.topActorsList.map((a, i) => {
                    const href = a.id ? `/cast?id=${a.id}&name=${encodeURIComponent(a.name)}` : '#';
                    return (
                      <Link 
                        key={a.name} 
                        href={href} 
                        className="actor-rank-item glass group flex flex-row items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 hover:translate-x-1"
                      >
                        <span className={`rank-num shrink-0 w-7 text-center font-bold text-xs sm:text-sm ${
                          i === 0 ? 'text-amber-500 font-extrabold' :
                          i === 1 ? 'text-slate-400 font-extrabold' :
                          i === 2 ? 'text-amber-700 font-extrabold' :
                          'text-[var(--primary)]'
                        }`}>
                          #{i + 1}
                        </span>

                        {a.profile_path ? (
                          <img 
                            src={`https://image.tmdb.org/t/p/w185${a.profile_path}`} 
                            alt={a.name} 
                            className="actor-avatar w-10 h-10 rounded-full object-cover shrink-0 border border-[var(--card-border)] shadow-sm group-hover:scale-105 transition-transform" 
                            loading="lazy"
                          />
                        ) : (
                          <div className="actor-avatar-placeholder w-10 h-10 rounded-full bg-[var(--badge-bg)] border border-[var(--card-border)] flex items-center justify-center text-[var(--foreground-muted)] shrink-0">
                            <User size={16} />
                          </div>
                        )}

                        <span className="actor-rank-name flex-1 min-w-0 font-semibold text-sm sm:text-base text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
                          {a.name}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="actor-rank-count shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--badge-bg)] border border-[var(--badge-border)] text-[var(--foreground-muted)] group-hover:text-[var(--primary)] group-hover:border-[var(--primary)]/40 group-hover:bg-[var(--primary)]/10 transition-all">
                            {a.count} {a.count === 1 ? 'title' : 'titles'}
                          </span>
                          <ChevronRight size={15} className="text-[var(--foreground-muted)] group-hover:text-[var(--primary)] group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-text">
                  {indexingProgress 
                    ? `Scanning library credits (${indexingProgress.indexed}/${indexingProgress.total})...` 
                    : 'Detailed star tracking activates as your library expands.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .stats-page {
          max-width: 1200px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .page-title {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 28px;
          font-weight: 700;
        }
        .title-icon {
          color: var(--primary);
        }
        .page-subtitle {
          color: var(--foreground-muted);
          font-size: 14px;
          margin-top: 4px;
        }
        .stats-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .metrics-cards-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }
        .metric-card {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 22px 20px;
          border-radius: var(--border-radius-md);
        }
        .metric-icon-box {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .metric-data {
          display: flex;
          flex-direction: column;
        }
        .metric-value {
          font-size: 26px;
          font-weight: 700;
          color: var(--foreground);
        }
        .metric-label {
          font-size: 12px;
          color: var(--foreground-muted);
          margin-top: 2px;
        }
        .breakdown-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 800px) {
          .breakdown-grid {
            grid-template-columns: 1fr;
          }
        }
        .breakdown-panel {
          padding: 24px;
          border-radius: var(--border-radius-md);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .panel-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .panel-title-row h3 {
          font-size: 18px;
          font-weight: 600;
        }
        .panel-icon {
          color: var(--primary);
        }
        .genre-bars {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .genre-bar-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .bar-label-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }
        .genre-name {
          font-weight: 500;
          color: var(--foreground);
        }
        .genre-count {
          color: var(--foreground-muted);
        }
        .progress-track {
          height: 8px;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--primary-gradient);
          border-radius: 4px;
          transition: width 0.6s ease;
        }
        .indexing-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 9999px;
          background: rgba(var(--primary-rgb, 229, 9, 20), 0.12);
          color: var(--primary);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.2px;
          border: 1px solid rgba(var(--primary-rgb, 229, 9, 20), 0.2);
        }
        .indexing-sparkle {
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(0.92); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        .actors-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .actor-rank-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .actor-rank-item:hover {
          transform: translateX(4px);
          background: rgba(255, 255, 255, 0.08);
        }
        .actor-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.04);
        }
        .actor-avatar-placeholder {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--foreground-muted);
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .rank-num {
          font-weight: 700;
          color: var(--primary);
          font-size: 13px;
          width: 22px;
          flex-shrink: 0;
        }
        .actor-rank-name {
          flex: 1;
          font-weight: 600;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .actor-rank-count {
          color: var(--foreground-muted);
          font-size: 12px;
          font-weight: 500;
          flex-shrink: 0;
        }
        .empty-text {
          color: var(--foreground-muted);
          font-size: 13px;
          padding: 20px 0;
        }
      `}</style>
    </div>
  );
}
