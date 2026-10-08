import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserProfileNowPlaying } from '../components/molecules/user-profile-now-playing'
import * as launcherHooks from '@/features/launcher'

vi.mock('@/features/launcher', () => ({
  useMatchedRunningGame: vi.fn(),
  useGamingSessionXp: vi.fn().mockReturnValue({ sessionXp: 0, dailyXp: 0, isGaming: false }),
  useCs2GameState: vi.fn().mockReturnValue({ gameState: null, isCs2Active: false }),
  isCs2Game: vi.fn().mockReturnValue(false),
  formatCs2Status: vi.fn((state?: { isInGame?: boolean; mapName?: string; scoreCt?: number; scoreT?: number } | null) =>
    state?.isInGame
      ? `${state.mapName} (CT ${state.scoreCt} : ${state.scoreT} T)`
      : 'In Lobby (Waiting for match)'
  ),
}))

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

describe('UserProfileNowPlaying', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(launcherHooks.useGamingSessionXp).mockReturnValue({
      sessionXp: 0,
      dailyXp: 0,
      currentGameId: null,
      currentGameTitle: null,
      isGaming: false,
    })
  })

  it('renders nothing when no game is running', () => {
    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: null,
      elapsedMs: 0,
      matchedGame: null,
      isMatching: false,
    })

    const { container } = render(<UserProfileNowPlaying />)
    expect(container.firstChild).toBeNull()
  })

  it('renders streamlined status bar with game title, cover, and no misleading LIVE badge or bloated metadata', () => {
    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: {
          id: 'cp2077',
          title: 'Cyberpunk 2077',
          platform: 'pc',
        },
        startTime: Date.now() - 5400000,
        launchedByOtix: false,
      },
      elapsedMs: 5400000,
      matchedGame: {
        id: '1091500',
        title: 'Cyberpunk 2077',
        slug: 'cyberpunk-2077',
        posterUrl: 'https://images.otix.tv/posters/cp2077.jpg',
        releaseDate: '2020-12-10',
        genres: ['Action', 'RPG', 'Open World'],
        developer: 'CD PROJEKT RED',
        rating: 9.1,
      },
      isMatching: false,
    })

    render(<UserProfileNowPlaying />)

    expect(screen.getByText('Playing')).toBeInTheDocument()
    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()

    // Verify misleading LIVE badge and bloated metadata are NOT rendered
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument()
    expect(screen.queryByText('CD PROJEKT RED')).not.toBeInTheDocument()
    expect(screen.queryByText('9.1')).not.toBeInTheDocument()
    expect(screen.queryByText(/Action · RPG · Open World/)).not.toBeInTheDocument()

    // Poster cover image is present
    const img = screen.getByRole('img', { name: 'Cyberpunk 2077' })
    expect(img).toHaveAttribute('src', 'https://images.otix.tv/posters/cp2077.jpg')
  })

  it('renders session XP badge when sessionXp is greater than 0', () => {
    vi.mocked(launcherHooks.useGamingSessionXp).mockReturnValue({
      sessionXp: 20,
      dailyXp: 20,
      currentGameId: 'cp2077',
      currentGameTitle: 'Cyberpunk 2077',
      isGaming: true,
    })

    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: { id: 'cp2077', title: 'Cyberpunk 2077', platform: 'pc' },
        startTime: Date.now() - 600000,
        launchedByOtix: false,
      },
      elapsedMs: 600000,
      matchedGame: {
        id: '1091500',
        title: 'Cyberpunk 2077',
      },
      isMatching: false,
    })

    render(<UserProfileNowPlaying />)
    expect(screen.getByText('+20 XP')).toBeInTheDocument()
  })

  it('renders CS2 live match details when playing CS2 with active GSI state', () => {
    vi.mocked(launcherHooks.isCs2Game).mockReturnValue(true)
    vi.mocked(launcherHooks.useCs2GameState).mockReturnValue({
      gameState: {
        rawMapName: 'de_inferno',
        mapName: 'Inferno',
        activity: 'playing',
        isInGame: true,
        mode: 'competitive',
        phase: 'live',
        round: 8,
        scoreCt: 5,
        scoreT: 3,
        health: 100,
        armor: 100,
        helmet: true,
        team: 'T',
        kills: 8,
        deaths: 3,
        assists: 2,
        mvps: 1,
        roundKills: 0,
        bombState: null,
        timestamp: Date.now(),
      },
      isCs2Active: true,
    })

    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: { id: '730', title: 'Counter-Strike 2', platform: 'steam' },
        startTime: Date.now() - 600000,
        launchedByOtix: false,
      },
      elapsedMs: 600000,
      matchedGame: {
        id: '730',
        title: 'Counter-Strike 2',
      },
      isMatching: false,
    })

    render(<UserProfileNowPlaying />)
    expect(screen.getByText('Inferno (CT 5 : 3 T)')).toBeInTheDocument()
  })

  it('renders CS2 lobby status when in menu or waiting for match', () => {
    vi.mocked(launcherHooks.isCs2Game).mockReturnValue(true)
    vi.mocked(launcherHooks.useCs2GameState).mockReturnValue({
      gameState: {
        rawMapName: '',
        mapName: '',
        mode: '',
        phase: 'menu',
        round: 0,
        scoreCt: 0,
        scoreT: 0,
        health: 0,
        armor: 0,
        helmet: false,
        team: '',
        kills: 0,
        deaths: 0,
        assists: 0,
        mvps: 0,
        roundKills: 0,
        bombState: null,
        activity: 'menu',
        isInGame: false,
        timestamp: Date.now(),
      },
      isCs2Active: true,
    })

    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: { id: '730', title: 'Counter-Strike 2', platform: 'steam' },
        startTime: Date.now() - 300000,
        launchedByOtix: false,
      },
      elapsedMs: 300000,
      matchedGame: {
        id: '730',
        title: 'Counter-Strike 2',
      },
      isMatching: false,
    })

    render(<UserProfileNowPlaying />)
    expect(screen.getByText('In Lobby (Waiting for match)')).toBeInTheDocument()
  })
})
