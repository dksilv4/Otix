import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiscoverPlayerActivitySection } from '../discover-player-activity-section'
import * as launcherHooks from '@/features/launcher'
import * as authHooks from '@/features/auth/hooks/use-auth'
import * as plexHooks from '@/features/activity/hooks/use-plex-sessions'
import * as playerHooks from '@/lib/player/hooks/use-player'

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver
})

vi.mock('@/features/launcher', () => ({
  useMatchedRunningGame: vi.fn(),
  useGamingSessionXp: vi.fn().mockReturnValue({ sessionXp: 0, dailyXp: 0, isGaming: false }),
}))

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/features/activity/hooks/use-plex-sessions', () => ({
  usePlexSessions: vi.fn().mockReturnValue({ sessions: [], isLoading: false }),
}))

vi.mock('@/lib/player/hooks/use-player', () => ({
  usePlayer: vi.fn().mockReturnValue({ isPlaying: false, currentTrack: null, source: 'none' }),
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

describe('DiscoverPlayerActivitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: {
        id: 'u1',
        username: 'diogosilva',
        email: 'diogo@otix.tv',
        avatarUrl: null,
      },
    } as unknown as ReturnType<typeof authHooks.useAuth>)

    vi.mocked(plexHooks.usePlexSessions).mockReturnValue({
      sessions: [],
      isLoading: false,
    } as unknown as ReturnType<typeof plexHooks.usePlexSessions>)

    vi.mocked(playerHooks.usePlayer).mockReturnValue({
      isPlaying: false,
      currentTrack: null,
      source: 'none',
    } as unknown as ReturnType<typeof playerHooks.usePlayer>)
  })

  it('renders nothing when no activity is active', () => {
    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: null,
      elapsedMs: 0,
      matchedGame: null,
      isMatching: false,
    })

    const { container } = render(<DiscoverPlayerActivitySection />)
    expect(container.firstChild).toBeNull()
  })

  it('renders active gaming shelf when game is running', () => {
    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: {
        game: {
          id: 'elden-ring',
          title: 'Elden Ring',
          platform: 'pc',
        },
        startTime: Date.now() - 3600000,
        launchedByOtix: false,
        fpsSnapshot: {
          currentFps: 144,
          frameCount: 500000,
          captureDurationMs: 3600000,
          gameId: 'elden-ring',
        },
      },
      elapsedMs: 3600000,
      matchedGame: {
        id: 'elden-ring',
        title: 'Elden Ring',
        posterUrl: 'https://images.otix.tv/posters/elden.jpg',
        backdropUrl: 'https://images.otix.tv/backdrops/elden.jpg',
      },
      isMatching: false,
    })

    vi.mocked(launcherHooks.useGamingSessionXp).mockReturnValue({
      sessionXp: 20,
      dailyXp: 20,
      currentGameId: 'elden-ring',
      currentGameTitle: 'Elden Ring',
      isGaming: true,
    })

    render(<DiscoverPlayerActivitySection />)

    expect(screen.getByText('Live Activity')).toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
    expect(screen.getByText('diogosilva')).toBeInTheDocument()
    expect(screen.getByText('144 FPS')).toBeInTheDocument()
    expect(screen.getByText('+20 XP')).toBeInTheDocument()
  })

  it('renders live activity when user is watching a stream or movie', () => {
    vi.mocked(launcherHooks.useMatchedRunningGame).mockReturnValue({
      runningGame: null,
      elapsedMs: 0,
      matchedGame: null,
      isMatching: false,
    })

    vi.mocked(plexHooks.usePlexSessions).mockReturnValue({
      sessions: [
        {
          sessionId: 'sess-1',
          state: 'playing',
          mediaType: 'movie',
          mediaItemId: 'm123',
          title: 'Interstellar',
          userName: 'diogosilva',
          userThumb: null,
          thumb: 'https://images.otix.tv/thumb.jpg',
          viewOffset: 1200000,
          duration: 7200000,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof plexHooks.usePlexSessions>)

    render(<DiscoverPlayerActivitySection />)

    expect(screen.getByText('Live Activity')).toBeInTheDocument()
    expect(screen.getByText('Interstellar')).toBeInTheDocument()
  })
})
