"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, Smartphone, Monitor, Terminal, Globe, ShieldCheck, Info, ExternalLink, RefreshCw } from 'lucide-react';
import MicroSlats from '@/components/MicroSlats';
import SpecularButton from '@/components/SpecularButton';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  assets: ReleaseAsset[];
  html_url: string;
}

interface PlatformConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  repo: string;
  description: string;
  fallbackDownloadUrl: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    key: 'android',
    label: 'Android (APK)',
    icon: Smartphone,
    color: '#3DDC84',
    repo: 'fozzoi/Watcher',
    description: 'Mobile app for phones and tablets',
    fallbackDownloadUrl: 'https://github.com/fozzoi/Watcher/releases/latest/download/watcher.apk',
  },
  {
    key: 'windows',
    label: 'Windows (EXE)',
    icon: Monitor,
    color: '#0078D6',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Desktop app for Windows (x64 setup)',
    fallbackDownloadUrl: 'https://github.com/fozzoi/Watcher-desktop/releases/latest',
  },
  {
    key: 'linux-appimage',
    label: 'Linux (AppImage)',
    icon: Terminal,
    color: '#FCC624',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Universal standalone Linux package',
    fallbackDownloadUrl: 'https://github.com/fozzoi/Watcher-desktop/releases/latest',
  },
  {
    key: 'linux-deb',
    label: 'Linux (DEB)',
    icon: Terminal,
    color: '#E95420',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Debian / Ubuntu / Mint package',
    fallbackDownloadUrl: 'https://github.com/fozzoi/Watcher-desktop/releases/latest',
  },
  {
    key: 'linux-rpm',
    label: 'Linux (RPM)',
    icon: Terminal,
    color: '#294172',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Red Hat / Fedora / openSUSE package',
    fallbackDownloadUrl: 'https://github.com/fozzoi/Watcher-desktop/releases/latest',
  },
  {
    key: 'linux-flatpak',
    label: 'Linux (Flatpak)',
    icon: Terminal,
    color: '#4A90E2',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Flatpak universal sandboxed package',
    fallbackDownloadUrl: 'https://github.com/fozzoi/Watcher-desktop/releases/latest',
  },
];

const CACHE_KEY = 'watcher_download_releases_v2';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

export default function DownloadPage() {
  const [releases, setReleases] = useState<Record<string, GitHubRelease | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // 1. Instant Cache Hydration (0ms load on returns / warm starts)
    let hasValidCache = false;
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) || sessionStorage.getItem(CACHE_KEY) : null;
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (data && typeof data === 'object') {
          setReleases(data);
          setLoading(false);
          hasValidCache = true;
          // If cache is fresh, defer quiet revalidation slightly to avoid competing with initial paint
          if (Date.now() - timestamp < CACHE_TTL_MS) {
            const timer = setTimeout(() => {
              if (mounted) fetchReleases(true);
            }, 3000);
            return () => {
              mounted = false;
              clearTimeout(timer);
            };
          }
        }
      }
    } catch {
      // Ignore cache storage errors
    }

    // 2. Fetch releases (deduplicated: exactly 2 requests in parallel instead of 5)
    fetchReleases(!hasValidCache);

    async function fetchReleases(showSkeletonIfCold: boolean) {
      if (showSkeletonIfCold && !hasValidCache) {
        setLoading(true);
      }

      try {
        const [androidRes, desktopRes] = await Promise.allSettled([
          fetch('https://api.github.com/repos/fozzoi/Watcher/releases/latest', {
            headers: { Accept: 'application/vnd.github+json' },
          }).then((r) => (r.ok ? r.json() : null)),
          fetch('https://api.github.com/repos/fozzoi/Watcher-desktop/releases/latest', {
            headers: { Accept: 'application/vnd.github+json' },
          }).then((r) => (r.ok ? r.json() : null)),
        ]);

        const androidRelease: GitHubRelease | null = androidRes.status === 'fulfilled' ? androidRes.value : null;
        const desktopRelease: GitHubRelease | null = desktopRes.status === 'fulfilled' ? desktopRes.value : null;

        const mapped: Record<string, GitHubRelease | null> = {
          android: androidRelease,
          windows: desktopRelease,
          'linux-appimage': desktopRelease,
          'linux-deb': desktopRelease,
          'linux-rpm': desktopRelease,
          'linux-flatpak': desktopRelease,
        };

        if (mounted) {
          setReleases(mapped);
          setLoading(false);
          setError(null);

          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({
                timestamp: Date.now(),
                data: mapped,
              })
            );
          } catch {
            // Storage quota handled safely
          }
        }
      } catch (err) {
        if (mounted) {
          if (!hasValidCache) {
            setError('Could not reach GitHub API. Direct fallback download links are available below.');
          }
          setLoading(false);
        }
      }
    }

    return () => {
      mounted = false;
    };
  }, []);

  const getAssetUrl = (release: GitHubRelease | null, key: string): string | null => {
    if (!release?.assets) return null;
    const lowerKey = key.toLowerCase();
    
    if (lowerKey === 'android') {
      return release.assets.find((a) => a.name.toLowerCase().endsWith('.apk'))?.browser_download_url || null;
    }
    if (lowerKey === 'windows') {
      return release.assets.find((a) => a.name.toLowerCase().endsWith('.exe'))?.browser_download_url || null;
    }
    if (lowerKey === 'linux-appimage') {
      return release.assets.find((a) => a.name.toLowerCase().endsWith('.appimage'))?.browser_download_url || null;
    }
    if (lowerKey === 'linux-deb') {
      return release.assets.find((a) => a.name.toLowerCase().endsWith('.deb'))?.browser_download_url || null;
    }
    if (lowerKey === 'linux-rpm') {
      return release.assets.find((a) => a.name.toLowerCase().endsWith('.rpm'))?.browser_download_url || null;
    }
    if (lowerKey === 'linux-flatpak') {
      return release.assets.find((a) => a.name.toLowerCase().includes('flatpak'))?.browser_download_url || null;
    }
    return null;
  };

  const getAssetSize = (release: GitHubRelease | null, key: string): string => {
    if (!release?.assets) return '';
    const lowerKey = key.toLowerCase();
    let asset: ReleaseAsset | undefined;

    if (lowerKey === 'android') {
      asset = release.assets.find((a) => a.name.toLowerCase().endsWith('.apk'));
    } else if (lowerKey === 'windows') {
      asset = release.assets.find((a) => a.name.toLowerCase().endsWith('.exe'));
    } else if (lowerKey === 'linux-appimage') {
      asset = release.assets.find((a) => a.name.toLowerCase().endsWith('.appimage'));
    } else if (lowerKey === 'linux-deb') {
      asset = release.assets.find((a) => a.name.toLowerCase().endsWith('.deb'));
    } else if (lowerKey === 'linux-rpm') {
      asset = release.assets.find((a) => a.name.toLowerCase().endsWith('.rpm'));
    } else if (lowerKey === 'linux-flatpak') {
      asset = release.assets.find((a) => a.name.toLowerCase().includes('flatpak'));
    }

    if (!asset || !asset.size) return '';
    return `${(asset.size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="download-page animate-fade-in-up">
      {/* Hero Header with interactive micro slats */}
      <div className="download-hero">
        <div className="download-hero-slats">
          <MicroSlats
            preset="storm"
            color="#e50914"
            glintColor="#ff6b6b"
            backgroundColor="transparent"
            slatWidth={6}
            slatHeight={18}
            gap={2}
            roundness={0.7}
            interactive
            cursorStrength={0.8}
            cursorSize={45}
            swirl={0.5}
            trail={1.6}
            perspective={0.3}
            fog={0.5}
            speed={0.8}
            intro
            introDuration={1.2}
          />
        </div>
        <div className="hero-content">
          <h1>Download Watcher</h1>
          <p>Stream and track your favorite movies & series anywhere on Android, Windows, or Linux.</p>
          <div className="hero-actions">
            <SpecularButton
              size="md"
              radius={10}
              tint="#ffffff"
              tintOpacity={0.06}
              textColor="#f5f5f5"
              lineColor="#888888"
              baseColor="#444444"
              intensity={0.9}
              idleIntensity={0.3}
              thickness={1}
              glow={0.7}
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/';
              }}
            >
              <Globe size={16} />
              <span>Back to Home</span>
            </SpecularButton>
          </div>
        </div>
      </div>

      {error && (
        <div className="download-error-banner animate-fade-in-up">
          <Info size={18} />
          <p>{error}</p>
        </div>
      )}

      {/* Platform Download Cards Grid */}
      <div className="download-grid">
        {PLATFORMS.map((platform, idx) => {
          const release = releases[platform.key];
          const isReleased = Boolean(release);
          const downloadUrl = isReleased ? getAssetUrl(release, platform.key) || platform.fallbackDownloadUrl : platform.fallbackDownloadUrl;
          const size = isReleased ? getAssetSize(release, platform.key) : '';

          return (
            <div
              key={platform.key}
              className={`download-card ${loading ? 'is-loading' : 'is-ready'}`}
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              {/* Card Header (instantly visible on render) */}
              <div className="card-header">
                <div
                  className="platform-icon"
                  style={{
                    backgroundColor: `${platform.color}1c`,
                    color: platform.color,
                    border: `1px solid ${platform.color}33`,
                  }}
                >
                  <platform.icon size={24} />
                </div>
                <div className="platform-meta">
                  <h3>{platform.label}</h3>
                  <p className="platform-description">{platform.description}</p>
                </div>
              </div>

              {/* Release Metadata with Skeleton or Real Data */}
              <div className="card-release">
                {loading ? (
                  <div className="release-skeleton-row">
                    <div className="skeleton-bar skeleton-pill" />
                    <div className="skeleton-bar skeleton-date" />
                  </div>
                ) : release ? (
                  <div className="release-info animate-fade-in">
                    <span className="release-tag">v{release.tag_name.replace(/^(watcher-)?v?/i, '')}</span>
                    <span className="release-date">
                      {new Date(release.published_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                ) : (
                  <div className="release-info release-unavailable animate-fade-in">
                    <span>Direct GitHub Release</span>
                  </div>
                )}
              </div>

              {/* Action Buttons with Skeleton or Active Link */}
              <div className="card-actions">
                {loading ? (
                  <div className="actions-skeleton-col">
                    <div className="skeleton-bar skeleton-btn" />
                    <div className="skeleton-bar skeleton-link" />
                  </div>
                ) : (
                  <div className="actions-ready-col animate-fade-in">
                    <Link
                      href={downloadUrl}
                      className="btn-primary download-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download size={16} />
                      <span>Download {platform.label.split(' ')[0]}</span>
                      {size && <span className="download-size">({size})</span>}
                    </Link>

                    <a
                      href={release ? release.html_url : `https://github.com/${platform.repo}/releases`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-release"
                    >
                      <span>View release on GitHub</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust & Source Note */}
      <div className="download-note">
        <ShieldCheck size={20} className="shield-icon" />
        <p>
          All releases are securely built and cryptographically hashed from the official open-source{' '}
          <a href="https://github.com/fozzoi" target="_blank" rel="noopener noreferrer">
            fozzoi
          </a>{' '}
          repositories. Android APKs originate from <strong>fozzoi/Watcher</strong>; desktop installers (Windows EXE,
          Linux AppImage, DEB, RPM, Flatpak) originate from <strong>fozzoi/Watcher-desktop</strong>.
        </p>
      </div>

      <style jsx>{`
        .download-page {
          max-width: 1040px;
          margin: 0 auto;
          padding: 24px 20px 80px 20px;
        }

        /* Hero */
        .download-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 38px 32px;
          border-radius: 20px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: 0 12px 36px var(--shadow-color);
          margin-bottom: 32px;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          position: relative;
          overflow: hidden;
        }

        :global([data-theme="light"]) .download-hero {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
        }

        .download-hero-slats {
          position: absolute;
          inset: 0;
          opacity: 0.18;
          pointer-events: none;
          z-index: 0;
        }

        .download-hero .hero-content {
          position: relative;
          z-index: 1;
          max-width: 600px;
        }

        .hero-content h1 {
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -0.6px;
          color: var(--foreground);
          margin: 0 0 10px 0;
          line-height: 1.15;
        }

        .hero-content p {
          color: var(--foreground-muted);
          font-size: 15.5px;
          line-height: 1.5;
          margin: 0 0 20px 0;
        }

        .hero-actions {
          display: flex;
          gap: 12px;
        }

        /* Error notification banner */
        .download-error-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 18px;
          margin-bottom: 24px;
          border-radius: 12px;
          background: rgba(229, 9, 20, 0.1);
          border: 1px solid rgba(229, 9, 20, 0.25);
          color: var(--primary);
          font-size: 13.5px;
        }

        .download-error-banner p {
          margin: 0;
        }

        /* Grid */
        .download-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 20px;
        }

        /* Cards */
        .download-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          padding: 22px 20px;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 18px var(--shadow-color);
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
                      border-color 0.25s ease,
                      box-shadow 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        :global([data-theme="light"]) .download-card {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
        }

        .download-card:hover {
          transform: translateY(-4px);
          border-color: var(--card-hover-border);
          box-shadow: 0 12px 32px var(--shadow-color);
        }

        :global([data-theme="light"]) .download-card:hover {
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);
          border-color: rgba(229, 9, 20, 0.35);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 16px;
        }

        .platform-icon {
          width: 46px;
          height: 46px;
          border-radius: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }

        .download-card:hover .platform-icon {
          transform: scale(1.06);
        }

        .platform-meta {
          min-width: 0;
        }

        .card-header h3 {
          font-size: 17px;
          font-weight: 700;
          color: var(--foreground);
          margin: 0 0 3px 0;
          line-height: 1.2;
        }

        .platform-description {
          font-size: 12.5px;
          color: var(--foreground-muted);
          margin: 0;
          line-height: 1.35;
        }

        .card-release {
          margin-bottom: 20px;
          min-height: 26px;
          display: flex;
          align-items: center;
        }

        .release-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .release-tag {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--primary);
          background: rgba(229, 9, 20, 0.14);
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid rgba(229, 9, 20, 0.25);
          letter-spacing: 0.3px;
        }

        .release-date {
          font-size: 12px;
          color: var(--foreground-muted);
        }

        .release-unavailable {
          font-size: 12px;
          color: var(--foreground-muted);
          font-style: italic;
        }

        .card-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: auto;
        }

        .actions-ready-col,
        .actions-skeleton-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }

        .download-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          border: none;
          text-decoration: none;
        }

        .btn-primary {
          background: var(--primary-gradient);
          color: #ffffff;
          box-shadow: 0 4px 14px var(--primary-glow);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.1);
          box-shadow: 0 6px 20px var(--primary-glow);
        }

        .download-size {
          font-size: 12px;
          font-weight: 500;
          opacity: 0.85;
          margin-left: 2px;
        }

        .view-release {
          font-size: 12px;
          color: var(--foreground-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          margin-top: 4px;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .view-release:hover {
          color: var(--foreground);
        }

        /* Skeleton shimmer styling */
        .release-skeleton-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .skeleton-bar {
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--foreground) 5%, transparent) 25%,
            color-mix(in srgb, var(--foreground) 12%, transparent) 50%,
            color-mix(in srgb, var(--foreground) 5%, transparent) 75%
          );
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s infinite linear;
          border-radius: 6px;
        }

        :global([data-theme="light"]) .skeleton-bar {
          background: linear-gradient(
            90deg,
            rgba(0, 0, 0, 0.05) 25%,
            rgba(0, 0, 0, 0.12) 50%,
            rgba(0, 0, 0, 0.05) 75%
          );
          background-size: 200% 100%;
        }

        .skeleton-pill {
          width: 58px;
          height: 22px;
          border-radius: 6px;
        }

        .skeleton-date {
          width: 100px;
          height: 14px;
          border-radius: 4px;
        }

        .skeleton-btn {
          width: 100%;
          height: 44px;
          border-radius: 12px;
        }

        .skeleton-link {
          width: 140px;
          height: 12px;
          margin: 6px auto 0 auto;
          border-radius: 4px;
        }

        /* Note */
        .download-note {
          margin-top: 36px;
          padding: 20px 22px;
          border-radius: 16px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: flex;
          align-items: flex-start;
          gap: 14px;
          box-shadow: 0 4px 16px var(--shadow-color);
        }

        :global([data-theme="light"]) .download-note {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
        }

        .download-note :global(.shield-icon) {
          color: var(--primary);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .download-note p {
          font-size: 13px;
          color: var(--foreground-muted);
          margin: 0;
          line-height: 1.6;
        }

        .download-note a {
          color: var(--primary);
          text-decoration: underline;
        }

        .download-note strong {
          color: var(--foreground);
        }

        @media (max-width: 640px) {
          .download-page {
            padding: 16px 14px 60px 14px;
          }
          .download-hero {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
            padding: 24px 20px;
          }
          .hero-content h1 {
            font-size: 26px;
          }
          .download-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
        }
      `}</style>
    </div>
  );
}
