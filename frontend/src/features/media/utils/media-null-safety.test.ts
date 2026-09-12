import { describe, expect, it } from 'vitest'
import { formatMusicCreditsLine, groupByRole } from './index'
import type { MediaItemDetail } from '../queries/media-queries'

// The optimistic TS types model a credit `person` as always present, but the
// backend serializer is allow-null on it. These fixtures simulate the real
// sparse payloads that reach the runtime guards.
type Credit = NonNullable<MediaItemDetail['credits']>[number]

const sparse = (
  rows: Array<{ person: Credit['person'] | null; [key: string]: unknown }>,
): Credit[] => rows as unknown as Credit[]

describe('formatMusicCreditsLine', () => {
  it('returns null when credits are missing entirely', () => {
    expect(formatMusicCreditsLine(undefined)).toBeNull()
    expect(formatMusicCreditsLine(null)).toBeNull()
  })

  it('returns null for an empty credits list', () => {
    expect(formatMusicCreditsLine([])).toBeNull()
  })

  it('ignores credits whose person is null instead of crashing', () => {
    const credits = sparse([
      { id: 'a', role: 'primary', sortOrder: 0, person: null },
      { id: 'b', role: 'featured', sortOrder: 1, person: null },
    ])
    expect(formatMusicCreditsLine(credits)).toBeNull()
  })

  it('keeps valid primary names when a sibling credit has no person', () => {
    const credits = sparse([
      { id: 'a', role: 'primary', sortOrder: 0, person: null },
      { id: 'b', role: 'primary', sortOrder: 1, person: { id: 'p2', name: 'Bo Writer' } },
    ])
    expect(formatMusicCreditsLine(credits)).toBe('Bo Writer')
  })

  it('joins primary names', () => {
    const credits = sparse([
      { id: 'a', role: 'primary', sortOrder: 0, person: { id: 'p1', name: 'Ann Artist' } },
      { id: 'b', role: 'primary', sortOrder: 1, person: { id: 'p2', name: 'Bo Writer' } },
    ])
    expect(formatMusicCreditsLine(credits)).toBe('Ann Artist, Bo Writer')
  })

  it('renders a featured tail', () => {
    const credits = sparse([
      { id: 'b', role: 'featured', sortOrder: 1, person: { id: 'p2', name: 'Bo Guest' } },
    ])
    expect(formatMusicCreditsLine(credits)).toBe('feat. Bo Guest')
  })
})

describe('groupByRole', () => {
  it('excludes credits with a null person from every role bucket', () => {
    const credits = sparse([
      { id: 'a', person: null, role: 'writer', sortOrder: 1 },
      { id: 'b', person: null, role: 'composer', sortOrder: 2 },
      { id: 'c', person: null, role: 'cast', sortOrder: 3 },
      { id: 'd', person: { id: 'p3', name: 'Real Writer' }, role: 'writer', sortOrder: 4 },
      { id: 'e', person: { id: 'p4', name: 'Real Cast' }, role: 'cast', sortOrder: 5 },
    ])
    const { cast, writers, composers, producers, crew } = groupByRole(credits)
    expect(cast.map((c) => c.person?.name)).toEqual(['Real Cast'])
    expect(writers.map((c) => c.person?.name)).toEqual(['Real Writer'])
    expect(composers).toHaveLength(0)
    expect(producers).toHaveLength(0)
    expect(crew).toHaveLength(0)
  })
})
