import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStreamAvailability } from '../use-stream-availability'
import { fetchPlexConnectInfoCached } from '../../utils/plex-stream'
import { apiClient } from '@/lib/api/client'
import * as authHooks from '@auth/hooks/use-auth'
import * as libraryQueries from '@/features/library/library-queries'
import * as pluginApi from '@/features/plugins/api'

vi.mock('@auth/hooks/use-auth')
vi.mock('@/features/library/library-queries')
vi.mock('@/features/plugins/api')
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('Adversarial Stress Test: Stream Availability & In-Memory Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mockAuthConnected = () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: { id: 'u1', plexId: 'plex-server-1' } as any,
      isAuthenticated: true,
      isLoading: false,
    } as any)
  }

  const mockEmptyCatalog = () => {
    vi.mocked(libraryQueries.useLibraryTab).mockReturnValue({
      data: { pages: [{ items: [] }] },
      isLoading: false,
      isError: false,
    } as any)
    vi.mocked(pluginApi.getPluginAPI).mockReturnValue(null)
  }

  describe('fetchPlexConnectInfoCached in-flight deduplication', () => {
    it('collapses multiple concurrent calls for the same media ID into a single network request', async () => {
      let networkCallCount = 0
      let resolveNetwork: (val: any) => void = () => {}

      vi.mocked(apiClient.get).mockImplementation(() => {
        networkCallCount++
        return new Promise((resolve) => {
          resolveNetwork = resolve
        })
      })

      // Fire 10 concurrent requests at the exact same instant for media-999
      const promises = Array.from({ length: 10 }, () =>
        fetchPlexConnectInfoCached('media-999', { tmdbId: '12345', mediaType: 'movie' }),
      )

      // Network must be called only once
      expect(networkCallCount).toBe(1)
      expect(apiClient.get).toHaveBeenCalledTimes(1)

      // Resolve the network request
      resolveNetwork({
        data: {
          ratingKey: 'rk-999',
          rating_key: 'rk-999',
          title: 'Deduplicated Movie',
          baseUrl: 'http://192.168.1.100:32400',
        },
      })

      const results = await Promise.all(promises)

      // All 10 callers must receive the exact same response object
      expect(results).toHaveLength(10)
      for (const res of results) {
        expect(res).not.toBeNull()
        expect(res?.ratingKey).toBe('rk-999')
        expect(res?.title).toBe('Deduplicated Movie')
      }
    })

    it('issues separate network requests for distinct media IDs', async () => {
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url.includes('item-A')) {
          return { data: { ratingKey: 'rk-A', title: 'Item A' } }
        }
        if (url.includes('item-B')) {
          return { data: { ratingKey: 'rk-B', title: 'Item B' } }
        }
        return { data: null }
      })

      const [resA, resB] = await Promise.all([
        fetchPlexConnectInfoCached('item-A', { mediaType: 'movie' }),
        fetchPlexConnectInfoCached('item-B', { mediaType: 'movie' }),
      ])

      expect(apiClient.get).toHaveBeenCalledTimes(2)
      expect(resA?.ratingKey).toBe('rk-A')
      expect(resB?.ratingKey).toBe('rk-B')
    })
  })

  describe('In-memory cache retention and expiration', () => {
    it('serves cached result without re-fetching within cache TTL window', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { ratingKey: 'rk-cached', title: 'Cached Movie' },
      })

      // Call 1: Populates cache
      const first = await fetchPlexConnectInfoCached('media-cache-1', { mediaType: 'movie' })
      expect(apiClient.get).toHaveBeenCalledTimes(1)
      expect(first?.ratingKey).toBe('rk-cached')

      // Call 2: Within TTL (immediately)
      const second = await fetchPlexConnectInfoCached('media-cache-1', { mediaType: 'movie' })
      expect(apiClient.get).toHaveBeenCalledTimes(1) // Still 1!
      expect(second?.ratingKey).toBe('rk-cached')
    })

    it('expires cache after TTL and issues a new network request (tested at 35s and 60s)', async () => {
      const nowSpy = vi.spyOn(Date, 'now')
      let currentTime = 1_000_000

      nowSpy.mockImplementation(() => currentTime)

      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({
          data: { ratingKey: 'rk-v1', title: 'Version 1' },
        })
        .mockResolvedValueOnce({
          data: { ratingKey: 'rk-v2', title: 'Version 2' },
        })

      // Initial lookup at T = 0
      const initial = await fetchPlexConnectInfoCached('media-expire-1', { mediaType: 'movie' })
      expect(initial?.ratingKey).toBe('rk-v1')
      expect(apiClient.get).toHaveBeenCalledTimes(1)

      // Lookup at T = +10s (within 30s TTL): cache hit
      currentTime += 10_000
      const cached = await fetchPlexConnectInfoCached('media-expire-1', { mediaType: 'movie' })
      expect(cached?.ratingKey).toBe('rk-v1')
      expect(apiClient.get).toHaveBeenCalledTimes(1)

      // Advance time by 60s (currentTime += 60_000, well past TTL): cache expired!
      currentTime += 60_000
      const refreshed = await fetchPlexConnectInfoCached('media-expire-1', { mediaType: 'movie' })
      expect(refreshed?.ratingKey).toBe('rk-v2')
      expect(apiClient.get).toHaveBeenCalledTimes(2) // Fresh network call!
    })
  })

  describe('Error fallback and resilience', () => {
    it('returns null and does not throw when network throws 500 error', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Internal Server Error 500'))

      const res = await fetchPlexConnectInfoCached('media-error-500', { mediaType: 'movie' })
      expect(res).toBeNull()
    })

    it('clears in-flight tracker on error so subsequent requests can retry', async () => {
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('Network offline'))
        .mockResolvedValueOnce({
          data: { ratingKey: 'rk-recovered', title: 'Recovered' },
        })

      // Call 1 fails
      const failRes = await fetchPlexConnectInfoCached('media-retry-1', { mediaType: 'movie' })
      expect(failRes).toBeNull()

      // Call 2 should retry network call instead of returning permanently failed promise
      const successRes = await fetchPlexConnectInfoCached('media-retry-1', { mediaType: 'movie' })
      expect(successRes?.ratingKey).toBe('rk-recovered')
      expect(apiClient.get).toHaveBeenCalledTimes(2)
    })

    it('returns null gracefully for empty or invalid mediaId without calling network', async () => {
      const res1 = await fetchPlexConnectInfoCached('')
      const res2 = await fetchPlexConnectInfoCached('   ')

      expect(res1).toBeNull()
      expect(res2).toBeNull()
      expect(apiClient.get).not.toHaveBeenCalled()
    })
  })

  describe('useStreamAvailability hook integration and edge cases', () => {
    it('detects streamability via targeted Plex lookup when item is not in initial catalog shelf', async () => {
      mockAuthConnected()
      mockEmptyCatalog()

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { ratingKey: 'rk-deep-lookup', title: 'Deep Catalog Movie' },
      })

      const { result } = renderHook(() =>
        useStreamAvailability({
          mediaId: 'deep-item-777',
          tmdbId: '888',
          mediaType: 'movie',
        }),
      )

      await waitFor(() => {
        expect(result.current.isStreamable).toBe(true)
      })

      expect(result.current.providerLabel).toBe('Plex')
      expect(result.current.tone).toBe('amber')
      expect(result.current.isLoading).toBe(false)
    })

    it('gracefully marks not streamable when targeted lookup returns null without crashing', async () => {
      mockAuthConnected()
      mockEmptyCatalog()

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: null,
      })

      const { result } = renderHook(() =>
        useStreamAvailability({
          mediaId: 'not-available-999',
          tmdbId: '999',
          mediaType: 'movie',
        }),
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isStreamable).toBe(false)
      expect(result.current.isLoading).toBe(false)
    })

    it('skips targeted Plex lookup entirely when mediaType is game', async () => {
      mockAuthConnected()
      mockEmptyCatalog()

      const { result } = renderHook(() =>
        useStreamAvailability({
          mediaId: 'game-123',
          mediaType: 'game',
        }),
      )

      expect(result.current.isStreamable).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(apiClient.get).not.toHaveBeenCalled()
    })

    it('skips targeted Plex lookup when user is not connected to Plex', async () => {
      vi.mocked(authHooks.useAuth).mockReturnValue({
        user: { id: 'u1', plexId: null } as any,
        isAuthenticated: true,
        isLoading: false,
      } as any)
      mockEmptyCatalog()

      const { result } = renderHook(() =>
        useStreamAvailability({
          mediaId: 'movie-123',
          mediaType: 'movie',
        }),
      )

      expect(result.current.isStreamable).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(apiClient.get).not.toHaveBeenCalled()
    })

    it('skips targeted lookup when media is already matched in initial shelf', async () => {
      mockAuthConnected()
      vi.mocked(libraryQueries.useLibraryTab).mockReturnValue({
        data: {
          pages: [
            {
              items: [{ id: 'shelf-item-1', title: 'In Shelf' }],
            },
          ],
        },
        isLoading: false,
        isError: false,
      } as any)
      vi.mocked(pluginApi.getPluginAPI).mockReturnValue(null)

      const { result } = renderHook(() =>
        useStreamAvailability({
          mediaId: 'shelf-item-1',
          mediaType: 'movie',
        }),
      )

      expect(result.current.isStreamable).toBe(true)
      expect(result.current.providerLabel).toBe('Plex')
      // Must not call targeted lookup because it was found in initial catalog shelf
      expect(apiClient.get).not.toHaveBeenCalled()
    })
  })
})
