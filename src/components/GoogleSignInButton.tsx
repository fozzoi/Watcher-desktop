"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sparkles, LogIn, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

interface Props {
  onSuccess?: () => void;
}

export default function GoogleSignInButton({ onSuccess }: Props) {
  const { user, loginWithGoogle, loginWithDemo, googleClientId, isLoading, isSyncing, syncError } = useAuth();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Load Google Identity Services SDK script dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.id) {
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
      setInitError('Could not load Google Sign-In script. Check network connection.');
    };
    document.body.appendChild(script);

    return () => {
      // Keep script in head/body
    };
  }, []);

  // Initialize and render Google button when script and clientId are ready
  useEffect(() => {
    if (!scriptLoaded || !buttonRef.current || !window.google?.accounts?.id) return;
    if (!googleClientId) return;

    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          if (response?.credential) {
            const ok = await loginWithGoogle(response.credential);
            if (ok && onSuccess) onSuccess();
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear previous button content
      buttonRef.current.innerHTML = '';

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 260,
        logo_alignment: 'left',
      });
    } catch (err: any) {
      console.error('Google button render error:', err);
      setInitError(err?.message || 'Failed to render Google button');
    }
  }, [scriptLoaded, googleClientId, loginWithGoogle, onSuccess]);

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
      {/* Official Google Sign-In Button */}
      {googleClientId ? (
        <div className="gsi-button-wrapper">
          <div ref={buttonRef} className="google-btn-slot" />
        </div>
      ) : (
        <button
          className="google-native-btn"
          onClick={() => {
            setInitError('Google Sign-In requires configuring NEXT_PUBLIC_GOOGLE_CLIENT_ID.');
          }}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Sign in with Google</span>
        </button>
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
        .google-auth-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
          width: 100%;
          max-width: 360px;
          margin: 0 auto;
        }
        .gsi-button-wrapper {
          min-height: 44px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .google-native-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 260px;
          height: 44px;
          border-radius: 9999px;
          background: #131314;
          color: #e3e3e3;
          border: 1px solid #5f6368;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .google-native-btn:hover {
          background: #202124;
          border-color: #8e918f;
        }
        .google-icon {
          flex-shrink: 0;
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
