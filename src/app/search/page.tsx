"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Magnet, Share2, ArrowUp, ArrowDown, History, Film, AlertCircle, CheckCircle2 } from 'lucide-react';
import { searchTorrents, TorrentResult } from '@/utils/Scraper';
import { AsyncStorage } from '@/utils/storage';

function TorrentSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Prefill query from URL if passed (e.g. from Detail page click "Search Torrents")
  useEffect(() => {
    const prefill = searchParams.get('prefillQuery');
    if (prefill) {
      setSearchQuery(prefill);
      handleSearch(prefill);
    }
  }, [searchParams]);

  // Clean parameters on unmount or query reset
  const handleClear = () => {
    setSearchQuery("");
    setResults([]);
    setHasSearched(false);
    setShowMore(false);
    router.replace('/search');
  };

  const getQualityInfo = (name: string): { label: string; color: string } => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('2160p') || lowerName.includes('4k')) return { label: '4K', color: '#00ff08' };
    if (lowerName.includes('1080p')) return { label: '1080p', color: '#00d5ff' };
    if (lowerName.includes('720p')) return { label: '720p', color: '#ffaa00' };
    return { label: 'SD', color: '#888' };
  };

  const handleSearch = async (queryToSearch: string = searchQuery) => {
    if (!queryToSearch.trim()) return;
    
    setHasSearched(true);
    setLoading(true);
    setResults([]);
    setStatusMessage(null);
    
    // Save to history
    try {
      const jsonValue = await AsyncStorage.getItem("searchHistory");
      let currentHistory = jsonValue ? JSON.parse(jsonValue) : [];
      currentHistory = currentHistory.filter((item: any) => item.query.toLowerCase() !== queryToSearch.trim().toLowerCase());
      currentHistory.push({ query: queryToSearch.trim(), date: new Date().toISOString() });
      await AsyncStorage.setItem("searchHistory", JSON.stringify(currentHistory));
    } catch (e) {
      console.error("History save error:", e);
    }

    try {
      const scrapedResults = await searchTorrents(queryToSearch);
      setResults(scrapedResults);
    } catch (error) {
      console.error(error);
      setStatusMessage({ text: "Failed to fetch search results.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Download torrent file from backend cache
  const handleDownloadTorrent = async (item: TorrentResult) => {
    // Extract hash from magnet
    const match = item.url.match(/urn:btih:([a-fA-F0-9]{40})/i);
    if (!match) {
      setStatusMessage({ text: "No valid hash found in magnet link.", type: "error" });
      return;
    }
    
    const hash = match[1].toUpperCase();
    setDownloadingHash(hash);
    setStatusMessage({ text: `Requesting torrent from cache...`, type: "info" });

    try {
      const downloadUrl = `https://watcher-api-rho.vercel.app/api/torrent-file?hash=${hash}`;
      const response = await fetch(downloadUrl);
      
      if (response.status !== 200) {
        throw new Error("Torrent not in cache");
      }
      
      const blob = await response.blob();
      
      if (blob.size < 40) {
        throw new Error("Invalid file content");
      }

      // Trigger browser file download
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = `${item.name.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.torrent`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      setStatusMessage({ text: "Torrent file downloaded successfully!", type: "success" });
    } catch (error) {
      console.error(error);
      setStatusMessage({ 
        text: "This torrent isn't cached yet. Use 'Open Magnet' instead to stream directly.", 
        type: "error" 
      });
    } finally {
      setDownloadingHash(null);
    }
  };

  const visibleResults = showMore ? results : results.slice(0, 8);

  return (
    <div className="search-container">
      {/* Header section */}
      <div className="header-row animate-fade-in-up">
        <div className="title-section">
          <Magnet className="header-icon" />
          <h1 className="header-title">Torrent Search</h1>
        </div>
        <button 
          className="history-pill"
          onClick={() => router.push('/history')}
        >
          <History size={15} />
          <span>Search History</span>
        </button>
      </div>

      {/* Input section */}
      <div className="search-input-wrapper animate-fade-in-up">
        <span className="search-icon-wrapper">
          <Search size={20} />
        </span>
        <input
          type="text"
          placeholder="Search movies, shows, anime torrents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          className="search-input-field"
        />
        {searchQuery.length > 0 && (
          <button className="clear-btn" onClick={handleClear} aria-label="Clear input">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Dynamic Status Banner */}
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type} animate-fade-in-up`}>
          {statusMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{statusMessage.text}</span>
          <button className="banner-close" onClick={() => setStatusMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Results panel */}
      {hasSearched && (
        <div className="results-panel animate-fade-in-up">
          <h2 className="results-header-title">
            {loading ? 'Scanning sources...' : `Found ${results.length} torrents`}
          </h2>

          {loading ? (
            <div className="loader-container">
              <div className="spinner" />
              <p className="loading-text">Crawling indexers & scraping proxy sources...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="results-list">
              {visibleResults.map((item, index) => {
                const quality = getQualityInfo(item.name);
                const isDownloading = downloadingHash === item.url.match(/urn:btih:([a-fA-F0-9]{40})/i)?.[1]?.toUpperCase();
                
                let healthColor = '#EF4444'; 
                if (item.seeds > 50) healthColor = '#22C55E'; 
                else if (item.seeds > 10) healthColor = '#EAB308';

                return (
                  <div key={item.id || index} className="torrent-card glass">
                    <div className="card-top">
                      <div className="video-icon-box">
                        <Film size={22} className="card-video-icon" />
                      </div>
                      <div className="card-details">
                        <h3 className="torrent-name" title={item.name}>{item.name}</h3>
                        <div className="tags-row">
                          <span className="tag quality" style={{ borderColor: quality.color, color: quality.color }}>
                            {quality.label}
                          </span>
                          <span className="tag size">{item.size}</span>
                          <span className="tag source">{item.source}</span>
                        </div>
                        <div className="seeds-peers-row">
                          <span className="seed-badge" style={{ color: healthColor }}>
                            <ArrowUp size={12} />
                            <strong>{item.seeds} Seeds</strong>
                          </span>
                          <span className="peer-badge">
                            <ArrowDown size={12} />
                            {item.peers} Peers
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button 
                        className="share-file-btn" 
                        onClick={() => handleDownloadTorrent(item)}
                        disabled={isDownloading}
                        title="Download torrent file"
                      >
                        {isDownloading ? (
                          <div className="small-spinner" />
                        ) : (
                          <>
                            <Share2 size={16} />
                            <span>Download .torrent</span>
                          </>
                        )}
                      </button>

                      <a 
                        href={item.url}
                        className="open-magnet-btn"
                        title="Open magnet link in client"
                      >
                        <Magnet size={16} />
                        <span>Open Magnet</span>
                      </a>
                    </div>
                  </div>
                );
              })}

              {results.length > 8 && (
                <button className="see-more-btn" onClick={() => setShowMore(!showMore)}>
                  {showMore ? 'Show Less' : 'Show More Results'}
                </button>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <AlertCircle size={32} className="empty-icon" />
              <p>No results found. Try adjusting your query words.</p>
            </div>
          )}
        </div>
      )}

      {/* Landing display if idle */}
      {!hasSearched && (
        <div className="idle-splash animate-fade-in-up">
          <Magnet size={56} className="splash-icon" />
          <h2>Hybrid Torrent Client</h2>
          <p>Scrape real-time movie/series magnets instantly and download .torrent files.</p>
        </div>
      )}

      <style jsx>{`
        .search-container {
          max-width: 800px;
          margin: 0 auto;
        }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .title-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .header-title {
          font-size: 24px;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: 0.5px;
        }

        .history-pill {
          background: var(--badge-bg);
          border: 1px solid var(--card-border);
          border-radius: 12px;
          padding: 8px 16px;
          color: var(--foreground-muted);
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .history-pill:hover {
          color: var(--foreground);
          background: var(--sidebar-hover);
          border-color: var(--foreground-muted);
        }

        .search-input-wrapper {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
          margin-bottom: 20px;
        }

        .search-icon-wrapper {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--foreground-muted);
          pointer-events: none;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
        }

        .search-input-field {
          width: 100%;
          height: 52px;
          padding: 0 50px 0 52px;
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius-md);
          color: var(--foreground);
          font-size: 15px;
          font-weight: 500;
          outline: none;
          box-sizing: border-box;
          transition: var(--transition-smooth);
        }

        .search-input-field:focus {
          border-color: var(--primary);
          background: rgba(255, 255, 255, 0.07);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 0 15px rgba(229, 9, 20, 0.25);
        }

        .clear-btn {
          position: absolute;
          right: 18px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-smooth);
          z-index: 2;
        }

        .clear-btn:hover {
          color: var(--foreground);
        }

        /* Status banner */
        .status-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 18px;
          border-radius: var(--border-radius-md);
          margin-bottom: 20px;
          font-size: 13.5px;
          font-weight: 500;
          position: relative;
        }

        .status-banner.error {
          background: rgba(239, 68, 68, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #fca5a5;
        }

        .status-banner.success {
          background: rgba(34, 197, 94, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #86efac;
        }

        .status-banner.info {
          background: rgba(59, 130, 246, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(59, 130, 246, 0.25);
          color: #93c5fd;
        }

        .banner-close {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: currentColor;
          cursor: pointer;
          opacity: 0.7;
          transition: var(--transition-smooth);
        }

        .banner-close:hover {
          opacity: 1;
        }

        /* Results panel */
        .results-panel {
          width: 100%;
        }

        .results-header-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 16px;
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .torrent-card {
          border-radius: var(--border-radius-md);
          border: 1px solid var(--card-border);
          overflow: hidden;
          background: var(--card-bg);
          box-shadow: 0 4px 16px var(--shadow-color);
          transition: var(--transition-smooth);
        }

        .torrent-card:hover {
          border-color: var(--card-hover-border);
          transform: translateY(-2px);
        }

        .card-top {
          display: flex;
          padding: 18px;
          gap: 18px;
        }

        .video-icon-box {
          width: 48px;
          height: 48px;
          border-radius: var(--border-radius-sm);
          background: var(--input-bg);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .card-video-icon {
          color: var(--foreground-muted);
        }

        .card-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0; /* allows text truncation */
        }

        .torrent-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--foreground);
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tag {
          font-size: 10px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          background: var(--badge-bg);
          border: 1px solid var(--badge-border);
          color: var(--foreground-muted);
        }

        .tag.quality {
          border-width: 1px;
        }

        .seeds-peers-row {
          display: flex;
          gap: 16px;
          font-size: 12px;
          margin-top: 4px;
        }

        .seed-badge, .peer-badge {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .peer-badge {
          color: var(--foreground-muted);
        }

        .card-actions {
          display: flex;
          border-top: 1px solid var(--card-border);
          background: var(--badge-bg);
        }

        .share-file-btn, .open-magnet-btn {
          flex: 1;
          height: 48px;
          border: none;
          background: transparent;
          color: var(--foreground-muted);
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .share-file-btn:hover {
          background: var(--sidebar-hover);
          color: var(--foreground);
        }

        .open-magnet-btn {
          background: var(--primary-gradient);
          color: #ffffff;
          box-shadow: inset 0 0 20px rgba(0,0,0,0.2);
        }

        .open-magnet-btn:hover {
          filter: brightness(1.1);
          box-shadow: 0 0 10px var(--primary-glow);
        }

        .share-file-btn:border-right {
          border-right: 1px solid rgba(255, 255, 255, 0.05);
        }

        .see-more-btn {
          background: transparent;
          border: 1px dashed rgba(255, 255, 255, 0.15);
          color: var(--foreground-muted);
          height: 48px;
          border-radius: var(--border-radius-md);
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
          margin-top: 10px;
        }

        .see-more-btn:hover {
          color: var(--foreground);
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        /* Loading splash */
        .loader-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 0;
          gap: 16px;
        }

        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(255,255,255,0.06);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .small-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-text {
          font-size: 13.5px;
          color: var(--foreground-muted);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 0;
          gap: 12px;
          color: var(--foreground-muted);
        }

        .empty-icon {
          color: var(--foreground-muted);
          opacity: 0.5;
        }

        /* Idle state splash */
        .idle-splash {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 120px 20px;
          gap: 16px;
        }

        .splash-icon {
          color: var(--primary);
          opacity: 0.8;
          filter: drop-shadow(0 0 12px var(--primary-glow));
          margin-bottom: 8px;
        }

        .idle-splash h2 {
          font-size: 22px;
          font-weight: 800;
          color: var(--foreground);
        }

        .idle-splash p {
          font-size: 14px;
          color: var(--foreground-muted);
          max-width: 360px;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

export default function TorrentSearch() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner" />
      </div>
    }>
      <TorrentSearchContent />
    </Suspense>
  );
}
