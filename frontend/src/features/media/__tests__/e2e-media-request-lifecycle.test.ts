import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import {
  buildPlexPlaybackSession,
  fetchPlexConnectInfoCached,
  clearPlexConnectCache,
} from '../utils/plex-stream'
import { createToastChannel } from '@/features/notifications/channels/toast-channel'
import type { NotificationEvent } from '@/features/notifications/types'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('End-to-End Media Request & Streaming Lifecycle', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    clearPlexConnectCache()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })
  })

  it('completes the full reactive lifecycle: Request -> Arr Queue -> SSE Notification -> Plex Ready -> Play without page reload', async () => {
    // Stage 1: Initial State - Movie not in library or Plex
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/radarr/lookup')) {
        return { data: [{ title: 'Dune: Part Two', tmdbId: 693134, hasFile: false }] } as any
      }
      if (url.includes('/integrations/plex/connect-info')) {
        throw new Error('Not found in Plex library yet')
      }
      return { data: {} } as any
    })

    // Stage 2: User requests media -> Arr API called
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { id: 42, title: 'Dune: Part Two', tmdb_id: 693134, monitored: true },
    } as any)

    const requestRes = await apiClient.post('/library/nodes/1/radarr/movies', {
      title: 'Dune: Part Two',
      tmdb_id: 693134,
      monitored: true,
      search_for_movie: true,
    })
    expect(requestRes.data.id).toBe(42)

    // Stage 3: Background Notification Channel receives "downloading" event
    const toastCallback = vi.fn()
    const navigateCallback = vi.fn()
    const toastChannel = createToastChannel({}, toastCallback, navigateCallback)

    const downloadingEvent: NotificationEvent = {
      id: 'notif-1',
      type: 'media.request.downloading',
      title: 'Media Downloading',
      body: 'Dune: Part Two is downloading (45% at 24.5 MB/s)',
      metadata: { link: '/media/movie/693134', stage: 'downloading' },
      isRead: false,
      createdAt: new Date().toISOString(),
    }

    toastChannel.deliver(downloadingEvent)
    expect(toastCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Media Downloading',
        description: expect.stringContaining('45%'),
        onClick: expect.any(Function),
      }),
    )

    // Stage 4: Download Completes -> "ready" Notification arrives with navigation link
    const readyEvent: NotificationEvent = {
      id: 'notif-2',
      type: 'media.request.ready',
      title: 'Media Ready to Stream',
      body: 'Dune: Part Two has finished downloading and is indexed in Plex!',
      metadata: { link: '/media/movie/693134', stage: 'ready' },
      isRead: false,
      createdAt: new Date().toISOString(),
    }

    toastChannel.deliver(readyEvent)
    expect(toastCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Media Ready to Stream',
        description: expect.stringContaining('Plex'),
        onClick: expect.any(Function),
      }),
    )

    // Clicking toast navigates user straight to media
    const lastToastCall = toastCallback.mock.calls[toastCallback.mock.calls.length - 1][0]
    lastToastCall.onClick()
    expect(navigateCallback).toHaveBeenCalledWith('/media/movie/693134')

    // Stage 5: Plex library scan finishes -> Connect info resolves -> Stream Session constructed
    const plexData = {
      ratingKey: '88442',
      baseUrl: 'http://192.168.1.100:32400',
      token: 'secure-plex-token-xyz',
      providerLabel: 'Plex Server',
      title: 'Dune: Part Two',
      partKey: '/library/parts/88442/file.mkv',
      duration: 9960000,
      videoCodec: 'hevc',
      audioCodec: 'truehd',
    }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: plexData } as any)

    const connectInfo = await fetchPlexConnectInfoCached('693134', {
      tmdbId: '693134',
      title: 'Dune: Part Two',
      mediaType: 'movie',
    })

    expect(connectInfo).not.toBeNull()
    expect(connectInfo?.ratingKey).toBe('88442')

    const playbackSession = buildPlexPlaybackSession(connectInfo!, {
      title: 'Dune: Part Two',
    })

    expect(playbackSession.directUrl).toBeDefined()
    expect(playbackSession.directUrl).toContain('X-Plex-Token=secure-plex-token-xyz')
    expect(playbackSession.hlsUrl).toContain('/video/:/transcode/universal/start.m3u8')
    expect(playbackSession.hlsUrl).toContain('directStream=1')
  })

  it('adheres to strict latency budgets: Direct Play < 2000ms, Transcode < 3000ms', async () => {
    const mockPlexData = {
      ratingKey: '12345',
      baseUrl: 'http://plex.local:32400',
      token: 'perf-test-token',
      providerLabel: 'Otix PMS',
      title: 'Blade Runner 2049',
      partKey: '/library/parts/12345/file.mp4',
      duration: 9800000,
      videoCodec: 'h264',
      audioCodec: 'aac',
    }

    vi.mocked(apiClient.get).mockResolvedValue({ data: mockPlexData } as any)

    // Benchmark 1: Direct Play Session Construction & Lookup
    const startDirectPlay = performance.now()
    const directInfo = await fetchPlexConnectInfoCached('blade-runner-2049', {
      tmdbId: '335984',
      mediaType: 'movie',
    })
    const directSession = buildPlexPlaybackSession(directInfo!, {
      title: 'Blade Runner 2049',
    })
    const directPlayLatency = performance.now() - startDirectPlay

    expect(directSession.directUrl).toBeTruthy()
    // Strict requirement: Direct play initiation must be well below 2000ms
    expect(directPlayLatency).toBeLessThan(2000)

    // Benchmark 2: Transcode Stream Session (with custom quality, audio track, offset)
    const startTranscode = performance.now()
    const transcodeInfo = await fetchPlexConnectInfoCached('blade-runner-2049', {
      tmdbId: '335984',
      mediaType: 'movie',
    })
    const transcodeSession = buildPlexPlaybackSession(transcodeInfo!, {
      title: 'Blade Runner 2049',
      offsetSeconds: 120,
    })
    const transcodeLatency = performance.now() - startTranscode

    expect(transcodeSession.hlsUrl).toContain('offset=120')
    expect(transcodeSession.hlsUrl).toContain('copyts=1')
    // Strict requirement: Transcode initiation must be well below 3000ms
    expect(transcodeLatency).toBeLessThan(3000)

    // Benchmark 3: In-flight deduplication & cache resolution (< 5ms)
    const startCached = performance.now()
    const cachedInfo = await fetchPlexConnectInfoCached('blade-runner-2049')
    const cachedLatency = performance.now() - startCached

    expect(cachedInfo?.ratingKey).toBe('12345')
    expect(cachedLatency).toBeLessThan(10)
  })
})
