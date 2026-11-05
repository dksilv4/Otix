import { describe, it, expect } from 'vitest'
import {
  normalizeTitleForComparison,
  computeMatchConfidence,
  runWithConcurrencyLimit,
  filterMassMatchRows,
  getMassMatchStats,
  type MassMatchRowItem,
} from '../utils/mass-match'

describe('Mass Match Utilities', () => {
  describe('normalizeTitleForComparison', () => {
    it('lowercases and strips common edition tokens and special characters', () => {
      expect(normalizeTitleForComparison('The Witcher 3: Wild Hunt - Game of the Year Edition')).toBe(
        'the witcher 3 wild hunt',
      )
      expect(normalizeTitleForComparison('Demon\'s Souls: Remake')).toBe('demon s souls')
      expect(normalizeTitleForComparison('Cyberpunk 2077 [Deluxe Edition]')).toBe('cyberpunk 2077')
    })

    it('returns empty string for null or empty titles', () => {
      expect(normalizeTitleForComparison('')).toBe('')
    })
  })

  describe('computeMatchConfidence', () => {
    it('assigns 0.95 for exact normalized matches', () => {
      const conf = computeMatchConfidence('Grand Theft Auto V', 'Grand Theft Auto V')
      expect(conf).toBe(0.95)
    })

    it('assigns >= 0.85 for close edition variations and strong containment', () => {
      const conf = computeMatchConfidence(
        'The Witcher 3 Wild Hunt GOTY',
        'The Witcher 3: Wild Hunt',
      )
      expect(conf).toBeGreaterThanOrEqual(0.85)
    })

    it('assigns lower confidence for loose or partial overlaps', () => {
      const conf = computeMatchConfidence('Dark Souls III', 'Dark Souls II')
      expect(conf).toBeLessThan(0.85)
    })

    it('returns 0 for unrelated titles', () => {
      const conf = computeMatchConfidence('Minecraft', 'Elden Ring')
      expect(conf).toBe(0)
    })
  })

  describe('runWithConcurrencyLimit', () => {
    it('executes all items while respecting maximum concurrency', async () => {
      let active = 0
      let maxActive = 0

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const results = await runWithConcurrencyLimit(items, 3, undefined, async (item) => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
        return item * 2
      })

      expect(maxActive).toBeLessThanOrEqual(3)
      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
    })

    it('halts processing when signal is aborted', async () => {
      const controller = new AbortController()
      const items = Array.from({ length: 50 }, (_, i) => i)

      const promise = runWithConcurrencyLimit(items, 2, controller.signal, async (item, idx) => {
        if (idx === 4) {
          controller.abort()
        }
        await new Promise((r) => setTimeout(r, 5))
        return item
      })

      const results = await promise
      // Should not have processed all 50 items
      const processedCount = results.filter((r) => r !== undefined).length
      expect(processedCount).toBeLessThan(50)
    })
  })

  describe('filterMassMatchRows and getMassMatchStats', () => {
    const mockRows: MassMatchRowItem[] = [
      {
        id: '1',
        game: { id: 'g1', title: 'God of War', path: 'D:/Games/GoW' } as any,
        cleanTitle: 'God of War',
        status: 'high_confidence',
        confidence: 0.95,
        selectedCandidate: { id: '101', title: 'God of War' } as any,
        otherCandidates: [],
        selectedPlatform: 'pc',
        isSelected: true,
      },
      {
        id: '2',
        game: { id: 'g2', title: 'Spider-Man 2', path: 'D:/Games/SM2' } as any,
        cleanTitle: 'Spider-Man 2',
        status: 'needs_review',
        confidence: 0.75,
        selectedCandidate: { id: '102', title: 'Marvel Spider-Man 2' } as any,
        otherCandidates: [],
        selectedPlatform: 'ps5',
        isSelected: false,
      },
      {
        id: '3',
        game: { id: 'g3', title: 'Unknown Homebrew', path: 'D:/Games/Homebrew' } as any,
        cleanTitle: 'Unknown Homebrew',
        status: 'unmatched',
        confidence: 0,
        selectedCandidate: null,
        otherCandidates: [],
        selectedPlatform: 'pc',
        isSelected: false,
      },
    ]

    it('calculates correct stats', () => {
      const stats = getMassMatchStats(mockRows)
      expect(stats.total).toBe(3)
      expect(stats.highConfidence).toBe(1)
      expect(stats.needsReview).toBe(1)
      expect(stats.unmatched).toBe(1)
      expect(stats.selectedCount).toBe(1)
    })

    it('filters by tabs correctly', () => {
      expect(filterMassMatchRows(mockRows, 'all', '')).toHaveLength(3)
      expect(filterMassMatchRows(mockRows, 'ready', '')).toHaveLength(1)
      expect(filterMassMatchRows(mockRows, 'review', '')).toHaveLength(1)
      expect(filterMassMatchRows(mockRows, 'unmatched', '')).toHaveLength(1)
    })

    it('filters by search query', () => {
      const results = filterMassMatchRows(mockRows, 'all', 'spider')
      expect(results).toHaveLength(1)
      expect(results[0].game.title).toBe('Spider-Man 2')
    })
  })
})
