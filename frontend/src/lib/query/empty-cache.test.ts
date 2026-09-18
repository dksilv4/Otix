import { describe, expect, it } from 'vitest'
import { isEmptyQueryData, retainUnlessEmpty } from './empty-cache'

describe('isEmptyQueryData', () => {
  it('does not treat missing in-flight data as an empty response', () => {
    expect(isEmptyQueryData(undefined)).toBe(false)
    expect(isEmptyQueryData(null)).toBe(false)
  })

  it('treats empty lists as empty', () => {
    expect(isEmptyQueryData([])).toBe(true)
    expect(isEmptyQueryData({ items: [] })).toBe(true)
  })
})

describe('retainUnlessEmpty', () => {
  const retain = retainUnlessEmpty(1000)

  it('keeps the normal gcTime while a query is still loading', () => {
    expect(retain({ state: { status: 'pending', data: undefined } })).toBe(1000)
  })

  it('drops a successful empty list immediately', () => {
    expect(retain({ state: { status: 'success', data: { items: [] } } })).toBe(0)
  })
})
