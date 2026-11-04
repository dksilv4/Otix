import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLauncherGame } from '../use-launcher-game'
import { OTIX_DEFAULT_GAME, OTIX_DEFAULT_GAME_ID } from '@/features/launcher/data/otix-default-game'

const mockVisibleGames = [
  {
    id: 'steam-1091500',
    title: 'Cyberpunk 2077',
    platform: 'steam',
    posterUrl: '/cyberpunk.jpg',
    otixMediaId: '730',
    data: {
      id: '730',
      title: 'Cyberpunk 2077',
      posterUrl: '/cyberpunk.jpg',
      backdropUrl: '/cyberpunk-bg.jpg',
    },
  },
]

vi.mock('@/lib/desktop/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/desktop/api')>()
  return {
    ...actual,
    hasDesktopAPI: () => true,
    isDesktop: () => true,
    getDesktopAPI: () => null,
  }
})

vi.mock('@/features/launcher/data/game-queries', () => ({
  useLocalGame: (id?: string) => ({
    data: id === 'local-1' ? { id: 'local-1', title: 'Local One', platform: 'pc' } : undefined,
    isLoading: false,
  }),
  useLauncherVisibleGames: () => ({
    data: mockVisibleGames,
    isLoading: false,
  }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useServerGames: () => ({
    data: { files: [] },
    isLoading: false,
  }),
}))

vi.mock('@/features/launcher/data/queries', () => ({
  useGameDetail: (id?: string) => ({
    data: id === '730' ? { id: '730', title: 'Cyberpunk 2077', overview: 'Rich overview' } : undefined,
    isLoading: false,
  }),
}))

describe('useLauncherGame', () => {
  it('returns default game for OTIX_DEFAULT_GAME_ID', () => {
    const { result } = renderHook(() => useLauncherGame(OTIX_DEFAULT_GAME_ID))
    expect(result.current.game).toEqual(OTIX_DEFAULT_GAME)
    expect(result.current.isLoading).toBe(false)
  })

  it('resolves direct local games from useLocalGame', () => {
    const { result } = renderHook(() => useLauncherGame('local-1'))
    expect(result.current.game?.id).toBe('local-1')
    expect(result.current.game?.title).toBe('Local One')
  })

  it('falls back to matchingVisible games when useLocalGame does not return the game', () => {
    const { result } = renderHook(() => useLauncherGame('steam-1091500'))
    expect(result.current.game).toBeDefined()
    expect(result.current.game?.id).toBe('steam-1091500')
    expect(result.current.game?.title).toBe('Cyberpunk 2077')
    expect(result.current.isLoading).toBe(false)
  })

  it('returns undefined for nonexistent game IDs', () => {
    const { result } = renderHook(() => useLauncherGame('nonexistent-999'))
    expect(result.current.game).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })
})
