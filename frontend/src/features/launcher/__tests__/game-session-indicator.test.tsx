import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameSessionStatusIndicator } from '../components/atoms/game-session-status-indicator'
import { PlayGameButton } from '../components/atoms/launcher-play-game-button'
import * as runningHooks from '../hooks/use-running-game'
import type { RunningGameData } from '@/lib/desktop/api'
import type { LocalGame } from '../types'

vi.mock('../hooks/use-running-game', () => ({
  useRunningGame: vi.fn(),
}))

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const sampleGame: LocalGame = {
  id: 'game-101',
  title: 'Hades II',
  platform: 'pc',
  exePath: 'C:/Games/HadesII/Hades2.exe',
  installDir: 'C:/Games/HadesII',
}

const sampleRunningGame: RunningGameData = {
  game: {
    id: 'game-101',
    title: 'Hades II',
    platform: 'pc',
    exePath: 'C:/Games/HadesII/Hades2.exe',
  },
  startTime: Date.now() - 125000, // 2m 5s ago
  launchedByOtix: true,
  pid: 12345,
  fpsAvailable: true,
  fpsSnapshot: {
    currentFps: 144,
    frameCount: 1000,
    captureDurationMs: 1000,
    gameId: 'game-101',
  },
}

describe('GameSessionStatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: null,
      runningGames: [],
      elapsedMs: 0,
    })
  })

  it('renders null when no game is running', () => {
    const { container } = render(
      <GameSessionStatusIndicator runningGame={null} elapsedMs={0} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders pill variant by default with title and elapsed duration', () => {
    render(
      <GameSessionStatusIndicator
        runningGame={sampleRunningGame}
        elapsedMs={125000} // 2:05
      />,
    )

    const indicator = screen.getByTestId('game-session-status-indicator')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveAttribute('data-variant', 'pill')
    expect(screen.getByText('Hades II')).toBeInTheDocument()
    expect(screen.getByText('02:05')).toBeInTheDocument()
    expect(screen.getByText('144 FPS')).toBeInTheDocument()
  })

  it('renders card variant with "Playing" label and card layout', () => {
    render(
      <GameSessionStatusIndicator
        runningGame={sampleRunningGame}
        elapsedMs={3665000} // 1:01:05
        variant="card"
      />,
    )

    const indicator = screen.getByTestId('game-session-status-indicator')
    expect(indicator).toHaveAttribute('data-variant', 'card')
    expect(screen.getByText('Playing')).toBeInTheDocument()
    expect(screen.getByText('Hades II')).toBeInTheDocument()
    expect(screen.getByText('1:01:05')).toBeInTheDocument()
    expect(screen.getByText('144 FPS')).toBeInTheDocument()
  })

  it('renders inline variant with title and duration', () => {
    render(
      <GameSessionStatusIndicator
        runningGame={sampleRunningGame}
        elapsedMs={45000} // 00:45
        variant="inline"
      />,
    )

    const indicator = screen.getByTestId('game-session-status-indicator')
    expect(indicator).toHaveAttribute('data-variant', 'inline')
    expect(screen.getByText('Hades II')).toBeInTheDocument()
    expect(screen.getByText('00:45')).toBeInTheDocument()
  })

  it('hides FPS indicator when showFps is false', () => {
    render(
      <GameSessionStatusIndicator
        runningGame={sampleRunningGame}
        elapsedMs={125000}
        showFps={false}
      />,
    )

    expect(screen.queryByText('144 FPS')).not.toBeInTheDocument()
    expect(screen.getByText('Hades II')).toBeInTheDocument()
  })

  it('falls back to useRunningGame hook when props are omitted', () => {
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: sampleRunningGame,
      runningGames: [sampleRunningGame],
      elapsedMs: 60000, // 01:00
    })

    render(<GameSessionStatusIndicator />)

    expect(screen.getByTestId('game-session-status-indicator')).toBeInTheDocument()
    expect(screen.getByText('Hades II')).toBeInTheDocument()
    expect(screen.getByText('01:00')).toBeInTheDocument()
  })

  it('strictly adheres to Otix design rules (no hardcoded palette colors, no pinging dots)', () => {
    const { container: pillContainer } = render(
      <GameSessionStatusIndicator
        runningGame={sampleRunningGame}
        elapsedMs={120000}
        variant="pill"
      />,
    )
    const pillHtml = pillContainer.innerHTML

    const { container: cardContainer } = render(
      <GameSessionStatusIndicator
        runningGame={sampleRunningGame}
        elapsedMs={120000}
        variant="card"
      />,
    )
    const cardHtml = cardContainer.innerHTML

    const allHtml = pillHtml + ' ' + cardHtml

    // No arbitrary pinging bubbles
    expect(allHtml).not.toContain('animate-ping')

    // No hardcoded non-semantic Tailwind palette colors
    expect(allHtml).not.toContain('bg-emerald-')
    expect(allHtml).not.toContain('text-emerald-')
    expect(allHtml).not.toContain('border-emerald-')
    expect(allHtml).not.toContain('bg-cyan-')
    expect(allHtml).not.toContain('text-cyan-')
    expect(allHtml).not.toContain('border-cyan-')
    expect(allHtml).not.toContain('bg-green-')
    expect(allHtml).not.toContain('text-green-')

    // Uses semantic tokens
    expect(allHtml).toContain('text-primary')
  })
})

describe('PlayGameButton with active game session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays "Play" when target game is not running', () => {
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: null,
      runningGames: [],
      elapsedMs: 0,
    })

    render(<PlayGameButton game={sampleGame} />)

    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
    expect(screen.queryByText(/playing/i)).not.toBeInTheDocument()
  })

  it('displays "Playing" and elapsed time when target game is running', () => {
    vi.mocked(runningHooks.useRunningGame).mockReturnValue({
      runningGame: sampleRunningGame,
      runningGames: [sampleRunningGame],
      elapsedMs: 185000, // 03:05
    })

    render(<PlayGameButton game={sampleGame} />)

    expect(screen.getByRole('button', { name: /playing/i })).toBeInTheDocument()
    expect(screen.getByText('Playing')).toBeInTheDocument()
    expect(screen.getByText('03:05')).toBeInTheDocument()
  })
})
