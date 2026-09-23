"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AsyncStorage } from '@/utils/storage';
import { syncManager, CloudLibrary } from '@/utils/syncManager';

const AUTH_API_BASE = 'https://watcher-api-rho.vercel.app';
const DEFAULT_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '36298979840-vdgsir6fd1kkaj28m24r6mmdq7p1fdg7.apps.googleusercontent.com';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  picture: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  googleClientId: string;
  setGoogleClientId: (id: string) => void;
  loginWithGoogle: (idToken?: string, accessToken?: string) => Promise<boolean>;
  loginWithDemo: () => Promise<boolean>;
  logout: () => Promise<void>;
  syncNow: () => Promise<boolean>;
  clearCloudData: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientIdState] = useState<string>(DEFAULT_CLIENT_ID);

  // Load custom client id if stored
  const setGoogleClientId = useCallback((id: string) => {
    setGoogleClientIdState(id);
    AsyncStorage.setItem('custom_google_client_id', id);
  }, []);

  // Initialize from storage on startup
  useEffect(() => {
    async function initAuth() {
      try {
        const [savedToken, savedUser, savedSyncTime, customId] = await Promise.all([
          AsyncStorage.getItem('watcher_auth_token'),
          AsyncStorage.getItem('watcher_auth_user'),
          AsyncStorage.getItem('last_cloud_sync'),
          AsyncStorage.getItem('custom_google_client_id'),
        ]);

        if (customId) {
          setGoogleClientIdState(customId);
        }

        if (savedSyncTime) {
          setLastSyncedAt(savedSyncTime);
        }

        if (savedToken && savedUser) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setToken(savedToken);

          // Verify session in background
          axios.get(`${AUTH_API_BASE}/api/auth`, {
            headers: { Authorization: `Bearer ${savedToken}` },
            timeout: 8000,
          }).then(async (res) => {
            if (res.data?.user) {
              setUser(res.data.user);
              await AsyncStorage.setItem('watcher_auth_user', JSON.stringify(res.data.user));
              // Trigger silent initial cloud sync on launch
              syncManager.performSync(savedToken, 'merge').then((syncRes) => {
                if (syncRes.success) {
                  setLastSyncedAt(new Date().toISOString());
                }
              });
            }
          }).catch((err) => {
            console.warn('Session verification failed or expired:', err?.response?.status);
            if (err?.response?.status === 401) {
              logout();
            }
          });
        }
      } catch (e) {
        console.error('Error initializing auth:', e);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  // Google Login handler
  const loginWithGoogle = async (idToken?: string, accessToken?: string): Promise<boolean> => {
    if (!idToken && !accessToken) {
      setSyncError('Missing Google credentials');
      return false;
    }

    setIsLoading(true);
    setSyncError(null);

    try {
      const response = await axios.post(`${AUTH_API_BASE}/api/auth`, {
        idToken,
        accessToken,
      }, { timeout: 12000 });

      const { user: profile, token: newToken } = response.data;
      if (!profile || !newToken) {
        throw new Error('Invalid authentication response from server');
      }

      setUser(profile);
      setToken(newToken);

      await Promise.all([
        AsyncStorage.setItem('watcher_auth_token', newToken),
        AsyncStorage.setItem('watcher_auth_user', JSON.stringify(profile)),
      ]);

      // Immediate first-time merge sync upon logging in
      setIsSyncing(true);
      const syncRes = await syncManager.performSync(newToken, 'merge');
      setIsSyncing(false);

      if (syncRes.success) {
        setLastSyncedAt(new Date().toISOString());
      }

      return true;
    } catch (err: any) {
      console.error('Google login failed:', err?.response?.data || err.message);
      setSyncError(err?.response?.data?.error || 'Failed to authenticate with Google');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Instant Demo Account Sign-In for zero-friction testing
  const loginWithDemo = async (): Promise<boolean> => {
    setIsLoading(true);
    setSyncError(null);

    try {
      const response = await axios.post(`${AUTH_API_BASE}/api/auth`, {
        action: 'demo',
      }, { timeout: 12000 });

      const { user: profile, token: newToken } = response.data;
      if (!profile || !newToken) throw new Error('Invalid demo response');

      setUser(profile);
      setToken(newToken);

      await Promise.all([
        AsyncStorage.setItem('watcher_auth_token', newToken),
        AsyncStorage.setItem('watcher_auth_user', JSON.stringify(profile)),
      ]);

      setIsSyncing(true);
      const syncRes = await syncManager.performSync(newToken, 'merge');
      setIsSyncing(false);

      if (syncRes.success) {
        setLastSyncedAt(new Date().toISOString());
      }

      return true;
    } catch (err: any) {
      console.error('Demo login failed:', err?.response?.data || err.message);
      setSyncError('Failed to sign in with demo account');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout handler
  const logout = async (): Promise<void> => {
    setUser(null);
    setToken(null);
    setSyncError(null);
    await Promise.all([
      AsyncStorage.removeItem('watcher_auth_token'),
      AsyncStorage.removeItem('watcher_auth_user'),
    ]);
  };

  // Manual Trigger Sync
  const syncNow = async (): Promise<boolean> => {
    if (!token) {
      setSyncError('Please sign in to sync with the cloud');
      return false;
    }

    setIsSyncing(true);
    setSyncError(null);

    const res = await syncManager.performSync(token, 'merge');
    setIsSyncing(false);

    if (res.success) {
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      return true;
    } else {
      setSyncError(res.error || 'Sync failed');
      return false;
    }
  };

  // Clear cloud library
  const clearCloudData = async (): Promise<boolean> => {
    if (!token) return false;
    setIsSyncing(true);
    const success = await syncManager.clearCloudLibrary(token);
    setIsSyncing(false);
    if (success) {
      setLastSyncedAt(null);
    }
    return success;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isSyncing,
        lastSyncedAt,
        syncError,
        googleClientId,
        setGoogleClientId,
        loginWithGoogle,
        loginWithDemo,
        logout,
        syncNow,
        clearCloudData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
