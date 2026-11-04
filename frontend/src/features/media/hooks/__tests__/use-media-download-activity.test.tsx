import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMediaDownloadActivity } from '../use-media-download-activity'
import * as serverHooksModule from '@/features/downloads/use-server-downloads'
import * as downloadHooksModule from '@/features/downloads/use-server-arr'
import * as usenetHooksModule from '@/features/downloads/use-node-usenet'
import * as downloadsModule from '@/features/downloads/use-downloads'
import * as authModule from '@/lib/providers/auth'

vi.mock('@/features/downloads/use-server-downloads')
vi.mock('@/features/downloads/use-server-arr')
vi.mock('@/features/downloads/use-node-usenet')
vi.mock('@/features/downloads/use-downloads')
vi.mock('@/lib/providers/auth')

describe('useMediaDownloadActivity', () => {
  let queryClient: QueryClient
  const cancelSonarrMutateAsync = vi.fn().mockResolvedValue({})
  const cancelRadarrMutateAsync = vi.fn().mockResolvedValue({})

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.spyOn(authModule, 'useOptionalAuth').mockReturnValue({
      user: { id: 'user-1' },
      isAuthenticated: true,
    } as any)

    vi.spyOn(serverHooksModule, 'useGameServers').mockReturnValue({
      data: [{ id: 1, name: 'MainServer', isActive: true }] as any,
    } as any)

    vi.spyOn(downloadHooksModule, 'useCancelServerSonarrQueueItem').mockReturnValue({
      mutateAsync: cancelSonarrMutateAsync,
      isPending: false,
    } as any)

    vi.spyOn(downloadHooksModule, 'useCancelServerRadarrQueueItem').mockReturnValue({
      mutateAsync: cancelRadarrMutateAsync,
      isPending: false,
    } as any)

    vi.spyOn(usenetHooksModule, 'useServerUsenetQueue').mockReturnValue({
      data: {
        speed: '15.5 MB/s',
        items: [
          { nzo_id: 'nzo_s01e01', speed: '15.5 MB/s', percentage: 45 },
        ],
      } as any,
    } as any)

    vi.spyOn(downloadsModule, 'useDownloads').mockReturnValue({
      downloads: [],
      cancelDownload: vi.fn(),
    } as any)
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('matches downloading episodes for a show and returns O(1) lookup', () => {
    vi.spyOn(downloadHooksModule, 'useServerSonarrQueue').mockReturnValue({
      data: {
        page: 1,
        pageSize: 50,
        totalRecords: 1,
        records: [
          {
            id: 201,
            title: 'Severance.S01E01.1080p.WEB-DL',
            status: 'Downloading',
            size: 2_000_000_000,
            sizeLeft: 1_100_000_000, // 45%
            timeleft: '00:04:12',
            downloadId: 'nzo_s01e01',
            mediaItemId: 42,
            seasonNumber: 1,
            episodeNumber: 1,
            series: { id: 1, title: 'Severance' },
          },
        ],
      } as any,
    } as any)

    vi.spyOn(downloadHooksModule, 'useServerRadarrQueue').mockReturnValue({
      data: { records: [] } as any,
    } as any)

    const { result } = renderHook(
      () =>
        useMediaDownloadActivity('show', 42, {
          title: 'Severance',
        }),
      { wrapper },
    )

    expect(result.current.isDownloading).toBe(true)
    expect(result.current.activeCount).toBe(1)
    expect(result.current.overallProgress).toBe(45)
    expect(result.current.speed).toBe('15.5 MB/s')
    expect(result.current.eta).toBe('00:04:12')

    // Test episode lookup
    const epDownload = result.current.getEpisodeDownload(1, 1)
    expect(epDownload).not.toBeNull()
    expect(epDownload?.queueId).toBe(201)
    expect(epDownload?.percentage).toBe(45)
    expect(epDownload?.speed).toBe('15.5 MB/s')
    expect(epDownload?.timeleft).toBe('00:04:12')

    // Unmatched episode
    expect(result.current.getEpisodeDownload(1, 2)).toBeNull()
  })

  it('handles cancellation of an episode download', async () => {
    vi.spyOn(downloadHooksModule, 'useServerSonarrQueue').mockReturnValue({
      data: {
        records: [
          {
            id: 201,
            title: 'Severance.S01E01.1080p',
            mediaItemId: 42,
            seasonNumber: 1,
            episodeNumber: 1,
          },
        ],
      } as any,
    } as any)

    const { result } = renderHook(
      () => useMediaDownloadActivity('show', 42, { title: 'Severance' }),
      { wrapper },
    )

    const epDownload = result.current.getEpisodeDownload(1, 1)
    await epDownload?.cancel()
    expect(cancelSonarrMutateAsync).toHaveBeenCalledWith({ queueId: 201 })
  })

  it('matches movies downloading in Radarr', () => {
    vi.spyOn(downloadHooksModule, 'useServerSonarrQueue').mockReturnValue({
      data: { records: [] } as any,
    } as any)

    vi.spyOn(downloadHooksModule, 'useServerRadarrQueue').mockReturnValue({
      data: {
        records: [
          {
            id: 301,
            title: 'Inception.2010.1080p.BluRay',
            status: 'Downloading',
            size: 10_000_000_000,
            sizeLeft: 4_000_000_000,
            timeleft: '00:12:00',
            mediaItemId: 99,
            movieTitle: 'Inception',
            movie: { id: 5, title: 'Inception', tmdbId: 27205 },
          },
        ],
      } as any,
    } as any)

    const { result } = renderHook(
      () =>
        useMediaDownloadActivity('movie', 99, {
          tmdbId: 27205,
          title: 'Inception',
        }),
      { wrapper },
    )

    expect(result.current.isDownloading).toBe(true)
    expect(result.current.activeCount).toBe(1)
    expect(result.current.overallProgress).toBe(60)
    expect(result.current.primaryQueueItem?.id).toBe(301)
  })
})
