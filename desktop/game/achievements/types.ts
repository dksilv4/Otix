// desktop/game/achievements/types.ts
export type AchievementSource = 'steam' | 'goldberg' | 'codex_rune' | 'retroachievements' | 'local'

export interface GameAchievement {
  id: string
  gameId: string
  appId?: string | null
  apiName: string
  displayName: string
  description?: string | null
  iconUrl?: string | null
  iconLockedUrl?: string | null
  hidden: boolean
  points: number
  rarityPercentage?: number | null
}

export interface UnlockedAchievement {
  id: string
  gameId: string
  apiName: string
  unlockedAt: number
  source: AchievementSource | string
}

export interface AchievementWithUnlock extends GameAchievement {
  unlocked: boolean
  unlockedAt: number | null
  source: string | null
}

export interface AchievementStats {
  total: number
  unlocked: number
  totalPoints: number
  earnedPoints: number
  completionPercentage: number
}

export interface AchievementUnlockEvent {
  gameId: string
  gameTitle: string
  apiName: string
  displayName: string
  description?: string | null
  iconUrl?: string | null
  points: number
  unlockedAt: number
  source: string
  rarityPercentage?: number | null
}

export interface AppIdResolution {
  appId: string | null
  raGameId?: number | null
  source: AchievementSource
  sourcePath?: string
}
