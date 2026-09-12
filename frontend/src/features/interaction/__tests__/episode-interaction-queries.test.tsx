import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWrapper } from '@/test-utils'
import type { EpisodeInteractionsOut } from '../episode-interaction-queries'

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

import {
  useEpisodeInteractions,
  useToggleEpisodeWatched,
  useMarkSeasonWatched,
  useMarkShowWatched,
  episodeInteractionKeys,
} from '../episode-interaction-queries'

const EPISODES: EpisodeInteractionsOut = {
  episodes: {
    'ep-1': { episodeId: 'ep-1', watched: false, watchedAt: null },
    'ep-2': { episodeId: 'ep-2', watched: false, watchedAt: null },
    'ep-3': { episodeId: 'ep-3', watched: false, watchedAt: null },
  },
}

describe('useEpisodeInteractions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: EPISODES })
  })

  it('fetches episode interactions with media type in URL', async () => {
    const { result } = renderHook(
      () => useEpisodeInteractions('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGet).toHaveBeenCalledWith('/media/show/show-123/episode-interactions')
    expect(Object.keys(result.current.data?.episodes ?? {})).toHaveLength(3)
  })

  it('respects enabled option', async () => {
    const { result } = renderHook(
      () => useEpisodeInteractions('show', 'show-123', { enabled: false }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('useToggleEpisodeWatched', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPut.mockResolvedValue({
      data: {
        interaction: { episodeId: 'ep-1', watched: true, watchedAt: '2026-01-01T00:00:00Z' },
        showProgress: { watchedEpisodes: 1, totalEpisodes: 3, progressPct: 33.3, completedSeasons: [] },
      },
    })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('calls PUT with media type in URL to mark episode watched', async () => {
    const { result } = renderHook(
      () => useToggleEpisodeWatched('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate({ episodeId: 'ep-1', active: true })

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/media/show/show-123/episodes/ep-1/watched',
      )
    })
  })

  it('calls DELETE with media type in URL to unmark episode', async () => {
    const { result } = renderHook(
      () => useToggleEpisodeWatched('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate({ episodeId: 'ep-1', active: false })

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        '/media/show/show-123/episodes/ep-1/watched',
      )
    })
  })

  it('optimistically updates the watched state for the toggled episode', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>

    const key = episodeInteractionKeys.forShow('show-123')
    qc.setQueryData<EpisodeInteractionsOut>(key, EPISODES)

    const { result } = renderHook(
      () => useToggleEpisodeWatched('show', 'show-123'),
      { wrapper },
    )

    result.current.mutate({ episodeId: 'ep-1', active: true })

    await waitFor(() => {
      expect(qc.getQueryData<EpisodeInteractionsOut>(key)?.episodes['ep-1'].watched).toBe(true)
    })
  })

  it('rolls back optimistic update on error', async () => {
    mockPut.mockRejectedValue(new Error('Network error'))

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>

    const key = episodeInteractionKeys.forShow('show-123')
    qc.setQueryData<EpisodeInteractionsOut>(key, EPISODES)

    const { result } = renderHook(
      () => useToggleEpisodeWatched('show', 'show-123'),
      { wrapper },
    )

    result.current.mutate({ episodeId: 'ep-1', active: true })

    await waitFor(() => {
      expect(qc.getQueryData<EpisodeInteractionsOut>(key)?.episodes['ep-1'].watched).toBe(false)
    })
  })
})

describe('useMarkSeasonWatched', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPut.mockResolvedValue({ data: { episodesMarked: 3 } })
    mockDelete.mockResolvedValue({ data: { episodesMarked: 3 } })
  })

  it('calls PUT with media type and season number in URL', async () => {
    const { result } = renderHook(
      () => useMarkSeasonWatched('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate({ seasonNumber: 1, active: true })

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/media/show/show-123/seasons/1/watched',
      )
    })
  })

  it('returns the number of episodes marked', async () => {
    const { result } = renderHook(
      () => useMarkSeasonWatched('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate({ seasonNumber: 1, active: true })

    await waitFor(() => {
      expect(result.current.data?.episodesMarked).toBe(3)
    })
  })
})

describe('useMarkShowWatched', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPut.mockResolvedValue({ data: { episodesMarked: 3 } })
    mockDelete.mockResolvedValue({ data: { episodesMarked: 3 } })
  })

  it('calls PUT with media type in URL to mark show watched', async () => {
    const { result } = renderHook(
      () => useMarkShowWatched('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate(true)

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/media/show/show-123/show-watched',
      )
    })
  })

  it('calls DELETE with media type in URL to unmark show watched', async () => {
    const { result } = renderHook(
      () => useMarkShowWatched('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate(false)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        '/media/show/show-123/show-watched',
      )
    })
  })

  it('returns the number of episodes marked', async () => {
    const { result } = renderHook(
      () => useMarkShowWatched('show', 'show-123'),
      { wrapper: createWrapper() },
    )

    result.current.mutate(true)

    await waitFor(() => {
      expect(result.current.data?.episodesMarked).toBe(3)
    })
  })

  it('optimistically marks all episodes as watched', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>

    const key = episodeInteractionKeys.forShow('show-123')
    qc.setQueryData<EpisodeInteractionsOut>(key, EPISODES)

    const { result } = renderHook(
      () => useMarkShowWatched('show', 'show-123'),
      { wrapper },
    )

    result.current.mutate(true)

    await waitFor(() => {
      const data = qc.getQueryData<EpisodeInteractionsOut>(key)
      expect(data?.episodes['ep-1'].watched).toBe(true)
      expect(data?.episodes['ep-2'].watched).toBe(true)
      expect(data?.episodes['ep-3'].watched).toBe(true)
    })
  })

  it('optimistically marks all episodes as unwatched', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>

    const key = episodeInteractionKeys.forShow('show-123')
    qc.setQueryData<EpisodeInteractionsOut>(key, {
      episodes: {
        'ep-1': { episodeId: 'ep-1', watched: true, watchedAt: '2026-01-01T00:00:00Z' },
        'ep-2': { episodeId: 'ep-2', watched: true, watchedAt: '2026-01-01T00:00:00Z' },
        'ep-3': { episodeId: 'ep-3', watched: false, watchedAt: null },
      },
    })

    const { result } = renderHook(
      () => useMarkShowWatched('show', 'show-123'),
      { wrapper },
    )

    result.current.mutate(false)

    await waitFor(() => {
      const data = qc.getQueryData<EpisodeInteractionsOut>(key)
      expect(data?.episodes['ep-1'].watched).toBe(false)
      expect(data?.episodes['ep-2'].watched).toBe(false)
      expect(data?.episodes['ep-3'].watched).toBe(false)
    })
  })

  it('rolls back optimistic update on error', async () => {
    mockPut.mockRejectedValue(new Error('Network error'))

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>

    const key = episodeInteractionKeys.forShow('show-123')
    qc.setQueryData<EpisodeInteractionsOut>(key, EPISODES)

    const { result } = renderHook(
      () => useMarkShowWatched('show', 'show-123'),
      { wrapper },
    )

    result.current.mutate(true)

    await waitFor(() => {
      const data = qc.getQueryData<EpisodeInteractionsOut>(key)
      expect(data?.episodes['ep-1'].watched).toBe(false)
      expect(data?.episodes['ep-2'].watched).toBe(false)
      expect(data?.episodes['ep-3'].watched).toBe(false)
    })
  })
})
