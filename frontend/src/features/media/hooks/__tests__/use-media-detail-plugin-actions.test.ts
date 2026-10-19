import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMediaDetailPluginActions } from '../use-media-detail-plugin-actions'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@/lib/providers/auth', () => ({
  useHasSession: () => true,
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [] }),
}))

vi.mock('../use-media-stream-player', () => ({
  useMediaStreamPlayer: () => ({
    openStreamPlayer: vi.fn(),
  }),
}))

describe('useMediaDetailPluginActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).desktopAPI
  })

  it('never calls desktopAPI or backend Plex connect-info when mediaType is "game"', async () => {
    const getSlotDataMock = vi.fn().mockResolvedValue([
      {
        pluginId: 'plex',
        label: 'Plex',
        data: {
          widgets: [
            {
              type: 'play-button',
              props: {
                mediaType: 'movie',
                mediaId: '880',
                instances: [{ id: '1', ratingKey: '880', title: 'Barbie' }],
              },
            },
          ],
        },
      },
    ])
    ;(window as any).desktopAPI = {
      plugin: {
        getSlotData: getSlotDataMock,
        callData: vi.fn(),
      },
    }

    const { result } = renderHook(() =>
      useMediaDetailPluginActions('game', '880', '1623730', true),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Neither desktopAPI slots nor backend /integrations/plex should be queried
    expect(getSlotDataMock).not.toHaveBeenCalled()
    expect(apiClient.get).not.toHaveBeenCalled()
    expect(result.current.playWidgets).toEqual([])
    expect(result.current.widgets).toEqual([])
  })

  it('queries backend Plex connect-info for movies when no plugin slots return play widgets', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        ratingKey: '100',
        baseUrl: 'http://plex.local:32400',
        token: 'token-xyz',
        providerLabel: 'Plex',
        title: 'Interstellar',
      },
    })

    const { result } = renderHook(() =>
      useMediaDetailPluginActions('movie', '157336', '157336', true),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(apiClient.get).toHaveBeenCalledWith('/integrations/plex/connect-info/157336', {
      params: { tmdbId: '157336', mediaType: 'movie' },
    })
    expect(result.current.playWidgets.length).toBe(1)
    expect(result.current.playWidgets[0].label).toBe('Plex')
    expect(result.current.playWidgets[0].props.instances[0].streamSession).toBeDefined()
  })
})
