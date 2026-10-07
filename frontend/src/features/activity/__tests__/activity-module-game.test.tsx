import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityModuleGame } from '../components/molecules/activity-module-game'
import * as launcherHooks from '@/features/launcher'

vi.mock('@/features/launcher', () => ({
  useMatchedRunningGame: vi.fn(),
  useGamingSessionXp: vi.fn().mockReturnValue({ sessionXp: 0, dailyXp: 0, isGaming: false }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, className }: any) => (
    <a href={to} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
}))

describe('ActivityModuleGame', () => {
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

    const { container } = render(<ActivityModuleGame />)
    expect(container.firstChild).toBeNull()
  })

  it('renders rich game info when running game is matched with Otix catalog', () => {
    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: {
          id: 'bg3',
          title: 'bg3.exe',
          platform: 'pc',
        },
        startTime: Date.now() - 3600000,
        launchedByOtix: false,
        fpsSnapshot: {
          currentFps: 84.2,
          frameCount: 300000,
          captureDurationMs: 3600000,
          gameId: 'bg3',
        },
      },
      elapsedMs: 3600000,
      matchedGame: {
        id: '1086940',
        title: "Baldur's Gate 3",
        slug: 'baldurs-gate-3',
        posterUrl: 'https://images.otix.tv/posters/bg3.jpg',
        releaseDate: '2023-08-03',
        genres: ['RPG', 'Adventure'],
        developer: 'Larian Studios',
        rating: 9.6,
      },
      isMatching: false,
    })

    render(<ActivityModuleGame />)

    expect(screen.getByText('Now Playing')).toBeInTheDocument()
    expect(screen.getByText("Baldur's Gate 3")).toBeInTheDocument()
    expect(screen.getByText(/RPG · Adventure/)).toBeInTheDocument()
    expect(screen.queryByText(/Larian Studios/)).not.toBeInTheDocument()
    expect(screen.getByText(/84 FPS/)).toBeInTheDocument()
    expect(screen.getByText('9.6')).toBeInTheDocument()

    const img = screen.getByRole('img', { name: "Baldur's Gate 3" })
    expect(img).toHaveAttribute('src', 'https://images.otix.tv/posters/bg3.jpg')
  })

  it('renders session XP badge when sessionXp is greater than 0', () => {
    vi.mocked(launcherHooks.useGamingSessionXp).mockReturnValue({
      sessionXp: 30,
      dailyXp: 30,
      currentGameId: 'bg3',
      currentGameTitle: "Baldur's Gate 3",
      isGaming: true,
    })

    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: { id: 'bg3', title: 'bg3.exe', platform: 'pc' },
        startTime: Date.now() - 900000,
        launchedByOtix: false,
      },
      elapsedMs: 900000,
      matchedGame: {
        id: '1086940',
        title: "Baldur's Gate 3",
      },
      isMatching: false,
    })

    render(<ActivityModuleGame />)
    expect(screen.getByText('+30 XP')).toBeInTheDocument()
  })
})
