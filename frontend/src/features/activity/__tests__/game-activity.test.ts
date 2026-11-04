import { describe, it, expect } from 'vitest'
import {
  formatFpsBadge,
  formatMultiGameIndex,
  getBackgroundRunningGames,
} from '../utils/game-activity'
import type { RunningGameData } from '@/lib/desktop/api'

describe('game-activity utils', () => {
  describe('formatFpsBadge', () => {
    it('returns empty text and class for non-positive FPS', () => {
      expect(formatFpsBadge(0)).toEqual({ text: '', className: '' })
      expect(formatFpsBadge(-5)).toEqual({ text: '', className: '' })
    })

    it('returns semantic high-fps style for >= 60 FPS', () => {
      const result = formatFpsBadge(144)
      expect(result.text).toBe('144 FPS')
      expect(result.className).toContain('text-primary')
      expect(result.className).not.toMatch(/emerald|green|cyan/)
    })

    it('returns semantic medium-fps style for 30-59 FPS', () => {
      const result = formatFpsBadge(45)
      expect(result.text).toBe('45 FPS')
      expect(result.className).toContain('text-foreground')
    })

    it('returns muted style for < 30 FPS', () => {
      const result = formatFpsBadge(22)
      expect(result.text).toBe('22 FPS')
      expect(result.className).toContain('text-muted-foreground')
    })
  })

  describe('formatMultiGameIndex', () => {
    it('returns empty string when total is <= 1', () => {
      expect(formatMultiGameIndex(0, 1)).toBe('')
      expect(formatMultiGameIndex(0, 0)).toBe('')
    })

    it('returns 1-based index and total count', () => {
      expect(formatMultiGameIndex(0, 2)).toBe('[1/2]')
      expect(formatMultiGameIndex(1, 2)).toBe('[2/2]')
      expect(formatMultiGameIndex(2, 5)).toBe('[3/5]')
    })
  })

  describe('getBackgroundRunningGames', () => {
    it('returns empty array when 1 or fewer games run', () => {
      expect(getBackgroundRunningGames([])).toEqual([])
      const single: RunningGameData = {
        game: { id: 'g1', title: 'Game 1' },
        startTime: Date.now(),
        launchedByOtix: false,
      }
      expect(getBackgroundRunningGames([single], 'g1')).toEqual([])
    })

    it('filters out the active game and returns background games', () => {
      const g1: RunningGameData = {
        game: { id: 'g1', title: 'Game 1' },
        startTime: Date.now(),
        launchedByOtix: false,
      }
      const g2: RunningGameData = {
        game: { id: 'g2', title: 'Game 2' },
        startTime: Date.now(),
        launchedByOtix: false,
      }
      const g3: RunningGameData = {
        game: { id: 'g3', title: 'Game 3' },
        startTime: Date.now(),
        launchedByOtix: false,
      }

      const bg = getBackgroundRunningGames([g1, g2, g3], 'g1')
      expect(bg).toHaveLength(2)
      expect(bg.map((g) => g.game.id)).toEqual(['g2', 'g3'])
    })
  })
})
