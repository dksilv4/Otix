import { describe, it, expect } from 'vitest'
import {
  isPathOrganized,
  computeScannedFilesSummary,
  getScannedSummaryStorageKey,
  loadStoredScannedSummary,
  saveStoredScannedSummary,
} from '../scanned-summary'

describe('scanned-summary utils', () => {
  describe('isPathOrganized', () => {
    it('returns true if item status is already_organized or isOrganized is true', () => {
      expect(isPathOrganized({ status: 'already_organized' })).toBe(true)
      expect(isPathOrganized({ isOrganized: true })).toBe(true)
    })

    it('returns false for unorganized release tags or raw archives', () => {
      expect(
        isPathOrganized({
          path: 'D:\\Downloads\\Elden Ring [FitGirl Repack]\\setup.exe',
        }),
      ).toBe(false)
      expect(
        isPathOrganized({
          path: 'D:\\Downloads\\Game.part1.rar',
        }),
      ).toBe(false)
      expect(
        isPathOrganized({
          path: 'D:\\Downloads\\Cyberpunk 2077 CODEX\\setup.exe',
        }),
      ).toBe(false)
    })

    it('returns true when inside configured install directory', () => {
      expect(
        isPathOrganized(
          { path: 'D:\\Games\\Library\\Baldurs Gate 3\\bin\\bg3.exe' },
          'D:\\Games\\Library',
        ),
      ).toBe(true)
    })

    it('returns true for paths containing valid year pattern', () => {
      expect(
        isPathOrganized({
          path: 'D:\\ISOs\\Gran Turismo 4 (2004)\\game.iso',
        }),
      ).toBe(true)
    })

    it('returns true for known platforms like steam or gog', () => {
      expect(
        isPathOrganized({
          platform: 'steam',
          path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Half-Life',
        }),
      ).toBe(true)
    })
  })

  describe('computeScannedFilesSummary', () => {
    it('computes summary metrics correctly across games list', () => {
      const mockGames = [
        {
          id: '1',
          platform: 'pc',
          path: 'D:\\Games\\Hades (2020)\\Hades.exe',
          otixMediaId: 'med-1',
        },
        {
          id: '2',
          platform: 'iso',
          path: 'D:\\ISOs\\Shadow of the Colossus (2005).iso',
          otixMatchVerified: true,
        },
        {
          id: '3',
          platform: 'pc',
          path: 'D:\\Downloads\\Random [FitGirl Repack]\\setup.exe',
        },
      ]

      const summary = computeScannedFilesSummary(mockGames)

      expect(summary.totalCount).toBe(3)
      expect(summary.organizedCount).toBe(2)
      expect(summary.unorganizedCount).toBe(1)
      expect(summary.matchedCount).toBe(2)
      expect(summary.isoCount).toBe(1)
      expect(summary.installedCount).toBe(2)
      expect(summary.organizedPercentage).toBe(67)
    })

    it('handles empty games list gracefully', () => {
      const summary = computeScannedFilesSummary([])

      expect(summary.totalCount).toBe(0)
      expect(summary.organizedCount).toBe(0)
      expect(summary.unorganizedCount).toBe(0)
      expect(summary.matchedCount).toBe(0)
      expect(summary.organizedPercentage).toBe(0)
    })
  })

  describe('localStorage persistence', () => {
    it('saves and loads stored summary correctly', () => {
      const key = getScannedSummaryStorageKey(42)
      expect(key).toBe('otix:scanned-files-summary:42')

      const sample = {
        totalCount: 10,
        organizedCount: 8,
        unorganizedCount: 2,
        matchedCount: 9,
        isoCount: 3,
        installedCount: 7,
        organizedPercentage: 80,
      }

      saveStoredScannedSummary(sample, 42)
      const loaded = loadStoredScannedSummary(42)

      expect(loaded).toEqual(sample)
    })
  })
})
