import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMediaDetailPluginActions } from '../use-media-detail-plugin-actions'
import { apiClient } from '@/lib/api/client'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

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

    const { result } = renderHook(
      () => useMediaDetailPluginActions('game', '880', '1623730', true),
      { wrapper: createWrapper() },
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

    const { result } = renderHook(
      () => useMediaDetailPluginActions('movie', '157336', '157336', true),
      { wrapper: createWrapper() },
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

  it('reactively updates playWidgets on refreshPlayWidgets when media becomes available on Plex', async () => {
    // 1. Initial call: media not yet on Plex (returns 404 or empty)
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Not found'))

    const wrapper = createWrapper()
    const { result } = renderHook(
      () => useMediaDetailPluginActions('movie', '438631', '438631', true, 'Dune'),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.playWidgets.length).toBe(0)

    // 2. Media finishes download & Plex indexes: second call returns stream connection details
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        ratingKey: '9999',
        baseUrl: 'http://plex.local:32400',
        token: 'plex-token-abc',
        providerLabel: 'Plex',
        title: 'Dune',
      },
    })

    // Invalidate/refresh without page reload
    await result.current.refreshPlayWidgets()

    await waitFor(() => {
      expect(result.current.playWidgets.length).toBe(1)
    })
    expect(result.current.playWidgets[0].props.instances[0].ratingKey).toBe('9999')
    expect(result.current.playWidgets[0].props.instances[0].streamSession).toBeDefined()
  })
})
