// desktop/game/achievements/__tests__/tracker.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        pragma: vi.fn(),
        prepare: vi.fn(),
        transaction: vi.fn((fn: any) => fn),
        exec: vi.fn(),
      }
    }),
  }
})

import { AchievementsRepository } from '../../../db/repositories/achievements'
import { AchievementTracker } from '../tracker'

describe('AchievementsRepository and AchievementTracker', () => {
  let mockDb: any
  let repo: AchievementsRepository
  let tracker: AchievementTracker
  let mockAchievements: any[] = []
  let mockUnlocks: any[] = []

  beforeEach(() => {
    mockAchievements = []
    mockUnlocks = []

    mockDb = {
      pragma: vi.fn(),
      prepare: vi.fn((query: string) => {
        if (query.includes('COUNT(g.id)')) {
          return {
            get: vi.fn((gameId: string) => {
              const items = mockAchievements.filter(a => a.game_id === gameId)
              const total = items.length
              const unlockedItems = items.filter(a => mockUnlocks.some(u => u.game_id === gameId && u.api_name === a.api_name))
              const unlocked = unlockedItems.length
              const totalPoints = items.reduce((sum, a) => sum + (a.points || 0), 0)
              const earnedPoints = unlockedItems.reduce((sum, a) => sum + (a.points || 0), 0)
              return { total, unlocked, totalPoints, earnedPoints }
            }),
            all: vi.fn(() => []),
            run: vi.fn(() => ({ changes: 0 })),
          }
        }

        if (query.includes('FROM game_achievements g') && query.includes('LEFT JOIN unlocked_achievements u')) {
          return {
            all: vi.fn((gameId: string) => {
              return mockAchievements
                .filter(a => a.game_id === gameId)
                .map(a => {
                  const u = mockUnlocks.find(x => x.game_id === gameId && x.api_name === a.api_name)
                  return {
                    ...a,
                    unlocked_at: u ? u.unlocked_at : null,
                    source: u ? u.source : null,
                    unlocked: u ? 1 : 0,
                  }
                })
            }),
            get: vi.fn(() => null),
            run: vi.fn(() => ({ changes: 0 })),
          }
        }

        if (query.includes('INSERT INTO game_achievements')) {
          return {
            run: vi.fn((id, gameId, appId, apiName, displayName, desc, icon, iconGray, hidden, points, rarity) => {
              const existingIdx = mockAchievements.findIndex(a => a.game_id === gameId && a.api_name === apiName)
              const item = {
                id,
                game_id: gameId,
                app_id: appId,
                api_name: apiName,
                display_name: displayName,
                description: desc,
                icon_url: icon,
                icon_locked_url: iconGray,
                hidden,
                points,
                rarity_percentage: rarity,
              }
              if (existingIdx >= 0) {
                mockAchievements[existingIdx] = item
              } else {
                mockAchievements.push(item)
              }
            }),
            all: vi.fn(() => []),
            get: vi.fn(() => null),
          }
        }

        if (query.includes('INSERT OR IGNORE INTO unlocked_achievements')) {
          return {
            run: vi.fn((id, gameId, apiName, unlockedAt, source) => {
              const existing = mockUnlocks.find(u => u.game_id === gameId && u.api_name === apiName)
              if (existing) {
                return { changes: 0 }
              }
              mockUnlocks.push({ id, game_id: gameId, api_name: apiName, unlocked_at: unlockedAt, source })
              return { changes: 1 }
            }),
            all: vi.fn(() => []),
            get: vi.fn(() => null),
          }
        }

        return {
          all: vi.fn(() => []),
          get: vi.fn(() => null),
          run: vi.fn(() => ({ changes: 0 })),
        }
      }),
      transaction: vi.fn((fn: any) => fn),
    }

    repo = new AchievementsRepository(mockDb)
    tracker = new AchievementTracker(repo)
  })

  it('upserts achievements and retrieves them for a game', () => {
    repo.upsertAchievements([
      {
        id: 'game1:ACH_01',
        game_id: 'game1',
        app_id: '620',
        api_name: 'ACH_01',
        display_name: 'First Step',
        description: 'Complete the prologue',
        icon_url: 'https://example.com/icon1.jpg',
        icon_locked_url: 'https://example.com/icon1_gray.jpg',
        hidden: 0,
        points: 15,
        rarity_percentage: 85.5,
      },
      {
        id: 'game1:ACH_02',
        game_id: 'game1',
        app_id: '620',
        api_name: 'ACH_02',
        display_name: 'Master',
        description: 'Finish with 0 deaths',
        icon_url: 'https://example.com/icon2.jpg',
        icon_locked_url: null,
        hidden: 1,
        points: 50,
        rarity_percentage: 4.2,
      },
    ])

    const list = tracker.getAchievementsForGame('game1')
    expect(list).toHaveLength(2)
    expect(list[0].apiName).toBe('ACH_01')
    expect(list[0].points).toBe(15)
    expect(list[0].unlocked).toBe(false)
  })

  it('unlocks achievement, updates stats, and emits achievement:unlocked event', () => {
    repo.upsertAchievements([
      {
        id: 'game1:ACH_01',
        game_id: 'game1',
        app_id: '620',
        api_name: 'ACH_01',
        display_name: 'First Step',
        description: 'Complete the prologue',
        icon_url: 'https://example.com/icon1.jpg',
        icon_locked_url: null,
        hidden: 0,
        points: 20,
        rarity_percentage: 75.0,
      },
    ])

    const unlockListener = vi.fn()
    tracker.on('achievement:unlocked', unlockListener)

    const newlyUnlocked = tracker.handleUnlock('game1', 'Portal 2', 'ACH_01', 'steam', 1700000000)
    expect(newlyUnlocked).toBe(true)

    expect(unlockListener).toHaveBeenCalledTimes(1)
    expect(unlockListener).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game1',
        gameTitle: 'Portal 2',
        apiName: 'ACH_01',
        displayName: 'First Step',
        points: 20,
        source: 'steam',
        unlockedAt: 1700000000,
      })
    )

    // Check stats
    const stats = tracker.getStatsForGame('game1')
    expect(stats).toEqual({
      total: 1,
      unlocked: 1,
      totalPoints: 20,
      earnedPoints: 20,
      completionPercentage: 100,
    })

    // Unlocking again does not re-emit or count twice
    const secondUnlock = tracker.handleUnlock('game1', 'Portal 2', 'ACH_01', 'steam', 1700000000)
    expect(secondUnlock).toBe(false)
    expect(unlockListener).toHaveBeenCalledTimes(1)
  })
})
