import { describe, expect, it, vi } from 'vitest'
import { discoverQueries, discoverStaleTime } from './discover-queries'
import { getRailTitle } from '../pages/discover-rail-page'
import { apiClient } from '@/lib/api/client'

const TWO_HOURS = 1000 * 60 * 60 * 2

describe('discoverStaleTime', () => {
  it('is immediately stale when the infinite feed has no items', () => {
    expect(
      discoverStaleTime({
        state: { status: 'success', data: { pages: [{ items: [] }], pageParams: [''] } },
      }),
    ).toBe(0)
  })

  it('keeps a long stale window once the feed has titles', () => {
    expect(
      discoverStaleTime({
        state: { status: 'success', data: { pages: [{ items: [{ id: '1' }] }], pageParams: [''] } },
      }),
    ).toBe(TWO_HOURS)
  })

  it('is immediately stale when a sections list is empty', () => {
    expect(discoverStaleTime({ state: { status: 'success', data: [] } })).toBe(0)
  })
})

describe('discoverQueries pagination', () => {
  it('passes both page and cursor in params when pageParam is supplied', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { items: [], nextCursor: '3', hasMore: true, total: 100 },
    } as any)

    const query = discoverQueries.list('movie', 'popular', 'action', 'en', false, 'windows')
    await (query as any).queryFn({ pageParam: '2' })

    expect(getSpy).toHaveBeenCalledWith(
      '/discover/movie/popular',
      expect.objectContaining({
        params: {
          limit: '20',
          page: '2',
          cursor: '2',
          genre: 'action',
          language: 'en',
          is_anime: false,
          platform: 'windows',
        },
      }),
    )
    getSpy.mockRestore()
  })
})

describe('getRailTitle', () => {
  it('resolves standard and platform discover titles', () => {
    expect(getRailTitle('movie', 'trending')).toBe('Trending Movies')
    expect(getRailTitle('show', 'popular')).toBe('Popular Shows')
    expect(getRailTitle('season', 'trending')).toBe('New Seasons')
    expect(getRailTitle('game', 'top_rated', 'windows')).toBe('Best on PC')
    expect(getRailTitle('game', 'top_rated', 'playstation-5')).toBe('Best on PlayStation 5')
    expect(getRailTitle('movie', 'custom_list')).toBe('Custom List Movies')
  })
})

