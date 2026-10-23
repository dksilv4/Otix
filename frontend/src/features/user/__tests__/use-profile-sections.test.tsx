import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useProfileSections } from '../hooks/use-profile-sections'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    patch: vi.fn().mockResolvedValue({ data: {} }),
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

describe('useProfileSections', () => {
  it('removes a section and calls PATCH /auth/me with the filtered sections', async () => {
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} })
    const { result } = renderHook(
      () =>
        useProfileSections({
          username: 'alice',
          currentSections: ['reviews', 'stats', 'game_sessions'],
        }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.removeSection('stats')
    })

    expect(patchSpy).toHaveBeenCalledWith('/auth/me', {
      profileSections: ['reviews', 'game_sessions'],
    })
  })

  it('adds a section and calls PATCH /auth/me with appended section', async () => {
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} })
    const { result } = renderHook(
      () =>
        useProfileSections({
          username: 'alice',
          currentSections: ['reviews'],
        }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.addSection('top_5')
    })

    expect(patchSpy).toHaveBeenCalledWith('/auth/me', {
      profileSections: ['reviews', 'top_5'],
    })
  })
})
