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

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}))

describe('GamingXpHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGamingSessionState()
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
      expect(xpToast.showXPToast).toHaveBeenCalledWith(10, 'Gaming: Elden Ring', 100)
    })
  })
})
