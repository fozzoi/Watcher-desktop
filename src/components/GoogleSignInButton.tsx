"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sparkles, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

interface Props {
  onSuccess?: () => void;
}

export default function GoogleSignInButton({ onSuccess }: Props) {
  const { user, loginWithGoogle, loginWithDemo, googleClientId, isLoading, syncError } = useAuth();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Load Google Identity Services SDK script dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setScriptLoaded(true);
    };
    script.onerror = () => {
      console.warn('Could not load Google Sign-In script from accounts.google.com');
    };
    document.body.appendChild(script);

    return () => {
      // Keep script in head/body
    };
  }, []);

  // Pre-initialize Google ID credentials callback if script is loaded
  useEffect(() => {
    if (!scriptLoaded || typeof window === 'undefined' || !window.google?.accounts?.id || !googleClientId) return;

    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          if (response?.credential) {
            setIsAuthenticating(true);
            const ok = await loginWithGoogle(response.credential);
            setIsAuthenticating(false);
            if (ok && onSuccess) onSuccess();
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
    } catch (err: any) {
      console.warn('Google accounts.id pre-init warning:', err);
    }
  }, [scriptLoaded, googleClientId, loginWithGoogle, onSuccess]);

  // Primary interactive Google Sign-In click handler
  const handleGoogleSignInClick = () => {
    setInitError(null);

    if (!googleClientId) {
      setInitError('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured in environment variables.');
      return;
    }

    setIsAuthenticating(true);

    // 1. Google OAuth2 Token Client (Interactive direct user gesture - prevents popup blocking)
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'email profile openid',
          callback: async (tokenResponse: any) => {
            if (tokenResponse?.error) {
              setIsAuthenticating(false);
              if (tokenResponse.error === 'popup_closed_by_user') {
                return;
              }
              console.error('Google OAuth token response error:', tokenResponse);
              setInitError(tokenResponse.error_description || tokenResponse.error || 'Google Sign-In failed.');
              return;
            }

            if (tokenResponse?.access_token) {
              const ok = await loginWithGoogle(undefined, tokenResponse.access_token);
              setIsAuthenticating(false);
              if (ok && onSuccess) onSuccess();
            } else {
              setIsAuthenticating(false);
            }
          },
          error_callback: (err: any) => {
            setIsAuthenticating(false);
            console.error('Google token client error:', err);
            setInitError(err?.message || 'Failed to open Google sign-in window. Check popup permissions.');
          },
        });

        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err: any) {
        console.warn('Google oauth2 client init exception, falling back:', err);
      }
    }

    // 2. Google Identity Services ID prompt fallback
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification: any) => {
          setIsAuthenticating(false);
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.warn('Google One Tap suppressed:', notification.getNotDisplayedReason?.());
          }
        });
        return;
      } catch (e: any) {
        console.warn('Google ID prompt error:', e);
      }
    }

    // 3. Direct browser OAuth popup fallback
    try {
      const redirectUri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email%20profile%20openid`;

      const popup = window.open(authUrl, 'google_oauth_popup', 'width=500,height=600,menubar=no,toolbar=no');
      if (popup) {
        const pollTimer = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(pollTimer);
              setIsAuthenticating(false);
              return;
            }
            if (popup.location && popup.location.href.includes(redirectUri)) {
              const hash = popup.location.hash;
              const params = new URLSearchParams(hash.replace(/^#/, ''));
              const accessToken = params.get('access_token');
              if (accessToken) {
                clearInterval(pollTimer);
                popup.close();
                loginWithGoogle(undefined, accessToken).then((ok) => {
                  setIsAuthenticating(false);
                  if (ok && onSuccess) onSuccess();
                });
              }
            }
          } catch (crossOriginErr) {
            // Cross-origin until redirected back
          }
        }, 500);
        return;
      }
    } catch (directErr) {
      console.warn('Direct popup error:', directErr);
    }

    setIsAuthenticating(false);
    setInitError('Could not open Google Sign-In. Please check your internet connection or try Instant Guest Sync.');
  };

  const handleDemoSignIn = async () => {
    setIsDemoLoading(true);
    const ok = await loginWithDemo();
    setIsDemoLoading(false);
    if (ok && onSuccess) onSuccess();
  };

  if (user) {
    return (
      <div className="signed-in-card glass">
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
          <span className="user-status">🟢 Cloud Connected</span>
        </div>
      </div>
    );
  }

  return (
    <div className="google-auth-container">
      {/* Primary Clickable Google Sign-In Button */}
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
            <span>Sign in with Google</span>
          </>
        )}
      </button>

      {/* 1-Click Guest Sync Fallback Option */}
      <div className="demo-signin-section">
        <div className="divider-row">
          <span className="divider-line" />
          <span className="divider-text">OR 1-CLICK INSTANT SYNC</span>
          <span className="divider-line" />
        </div>

        <button
          type="button"
          onClick={handleDemoSignIn}
          disabled={isLoading || isDemoLoading || isAuthenticating}
          className="demo-signin-btn glass"
        >
          {isDemoLoading ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              <span>Connecting Guest Cloud...</span>
            </>
          ) : (
            <>
              <Sparkles size={15} color="#FFD700" />
              <span>Continue as Guest (1-Click Sync)</span>
            </>
          )}
        </button>
      </div>

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
        .google-auth-container {
          display: flex;
          flex-direction: column;
          gap: 14px;
          align-items: center;
          width: 100%;
          max-width: 340px;
          margin: 0 auto;
        }
        .google-native-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          max-width: 280px;
          height: 44px;
          border-radius: 9999px;
          background: #131314;
          color: #e3e3e3;
          border: 1px solid #5f6368;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        .google-native-btn:hover:not(:disabled) {
          background: #202124;
          border-color: #8e918f;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .google-native-btn:active:not(:disabled) {
          transform: translateY(0);
          background: #303134;
        }
        .google-native-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .google-icon {
          flex-shrink: 0;
        }

        .demo-signin-section {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .divider-row {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          margin: 2px 0;
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
        }
        .divider-text {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.8px;
        }
        .demo-signin-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 215, 0, 0.25);
          background: rgba(255, 215, 0, 0.06);
          color: #fff;
          font-weight: 600;
          font-size: 12.5px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
        }
        .demo-signin-btn:hover:not(:disabled) {
          background: rgba(255, 215, 0, 0.12);
          border-color: rgba(255, 215, 0, 0.45);
          transform: translateY(-1px);
        }
        .demo-signin-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(229, 9, 20, 0.12);
          border: 1px solid rgba(229, 9, 20, 0.3);
          color: #ff6b6b;
          font-size: 12px;
          padding: 8px 14px;
          border-radius: 10px;
          width: 100%;
          line-height: 1.35;
        }
        .signed-in-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid rgba(48, 209, 88, 0.3);
          background: rgba(48, 209, 88, 0.05);
          width: 100%;
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
          color: var(--text-muted);
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
