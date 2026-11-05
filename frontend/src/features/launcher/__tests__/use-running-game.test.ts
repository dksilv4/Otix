import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRunningGame } from '../hooks/use-running-game'
import type { DesktopAPI, RunningGameData } from '@/lib/desktop/api'

describe('useRunningGame with multiple games and isolated FPS', () => {
  let mockDesktopAPI: Partial<DesktopAPI>
  let fpsCallback: ((data: any) => void) | null = null
  let _gameStartedCallback: ((data: any) => void) | null = null
  let _gameEndedCallback: ((data: any) => void) | null = null

  const game1: RunningGameData = {
    game: { id: 'brawlhalla', title: 'Brawlhalla', platform: 'pc' },
    startTime: Date.now() - 60000,
    launchedByOtix: false,
    pid: 16188,
    fpsAvailable: true,
    fpsSnapshot: { currentFps: 240, frameCount: 14400, captureDurationMs: 60000, gameId: 'brawlhalla' },
  }

  const game2: RunningGameData = {
    game: { id: 'bloons-td-6', title: 'Bloons TD 6', platform: 'pc' },
    startTime: Date.now() - 30000,
    launchedByOtix: false,
    pid: 53312,
    fpsAvailable: true,
    fpsSnapshot: null,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    fpsCallback = null
    _gameStartedCallback = null
    _gameEndedCallback = null

    mockDesktopAPI = {
      getRunningGames: vi.fn().mockResolvedValue([game1, game2]),
      getRunningGame: vi.fn().mockResolvedValue(game1),
      onGameStarted: vi.fn().mockImplementation((cb) => {
        _gameStartedCallback = cb
        return () => {}
      }),
      onGameEnded: vi.fn().mockImplementation((cb) => {
        _gameEndedCallback = cb
        return () => {}
      }),
      onFpsUpdate: vi.fn().mockImplementation((cb) => {
        fpsCallback = cb
        return () => {}
      }),
    }

    vi.stubGlobal('desktopAPI', mockDesktopAPI)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('initializes with multiple concurrent running games', async () => {
    const { result } = renderHook(() => useRunningGame())

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.runningGames).toHaveLength(2)
    expect(result.current.runningGames[0].game.id).toBe('brawlhalla')
    expect(result.current.runningGames[1].game.id).toBe('bloons-td-6')
    expect(result.current.runningGames[0].fpsSnapshot?.currentFps).toBe(240)
    expect(result.current.runningGames[1].fpsSnapshot).toBeNull()
  })

  it('updates only the matching game when FPS update arrives with gameId', async () => {
    const { result } = renderHook(() => useRunningGame())

    await act(async () => {
      await Promise.resolve()
    })

    expect(fpsCallback).not.toBeNull()

    // Bloons TD 6 receives an FPS snapshot
    act(() => {
      fpsCallback?.({
        currentFps: 60,
        frameCount: 1800,
        captureDurationMs: 30000,
        gameId: 'bloons-td-6',
        pid: 53312,
      })
    })

    // Bloons TD 6 has 60 FPS
    expect(result.current.runningGames[1].fpsSnapshot?.currentFps).toBe(60)
    // Brawlhalla remains unchanged at 240 FPS (no FPS leakage or crossover)
    expect(result.current.runningGames[0].fpsSnapshot?.currentFps).toBe(240)
  })

  it('ignores untagged FPS updates without gameId and does not overwrite game 0', async () => {
    const { result } = renderHook(() => useRunningGame())

    await act(async () => {
      await Promise.resolve()
    })

    // Untagged or corrupted snapshot without gameId
    act(() => {
      fpsCallback?.({
        currentFps: 12,
        frameCount: 200,
        captureDurationMs: 10000,
        gameId: '',
      })
    })

    // Brawlhalla must NOT be overwritten by the untagged snapshot
    expect(result.current.runningGames[0].fpsSnapshot?.currentFps).toBe(240)
    expect(result.current.runningGames[1].fpsSnapshot).toBeNull()
  })

  it('preserves existing live FPS snapshot during polling ticks when poller has no new snapshot', async () => {
    const { result } = renderHook(() => useRunningGame())

    await act(async () => {
      await Promise.resolve()
    })

    // Provide live FPS to game 2
    act(() => {
      fpsCallback?.({
        currentFps: 59.9,
        frameCount: 2000,
        captureDurationMs: 32000,
        gameId: 'bloons-td-6',
      })
    })
    expect(result.current.runningGames[1].fpsSnapshot?.currentFps).toBe(59.9)

    // Poller runs after 2 seconds returning games where game2 has fpsSnapshot: null
    await act(async () => {
      vi.advanceTimersByTime(2100)
      await Promise.resolve()
    })

    // Game 2's live snapshot should be preserved
    expect(result.current.runningGames[1].fpsSnapshot?.currentFps).toBe(59.9)
  })
})
