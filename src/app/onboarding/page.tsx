"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Check, ArrowRight, ArrowLeft, Sparkles, Search, 
  X, Film, Star, Globe, Heart 
} from 'lucide-react';
import { 
  LANGUAGE_OPTIONS, 
  GENRE_OPTIONS, 
  completeOnboarding, 
  getUserPreferences, 
  FavoriteActor 
} from '@/utils/userPreferences';
import { searchPeople, getImageUrl, TMDBPerson } from '@/utils/tmdb';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['en']);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([28, 878, 53]);
  const [favoriteActors, setFavoriteActors] = useState<FavoriteActor[]>([]);
  
  // Actor search state
  const [actorQuery, setActorQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBPerson[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Load any existing preferences if re-running onboarding
    const loadCurrent = async () => {
      const current = await getUserPreferences();
      if (current.languages && current.languages.length > 0) {
        setSelectedLanguages(current.languages);
      }
      if (current.genreIds && current.genreIds.length > 0) {
        setSelectedGenres(current.genreIds);
      }
      if (current.favoriteActors && current.favoriteActors.length > 0) {
        setFavoriteActors(current.favoriteActors);
      }
    };
    loadCurrent();
  }, []);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(prev => 
      prev.includes(code) 
        ? (prev.length > 1 ? prev.filter(c => c !== code) : prev) 
        : [...prev, code]
    );
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres(prev => 
      prev.includes(id) 
        ? (prev.length > 1 ? prev.filter(g => g !== id) : prev) 
        : [...prev, id]
    );
  };

  const handleSearchActor = async (val: string) => {
    setActorQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchPeople(val, 1);
      setSearchResults(results.slice(0, 8));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addActor = (person: TMDBPerson) => {
    if (!favoriteActors.find(a => a.id === person.id)) {
      setFavoriteActors(prev => [...prev, {
        id: person.id,
        name: person.name,
        profile_path: person.profile_path
      }]);
    }
    setActorQuery('');
    setSearchResults([]);
  };

  const removeActor = (id: number) => {
    setFavoriteActors(prev => prev.filter(a => a.id !== id));
  };

  const handleFinish = async () => {
    await completeOnboarding({
      country: 'IN',
      languages: selectedLanguages,
      genreIds: selectedGenres,
      favoriteActors: favoriteActors
    });
    router.push('/');
  };

  return (
    <div className="onboarding-container animate-fade-in-up">
      {/* Header with Progress Steps */}
      <div className="onboarding-header">
        <div className="steps-indicator">
          {[1, 2, 3].map((num) => (
            <div 
              key={num} 
              className={`step-dot ${step === num ? 'active' : step > num ? 'completed' : ''}`}
            >
              {step > num ? <Check size={14} /> : num}
            </div>
          ))}
        </div>
        <p className="step-count-text">Step {step} of 3</p>
      </div>

      {/* Step 1: Languages */}
      {step === 1 && (
        <div className="step-content">
          <div className="step-title-box">
            <h1>What cinemas do you enjoy? 🌍</h1>
            <p>Pick the languages and film industries you follow. Your Explore feed will be tailored to these.</p>
          </div>

          <div className="languages-grid">
            {LANGUAGE_OPTIONS.map((lang) => {
              const active = selectedLanguages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  className={`lang-card glass ${active ? 'active' : ''}`}
                  onClick={() => toggleLanguage(lang.code)}
                >
                  <span className="lang-flag">{lang.flag}</span>
                  <div className="lang-info">
                    <span className="lang-name">{lang.label}</span>
                    <span className="lang-industry">{lang.industry}</span>
                  </div>
                  {active && <Check size={18} className="lang-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Genres */}
      {step === 2 && (
        <div className="step-content">
          <div className="step-title-box">
            <h1>What genres do you love? 🎬</h1>
            <p>Select your favorite genres. We'll tune recommendations, carousels, and the AI lens.</p>
          </div>

          <div className="genres-grid">
            {GENRE_OPTIONS.map((genre) => {
              const active = selectedGenres.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  className={`genre-card glass ${active ? 'active' : ''}`}
                  onClick={() => toggleGenre(genre.id)}
                >
                  <span className="genre-emoji">{genre.emoji}</span>
                  <span className="genre-name">{genre.label}</span>
                  {active && <Check size={16} className="genre-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Favorite Stars */}
      {step === 3 && (
        <div className="step-content">
          <div className="step-title-box">
            <h1>Who are your favorite actors? ⭐</h1>
            <p>Search and add your favorite cinema stars to get dedicated actor spotlight carousels.</p>
          </div>

          {/* Search box */}
          <div className="actor-search-wrapper">
            <span className="search-icon-wrapper">
              <Search size={18} />
            </span>
            <input 
              type="text" 
              className="actor-search-input" 
              placeholder="Search actors, directors... (e.g. Leonardo DiCaprio, Mohanlal, Shah Rukh Khan)"
              value={actorQuery}
              onChange={(e) => handleSearchActor(e.target.value)}
            />
            {searching && <div className="spinner-small" />}
          </div>

          {/* Search Dropdown Results */}
          {searchResults.length > 0 && (
            <div className="actor-results-dropdown glass-premium">
              {searchResults.map((person) => (
                <div 
                  key={person.id} 
                  className="actor-result-item"
                  onClick={() => addActor(person)}
                >
                  <img 
                    src={getImageUrl(person.profile_path, 'w185')} 
                    alt={person.name} 
                    className="actor-thumb"
                  />
                  <div className="actor-item-meta">
                    <span className="actor-name">{person.name}</span>
                    <span className="actor-dept">{person.known_for_department}</span>
                  </div>
                  <button className="add-actor-btn">Add</button>
                </div>
              ))}
            </div>
          )}

          {/* Selected Stars Chips */}
          <div className="selected-actors-section">
            <h3>Selected Stars ({favoriteActors.length})</h3>
            {favoriteActors.length > 0 ? (
              <div className="actors-chips-row">
                {favoriteActors.map((actor) => (
                  <div key={actor.id} className="actor-chip glass">
                    <img 
                      src={getImageUrl(actor.profile_path, 'w185')} 
                      alt={actor.name} 
                      className="chip-avatar"
                    />
                    <span className="chip-name">{actor.name}</span>
                    <button className="chip-remove" onClick={() => removeActor(actor.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-actors-text">No stars selected yet. You can search above or skip to finish.</p>
            )}
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="onboarding-footer">
        {step > 1 && (
          <button className="btn-secondary" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {step < 3 ? (
            <button className="btn-primary" onClick={() => setStep(step + 1)}>
              <span>Next</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="btn-primary" onClick={handleFinish}>
              <Sparkles size={16} />
              <span>Enter Watcher</span>
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .onboarding-container {
          max-width: 900px;
          margin: 40px auto;
          display: flex;
          flex-direction: column;
          gap: 36px;
        }
        .onboarding-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .steps-indicator {
          display: flex;
          gap: 16px;
        }
        .step-dot {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--input-bg);
          border: 2px solid var(--card-border);
          color: var(--foreground-muted);
          font-weight: 700;
          font-size: 14px;
          transition: var(--transition-smooth);
        }
        .step-dot.active {
          border-color: var(--primary);
          color: #fff;
          background: var(--primary-gradient);
          box-shadow: 0 0 16px var(--primary-glow);
        }
        .step-dot.completed {
          border-color: #34c759;
          background: rgba(52, 199, 89, 0.2);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #34c759;
        }
        .step-count-text {
          font-size: 13px;
          color: var(--foreground-muted);
        }
        .step-content {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .step-title-box h1 {
          font-size: 30px;
          font-weight: 700;
          color: var(--foreground);
        }
        .step-title-box p {
          font-size: 15px;
          color: var(--foreground-muted);
          margin-top: 6px;
        }
        .languages-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
        }
        .lang-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 14px;
          cursor: pointer;
          text-align: left;
          border: 1px solid var(--card-border);
          transition: var(--transition-smooth);
        }
        .lang-card:hover {
          border-color: rgba(229, 9, 20, 0.5);
          transform: translateY(-2px);
        }
        .lang-card.active {
          border-color: var(--primary);
          background: rgba(229, 9, 20, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .lang-flag {
          font-size: 24px;
        }
        .lang-info {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .lang-name {
          font-weight: 600;
          font-size: 14px;
          color: var(--foreground);
        }
        .lang-industry {
          font-size: 11px;
          color: var(--foreground-muted);
        }
        .lang-check {
          color: var(--primary);
        }
        .genres-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }
        .genre-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          cursor: pointer;
          border: 1px solid var(--card-border);
          transition: var(--transition-smooth);
        }
        .genre-card:hover {
          border-color: rgba(229, 9, 20, 0.5);
          transform: translateY(-2px);
        }
        .genre-card.active {
          border-color: var(--primary);
          background: rgba(229, 9, 20, 0.12);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .genre-emoji {
          font-size: 20px;
        }
        .genre-name {
          font-weight: 600;
          font-size: 14px;
          color: var(--foreground);
          flex: 1;
        }
        .genre-check {
          color: var(--primary);
        }
        .actor-search-wrapper {
          position: relative;
          width: 100%;
        }
        .search-icon-wrapper {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--foreground-muted);
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          z-index: 2;
        }
        .actor-search-input {
          width: 100%;
          padding: 14px 20px 14px 50px;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 14px;
          color: var(--foreground);
          font-size: 15px;
          outline: none;
          transition: var(--transition-smooth);
        }
        .actor-search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 4px var(--primary-glow);
        }
        .actor-results-dropdown {
          display: flex;
          flex-direction: column;
          border-radius: 14px;
          overflow: hidden;
          max-height: 280px;
          overflow-y: auto;
          margin-top: -16px;
        }
        .actor-result-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 16px;
          cursor: pointer;
          transition: var(--transition-fast);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .actor-result-item:hover {
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .actor-thumb {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }
        .actor-item-meta {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .actor-name {
          font-weight: 600;
          font-size: 14px;
        }
        .actor-dept {
          font-size: 12px;
          color: var(--foreground-muted);
        }
        .add-actor-btn {
          background: var(--primary);
          color: #fff;
          border: none;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .selected-actors-section h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 14px;
        }
        .actors-chips-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .actor-chip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px 6px 6px;
          border-radius: 20px;
        }
        .chip-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
        }
        .chip-name {
          font-size: 13px;
          font-weight: 500;
        }
        .chip-remove {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .chip-remove:hover {
          color: var(--primary);
        }
        .no-actors-text {
          font-size: 13px;
          color: var(--foreground-muted);
        }
        .onboarding-footer {
          display: flex;
          align-items: center;
          padding-top: 20px;
          border-top: 1px solid var(--card-border);
        }
      `}</style>
    </div>
  );
}
