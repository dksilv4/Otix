import { describe, expect, it } from 'vitest'
import {
  shouldPersistQuery,
  shouldToastQueryError,
  serializeQueryData,
  queryClient,
  restoreSyncFromLocalStorage,
} from './client'

const success = { status: 'success' as const }

describe('shouldPersistQuery', () => {
  it('does not persist an empty discover hero so a later seed is not stuck behind the empty cache', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['discover', 'hero'],
        state: { status: success.status, data: { pages: [{ items: [] }], pageParams: [''] } },
      }),
    ).toBe(false)
  })

  it('persists a populated discover hero', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['discover', 'hero'],
        state: {
          status: success.status,
          data: { pages: [{ items: [{ id: 1, title: 'Disclosure Day' }] }], pageParams: [''] },
        },
      }),
    ).toBe(true)
  })

  it('persists infinite query rails with media items', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['discover', 'list', 'movie', 'trending', '__all', '__all', '__all', '__all'],
        state: {
          status: success.status,
          data: {
            pages: [
              {
                items: [
                  { id: 101, title: 'Movie 1', overview: 'A great movie' },
                  { id: 102, title: 'Movie 2', overview: 'Another movie' },
                ],
                nextCursor: 'cursor_2',
              },
            ],
            pageParams: [''],
          },
        },
      }),
    ).toBe(true)
  })

  it('does not persist an empty library list', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['library', 'watchlist'],
        state: { status: success.status, data: { items: [], nextCursor: null, hasMore: false } },
      }),
    ).toBe(false)
  })

  it('persists a non-list payload such as a user profile', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['user', 'me'],
        state: { status: success.status, data: { username: 'diogo', id: 1 } },
      }),
    ).toBe(true)
  })

  it('filters out ephemeral queue or pending queries', () => {
    expect(
      shouldPersistQuery({
        queryKey: ['downloads', 'queue'],
        state: { status: success.status, data: [{ id: 'dl-1' }] },
      }),
    ).toBe(false)
  })
})

describe('serializeQueryData', () => {
  it('trims infinite queries with more than 2 pages to first 2 pages for storage efficiency', () => {
    const data = {
      pages: [
        { items: [1, 2] },
        { items: [3, 4] },
        { items: [5, 6] },
        { items: [7, 8] },
      ],
      pageParams: ['', 'c1', 'c2', 'c3'],
    }
    const serialized = serializeQueryData(data) as typeof data
    expect(serialized.pages).toHaveLength(2)
    expect(serialized.pageParams).toHaveLength(2)
    expect(serialized.pages[0]).toEqual({ items: [1, 2] })
    expect(serialized.pages[1]).toEqual({ items: [3, 4] })
  })

  it('leaves standard objects and small infinite queries untouched', () => {
    const normal = { id: 1, title: 'Test' }
    expect(serializeQueryData(normal)).toBe(normal)

    const smallInfinite = {
      pages: [{ items: [1] }],
      pageParams: [''],
    }
    expect(serializeQueryData(smallInfinite)).toEqual(smallInfinite)
  })
})

describe('queryClient configuration', () => {
  it('has placeholderData keepPreviousData and refetchOnMount enabled for seamless background updates', () => {
    const defaultQueries = queryClient.getDefaultOptions().queries
    expect(defaultQueries?.placeholderData).toBeDefined()
    expect(defaultQueries?.refetchOnMount).toBe(true)
    expect(defaultQueries?.staleTime).toBeGreaterThanOrEqual(1000 * 60)
  })
})

describe('shouldToastQueryError', () => {
  it('does not toast a background refetch 502 when cached data is still on screen', () => {
    const error = { message: 'Request failed with status code 502', name: 'AxiosError' }
    expect(
      shouldToastQueryError(error, {
        state: { data: { records: [] } },
      }),
    ).toBe(false)
  })

  it('still toasts a first-load failure with no cached data', () => {
    const error = { message: 'Request failed with status code 502', name: 'AxiosError' }
    expect(
      shouldToastQueryError(error, {
        state: { data: undefined },
      }),
    ).toBe(true)
  })
})

describe('restoreSyncFromLocalStorage', () => {
  it('safely handles missing or invalid localStorage data', () => {
    expect(() => restoreSyncFromLocalStorage()).not.toThrow()
  })
})
