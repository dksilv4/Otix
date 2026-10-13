import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { apiClient } from '@/lib/api/client'
import { useDiscoverContinueWatching } from '../use-discover-continue-watching'

let mockUser: any = { id: 1, plexId: 'plex-user-123' }
let mockFeatureEnabled = true

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

vi.mock('@/features/_config', () => ({
  useFeature: () => mockFeatureEnabled,
}))

vi.mock('framer-motion', () => ({
  useInView: () => true,
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('useDiscoverContinueWatching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = { id: 1, plexId: 'plex-user-123' }
    mockFeatureEnabled = true
  })

  it('does not fetch if Plex is not connected', async () => {
    mockUser = { id: 1, plexId: null }
    const { result } = renderHook(() => useDiscoverContinueWatching(true), {
      wrapper: createWrapper(),
    })

    expect(result.current.isPlexConnected).toBe(false)
    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.isEmpty).toBe(false)
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('fetches items when Plex is connected and eager is true', async () => {
    const mockItems = [{ id: 'plex-item-1', title: 'Severance' }]
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { items: mockItems },
    } as any)

    const { result } = renderHook(() => useDiscoverContinueWatching(true), {
      wrapper: createWrapper(),
    })

    expect(result.current.isPlexConnected).toBe(true)
    await waitFor(() => {
      expect(result.current.items).toEqual(mockItems)
      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.isEmpty).toBe(false)
    })
  })

  it('marks isEmpty as true when query returns empty array', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { items: [] },
    } as any)

    const { result } = renderHook(() => useDiscoverContinueWatching(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.items).toEqual([])
      expect(result.current.isEmpty).toBe(true)
      expect(result.current.showSkeleton).toBe(false)
    })
  })
})
