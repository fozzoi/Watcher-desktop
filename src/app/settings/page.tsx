"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Settings as SettingsIcon, 
  HelpCircle, 
  Trash2, 
  Upload, 
  Check, 
  Key,
  Shield,
  FileJson,
  FileText,
  Bot,
  PlaySquare,
  Sparkles,
  RotateCcw,
  Volume2,
  Tv,
  Bell,
  Palette,
  ExternalLink,
  ChevronRight,
  Eye,
  EyeOff,
  Cloud,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { AsyncStorage } from '@/utils/storage';
import { setGlobalConfig } from '@/utils/tmdb';
import { useAuth } from '@/context/AuthContext';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { useTheme } from 'next-themes';
import { 
  getUserPreferences, 
  setUserPreferences, 
  resetOnboarding, 
  UserPreferences,
  DEFAULT_PREFERENCES,
  LANGUAGE_OPTIONS,
  GENRE_OPTIONS
} from '@/utils/userPreferences';
import { 
  getAiName, 
  setAiName, 
  getUserMemory, 
  setUserMemory, 
  clearUserMemory 
} from '@/utils/chatStorage';
import { 
  getPlayerPreferences, 
  savePlayerPreferences, 
  PlayerPreferences,
  PlayerQuality
} from '@/utils/playerPreferences';
import { checkForUpdate, downloadAndInstallUpdate, isTauriApp, UpdateInfo } from '@/utils/tauriUpdater';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // Gemini API Key & Toggles
  const [customApiKey, setCustomApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [isHiRes, setIsHiRes] = useState(false);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);
  const [isAutoAi, setIsAutoAi] = useState(true);
  const [isNotifications, setIsNotifications] = useState(true);

  // AI Companion Persona
  const [aiAssistantName, setAiAssistantName] = useState('Cine');
  const [aiNameSaved, setAiNameSaved] = useState(false);
  const [aiMemory, setAiMemory] = useState('');
  const [aiMemorySaved, setAiMemorySaved] = useState(false);

  // User Discovery Preferences
  const [userPrefs, setUserPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // Player Preferences
  const [playerPrefs, setPlayerPrefs] = useState<PlayerPreferences>({
    volume: 1,
    muted: false,
    audioTrack: null,
    subtitleTrack: null,
    quality: 'auto'
  });
  const [autoSkipCredits, setAutoSkipCredits] = useState(true);

  // Cloud Sync & Google Auth
  const { 
    user, 
    isSyncing, 
    lastSyncedAt, 
    syncError, 
    syncNow, 
    logout, 
    clearCloudData 
  } = useAuth();
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Tauri Updater State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateInfo(null);
    setUpdateError(null);
    const result = await checkForUpdate();
    setIsCheckingUpdate(false);
    if (result.success) {
      setUpdateInfo(result.info ?? null);
    } else {
      setUpdateError(result.error ?? 'Update check failed');
    }
  };

  const handleInstallUpdate = async () => {
    setIsInstallingUpdate(true);
    setUpdateDownloadProgress(0);
    await downloadAndInstallUpdate((downloaded, total) => {
      if (total) setUpdateDownloadProgress(Math.round((downloaded / total) * 100));
    });
    setIsInstallingUpdate(false);
  };

  const handleManualSync = async () => {
    setSyncFeedback(null);
    const ok = await syncNow();
    if (ok) {
      setSyncFeedback('Library successfully synchronized with cloud!');
      setTimeout(() => setSyncFeedback(null), 3500);
    }
  };

  const handleClearCloud = async () => {
    if (confirm('Are you sure you want to delete your cloud library backup? Your local device data will not be touched.')) {
      await clearCloudData();
      setSyncFeedback('Cloud backup reset.');
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAllSettings();
    setMounted(true);
  }, []);

  const loadAllSettings = async () => {
    try {
      // General toggles
      const savedHiRes = await AsyncStorage.getItem('settings_hires');
      const savedNsfw = await AsyncStorage.getItem('settings_nsfw');
      const savedAutoAi = await AsyncStorage.getItem('settings_auto_ai');
      const savedKey = await AsyncStorage.getItem('settings_custom_key');
      const savedNotifs = await AsyncStorage.getItem('settings_notifications');
      const savedAutoSkip = await AsyncStorage.getItem('settings_auto_skip');
      
      if (savedHiRes !== null) {
        const val = JSON.parse(savedHiRes);
        setIsHiRes(val);
        setGlobalConfig('hiRes', val);
      }
      if (savedNsfw !== null) {
        const val = JSON.parse(savedNsfw);
        setIsNsfwFilter(val);
        setGlobalConfig('nsfwFilterEnabled', val);
      }
      if (savedAutoAi !== null) {
        setIsAutoAi(JSON.parse(savedAutoAi));
      }
      if (savedKey !== null) {
        setCustomApiKey(savedKey);
        setGlobalConfig('customApiKey', savedKey);
      }
      if (savedNotifs !== null) {
        setIsNotifications(JSON.parse(savedNotifs));
      }
      if (savedAutoSkip !== null) {
        setAutoSkipCredits(JSON.parse(savedAutoSkip));
      }

      // AI Persona
      const name = await getAiName();
      setAiAssistantName(name);
      const memory = await getUserMemory();
      setAiMemory(memory);

      // User Preferences
      const prefs = await getUserPreferences();
      setUserPrefs(prefs);

      // Player Preferences
      const pPrefs = await getPlayerPreferences();
      setPlayerPrefs(pPrefs);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const handleToggleHiRes = async (value: boolean) => {
    setIsHiRes(value);
    setGlobalConfig('hiRes', value);
    await AsyncStorage.setItem('settings_hires', JSON.stringify(value));
  };

  const handleToggleNsfw = async (value: boolean) => {
    setIsNsfwFilter(value);
    setGlobalConfig('nsfwFilterEnabled', value);
    await AsyncStorage.setItem('settings_nsfw', JSON.stringify(value));
  };

  const handleToggleAutoAi = async (value: boolean) => {
    setIsAutoAi(value);
    await AsyncStorage.setItem('settings_auto_ai', JSON.stringify(value));
  };

  const handleToggleNotifications = async (value: boolean) => {
    setIsNotifications(value);
    await AsyncStorage.setItem('settings_notifications', JSON.stringify(value));
  };

  const handleToggleAutoSkip = async (value: boolean) => {
    setAutoSkipCredits(value);
    await AsyncStorage.setItem('settings_auto_skip', JSON.stringify(value));
  };

  const handleSaveApiKey = async () => {
    setGlobalConfig('customApiKey', customApiKey);
    await AsyncStorage.setItem('settings_custom_key', customApiKey);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleSaveAiName = async () => {
    const trimmed = aiAssistantName.trim() || 'Cine';
    await setAiName(trimmed);
    setAiAssistantName(trimmed);
    setAiNameSaved(true);
    setTimeout(() => setAiNameSaved(false), 2000);
  };

  const handleSaveAiMemory = async () => {
    await setUserMemory(aiMemory);
    setAiMemorySaved(true);
    setTimeout(() => setAiMemorySaved(false), 2000);
  };

  const handleClearAiMemory = async () => {
    const ok = window.confirm("Are you sure you want to erase all AI memory of your movie preferences?");
    if (!ok) return;
    await clearUserMemory();
    setAiMemory('');
  };

  const handleResetOnboarding = async () => {
    const ok = window.confirm("Reset setup preferences? This will launch the onboarding wizard to pick your cinema industries, genres, and favorite stars again.");
    if (!ok) return;
    await resetOnboarding();
    router.push('/onboarding');
  };

  const handleUpdateQuality = async (q: PlayerQuality) => {
    const updated = await savePlayerPreferences(undefined, { quality: q });
    setPlayerPrefs(updated);
  };

  const handleUpdateVolume = async (vol: number) => {
    const updated = await savePlayerPreferences(undefined, { volume: vol, muted: vol === 0 });
    setPlayerPrefs(updated);
  };

  const handleToggleMute = async (muted: boolean) => {
    const updated = await savePlayerPreferences(undefined, { muted });
    setPlayerPrefs(updated);
  };

  const handleWipeLibrary = async () => {
    const confirm = window.confirm("Are you absolutely sure you want to WIPE all your Watchlist, History, Franchises, Preferences, and Saved Data? This cannot be undone.");
    if (!confirm) return;

    try {
      await AsyncStorage.removeItem('watchlist');
      await AsyncStorage.removeItem('favoriteArtists');
      await AsyncStorage.removeItem('history');
      await AsyncStorage.removeItem('savedCollections');
      await AsyncStorage.removeItem('searchHistory');
      await AsyncStorage.removeItem('@watch_progress');
      await AsyncStorage.removeItem('user_preferences');
      await AsyncStorage.removeItem('watcher.chat.conversations.v1');
      await AsyncStorage.removeItem('watcher.chat.userMemory.v1');
      
      alert("All library data has been wiped successfully.");
      window.location.reload();
    } catch (e) {
      alert("Failed to clear library data.");
    }
  };

  const handleExportData = async (format: 'txt' | 'json') => {
    try {
      const mStr = await AsyncStorage.getItem('watchlist');
      const aStr = await AsyncStorage.getItem('favoriteArtists');
      const hStr = await AsyncStorage.getItem('history');
      const cStr = await AsyncStorage.getItem('savedCollections');
      const pStr = await AsyncStorage.getItem('user_preferences');

      const rawWatchlist = mStr ? JSON.parse(mStr) : [];
      const rawArtists = aStr ? JSON.parse(aStr) : [];
      const rawHistory = hStr ? JSON.parse(hStr) : [];
      const rawCollections = cStr ? JSON.parse(cStr) : [];
      const rawPrefs = pStr ? JSON.parse(pStr) : null;

      let fileContent = "";
      const dateString = new Date().toISOString().split('T')[0];
      const fileName = format === 'json' ? `Watcher_Backup_${dateString}.json` : `Watcher_Backup_${dateString}.txt`;

      if (format === 'json') {
        fileContent = JSON.stringify({ 
          watchlist: rawWatchlist, 
          artists: rawArtists, 
          history: rawHistory,
          collections: rawCollections,
          preferences: rawPrefs,
          exportedAt: new Date().toISOString()
        }, null, 2);
      } else {
        fileContent += "# WATCHER LIBRARY BACKUP\n\n";
        fileContent += "## Watchlist\n";
        rawWatchlist.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          const yearText = year ? ` (${year})` : '';
          fileContent += `${index + 1}. ${i.title || i.name}${yearText} [${i.media_type || 'movie'}]\n`;
        });

        fileContent += "\n## Favorite Artists\n";
        rawArtists.forEach((i: any, index: number) => {
          fileContent += `${index + 1}. ${i.name} [${i.known_for_department || 'Artist'}]\n`;
        });

        fileContent += "\n## Saved Franchises\n";
        rawCollections.forEach((i: any, index: number) => {
          fileContent += `${index + 1}. ${i.name} (${i.parts_count || 0} movies)\n`;
        });

        fileContent += "\n## Watch History\n";
        rawHistory.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          const yearText = year ? ` (${year})` : '';
          fileContent += `${index + 1}. ${i.title || i.name}${yearText}\n`;
        });
      }

      const blob = new Blob([fileContent], { type: format === 'json' ? 'application/json' : 'text/plain' });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e) {
      alert("Failed to export library data.");
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (backup.watchlist || backup.artists || backup.history || backup.collections) {
        if (backup.watchlist) await AsyncStorage.setItem('watchlist', JSON.stringify(backup.watchlist));
        if (backup.artists) await AsyncStorage.setItem('favoriteArtists', JSON.stringify(backup.artists));
        if (backup.history) await AsyncStorage.setItem('history', JSON.stringify(backup.history));
        if (backup.collections) await AsyncStorage.setItem('savedCollections', JSON.stringify(backup.collections));
        if (backup.preferences) await AsyncStorage.setItem('user_preferences', JSON.stringify(backup.preferences));
        
        alert("Backup imported successfully. Reloading library data...");
        window.location.reload();
      } else {
        alert("Invalid backup format. File must contain watchlist, artists, or history fields.");
      }
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const selectedLanguageLabels = (userPrefs.languages || []).map(code => {
    const match = LANGUAGE_OPTIONS.find(l => l.code === code);
    return match ? `${match.flag} ${match.label}` : code.toUpperCase();
  });

  const selectedGenreLabels = (userPrefs.genreIds || []).map(id => {
    const match = GENRE_OPTIONS.find(g => g.id === id);
    return match ? `${genreEmoji(match.id)} ${match.label}` : String(id);
  });

  function genreEmoji(id: number): string {
    const match = GENRE_OPTIONS.find(g => g.id === id);
    return match?.emoji || '🎬';
  }

  return (
    <div className="settings-container">
      {/* Header section */}
      <div className="header-row animate-fade-in-up">
        <div className="title-section">
          <SettingsIcon className="header-icon" />
          <h1 className="header-title">Settings</h1>
        </div>
      </div>

      <div className="settings-sections animate-fade-in-up">
        {/* Cloud Sync & Google Account */}
        <section className="settings-section glass">
          <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cloud className="sec-icon" size={18} style={{ color: '#00B4D8' }} />
              <h2>Cloud Sync & Google Account</h2>
            </div>
            <span style={{ 
              fontSize: '11px', 
              fontWeight: 600, 
              letterSpacing: '0.04em', 
              padding: '3px 8px', 
              borderRadius: '20px', 
              background: 'rgba(0, 180, 216, 0.12)', 
              color: '#00B4D8',
              border: '1px solid rgba(0, 180, 216, 0.25)' 
            }}>
              OPTIONAL
            </span>
          </div>
          <div className="section-body">
            <p className="description">
              Watcher is 100% functional offline without an account. All movies, bookmarks, history, and stats are saved locally on your device.
              Signing in with Google is <strong>strictly optional</strong> — you only need it if you want to sync your library across devices (Web, Desktop, and Android).
            </p>

            {user ? (
              <div className="cloud-connected-box">
                <div className="cloud-user-header">
                  <div className="cloud-avatar-wrap">
                    {user.picture ? (
                      <img src={user.picture} alt={user.name} className="cloud-avatar-img" />
                    ) : (
                      <div className="cloud-avatar-placeholder">{user.name.charAt(0).toUpperCase()}</div>
                    )}
                  </div>
                  <div className="cloud-user-meta">
                    <div className="cloud-name-row">
                      <span className="cloud-user-name">{user.name}</span>
                      <span className="cloud-badge">
                        <CheckCircle2 size={12} /> Connected
                      </span>
                    </div>
                    <span className="cloud-user-email">{user.email}</span>
                    <span className="cloud-sync-time">
                      {isSyncing ? (
                        <span className="syncing-text">
                          <RefreshCw size={12} className="animate-spin" /> Synchronizing data with cloud...
                        </span>
                      ) : (
                        <span>Last Synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="cloud-actions-row">
                  <button
                    className="btn-primary-setting"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                  >
                    <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
                    <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>

                  <button
                    className="btn-secondary-setting"
                    onClick={() => logout()}
                  >
                    <LogOut size={15} />
                    <span>Sign Out</span>
                  </button>

                  <button
                    className="btn-danger-setting"
                    onClick={handleClearCloud}
                  >
                    <Trash2 size={15} />
                    <span>Clear Cloud Backup</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="cloud-signin-box">
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--card-border)',
                  marginBottom: '16px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)'
                }}>
                  <Shield size={16} style={{ color: '#30D158', flexShrink: 0 }} />
                  <span>
                    <strong>Local-First &amp; Private:</strong> No account required to use Watcher. Sign in below only if you want cross-device library synchronization.
                  </span>
                </div>
                <GoogleSignInButton />
              </div>
            )}


            {syncFeedback && (
              <div className="sync-feedback-banner">
                <CheckCircle2 size={15} color="#30D158" />
                <span>{syncFeedback}</span>
              </div>
            )}

            {syncError && (
              <div className="sync-error-banner">
                <AlertTriangle size={15} color="#E50914" />
                <span>{syncError}</span>
              </div>
            )}


          </div>
        </section>

        {/* User Discovery Preferences & Onboarding */}
        <section className="settings-section glass">
          <div className="section-header">
            <Sparkles className="sec-icon" size={18} />
            <h2>Discovery & Cinema Profile</h2>
          </div>
          <div className="section-body">
            <p className="description">
              Customize the film industries, regional languages, and genres used to tailor your Explore feed and smart recommendations.
            </p>

            <div className="profile-summary-box">
              <div className="profile-row">
                <span className="profile-label">Selected Cinema:</span>
                <div className="profile-chips">
                  {selectedLanguageLabels.length > 0 ? (
                    selectedLanguageLabels.map((lbl, idx) => (
                      <span key={idx} className="summary-chip">{lbl}</span>
                    ))
                  ) : (
                    <span className="summary-muted">None selected (default: All)</span>
                  )}
                </div>
              </div>

              <div className="profile-row">
                <span className="profile-label">Favorite Genres:</span>
                <div className="profile-chips">
                  {selectedGenreLabels.length > 0 ? (
                    selectedGenreLabels.map((lbl, idx) => (
                      <span key={idx} className="summary-chip">{lbl}</span>
                    ))
                  ) : (
                    <span className="summary-muted">All Genres</span>
                  )}
                </div>
              </div>

              <div className="profile-row">
                <span className="profile-label">Favorite Stars:</span>
                <div className="profile-chips">
                  {userPrefs.favoriteActors?.length > 0 ? (
                    userPrefs.favoriteActors.map(star => (
                      <span key={star.id} className="summary-chip star-chip">★ {star.name}</span>
                    ))
                  ) : (
                    <span className="summary-muted">No stars selected yet</span>
                  )}
                </div>
              </div>
            </div>

            <div className="profile-buttons-row">
              <Link href="/onboarding" className="btn-primary-setting">
                <Sparkles size={14} />
                <span>Reconfigure Cinema Preferences</span>
              </Link>
              <button className="btn-secondary-setting" onClick={handleResetOnboarding}>
                <RotateCcw size={14} />
                <span>Reset Onboarding</span>
              </button>
            </div>
          </div>
        </section>

        {/* AI Companion & Assistant Persona */}
        <section className="settings-section glass">
          <div className="section-header">
            <Bot className="sec-icon" size={18} />
            <h2>AI Companion & Persona</h2>
          </div>
          <div className="section-body">
            <div className="setting-subgroup">
              <label className="input-label">AI Assistant Name</label>
              <div className="api-input-row">
                <input
                  type="text"
                  placeholder="e.g. Cine, Jarvis, Nova"
                  value={aiAssistantName}
                  onChange={(e) => setAiAssistantName(e.target.value)}
                  className="modal-input"
                />
                <button 
                  className="btn-primary" 
                  onClick={handleSaveAiName}
                  style={{ height: '44px', borderRadius: '10px' }}
                >
                  {aiNameSaved ? <Check size={16} /> : 'Save'}
                </button>
              </div>
              <span className="sub-desc">Name used by your conversational AI cinema companion.</span>
            </div>

            <div className="setting-subgroup">
              <div className="memory-header-row">
                <label className="input-label">AI Taste Memory</label>
                {aiMemory && (
                  <button className="memory-clear-btn" onClick={handleClearAiMemory}>
                    Clear Memory
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                placeholder="Watcher AI automatically notes down your taste profile, favorite genres, and favorite directors here as you chat..."
                value={aiMemory}
                onChange={(e) => setAiMemory(e.target.value)}
                className="memory-textarea"
              />
              <div className="memory-footer">
                <span className="sub-desc">The AI references this memory during conversations to give hyper-personalized recommendations.</span>
                <button 
                  className="btn-secondary-setting" 
                  onClick={handleSaveAiMemory}
                >
                  {aiMemorySaved ? <Check size={14} /> : 'Update Memory'}
                </button>
              </div>
            </div>

            <div className="toggle-item" style={{ marginTop: '6px' }}>
              <div className="toggle-label">
                <span className="toggle-title">Intelligent AI Recommendations</span>
                <span className="toggle-desc">Automatically trigger Gemini cinematic analysis on detail screens.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isAutoAi} 
                  onChange={(e) => handleToggleAutoAi(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </section>

        {/* Gemini API Key */}
        <section className="settings-section glass">
          <div className="section-header">
            <Key className="sec-icon" size={18} />
            <h2>Gemini AI Key (Optional)</h2>
          </div>
          <div className="section-body">
            <p className="description">
              Watcher includes built-in proxy servers for AI recommendations and RSS extraction. Providing your own free Google Gemini API key unlocks unlimited query speed and bypasses shared proxy limits.
            </p>
            <div className="api-input-row">
              <div className="password-input-wrapper">
                <input
                  type={showApiKey ? "text" : "password"}
                  placeholder="Paste your Gemini API Key here (AIzaSy...)"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  className="modal-input"
                />
                <button 
                  type="button" 
                  className="toggle-eye-btn"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button 
                className="btn-primary" 
                onClick={handleSaveApiKey}
                style={{ height: '44px', borderRadius: '10px' }}
              >
                {apiKeySaved ? <Check size={16} /> : 'Save'}
              </button>
            </div>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="helper-link"
            >
              <HelpCircle size={14} />
              <span>Get a free Gemini API Key from Google AI Studio</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </section>

        {/* Video Player Preferences */}
        <section className="settings-section glass">
          <div className="section-header">
            <PlaySquare className="sec-icon" size={18} />
            <h2>Player Preferences</h2>
          </div>
          <div className="section-body">
            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Default Stream Quality</span>
                <span className="toggle-desc">Preferred video resolution for direct HLS and streaming sources.</span>
              </div>
              <div className="segmented-selector">
                {(['auto', '1080p', '720p', '480p'] as PlayerQuality[]).map(q => (
                  <button 
                    key={q}
                    className={playerPrefs.quality === q ? 'active' : ''}
                    onClick={() => handleUpdateQuality(q)}
                  >
                    {q.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Default Audio Volume</span>
                <span className="toggle-desc">Initial playback volume level when entering the player.</span>
              </div>
              <div className="segmented-selector">
                {[
                  { label: '100%', vol: 1 },
                  { label: '80%', vol: 0.8 },
                  { label: '50%', vol: 0.5 },
                  { label: 'Muted', vol: 0 }
                ].map(v => (
                  <button 
                    key={v.label}
                    className={(playerPrefs.muted && v.vol === 0) || (!playerPrefs.muted && playerPrefs.volume === v.vol) ? 'active' : ''}
                    onClick={() => handleUpdateVolume(v.vol)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Auto Credit Skip & Next Episode</span>
                <span className="toggle-desc">Display prompt to skip outro credits and jump to the next series episode.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={autoSkipCredits} 
                  onChange={(e) => handleToggleAutoSkip(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </section>

        {/* Global toggles & Display */}
        <section className="settings-section glass">
          <div className="section-header">
            <Shield className="sec-icon" size={18} />
            <h2>App & Display Settings</h2>
          </div>
          <div className="section-body toggles-list">
            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">High Resolution backdrops</span>
                <span className="toggle-desc">Fetches high-quality originals instead of compressed backdrops.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isHiRes} 
                  onChange={(e) => handleToggleHiRes(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Safe Content Filter</span>
                <span className="toggle-desc">Filters out explicit / adult NSFW media categories and query results.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isNsfwFilter} 
                  onChange={(e) => handleToggleNsfw(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Desktop Release Notifications</span>
                <span className="toggle-desc">Receive notifications for upcoming releases and library updates.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isNotifications} 
                  onChange={(e) => handleToggleNotifications(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Appearance Theme</span>
                <span className="toggle-desc">Switch between sleek dark mode, clean light, or system auto theme.</span>
              </div>
              <div className="segmented-selector">
                {mounted && (
                  <>
                    <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button>
                    <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button>
                    <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')}>System</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* App Updates — only shown in Tauri desktop */}
        {isTauriApp() && (
          <section className="settings-section glass">
            <div className="section-header">
              <RotateCcw className="sec-icon" size={18} style={{ color: '#34C759' }} />
              <h2>App Updates</h2>
            </div>
            <div className="section-body">
              <p className="description">
                Watcher checks GitHub Releases for signed updates. Updates are downloaded and installed seamlessly in the background.
              </p>

              {updateInfo?.available ? (
                <div style={{ background: 'rgba(52, 199, 89, 0.1)', border: '1px solid rgba(52, 199, 89, 0.3)', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 700, color: '#34C759', marginBottom: '6px' }}>🎉 Update Available — v{updateInfo.version}</div>
                  {updateInfo.body && <p style={{ fontSize: '13px', color: 'var(--foreground-muted)', marginBottom: '12px', whiteSpace: 'pre-line' }}>{updateInfo.body.slice(0, 300)}</p>}
                  {isInstallingUpdate ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${updateDownloadProgress}%`, background: 'linear-gradient(90deg, #34C759, #30D158)', transition: 'width 0.3s ease', borderRadius: '4px' }} />
                      </div>
                      <span style={{ fontSize: '12px', color: '#34C759' }}>Downloading... {updateDownloadProgress}%</span>
                    </div>
                  ) : (
                    <button className="btn-primary-setting" onClick={handleInstallUpdate}>
                      <RotateCcw size={14} />
                      <span>Download & Install Now</span>
                    </button>
                  )}
                </div>
              ) : updateInfo && !updateInfo.available ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34C759', fontSize: '13px', marginBottom: '12px' }}>
                  <CheckCircle2 size={16} /> You're on the latest version!
                </div>
              ) : null}

              {updateError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ff6b6b', fontSize: '13px', marginBottom: '12px' }}>
                  <AlertTriangle size={16} /> {updateError}
                </div>
              )}

              <button
                className="btn-secondary-setting"
                onClick={handleCheckUpdate}
                disabled={isCheckingUpdate}
              >
                <RotateCcw size={14} className={isCheckingUpdate ? 'animate-spin' : ''} />
                <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
              </button>
            </div>
          </section>
        )}

        {/* Backup and storage exports */}
        <section className="settings-section glass">
          <div className="section-header">
            <FileJson className="sec-icon" size={18} />
            <h2>Data Management & Backups</h2>
          </div>
          <div className="section-body actions-list">
            <div className="data-action-item">
              <div className="action-info">
                <span className="action-title">Export Watchlist & Library</span>
                <span className="action-desc">Download a backup file containing your watchlist, history, favorite artists, and franchise collections.</span>
              </div>
              <div className="action-btns">
                <button className="btn-secondary-setting" onClick={() => handleExportData('json')}>
                  <FileJson size={14} />
                  <span>JSON Backup</span>
                </button>
                <button className="btn-secondary-setting" onClick={() => handleExportData('txt')}>
                  <FileText size={14} />
                  <span>Text Summary</span>
                </button>
              </div>
            </div>

            <div className="data-action-item">
              <div className="action-info">
                <span className="action-title">Restore Library Backup</span>
                <span className="action-desc">Upload a previously exported JSON backup file to restore your entire library.</span>
              </div>
              <button className="btn-secondary-setting" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} />
                <span>Upload Backup</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json" 
                onChange={handleImportJson} 
              />
            </div>

            <div className="data-action-item danger">
              <div className="action-info">
                <span className="action-title">Wipe Local Database</span>
                <span className="action-desc">Permanently delete watchlist items, favorite stars, franchise collections, history, and AI chat logs.</span>
              </div>
              <button className="btn-danger-setting" onClick={handleWipeLibrary}>
                <Trash2 size={14} />
                <span>Format Data</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        .settings-container {
          max-width: 820px;
          margin: 0 auto;
          padding-bottom: 60px;
        }

        .header-row {
          display: flex;
          align-items: center;
          margin-bottom: 28px;
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
          font-size: 26px;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.5px;
        }

        .settings-sections {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .settings-section {
          border-radius: var(--border-radius-md);
          border: 1px solid var(--card-border);
          padding: 24px;
          background: rgba(20, 20, 25, 0.4);
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 12px;
        }

        .sec-icon {
          color: var(--primary);
        }

        .section-header h2 {
          font-size: 16px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: 0.3px;
        }

        .section-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .description {
          font-size: 13.5px;
          color: var(--foreground-muted);
          line-height: 1.5;
        }

        /* Profile Summary Box */
        .profile-summary-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .profile-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .profile-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--foreground-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .profile-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .summary-chip {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          padding: 3px 10px;
          font-size: 12px;
          color: var(--foreground);
          font-weight: 500;
        }

        .summary-chip.star-chip {
          border-color: rgba(234, 179, 8, 0.3);
          color: #facc15;
          background: rgba(234, 179, 8, 0.08);
        }

        .summary-muted {
          font-size: 12.5px;
          color: var(--foreground-muted);
          font-style: italic;
        }

        .profile-buttons-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 4px;
        }

        .btn-primary-setting {
          background: var(--primary-gradient);
          color: #fff;
          border: none;
          padding: 9px 18px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .btn-primary-setting:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        .btn-secondary-setting {
          background: var(--input-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .btn-secondary-setting:hover {
          background: var(--sidebar-hover);
          border-color: var(--foreground-muted);
        }

        /* Setting Subgroup */
        .setting-subgroup {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .input-label {
          font-size: 13px;
          font-weight: 700;
          color: var(--foreground);
        }

        .sub-desc {
          font-size: 12px;
          color: var(--foreground-muted);
          line-height: 1.4;
        }

        .api-input-row {
          display: flex;
          gap: 10px;
          width: 100%;
        }

        .password-input-wrapper {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
        }

        .toggle-eye-btn {
          position: absolute;
          right: 12px;
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .modal-input {
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 12px;
          color: var(--foreground);
          padding: 12px 16px;
          font-size: 13.5px;
          width: 100%;
          outline: none;
          transition: var(--transition-smooth);
        }

        .modal-input:focus {
          border-color: var(--primary);
          background: var(--input-focus-bg);
        }

        .memory-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .memory-clear-btn {
          background: transparent;
          border: none;
          color: #fca5a5;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
        }

        .memory-textarea {
          width: 100%;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 12px;
          color: var(--foreground);
          padding: 12px 16px;
          font-size: 13px;
          font-family: inherit;
          resize: vertical;
          outline: none;
          line-height: 1.5;
        }

        .memory-textarea:focus {
          border-color: var(--primary);
          background: var(--input-focus-bg);
        }

        .memory-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .helper-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--primary);
          transition: var(--transition-smooth);
          align-self: flex-start;
          text-decoration: none;
        }

        .helper-link:hover {
          filter: brightness(1.2);
          text-decoration: underline;
        }

        /* Segmented Selector */
        .segmented-selector {
          display: flex;
          gap: 6px;
          background: var(--input-bg);
          padding: 4px;
          border-radius: 12px;
          border: 1px solid var(--card-border);
        }

        .segmented-selector button {
          padding: 6px 14px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--foreground-muted);
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .segmented-selector button:hover {
          color: var(--foreground);
        }

        .segmented-selector button.active {
          background: var(--card-bg);
          color: var(--foreground);
          border-color: var(--card-border);
          box-shadow: 0 1px 4px var(--shadow-color);
        }

        /* Switch list */
        .toggles-list {
          gap: 20px;
        }

        .toggle-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
        }

        .toggle-label {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .toggle-title {
          font-size: 14.5px;
          font-weight: 700;
          color: var(--foreground);
        }

        .toggle-desc {
          font-size: 12px;
          color: var(--foreground-muted);
          line-height: 1.4;
        }

        /* HTML5 Switch CSS */
        .switch {
          position: relative;
          display: inline-block;
          width: 46px;
          height: 25px;
          flex-shrink: 0;
        }

        .switch input { 
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(255, 255, 255, 0.1);
          transition: .3s;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 17px;
          width: 17px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        input:checked + .slider {
          background-color: var(--primary);
        }

        input:checked + .slider:before {
          transform: translateX(21px);
        }

        .slider.round {
          border-radius: 34px;
        }

        .slider.round:before {
          border-radius: 50%;
        }

        /* Actions list */
        .actions-list {
          gap: 16px;
        }

        .data-action-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          border-bottom: 1px dashed rgba(255,255,255,0.04);
          gap: 24px;
        }

        .data-action-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .action-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .action-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--foreground);
        }

        .action-desc {
          font-size: 12px;
          color: var(--foreground-muted);
          line-height: 1.4;
        }

        .action-btns {
          display: flex;
          gap: 8px;
        }

        .btn-danger-setting {
          background: rgba(239, 68, 68, 0.12);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.25);
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .btn-danger-setting:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.5);
          color: #fff;
          transform: translateY(-1px);
        }

        /* Cloud Sync UI */
        .cloud-connected-box {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: rgba(0, 180, 216, 0.04);
          border: 1px solid rgba(0, 180, 216, 0.2);
          border-radius: 16px;
          padding: 20px;
        }

        .cloud-user-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .cloud-avatar-wrap {
          flex-shrink: 0;
        }

        .cloud-avatar-img {
          width: 52px;
          height: 52px;
          border-radius: 26px;
          border: 2px solid #00B4D8;
          object-fit: cover;
        }

        .cloud-avatar-placeholder {
          width: 52px;
          height: 52px;
          border-radius: 26px;
          background: var(--primary);
          color: #fff;
          font-weight: 800;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cloud-user-meta {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .cloud-name-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cloud-user-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--foreground);
        }

        .cloud-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 9999px;
          background: rgba(48, 209, 88, 0.15);
          color: #30D158;
          font-size: 11px;
          font-weight: 700;
        }

        .cloud-user-email {
          font-size: 13px;
          color: var(--text-muted);
        }

        .cloud-sync-time {
          font-size: 11px;
          color: var(--foreground-muted);
          margin-top: 2px;
        }

        .syncing-text {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #FFD60A;
          font-weight: 600;
        }

        .cloud-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .cloud-signin-box {
          padding: 10px 0;
        }

        .sync-feedback-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(48, 209, 88, 0.12);
          border: 1px solid rgba(48, 209, 88, 0.3);
          color: #30D158;
          font-size: 13px;
          font-weight: 600;
          padding: 10px 16px;
          border-radius: 12px;
          margin-top: 12px;
        }

        .sync-error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(229, 9, 20, 0.12);
          border: 1px solid rgba(229, 9, 20, 0.3);
          color: #ff6b6b;
          font-size: 13px;
          padding: 10px 16px;
          border-radius: 12px;
          margin-top: 12px;
        }
      `}</style>
    </div>
  );
}
