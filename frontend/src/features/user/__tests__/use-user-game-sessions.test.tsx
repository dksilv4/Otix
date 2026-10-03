import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUserGameSessions } from '../hooks/use-user-game-sessions'
import * as desktopApi from '@/lib/desktop/api'
import * as launcherHooks from '@/features/launcher'

vi.mock('@/lib/desktop/api', () => ({
  getDesktopAPI: vi.fn(),
}))

vi.mock('@/features/launcher', () => ({
  useRunningGame: vi.fn(),
  useLocalGames: vi.fn().mockReturnValue({ data: [] }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useUserGameSessions hook', () => {
  let callbacks: Record<string, () => void> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    callbacks = {}

    vi.mocked(launcherHooks.useRunningGame).mockReturnValue({
      runningGame: null,
      elapsedMs: 0,
    } as any)

    vi.mocked(desktopApi.getDesktopAPI).mockReturnValue({
      getRecentSessions: vi.fn().mockResolvedValue([
        {
          id: 'sess-1',
          gameId: 'bg3',
          gameTitle: "Baldur's Gate 3",
          startTime: 1727720000000,
          endTime: 1727727200000,
          durationSeconds: 7200,
          fpsStats: {
            avgFps: 85,
            onePercentLow: 62,
          },
        },
      ]),
      onGameStarted: vi.fn((cb) => {
        callbacks['onGameStarted'] = cb
        return () => {}
      }),
      onGameEnded: vi.fn((cb) => {
        callbacks['onGameEnded'] = cb
        return () => {}
      }),
      onFpsStats: vi.fn((cb) => {
        callbacks['onFpsStats'] = cb
        return () => {}
      }),
      onSessionsUpdated: vi.fn((cb) => {
        callbacks['onSessionsUpdated'] = cb
        return () => {}
      }),
    } as any)
  })

  it('fetches and normalizes desktop sessions', async () => {
    const { result } = renderHook(() => useUserGameSessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.totalSessions).toBe(1)
    expect(result.current.data?.totalDurationSeconds).toBe(7200)
    expect(result.current.data?.overallAvgFps).toBe(85)
    expect(result.current.data?.sessions[0].gameTitle).toBe("Baldur's Gate 3")
  })

  it('synthesizes activeSession and augments duration when a game is actively running', async () => {
    vi.mocked(launcherHooks.useRunningGame).mockReturnValue({
      runningGame: {
        game: {
          id: 'cp2077',
          title: 'Cyberpunk 2077',
          exePath: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
          platform: 'pc',
        },
        startTime: Date.now() - 600000,
        pid: 1234,
        fpsSnapshot: {
          currentFps: 98.2,
          frameCount: 58000,
          captureDurationMs: 600000,
          gameId: 'cp2077',
        },
      },
      elapsedMs: 600000,
    } as any)

    const { result } = renderHook(() => useUserGameSessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.activeSession).toBeDefined()
    expect(result.current.data?.activeSession?.gameTitle).toBe('Cyberpunk 2077')
    expect(result.current.data?.activeSession?.avgFps).toBe(98.2)
    expect(result.current.data?.activeSession?.durationSeconds).toBe(600)
    // 7200 past session + 600 active session = 7800 total
    expect(result.current.data?.totalDurationSeconds).toBe(7800)
  })

  it('subscribes to desktop events and invalidates cache when sessions are updated', async () => {
    const mockGetSessions = vi.fn().mockResolvedValue([
      {
        id: 'sess-1',
        gameId: 'bg3',
        gameTitle: "Baldur's Gate 3",
        startTime: 1727720000000,
        endTime: 1727727200000,
        durationSeconds: 7200,
      },
    ])

    vi.mocked(desktopApi.getDesktopAPI).mockReturnValue({
      getRecentSessions: mockGetSessions,
      onGameStarted: vi.fn((cb) => { callbacks['onGameStarted'] = cb; return () => {} }),
      onGameEnded: vi.fn((cb) => { callbacks['onGameEnded'] = cb; return () => {} }),
      onFpsStats: vi.fn((cb) => { callbacks['onFpsStats'] = cb; return () => {} }),
      onSessionsUpdated: vi.fn((cb) => { callbacks['onSessionsUpdated'] = cb; return () => {} }),
    } as any)

    const { result } = renderHook(() => useUserGameSessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetSessions).toHaveBeenCalledTimes(1)

    // Trigger onSessionsUpdated event
    act(() => {
      callbacks['onSessionsUpdated']?.()
    })

    await waitFor(() => expect(mockGetSessions).toHaveBeenCalledTimes(2))
  })

  it('normalizes node and hardware specs on sessions and active game', async () => {
    vi.mocked(desktopApi.getDesktopAPI).mockReturnValue({
      getRecentSessions: vi.fn().mockResolvedValue([
        {
          id: 'sess-hw',
          gameId: 'cyberpunk',
          gameTitle: 'Cyberpunk 2077',
          startTime: 1727720000000,
          endTime: 1727727200000,
          durationSeconds: 3600,
          node: {
            name: 'Rig-Node',
            installed: true,
            running: true,
          },
          hardware: {
            cpu: 'AMD Ryzen 7 7800X3D',
            gpu: 'NVIDIA GeForce RTX 4080',
          },
        },
      ]),
    } as any)

    vi.mocked(launcherHooks.useRunningGame).mockReturnValue({
      runningGame: {
        game: { id: 'active-game', title: 'Doom Eternal' },
        startTime: Date.now() - 30000,
        node: { name: 'Rig-Node', installed: true },
        hardware: { gpu: 'RTX 4080', cpu: 'Ryzen 7 7800X3D' },
        fpsSnapshot: { currentFps: 144 },
      },
      elapsedMs: 30000,
    } as any)

    const { result } = renderHook(() => useUserGameSessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const session = result.current.data?.sessions[0]
    expect(session?.node?.name).toBe('Rig-Node')
    expect(session?.node?.installed).toBe(true)
    expect(session?.hardware?.gpu).toBe('NVIDIA GeForce RTX 4080')
    expect(session?.hardwareSummary).toContain('RTX 4080')
    expect(session?.shareEligible).toBe(true)

    const active = result.current.data?.activeSession
    expect(active?.node?.name).toBe('Rig-Node')
    expect(active?.hardwareSummary).toContain('RTX 4080')
    expect(active?.shareEligible).toBe(true)
  })
})
