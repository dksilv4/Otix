import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

const mockUseAuth = vi.fn().mockReturnValue({
  isAuthenticated: false,
  user: null,
})

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@media', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useMediaParams: () => ({ mediaType: 'show', mediaId: 'show-1' }),
  }
})

const mockToggleEpisodeWatched = vi.fn()
const mockEpisodeInteractions = vi.fn().mockReturnValue({ data: { episodes: {} } })

vi.mock('@/features/interaction/episode-interaction-queries', () => ({
  useEpisodeInteractions: (...args: any[]) => mockEpisodeInteractions(...args),
  useToggleEpisodeWatched: () => ({ mutate: mockToggleEpisodeWatched }),
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

  it('renders watched episode state with opaque styling and allows toggling', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u1' },
    })

    mockUseQuery.mockReturnValue({
      data: {
        id: 'show-1',
        title: 'Sample Show',
        show: {
          seasons: [
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
          ],
        },
      },
      isLoading: false,
    })

    mockEpisodeInteractions.mockReturnValue({
      data: {
        episodes: {
          ep1: { episodeId: 'ep1', watched: true },
          ep2: { episodeId: 'ep2', watched: false },
        },
      },
    })

    render(<ShowSection />)

    // Watched episode 1 toggle button should have opaque emerald styling and proper label
    const watchedBtn = screen.getByRole('button', { name: 'Mark episode as unwatched' })
    expect(watchedBtn).toBeInTheDocument()
    expect(watchedBtn).toHaveClass('bg-emerald-500')
    expect(watchedBtn).toHaveClass('text-white')
    expect(watchedBtn).not.toHaveClass('glass-badge')
    expect(watchedBtn).not.toHaveClass('bg-emerald-500/10')

    // Unwatched episode 2 toggle button should have unwatched label and muted styling
    const unwatchedBtn = screen.getByRole('button', { name: 'Mark episode as watched' })
    expect(unwatchedBtn).toBeInTheDocument()
    expect(unwatchedBtn).toHaveClass('text-muted-foreground')
    expect(unwatchedBtn).not.toHaveClass('bg-emerald-500')

    // Clicking watched button triggers toggle to unwatched (false)
    watchedBtn.click()
    expect(mockToggleEpisodeWatched).toHaveBeenCalledWith({
      episodeId: 'ep1',
      active: false,
    })

    // Clicking unwatched button triggers toggle to watched (true)
    unwatchedBtn.click()
    expect(mockToggleEpisodeWatched).toHaveBeenCalledWith({
      episodeId: 'ep2',
      active: true,
    })

    // Keyboard navigation (Enter / Space) triggers toggle
    fireEvent.keyDown(watchedBtn, { key: 'Enter' })
    expect(mockToggleEpisodeWatched).toHaveBeenCalledWith({
      episodeId: 'ep1',
      active: false,
    })
  })
})

