import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserProfileGameSessions } from '../components/organisms/user-profile-game-sessions'
import { normalizeSession } from '../hooks/use-user-game-sessions'
import * as sessionsHooks from '../hooks/use-user-game-sessions'

vi.mock('../hooks/use-user-game-sessions', async (importOriginal) => {
  const actual = await importOriginal<typeof sessionsHooks>()
  return {
    ...actual,
    useUserGameSessions: vi.fn(),
  }
})

describe('normalizeSession', () => {
  it('normalizes snake_case session data accurately', () => {
    const raw = {
      id: 'sess-1',
      game_id: 'bg3',
      game_title: "Baldur's Gate 3",
      process_name: 'bg3.exe',
      start_time: '2026-09-30T19:00:00Z',
      end_time: '2026-09-30T21:00:00Z',
      duration_seconds: 7200,
      fps_stats: {
        avg_fps: 84.5,
        min_fps: 45.0,
        max_fps: 120.0,
        low_1_percent: 62.0,
        low_01_percent: 50.0,
        total_frames: 608400,
      },
    }

    const norm = normalizeSession(raw)
    expect(norm.id).toBe('sess-1')
    expect(norm.gameTitle).toBe("Baldur's Gate 3")
    expect(norm.processName).toBe('bg3.exe')
    expect(norm.durationSeconds).toBe(7200)
    expect(norm.avgFps).toBe(84.5)
    expect(norm.low1Percent).toBe(62.0)
    expect(norm.totalFrames).toBe(608400)
  })

  it('normalizes camelCase session data from desktop client', () => {
    const raw = {
      id: 'sess-2',
      gameId: 'cp2077',
      gameTitle: 'Cyberpunk 2077',
      startTime: 1727720000000,
      endTime: 1727723600000,
      durationSeconds: 3600,
      fpsStats: {
        avgFps: 95.2,
        onePercentLow: 71.0,
        totalFrames: 342720,
      },
    }

    const norm = normalizeSession(raw)
    expect(norm.id).toBe('sess-2')
    expect(norm.gameTitle).toBe('Cyberpunk 2077')
    expect(norm.durationSeconds).toBe(3600)
    expect(norm.avgFps).toBe(95.2)
    expect(norm.low1Percent).toBe(71.0)
  })
})

describe('UserProfileGameSessions component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no sessions are recorded', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [],
        totalSessions: 0,
        totalDurationSeconds: 0,
        overallAvgFps: null,
        overallAvgLow1: null,
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    expect(screen.getByText('Gaming Performance & Sessions')).toBeInTheDocument()
    expect(screen.getByText('Private to you')).toBeInTheDocument()
    expect(screen.getByText('No gaming sessions recorded yet')).toBeInTheDocument()
  })

  it('renders sessions KPI metrics and session history breakdown', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            processName: 'bg3.exe',
            startTime: Date.now() - 7200000,
            endTime: Date.now(),
            durationSeconds: 7200,
            avgFps: 82.4,
            low1Percent: 61.0,
            low01Percent: 50.0,
            minFps: 42.0,
            maxFps: 110.0,
            totalFrames: 593280,
          },
        ],
        totalSessions: 1,
        totalDurationSeconds: 7200,
        overallAvgFps: 82.4,
        overallAvgLow1: 61.0,
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    expect(screen.getByText('Gaming Performance & Sessions')).toBeInTheDocument()
    expect(screen.getByText('Private to you')).toBeInTheDocument()

    // KPI Metrics
    expect(screen.getByText('2h 0m')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('61 FPS')).toBeInTheDocument()

    // Session list item
    expect(screen.getByText("Baldur's Gate 3")).toBeInTheDocument()
    expect(screen.getByText('(bg3.exe)')).toBeInTheDocument()
    expect(screen.getByText('82 FPS')).toBeInTheDocument()
  })
})
