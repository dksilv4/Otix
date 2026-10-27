import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GameSessionStatusIndicator } from '../components/atoms/game-session-status-indicator'
import { PlayGameButton } from '../components/atoms/launcher-play-game-button'
import { formatElapsed } from '../utils'
import * as runningHooks from '../hooks/use-running-game'
import * as desktopApiModule from '@/lib/desktop/api'
import type { RunningGameData } from '@/lib/desktop/api'
import type { LocalGame } from '../types'

// Mock hoisted utilities
const { mockToast, mockLaunchGame } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockLaunchGame: vi.fn().mockResolvedValue(true),
}))

vi.mock('../hooks/use-running-game', () => ({
  useRunningGame: vi.fn(),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/lib/desktop/api', async (importOriginal) => {
  const actual = await importOriginal<typeof desktopApiModule>()
  return {
    ...actual,
    getDesktopAPI: vi.fn(() => ({
      launchGame: mockLaunchGame,
    })),
  }
})

describe('Adversarial Test Suite: M4 Game Session Status Indicator & Button', () => {
  const gameA: LocalGame = {
    id: 'game-aaa',
    title: 'Cyberpunk 2077',
    platform: 'pc',
    exePath: 'D:/Games/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
    installDir: 'D:/Games/Cyberpunk 2077',
  }

  const gameB: LocalGame = {
    id: 'game-bbb',
    title: 'Elden Ring',
    platform: 'pc',
    exePath: 'D:/Games/Elden Ring/eldenring.exe',
    installDir: 'D:/Games/Elden Ring',
  }

  const runningGameA: RunningGameData = {
    game: {
      id: 'game-aaa',
      title: 'Cyberpunk 2077',
      platform: 'pc',
      exePath: 'D:/Games/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
    },
    startTime: Date.now() - 7200000, // 2 hours ago (7,200,000 ms)
    launchedByOtix: true,
    pid: 1111,
    fpsAvailable: true,
    fpsSnapshot: {
      currentFps: 60,
      frameCount: 12000,
      captureDurationMs: 1000,
      gameId: 'game-aaa',
    },
  }

  const runningGameB: RunningGameData = {
    game: {
      id: 'game-bbb',
      title: 'Elden Ring',
      platform: 'pc',
      exePath: 'D:/Games/Elden Ring/eldenring.exe',
    },
    startTime: Date.now() - 45000, // 45 seconds ago (45,000 ms)
    launchedByOtix: true,
    pid: 2222,
    fpsAvailable: true,
    fpsSnapshot: {
      currentFps: 120,
      frameCount: 5400,
      captureDurationMs: 1000,
      gameId: 'game-bbb',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: null,
      runningGames: [],
      elapsedMs: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // SECTION 1: Adversarial Design Token Check
  // =========================================================================
  describe('1. Adversarial Design Token Check', () => {
    it('ensures GameSessionStatusIndicator (all variants) contains zero hardcoded palette classes', () => {
      const variants: ('pill' | 'card' | 'inline')[] = ['pill', 'card', 'inline']

      variants.forEach((variant) => {
        const { container } = render(
          <GameSessionStatusIndicator
            variant={variant}
            runningGame={runningGameA}
            elapsedMs={120000}
          />,
        )
        const html = container.innerHTML

        // Forbidden color classes
        expect(html).not.toMatch(/bg-(emerald|cyan|green)-\d+/)
        expect(html).not.toMatch(/text-(emerald|cyan|green)-\d+/)
        expect(html).not.toMatch(/border-(emerald|cyan|green)-\d+/)
        expect(html).not.toMatch(/shadow-(emerald|cyan|green)-\d+/)

        // Forbidden animations / pinging bubbles
        expect(html).not.toContain('animate-ping')

        // Forbidden heavy borders
        expect(html).not.toMatch(/\bborder-border\b/)
        expect(html).not.toMatch(/\bborder-solid\b/)
      })
    })

    it('ensures PlayGameButton (idle and active) contains zero hardcoded palette classes and no animate-ping', () => {
      // Idle state
      const { container: idleContainer } = render(<PlayGameButton game={gameA} />)
      const idleHtml = idleContainer.innerHTML

      expect(idleHtml).not.toMatch(/bg-(emerald|cyan|green)-\d+/)
      expect(idleHtml).not.toMatch(/text-(emerald|cyan|green)-\d+/)
      expect(idleHtml).not.toContain('animate-ping')

      // Active state
      vi.mocked(runningHooks.useRunningGame).mockReturnValue({
        runningGame: runningGameA,
        runningGames: [runningGameA],
        elapsedMs: 120000,
      })

      const { container: activeContainer } = render(<PlayGameButton game={gameA} />)
      const activeHtml = activeContainer.innerHTML

      expect(activeHtml).not.toMatch(/bg-(emerald|cyan|green)-\d+/)
      expect(activeHtml).not.toMatch(/text-(emerald|cyan|green)-\d+/)
      expect(activeHtml).not.toMatch(/border-(emerald|cyan|green)-\d+/)
      expect(activeHtml).not.toContain('animate-ping')

      // Verify micro-border compliance on active button
      expect(activeHtml).toContain('border-white/[0.05]')
    })
  })

  // =========================================================================
  // SECTION 2: Concurrency & Rapid State Transition Stress
  // =========================================================================
  describe('2. Concurrency Stress: Rapid State Transitions', () => {
    it('handles rapid sequential state flips between idle, starting, running, and stopped (100 cycles)', async () => {
      let currentRunningGames: RunningGameData[] = []
      let currentElapsedMs = 0

      vi.mocked(runningHooks.useRunningGame).mockImplementation(() => ({
        runningGame: currentRunningGames[0] ?? null,
        runningGames: currentRunningGames,
        elapsedMs: currentElapsedMs,
      }))

      const { rerender } = render(<PlayGameButton game={gameA} />)

      // Initial state: Idle
      expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()

      // Rapidly flip states 100 times in succession
      for (let i = 0; i < 100; i++) {
        // Transition to Running
        currentRunningGames = [runningGameA]
        currentElapsedMs = i * 1000
        rerender(<PlayGameButton game={gameA} />)
        expect(screen.getByRole('button', { name: /playing/i })).toBeInTheDocument()

        // Transition to Stopped
        currentRunningGames = []
        currentElapsedMs = 0
        rerender(<PlayGameButton game={gameA} />)
        expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
      }
    })

    it('stress tests rapid clicking on PlayGameButton during transition to active', async () => {
      const { rerender } = render(<PlayGameButton game={gameA} />)
      const button = screen.getByRole('button', { name: /play/i })

      // Rapid 10 clicks
      for (let i = 0; i < 10; i++) {
        fireEvent.click(button)
      }

      expect(mockLaunchGame).toHaveBeenCalledTimes(10)
      expect(mockToast).toHaveBeenCalledTimes(10)

      // Transition to active
      vi.mocked(runningHooks.useRunningGame).mockReturnValue({
        runningGame: runningGameA,
        runningGames: [runningGameA],
        elapsedMs: 5000,
      })

      rerender(<PlayGameButton game={gameA} />)

      const activeBtn = screen.getByRole('button', { name: /playing/i })
      expect(activeBtn).toBeInTheDocument()

      // Click while active: should notify toast but NOT invoke launchGame again
      fireEvent.click(activeBtn)
      expect(mockLaunchGame).toHaveBeenCalledTimes(10) // Remains 10
      expect(mockToast).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: 'Game Active',
        }),
      )
    })
  })

  // =========================================================================
  // SECTION 3: Multiple Concurrent Running Games
  // =========================================================================
  describe('3. Multiple Concurrent Running Games', () => {
    it('properly identifies when a non-first game is running among 5 concurrent games', () => {
      const gameList: RunningGameData[] = [
        runningGameA,
        {
          game: { id: 'g-2', title: 'Game 2', platform: 'pc' },
          startTime: Date.now() - 10000,
          launchedByOtix: true,
        },
        {
          game: { id: 'g-3', title: 'Game 3', platform: 'pc' },
          startTime: Date.now() - 20000,
          launchedByOtix: true,
        },
        runningGameB, // At index 3
        {
          game: { id: 'g-5', title: 'Game 5', platform: 'pc' },
          startTime: Date.now() - 30000,
          launchedByOtix: true,
        },
      ]

      vi.mocked(runningHooks.useRunningGame).mockReturnValue({
        runningGame: runningGameA,
        runningGames: gameList,
        elapsedMs: 7200000,
      })

      render(<PlayGameButton game={gameB} />)

      // Even at index 3 in runningGames, Game B must be recognized as active
      expect(screen.getByRole('button', { name: /playing/i })).toBeInTheDocument()
    })

    it('documents elapsed time behavior when a secondary concurrent game is running', () => {
      // Game A started 2 hours ago (7,200,000 ms)
      // Game B started 45 seconds ago (45,000 ms)
      vi.mocked(runningHooks.useRunningGame).mockReturnValue({
        runningGame: runningGameA,
        runningGames: [runningGameA, runningGameB],
        elapsedMs: 7200000, // Hook tracks first game's elapsed time
      })

      render(<PlayGameButton game={gameB} />)

      const btn = screen.getByRole('button', { name: /playing/i })
      // PlayGameButton currently consumes elapsedMs from hook, showing "2:00:00"
      expect(btn.textContent).toContain('2:00:00')
    })

    it('renders GameSessionStatusIndicator explicitly configured for secondary running game', () => {
      render(
        <GameSessionStatusIndicator
          runningGame={runningGameB}
          elapsedMs={45000}
          variant="card"
        />,
      )

      expect(screen.getByText('Elden Ring')).toBeInTheDocument()
      expect(screen.getByText('00:45')).toBeInTheDocument()
      expect(screen.getByText('120 FPS')).toBeInTheDocument()
    })
  })

  // =========================================================================
  // SECTION 4: Missing Metadata & Boundary Edge Cases
  // =========================================================================
  describe('4. Missing Game Titles, Metadata & Boundary Edge Cases', () => {
    it('handles game with empty or undefined title without crashing GameSessionStatusIndicator', () => {
      const namelessGame: RunningGameData = {
        game: {
          id: 'nameless-1',
          title: '',
          platform: 'pc',
        },
        startTime: Date.now() - 30000,
        launchedByOtix: false,
      }

      const { container } = render(
        <GameSessionStatusIndicator runningGame={namelessGame} elapsedMs={30000} />,
      )

      expect(container.firstChild).toBeInTheDocument()
      expect(screen.getByText('00:30')).toBeInTheDocument()
    })

    it('handles null / undefined / negative / large elapsed times in formatElapsed', () => {
      expect(formatElapsed(0)).toBe('00:00')
      expect(formatElapsed(1000)).toBe('00:01')
      expect(formatElapsed(59000)).toBe('00:59')
      expect(formatElapsed(60000)).toBe('01:00')
      expect(formatElapsed(3600000)).toBe('1:00:00')
      expect(formatElapsed(100 * 3600 * 1000)).toBe('100:00:00')

      // Edge case: negative elapsed time
      const negResult = formatElapsed(-500)
      expect(typeof negResult).toBe('string')
    })

    it('matches running game when id differs but executable path matches', () => {
      const matchByExe: LocalGame = {
        id: 'different-local-id',
        title: 'Different Title',
        platform: 'pc',
        exePath: 'D:/Games/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe', // exact path match
      }

      vi.mocked(runningHooks.useRunningGame).mockReturnValue({
        runningGame: runningGameA,
        runningGames: [runningGameA],
        elapsedMs: 60000,
      })

      render(<PlayGameButton game={matchByExe} />)
      expect(screen.getByRole('button', { name: /playing/i })).toBeInTheDocument()
    })

    it('matches running game when id differs but title matches case-insensitively', () => {
      const matchByTitle: LocalGame = {
        id: 'another-id',
        title: 'cyberpunk 2077', // lowercase match
        platform: 'pc',
      }

      vi.mocked(runningHooks.useRunningGame).mockReturnValue({
        runningGame: runningGameA,
        runningGames: [runningGameA],
        elapsedMs: 60000,
      })

      render(<PlayGameButton game={matchByTitle} />)
      expect(screen.getByRole('button', { name: /playing/i })).toBeInTheDocument()
    })

    it('handles GameSessionStatusIndicator with missing fpsSnapshot cleanly', () => {
      const noFpsGame: RunningGameData = {
        game: {
          id: 'no-fps',
          title: 'Retro Game',
          platform: 'ps1',
        },
        startTime: Date.now(),
        launchedByOtix: true,
        fpsSnapshot: null,
      }

      render(<GameSessionStatusIndicator runningGame={noFpsGame} elapsedMs={10000} />)
      expect(screen.getByText('Retro Game')).toBeInTheDocument()
      expect(screen.queryByText(/FPS/)).not.toBeInTheDocument()
    })
  })
})
