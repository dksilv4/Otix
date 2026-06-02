// frontend/src/features/games/types.ts
import type { DetectedGame } from "@/features/game-scanner/types"

export interface ShelfRow {
  id: string
  label: string
  icon: string
  games: DetectedGame[]
  emptyMessage?: string
}

export type GamesTab = "all" | "matched" | "unmatched"

export interface GamesState {
  games: DetectedGame[]
  selectedGame: DetectedGame | null
  sidePanelOpen: boolean
  activeTab: GamesTab
  searchQuery: string
}
