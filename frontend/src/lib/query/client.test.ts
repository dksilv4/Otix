import { describe, expect, it } from 'vitest'
import { shouldPersistQuery, shouldToastQueryError } from './client'

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
