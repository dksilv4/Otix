import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOpenMediaRequestModal } from '../use-open-media-request-modal'
import type { RequestMediaState } from '../use-request-media'

const mockOpenModal = vi.fn().mockImplementation(() => vi.fn())

vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    openModal: mockOpenModal,
  }),
}))

describe('useOpenMediaRequestModal', () => {
  const dummyState: RequestMediaState = {
    hidden: false,
    loading: false,
    mediaType: 'movie',
    mediaTitle: 'Test Movie',
    posterUrl: null,
    requestLabel: 'Request Movie',
    instances: [],
    widgets: [],
    hasLibraryStatus: false,
    requesting: null,
    queueItem: null,
    queuePercent: 0,
    activeServerName: 'Server 1',
    handleRequest: vi.fn(),
    handleCancelQueue: vi.fn(),
  }

  it('calls openModal with MediaRequestConfirmModal element', () => {
    const { result } = renderHook(() => useOpenMediaRequestModal())

    act(() => {
      result.current.openRequestModal({
        state: dummyState,
        initialInstanceId: 'inst-1',
      })
    })

    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })
})
