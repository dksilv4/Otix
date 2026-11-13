import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DownloadGameButton } from '../media-download-game-button'
import * as downloadHooks from '@/features/media/game/hooks/use-download-game'
import * as runningHooks from '@/features/launcher/hooks/use-running-game'
import * as cs2Hooks from '@/features/launcher/hooks/use-cs2-game-state'
import * as toastHooks from '@ui/molecules/toast'

vi.mock('@/features/media/game/hooks/use-download-game')
vi.mock('@/features/launcher/hooks/use-running-game')
vi.mock('@/features/launcher/hooks/use-cs2-game-state')
vi.mock('@ui/molecules/toast')
vi.mock('@/lib/modals', () => ({
  useModal: () => ({ openModal: vi.fn() }),
}))
vi.mock('@/features/media/game/hooks/use-game-editions', () => ({
  useGameEditions: () => ({ selectedEdition: null, hasEditions: false }),
}))

describe('DownloadGameButton (Media Detail)', () => {
  const mockToast = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(toastHooks.useToast).mockReturnValue({
      toast: mockToast,
      dismiss: vi.fn(),
      toasts: [],
    })
    vi.mocked(cs2Hooks.useCs2GameState).mockReturnValue({
      gameState: null,
      isCs2Active: false,
    })
  })

  it('renders Play button and "Launch via Steam" when installed and not running', () => {
    vi.mocked(downloadHooks.useDownloadGame).mockReturnValue({
      hidden: false,
      isInstalled: true,
      matchingScannedGame: {
        id: 'steam_730',
        title: 'Counter-Strike 2',
        platform: 'steam',
        exePath: 'steam://rungameid/730',
      },
      mediaTitle: 'Counter-Strike 2',
      mediaId: '3084',
      serverFile: null,
      handlePlay: vi.fn(),
    } as any)

    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: null,
      runningGames: [],
      elapsedMs: 0,
      cycleActiveGame: vi.fn(),
      setActiveGame: vi.fn(),
    })

    render(<DownloadGameButton />)

    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
    expect(screen.getByText('Launch via Steam')).toBeInTheDocument()
    expect(screen.queryByText(/playing/i)).not.toBeInTheDocument()
  })

  it('renders "Playing" button and "Playing via Steam" when CS2 is actively running', () => {
    const runningCs2 = {
      game: {
        id: 'steam_730',
        title: 'Counter-Strike 2',
        platform: 'steam',
        exePath: 'C:\\Games\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
        processName: 'cs2.exe',
        otixMediaId: '3084',
      },
      startTime: Date.now() - 125000,
      launchedByOtix: false,
      pid: 42200,
    }

    vi.mocked(downloadHooks.useDownloadGame).mockReturnValue({
      hidden: false,
      isInstalled: true,
      matchingScannedGame: {
        id: 'steam_730',
        title: 'Counter-Strike 2',
        platform: 'steam',
        exePath: 'steam://rungameid/730',
      },
      mediaTitle: 'Counter-Strike 2',
      mediaId: '3084',
      serverFile: null,
      handlePlay: vi.fn(),
    } as any)

    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: runningCs2,
      runningGames: [runningCs2],
      elapsedMs: 125000,
      cycleActiveGame: vi.fn(),
      setActiveGame: vi.fn(),
    })

    render(<DownloadGameButton />)

    const playingButton = screen.getByRole('button', { name: /playing/i })
    expect(playingButton).toBeInTheDocument()
    expect(screen.getByText('Playing via Steam')).toBeInTheDocument()
    expect(screen.queryByText('Launch via Steam')).not.toBeInTheDocument()

    // Clicking Playing triggers toast notifying user game is running
    fireEvent.click(playingButton)
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Game Active',
        description: expect.stringContaining('Counter-Strike 2 is already running'),
      }),
    )
  })

  it('displays CS2 match status in subtitle when telemetry state is available', () => {
    const runningCs2 = {
      game: {
        id: 'steam_730',
        title: 'Counter-Strike 2',
        platform: 'steam',
      },
      startTime: Date.now() - 60000,
      launchedByOtix: false,
      pid: 42200,
    }

    vi.mocked(downloadHooks.useDownloadGame).mockReturnValue({
      hidden: false,
      isInstalled: true,
      matchingScannedGame: {
        id: 'steam_730',
        title: 'Counter-Strike 2',
        platform: 'steam',
      },
      mediaTitle: 'Counter-Strike 2',
      mediaId: '3084',
      serverFile: null,
    } as any)

    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: runningCs2,
      runningGames: [runningCs2],
      elapsedMs: 60000,
      cycleActiveGame: vi.fn(),
      setActiveGame: vi.fn(),
    })

    vi.mocked(cs2Hooks.useCs2GameState).mockReturnValue({
      gameState: {
        isInGame: true,
        activity: 'playing',
        mapName: 'Mirage',
        scoreCt: 11,
        scoreT: 9,
      } as any,
      isCs2Active: true,
    })

    render(<DownloadGameButton />)

    expect(screen.getByText('Playing via Steam · Mirage (CT 11 : 9 T)')).toBeInTheDocument()
  })
})
