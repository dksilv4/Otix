import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MediaGameUserStats } from '../media-game-user-stats'
import type { MediaItemDetail } from '@/features/media/queries/media-queries'
import type { UserGameSessionsResponse } from '@/features/user/hooks/use-user-game-sessions'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock useUserGameSessions
const mockUseUserGameSessions = vi.fn()
vi.mock('@/features/user/hooks/use-user-game-sessions', () => ({
  useUserGameSessions: (opts: { enabled?: boolean }) => mockUseUserGameSessions(opts),
}))

const mockDetail: MediaItemDetail = {
  id: '501',
  slug: 'sid-meiers-civilization-vii',
  title: "Sid Meier's Civilization VII",
  mediaType: 'game',
  releaseDate: '2025-02-11',
  posterUrl: 'https://example.com/civ7.jpg',
  game: {
    steamAppId: 2358720,
  },
}

describe('MediaGameUserStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders null when the user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false })
    mockUseUserGameSessions.mockReturnValue({ data: null })

    const { container } = render(<MediaGameUserStats detail={mockDetail} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when authenticated but no sessions match the game', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    mockUseUserGameSessions.mockReturnValue({
      data: {
        activeSession: null,
        sessions: [
          {
            id: 'sess-1',
            gameId: '999999',
            gameTitle: 'Counter-Strike 2',
            durationSeconds: 1200,
            startTime: Date.now() - 3600000,
          },
        ] as UserGameSessionsResponse['sessions'],
        totalPlaytimeSeconds: 1200,
        totalSessionsCount: 1,
        activeGamesCount: 0,
        nodesCount: 1,
      },
    })

    const { container } = render(<MediaGameUserStats detail={mockDetail} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders gameplay metrics and hardware specs when matching completed sessions exist', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    mockUseUserGameSessions.mockReturnValue({
      data: {
        activeSession: null,
        sessions: [
          {
            id: 'sess-civ-1',
            gameId: '2358720',
            gameTitle: 'Civilization VII',
            processName: 'civ7.exe',
            durationSeconds: 7200, // 2 hours
            startTime: Date.now() - 86400000,
            avgFps: 84.5,
            low1Percent: 62.0,
            maxFps: 110,
            node: { id: 'node-1', name: 'Gaming Rig Pro' },
            hardwareSummary: 'Ryzen 7 7800X3D • RTX 4080 Super',
          },
        ],
        totalPlaytimeSeconds: 7200,
        totalSessionsCount: 1,
        activeGamesCount: 0,
        nodesCount: 1,
      },
    })

    render(<MediaGameUserStats detail={mockDetail} />)

    // Should render card
    expect(screen.getByTestId('media-game-user-stats-card')).toBeInTheDocument()
    expect(screen.getByText('Your Gameplay & Benchmarks')).toBeInTheDocument()
    expect(screen.getByText('Captured on Gaming Rig Pro')).toBeInTheDocument()

    // Playtime (2 hours)
    expect(screen.getByText('2h')).toBeInTheDocument()
    expect(screen.getByText('1 recorded session')).toBeInTheDocument()

    // FPS
    expect(screen.getByText('84.5 FPS')).toBeInTheDocument()
    expect(screen.getByText('1% Low: 62 FPS')).toBeInTheDocument()

    // Stability
    expect(screen.getByText('73% Smoothness')).toBeInTheDocument()

    // Hardware
    expect(screen.getByText('Ryzen 7 7800X3D • RTX 4080 Super')).toBeInTheDocument()
  })

  it('renders active session badge and live indicators when game is currently playing', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    mockUseUserGameSessions.mockReturnValue({
      data: {
        activeSession: {
          id: 'sess-active',
          gameId: 'sid-meiers-civilization-vii',
          gameTitle: "Sid Meier's Civilization VII",
          processName: 'civ7.exe',
          durationSeconds: 1800, // 30m
          startTime: Date.now() - 1800000,
          avgFps: 92.4,
          node: { id: 'node-1', name: 'Battlestation' },
          hardwareSummary: 'i9-14900K • RTX 4090',
        },
        sessions: [],
        totalPlaytimeSeconds: 1800,
        totalSessionsCount: 1,
        activeGamesCount: 1,
        nodesCount: 1,
      },
    })

    render(<MediaGameUserStats detail={mockDetail} />)

    expect(screen.getByText('Playing Now')).toBeInTheDocument()
    expect(screen.getByText(/30m elapsed/i)).toBeInTheDocument()
    expect(screen.getByText('92 FPS')).toBeInTheDocument()
    expect(screen.getByText('i9-14900K • RTX 4090')).toBeInTheDocument()
  })

  it('allows expanding and viewing recent session history list', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    mockUseUserGameSessions.mockReturnValue({
      data: {
        activeSession: null,
        sessions: [
          {
            id: 'sess-1',
            gameId: '2358720',
            gameTitle: 'Civ 7',
            durationSeconds: 3600,
            startTime: Date.now() - 1000000,
            avgFps: 75.0,
            node: { id: 'node-1', name: 'Main PC' },
          },
          {
            id: 'sess-2',
            gameId: '2358720',
            gameTitle: 'Civ 7',
            durationSeconds: 1800,
            startTime: Date.now() - 5000000,
            avgFps: 72.0,
            node: { id: 'node-1', name: 'Main PC' },
          },
        ],
        totalPlaytimeSeconds: 5400,
        totalSessionsCount: 2,
        activeGamesCount: 0,
        nodesCount: 1,
      },
    })

    render(<MediaGameUserStats detail={mockDetail} />)

    // Expand button should exist
    const expandBtn = screen.getByRole('button', { name: /recent sessions \(2\)/i })
    expect(expandBtn).toBeInTheDocument()

    // Initially collapsed, individual session FPS items not shown
    expect(screen.queryByText('75 FPS')).not.toBeInTheDocument()
    expect(screen.queryByText('72 FPS')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(expandBtn)

    // Now session list is visible
    expect(screen.getByText('75 FPS')).toBeInTheDocument()
    expect(screen.getByText('72 FPS')).toBeInTheDocument()
  })

  it('matches game by cleaned or normalized title even when ID is different', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    mockUseUserGameSessions.mockReturnValue({
      data: {
        activeSession: null,
        sessions: [
          {
            id: 'sess-custom',
            gameId: 'custom-launcher-id',
            gameTitle: 'Sid Meiers Civilization VII (DirectX 12)',
            durationSeconds: 2400,
            startTime: Date.now() - 2000000,
            avgFps: 60,
          },
        ],
        totalPlaytimeSeconds: 2400,
        totalSessionsCount: 1,
        activeGamesCount: 0,
        nodesCount: 1,
      },
    })

    render(<MediaGameUserStats detail={mockDetail} />)
    expect(screen.getByTestId('media-game-user-stats-card')).toBeInTheDocument()
    expect(screen.getByText('40m')).toBeInTheDocument()
  })
})
