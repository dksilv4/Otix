import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWrapper } from '@/test-utils'
import type { UserInteractionState } from '../interaction-queries'

const { mockGet, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: mockGet,
    put: mockPut,
    delete: mockDelete,
  },
}))

import { useUserInteractions, useToggleInteraction } from '../interaction-queries'
import { interactionKeys } from '../interaction-keys'

describe('useUserInteractions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      data: {
        liked: false,
        watchlisted: false,
        watched: false,
        played: false,
        started: false,
        listened: false,
        owned: false,
      },
    })
  })

  it('fetches user interactions for a movie', async () => {
    const { result } = renderHook(
      () => useUserInteractions('movie', 'movie-123'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGet).toHaveBeenCalledWith('/media/movie/movie-123/interactions')
    expect(result.current.data?.watched).toBe(false)
  })

  it('fetches user interactions for a show', async () => {
    const { result } = renderHook(
      () => useUserInteractions('show', 'show-456'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGet).toHaveBeenCalledWith('/media/show/show-456/interactions')
  })

  it('respects the enabled option', async () => {
    const { result } = renderHook(
      () => useUserInteractions('movie', 'movie-123', { enabled: false }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('useToggleInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPut.mockResolvedValue({
      data: {
        interaction: {
          userId: 'user-1',
          mediaItemId: 'movie-123',
          interactionType: 'watched',
          extraData: {},
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        counts: {
          likeCount: 10,
          watchlistCount: 5,
          watchedCount: 1,
          playedCount: 0,
          startedCount: 0,
          listenedCount: 0,
        },
      },
    })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('calls PUT to mark a movie as watched', async () => {
    const { result } = renderHook(
      () => useToggleInteraction('movie', 'movie-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate({ type: 'watched', active: true })

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/media/movie/movie-123/interactions/watched',
        {},
      )
    })
  })

  it('calls DELETE to unmark a movie as watched', async () => {
    const { result } = renderHook(
      () => useToggleInteraction('movie', 'movie-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate({ type: 'watched', active: false })

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        '/media/movie/movie-123/interactions/watched',
      )
    })
  })

  it('optimistically updates the interaction cache on mark watched', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>

    const interactionKey = interactionKeys.forMedia('movie', 'movie-123')
    qc.setQueryData<UserInteractionState>(interactionKey, {
      liked: false,
      watchlisted: false,
      watched: false,
      played: false,
      started: false,
      listened: false,
      owned: false,
    })

    const { result } = renderHook(
      () => useToggleInteraction('movie', 'movie-123'),
      { wrapper },
    )

    result.current.mutate({ type: 'watched', active: true })

    await waitFor(() => {
      expect(qc.getQueryData<UserInteractionState>(interactionKey)?.watched).toBe(true)
    })
  })

  it('rolls back optimistic update on error', async () => {
    mockPut.mockRejectedValue(new Error('Network error'))

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>

    const interactionKey = interactionKeys.forMedia('movie', 'movie-123')
    qc.setQueryData<UserInteractionState>(interactionKey, {
      liked: false,
      watchlisted: false,
      watched: false,
      played: false,
      started: false,
      listened: false,
      owned: false,
    })

    const { result } = renderHook(
      () => useToggleInteraction('movie', 'movie-123'),
      { wrapper },
    )

    result.current.mutate({ type: 'watched', active: true })

    await waitFor(() => {
      expect(qc.getQueryData<UserInteractionState>(interactionKey)?.watched).toBe(false)
    })
  })
})
