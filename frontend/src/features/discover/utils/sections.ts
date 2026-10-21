export type DiscoverCategory = 'curated' | 'cinema' | 'tv' | 'gaming' | 'social'

export interface DiscoverSectionDefinition {
  id: string
  label: string
  description: string
  category: DiscoverCategory
  defaultEnabled: boolean
}

export type DiscoverPreset = 'all' | 'gaming' | 'cinema' | 'minimal'
export type DiscoverIntent = 'all' | 'movies' | 'shows' | 'games' | 'free_games' | 'streamable'

export const DISCOVER_SECTIONS_STORAGE_KEY = 'otix:discover:sections:v4'

export const DEFAULT_DISCOVER_SECTIONS: DiscoverSectionDefinition[] = [
  {
    id: 'fan_spotlight',
    label: 'Spotlight Showcase',
    description: '3D interactive card showcase featuring top curated catalog picks',
    category: 'curated',
    defaultEnabled: true,
  },
  {
    id: 'continue_watching',
    label: 'Continue Watching',
    description: 'Jump back into media currently in progress',
    category: 'curated',
    defaultEnabled: true,
  },
  {
    id: 'streamable_media',
    label: 'Available to Stream',
    description: 'Movies and TV series ready to watch from your personal media library',
    category: 'curated',
    defaultEnabled: true,
  },
  {
    id: 'decide_for_me',
    label: 'Decide For Me',
    description: 'Smart recommendation roulette to instantly pick a movie, series, or game',
    category: 'curated',
    defaultEnabled: true,
  },
  {
    id: 'trending_movies',
    label: 'Trending Movies',
    description: 'Worldwide popular and trending feature films',
    category: 'cinema',
    defaultEnabled: true,
  },
  {
    id: 'trending_shows',
    label: 'Trending Shows',
    description: 'Top trending and acclaimed television series',
    category: 'tv',
    defaultEnabled: true,
  },
  {
    id: 'trending_seasons',
    label: 'New Seasons & Episodes',
    description: 'Latest season premieres and newly landed episodes',
    category: 'tv',
    defaultEnabled: true,
  },
  {
    id: 'free_games',
    label: 'Free Games & Deals',
    description: 'Limited-time giveaways on Epic Games, Steam, and GOG',
    category: 'gaming',
    defaultEnabled: true,
  },
  {
    id: 'gaming_rails',
    label: 'Featured Games & Platforms',
    description: 'Now playing and top rated games across PC, PlayStation, Xbox, and Switch',
    category: 'gaming',
    defaultEnabled: true,
  },
  {
    id: 'player_activity',
    label: 'Player & Friend Activity',
    description: 'Live play sessions and activity from friends and the community',
    category: 'social',
    defaultEnabled: true,
  },
  {
    id: 'genres_explore',
    label: 'Genre Explorer',
    description: 'Quick-access curated genre capsules across all media',
    category: 'curated',
    defaultEnabled: true,
  },
  {
    id: 'extended_catalog',
    label: 'Popular & Upcoming Catalog',
    description: 'Deep catalog rails for popular movies, series, and upcoming releases',
    category: 'curated',
    defaultEnabled: true,
  },
]

export const PRESET_CONFIGS: Record<DiscoverPreset, { label: string; description: string; order: string[]; enabled: string[] }> = {
  all: {
    label: 'Balanced Feed',
    description: 'All-inclusive discovery with 3D spotlight, movies, shows, games, and giveaways',
    order: [
      'fan_spotlight',
      'continue_watching',
      'decide_for_me',
      'trending_movies',
      'trending_shows',
      'trending_seasons',
      'free_games',
      'gaming_rails',
      'player_activity',
      'genres_explore',
      'extended_catalog',
    ],
    enabled: [
      'fan_spotlight',
      'continue_watching',
      'decide_for_me',
      'trending_movies',
      'trending_shows',
      'trending_seasons',
      'free_games',
      'gaming_rails',
      'player_activity',
      'genres_explore',
      'extended_catalog',
    ],
  },
  gaming: {
    label: 'Gamer Hub',
    description: 'Prioritizes free game promos, gaming spotlight, and platform rails',
    order: [
      'free_games',
      'gaming_rails',
      'decide_for_me',
      'fan_spotlight',
      'continue_watching',
      'player_activity',
      'genres_explore',
      'trending_movies',
      'trending_shows',
      'trending_seasons',
      'extended_catalog',
    ],
    enabled: [
      'free_games',
      'gaming_rails',
      'decide_for_me',
      'fan_spotlight',
      'continue_watching',
      'player_activity',
      'genres_explore',
      'extended_catalog',
    ],
  },
  cinema: {
    label: 'Cinema & TV',
    description: 'Focuses on trending movies, prestige series, and new seasons',
    order: [
      'fan_spotlight',
      'continue_watching',
      'decide_for_me',
      'trending_movies',
      'trending_shows',
      'trending_seasons',
      'genres_explore',
      'extended_catalog',
      'player_activity',
      'free_games',
      'gaming_rails',
    ],
    enabled: [
      'fan_spotlight',
      'continue_watching',
      'decide_for_me',
      'trending_movies',
      'trending_shows',
      'trending_seasons',
      'genres_explore',
      'extended_catalog',
      'player_activity',
    ],
  },
  minimal: {
    label: 'Minimalist',
    description: 'Streamlined feed with spotlight, continue watching, and free games',
    order: [
      'fan_spotlight',
      'continue_watching',
      'decide_for_me',
      'free_games',
      'trending_movies',
      'trending_shows',
      'trending_seasons',
      'gaming_rails',
      'player_activity',
      'genres_explore',
      'extended_catalog',
    ],
    enabled: ['fan_spotlight', 'continue_watching', 'decide_for_me', 'free_games'],
  },
}

export interface StoredSectionItem {
  id: string
  enabled: boolean
}

export const loadStoredSectionConfig = (): StoredSectionItem[] => {
  if (typeof window === 'undefined') {
    return DEFAULT_DISCOVER_SECTIONS.map((s) => ({ id: s.id, enabled: s.defaultEnabled }))
  }
  try {
    const raw = window.localStorage.getItem(DISCOVER_SECTIONS_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_DISCOVER_SECTIONS.map((s) => ({ id: s.id, enabled: s.defaultEnabled }))
    }
    const parsed = JSON.parse(raw) as StoredSectionItem[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_DISCOVER_SECTIONS.map((s) => ({ id: s.id, enabled: s.defaultEnabled }))
    }

    const defaultIds = new Set(DEFAULT_DISCOVER_SECTIONS.map((s) => s.id))
    const valid = parsed.filter((item) => defaultIds.has(item.id))

    // Append any newly added default sections that weren't in the saved config
    const savedIds = new Set(valid.map((item) => item.id))
    for (const def of DEFAULT_DISCOVER_SECTIONS) {
      if (!savedIds.has(def.id)) {
        valid.push({ id: def.id, enabled: def.defaultEnabled })
      }
    }
    return valid
  } catch {
    return DEFAULT_DISCOVER_SECTIONS.map((s) => ({ id: s.id, enabled: s.defaultEnabled }))
  }
}

export const saveStoredSectionConfig = (items: StoredSectionItem[]): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISCOVER_SECTIONS_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore localStorage write quota errors
  }
}

export const getSectionMeta = (id: string): DiscoverSectionDefinition | undefined => {
  return DEFAULT_DISCOVER_SECTIONS.find((s) => s.id === id)
}
