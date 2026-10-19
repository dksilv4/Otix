import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollRestoration } from '../use-scroll-restoration'
import * as router from '@tanstack/react-router'

vi.mock('@tanstack/react-router', () => ({
  useLocation: vi.fn(),
}))

describe('useScrollRestoration', () => {
  const originalScrollTo = window.scrollTo
  const mockScrollTo = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    window.scrollTo = mockScrollTo
    mockScrollTo.mockClear()
  })

  afterEach(() => {
    window.scrollTo = originalScrollTo
    vi.clearAllMocks()
  })

  it('does not throw when location.search has a null prototype (Object.create(null))', () => {
    const nullProtoSearch = Object.create(null)
    nullProtoSearch.tab = 'overview'

    vi.mocked(router.useLocation).mockReturnValue({
      pathname: '/library',
      search: nullProtoSearch,
      searchStr: '?tab=overview',
      href: '/library?tab=overview',
      hash: '',
      state: {},
      publicHref: '/library?tab=overview',
      external: false,
    } as any)

    expect(() => {
      renderHook(() => useScrollRestoration())
    }).not.toThrow()
  })

  it('scrolls to top on initial / push navigation', () => {
    vi.mocked(router.useLocation).mockReturnValue({
      pathname: '/welcome',
      search: Object.create(null),
      searchStr: '',
      href: '/welcome',
      hash: '',
      state: {},
      publicHref: '/welcome',
      external: false,
    } as any)

    renderHook(() => useScrollRestoration())

    expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('restores previous scroll position on popstate navigation', () => {
    // Store scroll position for /movies
    sessionStorage.setItem('otix_scroll_positions', JSON.stringify({ '/movies': 450 }))

    vi.mocked(router.useLocation).mockReturnValue({
      pathname: '/home',
      search: Object.create(null),
      searchStr: '',
      href: '/home',
      hash: '',
      state: {},
      publicHref: '/home',
      external: false,
    } as any)

    const { rerender } = renderHook(() => useScrollRestoration())
    mockScrollTo.mockClear()

    // Trigger popstate before navigating back to /movies
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    vi.mocked(router.useLocation).mockReturnValue({
      pathname: '/movies',
      search: Object.create(null),
      searchStr: '',
      href: '/movies',
      hash: '',
      state: {},
      publicHref: '/movies',
      external: false,
    } as any)

    rerender()

    expect(mockScrollTo).toHaveBeenCalledWith({ top: 450, behavior: 'instant' })
  })
})
