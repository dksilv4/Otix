import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameSection } from '../media-game-section'

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useQuery: (...args: any[]) => mockUseQuery(...args),
  }
})

vi.mock('@media', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useMediaParams: () => ({ mediaType: 'game', mediaId: 'game-1' }),
    mediaQueries: {
      detail: () => ({ queryKey: ['media', 'detail', 'game', 'game-1'] }),
    },
    formatNumber: (n: number) => n.toLocaleString(),
    formatPlaytime: (m: number) => `${m} mins`,
    formatMinutesToHours: (m: number) => `${m / 60} hrs`,
    formatDaysAgo: () => '2 days ago',
  }
})

vi.mock('@/features/gameservers', () => ({
  MediaGameServersSection: () => <div data-testid="game-servers-section" />,
}))

describe('GameSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders null when data or game is missing', () => {
    mockUseQuery.mockReturnValue({ data: null })
    const { container } = render(<GameSection />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when game has no playtime, stats, time to beat, or website', () => {
    mockUseQuery.mockReturnValue({
      data: {
        id: 'game-1',
        title: 'Empty Game',
        mediaType: 'game',
        game: {},
      },
    })
    const { container } = render(<GameSection />)
    expect(container.firstChild).toBeNull()
  })

  it('renders steam stats and playtime without platforms or game modes', () => {
    mockUseQuery.mockReturnValue({
      data: {
        id: 'game-1',
        title: 'Portal 2',
        mediaType: 'game',
        steamPlaytimeForever: 600,
        game: {
          currentPlayers: 1500,
          recommendations: 50000,
          reviewSummary: 'Overwhelmingly Positive',
          website: 'https://thinkwithportals.com',
        },
        platforms: [
          { id: 'plat-1', platform: { id: 'p1', name: 'PC', slug: 'windows' } },
        ],
        gameModes: [
          { id: 'mode-1', gameMode: { id: 'm1', name: 'Co-op', slug: 'co-op' } },
        ],
      },
    })

    render(<GameSection />)

    // Steam playtime & stats should render
    expect(screen.getByText('Your Steam Playtime')).toBeInTheDocument()
    expect(screen.getByText('Steam Stats')).toBeInTheDocument()
    expect(screen.getByText('Current Players')).toBeInTheDocument()
    expect(screen.getByText('Overwhelmingly Positive')).toBeInTheDocument()

    // Platforms and Game Modes should NOT render here (moved to their own section)
    expect(screen.queryByRole('heading', { name: /^platforms$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^game modes$/i })).not.toBeInTheDocument()
  })
})
