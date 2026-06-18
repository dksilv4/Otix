export interface UserGamification {
  level: number
  xp: number
  xpToNextLevel: number
  xpProgress: number // 0-1
  levelTitle: string
}

// Re-export from constants for convenience
export type { LevelTier } from './constants'
