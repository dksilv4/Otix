import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mediaKeys } from './media-keys'
import { mediaQueries } from './media-queries'

const getMock = vi.fn()

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
  },
  getResolvedTheme: () => 'dark',
}))

describe('mediaQueries.detail', () => {
  it('uses one cache key so hero, page, and card prefetch share the same request', () => {
    expect(mediaQueries.detail('movie', '42').queryKey).toEqual(mediaKeys.detail('movie', '42'))
    expect(mediaQueries.detail('movie', '42').queryKey).toEqual(['media', 'detail', 'movie', '42'])
  })
})

describe('mediaQueries.infiniteList', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('maps DRF {results, count, next} into {items, total, hasMore}', async () => {
    getMock.mockResolvedValue({
      data: {
        count: 2,
        next: 'http://example.com/api/v1/media/?page=2',
        previous: null,
        results: [
          { id: '1', title: 'Dune', mediaType: 'movie' },
          { id: '2', title: 'Arrival', mediaType: 'movie' },
        ],
      },
    })

    const query = mediaQueries.infiniteList({
      type: 'movie',
      genre: 'action',
      sortBy: 'popularity',
      sortDir: 'desc',
      limit: 48,
    })

    const page = await query.queryFn({ pageParam: 1, queryKey: query.queryKey, direction: 'forward', meta: undefined, signal: new AbortController().signal })

    expect(getMock).toHaveBeenCalledWith('/media/', {
      params: {
        page_size: 48,
        page: 1,
        media_type: 'movie',
        genre: 'action',
        sort_by: 'popularity',
        sort_dir: 'desc',
      },
    })
    expect(page.items).toHaveLength(2)
    expect(page.items[0].title).toBe('Dune')
    expect(page.total).toBe(2)
    expect(page.hasMore).toBe(true)
    expect(query.getNextPageParam(page, [page], 1, [1])).toBe(2)
  })

  it('treats a missing next page as exhausted when the page is complete', async () => {
    getMock.mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: '1', title: 'Dune', mediaType: 'movie' }],
      },
    })

    const query = mediaQueries.infiniteList({ genre: 'action' })
    const page = await query.queryFn({ pageParam: 1, queryKey: query.queryKey, direction: 'forward', meta: undefined, signal: new AbortController().signal })

    expect(page.hasMore).toBe(false)
    expect(query.getNextPageParam(page, [page], 1, [1])).toBeUndefined()
  })

  it('keeps paging when next is missing but a full page and count remain', async () => {
    getMock.mockResolvedValue({
      data: {
        count: 100,
        next: null,
        previous: null,
        results: Array.from({ length: 48 }, (_, i) => ({
          id: String(i + 1),
          title: `Title ${i + 1}`,
          mediaType: 'movie',
        })),
      },
    })

    const query = mediaQueries.infiniteList({ genre: 'action', limit: 48 })
    const page = await query.queryFn({ pageParam: 1, queryKey: query.queryKey, direction: 'forward', meta: undefined, signal: new AbortController().signal })

    expect(page.hasMore).toBe(false)
    expect(query.getNextPageParam(page, [page], 1, [1])).toBe(2)
  })
})
