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
      {/* 1. Official Google Sign-In Button (When Client ID configured) */}
      {googleClientId ? (
        <div className="gsi-button-wrapper">
          <div ref={buttonRef} className="google-btn-slot" />
        </div>
      ) : (
        <div className="client-id-notice">
          <p className="notice-title">Sign in with your Google Account</p>
          <p className="notice-sub">
            To connect your personal Google account, enter your <strong>Google OAuth Client ID</strong> in Settings.
          </p>
        </div>
      )}

      {/* 2. Instant Demo / Test Account Button */}
      <div className="demo-signin-section">
        <div className="divider-row">
          <span className="divider-line" />
          <span className="divider-text">OR TEST INSTANTLY</span>
          <span className="divider-line" />
        </div>

        <button
          onClick={handleDemoSignIn}
          disabled={isLoading || isDemoLoading}
          className="demo-signin-btn glass"
        >
          {isDemoLoading ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Connecting Demo Cloud...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} color="#FFD700" />
              <span>Instant Demo Account (1-Click Cloud Sync)</span>
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
        .client-id-notice {
          text-align: center;
          padding: 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }
        .notice-title {
          font-weight: 700;
          font-size: 14.5px;
          color: var(--foreground);
          margin-bottom: 4px;
        }
        .notice-sub {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.4;
        }
        .divider-row {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          margin: 4px 0;
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
        }
        .divider-text {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.8px;
        }
        .demo-signin-section {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .demo-signin-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 18px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 215, 0, 0.3);
          background: rgba(255, 215, 0, 0.08);
          color: #fff;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
        }
        .demo-signin-btn:hover {
          background: rgba(255, 215, 0, 0.16);
          border-color: rgba(255, 215, 0, 0.5);
          transform: translateY(-1px);
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
