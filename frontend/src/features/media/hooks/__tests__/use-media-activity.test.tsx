import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { apiClient } from '@/lib/api/client'
import { useMediaActivity, useMediaActivityCatalog } from '../use-media-activity'

vi.mock('@/lib/providers/auth', () => ({
  useOptionalAuth: () => ({ isAuthenticated: true }),
  useHasSession: () => true,
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useMediaActivity hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and returns the media activity catalog', async () => {
    const mockCatalog = {
      items: {
        'tmdb:movie:550': {
          status: 'processing',
          mediaType: 'movie',
          tmdbId: '550',
          title: 'Fight Club',
          progress: 50,
          nodeName: 'Main Node',
          isOwned: true,
          canManage: true,
          owner: { id: 1, username: 'dk' },
        },
      },
      summary: {
        totalProcessing: 1,
        totalRequested: 0,
        totalAvailable: 0,
      },
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockCatalog })

    const { result } = renderHook(() => useMediaActivityCatalog(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.summary.totalProcessing).toBe(1)
    expect(result.current.data?.items['tmdb:movie:550'].title).toBe('Fight Club')
  })

  it('matches single media item activity with lookup keys', async () => {
    const mockCatalog = {
      items: {
        'tmdb:movie:550': {
          status: 'available',
          mediaType: 'movie',
          tmdbId: '550',
          title: 'Fight Club',
          nodeName: "Bob's Server",
          isOwned: false,
          canManage: false,
          owner: { id: 2, username: 'bob', displayName: 'Bob' },
        },
      },
      summary: { totalProcessing: 0, totalRequested: 0, totalAvailable: 1 },
    }

    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCatalog })

    const { result } = renderHook(() => useMediaActivity('movie', '550', 'tmdb:movie:550'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBeDefined())
    expect(result.current?.status).toBe('available')
    expect(result.current?.isOwned).toBe(false)
    expect(result.current?.owner.username).toBe('bob')
  })
})
