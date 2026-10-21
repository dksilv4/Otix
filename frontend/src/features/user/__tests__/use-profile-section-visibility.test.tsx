import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useProfileSectionVisibility } from '../hooks/use-profile-section-visibility'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    patch: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useProfileSectionVisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves default private visibility for game_sessions when not specified', () => {
    const { result } = renderHook(
      () =>
        useProfileSectionVisibility({
          sectionId: 'game_sessions',
          username: 'dan',
          currentVisibilityMap: {},
        }),
      { wrapper: createWrapper() }
    )

    expect(result.current.visibility).toBe('private')
  })

  it('resolves default public visibility for reviews when not specified', () => {
    const { result } = renderHook(
      () =>
        useProfileSectionVisibility({
          sectionId: 'reviews',
          username: 'dan',
          currentVisibilityMap: {},
        }),
      { wrapper: createWrapper() }
    )

    expect(result.current.visibility).toBe('public')
  })

  it('resolves friends visibility when specified in currentVisibilityMap', () => {
    const { result } = renderHook(
      () =>
        useProfileSectionVisibility({
          sectionId: 'reviews',
          username: 'dan',
          currentVisibilityMap: { reviews: 'friends' },
        }),
      { wrapper: createWrapper() }
    )

    expect(result.current.visibility).toBe('friends')
  })

  it('cycles visibility through public -> friends -> private -> public via toggleVisibility', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never)

    // From public to friends
    const { result: resPublic } = renderHook(
      () =>
        useProfileSectionVisibility({
          sectionId: 'reviews',
          username: 'dan',
          currentVisibilityMap: { reviews: 'public' },
        }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await resPublic.current.toggleVisibility()
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', {
      sectionVisibility: {
        reviews: 'friends',
      },
    })

    // From friends to private
    const { result: resFriends } = renderHook(
      () =>
        useProfileSectionVisibility({
          sectionId: 'reviews',
          username: 'dan',
          currentVisibilityMap: { reviews: 'friends' },
        }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await resFriends.current.toggleVisibility()
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', {
      sectionVisibility: {
        reviews: 'private',
      },
    })

    // From private to public
    const { result: resPrivate } = renderHook(
      () =>
        useProfileSectionVisibility({
          sectionId: 'game_sessions',
          username: 'dan',
          currentVisibilityMap: { game_sessions: 'private' },
        }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await resPrivate.current.toggleVisibility()
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', {
      sectionVisibility: {
        game_sessions: 'public',
      },
    })
  })

  it('sets visibility directly to any level via setVisibility', async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: {} } as never)

    const { result } = renderHook(
      () =>
        useProfileSectionVisibility({
          sectionId: 'top_rated',
          username: 'dan',
          currentVisibilityMap: { top_rated: 'public' },
        }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.setVisibility('friends')
    })

    expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', {
      sectionVisibility: {
        top_rated: 'friends',
      },
    })
  })
})
