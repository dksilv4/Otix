import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuickStream } from '../use-quick-stream'
import * as mediaStreamPlayer from '../use-media-stream-player'
import * as plexStream from '../../utils/plex-stream'
import * as pluginApi from '@/features/plugins/api'
import * as toast from '@ui/molecules/toast'

vi.mock('../use-media-stream-player')
vi.mock('../../utils/plex-stream')
vi.mock('@/features/plugins/api')
vi.mock('@ui/molecules/toast')

describe('useQuickStream', () => {
  const mockOpenStream = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mediaStreamPlayer.useMediaStreamPlayer).mockReturnValue({
      openStream: mockOpenStream,
    } as any)
  })

  it('plays stream via backend Plex connect-info when resolved', async () => {
    vi.mocked(pluginApi.getPluginAPI).mockReturnValue(null)
    vi.mocked(plexStream.fetchPlexConnectInfoCached).mockResolvedValue({
      baseUrl: 'http://127.0.0.1:32400',
      token: 'secret-token',
      ratingKey: '5001',
    } as any)
    vi.mocked(plexStream.buildPlexPlaybackSession).mockReturnValue({
      source: 'plex',
      itemId: '5001',
      title: 'Inception',
      hlsUrl: 'http://mock-hls',
    } as any)

    const { result } = renderHook(() => useQuickStream())

    let success = false
    await act(async () => {
      success = await result.current.quickStream({
        mediaId: '10',
        title: 'Inception',
        mediaType: 'movie',
      })
    })

    expect(success).toBe(true)
    expect(mockOpenStream).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Inception',
      }),
    )
  })

  it('shows warning toast when stream connection cannot be resolved', async () => {
    vi.mocked(pluginApi.getPluginAPI).mockReturnValue(null)
    vi.mocked(plexStream.fetchPlexConnectInfoCached).mockResolvedValue(null)

    const { result } = renderHook(() => useQuickStream())

    let success = true
    await act(async () => {
      success = await result.current.quickStream({
        mediaId: '99',
        title: 'Unavailable Movie',
        mediaType: 'movie',
      })
    })

    expect(success).toBe(false)
    expect(mockOpenStream).not.toHaveBeenCalled()
    expect(toast.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Stream Unavailable',
        variant: 'warning',
      }),
    )
  })
})
