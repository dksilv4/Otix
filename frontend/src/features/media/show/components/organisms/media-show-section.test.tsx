import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShowSection } from './media-show-section'

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useQuery: (...args: any[]) => mockUseQuery(...args),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
}))

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
  }),
}))

vi.mock('@media', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useMediaParams: () => ({ mediaType: 'show', mediaId: 'show-1' }),
  }
})

vi.mock('@/features/interaction/episode-interaction-queries', () => ({
  useEpisodeInteractions: () => ({ data: { episodes: {} } }),
  useToggleEpisodeWatched: () => ({ mutate: vi.fn() }),
  useMarkSeasonWatched: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({ openModal: vi.fn() }),
}))

describe('ShowSection', () => {
  it('does not display seasons that have no episodes', () => {
    mockUseQuery.mockReturnValue({
      data: {
        show: {
          seasons: [
            {
              id: 's0',
              seasonNumber: 0,
              name: 'Specials',
              episodeCount: 0,
              episodes: [],
            },
            {
              id: 's1',
              seasonNumber: 1,
              name: 'Season 1',
              episodeCount: 2,
              episodes: [
                { id: 'ep1', episodeNumber: 1, name: 'Pilot', airDate: '2020-01-01', runtime: 45 },
                { id: 'ep2', episodeNumber: 2, name: 'Episode 2', airDate: '2020-01-08', runtime: 45 },
              ],
            },
            {
              id: 's2',
              seasonNumber: 2,
              name: 'Season 2',
              episodeCount: 0,
              episodes: [],
            },
            {
              id: 's3',
              seasonNumber: 3,
              name: 'Season 3',
              episodeCount: 0,
              episodes: [],
            },
          ],
        },
      },
      isLoading: false,
    })

    render(<ShowSection />)

    // Season 1 has episodes, so it should be displayed
    expect(screen.getByRole('button', { name: 'Season 1' })).toBeInTheDocument()

    // Specials, Season 2, and Season 3 have 0 episodes, so they should NOT be displayed
    expect(screen.queryByRole('button', { name: 'Specials' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Season 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Season 3' })).not.toBeInTheDocument()
  })

  it('displays empty state when all seasons have no episodes', () => {
    mockUseQuery.mockReturnValue({
      data: {
        show: {
          seasons: [
            {
              id: 's1',
              seasonNumber: 1,
              name: 'Season 1',
              episodeCount: 0,
              episodes: [],
            },
          ],
        },
      },
      isLoading: false,
    })

    render(<ShowSection />)

    expect(screen.getByText('No season information available.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Season 1' })).not.toBeInTheDocument()
  })
})
