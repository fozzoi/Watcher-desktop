"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, AlertCircle, RefreshCw, ExternalLink, Zap, Info } from 'lucide-react';
import { openExternalUrl } from '@/utils/browser';

interface Props {
  onSuccess?: () => void;
}

export default function GoogleSignInButton({ onSuccess }: Props) {
  const { user, loginWithGoogle, loginWithDemo, loginWithToken, googleClientId, isLoading, syncError } = useAuth();
  const [initError, setInitError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isDemoConnecting, setIsDemoConnecting] = useState(false);
  const [showGoogleHelp, setShowGoogleHelp] = useState(false);
  const [syncToken, setSyncToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  const isDesktop = typeof window !== 'undefined' && (
    window.location.origin.includes('tauri') || 
    window.location.origin.includes('localhost:1420') || 
    window.location.protocol === 'tauri:' ||
    !!(window as any).__TAURI_INTERNALS__
  );

  // Check URL hash for OAuth redirect token (#access_token=...) when returning from Google
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash) return;
    if (window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const returnedToken = params.get('access_token');
      if (returnedToken) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setIsAuthenticating(true);
        loginWithGoogle(undefined, returnedToken).then((ok) => {
          setIsAuthenticating(false);
          if (ok && onSuccess) onSuccess();
        });
      }
    }
  }, [loginWithGoogle, onSuccess]);

  // Primary Google Sign-In click handler
  const handleGoogleSignInClick = () => {
    setInitError(null);

    // On Desktop Tauri: Never navigate the Tauri window to external OAuth pages (prevents 404 trap)
    if (isDesktop) {
      openExternalUrl('https://thewatchercom.vercel.app/settings');
      setShowGoogleHelp(true);
      return;
    }

    if (!googleClientId) {
      setInitError('Google Client ID is missing. Please configure NEXT_PUBLIC_GOOGLE_CLIENT_ID.');
      return;
    }

    setIsAuthenticating(true);

    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      googleClientId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=token&scope=email%20profile%20openid&prompt=select_account`;

    // 1. Try opening popup window synchronously in the user click gesture
    let popup: Window | null = null;
    try {
      popup = window.open(authUrl, 'google_login_popup', 'width=500,height=650,menubar=no,toolbar=no,status=no');
    } catch (e) {
      popup = null;
    }

    // 2. If popup was blocked on web, redirect current page directly
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = authUrl;
      return;
    }

    // 3. If popup opened successfully, poll for completion
    const timer = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(timer);
          setIsAuthenticating(false);
          return;
        }

        if (popup.location && popup.location.href.includes(redirectUri)) {
          const hash = popup.location.hash;
          if (hash.includes('access_token=')) {
            clearInterval(timer);
            popup.close();
            const params = new URLSearchParams(hash.replace(/^#/, ''));
            const returnedToken = params.get('access_token');
            if (returnedToken) {
              loginWithGoogle(undefined, returnedToken).then((ok) => {
                setIsAuthenticating(false);
                if (ok && onSuccess) onSuccess();
              });
            }
          }
        }
      } catch (err) {
        // Cross-origin exception while on accounts.google.com
      }
    }, 500);
  };

  const handleDesktopTokenLogin = async () => {
    setTokenError(null);
    const ok = await loginWithToken(syncToken);
    if (!ok) setTokenError('That session token was rejected. Copy a fresh one from Web settings and retry.');
  };

  const handleInstantSyncClick = async () => {
    setIsDemoConnecting(true);
    setInitError(null);
    try {
      const ok = await loginWithDemo();
      if (ok && onSuccess) {
        onSuccess();
      }
    } catch (e) {
      console.error("Instant sync failed:", e);
    } finally {
      setIsDemoConnecting(false);
    }
  };

  if (user) {
    return (
      <div className="signed-in-card glass">
        <div className="user-profile-header">
          <div className="user-avatar-wrap">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="user-avatar-img" />
            ) : (
              <div className="user-avatar-placeholder">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="user-details">
            <div className="user-name-row">
              <span className="user-name">{user.name}</span>
              <CheckCircle2 size={15} className="verified-badge" />
            </div>
            <span className="user-email">{user.email}</span>
            <span className="user-status">🟢 Cloud Connected & Synced</span>
          </div>
        </div>

        <style jsx>{`
          .signed-in-card {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            border-radius: 18px;
            border: 1px solid rgba(48, 209, 88, 0.3);
            background: rgba(48, 209, 88, 0.05);
            width: 100%;
          }
          .user-profile-header {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .user-avatar-wrap {
            position: relative;
          }
          .user-avatar-img {
            width: 46px;
            height: 46px;
            border-radius: 23px;
            object-fit: cover;
            border: 2px solid rgba(48, 209, 88, 0.5);
          }
          .user-avatar-placeholder {
            width: 46px;
            height: 46px;
            border-radius: 23px;
            background: var(--primary);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 18px;
          }
          .user-details {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .user-name-row {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .user-name {
            font-weight: 700;
            font-size: 15px;
            color: var(--foreground);
          }
          .verified-badge {
            color: #30D158;
          }
          .user-email {
            font-size: 12px;
            color: var(--foreground-muted);
          }
          .user-status {
            font-size: 11px;
            color: #30D158;
            font-weight: 600;
            margin-top: 2px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="auth-box-container">
      {/* Primary Recommended Option: 1-Click Instant Cloud Sync */}
      <button
        type="button"
        className="instant-sync-btn"
        onClick={handleInstantSyncClick}
        disabled={isLoading || isDemoConnecting}
      >
        {isDemoConnecting ? (
          <>
            <RefreshCw size={17} className="animate-spin" />
            <span>Connecting to Watcher Cloud...</span>
          </>
        ) : (
          <>
            <Zap size={18} fill="#f59e0b" stroke="#f59e0b" />
            <div className="btn-text-col">
              <span className="btn-main-title">1-Click Cloud Sync</span>
              <span className="btn-sub-title">Instant sync without any Google account setup</span>
            </div>
          </>
        )}
      </button>

      <div className="auth-divider">
        <span>or sign in with Google</span>
      </div>

      {/* Google Sign-In Button */}
      <button
        type="button"
        className="google-native-btn"
        onClick={handleGoogleSignInClick}
        disabled={isLoading || isAuthenticating}
      >
        {isAuthenticating ? (
          <>
            <RefreshCw size={17} className="animate-spin" />
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{isDesktop ? 'Sign in with Google (Web)' : 'Sign in with Google'}</span>
            {isDesktop && <ExternalLink size={14} style={{ opacity: 0.7 }} />}
          </>
        )}
      </button>

      {/* Helpful Hint on Desktop */}
      {isDesktop && showGoogleHelp && (
        <div className="google-help-card">
          <Info size={16} className="help-icon" />
          <p>
            Sign in on <strong>thewatchercom.vercel.app</strong>, then use <strong>Copy desktop sign-in token</strong> in Web Settings and paste it below.
          </p>
        </div>
      )}

      {isDesktop && showGoogleHelp && (
        <div className="desktop-token-login">
          <input
            type="password"
            value={syncToken}
            onChange={(event) => setSyncToken(event.target.value)}
            placeholder="Paste desktop sign-in token"
            aria-label="Desktop sign-in token"
            autoComplete="off"
          />
          <button type="button" onClick={handleDesktopTokenLogin} disabled={isLoading || !syncToken.trim()}>
            {isLoading ? 'Connecting…' : 'Connect account'}
          </button>
          {tokenError && <span className="token-error">{tokenError}</span>}
        </div>
      )}

      {syncError && (
        <div className="auth-error-banner">
          <AlertCircle size={15} />
          <span>{syncError}</span>
        </div>
      )}

      {initError && (
        <div className="auth-error-banner">
          <AlertCircle size={15} />
          <span>{initError}</span>
        </div>
      )}

      <style jsx>{`
        .auth-box-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          max-width: 440px;
        }

        .instant-sync-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(229, 9, 20, 0.15) 100%);
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: var(--foreground);
          padding: 12px 18px;
          border-radius: 14px;
          cursor: pointer;
          transition: var(--transition-smooth);
          text-align: left;
          width: 100%;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
        }

        .instant-sync-btn:hover {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(229, 9, 20, 0.25) 100%);
          border-color: rgba(245, 158, 11, 0.6);
          transform: translateY(-1px);
        }

        .btn-text-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .btn-main-title {
          font-size: 14.5px;
          font-weight: 700;
          color: #f59e0b;
        }

        .btn-sub-title {
          font-size: 11.5px;
          color: var(--foreground-muted);
        }

        .auth-divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: var(--foreground-muted);
          font-size: 11.5px;
          margin: 2px 0;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid var(--card-border);
        }

        .auth-divider span {
          padding: 0 10px;
          opacity: 0.6;
        }

        .google-native-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #ffffff;
          color: #1f1f1f;
          border: 1px solid rgba(0, 0, 0, 0.15);
          padding: 10px 20px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
          width: 100%;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .google-native-btn:hover {
          background: #f8f9fa;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: translateY(-1px);
        }

        .google-native-btn:active {
          transform: translateY(0);
        }

        .google-help-card {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.25);
          color: var(--foreground);
          font-size: 12px;
          line-height: 1.4;
        }

        .desktop-token-login { display: flex; flex-direction: column; gap: 8px; }
        .desktop-token-login input { width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--card-border); background: var(--background); color: var(--foreground); }
        .desktop-token-login button { padding: 10px 14px; border: 0; border-radius: 10px; background: var(--primary); color: white; font-weight: 700; cursor: pointer; }
        .desktop-token-login button:disabled { opacity: .55; cursor: not-allowed; }
        .token-error { color: #ff6b72; font-size: 12px; }

        .help-icon {
          color: #3b82f6;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .auth-error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(229, 9, 20, 0.1);
          border: 1px solid rgba(229, 9, 20, 0.3);
          color: #ff6b72;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
