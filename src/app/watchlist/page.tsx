"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { 
  Bookmark, 
  History, 
  Heart, 
  Layers,
  ChevronLeft,
  ChevronRight,
  Trash2, 
  RefreshCw, 
  ArrowUpDown, 
  X, 
  FileText, 
  Image as ImageIcon, 
  Link2,
  Search,
  BarChart3,
  Film,
  Tv,
  Compass,
  Cloud
} from 'lucide-react';
import { AsyncStorage } from '@/utils/storage';
import { getImageUrl, searchTMDB, GLOBAL_CONFIG, setGlobalConfig } from '@/utils/tmdb';
import { isAdultContent } from '@/utils/contentSafety';
import { GENRE_OPTIONS } from '@/utils/userPreferences';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import RubberSegment from '@/components/RubberSegment';
import AuroraBackground from '@/components/AuroraBackground';
import PageLoading from '@/components/PageLoading';

type TabType = 'watchlist' | 'history' | 'artists' | 'collections';
type MediaTypeFilter = 'all' | 'movie' | 'tv' | 'collection';
type SortOption = 'default' | 'title' | 'rating' | 'date';

export default function WatchListPage() {
  const [activeTab, setActiveTab] = useState<TabType>('watchlist');
  
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [nsfwFilterEnabled, setNsfwFilterEnabled] = useState(GLOBAL_CONFIG.nsfwFilterEnabled);
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMediaType, setSelectedMediaType] = useState<MediaTypeFilter>('all');
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([]);
  
  // Sorting States
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  
  // UI Dialog States
  const [isLinkModalVisible, setIsLinkModalVisible] = useState(false);
  const [syncLinkInput, setSyncLinkInput] = useState('');
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  
  // Import Summary Alert State
  const [importSummary, setImportSummary] = useState<{
    visible: boolean;
    total: number;
    added: number;
    existing: number;
    missed: string[];
  } | null>(null);

  // Infinite Scroll States
  const [visibleCount, setVisibleCount] = useState(24);
  const observerTarget = useRef<HTMLDivElement>(null);
  const genreScrollRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { user, isSyncing, syncNow } = useAuth();

  const mainTabItems = useMemo(() => [
    {
      value: 'watchlist',
      icon: <Bookmark size={15} />,
      label: (
        <span className="tab-label-wrap">
          <span>Watchlist</span>
          <span className="count-badge">{watchlist.length}</span>
        </span>
      ),
    },
    {
      value: 'history',
      icon: <History size={15} />,
      label: (
        <span className="tab-label-wrap">
          <span>History</span>
          <span className="count-badge">{history.length}</span>
        </span>
      ),
    },
    {
      value: 'artists',
      icon: <Heart size={15} />,
      label: (
        <span className="tab-label-wrap">
          <span>Artists</span>
          <span className="count-badge">{artists.length}</span>
        </span>
      ),
    },
    {
      value: 'collections',
      icon: <Layers size={15} />,
      label: (
        <span className="tab-label-wrap">
          <span>Franchises</span>
          <span className="count-badge">{collections.length}</span>
        </span>
      ),
    },
  ], [watchlist.length, history.length, artists.length, collections.length]);

  const loadData = async () => {
    try {
      const storedMovies = await AsyncStorage.getItem('watchlist');
      const storedArtists = await AsyncStorage.getItem('favoriteArtists');
      const storedWatched = await AsyncStorage.getItem('history');
      const storedCollections = await AsyncStorage.getItem('savedCollections');
      const storedNsfw = await AsyncStorage.getItem('settings_nsfw');
      
      setWatchlist(storedMovies ? JSON.parse(storedMovies) : []);
      setArtists(storedArtists ? JSON.parse(storedArtists) : []);
      setHistory(storedWatched ? JSON.parse(storedWatched) : []);
      setCollections(storedCollections ? JSON.parse(storedCollections) : []);
      if (storedNsfw !== null) {
        const enabled = JSON.parse(storedNsfw) === true;
        setNsfwFilterEnabled(enabled);
        setGlobalConfig('nsfwFilterEnabled', enabled);
      }
    } catch (error) {
      console.error('Failed to load library data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleLibraryRefresh = () => {
      void loadData();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('watcher_cloud_synced', handleLibraryRefresh);
      window.addEventListener('watcher_local_library_changed', handleLibraryRefresh);
      return () => {
        window.removeEventListener('watcher_cloud_synced', handleLibraryRefresh);
        window.removeEventListener('watcher_local_library_changed', handleLibraryRefresh);
      };
    }
  }, []);

  useEffect(() => {
    const onNsfwSettingChanged = (event: Event) => {
      const enabled = (event as CustomEvent).detail?.value;
      if (typeof enabled === 'boolean') setNsfwFilterEnabled(enabled);
    };
    window.addEventListener('watcher_nsfw_setting_changed', onNsfwSettingChanged);
    return () => window.removeEventListener('watcher_nsfw_setting_changed', onNsfwSettingChanged);
  }, []);

  // Reset infinite scroll when tabs or filters change
  useEffect(() => {
    setVisibleCount(24);
  }, [activeTab, searchQuery, selectedMediaType, selectedGenreIds, sortBy, sortDirection]);

  const handleRemove = async (id: number, type: TabType) => {
    try {
      if (type === 'watchlist') {
        const newList = watchlist.filter(item => item.id !== id);
        setWatchlist(newList);
        await AsyncStorage.setItem('watchlist', JSON.stringify(newList));
      } else if (type === 'artists') {
        const newList = artists.filter(item => item.id !== id);
        setArtists(newList);
        await AsyncStorage.setItem('favoriteArtists', JSON.stringify(newList));
      } else if (type === 'history') {
        const newList = history.filter(item => item.id !== id);
        setHistory(newList);
        await AsyncStorage.setItem('history', JSON.stringify(newList));
      } else if (type === 'collections') {
        const newList = collections.filter(item => item.id !== id);
        setCollections(newList);
        await AsyncStorage.setItem('savedCollections', JSON.stringify(newList));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearCurrentTab = async () => {
    const tabName = activeTab === 'watchlist' 
      ? 'Watchlist' 
      : activeTab === 'history' 
      ? 'History' 
      : activeTab === 'artists' 
      ? 'Artists' 
      : 'Collections';
    
    const confirm = window.confirm(`Are you sure you want to clear your entire ${tabName}?`);
    if (!confirm) return;

    try {
      if (activeTab === 'watchlist') {
        setWatchlist([]);
        await AsyncStorage.setItem('watchlist', JSON.stringify([]));
      } else if (activeTab === 'history') {
        setHistory([]);
        await AsyncStorage.setItem('history', JSON.stringify([]));
      } else if (activeTab === 'artists') {
        setArtists([]);
        await AsyncStorage.setItem('favoriteArtists', JSON.stringify([]));
      } else if (activeTab === 'collections') {
        setCollections([]);
        await AsyncStorage.setItem('savedCollections', JSON.stringify([]));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sync / Import Movies List
  const handleSyncMovies = async (titles: { title: string; year: string | null }[]) => {
    let addedCount = 0;
    let existingCount = 0;
    let missedTitles: string[] = [];
    
    const stored = await AsyncStorage.getItem('watchlist');
    let currentList = stored ? JSON.parse(stored) : [];

    for (let i = 0; i < titles.length; i++) {
      setSyncProgress(`Searching ${i + 1}/${titles.length}: ${titles[i].title}`);
      try {
        const results = await searchTMDB(titles[i].title);
        const match = results.find(m => m.poster_path);
        if (match) {
          const matchId = Number(match.id);
          const exists = currentList.some((item: any) => Number(item.id) === matchId);
          if (!exists) {
            currentList.unshift({
              ...match,
              id: matchId,
              added_at: Date.now(),
            });
            addedCount++;
          } else {
            existingCount++;
          }
        } else {
          missedTitles.push(titles[i].title);
        }
      } catch (e) {
        missedTitles.push(titles[i].title);
      }
    }
    
    await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
    setWatchlist(currentList);
    setSyncProgress('');
    return { addedCount, existingCount, missedTitles };
  };

  // Hit Gemini proxy backend for extracting titles
  const triggerExtraction = async (action: string, payload: any) => {
    setIsImportMenuOpen(false);
    setSyncing(true);
    setSyncProgress('Extracting with AI...');
    
    try {
      const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
        action,
        ...payload,
        customApiKey: GLOBAL_CONFIG.customApiKey
      });
      
      if (response.data.results && response.data.results.length > 0) {
        const { addedCount, existingCount, missedTitles } = await handleSyncMovies(response.data.results);
        setImportSummary({
          visible: true,
          total: response.data.results.length,
          added: addedCount,
          existing: existingCount,
          missed: missedTitles
        });
      } else {
        alert("The AI couldn't detect any movie titles on that page.");
      }
    } catch (e: any) {
      alert(`Sync Failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  // Sync URL Setup
  const handleAddLink = async () => {
    setIsImportMenuOpen(false);
    try {
      const savedUrl = await AsyncStorage.getItem('sync_url');
      setSyncLinkInput(savedUrl || '');
    } catch (e) {}
    setIsLinkModalVisible(true);
  };

  const handleSaveAndSyncLink = async () => {
    const trimmedUrl = syncLinkInput.trim();
    if (!trimmedUrl) {
      alert("Please enter a valid URL.");
      return;
    }
    setIsLinkModalVisible(false);
    try {
      await AsyncStorage.setItem('sync_url', trimmedUrl);
      triggerExtraction('extract_url', { url: trimmedUrl });
    } catch (e) {}
  };

  // Parse movies from text files
  const extractMoviesFromText = (text: string) => {
    const lines = text.split('\n');
    const results: { title: string; year: string | null }[] = [];
    const yearRegex = /(?:\s*\(?(\d{4})\)?\s*)$/;

    for (let line of lines) {
      let cleanLine = line.trim();
      if (!cleanLine) continue;

      cleanLine = cleanLine.replace(/^[\d\.\-\*]+\s*/, '');
      const match = cleanLine.match(yearRegex);
      let year = null;
      let title = cleanLine;

      if (match) {
        year = match[1];
        title = cleanLine.replace(yearRegex, '').trim();
        title = title.replace(/[\,\-]\s*$/, '').trim();
      }

      if (title) results.push({ title, year });
    }
    return results;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    setSyncProgress('Reading file...');

    try {
      const text = await file.text();
      let extractedMovies: Array<{ title: string; year: string | null }> = [];

      try {
        const parsedJson = JSON.parse(text);
        if (Array.isArray(parsedJson)) {
          extractedMovies = parsedJson.map((item: any) => ({
            title: item.title || item.name || '',
            year: item.year ? String(item.year) : null
          })).filter((item: any) => item.title !== '');
        } else if (parsedJson.title || parsedJson.name) {
          extractedMovies = [{ 
            title: parsedJson.title || parsedJson.name, 
            year: parsedJson.year ? String(parsedJson.year) : null 
          }];
        }
      } catch (jsonError) {
        setSyncProgress('Parsing text file Locally...');
        extractedMovies = extractMoviesFromText(text);
      }

      if (extractedMovies.length > 0) {
        const { addedCount, existingCount, missedTitles } = await handleSyncMovies(extractedMovies);
        setImportSummary({
          visible: true,
          total: extractedMovies.length,
          added: addedCount,
          existing: existingCount,
          missed: missedTitles
        });
      } else {
        alert("No valid movie titles found in the file.");
      }
    } catch (err: any) {
      alert(`Error reading file: ${err.message}`);
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    setSyncProgress('Processing Image...');

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      triggerExtraction('extract_image', { 
        imageBase64: base64Data,
        mimeType: file.type || 'image/jpeg'
      });
    };
    reader.onerror = () => {
      alert('Failed to read image');
      setSyncing(false);
    };
    reader.readAsDataURL(file);
  };

  // Filter and Sort Logic
  const filteredAndSortedItems = useMemo(() => {
    let list: any[] = [];
    if (activeTab === 'watchlist') list = [...watchlist];
    else if (activeTab === 'history') list = [...history];
    else if (activeTab === 'artists') list = [...artists];
    else if (activeTab === 'collections') list = [...collections];

    if (activeTab === 'watchlist' && nsfwFilterEnabled) {
      list = list.filter(item => !isAdultContent(item));
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => {
        const title = (item.title || item.name || '').toLowerCase();
        const overview = (item.overview || '').toLowerCase();
        return title.includes(q) || overview.includes(q);
      });
    }

    // Media type filter (for watchlist & history)
    if (activeTab === 'watchlist' || activeTab === 'history') {
      if (selectedMediaType === 'movie') {
        list = list.filter(item => item.media_type === 'movie' || (!item.first_air_date && item.media_type !== 'tv' && item.media_type !== 'collection'));
      } else if (selectedMediaType === 'tv') {
        list = list.filter(item => item.media_type === 'tv' || item.first_air_date);
      } else if (selectedMediaType === 'collection') {
        list = list.filter(item => item.media_type === 'collection');
      }
    }

    // Genre filter (for watchlist & history)
    if ((activeTab === 'watchlist' || activeTab === 'history') && selectedGenreIds.length > 0) {
      list = list.filter(item => {
        if (item.genre_ids && Array.isArray(item.genre_ids)) {
          return selectedGenreIds.some(id => item.genre_ids.includes(id));
        }
        if (item.genres && Array.isArray(item.genres)) {
          return selectedGenreIds.some(id => item.genres.some((g: any) => g.id === id));
        }
        return false;
      });
    }

    // Sorting
    if (sortBy === 'title') {
      list.sort((a, b) => {
        const tA = (a.title || a.name || '').toLowerCase();
        const tB = (b.title || b.name || '').toLowerCase();
        return sortDirection === 'asc' ? tA.localeCompare(tB) : tB.localeCompare(tA);
      });
    } else if (sortBy === 'rating') {
      list.sort((a, b) => {
        const rA = a.vote_average || 0;
        const rB = b.vote_average || 0;
        return sortDirection === 'asc' ? rA - rB : rB - rA;
      });
    } else if (sortBy === 'date') {
      list.sort((a, b) => {
        const dA = a.release_date || a.first_air_date || '';
        const dB = b.release_date || b.first_air_date || '';
        return sortDirection === 'asc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
      });
    } else if (sortBy === 'default') {
      const hasTimestamps = list.some(item => Boolean(item.added_at || item.created_at || item.watchedAt));
      if (hasTimestamps) {
        list.sort((a, b) => {
          const tA = Number(a.added_at || a.created_at || a.watchedAt || 0);
          const tB = Number(b.added_at || b.created_at || b.watchedAt || 0);
          if (tA && tB && tA !== tB) {
            return sortDirection === 'asc' ? tA - tB : tB - tA;
          }
          if (tA && !tB) return sortDirection === 'asc' ? 1 : -1;
          if (!tA && tB) return sortDirection === 'asc' ? -1 : 1;
          return 0;
        });
      } else if (sortDirection === 'asc') {
        list.reverse();
      }
    }

    return list;
  }, [activeTab, watchlist, history, artists, collections, nsfwFilterEnabled, searchQuery, selectedMediaType, selectedGenreIds, sortBy, sortDirection]);

  // Setup intersection observer to load more items
  useEffect(() => {
    if (loading || filteredAndSortedItems.length <= visibleCount) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + 24);
        }
      },
      { rootMargin: '600px' } // Load earlier to make it seamless
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [loading, filteredAndSortedItems.length, visibleCount]);

  return (
    <>
      <AuroraBackground />
      <div className="watchlist-container relative z-10">
      {/* Header section */}
      <div className="header-row animate-fade-in-up">
        <div className="header-left">
          <div className="header-copy">
            <h1 className="header-title">My Library</h1>
          </div>
          <div className="library-stats-pill">
            <Bookmark size={14} />
            <span>{filteredAndSortedItems.length} saved</span>
          </div>
        </div>
        
        <div className="header-actions">
          {/* Search Toggle */}
          <button
            className={`icon-btn ${isSearchOpen ? 'active' : ''}`}
            onClick={() => {
              setIsSearchOpen(prev => !prev);
              if (isSearchOpen) setSearchQuery('');
            }}
            title="Search library"
          >
            <Search size={16} />
          </button>

          {/* Stats Page Link */}
          <div className="header-utility-group" aria-label="Library tools">
            <Link
              href="/stats"
              className="icon-btn stats-action"
              title="View Watch Statistics & Insights"
            >
              <BarChart3 size={16} />
              <span className="btn-text">Stats</span>
            </Link>

            {user ? (
              <button
                className="icon-btn cloud-action"
                onClick={() => syncNow()}
                disabled={isSyncing}
                title={isSyncing ? "Synchronizing with Cloud..." : "Sync with Cloud"}
              >
                <Cloud size={16} className={isSyncing ? "animate-spin" : ""} />
                <span className="btn-text">{isSyncing ? 'Syncing' : 'Sync'}</span>
              </button>
            ) : (
              <Link
                href="/settings"
                className="icon-btn cloud-action"
                title="Sign in to sync your library across devices"
              >
                <Cloud size={16} />
                <span className="btn-text">Sync</span>
              </Link>
            )}
          </div>

          {/* Sort Menu Button */}
          <button 
            className="icon-btn sort-action"
            onClick={() => {
              if (sortBy === 'default') setSortBy('title');
              else if (sortBy === 'title') setSortBy('rating');
              else if (sortBy === 'rating') setSortBy('date');
              else setSortBy('default');
              setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
            }} 
            title={`Sort: ${sortBy} (${sortDirection})`}
          >
            <ArrowUpDown size={16} />
            <span className="btn-text">{sortBy} ({sortDirection})</span>
          </button>

          {/* Import sync options button */}
          <div className="import-menu-container">
            <button
              className="icon-btn btn-primary"
              onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
              title="Sync or import a watchlist"
              aria-label="Sync or import a watchlist"
              aria-expanded={isImportMenuOpen}
            >
              <RefreshCw size={15} />
              <span className="btn-text">Sync & Import</span>
            </button>

            {isImportMenuOpen && (
              <div className="import-dropdown glass-premium">
                <button onClick={handleAddLink}>
                  <Link2 size={16} />
                  <span>Sync via Watchlist URL</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()}>
                  <FileText size={16} />
                  <span>Import TXT/JSON List</span>
                </button>
                <button onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon size={16} />
                  <span>Extract from Image/Poster</span>
                </button>
              </div>
            )}
          </div>

          {/* Clear Current Tab */}
          {filteredAndSortedItems.length > 0 && (
            <button 
              className="icon-btn btn-danger-ghost" 
              onClick={handleClearCurrentTab}
              title="Clear all in this tab"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Inline Search Bar */}
      {isSearchOpen && (
        <div className="search-bar-row animate-fade-in-up">
          <div className="search-input-wrapper">
            <span className="search-icon-wrapper">
              <Search size={18} />
            </span>
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input-field"
              autoFocus
            />
            {searchQuery && (
              <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hidden Web File Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".txt,.json" 
        onChange={handleFileChange} 
      />
      <input 
        type="file" 
        ref={imageInputRef} 
        style={{ display: 'none' }} 
        accept="image/*" 
        onChange={handleImageChange} 
      />

      {/* Main Tabs Navigation via React Bits RubberSegment */}
      <div className="tabs-row animate-fade-in-up">
        <RubberSegment
          items={mainTabItems}
          value={activeTab}
          onChange={(val) => setActiveTab(val as TabType)}
          trackColor="var(--card-bg, #18181b)"
          thumbColor="#e50914"
          textColor="var(--foreground-muted, #a1a1aa)"
          activeTextColor="#ffffff"
          size="md"
          radius={12}
          inset={3}
          equalSlots={false}
          stretch={100}
          squash={3}
          speed={1}
          glide={75}
          draggable
          className="watchlist-rubber-segment"
        />
      </div>

      {/* Media Type and Genre Filter Pills (Watchlist & History) */}
      {(activeTab === 'watchlist' || activeTab === 'history') && (
        <div className="filters-container animate-fade-in-up">
          {/* Media Type Chips */}
          <div className="media-type-pills">
            <button 
              className={`pill-btn ${selectedMediaType === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedMediaType('all')}
            >
              All
            </button>
            <button 
              className={`pill-btn ${selectedMediaType === 'movie' ? 'active' : ''}`}
              onClick={() => setSelectedMediaType(selectedMediaType === 'movie' ? 'all' : 'movie')}
            >
              <Film size={13} />
              <span>Movies</span>
            </button>
            <button 
              className={`pill-btn ${selectedMediaType === 'tv' ? 'active' : ''}`}
              onClick={() => setSelectedMediaType(selectedMediaType === 'tv' ? 'all' : 'tv')}
            >
              <Tv size={13} />
              <span>Series</span>
            </button>
            <button 
              className={`pill-btn ${selectedMediaType === 'collection' ? 'active' : ''}`}
              onClick={() => setSelectedMediaType(selectedMediaType === 'collection' ? 'all' : 'collection')}
            >
              <Layers size={13} />
              <span>Franchises</span>
            </button>
          </div>

          <div className="filter-divider" />

          {/* Genre Chips Carousel */}
          <div className="genres-carousel">
            <button
              type="button"
              className="genres-scroll-arrow"
              onClick={() => genreScrollRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
              aria-label="Scroll genres left"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="genres-scroll-row" ref={genreScrollRef}>
              {GENRE_OPTIONS.map(genre => {
                const isSelected = selectedGenreIds.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    className={`genre-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedGenreIds(prev =>
                        prev.includes(genre.id) ? prev.filter(id => id !== genre.id) : [...prev, genre.id]
                      );
                    }}
                  >
                    <span className="genre-emoji">{genre.emoji}</span>
                    <span className="genre-label">{genre.label}</span>
                    {isSelected && <X size={12} className="genre-clear" />}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="genres-scroll-arrow"
              onClick={() => genreScrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
              aria-label="Scroll genres right"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* Syncing loader */}
      {syncing && (
        <div className="sync-banner animate-fade-in-up">
          <div className="spinner-small" />
          <span>{syncProgress}</span>
        </div>
      )}

      {/* Library Content Grid */}
      {loading ? (
        <PageLoading label="Loading your library" className="min-h-64" />
      ) : filteredAndSortedItems.length > 0 ? (
        <>
          <div className="media-grid animate-fade-in-up">
            {filteredAndSortedItems.slice(0, visibleCount).map((item) => {
              const isArtist = activeTab === 'artists' || item.known_for_department !== undefined;
              const isCollection = activeTab === 'collections' || item.media_type === 'collection';
              const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
              const titleText = item.title || item.name || 'Unknown';
              const imagePath = isArtist 
                ? item.profile_path 
                : (item.poster_path || item.backdrop_path);
              
              // Link destination
              let targetHref = `/detail?id=${item.id}&type=${mediaType}`;
              if (isArtist) targetHref = `/cast?id=${item.id}`;
              else if (isCollection) targetHref = `/collection?id=${item.id}&name=${encodeURIComponent(titleText)}`;

              const releaseYear = (item.release_date || item.first_air_date)
                ? String(item.release_date || item.first_air_date).substring(0, 4)
                : null;

              return (
                <div key={`${activeTab}-${item.id}`} className="library-card-wrapper">
                  <Link href={targetHref} className="card-link">
                    <div className="card-image-box">
                      <img 
                        src={getImageUrl(imagePath, 'w342')} 
                        alt={titleText} 
                        className="card-img"
                        loading="lazy"
                      />

                      {/* Gradient Overlay */}
                      <div className="card-overlay" />

                      {/* Top Badges */}
                      <div className="card-top-badges">
                        {isCollection ? (
                          <span className="badge-pill franchise-badge">
                            <Layers size={11} />
                            <span>{item.parts_count ? `${item.parts_count} Films` : 'Franchise'}</span>
                          </span>
                        ) : isArtist ? (
                          <span className="badge-pill artist-badge">
                            {item.known_for_department || 'Artist'}
                          </span>
                        ) : (
                          <span className="badge-pill type-badge">
                            {mediaType.toUpperCase()}
                          </span>
                        )}

                        {item.vote_average && (
                          <span className="badge-pill rating-badge">
                            ★ {item.vote_average.toFixed(1)}
                          </span>
                        )}
                      </div>

                      {/* Delete item / watchlist heart button */}
                      <button 
                        className={`remove-btn ${activeTab === 'watchlist' ? 'watchlist-heart-btn' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRemove(item.id, activeTab);
                        }}
                        title={activeTab === 'watchlist' ? "Remove from Watchlist" : "Remove from library"}
                        aria-label={activeTab === 'watchlist' ? "Remove from Watchlist" : "Remove from library"}
                      >
                        {activeTab === 'watchlist' ? (
                          <Heart 
                            size={18} 
                            fill="var(--primary)" 
                            color="var(--primary)" 
                            strokeWidth={2.4} 
                            style={{ filter: 'drop-shadow(0 2px 6px rgba(229, 9, 20, 0.75))' }}
                          />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </div>

                    <div className="card-info">
                      <h3 className="card-title" title={titleText}>{titleText}</h3>
                      <div className="card-subtext">
                        {isArtist ? (
                          <span>{item.known_for_department || 'Cast & Crew'}</span>
                        ) : isCollection ? (
                          <span>Universe Anthology</span>
                        ) : (
                          <span>{releaseYear || 'Media'}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
          {filteredAndSortedItems.length > visibleCount && (
            <div ref={observerTarget} style={{ height: '20px', width: '100%', marginTop: '20px' }} />
          )}
        </>
      ) : (
        <div className="empty-state animate-fade-in-up">
          <div className="empty-icon-circle">
            {activeTab === 'watchlist' ? (
              <Bookmark size={36} />
            ) : activeTab === 'history' ? (
              <History size={36} />
            ) : activeTab === 'artists' ? (
              <Heart size={36} />
            ) : (
              <Layers size={36} />
            )}
          </div>
          <h2>
            {searchQuery || selectedGenreIds.length > 0 || selectedMediaType !== 'all'
              ? "No matching items found"
              : activeTab === 'watchlist'
              ? "Your Watchlist is empty"
              : activeTab === 'history'
              ? "Nothing watched yet"
              : activeTab === 'artists'
              ? "No favorite artists"
              : "No saved franchises"}
          </h2>
          <p>
            {searchQuery || selectedGenreIds.length > 0 || selectedMediaType !== 'all'
              ? "Try adjusting your search query or removing some active filters."
              : activeTab === 'watchlist'
              ? "Save movies and series you want to watch next by clicking the Bookmark icon."
              : activeTab === 'history'
              ? "Titles you mark as watched or stream will automatically appear in this history."
              : activeTab === 'artists'
              ? "Follow favorite actors & directors to track their filmography and releases."
              : "Save whole movie universes and collections from movie detail pages."}
          </p>

          <div className="empty-actions">
            {activeTab === 'watchlist' && !searchQuery && (
              <button className="btn-primary" onClick={() => setIsImportMenuOpen(true)}>
                <RefreshCw size={15} />
                <span>Import Existing Watchlist</span>
              </button>
            )}
            <Link href="/" className="btn-secondary">
              <Compass size={15} />
              <span>Explore Content</span>
            </Link>
          </div>
        </div>
      )}

      {/* Backup sync account link modal */}
      {isLinkModalVisible && (
        <div className="modal-overlay" onClick={() => setIsLinkModalVisible(false)}>
          <div className="modal-content glass-premium" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Watchlist Sync Account</h2>
              <button className="modal-close" onClick={() => setIsLinkModalVisible(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-desc">
              Link your Letterboxd RSS Feed URL or custom watchlist endpoint to sync movie entries automatically.
            </p>
            <input 
              type="text" 
              placeholder="https://letterboxd.com/username/watchlist/rss/"
              value={syncLinkInput}
              onChange={(e) => setSyncLinkInput(e.target.value)}
              className="modal-input"
            />
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsLinkModalVisible(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveAndSyncLink}>Save & Sync</button>
            </div>
          </div>
        </div>
      )}

      {/* Summary dialog overlay */}
      {importSummary?.visible && (
        <div className="modal-overlay" onClick={() => setImportSummary(null)}>
          <div className="modal-content glass-premium" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sync Completion Summary</h2>
              <button className="modal-close" onClick={() => setImportSummary(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="summary-details">
              <div className="summary-stat">
                <span>Total Detected:</span> <strong>{importSummary.total}</strong>
              </div>
              <div className="summary-stat">
                <span>Added:</span> <strong style={{ color: '#22c55e' }}>+{importSummary.added}</strong>
              </div>
              <div className="summary-stat">
                <span>Existing in Library:</span> <strong>{importSummary.existing}</strong>
              </div>
              {importSummary.missed.length > 0 && (
                <div className="summary-missed">
                  <span className="missed-label">Unresolved Titles:</span>
                  <div className="missed-scroll">
                    {importSummary.missed.map((title, idx) => (
                      <div key={idx} className="missed-item">{title}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setImportSummary(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .watchlist-container {
          position: relative;
          padding-bottom: 60px;
        }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .header-title {
          font-size: 26px;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.5px;
        }

        .library-stats-pill {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 4px 12px;
          font-size: 12px;
          font-weight: 600;
          color: var(--foreground-muted);
        }

        .header-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .icon-btn {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          border-radius: 12px;
          padding: 8px 14px;
          color: var(--foreground);
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
          text-decoration: none;
        }

        .icon-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .icon-btn.active {
          background: rgba(229, 9, 20, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: var(--primary);
          color: var(--primary);
          font-weight: 700;
        }

        .icon-btn.btn-primary {
          background: var(--primary-gradient);
          border-color: transparent;
        }

        .icon-btn.btn-danger-ghost {
          background: rgba(239, 68, 68, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }

        .icon-btn.btn-danger-ghost:hover {
          background: rgba(239, 68, 68, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #fff;
        }

        .btn-text {
          text-transform: capitalize;
        }

        .search-bar-row {
          margin-bottom: 20px;
        }

        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          max-width: 600px;
        }

        .search-icon-wrapper {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--foreground-muted);
          pointer-events: none;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
        }

        .search-input-field {
          width: 100%;
          padding: 12px 42px 12px 46px;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 14px;
          color: var(--foreground);
          font-size: 14px;
          outline: none;
          transition: var(--transition-smooth);
        }

        .search-input-field:focus {
          border-color: var(--primary);
          background: var(--input-focus-bg);
          box-shadow: 0 0 15px rgba(229, 9, 20, 0.2);
        }

        .search-clear-btn {
          position: absolute;
          right: 14px;
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .import-menu-container {
          position: relative;
        }

        .import-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 10px;
          width: 230px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          z-index: 60;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          box-shadow: 0 10px 25px rgba(0,0,0,0.6);
        }

        .import-dropdown button {
          background: transparent;
          border: none;
          padding: 12px 16px;
          color: var(--foreground-muted);
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .import-dropdown button:hover {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--foreground);
        }

        /* Tabs bar */
        .tabs-row {
          display: flex;
          align-items: center;
          margin-bottom: 24px;
          max-width: 680px;
        }

        :global(.watchlist-rubber-segment) {
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .tab-label-wrap {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .count-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: inherit;
        }

        :global(.rubber-segment__thumb .count-badge) {
          background: rgba(255, 255, 255, 0.25) !important;
          color: #ffffff !important;
        }

        /* Filter Row */
        .filters-container {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 28px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .media-type-pills {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .pill-btn {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 6px 14px;
          color: var(--foreground-muted);
          font-size: 12.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: var(--transition-smooth);
          white-space: nowrap;
        }

        .pill-btn:hover {
          color: var(--foreground);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .pill-btn.active {
          background: var(--foreground);
          color: var(--bg-color);
          border-color: var(--foreground);
          font-weight: 700;
        }

        .filter-divider {
          width: 1px;
          height: 22px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          flex-shrink: 0;
        }

        .genres-scroll-row {
          display: flex;
          flex: 1;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          min-width: 0;
          scroll-behavior: smooth;
        }

        .genres-scroll-row::-webkit-scrollbar {
          display: none;
        }

        .genres-carousel {
          display: flex;
          flex: 1;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        .genres-scroll-arrow {
          display: inline-flex;
          flex: 0 0 30px;
          width: 30px;
          height: 30px;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--card-border);
          border-radius: 50%;
          background: var(--card-bg);
          color: var(--foreground-muted);
          cursor: pointer;
          transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .genres-scroll-arrow:hover {
          color: var(--foreground);
          border-color: var(--primary);
          background: color-mix(in srgb, var(--primary) 12%, var(--card-bg));
        }

        .genre-chip {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 5px 12px;
          color: var(--foreground-muted);
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: var(--transition-smooth);
        }

        .genre-chip:hover {
          border-color: rgba(255, 255, 255, 0.2);
          color: var(--foreground);
        }

        .genre-chip.active {
          background: rgba(229, 9, 20, 0.15);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-color: var(--primary);
          color: var(--primary);
          font-weight: 700;
        }

        .genre-emoji {
          font-size: 13px;
        }

        .genre-clear {
          opacity: 0.7;
        }

        /* Sync banner */
        .sync-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(229, 9, 20, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(229, 9, 20, 0.2);
          padding: 10px 18px;
          border-radius: var(--border-radius-md);
          margin-bottom: 20px;
          font-size: 13px;
          font-weight: 600;
          color: #fca5a5;
        }

        .spinner-small {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Grid elements */
        .library-card-wrapper {
          width: 100%;
          transition: transform 0.2s ease;
        }

        .library-card-wrapper:hover {
          transform: translateY(-2px);
        }

        .card-link {
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-decoration: none;
        }

        .card-image-box {
          position: relative;
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          background: var(--input-bg);
          border: none !important;
          box-shadow: 0 4px 16px var(--shadow-color);
          transition: box-shadow 0.2s ease;
        }

        .library-card-wrapper:hover .card-image-box {
          box-shadow: 0 6px 22px var(--shadow-color);
        }

        .card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.25s ease;
        }

        .library-card-wrapper:hover .card-img {
          transform: scale(1.02);
        }

        .card-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 40%);
          pointer-events: none;
        }

        .card-top-badges {
          position: absolute;
          top: 8px;
          left: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          z-index: 5;
        }

        .badge-pill {
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.3px;
          backdrop-filter: blur(8px);
          display: inline-flex;
          align-items: center;
          gap: 4px;
          width: fit-content;
        }

        .type-badge {
          background: rgba(0, 0, 0, 0.7);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .franchise-badge {
          background: rgba(168, 85, 247, 0.8);
          color: #fff;
          border: 1px solid rgba(168, 85, 247, 0.3);
        }

        .artist-badge {
          background: rgba(229, 9, 20, 0.8);
          color: #fff;
        }

        .rating-badge {
          background: rgba(0, 0, 0, 0.75);
          color: #facc15;
          border: 1px solid rgba(250, 204, 21, 0.3);
        }

        .remove-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          z-index: 10;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .remove-btn.watchlist-heart-btn {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          opacity: 1 !important;
          padding: 0;
        }

        .remove-btn.watchlist-heart-btn:hover {
          transform: scale(1.25);
          background: transparent !important;
        }

        .library-card-wrapper:hover .remove-btn {
          opacity: 1;
        }

        .remove-btn:hover {
          background: rgba(239, 68, 68, 0.9);
          border-color: transparent;
          color: #fff;
          transform: scale(1.08);
        }

        /* On Touch / Small devices: ALWAYS visible so touch users can tap it! */
        @media (hover: none), (max-width: 768px) {
          .remove-btn {
            opacity: 1 !important;
            top: 6px;
            right: 6px;
          }
        }

        [data-theme="light"] .card-image-box {
          background: #e5e7eb;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.07);
        }

        [data-theme="light"] .library-card-wrapper:hover .card-image-box {
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
        }

        [data-theme="light"] .type-badge {
          background: rgba(255, 255, 255, 0.92);
          color: #111827;
          border: 1px solid rgba(0, 0, 0, 0.12);
        }

        [data-theme="light"] .remove-btn {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.12);
          color: #ef4444;
        }

        .card-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .card-title {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          transition: var(--transition-smooth);
        }

        .library-card-wrapper:hover .card-title {
          color: var(--primary);
        }

        .card-subtext {
          font-size: 11.5px;
          color: var(--foreground-muted);
        }

        /* Empty state */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 20px;
          gap: 14px;
          color: var(--foreground-muted);
          max-width: 500px;
          margin: 0 auto;
        }

        .empty-icon-circle {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          margin-bottom: 8px;
        }

        .empty-state h2 {
          font-size: 18px;
          font-weight: 700;
          color: var(--foreground);
        }

        .empty-state p {
          font-size: 13.5px;
          line-height: 1.5;
        }

        .empty-actions {
          display: flex;
          gap: 12px;
          margin-top: 14px;
        }

        /* Modal popup dialogs */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          width: 100%;
          max-width: 460px;
          border-radius: var(--border-radius-lg);
          padding: 28px;
          border: 1px solid var(--card-border);
          box-shadow: 0 15px 40px rgba(0,0,0,0.6);
          display: flex;
          flex-direction: column;
          gap: 18px;
          animation: scaleUp 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h2 {
          font-size: 18px;
          font-weight: 800;
          color: var(--foreground);
        }

        .modal-close {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .modal-desc {
          font-size: 13.5px;
          color: var(--foreground-muted);
          line-height: 1.5;
        }

        .modal-input {
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 10px;
          color: var(--foreground);
          padding: 12px 16px;
          font-size: 14px;
          width: 100%;
          outline: none;
        }

        .modal-input:focus {
          border-color: var(--primary);
          background: var(--input-focus-bg);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 10px;
        }

        .summary-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .summary-stat {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--foreground-muted);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          padding-bottom: 8px;
        }

        .summary-stat strong {
          color: var(--foreground);
        }

        .summary-missed {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .missed-label {
          font-size: 13px;
          font-weight: 700;
          color: #fca5a5;
        }

        .missed-scroll {
          max-height: 120px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: var(--border-radius-sm);
          padding: 8px 12px;
        }

        .missed-item {
          font-size: 12px;
          color: var(--foreground-muted);
          padding: 4px 0;
          border-bottom: 1px solid rgba(255,255,255,0.02);
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

        /* --- SKELETON LOADER --- */
        .skeleton-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 20px;
          width: 100%;
          margin-top: 10px;
        }

        @media (min-width: 500px) {
          .skeleton-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
        }

        @media (min-width: 800px) {
          .skeleton-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
        }

        .skeleton-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .skeleton-image {
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: var(--border-radius-md);
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.03) 25%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 400% 100%;
          animation: skeleton-shimmer 1.5s infinite ease-in-out;
        }

        .skeleton-text {
          width: 80%;
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.03) 25%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.03) 75%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background-size: 400% 100%;
          animation: skeleton-shimmer 1.5s infinite ease-in-out;
        }

        .skeleton-text.short {
          width: 50%;
          height: 12px;
          margin-top: -4px;
        }

        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 640px) {
          .header-row {
            margin-bottom: 16px;
            gap: 12px;
          }

          .header-left {
            gap: 10px;
          }

          .header-title {
            font-size: 22px;
          }

          .header-actions {
            gap: 6px;
          }

          .header-actions .btn-text {
            display: none !important;
          }

          .icon-btn {
            padding: 8px !important;
            border-radius: 10px !important;
            min-width: 36px;
            height: 36px;
            justify-content: center;
          }

          .tabs-row {
            overflow-x: auto;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            max-width: 100%;
            gap: 6px;
            padding: 4px;
            border-radius: 14px;
            margin-bottom: 14px;
          }

          .tabs-row::-webkit-scrollbar {
            display: none;
          }

          .tab-btn {
            flex: 0 0 auto;
            padding: 0 12px;
            height: 36px;
            font-size: 12.5px;
            gap: 6px;
          }

          .filters-container {
            margin-bottom: 16px;
            gap: 10px;
          }

          .pill-btn {
            padding: 5px 10px;
            font-size: 11.5px;
          }

          .media-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 12px !important;
          }
        }

        .watchlist-container {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding-bottom: 84px;
        }

        .header-row {
          align-items: flex-end;
          margin-bottom: 30px;
          gap: 20px;
        }

        .header-left {
          align-items: flex-end;
          gap: 18px;
        }

        .header-copy {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .header-eyebrow {
          color: var(--primary);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
        }

        .header-title {
          font-size: clamp(30px, 3.2vw, 42px);
          font-weight: 800;
          letter-spacing: -0.045em;
          line-height: 1.05;
        }

        .header-description {
          color: var(--foreground-muted);
          font-size: 14px;
          line-height: 1.55;
        }

        .library-stats-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 2px;
          padding: 8px 11px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .header-actions {
          gap: 8px;
          justify-content: flex-end;
        }

        .icon-btn {
          min-height: 40px;
          padding: 8px 12px;
          border-radius: 11px;
          background: var(--card-bg);
          box-shadow: 0 2px 8px var(--shadow-color);
        }

        .icon-btn:hover {
          background: var(--sidebar-hover);
          border-color: var(--card-hover-border);
          transform: translateY(-1px);
        }

        .icon-btn.btn-primary {
          background: var(--primary-gradient);
          color: #fff;
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        .search-bar-row {
          margin: -10px 0 24px;
        }

        .search-input-wrapper {
          max-width: 680px;
        }

        .search-input-field {
          min-height: 48px;
          border-radius: 13px;
          box-shadow: 0 5px 20px var(--shadow-color);
        }

        .tabs-row {
          max-width: none;
          margin-bottom: 18px;
          border-bottom: 1px solid var(--card-border);
          padding-bottom: 14px;
        }

        :global(.watchlist-rubber-segment) {
          max-width: 100%;
          border: 1px solid var(--card-border);
          border-radius: 14px;
          background: var(--card-bg);
          box-shadow: none;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        :global(.watchlist-rubber-segment .rubber-segment__item) {
          padding-right: 13px;
          padding-left: 13px;
          font-weight: 600;
        }

        .filters-container {
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 24px;
          overflow: visible;
        }

        .media-type-pills,
        .genres-scroll-row {
          gap: 7px;
        }

        .pill-btn,
        .genre-chip {
          min-height: 34px;
          padding: 6px 12px;
          border-radius: 10px;
          background: var(--card-bg);
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .pill-btn.active {
          background: var(--foreground);
          color: var(--bg-color);
          border-color: var(--foreground);
        }

        .filter-divider {
          display: none;
        }

        .genres-scroll-row {
          max-width: 100%;
          padding: 1px 0 3px;
        }

        @media (max-width: 768px) {
          .genres-scroll-arrow {
            display: none;
          }
        }

        .genre-chip.active {
          background: color-mix(in srgb, var(--primary) 12%, var(--card-bg));
        }

        .sync-banner {
          min-height: 44px;
          padding: 10px 14px;
          margin-bottom: 20px;
          border-radius: 12px;
        }

        .watchlist-container .media-grid,
        .watchlist-container .skeleton-grid {
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 24px 18px;
          margin-top: 0;
        }

        .library-card-wrapper {
          min-width: 0;
        }

        .card-link {
          gap: 10px;
        }

        .card-image-box {
          border: 1px solid var(--card-border) !important;
          border-radius: 15px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
        }

        .library-card-wrapper:hover .card-image-box {
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
        }

        .card-overlay {
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, transparent 28%, transparent 55%, rgba(0, 0, 0, 0.22) 100%);
        }

        .card-top-badges {
          top: 10px;
          left: 10px;
          gap: 6px;
        }

        .badge-pill {
          padding: 5px 8px;
          border-radius: 7px;
          font-size: 9px;
          letter-spacing: 0.05em;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .remove-btn {
          top: 9px;
          right: 9px;
          width: 34px;
          height: 34px;
          background: rgba(15, 15, 20, 0.7);
          border-color: rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .remove-btn.watchlist-heart-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(15, 15, 20, 0.7) !important;
          border: 1px solid rgba(255, 255, 255, 0.18) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25) !important;
        }

        .remove-btn.watchlist-heart-btn:hover {
          transform: scale(1.08);
          background: rgba(15, 15, 20, 0.88) !important;
        }

        .card-info {
          gap: 4px;
          padding: 0 2px;
        }

        .card-title {
          font-size: 14px;
          font-weight: 700;
          line-height: 1.35;
        }

        .card-subtext {
          font-size: 12px;
        }

        .empty-state {
          max-width: 620px;
          margin-top: 18px;
          padding: 64px 24px;
          border: 1px solid var(--card-border);
          border-radius: 22px;
          background: color-mix(in srgb, var(--card-bg) 78%, transparent);
        }

        .empty-icon-circle {
          width: 64px;
          height: 64px;
          margin-bottom: 4px;
          border-radius: 18px;
          background: color-mix(in srgb, var(--primary) 10%, var(--card-bg));
          color: var(--primary);
        }

        .empty-state h2 {
          font-size: 21px;
          letter-spacing: -0.02em;
        }

        .empty-state p {
          max-width: 420px;
          font-size: 14px;
          line-height: 1.65;
        }

        .empty-actions {
          flex-wrap: wrap;
          justify-content: center;
        }

        .watchlist-container button:focus-visible,
        .watchlist-container a:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 3px;
        }

        .skeleton-image,
        .skeleton-text {
          background-color: var(--input-bg);
        }

        @media (min-width: 1500px) {
          .watchlist-container .media-grid,
          .watchlist-container .skeleton-grid {
            grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          }
        }

        @media (max-width: 640px) {
          .watchlist-container {
            padding-bottom: 56px;
          }

          .header-row {
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 18px;
            border-bottom: 1px solid var(--card-border);
          }

          .header-left {
            width: 100%;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
          }

          .header-copy {
            min-width: 0;
          }

          .header-title {
            font-size: 30px;
          }

          .header-description {
            max-width: 260px;
            font-size: 13px;
          }

          .library-stats-pill {
            flex-shrink: 0;
            margin-top: 19px;
            padding: 7px 9px;
          }

          .header-actions {
            width: 100%;
            justify-content: flex-start;
          }

          .header-actions .btn-text {
            display: none !important;
          }

          .header-actions .icon-btn {
            width: 40px;
            min-width: 40px;
            height: 38px;
            min-height: 38px;
            padding: 7px !important;
          }

          .header-actions .icon-btn:first-child,
          .header-actions .btn-danger-ghost {
            width: 38px;
            padding: 7px !important;
          }

          .tabs-row {
            overflow-x: auto;
            padding: 0 0 12px;
          }

          :global(.watchlist-rubber-segment) {
            width: max-content;
          }

          :global(.watchlist-rubber-segment .rubber-segment__item) {
            padding-right: 9px;
            padding-left: 9px;
            font-size: 12px;
          }

          .filters-container {
            align-items: flex-start;
            flex-direction: column;
            margin-bottom: 20px;
          }

          .media-type-pills {
            max-width: 100%;
            overflow-x: auto;
          }

          .watchlist-container .media-grid,
          .watchlist-container .skeleton-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 18px 12px !important;
          }

          .empty-state {
            padding: 48px 18px;
          }
        }

        .header-row {
          align-items: center;
          margin-bottom: 18px;
          gap: 14px;
        }

        .header-left {
          flex: 0 0 auto;
          align-items: center;
          gap: 12px;
        }

        .header-copy {
          gap: 0;
        }

        .header-title {
          font-size: clamp(26px, 2.5vw, 34px);
          line-height: 1.1;
        }

        .library-stats-pill {
          margin: 0;
          padding: 6px 9px;
        }

        .header-actions {
          flex: 0 1 auto;
          flex-wrap: nowrap;
          gap: 6px;
        }

        .header-actions .icon-btn {
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          min-width: 36px;
          min-height: 36px;
          padding: 7px 10px;
          white-space: nowrap;
        }

        .header-utility-group {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          padding: 2px;
          border: 1px solid var(--card-border);
          border-radius: 12px;
          background: var(--card-bg);
        }

        .header-utility-group .icon-btn {
          border-color: transparent;
          background: transparent;
          box-shadow: none;
        }

        .header-utility-group .icon-btn:hover {
          background: var(--sidebar-hover);
          border-color: transparent;
          transform: none;
        }

        .header-utility-group .cloud-action {
          color: #0891b2;
        }

        [data-theme="dark"] .header-utility-group .cloud-action {
          color: #67e8f9;
        }

        .header-actions .btn-primary {
          background: var(--primary-gradient);
        }

        @media (max-width: 1050px) {
          .header-row {
            flex-wrap: wrap;
            align-items: center;
            margin-bottom: 14px;
          }

          .header-actions {
            width: 100%;
            justify-content: flex-start;
          }
        }

        .tabs-row {
          margin-bottom: 12px;
          padding-bottom: 9px;
        }

        .filters-container {
          gap: 8px;
          margin-bottom: 16px;
        }

        .search-bar-row {
          margin: 0 0 14px;
        }

        @media (max-width: 640px) {
          .header-row {
            margin-bottom: 12px;
            padding-bottom: 12px;
            gap: 10px;
          }

          .header-left {
            width: auto;
            align-items: center;
            gap: 9px;
          }

          .header-title {
            font-size: 27px;
          }

          .library-stats-pill {
            margin: 0;
            padding: 5px 7px;
            font-size: 11px;
          }

          .header-actions {
            gap: 5px;
          }

          .header-actions .icon-btn {
            width: 36px;
            min-width: 36px;
            height: 36px;
            min-height: 36px;
            padding: 6px !important;
          }

          .header-actions .stats-action,
          .header-actions .cloud-action {
            width: auto;
            min-width: 0;
            padding: 6px 8px !important;
            gap: 5px;
          }

          .header-actions .stats-action .btn-text,
          .header-actions .cloud-action .btn-text {
            display: inline !important;
            font-size: 11px;
          }

          .header-actions .import-menu-container > .icon-btn {
            width: auto;
            min-width: 36px;
          }

          .header-actions .import-menu-container .btn-text,
          .header-actions .sort-action .btn-text {
            display: none !important;
          }

          .header-actions .btn-danger-ghost {
            width: 34px;
            min-width: 34px;
          }

          .tabs-row {
            margin-bottom: 10px;
            padding-bottom: 8px;
          }

          .filters-container {
            gap: 7px;
            margin-bottom: 14px;
          }

          .pill-btn,
          .genre-chip {
            min-height: 31px;
            padding: 5px 9px;
          }
        }

        :global(.watchlist-container .header-utility-group .icon-btn) {
          display: inline-flex !important;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          width: auto !important;
          min-width: 0 !important;
          min-height: 34px !important;
          height: 34px !important;
          gap: 5px;
          padding: 6px 9px !important;
          border: 1px solid transparent;
          border-radius: 9px;
          background: transparent;
          box-shadow: none;
          color: var(--foreground-muted);
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
        }

        :global(.watchlist-container .header-utility-group .icon-btn:hover) {
          border-color: transparent;
          background: var(--sidebar-hover);
          color: var(--foreground);
          transform: none;
        }

        :global(.watchlist-container .header-utility-group .cloud-action) {
          color: #0891b2;
        }

        :global([data-theme="dark"] .watchlist-container .header-utility-group .cloud-action) {
          color: #67e8f9;
        }

        :global(.watchlist-container .header-actions .header-utility-group .icon-btn .btn-text) {
          display: inline !important;
          font-size: 12px;
        }

        @media (max-width: 640px) {
          :global(.watchlist-container .header-utility-group .icon-btn) {
            min-height: 32px !important;
            height: 32px !important;
            padding: 5px 7px !important;
            gap: 4px;
            font-size: 11px;
          }

          :global(.watchlist-container .header-actions .header-utility-group .icon-btn .btn-text) {
            display: inline !important;
            font-size: 11px;
          }
        }
      `}</style>
      </div>
    </>
  );
}
