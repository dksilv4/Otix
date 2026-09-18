import { describe, expect, it } from 'vitest'
import { discoverStaleTime } from './discover-queries'

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
