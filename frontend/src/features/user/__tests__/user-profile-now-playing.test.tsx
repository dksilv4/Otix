import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserProfileNowPlaying } from '../components/molecules/user-profile-now-playing'
import * as launcherHooks from '@/features/launcher'

vi.mock('@/features/launcher', () => ({
  useMatchedRunningGame: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, className }: any) => (
    <a href={to} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
}))

describe('UserProfileNowPlaying', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('renders rich Now Playing card with matched Otix metadata and live FPS', () => {
    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: {
          id: 'cp2077',
          title: 'Cyberpunk 2077',
          platform: 'pc',
        },
        startTime: Date.now() - 5400000,
        launchedByOtix: false,
        fpsSnapshot: {
          currentFps: 92.4,
          frameCount: 495000,
          captureDurationMs: 5400000,
          gameId: 'cp2077',
        },
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

    expect(screen.getByText('Currently Playing')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    expect(screen.getByText('CD PROJEKT RED')).toBeInTheDocument()
    expect(screen.getByText('2020')).toBeInTheDocument()
    expect(screen.getByText(/Action · RPG · Open World/)).toBeInTheDocument()
    expect(screen.getByText('9.1')).toBeInTheDocument()
    expect(screen.getByText('92 FPS')).toBeInTheDocument()

    const img = screen.getByRole('img', { name: 'Cyberpunk 2077' })
    expect(img).toHaveAttribute('src', 'https://images.otix.tv/posters/cp2077.jpg')
  })
})
