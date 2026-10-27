export interface MediaPlatformEntry {
  id: string
  platform: {
    id: string
    name: string
    slug: string
    logoImageId?: string
  }
}

export interface MediaGameModeEntry {
  id: string
  gameMode: {
    id: string
    name: string
    slug: string
  }
}

export const extractValidPlatforms = (platforms: unknown): MediaPlatformEntry[] => {
  if (!Array.isArray(platforms)) return []
  return platforms.filter(
    (p): p is MediaPlatformEntry => Boolean(p && p.platform && p.platform.slug),
  )
}

export const extractValidGameModes = (gameModes: unknown): MediaGameModeEntry[] => {
  if (!Array.isArray(gameModes)) return []
  return gameModes.filter(
    (m): m is MediaGameModeEntry => Boolean(m && m.gameMode && m.gameMode.name),
  )
}

export const hasGameOverviewContent = (detail: any): boolean => {
  if (!detail || !detail.game) return false
  const game = detail.game
  return Boolean(
    detail.steamPlaytimeForever != null ||
    game.currentPlayers != null ||
    game.recommendations != null ||
    game.reviewSummary ||
    game.timeToBeat?.normally != null ||
    game.timeToBeat?.hastly != null ||
    game.timeToBeat?.completely != null,
  )
}
