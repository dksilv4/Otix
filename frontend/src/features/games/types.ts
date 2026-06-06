// frontend/src/features/games/types.ts
import type { DetectedGame } from "@/features/game-scanner/types"

// ── Catalog game (from Otix backend API) ─────────────────────────────

export interface CatalogGame {
  id: string
  mediaType: string
  title: string
  slug: string
  posterUrl?: string | null
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  iconUrl?: string | null
  backdropUrl?: string | null
  releaseDate?: string | null
  popularity: number
  avgRating?: number | null
  ratingCount: number
  isAdult: boolean
}

export interface CatalogGameDetail extends CatalogGame {
  overview?: string | null
  originalLanguage?: string | null
  genres: { id: string; name: string; slug: string }[]
  involvedCompanies: {
    id: string
    company: { id: string; name: string; slug: string; logoUrl?: string | null }
    developer: boolean
    publisher: boolean
  }[]
  platforms: { id: string; platform: { id: string; name: string; slug: string } }[]
  gameModes: { id: string; gameMode: { id: string; name: string; slug: string } }[]
  releaseStatus?: string | null
  website?: string | null
  steamAppId?: number | null
  steamPlaytimeForever?: number | null
  steamPlaytime2weeks?: number | null
  isFree: boolean
  hasMultiplayer: boolean
  youtubeVideoId?: string | null
  youtubeChannelTitle?: string | null
}

// ── Shelf display ───────────────────────────────────────────────────

export interface ShelfRow {
  id: string
  label: string
  icon: string
  games: DetectedGame[]
  catalogGames?: CatalogGame[]
  emptyMessage?: string
}

// ── Tab types ───────────────────────────────────────────────────────

export type GamesTab = "all" | "matched" | "unmatched"

// ── Sort options ───────────────────────────────────────────────────

export type GameSortBy = "popularity" | "rating" | "release_date" | "title"
