import type { LocalGame } from '../types'

export const OTIX_DEFAULT_GAME_ID = 'otix'

export const OTIX_DEFAULT_GAME: LocalGame = {
  id: OTIX_DEFAULT_GAME_ID,
  title: 'Otix',
  platform: 'pc',
  exePath: '',
  installDir: '',
  iconUrl: '/otix-game/icon.jpg',
  posterUrl: '/otix-game/poster.jpg',
  textlessPosterUrl: '/otix-game/poster.jpg',
  otixPosterUrl: '/otix-game/poster.jpg',
  otixBackdropUrl: '/otix-game/backdrop.jpg',
  otixIconUrl: '/otix-game/icon.jpg',
  description:
    'Welcome to the Otix Launcher! Connect your game folders in Settings to automatically scan, organize, and launch your collection with rich metadata, patch notes, and custom themes.',
  lastPlayedAt: new Date().toISOString(),
  data: {
    id: OTIX_DEFAULT_GAME_ID,
    title: 'Otix',
    slug: 'otix',
    overview:
      'Welcome to the Otix Launcher! Connect your game folders in Settings to automatically scan, organize, and launch your collection with rich metadata, patch notes, and custom themes.',
    platform: 'pc',
    iconUrl: '/otix-game/icon.jpg',
    posterUrl: '/otix-game/poster.jpg',
    backdropUrl: '/otix-game/backdrop.jpg',
    releaseDate: '2026-09-10',
    avgRating: 99,
    ratingCount: 2048,
    isFree: true,
    hasMultiplayer: true,
    genres: [
      { id: '1', name: 'Showcase', slug: 'showcase' },
      { id: '2', name: 'Launcher', slug: 'launcher' },
      { id: '3', name: 'Sci-Fi', slug: 'sci-fi' },
    ],
    involvedCompanies: [
      {
        id: '1',
        company: { id: '1', name: 'Otix Studio', slug: 'otix-studio' },
        developer: true,
        publisher: true,
      },
    ],
    screenshots: [
      { url: '/otix-game/backdrop.jpg' },
      { url: '/otix-game/shot-combat.jpg' },
      { url: '/otix-game/shot-vista.jpg' },
      { url: '/otix-game/shot-cockpit.jpg' },
    ],
  },
}
