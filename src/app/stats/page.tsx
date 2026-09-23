"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BarChart3, Film, Tv, Clock, Award, Flame, Bookmark, 
  Sparkles, CheckCircle2, TrendingUp, ArrowLeft 
} from 'lucide-react';
import { AsyncStorage } from '@/utils/storage';

interface StatData {
  totalMovies: number;
  totalTv: number;
  totalRuntimeHours: number;
  topGenre: string;
  topGenresList: { name: string; count: number; percent: number }[];
  topActorsList: { name: string; count: number }[];
  watchlistSize: number;
  historySize: number;
  completionRate: number;
}

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [hStr, wStr] = await Promise.all([
        AsyncStorage.getItem('history'),
        AsyncStorage.getItem('watchlist'),
      ]);

      const history: any[] = hStr ? JSON.parse(hStr) : [];
      const watchlist: any[] = wStr ? JSON.parse(wStr) : [];

      let totalMovies = 0;
      let totalTv = 0;
      let totalRuntimeMinutes = 0;
      const genres: Record<string, number> = {};
      const actors: Record<string, number> = {};

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

        if (item.cast && Array.isArray(item.cast)) {
          item.cast.slice(0, 3).forEach((actor: any) => {
            if (actor?.name) actors[actor.name] = (actors[actor.name] || 0) + 1;
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

      const topActorsList = Object.entries(actors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const totalItems = history.length + watchlist.length;
      const completionRate = totalItems > 0 ? Math.round((history.length / totalItems) * 100) : 0;

      setStats({
        totalMovies,
        totalTv,
        totalRuntimeHours: Math.round(totalRuntimeMinutes / 60),
        topGenre,
        topGenresList,
        topActorsList,
        watchlistSize: watchlist.length,
        historySize: history.length,
        completionRate,
      });
    } catch (e) {
      console.error('Failed to load stats', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner-container">
        <div className="spinner" />
      </div>
    );
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
              <div className="panel-title-row">
                <Award size={20} className="panel-icon" />
                <h3>Most Watched Stars</h3>
              </div>

              {stats.topActorsList.length > 0 ? (
                <div className="actors-list">
                  {stats.topActorsList.map((a, i) => (
                    <div key={a.name} className="actor-rank-item glass">
                      <span className="rank-num">#{i + 1}</span>
                      <span className="actor-rank-name">{a.name}</span>
                      <span className="actor-rank-count">{a.count} films</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">Detailed star tracking activates as your library expands.</p>
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
        .actors-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .actor-rank-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          border-radius: 12px;
        }
        .rank-num {
          font-weight: 700;
          color: var(--primary);
          font-size: 14px;
          width: 24px;
        }
        .actor-rank-name {
          flex: 1;
          font-weight: 600;
          font-size: 14px;
        }
        .actor-rank-count {
          color: var(--foreground-muted);
          font-size: 12px;
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
