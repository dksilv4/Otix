import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserProfileNowPlaying } from '../components/molecules/user-profile-now-playing'
import * as launcherHooks from '@/features/launcher'

vi.mock('@/features/launcher', () => ({
  useMatchedRunningGame: vi.fn(),
  useGamingSessionXp: vi.fn().mockReturnValue({ sessionXp: 0, dailyXp: 0, isGaming: false }),
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
})
