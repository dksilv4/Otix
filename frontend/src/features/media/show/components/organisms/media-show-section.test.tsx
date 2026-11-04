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

const mockGetEpisodeDownload = vi.fn().mockReturnValue(null)
vi.mock('@/features/media/hooks/use-media-download-activity', () => ({
  useMediaDownloadActivity: () => ({
    getEpisodeDownload: mockGetEpisodeDownload,
    isDownloading: false,
    overallProgress: 0,
    speed: null,
    eta: null,
  }),
}))

describe('ShowSection', () => {
  it('does not display seasons that have no episodes', () => {
    mockGetEpisodeDownload.mockReturnValue(null)
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
    mockGetEpisodeDownload.mockReturnValue(null)
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
  })

  it('renders watched episode state with opaque styling and allows toggling', () => {
    mockGetEpisodeDownload.mockReturnValue(null)
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-1' },
    })

    mockEpisodeInteractions.mockReturnValue({
      data: {
        episodes: {
          ep1: { watched: true },
        },
      },
    })

    mockUseQuery.mockReturnValue({
      data: {
        show: {
          seasons: [
            {
              id: 's1',
              seasonNumber: 1,
              name: 'Season 1',
              episodeCount: 1,
              episodes: [
                { id: 'ep1', episodeNumber: 1, name: 'Pilot', airDate: '2020-01-01', runtime: 45 },
              ],
            },
          ],
        },
      },
      isLoading: false,
    })

    render(<ShowSection />)

    const toggleBtn = screen.getByRole('button', { name: 'Mark episode as unwatched' })
    expect(toggleBtn).toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(mockToggleEpisodeWatched).toHaveBeenCalledWith({
      episodeId: 'ep1',
      active: false,
    })
  })

  it('renders real-time download feedback on downloading episode card', () => {
    mockGetEpisodeDownload.mockImplementation((seasonNum, epNum) => {
      if (seasonNum === 1 && epNum === 1) {
        return {
          queueId: 101,
          percentage: 42,
          speed: '14.2 MB/s',
          timeleft: '00:03:15',
          status: 'Downloading',
          cancel: vi.fn(),
          isCancelling: false,
        }
      }
      return null
    })

    mockUseQuery.mockReturnValue({
      data: {
        show: {
          seasons: [
            {
              id: 's1',
              seasonNumber: 1,
              name: 'Season 1',
              episodeCount: 1,
              episodes: [
                { id: 'ep1', episodeNumber: 1, name: 'Pilot', airDate: '2020-01-01', runtime: 45 },
              ],
            },
          ],
        },
      },
      isLoading: false,
    })

    render(<ShowSection />)

    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('Downloading')).toBeInTheDocument()
    expect(screen.getByText(/14.2 MB\/s/)).toBeInTheDocument()
    expect(screen.getByText('00:03:15')).toBeInTheDocument()
  })
})
