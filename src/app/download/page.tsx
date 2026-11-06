"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, Smartphone, Monitor, Terminal, Globe, ShieldCheck, Info, ExternalLink } from 'lucide-react';
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

const PLATFORMS = [
  {
    key: 'android',
    label: 'Android (APK)',
    icon: Smartphone,
    color: '#3DDC84',
    repo: 'fozzoi/Watcher',
    description: 'Mobile app for phones and tablets',
  },
  {
    key: 'windows',
    label: 'Windows (EXE)',
    icon: Monitor,
    color: '#0078D6',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Desktop app for Windows',
  },
  {
    key: 'linux-deb',
    label: 'Linux (DEB)',
    icon: Terminal,
    color: '#FCC624',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Debian / Ubuntu package',
  },
  {
    key: 'linux-rpm',
    label: 'Linux (RPM)',
    icon: Terminal,
    color: '#FCC624',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Red Hat / Fedora package',
  },
  {
    key: 'linux-flatpak',
    label: 'Linux (Flatpak)',
    icon: Terminal,
    color: '#FCC624',
    repo: 'fozzoi/Watcher-desktop',
    description: 'Flatpak universal package',
  },
];

export default function DownloadPage() {
  const [releases, setReleases] = useState<Record<string, GitHubRelease | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchReleases() {
      try {
        const results = await Promise.allSettled(
          PLATFORMS.map((p) =>
            fetch(`https://api.github.com/repos/${p.repo}/releases/latest`, {
              headers: { Accept: 'application/vnd.github+json' },
            }).then((r) => (r.ok ? r.json() : null))
          )
        );
        const mapped: Record<string, GitHubRelease | null> = {};
        PLATFORMS.forEach((p, i) => {
          if (results[i].status === 'fulfilled' && results[i].value) {
            mapped[p.key] = results[i].value;
          } else {
            mapped[p.key] = null;
          }
        });
        if (mounted) {
          setReleases(mapped);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to load release information.');
          setLoading(false);
        }
      }
    }
    fetchReleases();
    return () => { mounted = false; };
  }, []);

  const getAssetUrl = (release: GitHubRelease | null, keywords: string[]): string | null => {
    if (!release?.assets) return null;
    const asset = release.assets.find((a) =>
      keywords.some((k) => a.name.toLowerCase().includes(k.toLowerCase()))
    );
    return asset?.browser_download_url || null;
  };

  const assetSize = (release: GitHubRelease | null, keywords: string[]): string => {
    if (!release?.assets) return '';
    const asset = release.assets.find((a) =>
      keywords.some((k) => a.name.toLowerCase().includes(k.toLowerCase()))
    );
    if (!asset) return '';
    const mb = (asset.size / (1024 * 1024)).toFixed(1);
    return `${mb} MB`;
  };

  if (loading) {
    return (
      <div className="download-page">
        <div className="download-hero">
          <h1>Download Watcher</h1>
          <p>Get the latest version for your device</p>
        </div>
        <div className="download-loading">
          <Download size={32} />
          <p>Fetching latest releases…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="download-page">
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
            introDuration={1.5}
          />
        </div>
        <div className="hero-content">
          <h1>Download Watcher</h1>
          <p>Watch movies and TV shows on your device. Get the latest release for Android, Windows, or Linux.</p>
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
              onClick={() => window.location.href = '/'}
            >
              <Globe size={16} />
              <span>Back to Home</span>
            </SpecularButton>
          </div>
        </div>
      </div>

      {error && (
        <div className="download-error">
          <Info size={20} />
          <p>{error}</p>
        </div>
      )}

      <div className="download-grid">
        {PLATFORMS.map((platform) => {
          const release = releases[platform.key];
          const isReleased = !!release;
          const downloadUrl = isReleased
            ? getAssetUrl(release, platform.key === 'linux-deb' ? ['.deb'] :
                          platform.key === 'linux-rpm' ? ['.rpm'] :
                          platform.key === 'linux-flatpak' ? ['flatpak'] :
                          platform.key === 'windows' ? ['.exe'] :
                          ['.apk'])
            : null;
          const size = isReleased ? assetSize(release, platform.key === 'linux-deb' ? ['.deb'] :
                          platform.key === 'linux-rpm' ? ['.rpm'] :
                          platform.key === 'linux-flatpak' ? ['flatpak'] :
                          platform.key === 'windows' ? ['.exe'] :
                          ['.apk']) : '';

          return (
            <div key={platform.key} className="download-card">
              <div className="card-header">
                <div className="platform-icon" style={{ backgroundColor: `${platform.color}20`, color: platform.color }}>
                  <platform.icon size={24} />
                </div>
                <div>
                  <h3>{platform.label}</h3>
                  <p className="platform-description">{platform.description}</p>
                </div>
              </div>

              <div className="card-release">
                {isReleased ? (
                  <div className="release-info">
                    <span className="release-tag">v{release.tag_name.replace(/^v/, '')}</span>
                    <span className="release-date">
                      Released {new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ) : (
                  <div className="release-info release-unavailable">
                    <span>Not available</span>
                  </div>
                )}
              </div>

              <div className="card-actions">
                {isReleased && downloadUrl ? (
                  <Link
                    href={downloadUrl}
                    className="btn-primary download-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={16} />
                    <span>Download {platform.label.split(' ')[0]}</span>
                    {size && <span className="download-size">{size}</span>}
                  </Link>
                ) : (
                  <button className="btn-secondary download-btn" disabled>
                    <Download size={16} />
                    <span>Coming Soon</span>
                  </button>
                )}
                <a
                  href={isReleased ? release.html_url : `https://github.com/${platform.repo}/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="view-release"
                >
                  View on GitHub <ExternalLink size={14} />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      <div className="download-note">
        <ShieldCheck size={18} />
        <p>
          All binaries are built from the official <a href="https://github.com/fozzoi" target="_blank" rel="noopener noreferrer">fozzoi</a> GitHub repositories.
          Android APKs come from <strong>Watcher</strong>; desktop installers (EXE, DEB, RPM, Flatpak) come from <strong>Watcher-desktop</strong>.
        </p>
      </div>

      <style jsx>{`
        .download-page {
          max-width: 1000px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .download-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 40px 24px;
          border-radius: var(--border-radius-lg);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: 0 8px 32px var(--shadow-color);
          margin-bottom: 40px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          position: relative;
          overflow: hidden;
        }

        .download-hero-slats {
          position: absolute;
          inset: 0;
          opacity: 0.15;
          pointer-events: none;
          z-index: 0;
        }

        .download-hero .hero-content {
          position: relative;
          z-index: 1;
        }

        .hero-content h1 {
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--foreground);
          margin: 0 0 10px 0;
        }

        .hero-content p {
          color: var(--foreground-muted);
          font-size: 16px;
          margin: 0 0 20px 0;
        }

        .hero-actions {
          display: flex;
          gap: 12px;
        }

        .download-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }

        .download-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius-md);
          padding: 24px;
          display: flex;
          flex-direction: column;
          transition: transform 0.2s ease, border-color 0.2s ease;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .download-card:hover {
          transform: translateY(-4px);
          border-color: var(--card-hover-border);
          box-shadow: 0 12px 32px var(--shadow-color);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 16px;
        }

        .platform-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .card-header h3 {
          font-size: 18px;
          font-weight: 700;
          color: var(--foreground);
          margin: 0 0 4px 0;
        }

        .platform-description {
          font-size: 13px;
          color: var(--foreground-muted);
          margin: 0;
        }

        .card-release {
          margin-bottom: 20px;
        }

        .release-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .release-tag {
          font-size: 12px;
          font-weight: 700;
          color: var(--primary);
          background: rgba(229, 9, 20, 0.15);
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid rgba(229, 9, 20, 0.25);
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

        .download-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px 16px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .btn-primary {
          background: var(--primary-gradient);
          color: #fff;
          box-shadow: 0 4px 14px var(--primary-glow);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: var(--input-bg);
          color: var(--foreground);
          border: 1px solid var(--card-border);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--sidebar-hover);
        }

        .download-size {
          font-size: 12px;
          font-weight: 500;
          opacity: 0.9;
          margin-left: 4px;
        }

        .view-release {
          font-size: 12px;
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          transition: color 0.2s ease;
        }

        .view-release:hover {
          color: var(--foreground);
        }

        .download-loading,
        .download-error {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: center;
          padding: 40px;
          color: var(--foreground-muted);
        }

        .download-error {
          color: var(--error);
        }

        .download-note {
          margin-top: 40px;
          padding: 20px;
          border-radius: var(--border-radius-md);
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--card-border);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: flex-start;
          gap: 12px;
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
            padding: 20px 16px;
          }
          .download-hero {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
            padding: 24px;
          }
          .hero-content h1 {
            font-size: 26px;
          }
          .download-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
