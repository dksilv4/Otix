import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserGameActivityPage } from '../pages/user-game-activity-page'
import * as sessionsHooks from '../hooks/use-user-game-sessions'

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ username: 'dan' }),
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

vi.mock('../hooks/use-user-game-sessions', () => ({
  useUserGameSessions: vi.fn(),
}))

describe('UserGameActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page header, empty state when no sessions exist', () => {
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

    render(<UserGameActivityPage />)

    expect(screen.getByText('Game Activity & Telemetry')).toBeInTheDocument()
    expect(screen.getByText("Back to dan's profile")).toBeInTheDocument()
    expect(screen.getByText('No gaming sessions recorded yet')).toBeInTheDocument()
    expect(screen.getByText('Total Playtime')).toBeInTheDocument()
  })

  it('renders overall analytics cards and session history list', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            startTime: Date.now() - 7200000,
            durationSeconds: 7200,
            avgFps: 90,
            low1Percent: 70,
            hardwareSummary: 'RTX 4090 · i9-13900K',
            node: { name: 'Main PC' },
          },
          {
            id: 'sess-2',
            gameId: 'cp2077',
            gameTitle: 'Cyberpunk 2077',
            startTime: Date.now() - 3600000,
            durationSeconds: 3600,
            avgFps: 80,
            low1Percent: 60,
            hardwareSummary: 'RTX 4090 · i9-13900K',
            node: { name: 'Main PC' },
          },
        ],
        totalSessions: 2,
        totalDurationSeconds: 10800,
        overallAvgFps: 85,
        overallAvgLow1: 65,
      },
      isLoading: false,
    } as any)

    render(<UserGameActivityPage />)

    // Stats cards & sessions
    expect(screen.getAllByText("Baldur's Gate 3").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('85 FPS')).toBeInTheDocument() // Overall average FPS
    expect(screen.getByText('RTX 4090 · i9-13900K')).toBeInTheDocument() // Top hardware

    // Sessions listed
    expect(screen.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeInTheDocument()
  })

  it('renders active live session spotlight when a game is running', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [],
        totalSessions: 0,
        totalDurationSeconds: 0,
        overallAvgFps: null,
        overallAvgLow1: null,
        activeSession: {
          id: 'active-eldenring',
          gameId: 'eldenring',
          gameTitle: 'Elden Ring',
          startTime: Date.now() - 600000,
          durationSeconds: 600,
          avgFps: 120,
          hardwareSummary: 'RTX 4090',
        },
      },
      isLoading: false,
    } as any)

    render(<UserGameActivityPage />)

    expect(screen.getByTestId('activity-page-active-banner')).toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
    expect(screen.getByText('Live Now')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
  })

  it('renders multiple active live sessions when multiple games are running', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [],
        totalSessions: 0,
        totalDurationSeconds: 0,
        overallAvgFps: null,
        overallAvgLow1: null,
        activeSessions: [
          {
            id: 'active-game1',
            gameId: 'g1',
            gameTitle: 'Cyberpunk 2077',
            startTime: Date.now() - 3600000,
            durationSeconds: 3600,
            avgFps: 95,
          },
          {
            id: 'active-game2',
            gameId: 'g2',
            gameTitle: 'Elden Ring',
            startTime: Date.now() - 1800000,
            durationSeconds: 1800,
            avgFps: 120,
          },
        ],
      },
      isLoading: false,
    } as any)

    render(<UserGameActivityPage />)

    const banners = screen.getAllByTestId('activity-page-active-banner')
    expect(banners).toHaveLength(2)
    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
  })

  it('filters sessions using the search input', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            startTime: Date.now() - 7200000,
            durationSeconds: 7200,
            avgFps: 90,
          },
          {
            id: 'sess-2',
            gameId: 'cp2077',
            gameTitle: 'Cyberpunk 2077',
            startTime: Date.now() - 3600000,
            durationSeconds: 3600,
            avgFps: 80,
          },
        ],
        totalSessions: 2,
        totalDurationSeconds: 10800,
        overallAvgFps: 85,
      },
      isLoading: false,
    } as any)

    render(<UserGameActivityPage />)

    const searchInput = screen.getByPlaceholderText('Search games...')
    fireEvent.change(searchInput, { target: { value: 'Cyberpunk' } })

    expect(screen.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeInTheDocument()
    // Session list card heading for Baldur's Gate 3 is filtered out
    expect(screen.queryByRole('heading', { name: "Baldur's Gate 3" })).not.toBeInTheDocument()
  })

  it('filters sessions using the game filter dropdown', () => {
    vi.mocked(sessionsHooks.useUserGameSessions).mockReturnValue({
      data: {
        sessions: [
          {
            id: 'sess-1',
            gameId: 'bg3',
            gameTitle: "Baldur's Gate 3",
            startTime: Date.now() - 7200000,
            durationSeconds: 7200,
            avgFps: 90,
          },
          {
            id: 'sess-2',
            gameId: 'cp2077',
            gameTitle: 'Cyberpunk 2077',
            startTime: Date.now() - 3600000,
            durationSeconds: 3600,
            avgFps: 80,
          },
        ],
        totalSessions: 2,
        totalDurationSeconds: 10800,
        overallAvgFps: 85,
      },
      isLoading: false,
    } as any)

    render(<UserGameActivityPage />)

    const gameFilterSelect = screen.getByLabelText('Filter by Game')
    fireEvent.change(gameFilterSelect, { target: { value: 'Cyberpunk 2077' } })

    expect(screen.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "Baldur's Gate 3" })).not.toBeInTheDocument()
  })
})
