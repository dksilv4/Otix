import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserProfileGameSessions } from '../components/organisms/user-profile-game-sessions'
import { normalizeSession } from '../hooks/use-user-game-sessions'
import * as sessionsHooks from '../hooks/use-user-game-sessions'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, unknown>
    className?: string
  }) => (
    <a href={to} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
}))

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

    expect(screen.getByText('Game Sessions')).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
  })

  it('renders minimalistic session list with game title, FPS, and no process name', () => {
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

    expect(screen.getByText('Game Sessions')).toBeInTheDocument()
    expect(screen.getByText('1 session · 2h played · 82 avg FPS')).toBeInTheDocument()

    // Session list item shows game title and FPS
    expect(screen.getByText("Baldur's Gate 3")).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()

    // Process name is NOT shown in the main list
    expect(screen.queryByText('(bg3.exe)')).not.toBeInTheDocument()
    expect(screen.queryByText('bg3.exe')).not.toBeInTheDocument()

    // Technical data is NOT shown in the main list
    expect(screen.queryByText('61 FPS')).not.toBeInTheDocument() // 1% low hidden
    expect(screen.queryByText('593k frames')).not.toBeInTheDocument()
  })

  it('renders active session banner with live FPS and no process name', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            startTime: Date.now() - 7200000,
            endTime: Date.now(),
            durationSeconds: 7200,
            avgFps: 80,
            low1Percent: 60,
          },
        ],
        totalSessions: 1,
        totalDurationSeconds: 8400,
        overallAvgFps: 80,
        overallAvgLow1: 60,
        activeSession: {
          id: 'active-cp2077',
          gameId: 'cp2077',
          gameTitle: 'Cyberpunk 2077',
          processName: 'Cyberpunk2077.exe',
          startTime: Date.now() - 1200000,
          endTime: null,
          durationSeconds: 1200,
          avgFps: 95.4,
          totalFrames: 114000,
        },
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    // Active session card
    expect(screen.getByTestId('user-profile-active-session')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()

    // Process name NOT visible in main view
    expect(screen.queryByText('(Cyberpunk2077.exe)')).not.toBeInTheDocument()

    // Past session still in list
    expect(screen.getByText("Baldur's Gate 3")).toBeInTheDocument()
  })

  it('renders active session even when no prior completed sessions exist', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [],
        totalSessions: 0,
        totalDurationSeconds: 300,
        overallAvgFps: null,
        overallAvgLow1: null,
        activeSession: {
          id: 'active-hades',
          gameId: 'hades',
          gameTitle: 'Hades',
          processName: 'Hades.exe',
          startTime: Date.now() - 300000,
          endTime: null,
          durationSeconds: 300,
          avgFps: 144,
          totalFrames: 43200,
        },
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    expect(screen.getByTestId('user-profile-active-session')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Hades')).toBeInTheDocument()
    expect(screen.getByText('144')).toBeInTheDocument()
    expect(screen.queryByText('No sessions yet')).not.toBeInTheDocument()
  })

  it('opens session detail modal with performance summary when clicking a session row', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            processName: 'bg3.exe',
            startTime: 1727722800000,
            endTime: 1727730000000,
            durationSeconds: 7200,
            avgFps: 82,
            low1Percent: 61,
            low01Percent: 50,
            minFps: 42,
            maxFps: 110,
            totalFrames: 593280,
            hardwareSummary: 'RTX 5080 · Ryzen 7 9800X3D',
            node: { name: 'Main-Rig', installed: true },
            shareEligible: true,
          },
        ],
        totalSessions: 1,
        totalDurationSeconds: 7200,
        overallAvgFps: 82,
        overallAvgLow1: 61,
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    // Click the session row to open modal
    fireEvent.click(screen.getByText("Baldur's Gate 3"))

    // Modal shows performance summary
    expect(screen.getByText('Avg FPS')).toBeInTheDocument()
    expect(screen.getByText('1% Low')).toBeInTheDocument()
    expect(screen.getByText('Time')).toBeInTheDocument()

    // Hardware summary shown in modal
    expect(screen.getByText('RTX 5080 · Ryzen 7 9800X3D')).toBeInTheDocument()

    // Node shown in modal
    expect(screen.getByText('Main-Rig')).toBeInTheDocument()
  })

  it('reveals technical data behind "Analytics for Nerds" toggle in the modal', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            processName: 'bg3.exe',
            startTime: 1727722800000,
            endTime: 1727730000000,
            durationSeconds: 7200,
            avgFps: 82,
            low1Percent: 61,
            low01Percent: 50,
            minFps: 42,
            maxFps: 110,
            totalFrames: 593280,
            loadingSeconds: 45,
            backgroundSeconds: 120,
          },
        ],
        totalSessions: 1,
        totalDurationSeconds: 7200,
        overallAvgFps: 82,
        overallAvgLow1: 61,
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    // Open the session modal
    fireEvent.click(screen.getByText("Baldur's Gate 3"))

    // Nerd stats NOT visible initially
    expect(screen.queryByTestId('nerd-stats-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('bg3.exe')).not.toBeInTheDocument()

    // Click "Analytics for Nerds" toggle
    fireEvent.click(screen.getByTestId('analytics-for-nerds-toggle'))

    // Nerd stats now visible
    expect(screen.getByTestId('nerd-stats-panel')).toBeInTheDocument()
    expect(screen.getByText('bg3.exe')).toBeInTheDocument()
    expect(screen.getByText('42 – 110')).toBeInTheDocument()
    expect(screen.getByText('50 FPS')).toBeInTheDocument() // 0.1% low
    expect(screen.getByText('45s')).toBeInTheDocument() // Loading time
    expect(screen.getByText('120s')).toBeInTheDocument() // Background time
  })

  it('displays poster thumbnail when session has posterUrl', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            startTime: Date.now() - 3600000,
            durationSeconds: 3600,
            avgFps: 80,
            posterUrl: 'https://otix.example/posters/bg3.jpg',
          },
        ],
        totalSessions: 1,
        totalDurationSeconds: 3600,
        overallAvgFps: 80,
        overallAvgLow1: null,
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    const poster = screen.getByAltText("Baldur's Gate 3")
    expect(poster).toBeInTheDocument()
    expect(poster).toHaveAttribute('src', 'https://otix.example/posters/bg3.jpg')
  })

  it('renders multiple active running games concurrently as live cards', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [],
        totalSessions: 0,
        totalDurationSeconds: 7200,
        overallAvgFps: null,
        overallAvgLow1: null,
        activeSessions: [
          {
            id: 'active-game1',
            gameId: 'cp2077',
            gameTitle: 'Cyberpunk 2077',
            startTime: Date.now() - 3600000,
            durationSeconds: 3600,
            avgFps: 95,
          },
          {
            id: 'active-game2',
            gameId: 'eldenring',
            gameTitle: 'Elden Ring',
            startTime: Date.now() - 3600000,
            durationSeconds: 3600,
            avgFps: 120,
          },
        ],
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    const liveBadges = screen.getAllByText('Live')
    expect(liveBadges).toHaveLength(2)
    const activeCards = screen.getAllByTestId('user-profile-active-session')
    expect(activeCards).toHaveLength(2)
    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
  })

  it('features distinct games prominently and groups remaining in past games shelf', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-bg3-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            startTime: 5000,
            durationSeconds: 3600,
            avgFps: 80,
          },
          {
            id: 'sess-bg3-2',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            startTime: 4000,
            durationSeconds: 3600,
            avgFps: 82,
          },
          {
            id: 'sess-cp',
            gameId: 'cp',
            gameTitle: 'Cyberpunk 2077',
            startTime: 3000,
            durationSeconds: 3600,
            avgFps: 90,
          },
          {
            id: 'sess-er',
            gameId: 'er',
            gameTitle: 'Elden Ring',
            startTime: 2000,
            durationSeconds: 3600,
            avgFps: 100,
          },
          {
            id: 'sess-hades',
            gameId: 'hades',
            gameTitle: 'Hades II',
            startTime: 1000,
            durationSeconds: 1800,
            avgFps: 144,
          },
        ],
        totalSessions: 5,
        totalDurationSeconds: 16200,
        overallAvgFps: 95,
        overallAvgLow1: 75,
      },
      isLoading: false,
    } as any)

    render(<UserProfileGameSessions username="dan" />)

    // Top 3 featured slots showcase distinct recent games: BG3, Cyberpunk, Elden Ring
    expect(screen.getByRole('heading', { name: "Baldur's Gate 3" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Elden Ring' })).toBeInTheDocument()

    // Past games shelf is rendered for the remaining game: Hades II
    expect(screen.getByText('Past Games')).toBeInTheDocument()
    expect(screen.getByText('1 game')).toBeInTheDocument()
    expect(screen.getByTestId('user-profile-game-icon-tile')).toBeInTheDocument()
  })
})
