import { describe, it, expect } from 'vitest'
import {
  computeFavoriteGame,
  computeTopHardware,
  computeSessionStats,
  groupSessionsByDistinctGame,
  partitionSessionsForShowcase,
  filterAndSortSessions,
  formatHours,
  formatLiveElapsed,
} from '../utils/game-activity-stats'
import type { NormalizedPlaySession } from '../hooks/use-user-game-sessions'

const mockSessions: NormalizedPlaySession[] = [
  {
    id: 's1',
    gameId: 'g1',
    gameTitle: "Baldur's Gate 3",
    startTime: 1000,
    durationSeconds: 7200,
    avgFps: 80,
    low1Percent: 60,
    low01Percent: null,
    minFps: 40,
    maxFps: 100,
    totalFrames: 500000,
    hardwareSummary: 'RTX 4090 · i9-13900K',
    node: { name: 'Main PC' },
  },
  {
    id: 's2',
    gameId: 'g1',
    gameTitle: "Baldur's Gate 3",
    startTime: 3000,
    durationSeconds: 3600,
    avgFps: 85,
    low1Percent: 65,
    low01Percent: null,
    minFps: 45,
    maxFps: 110,
    totalFrames: 300000,
    hardwareSummary: 'RTX 4090 · i9-13900K',
    node: { name: 'Main PC' },
  },
  {
    id: 's3',
    gameId: 'g2',
    gameTitle: 'Cyberpunk 2077',
    startTime: 2000,
    durationSeconds: 5400,
    avgFps: 95,
    low1Percent: 70,
    low01Percent: null,
    minFps: 50,
    maxFps: 120,
    totalFrames: 450000,
    hardwareSummary: 'RTX 3070 · Living Room',
    node: { name: 'Living Room Rig' },
  },
]

describe('game-activity-stats utils', () => {
  it('computes favorite game based on highest cumulative playtime', () => {
    const favorite = computeFavoriteGame(mockSessions)
    expect(favorite).not.toBeNull()
    expect(favorite?.title).toBe("Baldur's Gate 3")
    expect(favorite?.totalSeconds).toBe(10800) // 7200 + 3600
    expect(favorite?.sessionCount).toBe(2)
    expect(favorite?.avgFps).toBe(82.5) // (80 + 85) / 2
  })

  it('computes top hardware device based on session count', () => {
    const topHw = computeTopHardware(mockSessions)
    expect(topHw).not.toBeNull()
    expect(topHw?.hardwareSummary).toBe('RTX 4090 · i9-13900K')
    expect(topHw?.nodeName).toBe('Main PC')
    expect(topHw?.sessionCount).toBe(2)
    expect(topHw?.totalSeconds).toBe(10800)
  })

  it('computes overall session stats', () => {
    const stats = computeSessionStats(mockSessions)
    expect(stats.totalSessions).toBe(3)
    expect(stats.totalDurationSeconds).toBe(16200)
    expect(stats.totalFrames).toBe(1250000)
    expect(Math.round(stats.overallAvgFps!)).toBe(87) // (80 + 85 + 95) / 3 = 86.67
    expect(Math.round(stats.overallAvgLow1!)).toBe(65) // (60 + 65 + 70) / 3 = 65
  })

  it('filters sessions by search term', () => {
    const filtered = filterAndSortSessions(mockSessions, { search: 'Cyber' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].gameTitle).toBe('Cyberpunk 2077')
  })

  it('filters sessions by node', () => {
    const filtered = filterAndSortSessions(mockSessions, { nodeFilter: 'Living Room Rig' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('s3')
  })

  it('sorts sessions by duration', () => {
    const sorted = filterAndSortSessions(mockSessions, { sortBy: 'duration' })
    expect(sorted[0].durationSeconds).toBe(7200)
    expect(sorted[1].durationSeconds).toBe(5400)
    expect(sorted[2].durationSeconds).toBe(3600)
  })

  it('sorts sessions by fps', () => {
    const sorted = filterAndSortSessions(mockSessions, { sortBy: 'fps' })
    expect(sorted[0].avgFps).toBe(95)
    expect(sorted[1].avgFps).toBe(85)
    expect(sorted[2].avgFps).toBe(80)
  })

  it('handles empty session arrays gracefully', () => {
    expect(computeFavoriteGame([])).toBeNull()
    expect(computeTopHardware([])).toBeNull()
    const stats = computeSessionStats([])
    expect(stats.totalSessions).toBe(0)
    expect(stats.overallAvgFps).toBeNull()
  })

  it('formats playtime into hours when it makes sense', () => {
    expect(formatHours(0)).toBe('0 hrs')
    expect(formatHours(1800)).toBe('30m')
    expect(formatHours(3600)).toBe('1 hr')
    expect(formatHours(7200)).toBe('2 hrs')
    expect(formatHours(5400)).toBe('1.5 hrs')
    expect(formatHours(45000)).toBe('12.5 hrs')
    expect(formatHours(432000)).toBe('120 hrs')
  })

  it('formats active live elapsed durations cleanly', () => {
    expect(formatLiveElapsed(0)).toBe('0s')
    expect(formatLiveElapsed(45)).toBe('45s')
    expect(formatLiveElapsed(1240)).toBe('20m 40s')
    expect(formatLiveElapsed(3600)).toBe('1h')
    expect(formatLiveElapsed(7500)).toBe('2h 5m')
  })

  it('groups sessions by distinct game with cumulative totals', () => {
    const groups = groupSessionsByDistinctGame(mockSessions)
    expect(groups).toHaveLength(2)

    // Baldur's Gate 3 (2 sessions, 10800s total, latest session s2 at 3000)
    const bg3Group = groups.find((g) => g.gameId === 'g1')
    expect(bg3Group).toBeDefined()
    expect(bg3Group?.gameTitle).toBe("Baldur's Gate 3")
    expect(bg3Group?.sessionCount).toBe(2)
    expect(bg3Group?.totalSeconds).toBe(10800)
    expect(bg3Group?.latestSession.id).toBe('s2')

    // Cyberpunk 2077 (1 session, 5400s)
    const cpGroup = groups.find((g) => g.gameId === 'g2')
    expect(cpGroup).toBeDefined()
    expect(cpGroup?.sessionCount).toBe(1)
    expect(cpGroup?.totalSeconds).toBe(5400)
  })

  it('partitions sessions for showcase with distinct featured games', () => {
    // 2 distinct games, target 3 slots with activeCount 0
    const partition = partitionSessionsForShowcase(mockSessions, 0)
    expect(partition.featuredSessions).toHaveLength(3)
    // First 2 featured slots are latest sessions of distinct games
    expect(partition.featuredSessions[0].gameTitle).toBe("Baldur's Gate 3")
    expect(partition.featuredSessions[1].gameTitle).toBe('Cyberpunk 2077')
    // 3rd slot filled with remaining session from BG3
    expect(partition.featuredSessions[2].id).toBe('s1')
  })

  it('partitions sessions correctly with active game running', () => {
    // With 1 active game, target 2 featured slots
    const partition = partitionSessionsForShowcase(mockSessions, 1)
    expect(partition.featuredSessions).toHaveLength(2)
    // 2 distinct games featured
    expect(partition.featuredSessions[0].gameTitle).toBe("Baldur's Gate 3")
    expect(partition.featuredSessions[1].gameTitle).toBe('Cyberpunk 2077')
  })

  it('filters sessions using gameFilter', () => {
    const filtered = filterAndSortSessions(mockSessions, { gameFilter: 'Cyberpunk 2077' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].gameTitle).toBe('Cyberpunk 2077')

    const all = filterAndSortSessions(mockSessions, { gameFilter: 'all' })
    expect(all).toHaveLength(3)
  })
})
