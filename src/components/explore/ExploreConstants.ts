// src/components/explore/ExploreConstants.ts
// Ported from the Watcher Expo app — adapted for Next.js/web (lucide-react icons, CSS layout).

export const HORIZONTAL_MARGIN = 16;
export const GAP_SIZE = 12;

export type GenreIconName = string;

export interface GenreItem {
  id: number;
  name: string;
  icon: GenreIconName; // lucide-react icon name
}

export const GENRE_DATA: GenreItem[] = [
  { id: 0, name: 'All', icon: 'Sparkles' },
  { id: 28, name: 'Action', icon: 'Zap' },
  { id: 12, name: 'Adventure', icon: 'Compass' },
  { id: 16, name: 'Animation', icon: 'Palette' },
  { id: 35, name: 'Comedy', icon: 'Smile' },
  { id: 80, name: 'Crime', icon: 'Fingerprint' },
  { id: 27, name: 'Horror', icon: 'Skull' },
  { id: 10749, name: 'Romance', icon: 'Heart' },
  { id: 878, name: 'Sci-Fi', icon: 'Globe' },
  { id: 53, name: 'Thriller', icon: 'Activity' },
];

const GENRE_EXTRA_MAP: Record<string, GenreIconName> = {
  documentary: 'Video',
  drama: 'Film',
  family: 'Users',
  fantasy: 'Sparkles',
  history: 'Clock',
  music: 'Music',
  mystery: 'Search',
  'science fiction': 'Globe',
  'tv movie': 'Tv',
  war: 'Shield',
  western: 'MapPin',
  kids: 'Smile',
  news: 'Newspaper',
  reality: 'Tv',
  soap: 'Heart',
  talk: 'MessageCircle',
};

export const getGenreIcon = (id?: number, name?: string): GenreIconName => {
  if (id !== undefined) {
    const found = GENRE_DATA.find((g) => g.id === id);
    if (found) return found.icon;
  }
  if (name) {
    const key = name.trim().toLowerCase();
    if (GENRE_EXTRA_MAP[key]) return GENRE_EXTRA_MAP[key];
    const foundByName = GENRE_DATA.find((g) => g.name.toLowerCase() === key);
    if (foundByName) return foundByName.icon;
  }
  return 'Film';
};
