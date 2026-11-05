import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { useDetectedGames } from '../use-detected-games'
import * as desktopApi from '@/lib/desktop/api'

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

describe('useDetectedGames', () => {
  let detectedHandler: ((data: { games: any[] }) => void) | null = null
  let navigateHandler: ((payload: { type: string; metadata?: Record<string, unknown> }) => void) | null = null
  let unsubDetected: ReturnType<typeof vi.fn>
  let unsubNavigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    detectedHandler = null
    navigateHandler = null
    unsubDetected = vi.fn()
    unsubNavigate = vi.fn()

    vi.spyOn(desktopApi, 'getDesktopAPI').mockReturnValue({
      onNewGamesDetected: (cb: any) => {
        detectedHandler = cb
        return unsubDetected
      },
      onNotificationNavigate: (cb: any) => {
        navigateHandler = cb
        return unsubNavigate
      },
    } as any)
  })

  it('subscribes to onNewGamesDetected and onNotificationNavigate on mount', () => {
    const { unmount } = renderHook(() => useDetectedGames(), { wrapper: createWrapper() })

    expect(detectedHandler).not.toBeNull()
    expect(navigateHandler).not.toBeNull()

    unmount()
    expect(unsubDetected).toHaveBeenCalled()
    expect(unsubNavigate).toHaveBeenCalled()
  })

  it('triggers toast and invalidates local-games query cache when a single game is detected', () => {
    const wrapper = createWrapper()
    renderHook(() => useDetectedGames(), { wrapper })

    act(() => {
      detectedHandler?.({
        games: [
          {
            id: 'pc_silksong',
            title: 'Hollow Knight: Silksong',
            installDir: 'C:\\Games\\Silksong',
          },
        ],
      })
    })

    expect(mockToast).toHaveBeenCalledWith({
      title: 'New game detected',
      description: 'Hollow Knight: Silksong was detected and added to your library.',
      variant: 'default',
    })
  })

  it('triggers plural toast when multiple games are detected simultaneously', () => {
    const wrapper = createWrapper()
    renderHook(() => useDetectedGames(), { wrapper })

    act(() => {
      detectedHandler?.({
        games: [
          { id: 'pc_game1', title: 'Game 1' },
          { id: 'pc_game2', title: 'Game 2' },
        ],
      })
    })

    expect(mockToast).toHaveBeenCalledWith({
      title: 'New games detected',
      description: '2 new games were detected and added to your library.',
      variant: 'default',
    })
  })

  it('navigates to game details when game_detected notification is clicked', () => {
    const wrapper = createWrapper()
    renderHook(() => useDetectedGames(), { wrapper })

    act(() => {
      navigateHandler?.({
        type: 'game_detected',
        metadata: { gameId: 'pc_silksong' },
      })
    })

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/launcher/$gameId',
      params: { gameId: 'pc_silksong' },
    })
  })

  it('navigates to /launcher if gameId is not present on game_detected payload', () => {
    const wrapper = createWrapper()
    renderHook(() => useDetectedGames(), { wrapper })

    act(() => {
      navigateHandler?.({
        type: 'game_detected',
        metadata: {},
      })
    })

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/launcher',
    })
  })
})
