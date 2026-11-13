import { describe, it, expect } from 'vitest'
import { findMatchingRunningGame, getRunningGameStatusText } from '../running-match'
import type { RunningGameData } from '@/lib/desktop/api'
import type { LocalGame } from '@/features/launcher/types'

describe('running-match utils', () => {
  const sampleCs2RunningGame: RunningGameData = {
    game: {
      id: 'steam_730',
      title: 'Counter-Strike 2',
      platform: 'steam',
      exePath: 'C:\\Games\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
      processName: 'cs2.exe',
      otixMediaId: '3084',
    },
    startTime: Date.now() - 60000,
    launchedByOtix: false,
    pid: 42200,
  }

  const sampleScannedCs2: LocalGame = {
    id: 'steam_730',
    title: 'Counter-Strike 2',
    platform: 'steam',
    exePath: 'steam://rungameid/730',
    otixMediaId: '3084',
  }

  describe('findMatchingRunningGame', () => {
    it('returns null when runningGames is empty', () => {
      const match = findMatchingRunningGame({
        runningGames: [],
        mediaId: '3084',
        mediaTitle: 'Counter-Strike 2',
      })
      expect(match).toBeNull()
    })

    it('matches CS2 when mediaTitle is Counter-Strike 2 and running game is CS2', () => {
      const match = findMatchingRunningGame({
        runningGames: [sampleCs2RunningGame],
        mediaId: '3084',
        mediaTitle: 'Counter-Strike 2',
        matchingScannedGame: sampleScannedCs2,
      })
      expect(match).not.toBeNull()
      expect(match?.game.id).toBe('steam_730')
    })

    it('matches CS2 even if scanned game title has variation like Counter-Strike: Global Offensive', () => {
      const match = findMatchingRunningGame({
        runningGames: [sampleCs2RunningGame],
        mediaId: '3084',
        mediaTitle: 'Counter-Strike: Global Offensive',
      })
      expect(match).not.toBeNull()
      expect(match?.game.id).toBe('steam_730')
    })

    it('matches by exePath case-insensitively', () => {
      const scannedGame: LocalGame = {
        id: 'pc_local',
        title: 'Hades II',
        platform: 'pc',
        exePath: 'C:\\Games\\Hades2\\Hades2.exe',
      }
      const runningGame: RunningGameData = {
        game: {
          id: 'hades2',
          title: 'Hades II',
          exePath: 'c:\\games\\hades2\\hades2.exe',
        },
        startTime: Date.now(),
        launchedByOtix: true,
      }
      const match = findMatchingRunningGame({
        runningGames: [runningGame],
        mediaTitle: 'Hades II',
        matchingScannedGame: scannedGame,
      })
      expect(match).toBe(runningGame)
    })

    it('matches by otixMediaId or mediaId', () => {
      const runningGame: RunningGameData = {
        game: {
          id: 'custom_id',
          title: 'Elden Ring',
          otixMediaId: '12345',
        },
        startTime: Date.now(),
        launchedByOtix: false,
      }
      const match = findMatchingRunningGame({
        runningGames: [runningGame],
        mediaId: '12345',
        mediaTitle: 'Elden Ring',
      })
      expect(match).toBe(runningGame)
    })

    it('matches titles with Roman numerals via isTitleMatch', () => {
      const runningGame: RunningGameData = {
        game: {
          id: 'witcher-3',
          title: 'The Witcher 3: Wild Hunt',
        },
        startTime: Date.now(),
        launchedByOtix: false,
      }
      const match = findMatchingRunningGame({
        runningGames: [runningGame],
        mediaTitle: 'The Witcher III: Wild Hunt',
      })
      expect(match).toBe(runningGame)
    })
  })

  describe('getRunningGameStatusText', () => {
    it('returns Playing via Steam for steam platform', () => {
      expect(getRunningGameStatusText({ platform: 'steam' })).toBe('Playing via Steam')
    })

    it('returns Currently playing for non-steam platform', () => {
      expect(getRunningGameStatusText({ platform: 'pc' })).toBe('Currently playing')
      expect(getRunningGameStatusText({ platform: null })).toBe('Currently playing')
    })

    it('appends CS2 live status when available', () => {
      expect(
        getRunningGameStatusText({
          platform: 'steam',
          cs2Status: 'Mirage (CT 10 : 8 T)',
        }),
      ).toBe('Playing via Steam · Mirage (CT 10 : 8 T)')
    })

    it('ignores generic In Game status fallback', () => {
      expect(
        getRunningGameStatusText({
          platform: 'steam',
          cs2Status: 'In Game',
        }),
      ).toBe('Playing via Steam')
    })
  })
})
