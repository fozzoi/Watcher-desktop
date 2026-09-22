"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Star, Heart, Calendar, MapPin, Film, Tv, 
  Sparkles, ExternalLink, ChevronDown, ChevronUp, User,
  ChevronLeft, ChevronRight, X, ZoomIn
} from 'lucide-react';
import { 
  getPersonDetails, 
  getPersonCombinedCredits, 
  getPersonImages, 
  getImageUrl, 
  TMDBPerson, 
  TMDBResult, 
  TMDBImage 
} from '@/utils/tmdb';
import { AsyncStorage } from '@/utils/storage';
import MovieCard from '@/components/MovieCard';

function CastDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idStr = searchParams.get('id');
  const personId = Number(idStr);

  const [person, setPerson] = useState<TMDBPerson | null>(null);
  const [credits, setCredits] = useState<TMDBResult[]>([]);
  const [personImages, setPersonImages] = useState<TMDBImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'movie' | 'tv'>('all');
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);

  // Keyboard controls for Lightbox
  useEffect(() => {
    if (selectedImageIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedImageIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setSelectedImageIndex((prev) => 
          prev !== null ? (prev === 0 ? personImages.length - 1 : prev - 1) : null
        );
      } else if (e.key === 'ArrowRight') {
        setSelectedImageIndex((prev) => 
          prev !== null ? (prev === personImages.length - 1 ? 0 : prev + 1) : null
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageIndex, personImages.length]);

  const scrollGallery = (direction: 'left' | 'right') => {
    if (galleryScrollRef.current) {
      const { scrollLeft, clientWidth } = galleryScrollRef.current;
      const scrollAmount = clientWidth * 0.6;
      galleryScrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const loadFavoriteStatus = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('favoriteArtists');
      if (stored) {
        const list = JSON.parse(stored);
        setIsFavorite(list.some((item: any) => item.id === personId));
      }
      const mStr = await AsyncStorage.getItem('watchlist');
      if (mStr) {
        const mList = JSON.parse(mStr);
        setWatchlistIds(new Set(mList.map((i: any) => i.id)));
      }
    } catch {}
  }, [personId]);

  useEffect(() => {
    if (!personId) return;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [details, rawCredits, images] = await Promise.all([
          getPersonDetails(personId),
          getPersonCombinedCredits(personId),
          getPersonImages(personId),
        ]);
        setPerson(details);
        // Filter credits with poster and sort by popularity
        const validCredits = rawCredits
          .filter((c) => c.poster_path)
          .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        setCredits(validCredits);
        setPersonImages(images);
      } catch (err) {
        console.error('Failed to load person details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
    loadFavoriteStatus();
  }, [personId, loadFavoriteStatus]);

  const toggleFavorite = async () => {
    if (!person) return;
    try {
      const stored = await AsyncStorage.getItem('favoriteArtists');
      let list = stored ? JSON.parse(stored) : [];
      if (isFavorite) {
        list = list.filter((i: any) => i.id !== person.id);
        setIsFavorite(false);
      } else {
        list.push({
          id: person.id,
          name: person.name,
          profile_path: person.profile_path,
          known_for_department: person.known_for_department,
        });
        setIsFavorite(true);
      }
      await AsyncStorage.setItem('favoriteArtists', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  const calculateAge = (birthday: string, deathday?: string | null) => {
    const start = new Date(birthday);
    const end = deathday ? new Date(deathday) : new Date();
    const age = end.getFullYear() - start.getFullYear();
    const m = end.getMonth() - start.getMonth();
    return m < 0 || (m === 0 && end.getDate() < start.getDate()) ? age - 1 : age;
  };

  const filteredCredits = credits.filter((item) => {
    if (activeTab === 'all') return true;
    return item.media_type === activeTab;
  });

  if (loading) {
    return (
      <div className="loading-spinner-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="empty-state">
        <User size={36} />
        <p>Artist could not be found.</p>
        <button className="btn-secondary" onClick={() => router.back()}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="cast-detail-page animate-fade-in-up">
      {/* Header bar */}
      <div className="cast-nav-bar">
        <button className="back-btn glass" onClick={() => router.back()}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <button 
          className={`btn-secondary ${isFavorite ? 'favorite-active' : ''}`}
          onClick={toggleFavorite}
          style={{ marginLeft: 'auto', gap: 8 }}
        >
          <Heart size={18} fill={isFavorite ? "var(--primary)" : "none"} color={isFavorite ? "var(--primary)" : "#fff"} />
          <span>{isFavorite ? 'Favorited' : 'Add to Favorites'}</span>
        </button>
      </div>

      {/* Profile Overview */}
      <div className="cast-hero-panel glass-premium">
        <div className="cast-avatar-large">
          <img 
            src={getImageUrl(person.profile_path, 'w500')} 
            alt={person.name} 
            className="cast-photo-large" 
          />
        </div>

        <div className="cast-meta-info">
          <h1 className="cast-title">{person.name}</h1>
          <div className="cast-badges">
            <span className="badge department">{person.known_for_department || 'Acting'}</span>
            {person.birthday && (
              <span className="badge age">
                <Calendar size={12} style={{ marginRight: 4 }} />
                {calculateAge(person.birthday, person.deathday)} years old {person.deathday ? '(Deceased)' : ''}
              </span>
            )}
            {person.place_of_birth && (
              <span className="badge location">
                <MapPin size={12} style={{ marginRight: 4 }} />
                {person.place_of_birth}
              </span>
            )}
            {person.popularity && (
              <span className="badge popularity">
                <Star size={12} fill="gold" stroke="gold" style={{ marginRight: 4 }} />
                {person.popularity.toFixed(1)} Pop
              </span>
            )}
          </div>

          {person.biography && (
            <div className="cast-bio-box">
              <h3>Biography</h3>
              <p className={`cast-bio-text ${!isBioExpanded ? 'clamped' : ''}`}>
                {person.biography}
              </p>
              {person.biography.length > 300 && (
                <button 
                  className="bio-toggle-btn" 
                  onClick={() => setIsBioExpanded(!isBioExpanded)}
                >
                  {isBioExpanded ? (
                    <>Show Less <ChevronUp size={14} /></>
                  ) : (
                    <>Read More <ChevronDown size={14} /></>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Photo Gallery */}
      {personImages.length > 1 && (
        <div className="cast-gallery-section">
          <div className="gallery-header-row">
            <h2>Photos ({personImages.length})</h2>
            <div className="carousel-nav-arrows">
              <button className="nav-arrow-btn" onClick={() => scrollGallery('left')} aria-label="Scroll photos left">
                <ChevronLeft size={16} />
              </button>
              <button className="nav-arrow-btn" onClick={() => scrollGallery('right')} aria-label="Scroll photos right">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="gallery-carousel-wrapper">
            <div className="cast-gallery-scroll" ref={galleryScrollRef}>
              {personImages.map((img, idx) => (
                <div 
                  key={idx} 
                  className="gallery-img-card glass"
                  onClick={() => setSelectedImageIndex(idx)}
                  title="Click to enlarge"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedImageIndex(idx);
                    }
                  }}
                >
                  <img 
                    src={getImageUrl(img.file_path, 'w300')} 
                    alt={`${person.name} photo ${idx + 1}`} 
                    loading="lazy" 
                  />
                  <div className="gallery-hover-overlay">
                    <ZoomIn size={22} color="#ffffff" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filmography Section */}
      <div className="cast-filmography-section">
        <div className="filmography-header">
          <h2>Filmography ({filteredCredits.length})</h2>
          
          <div className="tab-pills glass">
            <button 
              className={`tab-pill ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All ({credits.length})
            </button>
            <button 
              className={`tab-pill ${activeTab === 'movie' ? 'active' : ''}`}
              onClick={() => setActiveTab('movie')}
            >
              <Film size={14} /> Movies ({credits.filter(c => c.media_type === 'movie').length})
            </button>
            <button 
              className={`tab-pill ${activeTab === 'tv' ? 'active' : ''}`}
              onClick={() => setActiveTab('tv')}
            >
              <Tv size={14} /> Shows ({credits.filter(c => c.media_type === 'tv').length})
            </button>
          </div>
        </div>

        <div className="media-grid">
          {filteredCredits.map((item) => (
            <MovieCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              isAdded={watchlistIds.has(item.id)}
              toggleWatchlist={async (it, e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  const currentStr = await AsyncStorage.getItem('watchlist');
                  let currentList = currentStr ? JSON.parse(currentStr) : [];
                  if (currentList.find((i: any) => i.id === it.id)) {
                    currentList = currentList.filter((i: any) => i.id !== it.id);
                    setWatchlistIds(prev => {
                      const next = new Set(prev);
                      next.delete(it.id);
                      return next;
                    });
                  } else {
                    currentList.push(it);
                    setWatchlistIds(prev => new Set(prev).add(it.id));
                  }
                  await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
                } catch {}
              }}
            />
          ))}
        </div>
      </div>

      {/* Lightbox / Enlarged Photo Modal */}
      {selectedImageIndex !== null && personImages[selectedImageIndex] && (
        <div 
          className="lightbox-backdrop"
          onClick={() => setSelectedImageIndex(null)}
        >
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <span className="lightbox-counter">
                {selectedImageIndex + 1} / {personImages.length}
              </span>
              <button 
                className="lightbox-close-btn" 
                onClick={() => setSelectedImageIndex(null)}
                aria-label="Close image preview"
              >
                <X size={20} />
              </button>
            </div>

            <div className="lightbox-image-wrap">
              <img 
                src={getImageUrl(personImages[selectedImageIndex].file_path, 'original')} 
                alt={`${person.name} enlarged photo ${selectedImageIndex + 1}`}
                className="lightbox-img" 
              />
            </div>

            {personImages.length > 1 && (
              <>
                <button 
                  className="lightbox-nav-btn prev"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIndex((prev) => 
                      prev !== null ? (prev === 0 ? personImages.length - 1 : prev - 1) : 0
                    );
                  }}
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={26} />
                </button>
                <button 
                  className="lightbox-nav-btn next"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIndex((prev) => 
                      prev !== null ? (prev === personImages.length - 1 ? 0 : prev + 1) : 0
                    );
                  }}
                  aria-label="Next photo"
                >
                  <ChevronRight size={26} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .cast-detail-page {
          max-width: 1300px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 30px;
        }
        .cast-nav-bar {
          display: flex;
          align-items: center;
        }
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--foreground);
          background: var(--card-bg);
          padding: 8px 16px;
          border-radius: 12px;
          cursor: pointer;
          border: 1px solid var(--card-border);
          font-weight: 500;
          transition: var(--transition-smooth);
        }
        .back-btn:hover {
          background: var(--sidebar-hover);
        }
        .cast-hero-panel {
          display: flex;
          gap: 32px;
          padding: 30px;
          border-radius: var(--border-radius-lg);
        }
        @media (max-width: 768px) {
          .cast-hero-panel {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
        }
        .cast-avatar-large {
          flex-shrink: 0;
          width: 220px;
          height: 310px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(0,0,0,0.5);
          border: 1px solid var(--card-border);
        }
        .cast-photo-large {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .cast-meta-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .cast-title {
          font-size: 32px;
          font-weight: 700;
        }
        .cast-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          background: var(--badge-bg);
          border: 1px solid var(--badge-border);
          padding: 6px 12px;
          border-radius: 10px;
          font-size: 13px;
          color: var(--foreground-muted);
        }
        .cast-bio-box {
          margin-top: 10px;
        }
        .cast-bio-box h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--foreground);
        }
        .cast-bio-text {
          font-size: 14px;
          line-height: 1.7;
          color: var(--foreground-muted);
        }
        .cast-bio-text.clamped {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .bio-toggle-btn {
          margin-top: 8px;
          background: transparent;
          border: none;
          color: var(--primary);
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .cast-gallery-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .gallery-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .cast-gallery-section h2, .filmography-header h2 {
          font-size: 20px;
          font-weight: 600;
        }
        .carousel-nav-arrows {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .nav-arrow-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--card-border);
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .nav-arrow-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          color: #fff;
        }
        .gallery-carousel-wrapper {
          position: relative;
          margin: 0 -8px;
        }
        .cast-gallery-scroll {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          padding: 6px 8px 12px;
          scrollbar-width: none;
        }
        .cast-gallery-scroll::-webkit-scrollbar {
          display: none;
        }
        .nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: var(--card-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.85;
          box-shadow: 0 4px 18px var(--shadow-color);
          transition: all 0.2s ease-in-out;
          z-index: 10;
        }
        .nav-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          transform: translateY(-50%) scale(1.1);
          opacity: 1;
        }
        .nav-btn.prev-btn { left: 4px; }
        .nav-btn.next-btn { right: 4px; }
        @media (max-width: 768px) {
          .nav-btn { display: none; }
        }
        .gallery-img-card {
          flex: 0 0 140px;
          width: 140px;
          min-width: 140px;
          max-width: 140px;
          height: 200px;
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          position: relative;
          transition: var(--transition-smooth);
        }
        .gallery-img-card:hover {
          transform: translateY(-4px) scale(1.03);
          border-color: var(--primary);
          box-shadow: 0 8px 24px rgba(229, 9, 20, 0.25);
        }
        .gallery-img-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.3s ease;
        }
        .gallery-img-card:hover img {
          transform: scale(1.06);
        }
        .gallery-hover-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: var(--transition-fast);
        }
        .gallery-img-card:hover .gallery-hover-overlay {
          opacity: 1;
        }

        /* Lightbox Fullscreen Modal */
        .lightbox-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 24px;
          animation: fadeIn 0.2s ease-out;
        }

        .lightbox-content {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .lightbox-header {
          position: absolute;
          top: -48px;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .lightbox-counter {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.8);
          letter-spacing: 0.5px;
        }

        .lightbox-close-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .lightbox-close-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          transform: scale(1.1);
        }

        .lightbox-image-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          max-height: calc(88vh - 50px);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .lightbox-img {
          max-width: 85vw;
          max-height: calc(88vh - 50px);
          object-fit: contain;
          border-radius: 12px;
          display: block;
          user-select: none;
        }

        .lightbox-nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(20, 20, 24, 0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-fast);
          z-index: 10;
        }

        .lightbox-nav-btn:hover {
          background: var(--primary);
          border-color: var(--primary);
          transform: translateY(-50%) scale(1.1);
        }

        .lightbox-nav-btn.prev {
          left: -64px;
        }

        .lightbox-nav-btn.next {
          right: -64px;
        }

        @media (max-width: 820px) {
          .lightbox-nav-btn.prev { left: 10px; }
          .lightbox-nav-btn.next { right: 10px; }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .cast-filmography-section {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .filmography-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
        }
        .tab-pills {
          display: inline-flex;
          padding: 4px;
          border-radius: 12px;
          gap: 4px;
        }
        .tab-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          font-size: 13px;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .tab-pill.active {
          background: var(--primary);
          color: #fff;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

export default function CastPage() {
  return (
    <Suspense fallback={
      <div className="loading-spinner-container">
        <div className="spinner" />
      </div>
    }>
      <CastDetailContent />
    </Suspense>
  );
}
