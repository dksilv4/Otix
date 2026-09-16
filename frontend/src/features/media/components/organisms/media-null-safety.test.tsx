import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { WhereToWatchV4 } from './media-where-to-watch'
import { CastCrewV4 } from './media-cast-crew'
import type { MediaWatchProvider } from '@media/queries/media-queries'

describe('null/empty backend data', () => {
  it('WhereToWatchV4 renders nothing when the nested watchProvider is missing', () => {
    const provider = {
      id: 'wp-1',
      watchProvider: null,
      countryCode: 'US',
      offeringType: 'flatrate',
      url: null,
      displayPriority: 1,
    } as unknown as MediaWatchProvider

    const { container } = render(<WhereToWatchV4 watchProviders={[provider]} />)
    expect(container.firstChild).toBeNull()
  })

  it('CastCrewV4 renders without throwing when every credit has a null person', () => {
    const credits = [
      { id: '1', person: null, role: 'writer', sortOrder: 1 },
      { id: '2', person: null, role: 'composer', sortOrder: 2 },
    ]

    expect(() => render(<CastCrewV4 credits={credits} />)).not.toThrow()
  })
})
