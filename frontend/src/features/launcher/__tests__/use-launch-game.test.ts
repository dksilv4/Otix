import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLaunchGame } from '../hooks/use-launch-game'
import type { LocalGame } from '../types'

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

describe('useLaunchGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).desktopAPI
  })

  it('shows toast if desktop client is missing', async () => {
    const { result } = renderHook(() => useLaunchGame())
    const game: LocalGame = {
      id: '1',
      title: 'Portal 2',
      exePath: 'portal2.exe',
      installDir: 'C:/Games/Portal2',
      platform: 'steam',
    }

    await act(async () => {
      await result.current.launchGame(game)
    })

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Desktop Client Required',
      }),
    )
  })

  it('launches directly when platform is not ambiguous', async () => {
    const mockLaunch = vi.fn().mockResolvedValue(true)
    const mockGetAmbiguous = vi.fn().mockResolvedValue([])

    ;(window as any).desktopAPI = {
      launchGame: mockLaunch,
      getAmbiguousCandidates: mockGetAmbiguous,
    }

    const { result } = renderHook(() => useLaunchGame())
    const game: LocalGame = {
      id: '2',
      title: 'Super Mario World',
      exePath: 'C:/Roms/smw.sfc',
      installDir: 'C:/Roms',
      platform: 'snes' as any,
    }

    await act(async () => {
      await result.current.launchGame(game)
    })

    expect(mockLaunch).toHaveBeenCalledWith(game)
    expect(result.current.hasDisambiguationTarget).toBe(false)
  })

  it('opens disambiguation modal when ambiguous candidates exist', async () => {
    const mockLaunch = vi.fn().mockResolvedValue(true)
    const mockGetAmbiguous = vi.fn().mockResolvedValue(['ps1', 'ps2', 'gamecube'])

    ;(window as any).desktopAPI = {
      launchGame: mockLaunch,
      getAmbiguousCandidates: mockGetAmbiguous,
    }

    const { result } = renderHook(() => useLaunchGame())
    const game: LocalGame = {
      id: '3',
      title: 'Mystery Game',
      exePath: 'C:/Roms/game.iso',
      installDir: 'C:/Roms',
      platform: 'iso',
    }

    await act(async () => {
      await result.current.launchGame(game)
    })

    expect(mockLaunch).not.toHaveBeenCalled()
    expect(result.current.hasDisambiguationTarget).toBe(true)
    expect(result.current.disambiguationModalProps.candidatePlatforms).toEqual(['ps1', 'ps2', 'gamecube'])
  })

  it('saves chosen platform and launches with updated platform', async () => {
    const mockLaunch = vi.fn().mockResolvedValue(true)
    const mockGetAmbiguous = vi.fn().mockResolvedValue(['ps1', 'ps2'])
    const mockSetPlatform = vi.fn().mockResolvedValue(true)

    ;(window as any).desktopAPI = {
      launchGame: mockLaunch,
      getAmbiguousCandidates: mockGetAmbiguous,
      setGamePlatform: mockSetPlatform,
    }

    const { result } = renderHook(() => useLaunchGame())
    const game: LocalGame = {
      id: '4',
      title: 'Tekken Tag',
      exePath: 'C:/Roms/tekken.iso',
      installDir: 'C:/Roms',
      platform: 'iso',
    }

    await act(async () => {
      await result.current.launchGame(game)
    })

    expect(result.current.hasDisambiguationTarget).toBe(true)

    await act(async () => {
      await result.current.disambiguationModalProps.onSelectPlatform('ps2')
    })

    expect(mockSetPlatform).toHaveBeenCalledWith('4', 'ps2')
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '4',
        platform: 'ps2',
      }),
    )
    expect(result.current.hasDisambiguationTarget).toBe(false)
  })
})
