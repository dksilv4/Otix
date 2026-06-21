import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { apiClient } from '@/lib/api/client'
import { useMarkRead } from '../use-mark-read'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

describe('useMarkRead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls apiClient.post with the correct notification read endpoint', async () => {
    const { result } = renderHook(() => useMarkRead(), { wrapper: createWrapper() })
    result.current.mutate('test-notif-id')
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/notifications/test-notif-id/read')
    })
  })
})
