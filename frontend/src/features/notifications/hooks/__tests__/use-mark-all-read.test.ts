import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useMarkAllRead } from '../use-mark-all-read'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

function createWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMarkAllRead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls apiClient.post with /notifications/read-all', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: createWrapper(qc) })
    result.current.mutate()
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/notifications/read-all')
    })
  })

  it('optimistically sets unread count to 0', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(['notifications', 'unread-count'], { count: 5 })
    const { result } = renderHook(() => useMarkAllRead(), { wrapper: createWrapper(qc) })
    result.current.mutate()
    await waitFor(() => {
      expect(qc.getQueryData(['notifications', 'unread-count'])).toEqual({ count: 0 })
    })
  })
})
