import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import {
  getSpotifyLikedTracksNextPageParam,
  useLibraryTab,
  useSteamLibraryScan,
  usePlexLibraryScan,
  usePlexStatus,
  useUnmatchedSteamGames,
  useSteamStatus,
  useSteamWishlist,
  useSpotifyLibraryScan,
  useSpotifyStatus,
  useSpotifyLikedTracks,
  useSaveSpotifyTrack,
  useSteamWishlistScan,
  type SpotifyLikedTracks
} from './library-queries'

// Mock apiClient
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  API_BASE_URL: '',
}))


function likedTracksPage(overrides: Partial<SpotifyLikedTracks>): SpotifyLikedTracks {
  return {
    tracks: [],
    total: 0,
    nextOffset: null,
    hasMore: false,
    ...overrides,
  }
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('Spotify liked tracks pagination', () => {
  it('uses the API next offset instead of the renderable track count', () => {
    const nextPage = getSpotifyLikedTracksNextPageParam(likedTracksPage({
      tracks: Array.from({ length: 49 }, (_, index) => ({
        id: `track-${index}`,
        name: `Track ${index}`,
        artist: 'Artist',
        albumName: 'Album',
        albumArt: null,
        durationMs: null,
        uri: `spotify:track:${index}`,
        previewUrl: null,
      })),
      total: 120,
      nextOffset: 50,
      hasMore: true,
    }))

    expect(nextPage).toBe(50)
  })

  it('continues when the API derives more pages from total count', () => {
    expect(getSpotifyLikedTracksNextPageParam(likedTracksPage({
      total: 120,
      nextOffset: 100,
      hasMore: true,
    }))).toBe(100)
  })

  it('stops when the API has no next offset', () => {
    expect(getSpotifyLikedTracksNextPageParam(likedTracksPage({ nextOffset: null }))).toBeUndefined()
  })
})

describe('Library Query Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useLibraryTab fetches library items by tab with cursor', async () => {
    const mockData = { items: [], nextCursor: 'next-cursor', hasMore: true }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockData })

    const { result } = renderHook(() => useLibraryTab('watchlist'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.get).toHaveBeenCalledWith('/library/watchlist', { params: { limit: '48' } })
    expect(result.current.data?.pages[0]).toEqual(mockData)
    expect(result.current.hasNextPage).toBe(true)
  })

  it('useSteamLibraryScan triggers steam scan mutation', async () => {
    const mockResponse = { totalInSteam: 10, matchedInOtix: 5 }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSteamLibraryScan(), { wrapper: createWrapper() })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/auth/integrations/steam/scan')
    expect(result.current.data).toEqual(mockResponse)
  })

  it('usePlexLibraryScan triggers plex sync mutation', async () => {
    // Step 1: POST returns a task ID (202 response)
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { taskId: 'task-abc' } })

    // Step 2: GET SSE stream returns a sync_complete event then closes
    const sseBody = 'data: {"type":"sync_complete","total":20,"matched":10,"seeded":5,"servers":1,"libraries":2}\n\n'
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody))
        controller.close()
      }
    })
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: readable,
    })

    const { result } = renderHook(() => usePlexLibraryScan(), { wrapper: createWrapper() })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 })
    expect(apiClient.post).toHaveBeenCalledWith('/auth/integrations/plex/sync')
    expect(result.current.data).toEqual({ total: 20, matched: 10, seeded: 5, servers: 1, libraries: 2 })
  })


  it('usePlexStatus fetches plex sync status', async () => {
    const mockResponse = { itemCount: 100, lastScannedAt: '2026-05-24' }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => usePlexStatus(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.get).toHaveBeenCalledWith('/library/plex/status')
    expect(result.current.data).toEqual(mockResponse)
  })

  it('useUnmatchedSteamGames fetches unmatched games', async () => {
    const mockResponse = { items: [], nextCursor: 'next-123', hasMore: true }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useUnmatchedSteamGames(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.get).toHaveBeenCalledWith('/library/steam/unmatched', { params: { limit: '48' } })
    expect(result.current.data?.pages[0]).toEqual(mockResponse)
  })

  it('useSteamStatus fetches steam integration status', async () => {
    const mockResponse = { gameCount: 42, lastScannedAt: '2026-05-24' }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSteamStatus(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.get).toHaveBeenCalledWith('/library/steam/status')
    expect(result.current.data).toEqual(mockResponse)
  })

  it('useSteamWishlist fetches steam wishlist items', async () => {
    const mockResponse = { items: [], nextCursor: null, hasMore: false }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSteamWishlist(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.get).toHaveBeenCalledWith('/library/steam/wishlist', { params: { limit: '48' } })
    expect(result.current.data?.pages[0]).toEqual(mockResponse)
  })

  it('useSpotifyLibraryScan triggers spotify sync mutation', async () => {
    const mockResponse = { taskId: 'task-123' }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSpotifyLibraryScan(), { wrapper: createWrapper() })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/auth/integrations/spotify/sync')
    expect(result.current.data).toEqual(mockResponse)
  })

  it('useSpotifyStatus fetches spotify sync status', async () => {
    const mockResponse = { trackCount: 50, lastScannedAt: '2026-05-24' }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSpotifyStatus(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.get).toHaveBeenCalledWith('/library/spotify/status')
    expect(result.current.data).toEqual(mockResponse)
  })

  it('useSpotifyLikedTracks fetches paginated liked tracks', async () => {
    const mockResponse = likedTracksPage({ tracks: [], total: 100, nextOffset: 50, hasMore: true })
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSpotifyLikedTracks(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.get).toHaveBeenCalledWith('/library/spotify/tracks', { params: { limit: '50', offset: '0' } })
    expect(result.current.data?.pages[0]).toEqual(mockResponse)
  })

  it('useSaveSpotifyTrack triggers like track mutation', async () => {
    const mockResponse = { id: 'track-1', spotifyLiked: true }
    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSaveSpotifyTrack(), { wrapper: createWrapper() })
    result.current.mutate('track-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.put).toHaveBeenCalledWith('/library/spotify/tracks/track-1/liked')
    expect(result.current.data).toEqual(mockResponse)
  })

  it('useSteamWishlistScan triggers steam wishlist scan mutation', async () => {
    const mockResponse = { total: 15, matched: 10 }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSteamWishlistScan(), { wrapper: createWrapper() })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/auth/integrations/steam/wishlist/scan')
    expect(result.current.data).toEqual(mockResponse)
  })
})
