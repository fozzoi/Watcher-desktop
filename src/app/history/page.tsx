"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, History, ArrowLeft, Search, Calendar, AlertTriangle } from 'lucide-react';
import { AsyncStorage } from '@/utils/storage';

interface HistoryItem {
  query: string;
  date: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem("searchHistory");
      if (jsonValue) {
        const parsed = JSON.parse(jsonValue);
        // Reverse to show most recent first
        setHistory([...parsed].reverse());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await AsyncStorage.removeItem("searchHistory");
      setHistory([]);
      setShowClearConfirm(false);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteHistoryItem = async (queryToDelete: string) => {
    try {
      const updatedHistory = history.filter((item) => item.query !== queryToDelete);
      // Save it reversed back to storage
      await AsyncStorage.setItem("searchHistory", JSON.stringify([...updatedHistory].reverse()));
      setHistory(updatedHistory);
    } catch (e) {
      console.error(e);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  // Group history items by date
  const groupHistoryByDate = () => {
    const grouped: { Today: HistoryItem[]; Yesterday: HistoryItem[]; Older: HistoryItem[] } = {
      Today: [], Yesterday: [], Older: [],
    };

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    history.forEach((item) => {
      const itemDate = new Date(item.date);
      const itemDateStr = itemDate.toDateString();

      if (itemDateStr === todayStr) {
        grouped.Today.push(item);
      } else if (itemDateStr === yesterdayStr) {
        grouped.Yesterday.push(item);
      } else {
        grouped.Older.push(item);
      }
    });

    return grouped;
  };

  const grouped = groupHistoryByDate();
  const hasItems = history.length > 0;

  return (
    <div className="history-page-container">
      {/* Header */}
      <div className="header-row animate-fade-in-up">
        <div className="title-section">
          <button className="back-btn" onClick={() => router.back()} title="Go Back">
            <ArrowLeft size={20} />
          </button>
          <History className="header-icon" />
          <h1 className="header-title">Search History</h1>
        </div>
        {hasItems && (
          <button 
            className="clear-all-btn btn-secondary" 
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 size={15} />
            <span>Clear All</span>
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal-content glass-premium" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5' }}>
                <AlertTriangle size={20} />
                <h2>Clear Search History</h2>
              </div>
            </div>
            <p className="modal-desc">
              Are you sure you want to clear your entire torrent search query history? This cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleClearHistory}>Clear History</button>
            </div>
          </div>
        </div>
      )}

      {/* History Items Lists */}
      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner" />
        </div>
      ) : hasItems ? (
        <div className="history-lists animate-fade-in-up">
          {Object.entries(grouped).map(([groupName, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={groupName} className="history-group">
                <div className="group-header">
                  <Calendar size={14} />
                  <h3>{groupName}</h3>
                </div>
                <div className="items-list">
                  {items.map((item, idx) => (
                    <div key={idx} className="history-item-row glass">
                      <div 
                        className="item-click-area"
                        onClick={() => router.push(`/search?prefillQuery=${encodeURIComponent(item.query)}`)}
                      >
                        <Search size={16} className="search-icon-dim" />
                        <div className="item-info">
                          <span className="query-text">{item.query}</span>
                          <span className="date-text">{formatDate(item.date)}</span>
                        </div>
                      </div>
                      <button 
                        className="delete-item-btn"
                        onClick={() => deleteHistoryItem(item.query)}
                        title="Delete query"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state animate-fade-in-up">
          <History size={40} className="empty-icon" />
          <h2>History is clear</h2>
          <p>Queries from your torrent search bar will appear here.</p>
        </div>
      )}

      <style jsx>{`
        .history-page-container {
          max-width: 600px;
          margin: 0 auto;
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
          gap: 12px;
        }

        .back-btn {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: 50%;
          transition: var(--transition-smooth);
        }

        .back-btn:hover {
          color: var(--foreground);
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .header-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .header-title {
          font-size: 22px;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: 0.5px;
        }

        .clear-all-btn {
          background: rgba(239, 68, 68, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          padding: 8px 16px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .clear-all-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: rgba(239, 68, 68, 0.4);
          transform: translateY(-1px);
        }

        /* Group Lists */
        .history-lists {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .history-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .group-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--primary);
        }

        .group-header h3 {
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .history-item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: var(--border-radius-md);
          border: 1px solid var(--card-border);
          background: rgba(20, 20, 25, 0.4);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: var(--transition-smooth);
        }

        .history-item-row:hover {
          border-color: var(--card-hover-border);
          background: rgba(20, 20, 25, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .item-click-area {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
          cursor: pointer;
          min-width: 0;
        }

        .search-icon-dim {
          color: var(--foreground-muted);
          opacity: 0.5;
          flex-shrink: 0;
        }

        .item-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .query-text {
          font-size: 14.5px;
          font-weight: 700;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .date-text {
          font-size: 11px;
          color: var(--foreground-muted);
        }

        .delete-item-btn {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-smooth);
        }

        .delete-item-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #fca5a5;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 20px;
          gap: 16px;
          color: var(--foreground-muted);
        }

        .empty-icon {
          opacity: 0.4;
          margin-bottom: 8px;
        }

        /* Modal Overlay */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          width: 100%;
          max-width: 400px;
          border-radius: var(--border-radius-lg);
          padding: 24px;
          border: 1px solid var(--card-border);
          box-shadow: 0 15px 40px rgba(0,0,0,0.6);
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: scaleUp 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .modal-header h2 {
          font-size: 16px;
          font-weight: 800;
        }

        .modal-desc {
          font-size: 13px;
          color: var(--foreground-muted);
          line-height: 1.5;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 10px;
        }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          padding: 100px 0;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
