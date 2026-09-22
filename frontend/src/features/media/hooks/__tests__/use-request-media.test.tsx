import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useRequestMedia } from '../use-request-media'
import * as mediaParamsModule from '../use-media-params'
import * as authSessionModule from '@/lib/providers/auth'
import * as serverHooksModule from '@/features/downloads/use-server-downloads'
import * as downloadHooksModule from '@/features/downloads/use-server-arr'
import * as mediaQueriesModule from '../../queries/media-queries'

vi.mock('../use-media-params')
vi.mock('@/lib/providers/auth')
vi.mock('@/features/downloads/use-server-downloads')
vi.mock('@/features/downloads/use-server-arr')
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

describe('useRequestMedia', () => {
  let queryClient: QueryClient
  const addMovieMutateAsync = vi.fn().mockResolvedValue({ id: 100 })
  const addSeriesMutateAsync = vi.fn().mockResolvedValue({ id: 200 })

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.spyOn(authSessionModule, 'useHasSession').mockReturnValue(true)
    vi.spyOn(serverHooksModule, 'useGameServers').mockReturnValue({
      data: [{ id: 1, name: 'MainServer', isActive: true }] as any,
    } as any)

    vi.spyOn(downloadHooksModule, 'useServerRadarrConfig').mockReturnValue({
      data: {
        enabled: true,
        host: '127.0.0.1',
        port: 7878,
        instances: [{ id: 'radarr1', name: '4K', enabled: true, host: '127.0.0.1', port: 7878 }],
      } as any,
      isLoading: false,
    } as any)

    vi.spyOn(downloadHooksModule, 'useServerSonarrConfig').mockReturnValue({
      data: {
        enabled: true,
        host: '127.0.0.1',
        port: 8989,
        instances: [{ id: 'sonarr1', name: 'TV', enabled: true, host: '127.0.0.1', port: 8989 }],
      } as any,
      isLoading: false,
    } as any)

    vi.spyOn(downloadHooksModule, 'useAddServerRadarrMovie').mockReturnValue({
      mutateAsync: addMovieMutateAsync,
    } as any)

    vi.spyOn(downloadHooksModule, 'useAddServerSonarrSeries').mockReturnValue({
      mutateAsync: addSeriesMutateAsync,
    } as any)

    vi.spyOn(downloadHooksModule, 'useServerRadarrQueue').mockReturnValue({
      data: { page: 1, pageSize: 50, totalRecords: 0, records: [] },
    } as any)

    vi.spyOn(downloadHooksModule, 'useServerSonarrQueue').mockReturnValue({
      data: { page: 1, pageSize: 50, totalRecords: 0, records: [] },
    } as any)

    vi.spyOn(downloadHooksModule, 'useCancelServerRadarrQueueItem').mockReturnValue({
      mutate: vi.fn(),
    } as any)
    vi.spyOn(downloadHooksModule, 'useCancelServerSonarrQueueItem').mockReturnValue({
      mutate: vi.fn(),
    } as any)
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('does NOT treat internal numeric Otix database PK as tmdbId when detail is loading/missing', async () => {
    vi.spyOn(mediaParamsModule, 'useMediaParams').mockReturnValue({
      mediaType: 'movie',
      mediaId: '1', // Internal Otix database primary key!
    })

    // detailQuery is loading and has not returned tmdbId
    vi.spyOn(mediaQueriesModule.mediaQueries, 'detail').mockReturnValue({
      queryKey: ['media', 'detail', 'movie', '1'],
      queryFn: async () => new Promise(() => {}), // stays pending
      enabled: true,
    } as any)

    const { result } = renderHook(() => useRequestMedia(), { wrapper })

    expect(result.current.loading).toBe(true)
    expect(result.current.disabledReason).toContain('Checking Radarr')
  })

  it('uses detail.tmdbId when available and requests with real TMDB id', async () => {
    vi.spyOn(mediaParamsModule, 'useMediaParams').mockReturnValue({
      mediaType: 'movie',
      mediaId: '1', // Otix DB PK
    })

    vi.spyOn(mediaQueriesModule.mediaQueries, 'detail').mockReturnValue({
      queryKey: ['media', 'detail', 'movie', '1'],
      queryFn: async () => ({
        id: '1',
        title: 'Oppenheimer',
        tmdbId: '872585', // Actual TMDb ID
        releaseDate: '2023-07-21',
      }),
      enabled: true,
    } as any)

    const { result } = renderHook(() => useRequestMedia(), { wrapper })

    await waitFor(() => {
      expect(result.current.mediaTitle).toBe('Oppenheimer')
    })

    await act(async () => {
      await result.current.handleRequest({ instanceId: '1:radarr1' })
    })

    expect(addMovieMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Oppenheimer',
        tmdb_id: 872585,
        year: 2023,
      }),
    )
  })

  it('extracts TMDB ID if mediaId explicitly contains tmdb:movie: prefix', async () => {
    vi.spyOn(mediaParamsModule, 'useMediaParams').mockReturnValue({
      mediaType: 'movie',
      mediaId: 'tmdb:movie:872585',
    })

    vi.spyOn(mediaQueriesModule.mediaQueries, 'detail').mockReturnValue({
      queryKey: ['media', 'detail', 'movie', 'tmdb:movie:872585'],
      queryFn: async () => ({
        id: '1',
        title: 'Oppenheimer',
        releaseDate: '2023-07-21',
      }),
      enabled: true,
    } as any)

    const { result } = renderHook(() => useRequestMedia(), { wrapper })

    await waitFor(() => {
      expect(result.current.mediaTitle).toBe('Oppenheimer')
    })

    await act(async () => {
      await result.current.handleRequest({ instanceId: '1:radarr1' })
    })

    expect(addMovieMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Oppenheimer',
        tmdb_id: 872585,
      }),
    )
  })

  it('falls back to mediaTitle if tmdbId is missing and title is known', async () => {
    vi.spyOn(mediaParamsModule, 'useMediaParams').mockReturnValue({
      mediaType: 'movie',
      mediaId: '42',
    })

    vi.spyOn(mediaQueriesModule.mediaQueries, 'detail').mockReturnValue({
      queryKey: ['media', 'detail', 'movie', '42'],
      queryFn: async () => ({
        id: '42',
        title: 'Some Rare Movie',
        tmdbId: null,
        releaseDate: '2020-01-01',
      }),
      enabled: true,
    } as any)

    const { result } = renderHook(() => useRequestMedia(), { wrapper })

    await waitFor(() => {
      expect(result.current.mediaTitle).toBe('Some Rare Movie')
    })

    await act(async () => {
      await result.current.handleRequest({ instanceId: '1:radarr1' })
    })

    expect(addMovieMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some Rare Movie',
        tmdb_id: undefined,
        year: 2020,
      }),
    )
  })
})
