"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';
import { 
  Compass, Search, Bookmark, Sparkles, Settings, Film, 
  ChevronLeft, ChevronRight, Sun, Moon, Monitor, BarChart3, Cloud
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export default function Navigation() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, isSyncing } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => setMounted(true), []);

  // Listen to scroll for mobile bottom dock hiding/revealing
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollY.current;

      if (Math.abs(diff) < 6) return;

      if (currentScrollY <= 40) {
        setIsVisible(true);
      } else if (diff > 0 && currentScrollY > 70) {
        setIsVisible(false);
      } else if (diff < 0) {
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsVisible(true);
    lastScrollY.current = typeof window !== 'undefined' ? window.scrollY : 0;
  }, [pathname]);

  if (pathname === '/player') return null;

  const navGroups: NavGroup[] = [
    {
      label: 'DISCOVER',
      items: [
        { name: 'Explore', href: '/', icon: Compass },
        { name: 'Search', href: '/search', icon: Search },
        { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
      ],
    },
    {
      label: 'EXPERIENCE',
      items: [
        { name: 'AI Companion', href: '/ai-search', icon: Sparkles, badge: 'AI' },
        { name: 'Stats', href: '/stats', icon: BarChart3 },
      ],
    },
    {
      label: 'SYSTEM',
      items: [
        { name: 'Settings', href: '/settings', icon: Settings },
      ],
    },
  ];

  const mobileNavItems: NavItem[] = [
    { name: 'Explore', href: '/', icon: Compass },
    { name: 'Search', href: '/search', icon: Search },
    { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
    { name: 'AI', href: '/ai-search', icon: Sparkles },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname?.startsWith(path)) return true;
    return false;
  };

  const cycleTheme = () => {
    if (theme === 'system') setTheme('dark');
    else if (theme === 'dark') setTheme('light');
    else setTheme('system');
  };

  const getThemeIcon = () => {
    if (!mounted) return <Monitor size={17} />;
    if (theme === 'system') return <Monitor size={17} />;
    if (theme === 'dark') return <Moon size={17} />;
    return <Sun size={17} />;
  };

  const getThemeLabel = () => {
    if (!mounted) return 'System';
    if (theme === 'system') return 'System';
    if (theme === 'dark') return 'Dark';
    return 'Light';
  };

  return (
    <>
      {/* ===== Desktop Docked Sidebar ===== */}
      <aside className={`desktop-sidebar ${collapsed ? 'collapsed' : ''}`}>
        {/* Brand Area */}
        <div className="sidebar-brand-wrapper">
          <Link href="/" className="sidebar-brand" title="Watcher Home">
            <div className="brand-emblem">
              <Film size={18} className="emblem-icon" />
            </div>
            {!collapsed && (
              <div className="brand-text-block">
                <span className="brand-name">WATCHER</span>
                <span className="brand-tag">CINEMA</span>
              </div>
            )}
          </Link>
        </div>

        {/* Categorized Navigation Groups */}
        <nav className="sidebar-nav-scroll">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group-section">
              {!collapsed && <span className="nav-group-title">{group.label}</span>}
              <div className="nav-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`nav-item-btn ${active ? 'active' : ''}`}
                      title={collapsed ? item.name : undefined}
                    >
                      <div className="nav-icon-container">
                        <Icon size={18} className="nav-item-icon" />
                      </div>
                      {!collapsed && (
                        <>
                          <span className="nav-item-label">{item.name}</span>
                          {item.badge && <span className="nav-badge-pill">{item.badge}</span>}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer with User Card & System Controls */}
        <div className="sidebar-footer">
          {/* Cloud Sync / Profile Card */}
          {user ? (
            <Link
              href="/settings"
              className="user-profile-tile"
              title={collapsed ? `${user.name} (Cloud Connected)` : undefined}
            >
              <div className="avatar-wrapper">
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="user-avatar-img" />
                ) : (
                  <div className="user-avatar-initial">{user.name.charAt(0).toUpperCase()}</div>
                )}
                <span className={`status-indicator ${isSyncing ? 'syncing' : 'active'}`} />
              </div>
              {!collapsed && (
                <div className="user-info-text">
                  <span className="user-display-name">{user.name}</span>
                  <span className="user-sync-label">{isSyncing ? 'Syncing...' : 'Cloud Synced'}</span>
                </div>
              )}
            </Link>
          ) : (
            <Link
              href="/settings"
              className="cloud-sync-tile"
              title={collapsed ? "Cloud Sync (Optional)" : undefined}
            >
              <div className="sync-icon-box">
                <Cloud size={17} style={{ color: '#00B4D8' }} />
              </div>
              {!collapsed && (
                <div className="sync-text-box">
                  <span className="sync-title">Cloud Sync</span>
                  <span className="sync-sub">Backup library</span>
                </div>
              )}
            </Link>
          )}

          {/* Quick Action Buttons */}
          <div className="sidebar-bottom-actions">
            <button
              className="action-icon-btn"
              onClick={cycleTheme}
              title={`Theme: ${getThemeLabel()}`}
              aria-label="Toggle theme"
            >
              {getThemeIcon()}
              {!collapsed && <span className="btn-label-text">{getThemeLabel()}</span>}
            </button>

            <button
              className="action-icon-btn collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label="Toggle sidebar width"
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              {!collapsed && <span className="btn-label-text">Collapse</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ===== Phone: Floating Bottom Dock Tab Bar (Android-like) ===== */}
      <nav className={`mobile-bottom-dock glass-premium ${!isVisible ? 'hidden' : ''}`}>
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`dock-tab-btn ${active ? 'active' : ''}`}
              title={item.name}
            >
              <div className="dock-icon-wrapper">
                <Icon size={21} className="dock-icon" />
              </div>
              <span className="dock-label">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <style jsx global>{`
        /* ===== Desktop Floating Sidebar ===== */
        .desktop-sidebar {
          position: fixed;
          top: 14px;
          left: 14px;
          bottom: 14px;
          width: var(--sidebar-width);
          border-radius: 18px;
          display: flex;
          flex-direction: column;
          z-index: 100;
          box-sizing: border-box;
          padding: 16px 10px 14px 10px;
          border: 1px solid var(--sidebar-border);
          background: rgba(14, 14, 18, 0.85);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
          transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
                      padding 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          overflow: hidden;
        }

        [data-theme="light"] .desktop-sidebar,
        :global([data-theme="light"]) .desktop-sidebar {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
        }

        .desktop-sidebar.collapsed {
          width: var(--sidebar-collapsed-width);
          padding: 16px 8px 14px 8px;
        }

        /* Brand Area */
        .sidebar-brand-wrapper {
          padding: 4px 6px 18px 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          margin-bottom: 14px;
        }

        [data-theme="light"] .sidebar-brand-wrapper {
          border-bottom-color: rgba(0, 0, 0, 0.06);
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: inherit;
          min-height: 38px;
        }

        .brand-emblem {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(229, 9, 20, 0.22) 0%, rgba(229, 9, 20, 0.06) 100%);
          border: 1px solid rgba(229, 9, 20, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 14px rgba(229, 9, 20, 0.25);
          transition: var(--transition-fast);
        }

        .sidebar-brand:hover .brand-emblem {
          transform: scale(1.05);
          border-color: var(--primary);
        }

        .emblem-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 6px var(--primary-glow));
        }

        .brand-text-block {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
          overflow: hidden;
          white-space: nowrap;
        }

        .brand-name {
          font-size: 16.5px;
          font-weight: 800;
          letter-spacing: 2px;
          background: linear-gradient(135deg, var(--foreground) 0%, var(--foreground-muted) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .brand-tag {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: var(--primary);
          opacity: 0.9;
        }

        /* Nav Scrollable Area */
        .sidebar-nav-scroll {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: none;
        }

        .sidebar-nav-scroll::-webkit-scrollbar {
          display: none;
        }

        .nav-group-section {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .nav-group-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.8px;
          color: var(--foreground-muted);
          opacity: 0.65;
          padding: 4px 10px 4px 10px;
          user-select: none;
        }

        .nav-group-items {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .nav-item-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 12px;
          border-radius: 12px;
          color: var(--foreground-muted);
          font-size: 13.5px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
          border: 1px solid transparent;
        }

        .desktop-sidebar.collapsed .nav-item-btn {
          justify-content: center;
          padding: 10px 0;
        }

        .nav-item-btn:hover {
          color: var(--foreground);
          background: var(--sidebar-hover);
        }

        .nav-item-btn.active {
          color: #ffffff;
          background: linear-gradient(135deg, rgba(229, 9, 20, 0.16) 0%, rgba(229, 9, 20, 0.08) 100%);
          border-color: rgba(229, 9, 20, 0.28);
          font-weight: 700;
          box-shadow: 0 4px 14px rgba(229, 9, 20, 0.16);
        }

        [data-theme="light"] .nav-item-btn,
        :global([data-theme="light"]) .nav-item-btn {
          color: #4b5563;
        }

        [data-theme="light"] .nav-item-btn:hover,
        :global([data-theme="light"]) .nav-item-btn:hover {
          color: #111827;
          background: rgba(0, 0, 0, 0.04);
        }

        [data-theme="light"] .nav-item-btn.active,
        :global([data-theme="light"]) .nav-item-btn.active {
          color: var(--primary);
          background: rgba(229, 9, 20, 0.08);
          border-color: rgba(229, 9, 20, 0.22);
        }

        .nav-icon-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .nav-item-btn.active .nav-item-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 6px var(--primary-glow));
        }

        .nav-item-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        .nav-badge-pill {
          font-size: 9.5px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 6px;
          background: linear-gradient(135deg, rgba(138, 43, 226, 0.3) 0%, rgba(229, 9, 20, 0.3) 100%);
          border: 1px solid rgba(138, 43, 226, 0.45);
          color: #d8b4fe;
          letter-spacing: 0.5px;
        }

        [data-theme="light"] .nav-badge-pill,
        :global([data-theme="light"]) .nav-badge-pill {
          background: rgba(124, 58, 237, 0.12);
          border-color: rgba(124, 58, 237, 0.25);
          color: #7c3aed;
        }

        /* Sidebar Footer */
        .sidebar-footer {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          margin-top: 6px;
        }

        [data-theme="light"] .sidebar-footer {
          border-top-color: rgba(0, 0, 0, 0.06);
        }

        .user-profile-tile {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 12px;
          background: var(--input-bg);
          border: 1px solid var(--card-border);
          text-decoration: none;
          color: inherit;
          transition: var(--transition-fast);
        }

        .desktop-sidebar.collapsed .user-profile-tile {
          justify-content: center;
          padding: 8px 0;
        }

        .user-profile-tile:hover {
          background: var(--sidebar-hover);
          border-color: var(--card-hover-border);
        }

        .avatar-wrapper {
          position: relative;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
        }

        .user-avatar-img {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
        }

        .user-avatar-initial {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--primary);
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .status-indicator {
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1.5px solid var(--card-bg);
        }

        .status-indicator.active {
          background: #30D158;
          box-shadow: 0 0 5px #30D158;
        }

        .status-indicator.syncing {
          background: #FFD60A;
          box-shadow: 0 0 5px #FFD60A;
          animation: navSyncPulse 1s infinite;
        }

        .user-info-text {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
          overflow: hidden;
          white-space: nowrap;
        }

        .user-display-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-sync-label {
          font-size: 10px;
          color: var(--foreground-muted);
        }

        .cloud-sync-tile {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(0, 180, 216, 0.08);
          border: 1px dashed rgba(0, 180, 216, 0.35);
          text-decoration: none;
          color: inherit;
          transition: var(--transition-fast);
        }

        .desktop-sidebar.collapsed .cloud-sync-tile {
          justify-content: center;
          padding: 8px 0;
        }

        .cloud-sync-tile:hover {
          background: rgba(0, 180, 216, 0.16);
          border-color: rgba(0, 180, 216, 0.6);
        }

        .sync-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .sync-text-box {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
          overflow: hidden;
          white-space: nowrap;
        }

        .sync-title {
          font-size: 12.5px;
          font-weight: 700;
          color: #00B4D8;
        }

        .sync-sub {
          font-size: 9.5px;
          color: var(--foreground-muted);
        }

        .sidebar-bottom-actions {
          display: flex;
          gap: 6px;
        }

        .desktop-sidebar.collapsed .sidebar-bottom-actions {
          flex-direction: column;
        }

        .action-icon-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 10px;
          background: var(--input-bg);
          border: 1px solid var(--card-border);
          color: var(--foreground-muted);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: var(--transition-fast);
        }

        .action-icon-btn:hover {
          background: var(--sidebar-hover);
          color: var(--foreground);
          border-color: var(--card-hover-border);
        }

        .btn-label-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ===== Mobile Bottom Dock (Android-style) ===== */
        .mobile-bottom-dock {
          display: none;
        }

        /* ===== Responsive Breakpoints ===== */
        @media (max-width: 768px) {
          .desktop-sidebar {
            display: none !important;
          }

          .mobile-bottom-dock {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            height: calc(56px + env(safe-area-inset-bottom, 0px));
            padding-bottom: env(safe-area-inset-bottom, 0px);
            border-radius: 0;
            display: flex;
            align-items: center;
            justify-content: space-around;
            padding-left: 8px;
            padding-right: 8px;
            z-index: 1000;
            box-sizing: border-box;
            backdrop-filter: blur(28px) saturate(190%);
            -webkit-backdrop-filter: blur(28px) saturate(190%);
            border: none;
            border-top: 1px solid var(--sidebar-border);
            background: rgba(14, 14, 18, 0.85);
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.35);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), 
                        opacity 0.25s ease;
          }

          [data-theme="light"] .mobile-bottom-dock,
          :global([data-theme="light"]) .mobile-bottom-dock {
            background: rgba(255, 255, 255, 0.9);
            border-top: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
          }

          .mobile-bottom-dock.hidden {
            transform: translateY(100%);
            opacity: 0;
            pointer-events: none;
          }

          .dock-tab-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            color: var(--foreground-muted);
            text-decoration: none;
            padding: 6px 12px;
            border-radius: 20px;
            transition: var(--transition-fast);
            min-width: 52px;
          }

          .dock-icon-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .dock-tab-btn.active {
            color: var(--primary);
          }

          .dock-tab-btn.active .dock-icon {
            color: var(--primary);
            filter: drop-shadow(0 0 8px var(--primary-glow));
          }

          .dock-label {
            font-size: 10px;
            font-weight: 600;
            letter-spacing: -0.2px;
          }

          .dock-tab-btn.active .dock-label {
            color: var(--foreground);
            font-weight: 700;
          }
        }
      `}</style>
    </>
  );
}
