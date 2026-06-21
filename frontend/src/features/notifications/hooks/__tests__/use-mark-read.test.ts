import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { useMarkRead } from '../use-mark-read'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

describe('useMarkRead', () => {
  it('returns a mutation function', () => {
    const { result } = renderHook(() => useMarkRead(), { wrapper: createWrapper() })
    expect(result.current.mutate).toBeDefined()
    expect(result.current.mutateAsync).toBeDefined()
  })
})
