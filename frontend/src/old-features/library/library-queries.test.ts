// TODO: Review this file
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import {
  useLibraryTab,
  useSteamLibraryScan,
  usePlexLibraryScan,
  usePlexStatus,
  useUnmatchedSteamGames,
  useSteamStatus,
  useSteamWishlist,
  useSteamWishlistScan,
} from './library-queries'

// Mock apiClient and config
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))
vi.mock('@/lib/config', () => ({
  API_BASE_URL: '',
  ACCESS_TOKEN_KEY: 'otix-access-token',
}))

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
    expect(apiClient.post).toHaveBeenCalledWith('/integrations/steam/scan')
    expect(result.current.data).toEqual(mockResponse)
  })

  it('usePlexLibraryScan triggers plex sync mutation', async () => {
    // The POST creation and SSE stream are now handled by connectTaskSseStream
    // using fetch() directly (not apiClient).

    // Step 1: POST to create the sync task returns a task ID
    const postResponse = new Response(JSON.stringify({ taskId: 'task-abc' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    // Step 2: GET SSE stream returns a sync_complete event then closes
    const sseBody = 'data: {"type":"sync_complete","total":20,"matched":10,"seeded":5,"servers":1,"libraries":2}\n\n'
    const encoder = new TextEncoder()
    const sseStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody))
        controller.close()
      }
    })
    const streamResponse = new Response(sseStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(postResponse)
      .mockResolvedValueOnce(streamResponse))

    const { result } = renderHook(() => usePlexLibraryScan(), { wrapper: createWrapper() })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 })
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

  it('useUnmatchedSteamGames fetches unmatched game', async () => {
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

  it('useSteamWishlistScan triggers steam wishlist scan mutation', async () => {
    const mockResponse = { total: 15, matched: 10 }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: mockResponse })

    const { result } = renderHook(() => useSteamWishlistScan(), { wrapper: createWrapper() })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/integrations/steam/wishlist/scan')
    expect(result.current.data).toEqual(mockResponse)
  })
})
