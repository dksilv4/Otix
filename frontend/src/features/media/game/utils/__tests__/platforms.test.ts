import { describe, it, expect } from 'vitest'
import {
  extractValidPlatforms,
  extractValidGameModes,
  hasGameOverviewContent,
} from '../platforms'

describe('platforms utils', () => {
  describe('extractValidPlatforms', () => {
    it('returns empty array for non-array input', () => {
      expect(extractValidPlatforms(null)).toEqual([])
      expect(extractValidPlatforms(undefined)).toEqual([])
      expect(extractValidPlatforms({})).toEqual([])
    })

    it('filters out invalid or incomplete platform entries', () => {
      const input = [
        null,
        {},
        { id: '1', platform: null },
        { id: '2', platform: { id: 'p2', name: 'PC', slug: 'windows' } },
        { id: '3', platform: { id: 'p3', name: '', slug: '' } },
      ]
      const result = extractValidPlatforms(input)
      expect(result).toHaveLength(1)
      expect(result[0].platform.slug).toBe('windows')
    })
  })

  describe('extractValidGameModes', () => {
    it('returns empty array for non-array input', () => {
      expect(extractValidGameModes(null)).toEqual([])
      expect(extractValidGameModes(undefined)).toEqual([])
      expect(extractValidGameModes({})).toEqual([])
    })

    it('filters out invalid or incomplete game mode entries', () => {
      const input = [
        null,
        {},
        { id: '1', gameMode: null },
        { id: '2', gameMode: { id: 'gm-1', name: 'Single-player', slug: 'single-player' } },
        { id: '3', gameMode: { id: 'gm-2', name: '', slug: 'multiplayer' } },
      ]
      const result = extractValidGameModes(input)
      expect(result).toHaveLength(1)
      expect(result[0].gameMode.name).toBe('Single-player')
    })
  })

  describe('hasGameOverviewContent', () => {
    it('returns false for null or missing game data', () => {
      expect(hasGameOverviewContent(null)).toBe(false)
      expect(hasGameOverviewContent({})).toBe(false)
      expect(hasGameOverviewContent({ game: null })).toBe(false)
    })

    it('returns false when only website exists without stats or playtime', () => {
      expect(hasGameOverviewContent({ game: { website: 'https://example.com' } })).toBe(false)
    })

    it('returns true if any steam stats, playtime, or time to beat exist', () => {
      expect(hasGameOverviewContent({ game: { currentPlayers: 100 } })).toBe(true)
      expect(hasGameOverviewContent({ game: { recommendations: 50 } })).toBe(true)
      expect(hasGameOverviewContent({ game: { reviewSummary: 'Very Positive' } })).toBe(true)
      expect(hasGameOverviewContent({ game: {}, steamPlaytimeForever: 120 })).toBe(true)
      expect(hasGameOverviewContent({ game: { timeToBeat: { normally: 300 } } })).toBe(true)
    })
  })
})
