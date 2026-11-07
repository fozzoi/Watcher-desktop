"use client";

import PageLoading from '@/components/PageLoading';
import React, { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Loader, 
  AlertTriangle, 
  SkipForward, 
  Server, 
  Maximize, 
  Minimize, 
  Volume2, 
  VolumeX, 
  RefreshCw,
  ChevronDown
} from 'lucide-react';
import Hls from 'hls.js';
import { getProgress, saveProgress } from '@/utils/progress';
import { getPlayerPreferences, savePlayerPreferences } from '@/utils/playerPreferences';
import { AsyncStorage } from '@/utils/storage';

const CREDIT_SKIP_WINDOW_SECONDS = 90;
const CREDIT_MIN_PROGRESS = 0.8;

type StreamServer = 'vidy' | 'vidlink' | 'vidsrc' | 'autoembed' | 'multiembed' | 'twoembed';

function PlayerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const idStr = searchParams.get('id');
  const typeStr = searchParams.get('type') || 'movie';
  const titleStr = searchParams.get('title') || 'Unknown Media';
  const seasonStr = searchParams.get('season');
  const episodeStr = searchParams.get('episode');
  const posterParam = searchParams.get('poster') || '';

  const tmdbId = Number(idStr);
  const isTv = typeStr === 'tv';
  const season = seasonStr ? Number(seasonStr) : 1;
  const episode = episodeStr ? Number(episodeStr) : 1;
  const nextEpisode = isTv ? episode + 1 : null;

  const [streamData, setStreamData] = useState<{ is_m3u8: boolean; stream_url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeServer, setActiveServer] = useState<StreamServer>('vidy');
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [activeProviderName, setActiveProviderName] = useState("Vidy.st");
  const [error, setError] = useState<string | null>(null);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [posterPath, setPosterPath] = useState(posterParam);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSavedPosRef = useRef(0);
  const lastDurationRef = useRef(0);
  const sessionStartTimeRef = useRef(Date.now());
  const hasTriggeredNextRef = useRef(false);

  // Load poster if not passed
  useEffect(() => {
    if (posterParam) return;
    const fetchPoster = async () => {
      try {
        const storedWatchlist = await AsyncStorage.getItem('watchlist');
        if (storedWatchlist) {
          const list = JSON.parse(storedWatchlist);
          const matched = list.find((i: any) => i.id === tmdbId);
          if (matched?.poster_path) setPosterPath(matched.poster_path);
        }
      } catch (e) {}
    };
    fetchPoster();
  }, [tmdbId, posterParam]);

  // Record initial watch session on mount so season & episode are registered
  useEffect(() => {
    if (!tmdbId) return;
    void saveProgress({
      tmdbId,
      mediaType: typeStr as 'movie' | 'tv',
      title: titleStr,
      poster: posterPath,
      lastSeason: season,
      lastEpisode: episode,
      position: 0,
      duration: 0,
      completed: false,
      updatedAt: Date.now()
    });
  }, [tmdbId, typeStr, titleStr, posterPath, season, episode]);

  // Fetch or construct stream URL based on active server
  useEffect(() => {
    if (!tmdbId) return;
    
    let isMounted = true;
    const loadStream = async () => {
      setLoading(true);
      setError(null);
      setShowNextEpisode(false);

      try {
        if (activeServer === 'vidsrc') {
        setActiveProviderName("VidSrc Cloud");
        const url = isTv 
          ? `https://vidsrc.pm/embed/tv/${tmdbId}/${season}/${episode}`
          : `https://vidsrc.pm/embed/movie/${tmdbId}`;
        setStreamData({ is_m3u8: false, stream_url: url });
        setLoading(false);
        return;
      }

      if (activeServer === 'vidy') {
        setActiveProviderName("Vidy.st");
        const savedProgress = await getProgress(tmdbId, typeStr as 'movie' | 'tv', season, episode);
        const savedSecs = Math.floor(savedProgress?.position || 0);
        const progressParam = savedSecs > 10 ? `&progress=${savedSecs}` : '';
        const defaultVidyUrl = isTv
          ? `https://www.vidy.st/tv/${tmdbId}/${season}/${episode}?color=E50914&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&autoplay=true&autoplay=1&autoPlay=true${progressParam}`
          : `https://www.vidy.st/movie/${tmdbId}?color=E50914&autoplay=true&autoplay=1&autoPlay=true${progressParam}`;
        setStreamData({ is_m3u8: false, stream_url: defaultVidyUrl });
        setLoading(false);
        return;
      }

      if (activeServer === 'twoembed') {
        setActiveProviderName("2Embed Player");
        const url = isTv 
          ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
          : `https://www.2embed.cc/embed/${tmdbId}`;
        setStreamData({ is_m3u8: false, stream_url: url });
        setLoading(false);
        return;
      }

      if (activeServer === 'multiembed') {
        setActiveProviderName("MultiEmbed Player");
        const url = isTv 
          ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
          : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
        setStreamData({ is_m3u8: false, stream_url: url });
        setLoading(false);
        return;
      }

      if (activeServer === 'autoembed') {
        setActiveProviderName("AutoEmbed Player");
        const url = isTv 
          ? `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
          : `https://player.autoembed.cc/embed/movie/${tmdbId}`;
        setStreamData({ is_m3u8: false, stream_url: url });
        setLoading(false);
        return;
      }

      if (activeServer === 'vidlink') {
        setActiveProviderName("VidLink Cloud");
        const url = isTv 
          ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
          : `https://vidlink.pro/movie/${tmdbId}`;
        setStreamData({ is_m3u8: false, stream_url: url });
        setLoading(false);
        return;
      }

      // Default fallback to Vidy
      setActiveProviderName("Vidy.st");
      const defaultVidyUrl = isTv
        ? `https://www.vidy.st/tv/${tmdbId}/${season}/${episode}?color=E50914&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&autoplay=true&autoplay=1&autoPlay=true`
        : `https://www.vidy.st/movie/${tmdbId}?color=E50914&autoplay=true&autoplay=1&autoPlay=true`;
      setStreamData({ is_m3u8: false, stream_url: defaultVidyUrl });
      setLoading(false);
      } catch (err: any) {
        if (isMounted) {
          const fallbackUrl = isTv 
            ? `https://vidsrc.pm/embed/tv/${tmdbId}/${season}/${episode}`
            : `https://vidsrc.pm/embed/movie/${tmdbId}`;
          setStreamData({ is_m3u8: false, stream_url: fallbackUrl });
          setActiveProviderName("VidSrc Cloud (Auto)");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStream();

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [tmdbId, typeStr, season, episode, titleStr, activeServer, isTv]);

  // Configure HLS.js player when direct HLS stream is resolved
  useEffect(() => {
    if (!streamData || !streamData.is_m3u8 || !videoRef.current) return;

    const video = videoRef.current;
    const url = streamData.stream_url;

    let hlsInstance: Hls | null = null;

    const initPlayer = async () => {
      const preferences = await getPlayerPreferences();
      const savedProgress = await getProgress(tmdbId);
      const initialPos = savedProgress?.position || 0;

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxMaxBufferLength: 40,
          enableWorker: true,
          lowLatencyMode: true
        });
        
        hlsRef.current = hls;
        hlsInstance = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (initialPos > 5) {
            video.currentTime = initialPos;
          }
          video.volume = preferences.volume ?? 1;
          video.muted = preferences.muted ?? false;

          // Set quality level if available
          if (preferences.quality === '1080p') {
            hls.currentLevel = 3;
          } else if (preferences.quality === '720p') {
            hls.currentLevel = 2;
          } else if (preferences.quality === '480p') {
            hls.currentLevel = 1;
          } else {
            hls.currentLevel = -1; // Auto
          }

          video.play().catch(e => console.log("Autoplay blocked:", e));
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                setError("Streaming playback error. Try switching servers.");
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          if (initialPos > 5) video.currentTime = initialPos;
          video.volume = preferences.volume ?? 1;
          video.muted = preferences.muted ?? false;
          video.play().catch(e => console.log("Autoplay blocked:", e));
        });
      } else {
        setError("HLS playback is not supported in this browser environment.");
      }
    };

    initPlayer();

    // Time update and credit-skip listener
    const handleTimeUpdate = () => {
      const pos = video.currentTime;
      const dur = video.duration;
      if (!dur || dur <= 0) return;

      lastSavedPosRef.current = pos;

      // Credit skip detection
      const remaining = dur - pos;
      const progress = pos / dur;
      if (isTv && nextEpisode && progress >= CREDIT_MIN_PROGRESS && remaining <= CREDIT_SKIP_WINDOW_SECONDS) {
        setShowNextEpisode(true);
      }
    };

    const handleVolumeChange = () => {
      savePlayerPreferences(undefined, {
        volume: video.volume,
        muted: video.muted
      }).catch(() => {});
    };

    const handleEnded = () => {
      saveProgress({
        tmdbId,
        mediaType: typeStr as 'movie' | 'tv',
        title: titleStr,
        poster: posterPath,
        lastSeason: season,
        lastEpisode: episode,
        position: video.duration || video.currentTime || 100,
        duration: video.duration || 100,
        completed: true,
        updatedAt: Date.now()
      });
      if (isTv && nextEpisode) {
        goToNextEpisode();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('ended', handleEnded);

    // Periodic progress saver (every 5 seconds)
    const interval = setInterval(() => {
      if (video.currentTime > 0 && video.duration > 0) {
        const dur = video.duration;
        const pos = video.currentTime;
        const isDone = dur > 0 && (pos / dur >= 0.9 || dur - pos <= 60);
        saveProgress({
          tmdbId,
          mediaType: typeStr as 'movie' | 'tv',
          title: titleStr,
          poster: posterPath,
          lastSeason: season,
          lastEpisode: episode,
          position: pos,
          duration: dur,
          completed: isDone,
          updatedAt: Date.now()
        });
      }
    }, 5000);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('ended', handleEnded);
      clearInterval(interval);
      if (hlsInstance) hlsInstance.destroy();
    };
  }, [streamData, tmdbId, typeStr, season, episode, titleStr, posterPath, isTv, nextEpisode]);

  // Listen to postMessage from embedded players (e.g. VidLink, Vidy, Vimeo, HTML5 embeds)
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const raw = event.data;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!data) return;

        let pos = 0;
        let dur = 0;
        let ended = false;

        // VidLink / Vidy format: { type: 'MEDIA_DATA', data: { currentTime, duration } } or direct currentTime / position
        if (data.type === 'MEDIA_DATA' && data.data) {
          pos = Number(data.data.currentTime ?? data.data.position) || 0;
          dur = Number(data.data.duration) || 0;
        } else if (data.currentTime !== undefined || data.position !== undefined) {
          pos = Number(data.currentTime ?? data.position) || 0;
          dur = Number(data.duration) || 0;
        } else if (data.data && (data.data.currentTime !== undefined || data.data.position !== undefined)) {
          pos = Number(data.data.currentTime ?? data.data.position) || 0;
          dur = Number(data.data.duration) || 0;
        }

        if (data.event === 'ended' || data.type === 'ended') {
          ended = true;
          if (isTv && nextEpisode && !hasTriggeredNextRef.current) {
            hasTriggeredNextRef.current = true;
            void goToNextEpisode();
            return;
          }
        }

        if (pos > 0) lastSavedPosRef.current = pos;
        if (dur > 0) lastDurationRef.current = dur;

        if (dur > 0 && (pos > 0 || ended)) {
          const isDone = ended || pos / dur >= 0.9 || (dur - pos <= 60 && pos >= 30);
          saveProgress({
            tmdbId,
            mediaType: typeStr as 'movie' | 'tv',
            title: titleStr,
            poster: posterPath,
            lastSeason: season,
            lastEpisode: episode,
            position: ended ? dur : pos,
            duration: dur,
            completed: isDone,
            updatedAt: Date.now()
          });
        }
      } catch {}
    };
    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [tmdbId, typeStr, season, episode, titleStr, posterPath, isTv, nextEpisode]);

  const flushProgress = useCallback(async () => {
    const videoPos = videoRef.current?.currentTime;
    const videoDur = videoRef.current?.duration;

    let pos = (videoPos && videoPos > 0)
      ? videoPos
      : (lastSavedPosRef.current > 0 ? lastSavedPosRef.current : 0);
    let dur = (videoDur && videoDur > 0)
      ? videoDur
      : (lastDurationRef.current > 0 ? lastDurationRef.current : 0);

    const elapsed = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
    if (pos === 0 && elapsed >= 10) {
      pos = elapsed;
      if (dur === 0) dur = isTv ? 2400 : 7200;
    }

    const isDone = dur > 0 && (pos / dur >= 0.85 || (dur - pos <= 90 && pos >= 30) || (elapsed >= (isTv ? 1200 : 3600)));

    await saveProgress({
      tmdbId,
      mediaType: typeStr as 'movie' | 'tv',
      title: titleStr,
      poster: posterPath,
      lastSeason: season,
      lastEpisode: episode,
      position: pos,
      duration: dur,
      completed: isDone,
      updatedAt: Date.now()
    });

    // Save to general history list
    try {
      const storedHistory = await AsyncStorage.getItem('history');
      let currentHistory = storedHistory ? JSON.parse(storedHistory) : [];
      currentHistory = currentHistory.filter((item: any) => item.id !== tmdbId);
      currentHistory.unshift({
        id: tmdbId,
        title: titleStr,
        media_type: typeStr,
        poster_path: posterPath,
        season,
        episode,
        timestamp: Date.now()
      });
      await AsyncStorage.setItem('history', JSON.stringify(currentHistory.slice(0, 100)));
    } catch (e) {}

    // Flush outbox to cloud sync server immediately
    try {
      const [token, rawUser] = await Promise.all([
        AsyncStorage.getItem('watcher_auth_token'),
        AsyncStorage.getItem('watcher_auth_user'),
      ]);
      const userId = rawUser ? JSON.parse(rawUser)?.userId : null;
      if (token && userId) {
        const { syncManager } = await import('@/utils/syncManager');
        void syncManager.flushOutbox(token, userId);
      }
    } catch {}
  }, [tmdbId, typeStr, titleStr, posterPath, season, episode, isTv]);

  // Window unload / pagehide listeners to flush progress on browser/Tauri navigation
  useEffect(() => {
    const handleUnload = () => {
      void flushProgress();
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      void flushProgress();
    };
  }, [flushProgress]);

  const handleExit = async () => {
    await flushProgress();
    router.replace(`/detail?id=${tmdbId}&type=${typeStr}`);
  };

  const goToNextEpisode = async () => {
    if (!nextEpisode) return;
    if (videoRef.current) {
      await saveProgress({
        tmdbId,
        mediaType: typeStr as 'movie' | 'tv',
        title: titleStr,
        poster: posterPath,
        lastSeason: season,
        lastEpisode: episode,
        position: videoRef.current.duration || 100,
        duration: videoRef.current.duration || 100,
        completed: true,
        updatedAt: Date.now()
      });
    }
    await flushProgress();
    if (hlsRef.current) hlsRef.current.destroy();
    router.replace(`/player?id=${tmdbId}&type=tv&title=${encodeURIComponent(titleStr)}&season=${season}&episode=${nextEpisode}&poster=${encodeURIComponent(posterPath)}`);
  };

  return (
    <div className="player-fullscreen-container">
      {/* Top Floating bar */}
      <div className="player-control-header">
        <div className="header-left-actions">
          <button className="exit-btn" onClick={handleExit} title="Exit player and return to media details">
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          {/* Server Switcher Dropdown */}
          <div className="server-switcher-container">
            <button 
              className="server-trigger-btn"
              onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
              title="Switch streaming server"
            >
              <Server size={14} />
              <span>{activeProviderName}</span>
              <ChevronDown size={14} />
            </button>

            {isServerMenuOpen && (
              <div className="server-dropdown glass-premium">
                <button 
                  className={activeServer === 'vidy' ? 'active' : ''}
                  onClick={() => { setActiveServer('vidy'); setIsServerMenuOpen(false); }}
                >
                  <span className="server-name">Vidy.st</span>
                  <span className="server-badge">Fast &amp; Clean</span>
                </button>
                <button 
                  className={activeServer === 'vidlink' ? 'active' : ''}
                  onClick={() => { setActiveServer('vidlink'); setIsServerMenuOpen(false); }}
                >
                  <span className="server-name">VidLink Cloud</span>
                  <span className="server-badge">Ultra HD</span>
                </button>
                <button 
                  className={activeServer === 'vidsrc' ? 'active' : ''}
                  onClick={() => { setActiveServer('vidsrc'); setIsServerMenuOpen(false); }}
                >
                  <span className="server-name">VidSrc Cloud</span>
                </button>
                <button 
                  className={activeServer === 'autoembed' ? 'active' : ''}
                  onClick={() => { setActiveServer('autoembed'); setIsServerMenuOpen(false); }}
                >
                  <span className="server-name">AutoEmbed</span>
                </button>
                <button 
                  className={activeServer === 'multiembed' ? 'active' : ''}
                  onClick={() => { setActiveServer('multiembed'); setIsServerMenuOpen(false); }}
                >
                  <span className="server-name">MultiEmbed</span>
                </button>
                <button 
                  className={activeServer === 'twoembed' ? 'active' : ''}
                  onClick={() => { setActiveServer('twoembed'); setIsServerMenuOpen(false); }}
                >
                  <span className="server-name">2Embed Player</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="media-info">
          <h3>{titleStr}</h3>
          {isTv && <span>Season {season}, Episode {episode}</span>}
        </div>
      </div>

      {/* Main player box */}
      <div className="video-player-frame">
        {loading ? (
          <div className="status-overlay">
            <Loader className="spinner" size={44} />
            <p>Connecting to {activeProviderName}...</p>
          </div>
        ) : error ? (
          <div className="status-overlay error">
            <AlertTriangle className="error-icon" size={48} />
            <h3>Playback Connection Failed</h3>
            <p>{error}</p>
            <div className="error-actions">
              <button className="btn-secondary" onClick={() => setActiveServer('vidsrc')}>
                Try VidSrc
              </button>
              <button className="btn-secondary" onClick={() => setActiveServer('vidy')}>
                Try Vidy.st
              </button>
              <button className="btn-secondary" onClick={() => setActiveServer('twoembed')}>
                Try 2Embed
              </button>
              <button className="btn-secondary" onClick={() => setActiveServer('multiembed')}>
                Try MultiEmbed
              </button>
              <button className="btn-secondary" onClick={() => setActiveServer('autoembed')}>
                Try AutoEmbed
              </button>
              <button className="btn-primary" onClick={handleExit}>
                Back to Details
              </button>
            </div>
          </div>
        ) : streamData ? (
          streamData.is_m3u8 ? (
            <video 
              ref={videoRef}
              className="html5-video-player"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <iframe 
              src={streamData.stream_url} 
              className="iframe-video-player"
              allowFullScreen
              referrerPolicy="origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            />
          )
        ) : null}

        {/* Next Episode Prompt Button (Near end of episode) */}
        {showNextEpisode && isTv && nextEpisode && (
          <button className="next-episode-floating-btn animate-fade-in-up" onClick={goToNextEpisode}>
            <span>Next Episode (S{season} E{nextEpisode})</span>
            <SkipForward size={18} />
          </button>
        )}
      </div>

      <style jsx global>{`
        /* Fullscreen isolation: hide layout sidebar & top bars when playing video */
        .layout-container {
          display: block !important;
        }
        .desktop-sidebar, .mobile-header, .mobile-bottom-tabs {
          display: none !important;
        }
        .main-content {
          margin-left: 0 !important;
          width: 100% !important;
          padding: 0 !important;
        }
      `}</style>

      <style jsx>{`
        .player-fullscreen-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: #000;
          z-index: 9999;
          display: flex;
          flex-direction: column;
        }

        .player-control-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 72px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 70%, transparent 100%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          z-index: 100;
          pointer-events: auto;
          transition: opacity 0.3s ease;
        }

        .header-left-actions {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .exit-btn {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 30px;
          color: var(--foreground);
          padding: 8px 18px;
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .exit-btn:hover {
          background: var(--primary-gradient);
          border-color: transparent;
          box-shadow: 0 0 12px var(--primary-glow);
        }

        .server-switcher-container {
          position: relative;
        }

        .server-trigger-btn {
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          color: var(--foreground);
          padding: 7px 14px;
          font-size: 12.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .server-trigger-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .server-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 8px;
          width: 245px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          z-index: 200;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          box-shadow: 0 12px 30px rgba(0,0,0,0.7);
          background: rgba(20, 20, 26, 0.82);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
        }

        .server-dropdown button {
          background: transparent;
          border: none;
          padding: 10px 14px;
          color: var(--foreground-muted);
          font-size: 12.5px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .server-dropdown button:hover {
          background: var(--sidebar-hover);
          color: var(--foreground);
        }

        .server-dropdown button.active {
          background: rgba(229, 9, 20, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--primary);
          font-weight: 700;
        }

        .server-badge {
          font-size: 10px;
          font-weight: 700;
          background: rgba(229, 9, 20, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #ff7676;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .media-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          color: var(--foreground);
          text-align: right;
        }

        .media-info h3 {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }

        .media-info span {
          font-size: 12px;
          color: var(--foreground-muted);
        }

        .video-player-frame {
          flex: 1;
          width: 100%;
          height: 100%;
          position: relative;
        }

        .html5-video-player {
          width: 100%;
          height: 100%;
          object-fit: contain;
          outline: none;
          background: #000;
        }

        .iframe-video-player {
          width: 100%;
          height: 100%;
          border: none;
          background: #000;
        }

        .next-episode-floating-btn {
          position: absolute;
          bottom: 36px;
          right: 36px;
          background: var(--primary-gradient);
          color: #fff;
          border: none;
          padding: 14px 24px;
          border-radius: 30px;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(229, 9, 20, 0.6);
          z-index: 150;
          transition: var(--transition-smooth);
        }

        .next-episode-floating-btn:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 10px 30px rgba(229, 9, 20, 0.8);
        }

        .status-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          z-index: 10;
          color: var(--foreground-muted);
        }

        .status-overlay.error {
          color: var(--foreground);
          padding: 24px;
          text-align: center;
        }

        .error-icon {
          color: var(--primary);
          margin-bottom: 8px;
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .status-overlay h3 {
          font-size: 19px;
          font-weight: 800;
        }

        .status-overlay p {
          font-size: 13.5px;
          max-width: 440px;
          line-height: 1.5;
        }

        .error-actions {
          display: flex;
          gap: 12px;
          margin-top: 14px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .spinner {
          animation: spin 1s linear infinite;
          color: var(--primary);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function PlayerPage() {
  return <Suspense fallback={<PageLoading label="Loading player" className="min-h-screen w-full bg-black" />}><PlayerContent /></Suspense>;
}
