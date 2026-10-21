export interface UserGamification {
  level: number
  xp: number
  xpToNextLevel: number
  xpProgress: number // 0-1
  levelTitle: string
}

export type SectionVisibility = 'public' | 'friends' | 'private'
export type SectionVisibilityMap = Record<string, SectionVisibility>

export interface ProfileSectionMeta {
  id: string
  title: string
  description: string
  defaultVisibility: SectionVisibility
}

export interface Top5Item {
  id: string | number
  title: string
  mediaType: string
  posterUrl: string | null
  backdropUrl: string | null
  releaseYear: number | null
  score: number | null
}

export interface UserHardwareSpecs {
  isPrivate: boolean
  hasHardware: boolean
  cpu: string | null
  gpu: string | null
  ram: string | null
  os: string | null
  display: string | null
  nodeCount: number
  serverCount: number
  totalStorageBytes: number
  recentGame: string | null
  avgFps: number | null
}

// Re-export from constants for convenience
export type { LevelTier } from './constants'
