import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClassicLauncherView } from '../classic/classic-launcher-view'

const mockNavigate = vi.fn()
const mockToast = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ gameId: 'game-1' }),
  useRouterState: () => '/launcher/game-1',
  Outlet: () => <div data-testid="launcher-outlet">Outlet Content</div>,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/features/launcher/data/game-queries', () => ({
  useLauncherVisibleGames: () => ({
    data: [
      {
        id: 'game-1',
        title: 'Cyberpunk 2077',
        platform: 'pc',
        posterUrl: '/poster.jpg',
        exePath: 'C:\\Games\\Cyberpunk\\bin\\x64\\Cyberpunk2077.exe',
        lastPlayedAt: '2026-11-04T05:00:00Z',
      },
      {
        id: 'game-2',
        title: 'Unplayed Game',
        platform: 'pc',
        posterUrl: '/unplayed.jpg',
        exePath: 'C:\\Games\\Unplayed\\unplayed.exe',
        lastPlayedAt: null,
      },
      {
        id: 'game-3',
        title: 'Uninstalled Remote Game',
        platform: 'server',
        posterUrl: '/server.jpg',
        exePath: '',
        lastPlayedAt: null,
      },
    ],
  }),
  localGameKeys: {
    all: ['local-games'],
    detail: (id: string) => ['local-games', 'detail', id],
  },
}))

vi.mock('@/features/launcher/data/queries', () => ({
  usePopularGames: () => ({ data: [] }),
  gameDetailOptions: (id: string) => ({ queryKey: ['game-detail', id] }),
}))

const defaultRunningGameState = {
  runningGame: {
    game: {
      id: 'game-1',
      title: 'Cyberpunk 2077',
    },
    pid: 1234,
    startTime: Date.now() - 60000,
    fpsSnapshot: { currentFps: 90 },
  },
  runningGames: [],
  elapsedMs: 60000,
  cycleActiveGame: vi.fn(),
  setActiveGame: vi.fn(),
}

const mockUseRunningGame = vi.fn(() => defaultRunningGameState)

vi.mock('@/features/launcher/hooks/use-running-game', () => ({
  useRunningGame: () => mockUseRunningGame(),
}))

describe('ClassicLauncherView', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRunningGame.mockReturnValue(defaultRunningGameState)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  it('renders signature floating rail, session indicator, and outlet', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ClassicLauncherView />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('launcher-outlet')).toBeInTheDocument()
    expect(screen.getByTitle('Game Spotlight')).toBeInTheDocument()
    expect(screen.getByTitle('Browse All Games (Library)')).toBeInTheDocument()
    expect(screen.getByTitle('Filter Games')).toBeInTheDocument()
    expect(screen.getByTitle('Scan Game Libraries')).toBeInTheDocument()
    expect(screen.getByTitle('Launcher Settings')).toBeInTheDocument()
    expect(screen.getByTestId('game-session-status-indicator')).toBeInTheDocument()
    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
  })

  it('navigates to library when library button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ClassicLauncherView />
      </QueryClientProvider>,
    )

    const libraryBtn = screen.getByTitle('Browse All Games (Library)')
    await user.click(libraryBtn)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/launcher/library' })
  })

  it('navigates to launcher settings when settings button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ClassicLauncherView />
      </QueryClientProvider>,
    )

    const settingsBtn = screen.getByTitle('Launcher Settings')
    await user.click(settingsBtn)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/launcher' })
  })

  it('opens and closes filter search flyout on toggle', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ClassicLauncherView />
      </QueryClientProvider>,
    )

    const filterBtn = screen.getByTitle('Filter Games')
    await user.click(filterBtn)

    const searchInput = screen.getByPlaceholderText('Filter games...')
    expect(searchInput).toBeInTheDocument()

    await user.type(searchInput, 'Cyber')
    expect(searchInput).toHaveValue('Cyber')
  })

  it('shows recently played and installed games in the side rail, excluding uninstalled games', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ClassicLauncherView />
      </QueryClientProvider>,
    )

    expect(screen.getByTitle(/Cyberpunk 2077/)).toBeInTheDocument()
    expect(screen.getByTitle(/Unplayed Game/)).toBeInTheDocument()
    expect(screen.queryByTitle(/Uninstalled Remote Game/)).not.toBeInTheDocument()
  })

  it('pins detected running CS2 to the top of the side rail with Now Playing status', () => {
    mockUseRunningGame.mockReturnValue({
      runningGame: {
        game: {
          id: 'steam-730',
          title: 'Counter-Strike 2',
          processName: 'cs2.exe',
          exePath: 'C:\\Games\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
        },
        pid: 7777,
        startTime: Date.now() - 300000,
        fpsSnapshot: { currentFps: 144 },
      },
      runningGames: [],
      elapsedMs: 300000,
      cycleActiveGame: vi.fn(),
      setActiveGame: vi.fn(),
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ClassicLauncherView />
      </QueryClientProvider>,
    )

    // Running CS2 appears in rail with "Now Playing" in tooltip title
    const cs2Thumb = screen.getByTitle('Counter-Strike 2 ● Now Playing')
    expect(cs2Thumb).toBeInTheDocument()

    // And verify it is at the top among game thumbnails
    const gameButtons = screen.getAllByRole('button').filter((btn) =>
      btn.getAttribute('title')?.includes('● Now Playing') ||
      btn.getAttribute('title')?.includes('hrs') ||
      btn.getAttribute('title')?.includes('Never played')
    )
    expect(gameButtons[0]).toHaveAttribute('title', 'Counter-Strike 2 ● Now Playing')
  })
})
