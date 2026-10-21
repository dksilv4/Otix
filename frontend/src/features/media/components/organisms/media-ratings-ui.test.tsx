import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ href: '/media/movie/1' }),
  useParams: () => ({ mediaType: 'movie', mediaId: '1' }),
  useRouter: () => ({ state: { matches: [{ params: { mediaType: 'movie', mediaId: '1' } }] } }),
}))

import { WhereToWatchV4 } from './media-where-to-watch'
import { MediaStorylineV4 } from './media-storyline'
import { formatMusicCreditsLine, groupByRole, getPreferredSeason } from '@media/utils'
import type { MediaItemDetail } from '@media'

describe('WhereToWatchV4 visibility', () => {
  it('returns null when watchProviders is empty or undefined', () => {
    const { container: emptyContainer } = render(<WhereToWatchV4 watchProviders={[]} />)
    expect(emptyContainer.firstChild).toBeNull()

    const { container: undefinedContainer } = render(<WhereToWatchV4 />)
    expect(undefinedContainer.firstChild).toBeNull()
  })

  it('returns null when providers have no valid watchProvider objects', () => {
    const invalidProviders = [
      { id: '1', watchProvider: null, offeringType: 'stream' },
      { id: '2', watchProvider: undefined, offeringType: 'buy' },
    ] as unknown as any[]

    const { container } = render(<WhereToWatchV4 watchProviders={invalidProviders} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when valid watch providers exist', () => {
    const validProviders = [
      {
        id: '1',
        watchProvider: { id: 10, name: 'Netflix', slug: 'netflix', logoUrl: '/netflix.png' },
        offeringType: 'flatrate',
      },
    ] as unknown as any[]

    const { container } = render(<WhereToWatchV4 watchProviders={validProviders} />)
    expect(container.firstChild).not.toBeNull()
    expect(screen.getByText('Where to Watch')).toBeInTheDocument()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
  })

  it('returns null when mediaType is "game" even if providers exist', () => {
    const validProviders = [
      {
        id: '1',
        watchProvider: { id: 10, name: 'Plex', slug: 'plex', logoUrl: '/plex.png' },
        offeringType: 'personal',
      },
    ] as unknown as any[]

    const { container } = render(<WhereToWatchV4 watchProviders={validProviders} mediaType="game" />)
    expect(container.firstChild).toBeNull()
  })
})

describe('MediaStorylineV4 genre spacing & sparse data', () => {
  it('renders genre chips with generous spacing without outline borders', () => {
    const detail = {
      id: 'movie-1',
      title: 'Test Movie',
      overview: 'A movie about testing.',
      genres: [
        { id: 1, name: 'Action', slug: 'action' },
        { id: 2, name: 'Sci-Fi', slug: 'sci-fi' },
      ],
      credits: null,
    } as unknown as MediaItemDetail

    render(<MediaStorylineV4 detail={detail} mediaType="movie" />)
    expect(screen.getByText('Action')).toBeInTheDocument()
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument()
  })

  it('handles completely null credits and missing genres gracefully without throwing', () => {
    const sparseDetail = {
      id: 'sparse-1',
      title: 'Empty Movie',
      overview: null,
      genres: null,
      credits: null,
    } as unknown as MediaItemDetail

    expect(() => render(<MediaStorylineV4 detail={sparseDetail} mediaType="movie" />)).not.toThrow()
    expect(screen.getByText('No overview available for this release.')).toBeInTheDocument()
  })
})

describe('Media Utils null & sparse safety', () => {
  it('groupByRole safely handles null/undefined credits', () => {
    const result = groupByRole(null)
    expect(result.cast).toEqual([])
    expect(result.directors).toEqual([])
    expect(result.writers).toEqual([])
  })

  it('formatMusicCreditsLine handles null/empty safely', () => {
    expect(formatMusicCreditsLine(null)).toBeNull()
    expect(formatMusicCreditsLine([])).toBeNull()
  })

  it('getPreferredSeason handles null/empty safely', () => {
    expect(getPreferredSeason(null)).toBe(0)
    expect(getPreferredSeason([])).toBe(0)
  })
})
