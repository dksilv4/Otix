import { describe, it, expect } from 'vitest'
import {
  formatUnlockDate,
  formatRarityPercentage,
  isRareAchievement,
  filterAchievements,
} from '../utils/achievement-utils'
import type { GameAchievement } from '../types'

describe('achievement-utils', () => {
  describe('formatUnlockDate', () => {
    it('returns empty string for null/undefined/0 timestamp', () => {
      expect(formatUnlockDate(null)).toBe('')
      expect(formatUnlockDate(undefined)).toBe('')
      expect(formatUnlockDate(0)).toBe('')
    })

    it('formats unix timestamp to readable date', () => {
      // 1700000000 = Nov 14, 2023
      const formatted = formatUnlockDate(1700000000)
      expect(formatted).toContain('2023')
      expect(formatted).toContain('Nov')
    })
  })

  describe('formatRarityPercentage and isRareAchievement', () => {
    it('formats percentage with one decimal place', () => {
      expect(formatRarityPercentage(4.24)).toBe('4.2%')
      expect(formatRarityPercentage(10)).toBe('10.0%')
      expect(formatRarityPercentage(null)).toBe('')
      expect(formatRarityPercentage(undefined)).toBe('')
    })

    it('identifies achievements with <= 10% unlock rate as rare', () => {
      expect(isRareAchievement(4.2)).toBe(true)
      expect(isRareAchievement(10.0)).toBe(true)
      expect(isRareAchievement(10.1)).toBe(false)
      expect(isRareAchievement(50.0)).toBe(false)
      expect(isRareAchievement(null)).toBe(false)
    })
  })

  describe('filterAchievements', () => {
    const mockAchievements: GameAchievement[] = [
      {
        id: '1',
        gameId: 'g1',
        apiName: 'ACH_START',
        displayName: 'First Blood',
        description: 'Defeat your first enemy',
        hidden: false,
        points: 10,
        rarityPercentage: 80,
        unlocked: true,
        unlockedAt: 1700000000,
        source: 'steam',
      },
      {
        id: '2',
        gameId: 'g1',
        apiName: 'ACH_MASTER',
        displayName: 'Grand Master',
        description: 'Complete the campaign on hardest difficulty',
        hidden: false,
        points: 50,
        rarityPercentage: 3.5,
        unlocked: false,
        unlockedAt: null,
        source: null,
      },
      {
        id: '3',
        gameId: 'g1',
        apiName: 'ACH_SECRET',
        displayName: 'Secret Passage',
        description: 'Find the hidden room',
        hidden: true,
        points: 25,
        rarityPercentage: 8.0,
        unlocked: true,
        unlockedAt: 1700001000,
        source: 'steam',
      },
    ]

    it('filters by status: unlocked', () => {
      const res = filterAchievements(mockAchievements, 'unlocked', '')
      expect(res).toHaveLength(2)
      expect(res.map((a) => a.apiName)).toEqual(['ACH_START', 'ACH_SECRET'])
    })

    it('filters by status: locked', () => {
      const res = filterAchievements(mockAchievements, 'locked', '')
      expect(res).toHaveLength(1)
      expect(res[0].apiName).toBe('ACH_MASTER')
    })

    it('filters by status: rare (rarity <= 10%)', () => {
      const res = filterAchievements(mockAchievements, 'rare', '')
      expect(res).toHaveLength(2)
      expect(res.map((a) => a.apiName)).toEqual(['ACH_MASTER', 'ACH_SECRET'])
    })

    it('filters by search query matching displayName or description', () => {
      const byTitle = filterAchievements(mockAchievements, 'all', 'grand')
      expect(byTitle).toHaveLength(1)
      expect(byTitle[0].displayName).toBe('Grand Master')

      const byDesc = filterAchievements(mockAchievements, 'all', 'hidden')
      expect(byDesc).toHaveLength(1)
      expect(byDesc[0].displayName).toBe('Secret Passage')
    })
  })
})
