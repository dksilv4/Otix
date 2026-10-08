import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { GamingXpHost } from '../components/organisms/gaming-xp-host'
import { apiClient } from '@/lib/api/client'
import * as xpToast from '@/components/ui/atoms/xp-toast'
import * as runningHooks from '../hooks/use-running-game'
import * as authHooks from '@/features/auth/hooks/use-auth'
import { resetGamingSessionState, getGamingSessionState } from '../utils/gaming-xp-store'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

vi.mock('@/components/ui/atoms/xp-toast', () => ({
  showXPToast: vi.fn(),
}))

vi.mock('../hooks/use-running-game', () => ({
  useRunningGame: vi.fn(),
}))

vi.mock('../hooks/use-cs2-game-state', () => ({
  useCs2GameState: vi.fn(),
}))

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}))

import * as cs2Hooks from '../hooks/use-cs2-game-state'

describe('GamingXpHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGamingSessionState()
    vi.mocked(cs2Hooks.useCs2GameState).mockReturnValue({
      gameState: null,
      isCs2Active: false,
    })
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: { id: 1, username: 'alice', totalXp: 100 } as any,
    } as any)
  })

  it('does nothing when no game is running', () => {
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: null,
      elapsedMs: 0,
    })

    render(<GamingXpHost />)
    expect(apiClient.post).not.toHaveBeenCalled()
    expect(getGamingSessionState().isGaming).toBe(false)
  })

  it('updates live session XP in store (1 XP per minute) without in-game toast', async () => {
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: {
        game: { id: 'elden-ring', title: 'Elden Ring', platform: 'pc' },
        startTime: 1000000,
        launchedByOtix: false,
      },
      elapsedMs: 180000, // 180s = 3 minutes -> 3 XP live
    })

    render(<GamingXpHost />)

    const state = getGamingSessionState()
    expect(state.isGaming).toBe(true)
    expect(state.sessionXp).toBe(3)
    // No toast during active gameplay
    expect(xpToast.showXPToast).not.toHaveBeenCalled()
  })

  it('posts periodic heartbeat at 5 minutes without showing toast during gameplay', async () => {
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: {
        game: { id: 'elden-ring', title: 'Elden Ring', platform: 'pc' },
        startTime: 1000000,
        launchedByOtix: false,
      },
      elapsedMs: 300000, // 300s = 5 minutes
    })

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        status: 'ok',
        xpAwarded: 0,
        totalXp: 100,
        level: 1,
        sessionXp: 5,
        dailyXp: 0,
      },
    })

    render(<GamingXpHost />)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/users/me/gaming-heartbeat',
        expect.objectContaining({
          gameId: 'elden-ring',
          gameTitle: 'Elden Ring',
          durationSeconds: 300,
          isFinal: false,
        }),
      )
      // Must not reward or toast during active gameplay
      expect(xpToast.showXPToast).not.toHaveBeenCalled()
    })
  })

  it('rewards XP and shows toast when the session ends', async () => {
    const game = { id: 'elden-ring', title: 'Elden Ring', platform: 'pc' }
    const { rerender } = render(<GamingXpHost />)

    // Game starts playing for 10 minutes (600s = 10 XP)
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: {
        game,
        startTime: 1000000,
        launchedByOtix: false,
      },
      elapsedMs: 600000,
    })
    rerender(<GamingXpHost />)
    expect(getGamingSessionState().sessionXp).toBe(10)

    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        status: 'ok',
        xpAwarded: 10,
        totalXp: 110,
        level: 1,
        sessionXp: 10,
        dailyXp: 10,
      },
    })

    // Game closes (runningGame becomes null)
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: null,
      elapsedMs: 600000,
    })
    rerender(<GamingXpHost />)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/users/me/gaming-heartbeat',
        expect.objectContaining({
          gameId: 'elden-ring',
          gameTitle: 'Elden Ring',
          durationSeconds: 600,
          isFinal: true,
        }),
      )
      expect(xpToast.showXPToast).toHaveBeenCalledWith(10, 'Elden Ring', 100)
    })
  })

  it('rewards XP with win bonus and KDR multiplier on match completion (gameover)', async () => {
    const game = { id: 'cs2', title: 'Counter-Strike 2', platform: 'pc' }
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: {
        game,
        startTime: 1000000,
        launchedByOtix: true,
      },
      elapsedMs: 1200000, // 20 mins
    })

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        status: 'ok',
        xpAwarded: 240,
        totalXp: 340,
        level: 2,
        sessionXp: 20,
        dailyXp: 240,
        breakdown: {
          baseXp: 20,
          completionXp: 50,
          winXp: 50,
          kdr: 2.0,
          kdrMultiplier: 2.0,
          totalCalculated: 240,
        },
      },
    })

    // CS2 match completes: team CT won 13-9, player has 20 kills, 10 deaths (2.0 KDR)
    vi.mocked(cs2Hooks.useCs2GameState).mockReturnValue({
      gameState: {
        activity: 'playing',
        isInGame: true,
        phase: 'gameover',
        mapName: 'Mirage',
        round: 22,
        scoreCt: 13,
        scoreT: 9,
        team: 'CT',
        kills: 20,
        deaths: 10,
        assists: 5,
        mvps: 3,
        health: 100,
        armor: 100,
        helmet: true,
        rawMapName: 'de_mirage',
        mode: 'competitive',
        roundKills: 0,
        timestamp: Date.now(),
      },
      isCs2Active: true,
    })

    render(<GamingXpHost />)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/users/me/gaming-heartbeat',
        expect.objectContaining({
          gameId: 'cs2',
          gameTitle: 'Counter-Strike 2',
          isFinal: false,
          matchCompleted: true,
          matchWon: true,
          kills: 20,
          deaths: 10,
        }),
      )
      expect(xpToast.showXPToast).toHaveBeenCalledWith(
        240,
        'Counter-Strike 2 · Victory · 2x KDR',
        100,
      )
    })
  })
})
