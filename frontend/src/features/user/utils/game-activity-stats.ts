import type { NormalizedPlaySession } from '../hooks/use-user-game-sessions'

export interface FavoriteGameStats {
  title: string
  posterUrl?: string | null
  totalSeconds: number
  sessionCount: number
  avgFps: number | null
}

export interface TopHardwareStats {
  hardwareSummary?: string | null
  nodeName?: string | null
  sessionCount: number
  totalSeconds: number
}

export interface OverallSessionStats {
  totalSessions: number
  totalDurationSeconds: number
  overallAvgFps: number | null
  overallAvgLow1: number | null
  totalFrames: number
}

export interface DistinctGameGroup {
  gameId: string
  gameTitle: string
  posterUrl?: string | null
  bannerUrl?: string | null
  backdropUrl?: string | null
  totalSeconds: number
  sessionCount: number
  latestSession: NormalizedPlaySession
  allSessions: NormalizedPlaySession[]
}

export interface ShowcasePartitionResult {
  featuredSessions: NormalizedPlaySession[]
  pastGames: DistinctGameGroup[]
}

export type SessionSortOption = 'recent' | 'duration' | 'fps' | 'title'

export const computeFavoriteGame = (
  sessions: NormalizedPlaySession[],
): FavoriteGameStats | null => {
  if (!sessions || sessions.length === 0) return null

  const gameMap = new Map<
    string,
    {
      title: string
      posterUrl?: string | null
      totalSeconds: number
      sessionCount: number
      totalFps: number
      fpsCount: number
    }
  >()

  for (const session of sessions) {
    const key = session.gameTitle.trim().toLowerCase()
    const existing = gameMap.get(key)
    const fpsVal = session.avgFps && session.avgFps > 0 ? session.avgFps : null

    if (existing) {
      existing.totalSeconds += session.durationSeconds
      existing.sessionCount += 1
      if (fpsVal !== null) {
        existing.totalFps += fpsVal
        existing.fpsCount += 1
      }
      if (!existing.posterUrl && session.posterUrl) {
        existing.posterUrl = session.posterUrl
      }
    } else {
      gameMap.set(key, {
        title: session.gameTitle,
        posterUrl: session.posterUrl,
        totalSeconds: session.durationSeconds,
        sessionCount: 1,
        totalFps: fpsVal ?? 0,
        fpsCount: fpsVal ? 1 : 0,
      })
    }
  }

  let favorite: FavoriteGameStats | null = null
  let maxSeconds = -1

  for (const entry of gameMap.values()) {
    if (entry.totalSeconds > maxSeconds) {
      maxSeconds = entry.totalSeconds
      favorite = {
        title: entry.title,
        posterUrl: entry.posterUrl,
        totalSeconds: entry.totalSeconds,
        sessionCount: entry.sessionCount,
        avgFps: entry.fpsCount > 0 ? entry.totalFps / entry.fpsCount : null,
      }
    }
  }

  return favorite
}

export const computeTopHardware = (
  sessions: NormalizedPlaySession[],
): TopHardwareStats | null => {
  if (!sessions || sessions.length === 0) return null

  const hwMap = new Map<
    string,
    {
      hardwareSummary?: string | null
      nodeName?: string | null
      sessionCount: number
      totalSeconds: number
    }
  >()

  for (const session of sessions) {
    const hwKey =
      session.hardwareSummary ||
      session.node?.name ||
      'Desktop'
    const existing = hwMap.get(hwKey)

    if (existing) {
      existing.sessionCount += 1
      existing.totalSeconds += session.durationSeconds
      if (!existing.nodeName && session.node?.name) {
        existing.nodeName = session.node.name
      }
      if (!existing.hardwareSummary && session.hardwareSummary) {
        existing.hardwareSummary = session.hardwareSummary
      }
    } else {
      hwMap.set(hwKey, {
        hardwareSummary: session.hardwareSummary,
        nodeName: session.node?.name,
        sessionCount: 1,
        totalSeconds: session.durationSeconds,
      })
    }
  }

  let top: TopHardwareStats | null = null
  let maxCount = -1

  for (const entry of hwMap.values()) {
    if (entry.sessionCount > maxCount) {
      maxCount = entry.sessionCount
      top = entry
    }
  }

  return top
}

export const computeSessionStats = (
  sessions: NormalizedPlaySession[],
): OverallSessionStats => {
  if (!sessions || sessions.length === 0) {
    return {
      totalSessions: 0,
      totalDurationSeconds: 0,
      overallAvgFps: null,
      overallAvgLow1: null,
      totalFrames: 0,
    }
  }

  const totalSessions = sessions.length
  const totalDurationSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0)
  const totalFrames = sessions.reduce((acc, s) => acc + (s.totalFrames ?? 0), 0)

  const withFps = sessions.filter((s) => s.avgFps !== null && s.avgFps > 0)
  const overallAvgFps =
    withFps.length > 0
      ? withFps.reduce((acc, s) => acc + (s.avgFps || 0), 0) / withFps.length
      : null

  const withLow1 = sessions.filter((s) => s.low1Percent !== null && s.low1Percent > 0)
  const overallAvgLow1 =
    withLow1.length > 0
      ? withLow1.reduce((acc, s) => acc + (s.low1Percent || 0), 0) / withLow1.length
      : null

  return {
    totalSessions,
    totalDurationSeconds,
    overallAvgFps,
    overallAvgLow1,
    totalFrames,
  }
}

export const groupSessionsByDistinctGame = (
  sessions: NormalizedPlaySession[],
): DistinctGameGroup[] => {
  if (!sessions || sessions.length === 0) return []

  const map = new Map<string, DistinctGameGroup>()

  for (const session of sessions) {
    const key = session.gameId || session.gameTitle.trim().toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.totalSeconds += session.durationSeconds
      existing.sessionCount += 1
      existing.allSessions.push(session)
      if (session.startTime > existing.latestSession.startTime) {
        existing.latestSession = session
      }
      if (!existing.posterUrl && session.posterUrl) {
        existing.posterUrl = session.posterUrl
      }
      if (!existing.bannerUrl && session.bannerUrl) {
        existing.bannerUrl = session.bannerUrl
      }
      if (!existing.backdropUrl && session.backdropUrl) {
        existing.backdropUrl = session.backdropUrl
      }
    } else {
      map.set(key, {
        gameId: session.gameId,
        gameTitle: session.gameTitle,
        posterUrl: session.posterUrl,
        bannerUrl: session.bannerUrl,
        backdropUrl: session.backdropUrl,
        totalSeconds: session.durationSeconds,
        sessionCount: 1,
        latestSession: session,
        allSessions: [session],
      })
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.latestSession.startTime || 0) - (a.latestSession.startTime || 0),
  )
}

export const partitionSessionsForShowcase = (
  sessions: NormalizedPlaySession[],
  activeCount: number = 0,
): ShowcasePartitionResult => {
  if (!sessions || sessions.length === 0) {
    return { featuredSessions: [], pastGames: [] }
  }

  const targetFeatured = Math.max(1, 3 - activeCount)
  const distinctGroups = groupSessionsByDistinctGame(sessions)

  const featuredSessions: NormalizedPlaySession[] = []
  const featuredGameKeys = new Set<string>()

  // Pick distinct recent games first for the featured slots
  for (const group of distinctGroups) {
    if (featuredSessions.length >= targetFeatured) break
    const key = group.gameId || group.gameTitle.trim().toLowerCase()
    featuredSessions.push(group.latestSession)
    featuredGameKeys.add(key)
  }

  // If fewer distinct games than slots, fill with remaining sessions from those games
  if (featuredSessions.length < targetFeatured) {
    const featuredIds = new Set(featuredSessions.map((s) => s.id))
    for (const session of sessions) {
      if (featuredSessions.length >= targetFeatured) break
      if (!featuredIds.has(session.id)) {
        featuredSessions.push(session)
        featuredIds.add(session.id)
      }
    }
  }

  // The remaining past games shelf contains all other distinct games
  const pastGames = distinctGroups.filter((g) => {
    const key = g.gameId || g.gameTitle.trim().toLowerCase()
    return !featuredGameKeys.has(key)
  })

  return {
    featuredSessions,
    pastGames,
  }
}

export const filterAndSortSessions = (
  sessions: NormalizedPlaySession[],
  options: {
    search?: string
    sortBy?: SessionSortOption
    nodeFilter?: string
    gameFilter?: string
  },
): NormalizedPlaySession[] => {
  const { search = '', sortBy = 'recent', nodeFilter = 'all', gameFilter = 'all' } = options

  let filtered = sessions

  if (search.trim()) {
    const q = search.trim().toLowerCase()
    filtered = filtered.filter((s) => s.gameTitle.toLowerCase().includes(q))
  }

  if (nodeFilter && nodeFilter !== 'all') {
    filtered = filtered.filter((s) => {
      const nodeName = s.node?.name || 'desktop'
      return nodeName.toLowerCase() === nodeFilter.toLowerCase()
    })
  }

  if (gameFilter && gameFilter !== 'all') {
    filtered = filtered.filter((s) => {
      return s.gameTitle.toLowerCase() === gameFilter.toLowerCase()
    })
  }

  const sorted = [...filtered]

  switch (sortBy) {
    case 'duration':
      sorted.sort((a, b) => b.durationSeconds - a.durationSeconds)
      break
    case 'fps':
      sorted.sort((a, b) => (b.avgFps || 0) - (a.avgFps || 0))
      break
    case 'title':
      sorted.sort((a, b) => a.gameTitle.localeCompare(b.gameTitle))
      break
    case 'recent':
    default:
      sorted.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      break
  }

  return sorted
}

/**
 * Formats duration in seconds into a clean hours representation when it makes sense.
 * e.g. 3600 -> "1 hr", 7200 -> "2 hrs", 5400 -> "1.5 hrs", 45000 -> "12.5 hrs", 1800 -> "30m"
 */
export const formatHours = (seconds: number): string => {
  if (seconds <= 0) return '0 hrs'
  if (seconds < 3600) {
    const mins = Math.max(1, Math.round(seconds / 60))
    return `${mins}m`
  }
  const hours = seconds / 3600
  if (hours >= 100) {
    return `${Math.round(hours)} hrs`
  }
  const rounded = parseFloat(hours.toFixed(1))
  return rounded === 1 ? '1 hr' : `${rounded} hrs`
}

/**
 * Formats active elapsed playtime into hours and minutes when >= 1 hour, or minutes/seconds when shorter.
 * e.g. 7500 -> "2h 5m", 3600 -> "1h", 1240 -> "20m 40s"
 */
export const formatLiveElapsed = (seconds: number): string => {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const remainingSecs = seconds % 60
  return remainingSecs > 0 ? `${minutes}m ${remainingSecs}s` : `${minutes}m`
}
