import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { useNotifications } from '../use-notifications'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: { items: [], hasMore: false, nextCursor: null },
    }),
  },
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

describe('useNotifications', () => {
  it('returns empty items when no notifications', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.allItems).toEqual([])
  })
})
