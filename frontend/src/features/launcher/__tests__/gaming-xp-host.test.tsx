import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { GamingXpHost } from '../components/organisms/gaming-xp-host'
import { apiClient } from '@/lib/api/client'
import * as xpToast from '@/components/ui/atoms/xp-toast'
import * as runningHooks from '../hooks/use-running-game'
import * as authHooks from '@/features/auth/hooks/use-auth'
import { resetGamingSessionState } from '../utils/gaming-xp-store'

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
  })

  it('posts heartbeat and triggers toast when reaching 5-minute threshold', async () => {
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
        xpAwarded: 10,
        totalXp: 110,
        level: 1,
        sessionXp: 10,
        dailyXp: 10,
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
      expect(xpToast.showXPToast).toHaveBeenCalledWith(10, 'Gaming: Elden Ring', 100)
    })
  })
})
